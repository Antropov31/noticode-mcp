#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { startMcpServer } from "./mcp/server.js";
import { startHttpMcpServer } from "./mcp/http.js";
import { startChat } from "./agent/agent.js";
import { startTelegramBot } from "./agent/telegram-bot.js";
import { startAll } from "./runner/all.js";
import { banner } from "./theme.js";

const cmd = process.argv[2] ?? "mcp";
const config = loadConfig();

switch (cmd) {
  case "mcp":
    startMcpServer(config).catch((e) => {
      console.error(e);
      process.exit(1);
    });
    break;

  case "serve":
  case "http":
    startHttpMcpServer(config).catch((e) => {
      console.error(e);
      process.exit(1);
    });
    break;

  case "chat":
    startChat(config).catch((e) => {
      console.error(e);
      process.exit(1);
    });
    break;

  case "telegram":
  case "bot":
    startTelegramBot(config).catch((e) => {
      console.error(e);
      process.exit(1);
    });
    break;

  case "all":
    startAll(config).catch((e) => {
      console.error(e);
      process.exit(1);
    });
    break;

  case "version":
  case "--version":
  case "-v":
    console.log("noticode 0.1.0");
    break;

  case "help":
  case "--help":
  case "-h":
  default:
    console.log(banner);
    console.log(
      [
        "Usage: noticode <command>",
        "",
        "Commands:",
        "  all        Run everything together: HTTP MCP server + Telegram bot + scheduler.",
        "  mcp        Start the MCP server on stdio (default). Connect Claude or any MCP client.",
        "  serve      Start the MCP server over HTTP and print a server URL. No API key needed.",
        "  chat       Start the interactive terminal chat agent.",
        "  telegram   Run NotiCode as a Telegram bot you can DM from anywhere.",
        "  version    Print the version.",
        "  help       Show this help.",
        "",
        "Env:",
        "  ANTHROPIC_API_KEY     Required for chat, telegram, all. Not needed for mcp/serve.",
        "  NOTICODE_WORKSPACE    Root directory the agent operates in (default: cwd).",
        "  NOTICODE_HOST         Host the HTTP server binds to (default: 127.0.0.1).",
        "  NOTICODE_PORT         Port for the HTTP server (default: 4319).",
        "  NOTICODE_TOKEN        Optional bearer token to protect the HTTP endpoint.",
        "  NOTICODE_MODEL        Anthropic model (default: claude-sonnet-4-20250514).",
        "  NOTICODE_ALLOW_SHELL  'false' to disable shell execution.",
        "  NOTICODE_ALLOW_WRITE  'false' to disable file writes.",
        "  TELEGRAM_BOT_TOKEN    Bot token from @BotFather. Enables the bot + tg tools.",
        "  TELEGRAM_CHAT_ID      Lock the bot to one chat; default tg_send/notify target.",
        "  HOME_ASSISTANT_URL    Base URL of your Home Assistant (e.g. http://homeassistant.local:8123).",
        "  HOME_ASSISTANT_TOKEN  Long-lived access token for Home Assistant.",
        "",
      ].join("\n"),
    );
    break;
}
