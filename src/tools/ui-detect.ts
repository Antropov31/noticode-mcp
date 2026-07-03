import path from "node:path";
import { z } from "zod";
import type { NotiTool, ToolContext } from "./types.js";
import { importOptional } from "./optional.js";
import { grabScreen, RegionSchema, type Region } from "./vision.js";

interface Gray {
  data: Uint8Array;
  width: number;
  height: number;
}

/** Decode an image buffer to a single-channel grayscale raw bitmap via sharp. */
async function toGray(buf: Buffer, scale?: number): Promise<Gray> {
  const sharp = (await importOptional("sharp", "Run `npm install`.")).default;
  let pipeline = sharp(buf).grayscale();
  if (scale != null && scale !== 1) {
    const meta = await sharp(buf).metadata();
    if (meta.width) pipeline = pipeline.resize(Math.max(1, Math.round(meta.width * scale)));
  }
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

/** Mean absolute difference between template and a screen window at (ox, oy), 0..255 (lower = better). */
function madAt(screen: Gray, tpl: Gray, ox: number, oy: number, step: number): number {
  let sum = 0;
  let count = 0;
  for (let ty = 0; ty < tpl.height; ty += step) {
    const srow = (oy + ty) * screen.width + ox;
    const trow = ty * tpl.width;
    for (let tx = 0; tx < tpl.width; tx += step) {
      sum += Math.abs(screen.data[srow + tx] - tpl.data[trow + tx]);
      count++;
    }
  }
  return count ? sum / count : 255;
}

export const screenFindImage: NotiTool = {
  name: "screen_find_image",
  description:
    "Find where a template image (icon, button, logo, any picture) appears on the screen and return a ready-to-click center point plus a match score 0-1 (higher = better). Use it to locate UI elements OCR can't read (icons without text). Provide the template as a file path in the workspace.",
  schema: z.object({
    template_path: z.string().describe("Path to the template image file (PNG/JPG) to search for, relative to the workspace."),
    display: z.number().int().optional().describe("Display index for multi-monitor setups."),
    region: RegionSchema.optional().describe("Restrict the search to this rectangle. Returned coordinates are still absolute."),
    scale: z
      .number()
      .optional()
      .describe("Downscale both screen and template by this factor for a faster search (default: 0.5). Coordinates are rescaled back to absolute pixels."),
    threshold: z
      .number()
      .optional()
      .describe("Minimum match score 0-1 to accept (default: 0.8). Below this, reports no match."),
  }),
  handler: async (args, ctx: ToolContext) => {
    const sharp = (await importOptional("sharp", "Run `npm install`.")).default;
    const scale = args.scale ?? 0.5;
    const region: Region | undefined = args.region;

    // Screen (optionally cropped) -> grayscale, downscaled.
    let screenBuf = await grabScreen(args.display);
    if (region) {
      screenBuf = await sharp(screenBuf)
        .extract({
          left: Math.max(0, Math.round(region.x)),
          top: Math.max(0, Math.round(region.y)),
          width: Math.max(1, Math.round(region.width)),
          height: Math.max(1, Math.round(region.height)),
        })
        .png()
        .toBuffer();
    }
    const screen = await toGray(screenBuf, scale);

    // Template -> grayscale, downscaled by the same factor.
    const tplPath = path.resolve(ctx.workspace, args.template_path);
    const tplBuf = await sharp(tplPath).png().toBuffer();
    const tpl = await toGray(tplBuf, scale);

    if (tpl.width > screen.width || tpl.height > screen.height)
      throw new Error("Template is larger than the (scaled) search area.");

    const maxOx = screen.width - tpl.width;
    const maxOy = screen.height - tpl.height;

    // Coarse scan: stride across the screen, subsample the template.
    const coarseStride = Math.max(2, Math.round(Math.min(tpl.width, tpl.height) / 8));
    const tplStep = Math.max(1, Math.round(Math.min(tpl.width, tpl.height) / 24));
    let best = { ox: 0, oy: 0, mad: Number.POSITIVE_INFINITY };
    for (let oy = 0; oy <= maxOy; oy += coarseStride) {
      for (let ox = 0; ox <= maxOx; ox += coarseStride) {
        const mad = madAt(screen, tpl, ox, oy, tplStep);
        if (mad < best.mad) best = { ox, oy, mad };
      }
    }

    // Local refine: full-resolution search in a small window around the best coarse hit.
    const win = coarseStride;
    for (let oy = Math.max(0, best.oy - win); oy <= Math.min(maxOy, best.oy + win); oy++) {
      for (let ox = Math.max(0, best.ox - win); ox <= Math.min(maxOx, best.ox + win); ox++) {
        const mad = madAt(screen, tpl, ox, oy, 1);
        if (mad < best.mad) best = { ox, oy, mad };
      }
    }

    const score = 1 - best.mad / 255;
    const threshold = args.threshold ?? 0.8;
    if (score < threshold)
      return `No confident match for ${args.template_path} (best score ${score.toFixed(3)} < ${threshold}).`;

    // Center in scaled coords -> back to absolute screen pixels.
    const cxScaled = best.ox + tpl.width / 2;
    const cyScaled = best.oy + tpl.height / 2;
    const offX = region?.x ?? 0;
    const offY = region?.y ?? 0;
    const cx = Math.round(offX + cxScaled / scale);
    const cy = Math.round(offY + cyScaled / scale);
    return `Found ${args.template_path} -> click (${cx}, ${cy}) [score ${score.toFixed(3)}].`;
  },
};
