import fs from "node:fs/promises";
import path from "node:path";

export async function saveReflection(root:string, text:string) {
  const dir = path.join(root, ".noticode");
  await fs.mkdir(dir, {recursive:true});
  await fs.appendFile(path.join(dir, "reflections.jsonl"), JSON.stringify({
    time:new Date().toISOString(),
    text
  }) + "\n");
}
