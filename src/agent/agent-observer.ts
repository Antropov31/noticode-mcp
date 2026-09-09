import fs from "node:fs/promises";
import path from "node:path";

export type AgentObservation = {
  timestamp: string;
  workspace: string;
  filesChanged: string[];
  warnings: string[];
};

export async function createObservation(workspace: string, previousFiles: string[] = []): Promise<AgentObservation> {
  const current: string[] = [];

  async function scan(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await scan(full);
      else current.push(path.relative(workspace, full));
    }
  }

  await scan(workspace);

  return {
    timestamp: new Date().toISOString(),
    workspace,
    filesChanged: current.filter((f) => !previousFiles.includes(f)),
    warnings: [],
  };
}
