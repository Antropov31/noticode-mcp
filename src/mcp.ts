import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuth } from "./model.js";
import { Coordinator } from "./coordinator.js";
import { CommandQueue } from "./command-queue.js";
import { RunnerHub } from "./runner/hub.js";

const authShape = {
  swarm_id: z.string().min(1),
  agent_id: z.string().min(1),
  agent_token: z.string().min(1),
};

const auth = (args: any): AgentAuth => ({ swarmId: args.swarm_id, agentId: args.agent_id, agentToken: args.agent_token });
const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });

export function buildMcpServer(coordinator: Coordinator, runners: RunnerHub, commands: CommandQueue): McpServer {
  const server = new McpServer({ name: "antroswarm", version: "0.2.0" });
  const register = (name: string, description: string, schema: z.ZodObject<any>, handler: (args: any) => Promise<any>) => {
    server.registerTool(name, { description, inputSchema: schema.shape }, async (args: any) => {
      try { return text(await handler(args)); }
      catch (error: any) { return { ...text({ error: error?.message ?? String(error) }), isError: true }; }
    });
  };

  register("swarm_join", "Join or create a swarm. Each independent chat calls this once and receives its own logical agent credentials.", z.object({
    swarm_id: z.string().min(1), display_name: z.string().optional(), goal: z.string().optional(), repo: z.string().optional(), expected_agents: z.number().int().positive().max(32).optional(),
  }), async (a) => coordinator.join({ swarmId: a.swarm_id, displayName: a.display_name, goal: a.goal, repo: a.repo, expectedAgents: a.expected_agents }));

  register("swarm_sync", "Get the compact shared coordination snapshot: teammates, ready tasks, unread inbox, locks, proposals and barriers. Call often.", z.object(authShape), async (a) => coordinator.sync(auth(a)));
  register("swarm_heartbeat", "Refresh this agent's presence without fetching the full snapshot.", z.object(authShape), async (a) => coordinator.heartbeat(auth(a)));

  register("swarm_next_command", "Fetch the next queued Control Center command for this agent without waiting.", z.object(authShape), async (a) => {
    await coordinator.getAgent(auth(a));
    return commands.next(a.swarm_id, a.agent_id, 0);
  });
  register("swarm_wait", "Long-poll for the next Control Center command. Use worker mode to call this repeatedly while the chat turn remains active.", z.object({ ...authShape, wait_ms: z.number().int().min(0).max(25_000).optional() }), async (a) => {
    await coordinator.getAgent(auth(a));
    return commands.next(a.swarm_id, a.agent_id, a.wait_ms ?? 20_000);
  });
  register("swarm_ack", "Acknowledge a delivered Control Center command and mark this agent as running it.", z.object({ ...authShape, command_id: z.string().min(1) }), async (a) => {
    await coordinator.getAgent(auth(a));
    return commands.ack(a.swarm_id, a.agent_id, a.command_id);
  });
  register("swarm_report", "Report a Control Center command as done or failed with a concise result.", z.object({ ...authShape, command_id: z.string().min(1), status: z.enum(["done", "failed"]), result: z.string().optional(), error: z.string().optional() }), async (a) => {
    await coordinator.getAgent(auth(a));
    return commands.report({ swarmId: a.swarm_id, agentId: a.agent_id, commandId: a.command_id, status: a.status, result: a.result, error: a.error });
  });
  register("swarm_command_history", "List recent Control Center commands targeted to this agent and their delivery status.", z.object(authShape), async (a) => {
    await coordinator.getAgent(auth(a));
    return commands.historyForAgent(a.swarm_id, a.agent_id);
  });

  register("swarm_create_task", "Create a task with dependency IDs and suggested file scopes.", z.object({ ...authShape, title: z.string().min(1), description: z.string().optional(), dependencies: z.array(z.string()).optional(), suggested_scopes: z.array(z.string()).optional() }),
    async (a) => coordinator.createTask(auth(a), { title: a.title, description: a.description, dependencies: a.dependencies, suggestedScopes: a.suggested_scopes }));
  register("swarm_list_tasks", "List all tasks and whether each is currently ready to claim.", z.object(authShape), async (a) => coordinator.listTasks(auth(a)));
  register("swarm_claim_task", "Atomically claim one ready task. An agent may own only one active task at a time in the MVP.", z.object({ ...authShape, task_id: z.string() }), async (a) => coordinator.claimTask(auth(a), a.task_id));
  register("swarm_complete_task", "Complete the agent's claimed task and release task-bound path reservations.", z.object({ ...authShape, task_id: z.string(), result: z.string().optional() }), async (a) => coordinator.completeTask(auth(a), a.task_id, a.result));

  register("swarm_send", "Send durable typed mail to specific agent IDs; omit `to` for a broadcast.", z.object({
    ...authShape, to: z.array(z.string()).optional(), type: z.enum(["info", "question", "dependency", "blocker", "review", "proposal"]).optional(), subject: z.string(), body: z.string(), thread_id: z.string().optional(), task_id: z.string().optional(),
  }), async (a) => coordinator.sendMessage(auth(a), { to: a.to, type: a.type, subject: a.subject, body: a.body, threadId: a.thread_id, taskId: a.task_id }));
  register("swarm_inbox", "Read unread durable messages. By default returned messages are marked read.", z.object({ ...authShape, mark_read: z.boolean().optional() }), async (a) => coordinator.inbox(auth(a), a.mark_read ?? true));

  register("swarm_reserve_paths", "Reserve file/glob scopes with a TTL. Conflicting reservations by other agents are rejected.", z.object({
    ...authShape, patterns: z.array(z.string().min(1)).min(1), task_id: z.string().optional(), ttl_ms: z.number().int().positive().optional(), note: z.string().optional(),
  }), async (a) => coordinator.reservePaths(auth(a), { patterns: a.patterns, taskId: a.task_id, ttlMs: a.ttl_ms, note: a.note }));
  register("swarm_release_paths", "Release one reservation or all reservations owned by this agent.", z.object({ ...authShape, reservation_id: z.string().optional() }), async (a) => coordinator.releasePaths(auth(a), a.reservation_id));

  register("swarm_propose", "Open an architecture/coordination proposal for teammates to vote on.", z.object({ ...authShape, title: z.string(), body: z.string() }), async (a) => coordinator.createProposal(auth(a), a.title, a.body));
  register("swarm_vote", "Vote on an open proposal.", z.object({ ...authShape, proposal_id: z.string(), vote: z.enum(["approve", "reject", "abstain"]) }), async (a) => coordinator.voteProposal(auth(a), a.proposal_id, a.vote));
  register("swarm_resolve_proposal", "Resolve a proposal once a quorum of active agents has approved/rejected it.", z.object({ ...authShape, proposal_id: z.string(), resolution: z.string().optional() }), async (a) => coordinator.resolveProposal(auth(a), a.proposal_id, a.resolution));
  register("swarm_barrier", "Arrive at a named synchronization barrier. This is non-blocking: it returns waiting/released and should be polled later.", z.object({ ...authShape, stage: z.string(), expected: z.number().int().positive().max(32).optional() }), async (a) => coordinator.barrier(auth(a), a.stage, a.expected));

  register("swarm_memory_put", "Write/update compact shared project memory such as architecture decisions or discovered constraints.", z.object({ ...authShape, key: z.string(), content: z.string(), tags: z.array(z.string()).optional() }), async (a) => coordinator.putMemory(auth(a), { key: a.key, content: a.content, tags: a.tags }));
  register("swarm_memory_search", "Search shared project memory by substring.", z.object({ ...authShape, query: z.string() }), async (a) => coordinator.searchMemory(auth(a), a.query));

  register("runner_status", "List local outbound runners currently connected to the cloud MCP.", z.object(authShape), async (a) => { await coordinator.heartbeat(auth(a)); return runners.list(); });
  register("runner_prepare_worktree", "Create/reuse a dedicated local git worktree for this agent's claimed task.", z.object({ ...authShape, task_id: z.string(), runner_id: z.string().optional() }), async (a) => {
    const agent = await coordinator.getAgent(auth(a));
    if (agent.currentTaskId !== a.task_id) throw new Error("Claim the task before creating its worktree");
    const result = await runners.execute("worktree.create", { swarmId: a.swarm_id, agentId: a.agent_id, taskId: a.task_id }, a.runner_id);
    await coordinator.setWorktree(auth(a), result.branch, result.path);
    return result;
  });
  register("runner_list", "List files in this agent's worktree.", z.object({ ...authShape, path: z.string().optional(), depth: z.number().int().min(0).max(4).optional(), runner_id: z.string().optional() }), async (a) => {
    const agent = await coordinator.getAgent(auth(a));
    if (!agent.worktreePath) throw new Error("Prepare a worktree first");
    return runners.execute("fs.list", { root: agent.worktreePath, path: a.path ?? ".", depth: a.depth ?? 1 }, a.runner_id);
  });
  register("runner_read", "Read a UTF-8 file from this agent's worktree.", z.object({ ...authShape, path: z.string(), runner_id: z.string().optional() }), async (a) => {
    const agent = await coordinator.getAgent(auth(a)); if (!agent.worktreePath) throw new Error("Prepare a worktree first");
    return runners.execute("fs.read", { root: agent.worktreePath, path: a.path }, a.runner_id);
  });
  register("runner_write", "Write a UTF-8 file in this agent's worktree. Active reservations owned by other agents are enforced before the write.", z.object({ ...authShape, path: z.string(), content: z.string(), runner_id: z.string().optional() }), async (a) => {
    await coordinator.assertWritable(auth(a), a.path);
    const agent = await coordinator.getAgent(auth(a)); if (!agent.worktreePath) throw new Error("Prepare a worktree first");
    return runners.execute("fs.write", { root: agent.worktreePath, path: a.path, content: a.content }, a.runner_id);
  });
  register("runner_edit", "Exact-match edit a file in this agent's worktree with reservation enforcement.", z.object({ ...authShape, path: z.string(), search: z.string(), replace: z.string(), all: z.boolean().optional(), runner_id: z.string().optional() }), async (a) => {
    await coordinator.assertWritable(auth(a), a.path);
    const agent = await coordinator.getAgent(auth(a)); if (!agent.worktreePath) throw new Error("Prepare a worktree first");
    return runners.execute("fs.edit", { root: agent.worktreePath, path: a.path, search: a.search, replace: a.replace, all: a.all ?? false }, a.runner_id);
  });
  register("runner_git_status", "Run structured `git status` in this agent's worktree.", z.object({ ...authShape, runner_id: z.string().optional() }), async (a) => {
    const agent = await coordinator.getAgent(auth(a)); if (!agent.worktreePath) throw new Error("Prepare a worktree first");
    return runners.execute("git.status", { root: agent.worktreePath }, a.runner_id);
  });
  register("runner_git_diff", "Run git diff in this agent's worktree.", z.object({ ...authShape, cached: z.boolean().optional(), stat: z.boolean().optional(), runner_id: z.string().optional() }), async (a) => {
    const agent = await coordinator.getAgent(auth(a)); if (!agent.worktreePath) throw new Error("Prepare a worktree first");
    return runners.execute("git.diff", { root: agent.worktreePath, cached: a.cached, stat: a.stat }, a.runner_id);
  });
  register("runner_git_commit", "Stage all changes and commit them in this agent's worktree.", z.object({ ...authShape, message: z.string().min(1), runner_id: z.string().optional() }), async (a) => {
    const agent = await coordinator.getAgent(auth(a)); if (!agent.worktreePath) throw new Error("Prepare a worktree first");
    return runners.execute("git.commit", { root: agent.worktreePath, message: a.message }, a.runner_id);
  });
  register("runner_git_push", "Push this agent's worktree branch to origin.", z.object({ ...authShape, runner_id: z.string().optional() }), async (a) => {
    const agent = await coordinator.getAgent(auth(a)); if (!agent.worktreePath) throw new Error("Prepare a worktree first");
    return runners.execute("git.push", { root: agent.worktreePath }, a.runner_id);
  });
  register("runner_build", "Run the runner owner's configured build command in this agent's worktree.", z.object({ ...authShape, runner_id: z.string().optional(), timeout_ms: z.number().int().positive().optional() }), async (a) => {
    const agent = await coordinator.getAgent(auth(a)); if (!agent.worktreePath) throw new Error("Prepare a worktree first");
    return runners.execute("build", { root: agent.worktreePath }, a.runner_id, a.timeout_ms);
  });
  register("runner_exec", "Opt-in generic command execution in this agent's worktree. Disabled by default on the local runner and prefix/control-token filtered when enabled.", z.object({ ...authShape, command: z.string(), runner_id: z.string().optional(), timeout_ms: z.number().int().positive().optional() }), async (a) => {
    const agent = await coordinator.getAgent(auth(a)); if (!agent.worktreePath) throw new Error("Prepare a worktree first");
    return runners.execute("exec", { root: agent.worktreePath, command: a.command }, a.runner_id, a.timeout_ms);
  });

  return server;
}
