import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type CommandDeliveryStatus = "queued" | "delivered" | "running" | "done" | "failed";

export interface CommandDelivery {
  status: CommandDeliveryStatus;
  deliveredAt?: number;
  startedAt?: number;
  finishedAt?: number;
  leaseExpiresAt?: number;
  attempts?: number;
  lastLeaseExpiredAt?: number;
  result?: string;
  error?: string;
}

export interface CommandRecord {
  id: string;
  swarmId: string;
  prompt: string;
  label?: string;
  requestId?: string;
  createdAt: number;
  targetAgentIds: string[];
  deliveries: Record<string, CommandDelivery>;
}

interface CommandDatabase {
  version: 1;
  commands: CommandRecord[];
}

const EMPTY: CommandDatabase = { version: 1, commands: [] };
const id = () => `cmd-${randomUUID().slice(0, 8)}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const finalStatus = (status: CommandDeliveryStatus) => status === "done" || status === "failed";

export class CommandQueue {
  private state: CommandDatabase | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly filename: string,
    private readonly leaseMs = 90_000,
  ) {}

  private async load(): Promise<CommandDatabase> {
    if (this.state) return this.state;
    try {
      const raw = await fs.readFile(this.filename, "utf8");
      const parsed = JSON.parse(raw) as CommandDatabase;
      this.state = parsed.version === 1 && Array.isArray(parsed.commands) ? parsed : structuredClone(EMPTY);
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
      this.state = structuredClone(EMPTY);
    }
    return this.state;
  }

  private async persist(): Promise<void> {
    if (!this.state) return;
    await fs.mkdir(path.dirname(this.filename), { recursive: true });
    const tmp = `${this.filename}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.state, null, 2), "utf8");
    await fs.rename(tmp, this.filename);
  }

  private async transaction<T>(fn: (state: CommandDatabase) => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.chain;
    this.chain = new Promise<void>((resolve) => (release = resolve));
    await previous;
    try {
      const state = await this.load();
      const result = await fn(state);
      await this.persist();
      return result;
    } finally {
      release();
    }
  }

  private expireLeases(state: CommandDatabase, at = Date.now()): number {
    let expired = 0;
    for (const command of state.commands) {
      for (const delivery of Object.values(command.deliveries)) {
        if ((delivery.status === "delivered" || delivery.status === "running") && delivery.leaseExpiresAt && delivery.leaseExpiresAt <= at) {
          delivery.status = "queued";
          delivery.lastLeaseExpiredAt = at;
          delete delivery.leaseExpiresAt;
          delete delivery.finishedAt;
          expired++;
        }
      }
    }
    return expired;
  }

  async enqueue(input: { swarmId: string; prompt: string; targetAgentIds: string[]; label?: string; requestId?: string }): Promise<CommandRecord> {
    if (!input.prompt.trim()) throw new Error("Command prompt is required");
    const targets = [...new Set(input.targetAgentIds.filter(Boolean))];
    if (!targets.length) throw new Error("At least one target agent is required");
    return this.transaction((state) => {
      if (input.requestId) {
        const existing = state.commands.find((item) => item.swarmId === input.swarmId && item.requestId === input.requestId);
        if (existing) return structuredClone(existing);
      }
      const command: CommandRecord = {
        id: id(),
        swarmId: input.swarmId,
        prompt: input.prompt.trim(),
        label: input.label?.trim() || undefined,
        requestId: input.requestId?.trim() || undefined,
        createdAt: Date.now(),
        targetAgentIds: targets,
        deliveries: Object.fromEntries(targets.map((agentId) => [agentId, { status: "queued" as const, attempts: 0 }])),
      };
      state.commands.push(command);
      if (state.commands.length > 2000) state.commands.splice(0, state.commands.length - 2000);
      return structuredClone(command);
    });
  }

  private async takeNext(swarmId: string, agentId: string): Promise<CommandRecord | null> {
    return this.transaction((state) => {
      this.expireLeases(state);
      const command = state.commands.find((item) => item.swarmId === swarmId && item.deliveries[agentId]?.status === "queued");
      if (!command) return null;
      const delivery = command.deliveries[agentId];
      const at = Date.now();
      delivery.status = "delivered";
      delivery.deliveredAt = at;
      delivery.leaseExpiresAt = at + this.leaseMs;
      delivery.attempts = (delivery.attempts ?? 0) + 1;
      return structuredClone(command);
    });
  }

  async next(swarmId: string, agentId: string, waitMs = 0): Promise<CommandRecord | null> {
    const capped = Math.min(Math.max(waitMs, 0), 25_000);
    const deadline = Date.now() + capped;
    do {
      const command = await this.takeNext(swarmId, agentId);
      if (command) return command;
      if (Date.now() >= deadline) return null;
      await sleep(Math.min(500, Math.max(1, deadline - Date.now())));
    } while (true);
  }

  async ack(swarmId: string, agentId: string, commandId: string): Promise<CommandRecord> {
    return this.transaction((state) => {
      this.expireLeases(state);
      const command = state.commands.find((item) => item.id === commandId && item.swarmId === swarmId);
      if (!command) throw new Error(`Unknown command: ${commandId}`);
      const delivery = command.deliveries[agentId];
      if (!delivery) throw new Error("Command is not targeted to this agent");
      if (finalStatus(delivery.status)) throw new Error(`Command already ${delivery.status}`);
      const at = Date.now();
      delivery.status = "running";
      delivery.deliveredAt ??= at;
      delivery.startedAt ??= at;
      delivery.leaseExpiresAt = at + this.leaseMs;
      return structuredClone(command);
    });
  }

  async renew(swarmId: string, agentId: string, commandId: string): Promise<CommandRecord> {
    return this.transaction((state) => {
      const command = state.commands.find((item) => item.id === commandId && item.swarmId === swarmId);
      if (!command) throw new Error(`Unknown command: ${commandId}`);
      const delivery = command.deliveries[agentId];
      if (!delivery) throw new Error("Command is not targeted to this agent");
      if (finalStatus(delivery.status)) throw new Error(`Command already ${delivery.status}`);
      const at = Date.now();
      delivery.status = "running";
      delivery.deliveredAt ??= at;
      delivery.startedAt ??= at;
      delivery.leaseExpiresAt = at + this.leaseMs;
      return structuredClone(command);
    });
  }

  async report(input: { swarmId: string; agentId: string; commandId: string; status: "done" | "failed"; result?: string; error?: string }): Promise<CommandRecord> {
    return this.transaction((state) => {
      const command = state.commands.find((item) => item.id === input.commandId && item.swarmId === input.swarmId);
      if (!command) throw new Error(`Unknown command: ${input.commandId}`);
      const delivery = command.deliveries[input.agentId];
      if (!delivery) throw new Error("Command is not targeted to this agent");
      const at = Date.now();
      delivery.status = input.status;
      delivery.deliveredAt ??= at;
      delivery.startedAt ??= at;
      delivery.finishedAt = at;
      delete delivery.leaseExpiresAt;
      delivery.result = input.result;
      delivery.error = input.error;
      return structuredClone(command);
    });
  }

  async list(swarmId?: string): Promise<CommandRecord[]> {
    return this.transaction((state) => {
      this.expireLeases(state);
      return structuredClone((swarmId ? state.commands.filter((item) => item.swarmId === swarmId) : state.commands).slice(-300));
    });
  }

  async historyForAgent(swarmId: string, agentId: string): Promise<CommandRecord[]> {
    const commands = await this.list(swarmId);
    return commands.filter((item) => Boolean(item.deliveries[agentId])).slice(-100);
  }

  async cancel(commandId: string): Promise<CommandRecord> {
    return this.transaction((state) => {
      const command = state.commands.find((item) => item.id === commandId);
      if (!command) throw new Error(`Unknown command: ${commandId}`);
      for (const delivery of Object.values(command.deliveries)) {
        if (!finalStatus(delivery.status)) {
          delivery.status = "failed";
          delivery.finishedAt = Date.now();
          delete delivery.leaseExpiresAt;
          delivery.error = "Cancelled by operator";
        }
      }
      return structuredClone(command);
    });
  }

  async retry(commandId: string, agentId?: string): Promise<CommandRecord> {
    return this.transaction((state) => {
      const command = state.commands.find((item) => item.id === commandId);
      if (!command) throw new Error(`Unknown command: ${commandId}`);
      const targets = agentId ? [agentId] : command.targetAgentIds;
      for (const target of targets) {
        const delivery = command.deliveries[target];
        if (!delivery) throw new Error(`Command is not targeted to agent ${target}`);
        if (delivery.status === "done") continue;
        delivery.status = "queued";
        delete delivery.leaseExpiresAt;
        delete delivery.finishedAt;
        delete delivery.error;
      }
      return structuredClone(command);
    });
  }
}
