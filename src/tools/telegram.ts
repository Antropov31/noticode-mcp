import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { NotiTool, ToolContext } from "./types.js";

const API = "https://api.telegram.org";

function requireToken(ctx: ToolContext): string {
  if (!ctx.telegramToken) {
    throw new Error("Telegram is not configured. Set TELEGRAM_BOT_TOKEN.");
  }
  return ctx.telegramToken;
}

/** Thin wrapper around the Telegram Bot API (JSON methods). */
export async function callTelegram(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<any> {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as any;
  if (!data.ok) {
    throw new Error(`Telegram API error (${method}): ${data.description ?? res.status}`);
  }
  return data.result;
}

/** Upload a local file to a chat (multipart). `kind` picks the Telegram method. */
export async function sendFile(
  token: string,
  chatId: string,
  filePath: string,
  kind: "photo" | "document" = "document",
  caption?: string,
): Promise<any> {
  const buf = await fs.readFile(filePath);
  const form = new FormData();
  form.set("chat_id", String(chatId));
  if (caption) form.set("caption", caption);
  form.set(kind, new Blob([buf]), path.basename(filePath));
  const method = kind === "photo" ? "sendPhoto" : "sendDocument";
  const res = await fetch(`${API}/bot${token}/${method}`, { method: "POST", body: form });
  const data = (await res.json()) as any;
  if (!data.ok) {
    throw new Error(`Telegram API error (${method}): ${data.description ?? res.status}`);
  }
  return data.result;
}

export const tgSend: NotiTool = {
  name: "tg_send",
  description:
    "Send a message to the user on Telegram through the configured bot. Use this to notify, report progress, or reply on the go.",
  schema: z.object({
    text: z.string().describe("Message text to send. Markdown is supported."),
    chat_id: z
      .string()
      .optional()
      .describe("Target chat ID. Defaults to TELEGRAM_CHAT_ID when omitted."),
  }),
  handler: async (args, ctx) => {
    const token = requireToken(ctx);
    const chatId = args.chat_id || ctx.telegramChatId;
    if (!chatId) {
      throw new Error("No chat_id provided and TELEGRAM_CHAT_ID is not set.");
    }
    let msg: any;
    try {
      msg = await callTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: args.text,
        parse_mode: "Markdown",
      });
    } catch {
      // Retry without Markdown in case the text breaks the parser.
      msg = await callTelegram(token, "sendMessage", { chat_id: chatId, text: args.text });
    }
    return `Sent message ${msg.message_id} to chat ${chatId}.`;
  },
};

export const tgRead: NotiTool = {
  name: "tg_read",
  description:
    "Read the most recent incoming Telegram messages sent to the bot (getUpdates). Useful to see what the user wrote.",
  schema: z.object({
    limit: z.number().int().optional().describe("Max messages to return (default: 10)."),
  }),
  handler: async (args, ctx) => {
    const token = requireToken(ctx);
    const updates = (await callTelegram(token, "getUpdates", {
      limit: args.limit ?? 10,
      timeout: 0,
    })) as any[];
    const lines = updates
      .map((u) => u.message ?? u.edited_message)
      .filter(Boolean)
      .map((m: any) => {
        const who = m.from?.username ?? m.from?.first_name ?? "unknown";
        return `[chat ${m.chat?.id}] ${who}: ${m.text ?? "(non-text message)"}`;
      });
    return lines.join("\n") || "(no recent messages)";
  },
};
