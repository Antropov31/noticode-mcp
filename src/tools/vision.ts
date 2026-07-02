import path from "node:path";
import fsp from "node:fs/promises";
import { z } from "zod";
import type { NotiTool, ToolContext, ToolImage } from "./types.js";
import { importOptional } from "./optional.js";

const RegionSchema = z
  .object({
    x: z.number().int().describe("Left edge in absolute screen pixels."),
    y: z.number().int().describe("Top edge in absolute screen pixels."),
    width: z.number().int().describe("Region width in pixels."),
    height: z.number().int().describe("Region height in pixels."),
  })
  .describe("A rectangle in absolute screen pixels.");

type Region = { x: number; y: number; width: number; height: number };

/** Grab a full-screen PNG as a Buffer. */
async function grab(display?: number): Promise<Buffer> {
  const screenshot = (await importOptional("screenshot-desktop", "Run `npm install`.")).default;
  return screenshot({ screen: display, format: "png" });
}

/** Optionally crop to a region and/or downscale a PNG buffer using sharp. */
async function processImage(
  buf: Buffer,
  opts: { region?: Region; scale?: number },
): Promise<Buffer> {
  const { region, scale } = opts;
  if (!region && (scale == null || scale === 1)) return buf;
  const sharp = (await importOptional("sharp", "Run `npm install`.")).default;
  const meta = await sharp(buf).metadata();
  const baseW = region ? region.width : meta.width ?? 0;
  let pipeline = sharp(buf);
  if (region) {
    pipeline = pipeline.extract({
      left: Math.max(0, Math.round(region.x)),
      top: Math.max(0, Math.round(region.y)),
      width: Math.max(1, Math.round(region.width)),
      height: Math.max(1, Math.round(region.height)),
    });
  }
  if (scale != null && scale !== 1 && baseW > 0) {
    pipeline = pipeline.resize(Math.max(1, Math.round(baseW * scale)));
  }
  return pipeline.png().toBuffer();
}

/** Run OCR over a PNG buffer and return words with bounding boxes. */
async function ocrWords(
  buf: Buffer,
  lang: string | undefined,
): Promise<Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>> {
  const { createWorker } = await importOptional("tesseract.js", "Run `npm install`.");
  const worker = await createWorker(lang ?? "eng");
  try {
    const { data } = await worker.recognize(buf);
    return (data.words ?? []).map((w: any) => ({
      text: (w.text ?? "").trim(),
      confidence: Math.round(w.confidence ?? 0),
      bbox: {
        x0: w.bbox?.x0 ?? 0,
        y0: w.bbox?.y0 ?? 0,
        x1: w.bbox?.x1 ?? 0,
        y1: w.bbox?.y1 ?? 0,
      },
    }));
  } finally {
    await worker.terminate();
  }
}

/** Convert an OCR word bbox (relative to an optional region) into absolute box + center. */
function toBox(
  w: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } },
  region?: Region,
) {
  const offX = region?.x ?? 0;
  const offY = region?.y ?? 0;
  const x = Math.round(offX + w.bbox.x0);
  const y = Math.round(offY + w.bbox.y0);
  const width = Math.round(w.bbox.x1 - w.bbox.x0);
  const height = Math.round(w.bbox.y1 - w.bbox.y0);
  return {
    text: w.text,
    confidence: w.confidence,
    x,
    y,
    width,
    height,
    center: { x: Math.round(x + width / 2), y: Math.round(y + height / 2) },
  };
}

