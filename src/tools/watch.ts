import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { NotiTool } from "./types.js";

export const fsWatch: NotiTool = {
  name: "fs_watch",
  description:
    "Watch a directory for file changes for a fixed duration, then return the events observed (change/rename). Blocks for duration_ms and returns. Recursive watching is best-effort (fully supported on macOS/Windows).",
  schema: z.object({
    path: z.string().optional().describe("Directory to watch (default: workspace root)."),
    duration_ms: z.number().int().optional().describe("How long to watch, in ms (default: 5000)."),
  }),
  handler: async (args, ctx) => {
    const dir = path.resolve(ctx.workspace, args.path ?? ".");
    const duration = args.duration_ms ?? 5000;
    const events: string[] = [];
    const seen = new Set<string>();
    let watcher: fs.FSWatcher;
    try {
      watcher = fs.watch(dir, { recursive: true }, (event, filename) => {
        if (!filename) return;
        const key = `${event}:${filename}`;
        if (seen.has(key)) return;
        seen.add(key);
        events.push(`${event}: ${filename}`);
      });
    } catch (e: any) {
      throw new Error(`Cannot watch ${dir}: ${e?.message ?? e}`);
    }
    await new Promise((r) => setTimeout(r, duration));
    watcher.close();
    return events.slice(0, 500).join("\n") || `(no changes in ${dir} over ${duration}ms)`;
  },
};
