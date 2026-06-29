import Anthropic from "@anthropic-ai/sdk";
import type { NotiConfig } from "../config.js";
import { muted, banner } from "../theme.js";
import { callTelegram } from "../tools/telegram.js";
import { buildAnthropicTools, buildContext, runTurn } from "./core.js";

const MAX_TG_LEN = 4000; // Telegram hard limit is 4096; leave headroom.

async function send(token: string, chatId: string, text: string): Promise<void> {
  // Telegram rejects messages over 4096 chars, so chunk long replies.
  for (let i = 0; i < text.length; i += MAX_TG_LEN) {
    const chunk = text.slice(i, i + MAX_TG_LEN);
    try {
      await callTelegram(token, "sendMessage", {
        chat_id: chatId,
        text: chunk,
        parse_mode: "Markdown",
      });
    } catch {
      // Fall back to plain text if Markdown parsing fails.
      await callTelegram(token, "sendMessage", { chat_id: chatId, text: chunk });
    }
  }
}

/**
 * Run NotiCode as a Telegram bot. The user DMs the bot, each message is fed
 * into the same agent loop the terminal chat uses, and the assistant's replies
 * (plus any tool work on the machine) come back in the chat.
 */
export async function startTelegramBot(config: NotiConfig): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Set ANTHROPIC_API_KEY to run the Telegram bot.");
    process.exit(1);
  }
  if (!config.telegramToken) {
    console.error("Set TELEGRAM_BOT_TOKEN to run the Telegram bot.");
    process.exit(1);
  }

  const token = config.telegramToken;
  const client = new Anthropic({ apiKey });
  const ctx = buildContext(config);
  const anthropicTools = buildAnthropicTools();

  // If TELEGRAM_CHAT_ID is set, only that chat may talk to the bot.
  const allowed = config.telegramChatId ? new Set([String(config.telegramChatId)]) : null;

  // One conversation history per chat.
  const histories = new Map<string, Anthropic.MessageParam[]>();

  const me = await callTelegram(token, "getMe", {});

  console.log(banner);
  console.log(muted(`Telegram bot live as @${me.username} \u00b7 workspace: ${config.workspace} \u00b7 model: ${config.model}`));
  console.log(muted(allowed ? `Locked to chat ${config.telegramChatId}` : "Open to any chat (set TELEGRAM_CHAT_ID to lock it down)"));
  console.log(muted("Press Ctrl+C to stop.\n"));

  let offset = 0;
  // Long-poll loop.
  for (;;) {
    let updates: any[];
    try {
      updates = (await callTelegram(token, "getUpdates", { offset, timeout: 30 })) as any[];
    } catch (e: any) {
      console.error(muted(`\u26a0 getUpdates: ${e?.message ?? e}`));
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    for (const u of updates) {
      offset = u.update_id + 1;
      const m = u.message;
      if (!m?.text) continue;

      const chatId = String(m.chat.id);
      if (allowed && !allowed.has(chatId)) {
        await send(token, chatId, "Not authorized for this bot.");
        continue;
      }

      const text = m.text.trim();
      console.log(muted(`\u2709 [${chatId}] ${text}`));

      if (text === "/start") {
        await send(token, chatId, "NotiCode online. Send me anything and I'll work on the machine I'm running on. /reset clears context.");
        continue;
      }
      if (text === "/reset") {
        histories.delete(chatId);
        await send(token, chatId, "Context cleared.");
        continue;
      }

      const messages = histories.get(chatId) ?? [];
      messages.push({ role: "user", content: text });
      histories.set(chatId, messages);

      await callTelegram(token, "sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

      try {
        await runTurn(client, config, ctx, anthropicTools, messages, {
          onText: (t) => send(token, chatId, t),
          onTool: async (n) => {
            console.log(muted(`  \u2699 ${n}`));
            await callTelegram(token, "sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
          },
        });
      } catch (e: any) {
        await send(token, chatId, `\u26a0 ${e?.message ?? e}`);
      }
    }
  }
}
