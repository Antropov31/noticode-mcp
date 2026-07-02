import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { z } from "zod";
import type { NotiTool, ToolContext } from "./types.js";
import { importOptional } from "./optional.js";

async function outPath(ctx: ToolContext, prefix: string, ext: string): Promise<string> {
  const dir = path.resolve(ctx.workspace, ".noticode", "audio");
  await fsp.mkdir(dir, { recursive: true });
  return path.join(dir, `${prefix}-${Date.now()}.${ext}`);
}

export const micCapture: NotiTool = {
  name: "mic_capture",
  description:
    "Record audio from the host microphone for a number of seconds and save it as a WAV file. Returns the file path. Requires SoX installed (`sox`/`rec` on PATH).",
  schema: z.object({
    seconds: z.number().int().optional().describe("Recording length in seconds (default: 5)."),
  }),
  handler: async (args, ctx) => {
    const recorder = await importOptional(
      "node-record-lpcm16",
      "Run `npm install`, and install SoX (e.g. `brew install sox` / `apt install sox`).",
    );
    const seconds = args.seconds ?? 5;
    const file = await outPath(ctx, "mic", "wav");
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(file);
      const rec = recorder.record({ sampleRate: 16000, channels: 1, audioType: "wav" });
      rec.stream().on("error", reject).pipe(out);
      setTimeout(() => {
        rec.stop();
        resolve();
      }, seconds * 1000);
    });
    return file;
  },
};

export const audioPlay: NotiTool = {
  name: "audio_play",
  description: "Play an audio file (wav/mp3) through the host speakers.",
  schema: z.object({ path: z.string().describe("Path to the audio file to play.") }),
  handler: async (args, ctx) => {
    const playerFactory = (await importOptional("play-sound", "Run `npm install`.")).default;
    const player = playerFactory({});
    const full = path.resolve(ctx.workspace, args.path);
    await new Promise<void>((resolve, reject) => {
      player.play(full, (err: any) => (err ? reject(err) : resolve()));
    });
    return `Played ${full}.`;
  },
};
