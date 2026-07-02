import path from "node:path";
import fsp from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { NotiTool, ToolContext } from "./types.js";
import { importOptional } from "./optional.js";

async function framePath(ctx: ToolContext, i: number, stamp: number): Promise<string> {
  const dir = path.resolve(ctx.workspace, ".noticode", "captures", `watch-${stamp}`);
  await fsp.mkdir(dir, { recursive: true });
  return path.join(dir, `frame-${String(i).padStart(3, "0")}.png`);
}

export const screenWatch: NotiTool = {
  name: "screen_watch",
  description:
    "Watch the screen over time: capture a series of screenshots at a fixed interval and report which frames changed. Use this to observe activity instead of a single snapshot. Returns each frame's path flagged changed/unchanged.",
  schema: z.object({
    frames: z.number().int().optional().describe("Number of frames to capture (default: 5, max: 60)."),
    interval_ms: z.number().int().optional().describe("Delay between frames in ms (default: 1000)."),
    display: z.number().int().optional().describe("Display index for multi-monitor setups."),
  }),
  handler: async (args, ctx) => {
    const screenshot = (await importOptional("screenshot-desktop", "Run `npm install`.")).default;
    const frames = Math.min(Math.max(args.frames ?? 5, 1), 60);
    const interval = args.interval_ms ?? 1000;
    const stamp = Date.now();
    const lines: string[] = [];
    let prevHash = "";
    for (let i = 0; i < frames; i++) {
      const file = await framePath(ctx, i, stamp);
      const buf: Buffer = await screenshot({ screen: args.display, format: "png" });
      await fsp.writeFile(file, buf);
      const hash = createHash("sha1").update(buf).digest("hex");
      const tag = i === 0 ? "baseline" : hash !== prevHash ? "changed" : "no change";
      lines.push(`${i}: ${file} (${tag})`);
      prevHash = hash;
      if (i < frames - 1) await new Promise((r) => setTimeout(r, interval));
    }
    return lines.join("\n");
  },
};
