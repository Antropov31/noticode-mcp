#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { startMcpServer } from "./mcp/server.js";
import { startHttpMcpServer } from "./mcp/http.js";
import { startChat } from "./agent/agent.js";
import { banner } from "./theme.js";

const cmd = process.argv[2] ?? "mcp";
const config = loadConfig();

function fail(e: unknown): never {
  console.error(e);
  process.exit(1);
}

switch (cmd) {
  case "mcp":
    startMcpServer(config).catch(fail);
    break;

  case "serve":
  case "http":
    startHttpMcpServer(config).catch(fail);
    break;

  case "chat":
    startChat(config).catch(fail);
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
        "  mcp      Start the MCP server on stdio (default). Connect Claude or any MCP client.",
        "  serve    Start the MCP server over HTTP and print a connectable URL (alias: http).",
        "  chat     Start the interactive terminal chat agent.",
        "  version  Print the version.",
        "  help     Show this help.",
        "",
        "Env:",
        "  ANTHROPIC_API_KEY     Required for chat mode (not needed for mcp/serve).",
        "  NOTICODE_WORKSPACE    Root directory the agent operates in (default: cwd).",
        "  NOTICODE_MODEL        Anthropic model (default: claude-sonnet-4-20250514).",
        "  NOTICODE_ALLOW_SHELL  'false' to disable shell execution.",
        "  NOTICODE_ALLOW_WRITE  'false' to disable file writes.",
        "  NOTICODE_HOST         Host to bind for `serve` (default: 127.0.0.1).",
        "  NOTICODE_PORT         Port for `serve` (default: 4319).",
        "  NOTICODE_TOKEN        Optional Bearer token required by `serve`.",
        "  HOME_ASSISTANT_URL    Home Assistant base URL (enables ha_* tools).",
        "  HOME_ASSISTANT_TOKEN  Home Assistant long-lived access token.",
        "",
      ].join("\n"),
    );
    break;
}
