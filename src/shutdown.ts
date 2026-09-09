/**
 * Centralized graceful-shutdown registry.
 *
 * Any long-lived subsystem (HTTP server, MCP server, headless browser,
 * child processes) can register a cleanup function here. On SIGINT/SIGTERM
 * (Ctrl+C, process manager stop) every handler runs in reverse order, so the
 * process exits cleanly instead of leaving orphaned browsers / bound ports.
 */

type ShutdownHandler = () => void | Promise<void>;

const handlers: ShutdownHandler[] = [];
let shuttingDown = false;
let registered = false;

export function onShutdown(handler: ShutdownHandler): () => void {
  handlers.push(handler);
  return () => {
    const i = handlers.indexOf(handler);
    if (i >= 0) handlers.splice(i, 1);
  };
}

async function runShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stderr.write(`\n[NOTICODE] Received ${signal}. Shutting down gracefully…\n`);
  // Run in reverse registration order (last registered = most recently opened).
  for (let i = handlers.length - 1; i >= 0; i--) {
    try {
      await handlers[i]();
    } catch (e: any) {
      process.stderr.write(`[NOTICODE] Shutdown handler error: ${e?.message ?? e}\n`);
    }
  }
  process.exit(0);
}

export function installSignalHandlers(): void {
  if (registered) return;
  registered = true;
  const sigs: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const sig of sigs) {
    process.on(sig, () => {
      void runShutdown(sig);
    });
  }
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}
