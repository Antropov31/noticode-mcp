import fs from "node:fs/promises";
import path from "node:path";

export type MemoryEntry = {
  type: "decision" | "fact" | "lesson";
  text: string;
  time: string;
};

export async function saveMemory(root: string, entry: MemoryEntry) {
  const dir = path.join(root, ".noticode");
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(path.join(dir, "memory-v2.jsonl"), JSON.stringify(entry) + "\n");
}

export async function loadMemory(root: string) {
  try {
    const data = await fs.readFile(path.join(root, ".noticode", "memory-v2.jsonl"), "utf8");
    return data.trim().split("\n").filter(Boolean).map(x => JSON.parse(x));
  } catch { return []; }
}
