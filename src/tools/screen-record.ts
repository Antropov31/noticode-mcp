import path from "node:path";
import fsp from "node:fs/promises";
import { spawn } from "node:child_process";
import { z } from "zod";
import type { NotiTool, ToolContext, ToolImage } from "./types.js";
import { processImage, toImage } from "./vision.js";

/** Resolve the ffmpeg binary: prefer ffmpeg-static if present, else system `ffmpeg`. */
async function ffmpegPath(): Promise<string> {
  try {
    const mod: any = await (new Function("m", "return import(m)") as (m: string) => Promise<any>)(
      "ffmpeg-static",
    );
    const p = mod?.default ?? mod;
    if (typeof p === "string" && p) return p;
  } catch {
    // fall through to system ffmpeg
  }
  return "ffmpeg";
}

/** Build platform-specific ffmpeg input args for grabbing the primary screen. */
function captureInputArgs(fps: number): string[] {
  const p = process.platform;
  if (p === "win32") {
    return ["-f", "gdigrab", "-framerate", String(fps), "-i", "desktop"];
  }
  if (p === "darwin") {
    // "1:none" = default screen capture device, no audio. Requires screen-recording permission.
    return ["-f", "avfoundation", "-framerate", String(fps), "-i", "1:none"];
  }
  // Linux / X11
  const display = process.env.DISPLAY || ":0.0";
  return ["-f", "x11grab", "-framerate", String(fps), "-i", display];
}

/** Run ffmpeg with the given args, rejecting on non-zero exit. */
function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    proc.on("error", (e) =>
      reject(new Error(`Could not start ffmpeg (${bin}). Install ffmpeg or add ffmpeg-static. ${e.message}`)),
    );
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}. ${stderr.slice(-500)}`)),
    );
  });
}

/** Extract up to `count` evenly-spaced keyframes from a recorded file. */
async function extractKeyframes(
  bin: string,
  file: string,
  dir: string,
  seconds: number,
  count: number,
): Promise<string[]> {
  const rate = Math.max(1, count) / Math.max(1, seconds); // frames per second to sample
  const pattern = path.join(dir, `key-${Date.now()}-%03d.png`);
  await runFfmpeg(bin, ["-y", "-i", file, "-vf", `fps=${rate}`, "-frames:v", String(count), pattern]);
  const base = path.basename(pattern).replace("%03d", "");
  const files = (await fsp.readdir(dir))
    .filter((f) => f.startsWith(base.slice(0, base.indexOf("."))) === false && f.includes("key-"))
    .map((f) => path.join(dir, f));
  // Robust fallback: just grab every key-*.png produced in this dir, sorted.
  const produced = (await fsp.readdir(dir))
    .filter((f) => f.endsWith(".png") && f.startsWith("key-"))
    .sort()
    .map((f) => path.join(dir, f));
  return (produced.length ? produced : files).slice(0, count);
}

export const screenRecord: NotiTool = {
  name: "screen_record",
  description:
    "Record the screen to an MP4 video for a fixed number of seconds. By default it also extracts evenly-spaced keyframes and returns them as inline images so the agent can directly SEE what happened over time, not just get a file path. Requires ffmpeg (bundled ffmpeg-static if installed, otherwise `ffmpeg` on PATH). On macOS, screen-recording permission is required.",
  schema: z.object({
    seconds: z.number().int().min(1).max(120).optional().describe("Recording length in seconds (default: 8, max: 120)."),
    fps: z.number().int().min(1).max(60).optional().describe("Frames per second (default: 15)."),
    return_frames: z
      .boolean()
      .optional()
      .describe("Extract keyframes from the recording and return them as inline images (default: true)."),
    frame_count: z
      .number()
      .int()
      .min(1)
      .max(24)
      .optional()
      .describe("How many keyframes to sample and return (default: 6, max: 24)."),
    scale: z.number().optional().describe("Downscale factor 0-1 for returned keyframes (default: 0.5)."),
  }),
  handler: async (args, ctx: ToolContext) => {
    const seconds = args.seconds ?? 8;
    const fps = args.fps ?? 15;
    const returnFrames = args.return_frames ?? true;
    const frameCount = Math.min(Math.max(args.frame_count ?? 6, 1), 24);
    const scale = args.scale ?? 0.5;
    const dir = path.resolve(ctx.workspace, ".noticode", "recordings");
    await fsp.mkdir(dir, { recursive: true });
    const file = path.join(dir, `screen-${Date.now()}.mp4`);
    const bin = await ffmpegPath();

    await runFfmpeg(bin, [
      "-y",
      ...captureInputArgs(fps),
      "-t",
      String(seconds),
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      file,
    ]);

    if (!returnFrames) return `Recorded ${seconds}s @ ${fps}fps to ${file}.`;

    const framesDir = path.join(dir, `frames-${Date.now()}`);
    await fsp.mkdir(framesDir, { recursive: true });
    const images: ToolImage[] = [];
    try {
      const keyframes = await extractKeyframes(bin, file, framesDir, seconds, frameCount);
      for (const kf of keyframes) {
        const buf = await fsp.readFile(kf);
        const small = await processImage(buf, { scale });
        images.push(toImage(small));
      }
    } catch {
      // Recording succeeded even if keyframe extraction failed; return the path.
      return `Recorded ${seconds}s @ ${fps}fps to ${file}. (Keyframe extraction failed.)`;
    }

    const text = `Recorded ${seconds}s @ ${fps}fps to ${file}. ${images.length} keyframes below.`;
    return images.length ? { text, images } : text;
  },
};
