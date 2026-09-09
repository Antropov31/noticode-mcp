import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export function logAgentAction(workspace: string, event: string, data: unknown = {}): void {
  try {
    const file = join(workspace, ".noticode", "agent-actions.log");
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify({
      time: new Date().toISOString(),
      event,
      data,
    }) + "\n", "utf8");
  } catch {
    // Logging must never break an agent action.
  }
}
