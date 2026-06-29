import { z } from "zod";
import type { NotiTool } from "./types.js";
import { callTelegram } from "./telegram.js";

export const notify: NotiTool = {
  name: "notify",
  description:
    "Send the user a notification about a task or event. Delivers via Telegram when a bot token + chat id are configured, otherwise logs on the server. Use this to report that a long task finished.",
  schema: z.object({
    title: z.string().describe("Short notification title."),
    message: z.string().optional().describe("Optional details / body."),
  }),
  handler: async (args, ctx) => {
    const text = `\uD83D\uDD14 ${args.title}${args.message ? `\n${args.message}` : ""}`;
    if (ctx.telegramToken && ctx.telegramChatId) {
      await callTelegram(ctx.telegramToken, "sendMessage", {
        chat_id: ctx.telegramChatId,
        text,
      });
      return "Notification sent via Telegram.";
    }
    console.error(`[notify] ${text}`);
    return "Notification logged (Telegram not configured).";
  },
};
