import fs from "node:fs/promises";
import path from "node:path";

export type WorkspaceMap = {
  root: string;
  generatedAt: string;
  files: string[];
  technologies: string[];
};

export async function scanWorkspace(root: string): Promise<WorkspaceMap> {
  const files: string[] = [];

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.push(path.relative(root, full));
    }
  }

  await walk(root);

  const technologies = new Set<string>();
  const names = files.join(" ").toLowerCase();
  if (names.includes("package.json")) technologies.add("Node.js");
  if (names.includes("gradle") || names.includes(".kt")) technologies.add("Kotlin/Gradle");
  if (names.includes(".java")) technologies.add("Java");
  if (names.includes(".py")) technologies.add("Python");
  if (names.includes(".html") || names.includes(".js")) technologies.add("Web");

  const map: WorkspaceMap = {
    root,
    generatedAt: new Date().toISOString(),
    files,
    technologies: [...technologies],
  };

  await fs.mkdir(path.join(root, ".noticode"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".noticode", "workspace-map.json"),
    JSON.stringify(map, null, 2),
  );

  return map;
}