export const screenSee: NotiTool = {
  name: "screen_see",
  description:
    "Look at the screen right now: capture a screenshot and return it as an image the agent can directly see. Call it repeatedly for near real-time vision, before clicking, and after an action to verify the result. Optionally crop to a region and/or downscale to save tokens.",
  schema: z.object({
    display: z.number().int().optional().describe("Display index for multi-monitor setups (default: primary)."),
    region: RegionSchema.optional().describe("Crop to this rectangle before returning."),
    scale: z
      .number()
      .optional()
      .describe("Downscale factor between 0 and 1 to shrink the image (e.g. 0.5 = half size). Default: 1 (full size)."),
    save: z.boolean().optional().describe("Also save the PNG into the workspace and include its path."),
  }),
  handler: async (args, ctx: ToolContext) => {
    const raw = await grab(args.display);
    const buf = await processImage(raw, { region: args.region, scale: args.scale });
    const image: ToolImage = { data: buf.toString("base64"), mimeType: "image/png" };
    let text = "Here is the current screen.";
    if (args.save) {
      const dir = path.resolve(ctx.workspace, ".noticode", "captures");
      await fsp.mkdir(dir, { recursive: true });
      const file = path.join(dir, `see-${Date.now()}.png`);
      await fsp.writeFile(file, buf);
      text = `Here is the current screen. Saved to ${file}.`;
    }
    return { text, images: [image] };
  },
};

export const screenReadText: NotiTool = {
  name: "screen_read_text",
  description:
    "Read all visible text on the screen with OCR and return each fragment with its absolute screen coordinates plus a ready-to-click center point. Use it to locate buttons, labels, fields and menu items so you can click them precisely instead of guessing.",
  schema: z.object({
    display: z.number().int().optional().describe("Display index for multi-monitor setups."),
    region: RegionSchema.optional().describe("Restrict OCR to this rectangle (faster and more accurate). Returned coordinates are still absolute."),
    lang: z.string().optional().describe("Tesseract language(s), e.g. 'eng', 'rus', or 'eng+rus' (default: eng)."),
    min_confidence: z.number().optional().describe("Drop words below this confidence 0-100 (default: 50)."),
  }),
  handler: async (args, ctx: ToolContext) => {
    const raw = await grab(args.display);
    const buf = await processImage(raw, { region: args.region });
    const words = await ocrWords(buf, args.lang);
    const min = args.min_confidence ?? 50;
    const boxes = words
      .filter((w) => w.text && w.confidence >= min)
      .map((w) => toBox(w, args.region));
    if (!boxes.length) return "No readable text found on screen.";
    const lines = boxes.map(
      (b) => `"${b.text}" @ (${b.center.x}, ${b.center.y}) [${b.x},${b.y} ${b.width}x${b.height}] conf ${b.confidence}`,
    );
    const header = `Found ${boxes.length} text fragments (click any at its center point):`;
    return `${header}\n${lines.join("\n").slice(0, Math.max(0, ctx.maxOutputChars - header.length - 1))}`;
  },
};

export const screenFind: NotiTool = {
  name: "screen_find",
  description:
    "Find on-screen text/UI by a query string using OCR and return the best-matching locations with a ready-to-click center point. Use it to click things by name (e.g. 'Save', 'File', 'Sign in') instead of guessing coordinates.",
  schema: z.object({
    query: z.string().describe("Text to look for on screen (case-insensitive substring match)."),
    display: z.number().int().optional().describe("Display index for multi-monitor setups."),
    region: RegionSchema.optional().describe("Restrict the search to this rectangle. Returned coordinates are still absolute."),
    lang: z.string().optional().describe("Tesseract language(s), e.g. 'eng', 'rus', 'eng+rus' (default: eng)."),
    limit: z.number().int().optional().describe("Maximum matches to return (default: 5)."),
  }),
  handler: async (args) => {
    const raw = await grab(args.display);
    const buf = await processImage(raw, { region: args.region });
    const words = await ocrWords(buf, args.lang);
    const q = args.query.trim().toLowerCase();
    const matches = words
      .filter((w) => w.text && w.text.toLowerCase().includes(q))
      .map((w) => toBox(w, args.region))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, args.limit ?? 5);
    if (!matches.length) return `No on-screen match for "${args.query}".`;
    const lines = matches.map(
      (m, i) => `${i + 1}. "${m.text}" -> click (${m.center.x}, ${m.center.y}) [conf ${m.confidence}]`,
    );
    return `Matches for "${args.query}":\n${lines.join("\n")}`;
  },
};
