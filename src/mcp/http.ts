import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildMcpServer } from "./server.js";
import { banner, blue, sky, accent, muted } from "../theme.js";
import type { NotiConfig } from "../config.js";

/**
 * Start the NotiCode MCP server over HTTP (Streamable HTTP transport) and print
 * a connectable URL. No ANTHROPIC_API_KEY is required: in this mode the MCP
 * client (Claude, Cursor, etc.) brings the model, NotiCode only exposes tools.
 */
export async function startHttpMcpServer(config: NotiConfig): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "8mb" }));

  // Optional bearer-token gate. Off by default so the server works key-free.
  if (config.token) {
    app.use("/mcp", (req, res, next) => {
      if (req.headers.authorization === `Bearer ${config.token}`) return next();
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized" },
        id: null,
      });
    });
  }

  // One transport per MCP session, keyed by the session id.
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) delete transports[transport.sessionId];
      };
      const server = buildMcpServer(config);
      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: no valid session ID provided" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  // GET (SSE stream) and DELETE (session teardown) reuse the live session.
  const handleSessionRequest = async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  };

  app.get("/mcp", handleSessionRequest);
  app.delete("/mcp", handleSessionRequest);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, name: "noticode", transport: "http" });
  });

  await new Promise<void>((resolve) => {
    app.listen(config.httpPort, config.httpHost, () => resolve());
  });

  const url = `http://${config.httpHost}:${config.httpPort}/mcp`;
  process.stdout.write(banner + "\n");
  process.stdout.write(sky("  MCP server URL  ") + blue.bold(url) + "\n");
  process.stdout.write(muted(`  workspace: ${config.workspace}`) + "\n");
  if (config.token) {
    process.stdout.write(muted("  auth: Bearer token (set via NOTICODE_TOKEN)") + "\n");
  } else {
    process.stdout.write(muted("  auth: none \u00b7 bound to ") + accent(config.httpHost) + "\n");
  }
  process.stdout.write(
    muted("  Paste this URL into your MCP client (HTTP transport) and it gets hands on this machine.") +
      "\n\n",
  );
}
