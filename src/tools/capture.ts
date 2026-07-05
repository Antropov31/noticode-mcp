import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import type { NotiTool, ToolContext } from "./types.js";
import { importOptional } from "./optional.js";
import { processImage, toImage } from "./vision.js";

async function outPath(ctx: ToolContext, prefix: string): Promise<string> {
  const dir = path.resolve(ctx.workspace, ".noticode", "captures");
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${prefix}-${Date.now()}.png`);
}

export const screenCapture: NotiTool = {
  name: "screen_capture",
  description:
    "Take a screenshot of the host's screen and save it as a PNG. Returns the file path. Set `see: true` to also return the screenshot as an inline image the agent can directly see.",
  schema: z.object({
    display: z.number().int().optional().describe("Display index for multi-monitor setups (default: primary)."),
    see: z.boolean().optional().describe("Also return the screenshot as an inline image the model can see."),
    scale: z.number().optional().describe("Downscale factor 0-1 for the inline image (default: 1)."),
  }),
  handler: async (args, ctx) => {
    const screenshot = (await importOptional("screenshot-desktop", "Run `npm install`.")).default;
    const file = await outPath(ctx, "screen");
    const buf: Buffer = await screenshot({ filename: file, screen: args.display, format: "png" });
    if (!args.see) return file;
    const small = await processImage(buf, { scale: args.scale });
    return { text: `Saved to ${file}.`, images: [toImage(small)] };
  },
};

export const webcamCapture: NotiTool = {
  name: "webcam_capture",
  description:
    "Capture a still photo from the host's webcam and save it as a PNG. Returns the file path. Requires a camera and a capture backend (fswebcam on Linux, imagesnap on macOS, or ffmpeg).",
  schema: z.object({
    width: z.number().int().optional().describe("Capture width (default: 1280)."),
    height: z.number().int().optional().describe("Capture height (default: 720)."),
  }),
  handler: async (args, ctx) => {
    const NodeWebcam = (await importOptional("node-webcam", "Run `npm install`.")).default;
    const file = await outPath(ctx, "webcam");
    const cam = NodeWebcam.create({
      width: args.width ?? 1280,
      height: args.height ?? 720,
      output: "png",
      saveShots: true,
      callbackReturn: "location",
    });
    // node-webcam appends the extension itself, so pass the path without it.
    const base = file.replace(/\.png$/, "");
    await new Promise<void>((resolve, reject) => {
      cam.capture(base, (err: any) => (err ? reject(err) : resolve()));
    });
    return file;
  },
};
