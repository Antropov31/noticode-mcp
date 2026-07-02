import { z } from "zod";
import type { NotiTool } from "./types.js";

export const notify: NotiTool = {
  name: "notify",
  description:
    "Send the user a notification about a task or event. The notification is logged on the server (stderr). Use this to report that a long-running task has finished.",
  schema: z.object({
    title: z.string().describe("Short notification title."),
    message: z.string().optional().describe("Optional details / body."),
  }),
  handler: async (args) => {
    const text = `\uD83D\uDD14 ${args.title}${args.message ? `\n${args.message}` : ""}`;
    console.error(`[notify] ${text}`);
    return "Notification logged.";
  },
};
