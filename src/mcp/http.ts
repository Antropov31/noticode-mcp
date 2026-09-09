import { randomUUID } from "node:crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildMcpServer } from "./server.js";
import { isHostAllowed, isOriginAllowed } from "./http-guards.js";
import { banner, blue, sky, accent, muted } from "../theme.js";
import type { NotiConfig } from "../config.js";

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  /** Timestamp of the last request seen on this session (ms since epoch). */
  lastSeen: number;
}

/**
 * Start the NotiCode MCP server over HTTP (Streamable HTTP transport) and print
 * a connectable URL. No ANTHROPIC_API_KEY is required: in this mode the MCP
 * client (Claude, Cursor, etc.) brings the model, NotiCode only exposes tools.
 *
 * Guards wired from config (see `src/config.ts` / `.env.example`):
 * - `httpAllowedHosts`   — Host-header allowlist (DNS-rebinding protection).
 * - `httpAllowedOrigins` — Origin allowlist + CORS headers for browser clients.
 * - `httpMaxSessions`    — cap on concurrent MCP sessions (429 past the cap).
 * - `httpSessionTtlMs`   — idle sessions older than this are closed + evicted.
 */
export async function startHttpMcpServer(config: NotiConfig): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "8mb" }));

  // One transport per MCP session, keyed by the session id.
  const sessions: Record<string, SessionEntry> = {};

  const activeSessionCount = (): number => Object.keys(sessions).length;

  const dropSession = (sid: string): void => {
    const entry = sessions[sid];
    if (!entry) return;
    delete sessions[sid];
    // Best-effort transport shutdown; onclose also deletes, so this is idempotent.
    void entry.transport.close().catch(() => {});
  };

  /** Close + evict sessions idle longer than the configured TTL. Returns evicted count. */
  const pruneExpiredSessions = (): number => {
    const now = Date.now();
    let evicted = 0;
    for (const [sid, entry] of Object.entries(sessions)) {
      if (now - entry.lastSeen > config.httpSessionTtlMs) {
        dropSession(sid);
        evicted += 1;
      }
    }
    return evicted;
  };

  // Background TTL sweep. unref() so an idle server with only this timer can
  // still exit cleanly; the interval is capped at 60s regardless of TTL.
  const sweepTimer = setInterval(
    () => {
      pruneExpiredSessions();
    },
    Math.min(config.httpSessionTtlMs, 60_000),
  );
  if (typeof (sweepTimer as unknown as { unref?: unknown }).unref === "function") {
    (sweepTimer as unknown as { unref: () => void }).unref();
  }

  const touchSession = (sid: string): boolean => {
    const entry = sessions[sid];
    if (!entry) return false;
    if (Date.now() - entry.lastSeen > config.httpSessionTtlMs) {
      dropSession(sid);
      return false;
    }
    entry.lastSeen = Date.now();
    return true;
  };

  // --- Host allowlist (DNS-rebinding protection) for /mcp only. /health stays
  // open so local monitors/probes keep working when an external allowlist is set.
  const hostGuard = (req: Request, res: Response, next: NextFunction): void => {
    if (!isHostAllowed(req.headers.host, config.httpAllowedHosts)) {
      res.status(403).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Forbidden: Host not allowed by NOTICODE_ALLOWED_HOSTS." },
        id: null,
      });
      return;
    }
    next();
  };

  // --- Origin allowlist + CORS for browser-based MCP clients on /mcp.
  // Requests without Origin (native clients, curl) always pass through.
  const originGuard = (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (!isOriginAllowed(origin, config.httpAllowedOrigins)) {
      res.status(403).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Forbidden: Origin not allowed by NOTICODE_ALLOWED_ORIGINS." },
        id: null,
      });
      return;
    }
    if (origin && config.httpAllowedOrigins.length > 0) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    }
    next();
  };

  app.use("/mcp", hostGuard, originGuard);

  // CORS preflight for browser clients.
  app.options("/mcp", hostGuard, originGuard, (_req: Request, res: Response) => {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.status(204).end();
  });

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

  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;
    let isNewSession = false;

    if (sessionId && sessions[sessionId]) {
      if (!touchSession(sessionId)) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: session expired (idle TTL exceeded)" },
          id: null,
        });
        return;
      }
      transport = sessions[sessionId].transport;
    } else if (!sessionId && isInitializeRequest(req.body)) {
      pruneExpiredSessions();
      if (activeSessionCount() >= config.httpMaxSessions) {
        res.status(429).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message:
              `Server busy: too many active sessions (max ${config.httpMaxSessions}). ` +
              "Retry after an idle session expires or an active client disconnects.",
          },
          id: null,
        });
        return;
      }
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions[sid] = { transport, lastSeen: Date.now() };
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) delete sessions[transport.sessionId];
      };
      const server = buildMcpServer(config);
      await server.connect(transport);
      // The session id is assigned while the transport handles the initialize
      // request below; onsessioninitialized stores the entry at that point.
      isNewSession = true;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: no valid session ID provided" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
    if (isNewSession && transport.sessionId) {
      // Refresh the activity timestamp now that initialize was handled.
      touchSession(transport.sessionId);
    }
  });

  // GET (SSE stream) and DELETE (session teardown) reuse the live session.
  const handleSessionRequest = async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions[sessionId] || !touchSession(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await sessions[sessionId].transport.handleRequest(req, res);
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
    process.stdout.write(muted("  auth: none · bound to ") + accent(config.httpHost) + "\n");
  }
  if (config.httpAllowedHosts.length > 0) {
    process.stdout.write(muted(`  allowed hosts: ${config.httpAllowedHosts.join(", ")}`) + "\n");
  }
  if (config.httpAllowedOrigins.length > 0) {
    process.stdout.write(muted(`  allowed origins: ${config.httpAllowedOrigins.join(", ")}`) + "\n");
  }
  process.stdout.write(
    muted(`  sessions: max ${config.httpMaxSessions}, idle TTL ${Math.round(config.httpSessionTtlMs / 1000)}s`) + "\n",
  );
  process.stdout.write(
    muted("  Paste this URL into your MCP client (HTTP transport) and it gets hands on this machine.") +
      "\n\n",
  );
}
