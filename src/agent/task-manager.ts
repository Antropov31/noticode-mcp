import fs from "node:fs/promises";
import path from "node:path";

export type AgentTask = {
  id: string;
  goal: string;
  steps: string[];
  current: number;
  status: "active" | "done" | "failed";
};

export async function saveTask(root: string, task: AgentTask) {
  const dir = path.join(root, ".noticode");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "tasks.json"), JSON.stringify(task, null, 2));
}

export async function loadTask(root: string): Promise<AgentTask | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(root, ".noticode", "tasks.json"), "utf8"));
  } catch {
    return null;
  }
}
