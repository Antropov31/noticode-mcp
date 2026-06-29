import Anthropic from "@anthropic-ai/sdk";
import type { NotiConfig } from "../config.js";
import { muted, sky, banner } from "../theme.js";
import { startHttpMcpServer } from "../mcp/http.js";
import { startTelegramBot } from "../agent/telegram-bot.js";
import { buildAnthropicTools, buildContext, runTurn } from "../agent/core.js";
import { scheduler } from "../scheduler/scheduler.js";
import { callTelegram } from "../tools/telegram.js";
import { closeBrowser } from "../tools/browser.js";

/**
 * Unified mode: run the HTTP MCP server, the Telegram bot, and the scheduler in
 * a single process, all sharing the same tools and config. Connect an MCP
 * client by URL and/or DM the bot -- both drive the exact same agent and can
 * touch your files, shell, browser, smart home, and more.
 */
export async function startAll(config: NotiConfig): Promise<void> {
  const ctx = buildContext(config);
  const hasModel = !!process.env.ANTHROPIC_API_KEY;
  const hasTelegram = !!config.telegramToken;

  // Notifier: prefer Telegram, fall back to server logs.
  const notifier = async (title: string, message?: string) => {
    const text = `\uD83D\uDD14 ${title}${message ? `\n${message}` : ""}`;
    if (hasTelegram && config.telegramChatId) {
      await callTelegram(config.telegramToken!, "sendMessage", {
        chat_id: config.telegramChatId,
        text,
      }).catch(() => {});
    } else {
      console.error(muted(`[notify] ${text}`));
    }
  };

  // Agent-backed runner for scheduled `prompt` jobs (needs an API key).
  let promptRunner: ((p: string) => Promise<string>) | undefined;
  if (hasModel) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const anthropicTools = buildAnthropicTools();
    promptRunner = async (prompt: string) => {
      const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
      let last = "";
      await runTurn(client, config, ctx, anthropicTools, messages, {
        onText: (t) => {
          last = t;
        },
      });
      return last || "(done)";
    };
  }

  scheduler.configure({ ctx, notifier, promptRunner });

  // Clean up the shared browser on exit.
  const shutdown = () => {
    void closeBrowser().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(banner);
  console.log(sky(" Unified NotiCode"));
  console.log(muted(" HTTP MCP server + Telegram bot + scheduler, one process, shared tools.\n"));

  // 1) HTTP MCP server (returns after it starts listening, prints its own URL).
  await startHttpMcpServer(config);

  // 2) Scheduler is live as soon as it's configured. Jobs are added at runtime.
  console.log(muted(" Scheduler ready (add jobs with schedule_add)."));

  // 3) Telegram bot. Long-polls forever, so it goes last.
  if (hasTelegram && hasModel) {
    console.log(muted(" Starting Telegram bot...\n"));
    await startTelegramBot(config);
  } else {
    const missing = [
      hasModel ? null : "ANTHROPIC_API_KEY",
      hasTelegram ? null : "TELEGRAM_BOT_TOKEN",
    ]
      .filter(Boolean)
      .join(" + ");
    console.log(
      muted(
        ` Telegram bot not started (need ${missing}). HTTP MCP + scheduler still running.`,
      ),
    );
    // Keep the process alive for the HTTP server and scheduler.
    await new Promise<void>(() => {});
  }
}
