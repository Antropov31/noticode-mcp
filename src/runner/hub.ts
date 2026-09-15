import { randomUUID } from "node:crypto";
import type { WebSocket, WebSocketServer } from "ws";

interface RunnerInfo {
  id: string;
  workspace: string;
  capabilities: string[];
  connectedAt: number;
}

interface Connection {
  ws: WebSocket;
  info: RunnerInfo;
}

export class RunnerHub {
  private runners = new Map<string, Connection>();
  private pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();

  constructor(private readonly runnerToken: string, private readonly defaultTimeoutMs: number) {}

  attach(wss: WebSocketServer): void {
    wss.on("connection", (ws) => {
      let runnerId: string | undefined;
      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "register") {
            if (!this.runnerToken || msg.token !== this.runnerToken) {
              ws.close(1008, "invalid runner token");
              return;
            }
            runnerId = String(msg.runnerId || "runner");
            const info: RunnerInfo = {
              id: runnerId,
              workspace: String(msg.workspace || ""),
              capabilities: Array.isArray(msg.capabilities) ? msg.capabilities.map(String) : [],
              connectedAt: Date.now(),
            };
            this.runners.set(runnerId, { ws, info });
            ws.send(JSON.stringify({ type: "registered", runnerId }));
            return;
          }
          if (msg.type === "result" && msg.requestId) {
            const pending = this.pending.get(msg.requestId);
            if (!pending) return;
            clearTimeout(pending.timer);
            this.pending.delete(msg.requestId);
            if (msg.ok) pending.resolve(msg.result);
            else pending.reject(new Error(msg.error || "runner command failed"));
          }
        } catch (error) {
          ws.send(JSON.stringify({ type: "error", error: String(error) }));
        }
      });
      ws.on("close", () => {
        if (runnerId) this.runners.delete(runnerId);
      });
    });
  }

  list(): RunnerInfo[] {
    return [...this.runners.values()].map((x) => x.info);
  }

  async execute(action: string, params: Record<string, unknown>, runnerId?: string, timeoutMs?: number): Promise<any> {
    const connection = runnerId ? this.runners.get(runnerId) : this.runners.values().next().value as Connection | undefined;
    if (!connection) throw new Error(runnerId ? `Runner ${runnerId} is offline` : "No local runner is connected");
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Runner command timed out after ${timeoutMs ?? this.defaultTimeoutMs}ms`));
      }, timeoutMs ?? this.defaultTimeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      connection.ws.send(JSON.stringify({ type: "command", requestId, action, params }));
    });
  }
}
