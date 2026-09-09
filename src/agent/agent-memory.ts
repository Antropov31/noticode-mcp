import fs from "node:fs";
import path from "node:path";

export type AgentMemoryEntry = {
  time: string;
  type: "observation" | "decision" | "result";
  text: string;
};

export function remember(workspace: string, entry: AgentMemoryEntry): void {
  const dir = path.join(workspace, ".noticode");
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(
    path.join(dir, "agent-memory.jsonl"),
    JSON.stringify(entry) + "\n",
    "utf8",
  );
}

export function loadMemory(workspace: string): string {
  try {
    return fs.readFileSync(path.join(workspace, ".noticode", "agent-memory.jsonl"), "utf8").slice(-12000);
  } catch {
    return "";
  }
}
