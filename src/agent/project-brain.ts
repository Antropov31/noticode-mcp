import fs from "node:fs/promises";
import path from "node:path";

export type ProjectBrain = {
  entryPoints: string[];
  configs: string[];
  dependencies: Record<string, string[]>;
  notes: string[];
};

export async function buildProjectBrain(root: string): Promise<ProjectBrain> {
  const brain: ProjectBrain = {
    entryPoints: [],
    configs: [],
    dependencies: {},
    notes: [],
  };

  const check = async (file: string) => {
    try {
      const full = path.join(root, file);
      const text = await fs.readFile(full, "utf8");

      brain.configs.push(file);

      if (file === "package.json") {
        const json = JSON.parse(text);
        brain.dependencies.node = Object.keys(json.dependencies ?? {});
        brain.entryPoints.push(json.main ?? "src/index.js");
      }

      if (file.endsWith("build.gradle") || file.endsWith("build.gradle.kts")) {
        brain.dependencies.gradle = [...text.matchAll(/implementation\s+['\"]([^'\"]+)/g)].map(x => x[1]);
        brain.notes.push("Gradle build detected");
      }
    } catch {}
  };

  const files = await fs.readdir(root);
  for (const file of files) {
    if (["package.json", "build.gradle", "build.gradle.kts", "pom.xml"].includes(file)) {
      await check(file);
    }
  }

  await fs.mkdir(path.join(root, ".noticode"), { recursive: true });
  await fs.writeFile(path.join(root, ".noticode", "project-brain.json"), JSON.stringify(brain, null, 2));
  return brain;
}
