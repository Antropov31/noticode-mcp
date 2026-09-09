import fs from "node:fs/promises";
import path from "node:path";

export type CodeGraph = {
  files: string[];
  relations: Array<{ from: string; to: string }>;
};

export async function buildCodeGraph(root: string): Promise<CodeGraph> {
  const files: string[] = [];
  const relations: Array<{from:string;to:string}> = [];

  async function walk(dir:string) {
    for (const e of await fs.readdir(dir, {withFileTypes:true})) {
      if (["node_modules", ".git", "dist"].includes(e.name)) continue;
      const full = path.join(dir,e.name);
      if (e.isDirectory()) await walk(full);
      else files.push(path.relative(root, full));
    }
  }
  await walk(root);

  return { files, relations };
}
