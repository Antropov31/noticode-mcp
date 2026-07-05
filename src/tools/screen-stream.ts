import path from "node:path";
import fsp from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { NotiTool, ToolContext, ToolImage } from "./types.js";
import { importOptional } from "./optional.js";
import { processImage, toImage } from "./vision.js";

async function framePath(ctx: ToolContext, i: number, stamp: number): Promise<string> {
  const dir = path.resolve(ctx.workspace, ".noticode", "captures", `watch-${stamp}`);
  await fsp.mkdir(dir, { recursive: true });
  return path.join(dir, `frame-${String(i).padStart(3, "0")}.png`);
}

export const screenWatch: NotiTool = {
  name: "screen_watch",
  description:
    "Watch the screen over time: capture a series of screenshots at a fixed interval and report which frames changed. By default it also returns the baseline plus each changed frame as inline images so the agent can directly SEE what changed, not just read paths. Downscaled to save tokens.",
  schema: z.object({
    frames: z.number().int().optional().describe("Number of frames to capture (default: 5, max: 60)."),
    interval_ms: z.number().int().optional().describe("Delay between frames in ms (default: 1000)."),
    display: z.number().int().optional().describe("Display index for multi-monitor setups."),
    return_images: z
      .boolean()
      .optional()
      .describe("Return baseline + changed frames as inline images the model can see (default: true)."),
    scale: z
      .number()
      .optional()
      .describe("Downscale factor 0-1 for returned images (default: 0.5 = half size)."),
    max_images: z
      .number()
      .int()
      .optional()
      .describe("Cap how many frames are returned as inline images to avoid token blowup (default: 8)."),
  }),
  handler: async (args, ctx) => {
    const screenshot = (await importOptional("screenshot-desktop", "Run `npm install`.")).default;
    const frames = Math.min(Math.max(args.frames ?? 5, 1), 60);
    const interval = args.interval_ms ?? 1000;
    const returnImages = args.return_images ?? true;
    const scale = args.scale ?? 0.5;
    const maxImages = Math.max(1, args.max_images ?? 8);
    const stamp = Date.now();
    const lines: string[] = [];
    const images: ToolImage[] = [];
    let prevHash = "";
    for (let i = 0; i < frames; i++) {
      const file = await framePath(ctx, i, stamp);
      const buf: Buffer = await screenshot({ screen: args.display, format: "png" });
      await fsp.writeFile(file, buf);
      const hash = createHash("sha1").update(buf).digest("hex");
      const changed = i !== 0 && hash !== prevHash;
      const tag = i === 0 ? "baseline" : changed ? "changed" : "no change";
      lines.push(`${i}: ${file} (${tag})`);
      if (returnImages && (i === 0 || changed) && images.length < maxImages) {
        const small = await processImage(buf, { scale });
        images.push(toImage(small));
      }
      prevHash = hash;
      if (i < frames - 1) await new Promise((r) => setTimeout(r, interval));
    }
    const text = lines.join("\n");
    return returnImages && images.length ? { text, images } : text;
  },
};
