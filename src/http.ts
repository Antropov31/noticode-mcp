import { randomUUID } from "node:crypto";
import path from "node:path";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { CloudConfig } from "./config.js";
import { JsonStore } from "./store.js";
import { Coordinator } from "./coordinator.js";
import { CommandQueue } from "./command-queue.js";
import { dashboardHtml } from "./dashboard.js";
import { RunnerHub } from "./runner/hub.js";
import { buildMcpServer } from "./mcp.js";

interface SessionEntry { transport: StreamableHTTPServerTransport; lastSeen: number }

export async function startCloud(config: CloudConfig): Promise<void> {
  if (!config.runnerToken) throw new Error("ANTRO_RUNNER_TOKEN is required for the cloud server");
  const store = new JsonStore(config.statePath);
  const coordinator = new Coordinator(store, config.defaultReservationTtlMs, config.agentStaleMs);
  const commands = new CommandQueue(path.join(path.dirname(config.statePath), "commands.json"));
  const runners = new RunnerHub(config.runnerToken, config.runnerTimeoutMs);
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  if (config.mcpToken) {
    app.use("/mcp", (req, res, next) => {
      if (req.headers.authorization === `Bearer ${config.mcpToken}`) return next();
      res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
    });
  }

  const dashboardAuthorized = (req: Request): boolean => !config.mcpToken
    || req.headers.authorization === `Bearer ${config.mcpToken}`
    || req.query.token === config.mcpToken;
  const requireDashboardAuth = (req: Request, res: Response): boolean => {
    if (dashboardAuthorized(req)) return true;
    res.status(401).send("Unauthorized");
    return false;
  };

  app.get("/dashboard", (req, res) => {
    if (!requireDashboardAuth(req, res)) return;
    res.type("html").send(dashboardHtml());
  });

  app.get("/api/dashboard", async (req, res) => {
    if (!requireDashboardAuth(req, res)) return;
    const now = Date.now();
    const swarms = await store.read((state) => Object.values(state.swarms).map((swarm) => ({
      id: swarm.id,
      goal: swarm.goal,
      repo: swarm.repo,
      expectedAgents: swarm.expectedAgents,
      agents: swarm.agents.map((agent) => ({
        id: agent.id,
        displayName: agent.displayName,
        currentTaskId: agent.currentTaskId,
        branch: agent.branch,
        worktreePath: agent.worktreePath,
        ageMs: now - agent.lastSeenAt,
        online: now - agent.lastSeenAt <= config.agentStaleMs,
      })),
      tasks: swarm.tasks.map((task) => ({ id: task.id, title: task.title, status: task.status, claimedBy: task.claimedBy })),
      barriers: swarm.barriers,
      reservations: swarm.reservations,
    })));
    res.json({ swarms, runners: runners.list(), commands: await commands.list() });
  });

  app.post("/api/commands", async (req, res) => {
    if (!requireDashboardAuth(req, res)) return;
    try {
      const swarmId = String(req.body?.swarm_id ?? "");
      const target = String(req.body?.target ?? "all");
      const prompt = String(req.body?.prompt ?? "");
      const label = req.body?.label == null ? undefined : String(req.body.label);
      const targetAgentIds = await store.read((state) => {
        const swarm = state.swarms[swarmId];
        if (!swarm) throw new Error(`Unknown swarm: ${swarmId}`);
        if (target === "all") return swarm.agents.map((agent) => agent.id);
        const agent = swarm.agents.find((item) => item.id === target || item.displayName === target);
        if (!agent) throw new Error(`Unknown target agent: ${target}`);
        return [agent.id];
      });
      const command = await commands.enqueue({ swarmId, prompt, label, targetAgentIds });
      res.status(201).json(command);
    } catch (error: any) {
      res.status(400).json({ error: error?.message ?? String(error) });
    }
  });

  app.post("/api/commands/:id/cancel", async (req, res) => {
    if (!requireDashboardAuth(req, res)) return;
    try { res.json(await commands.cancel(req.params.id)); }
    catch (error: any) { res.status(404).json({ error: error?.message ?? String(error) }); }
  });

  const sessions = new Map<string, SessionEntry>();
  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;
    if (sessionId && sessions.has(sessionId)) {
      const entry = sessions.get(sessionId)!;
      entry.lastSeen = Date.now();
      transport = entry.transport;
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.set(sid, { transport, lastSeen: Date.now() });
        },
      });
      transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
      await buildMcpServer(coordinator, runners, commands).connect(transport);
    } else {
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Missing/invalid MCP session" }, id: null });
      return;
    }
    await transport.handleRequest(req, res, req.body);
  });

  const handleSession = async (req: Request, res: Response) => {
    const sid = req.headers["mcp-session-id"] as string | undefined;
    const entry = sid ? sessions.get(sid) : undefined;
    if (!entry) { res.status(400).send("Invalid or missing MCP session"); return; }
    entry.lastSeen = Date.now();
    await entry.transport.handleRequest(req, res);
  };
  app.get("/mcp", handleSession);
  app.delete("/mcp", handleSession);
  app.get("/health", async (_req, res) => res.json({ ok: true, name: "antroswarm", version: "0.2.0", runners: runners.list().length, mcpSessions: sessions.size, commands: (await commands.list()).length }));

  setInterval(() => {
    const cutoff = Date.now() - 30 * 60_000;
    for (const [sid, entry] of sessions) {
      if (entry.lastSeen < cutoff) { sessions.delete(sid); void entry.transport.close().catch(() => {}); }
    }
  }, 60_000).unref();

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/runner" });
  runners.attach(wss);

  await new Promise<void>((resolve) => httpServer.listen(config.port, config.host, resolve));
  console.log(`AntroSwarm cloud MCP: http://${config.host}:${config.port}/mcp`);
  console.log(`Control Center:        http://${config.host}:${config.port}/dashboard`);
  console.log(`Runner websocket:      ws://${config.host}:${config.port}/runner`);
}
