import { z } from "zod";
import type { NotiTool } from "./types.js";
import { importOptional } from "./optional.js";

export const osNotify: NotiTool = {
  name: "os_notify",
  description:
    "Show a native desktop notification on the host (title + optional message). Use to get the user's attention on the machine itself.",
  schema: z.object({
    title: z.string().describe("Notification title."),
    message: z.string().optional().describe("Optional body text."),
  }),
  handler: async (args) => {
    const notifier = (await importOptional("node-notifier", "Run `npm install`.")).default;
    await new Promise<void>((resolve) => {
      notifier.notify({ title: args.title, message: args.message ?? "" }, () => resolve());
    });
    return "Desktop notification shown.";
  },
};
