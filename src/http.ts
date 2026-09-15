import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { CloudConfig } from "./config.js";
import { JsonStore } from "./store.js";
import { Coordinator } from "./coordinator.js";
import { RunnerHub } from "./runner/hub.js";
import { buildMcpServer } from "./mcp.js";

interface SessionEntry { transport: StreamableHTTPServerTransport; lastSeen: number }

export async function startCloud(config: CloudConfig): Promise<void> {
  if (!config.runnerToken) throw new Error("ANTRO_RUNNER_TOKEN is required for the cloud server");
  const store = new JsonStore(config.statePath);
  const coordinator = new Coordinator(store, config.defaultReservationTtlMs, config.agentStaleMs);
  const runners = new RunnerHub(config.runnerToken, config.runnerTimeoutMs);
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  if (config.mcpToken) {
    app.use("/mcp", (req, res, next) => {
      if (req.headers.authorization === `Bearer ${config.mcpToken}`) return next();
      res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
    });
  }

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
        onsessioninitialized: (sid) => sessions.set(sid, { transport, lastSeen: Date.now() }),
      });
      transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
      await buildMcpServer(coordinator, runners).connect(transport);
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
  app.get("/health", (_req, res) => res.json({ ok: true, name: "antroswarm", runners: runners.list().length, mcpSessions: sessions.size }));

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
  console.log(`Runner websocket:      ws://${config.host}:${config.port}/runner`);
}
