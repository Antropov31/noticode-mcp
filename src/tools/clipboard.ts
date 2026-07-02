import { z } from "zod";
import type { NotiTool } from "./types.js";
import { importOptional } from "./optional.js";

async function clip(): Promise<any> {
  return (await importOptional("clipboardy", "Run `npm install`.")).default;
}

export const clipboardRead: NotiTool = {
  name: "clipboard_read",
  description: "Read the current text contents of the system clipboard.",
  schema: z.object({}),
  handler: async (_args, ctx) => {
    const clipboard = await clip();
    const text: string = await clipboard.read();
    return text.slice(0, ctx.maxOutputChars) || "(clipboard is empty)";
  },
};

export const clipboardWrite: NotiTool = {
  name: "clipboard_write",
  description: "Replace the system clipboard contents with the given text.",
  schema: z.object({ text: z.string().describe("Text to copy to the clipboard.") }),
  handler: async (args) => {
    const clipboard = await clip();
    await clipboard.write(args.text);
    return `Copied ${args.text.length} characters to the clipboard.`;
  },
};
