import { createHash, randomBytes, randomUUID } from "node:crypto";
import { minimatch } from "minimatch";
import type {
  AgentAuth,
  AgentRecord,
  BarrierRecord,
  MessageType,
  ProposalRecord,
  ReservationRecord,
  SwarmState,
  TaskRecord,
} from "./model.js";
import { JsonStore } from "./store.js";

const now = () => Date.now();
const id = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function staticPrefix(pattern: string): string {
  const index = pattern.search(/[?*{[!]/);
  return (index === -1 ? pattern : pattern.slice(0, index)).replace(/\\/g, "/");
}

function patternsMayOverlap(a: string, b: string): boolean {
  const aa = a.replace(/\\/g, "/");
  const bb = b.replace(/\\/g, "/");
  if (aa === bb || minimatch(aa, bb) || minimatch(bb, aa)) return true;
  const ap = staticPrefix(aa);
  const bp = staticPrefix(bb);
  return Boolean(ap && bp && (ap.startsWith(bp) || bp.startsWith(ap)));
}

export class Coordinator {
  constructor(
    private readonly store: JsonStore,
    private readonly defaultReservationTtlMs = 30 * 60_000,
    private readonly agentStaleMs = 5 * 60_000,
  ) {}

  private purge(swarm: SwarmState): void {
    const t = now();
    swarm.reservations = swarm.reservations.filter((r) => r.expiresAt > t);
  }

  private authenticate(swarm: SwarmState, auth: AgentAuth): AgentRecord {
    const agent = swarm.agents.find((a) => a.id === auth.agentId);
    if (!agent || agent.authHash !== hash(auth.agentToken)) throw new Error("Invalid swarm agent credentials");
    agent.lastSeenAt = now();
    return agent;
  }

  private getSwarm(state: any, swarmId: string): SwarmState {
    const swarm = state.swarms[swarmId] as SwarmState | undefined;
    if (!swarm) throw new Error(`Unknown swarm: ${swarmId}`);
    this.purge(swarm);
    return swarm;
  }

  async join(input: { swarmId: string; displayName?: string; goal?: string; repo?: string; expectedAgents?: number; joinKey?: string }) {
    return this.store.transaction((state) => {
      let swarm = state.swarms[input.swarmId];
      if (!swarm) {
        swarm = state.swarms[input.swarmId] = {
          id: input.swarmId,
          goal: input.goal ?? "",
          repo: input.repo,
          expectedAgents: input.expectedAgents,
          createdAt: now(),
          updatedAt: now(),
          agents: [], tasks: [], messages: [], reservations: [], proposals: [], barriers: [], memory: [],
        };
      } else {
        if (input.goal && !swarm.goal) swarm.goal = input.goal;
        if (input.repo && !swarm.repo) swarm.repo = input.repo;
        if (input.expectedAgents && !swarm.expectedAgents) swarm.expectedAgents = input.expectedAgents;
      }

      const joinKeyHash = input.joinKey?.trim() ? hash(input.joinKey.trim()) : undefined;
      if (joinKeyHash) {
        const existing = swarm.agents.find((agent) => agent.joinKeyHash === joinKeyHash);
        if (existing) {
          const token = randomBytes(24).toString("base64url");
          existing.authHash = hash(token);
          existing.lastSeenAt = now();
          if (input.displayName?.trim()) existing.displayName = input.displayName.trim();
          swarm.updatedAt = now();
          return {
            swarmId: swarm.id,
            agentId: existing.id,
            agentToken: token,
            displayName: existing.displayName,
            goal: swarm.goal,
            repo: swarm.repo,
            expectedAgents: swarm.expectedAgents,
            resumed: true,
            instructions: [
              "This join resumed an existing logical agent because the same join_key was reused.",
              "Keep agentId/agentToken private to this chat and include them in later AntroSwarm tool calls.",
              "Call swarm_sync regularly, especially before claiming work and before finishing a turn.",
            ],
          };
        }
      }

      if (swarm.expectedAgents && swarm.agents.length >= swarm.expectedAgents) {
        throw new Error(`Swarm ${swarm.id} is full (${swarm.agents.length}/${swarm.expectedAgents}). Reuse the same join_key to resume an existing agent or increase expected_agents before launch.`);
      }

      const token = randomBytes(24).toString("base64url");
      const agent: AgentRecord = {
        id: id("agent"),
        displayName: input.displayName?.trim() || `agent-${swarm.agents.length + 1}`,
        authHash: hash(token),
        joinKeyHash,
        joinedAt: now(),
        lastSeenAt: now(),
      };
      swarm.agents.push(agent);
      swarm.updatedAt = now();
      return {
        swarmId: swarm.id,
        agentId: agent.id,
        agentToken: token,
        displayName: agent.displayName,
        goal: swarm.goal,
        repo: swarm.repo,
        expectedAgents: swarm.expectedAgents,
        resumed: false,
        warnings: joinKeyHash ? [] : ["No join_key supplied. A retried swarm_join may create a duplicate logical agent."],
        instructions: [
          "Keep agentId/agentToken private to this chat and include them in later AntroSwarm tool calls.",
          "For reconnect-safe joins, generate one random join_key per chat and reuse it on every swarm_join retry.",
          "Call swarm_sync regularly, especially before claiming work and before finishing a turn.",
          "Claim a task before implementation. Reserve overlapping paths before writes.",
          "Use messages/proposals for dependencies and architectural conflicts instead of silently editing shared code.",
          "Work in your own runner worktree when a local runner is available.",
        ],
      };
    });
  }

  async sync(auth: AgentAuth) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      const agent = this.authenticate(swarm, auth);
      const t = now();
      const activeAgents = swarm.agents.filter((a) => t - a.lastSeenAt <= this.agentStaleMs);
      const readyTasks = swarm.tasks.filter((task) => task.status === "open" && task.dependencies.every((d) => swarm.tasks.find((x) => x.id === d)?.status === "done"));
      const inbox = swarm.messages.filter((m) => (m.to.length === 0 || m.to.includes(agent.id)) && !m.readBy.includes(agent.id));
      return {
        swarm: { id: swarm.id, goal: swarm.goal, repo: swarm.repo, expectedAgents: swarm.expectedAgents, totalAgents: swarm.agents.length, activeAgents: activeAgents.length },
        me: { id: agent.id, name: agent.displayName, currentTaskId: agent.currentTaskId, branch: agent.branch, worktreePath: agent.worktreePath },
        agents: activeAgents.map((a) => ({ id: a.id, name: a.displayName, currentTaskId: a.currentTaskId, ageMs: t - a.lastSeenAt })),
        readyTasks: readyTasks.map((x) => ({ id: x.id, title: x.title, dependencies: x.dependencies, suggestedScopes: x.suggestedScopes })),
        inbox: inbox.slice(-20),
        reservations: swarm.reservations,
        proposals: swarm.proposals.filter((p) => p.status === "open"),
        barriers: swarm.barriers,
      };
    });
  }

  async heartbeat(auth: AgentAuth) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      const agent = this.authenticate(swarm, auth);
      return { ok: true, agentId: agent.id, at: agent.lastSeenAt };
    });
  }

  async createTask(auth: AgentAuth, input: { title: string; description?: string; dependencies?: string[]; suggestedScopes?: string[] }) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      const agent = this.authenticate(swarm, auth);
      for (const dependency of input.dependencies ?? []) {
        if (!swarm.tasks.some((t) => t.id === dependency)) throw new Error(`Unknown dependency task: ${dependency}`);
      }
      const task: TaskRecord = {
        id: id("task"), title: input.title, description: input.description ?? "", createdBy: agent.id,
        createdAt: now(), updatedAt: now(), status: "open", dependencies: input.dependencies ?? [], suggestedScopes: input.suggestedScopes ?? [],
      };
      swarm.tasks.push(task);
      return task;
    });
  }

  async listTasks(auth: AgentAuth) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      this.authenticate(swarm, auth);
      return swarm.tasks.map((task) => ({
        ...task,
        ready: task.status === "open" && task.dependencies.every((d) => swarm.tasks.find((x) => x.id === d)?.status === "done"),
      }));
    });
  }

  async claimTask(auth: AgentAuth, taskId: string) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      const agent = this.authenticate(swarm, auth);
      const task = swarm.tasks.find((t) => t.id === taskId);
      if (!task) throw new Error(`Unknown task: ${taskId}`);
      if (task.status !== "open") throw new Error(`Task ${taskId} is not open`);
      const incomplete = task.dependencies.filter((d) => swarm.tasks.find((x) => x.id === d)?.status !== "done");
      if (incomplete.length) throw new Error(`Task is blocked by: ${incomplete.join(", ")}`);
      if (agent.currentTaskId && agent.currentTaskId !== taskId) throw new Error(`Agent already owns active task ${agent.currentTaskId}`);
      task.status = "in_progress";
      task.claimedBy = agent.id;
      task.updatedAt = now();
      agent.currentTaskId = task.id;
      return task;
    });
  }

  async completeTask(auth: AgentAuth, taskId: string, result?: string) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      const agent = this.authenticate(swarm, auth);
      const task = swarm.tasks.find((t) => t.id === taskId);
      if (!task) throw new Error(`Unknown task: ${taskId}`);
      if (task.claimedBy !== agent.id) throw new Error("Only the task owner can complete it");
      task.status = "done";
      task.result = result;
      task.updatedAt = now();
      if (agent.currentTaskId === taskId) delete agent.currentTaskId;
      swarm.reservations = swarm.reservations.filter((r) => r.agentId !== agent.id || r.taskId !== taskId);
      return task;
    });
  }

  async sendMessage(auth: AgentAuth, input: { to?: string[]; type?: MessageType; subject: string; body: string; threadId?: string; taskId?: string }) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      const agent = this.authenticate(swarm, auth);
      const recipients = input.to ?? [];
      for (const recipient of recipients) if (!swarm.agents.some((a) => a.id === recipient)) throw new Error(`Unknown recipient: ${recipient}`);
      const message = {
        id: id("msg"), from: agent.id, to: recipients, type: input.type ?? "info", subject: input.subject,
        body: input.body, threadId: input.threadId, taskId: input.taskId, createdAt: now(), readBy: [agent.id],
      };
      swarm.messages.push(message);
      return message;
    });
  }

  async inbox(auth: AgentAuth, markRead = true) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      const agent = this.authenticate(swarm, auth);
      const messages = swarm.messages.filter((m) => (m.to.length === 0 || m.to.includes(agent.id)) && !m.readBy.includes(agent.id));
      if (markRead) for (const m of messages) m.readBy.push(agent.id);
      return messages;
    });
  }

  async reservePaths(auth: AgentAuth, input: { patterns: string[]; taskId?: string; ttlMs?: number; note?: string }) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      const agent = this.authenticate(swarm, auth);
      if (input.taskId) {
        const task = swarm.tasks.find((t) => t.id === input.taskId);
        if (!task || task.claimedBy !== agent.id || task.status !== "in_progress") throw new Error("Path reservations tied to a task require ownership of an in-progress task");
      }
      const conflicts = swarm.reservations.filter((r) => r.agentId !== agent.id && input.patterns.some((p) => r.patterns.some((existing) => patternsMayOverlap(p, existing))));
      if (conflicts.length) throw new Error(`Reservation conflict with ${conflicts.map((r) => `${r.agentId}:${r.patterns.join("|")}`).join(", ")}`);
      const reservation: ReservationRecord = {
        id: id("lock"), agentId: agent.id, taskId: input.taskId, patterns: input.patterns,
        createdAt: now(), expiresAt: now() + Math.min(Math.max(input.ttlMs ?? this.defaultReservationTtlMs, 10_000), 24 * 60 * 60_000), note: input.note,
      };
      swarm.reservations.push(reservation);
      return reservation;
    });
  }

  async releasePaths(auth: AgentAuth, reservationId?: string) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      const agent = this.authenticate(swarm, auth);
      const before = swarm.reservations.length;
      swarm.reservations = swarm.reservations.filter((r) => !(r.agentId === agent.id && (!reservationId || r.id === reservationId)));
      return { released: before - swarm.reservations.length };
    });
  }

  async assertWritable(auth: AgentAuth, relativePath: string): Promise<void> {
    await this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      const agent = this.authenticate(swarm, auth);
      const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
      const conflicting = swarm.reservations.find((r) => r.agentId !== agent.id && r.patterns.some((p) => minimatch(normalized, p, { dot: true })));
      if (conflicting) throw new Error(`Write blocked: ${normalized} reserved by ${conflicting.agentId} (${conflicting.patterns.join(", ")})`);
    });
  }

  async createProposal(auth: AgentAuth, title: string, body: string) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      const agent = this.authenticate(swarm, auth);
      const proposal: ProposalRecord = { id: id("proposal"), createdBy: agent.id, title, body, createdAt: now(), status: "open", votes: {} };
      swarm.proposals.push(proposal);
      return proposal;
    });
  }

  async voteProposal(auth: AgentAuth, proposalId: string, vote: "approve" | "reject" | "abstain") {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      const agent = this.authenticate(swarm, auth);
      const proposal = swarm.proposals.find((p) => p.id === proposalId);
      if (!proposal || proposal.status !== "open") throw new Error("Unknown or closed proposal");
      proposal.votes[agent.id] = vote;
      return proposal;
    });
  }

  async resolveProposal(auth: AgentAuth, proposalId: string, resolution?: string) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      this.authenticate(swarm, auth);
      const proposal = swarm.proposals.find((p) => p.id === proposalId);
      if (!proposal || proposal.status !== "open") throw new Error("Unknown or closed proposal");
      const active = swarm.agents.filter((a) => now() - a.lastSeenAt <= this.agentStaleMs).length || swarm.agents.length;
      const quorum = Math.max(1, Math.ceil(active / 2));
      const values = Object.values(proposal.votes);
      const approve = values.filter((v) => v === "approve").length;
      const reject = values.filter((v) => v === "reject").length;
      if (approve + reject < quorum) return { resolved: false, quorum, approve, reject, proposal };
      proposal.status = approve > reject ? "accepted" : "rejected";
      proposal.resolution = resolution;
      return { resolved: true, quorum, approve, reject, proposal };
    });
  }

  async barrier(auth: AgentAuth, stage: string, expected?: number) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      const agent = this.authenticate(swarm, auth);
      let barrier = swarm.barriers.find((b) => b.stage === stage);
      const target = expected ?? swarm.expectedAgents ?? swarm.agents.length;
      if (!barrier) {
        barrier = { stage, expected: Math.max(1, target), participants: [], released: false, updatedAt: now() } as BarrierRecord;
        swarm.barriers.push(barrier);
      }
      if (!barrier.participants.includes(agent.id)) barrier.participants.push(agent.id);
      barrier.expected = Math.max(barrier.expected, target);
      barrier.released = barrier.participants.length >= barrier.expected;
      barrier.updatedAt = now();
      return { stage, state: barrier.released ? "released" : "waiting", ready: barrier.participants.length, expected: barrier.expected, participants: barrier.participants };
    });
  }

  async putMemory(auth: AgentAuth, input: { key: string; content: string; tags?: string[] }) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      const agent = this.authenticate(swarm, auth);
      let item = swarm.memory.find((m) => m.key === input.key);
      if (item) {
        item.content = input.content; item.tags = input.tags ?? item.tags; item.updatedAt = now();
      } else {
        item = { id: id("mem"), key: input.key, content: input.content, tags: input.tags ?? [], createdBy: agent.id, createdAt: now(), updatedAt: now() };
        swarm.memory.push(item);
      }
      return item;
    });
  }

  async searchMemory(auth: AgentAuth, query: string) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      this.authenticate(swarm, auth);
      const q = query.toLowerCase();
      return swarm.memory.filter((m) => `${m.key}\n${m.content}\n${m.tags.join(" ")}`.toLowerCase().includes(q)).slice(-20);
    });
  }

  async setWorktree(auth: AgentAuth, branch: string, worktreePath: string) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      const agent = this.authenticate(swarm, auth);
      agent.branch = branch;
      agent.worktreePath = worktreePath;
      return { branch, worktreePath };
    });
  }

  async getAgent(auth: AgentAuth) {
    return this.store.transaction((state) => {
      const swarm = this.getSwarm(state, auth.swarmId);
      return this.authenticate(swarm, auth);
    });
  }
}
