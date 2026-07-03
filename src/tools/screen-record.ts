import path from "node:path";
import fsp from "node:fs/promises";
import { spawn } from "node:child_process";
import { z } from "zod";
import type { NotiTool, ToolContext } from "./types.js";

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

export const screenRecord: NotiTool = {
  name: "screen_record",
  description:
    "Record the screen to an MP4 video for a fixed number of seconds and return the file path. Use it to review what happened over time (animations, playback, long actions) instead of single screenshots. Requires ffmpeg (bundled ffmpeg-static if installed, otherwise `ffmpeg` on PATH). On macOS, screen-recording permission is required.",
  schema: z.object({
    seconds: z.number().int().min(1).max(120).optional().describe("Recording length in seconds (default: 8, max: 120)."),
    fps: z.number().int().min(1).max(60).optional().describe("Frames per second (default: 15)."),
  }),
  handler: async (args, ctx: ToolContext) => {
    const seconds = args.seconds ?? 8;
    const fps = args.fps ?? 15;
    const dir = path.resolve(ctx.workspace, ".noticode", "recordings");
    await fsp.mkdir(dir, { recursive: true });
    const file = path.join(dir, `screen-${Date.now()}.mp4`);
    const bin = await ffmpegPath();

    const args2 = [
      "-y",
      ...captureInputArgs(fps),
      "-t",
      String(seconds),
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      file,
    ];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(bin, args2, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      proc.stderr?.on("data", (d) => {
        stderr += d.toString();
        if (stderr.length > 8000) stderr = stderr.slice(-8000);
      });
      proc.on("error", (e) =>
        reject(new Error(`Could not start ffmpeg (${bin}). Install ffmpeg or add ffmpeg-static. ${e.message}`)),
      );
      proc.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`ffmpeg exited with code ${code}. ${stderr.slice(-500)}`)),
      );
    });

    return `Recorded ${seconds}s @ ${fps}fps to ${file}.`;
  },
};
