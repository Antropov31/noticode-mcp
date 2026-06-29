
# NotiCode

**The blue, MCP-native coding agent.**

Runs as an MCP server so Claude (or any MCP client) can plug in, chat, and let it edit files and drive your whole machine. Or DM it on Telegram and let it work while you're away from your desk.

 

---

## What is this?

NotiCode is an open AI coding agent in the spirit of OpenCode and Claude Code, with one twist: **it speaks [MCP](https://modelcontextprotocol.io) first.**

Launch it and it boots a Model Context Protocol server. Point Claude Desktop, Cursor, or any MCP-compatible client at it, and your assistant suddenly gains hands: it can read and write files, run shell commands, and inspect your system. Prefer a standalone experience? Run the built-in terminal chat agent and talk to NotiCode directly, or run it as a **Telegram bot** and message it from your phone.

It is blue. Not orange. On purpose.

## Do I need an API key?

**Only for `chat` and `telegram` modes.** Here's the split:

- `noticode mcp` / `noticode serve` -- **no key needed.** NotiCode is just the *hands*. The MCP client you connect (Claude, Cursor, ...) is the *brain* and brings its own model. NotiCode never calls an LLM itself in these modes.
- `noticode chat` / `noticode telegram` -- needs `ANTHROPIC_API_KEY`, because here NotiCode *is* the brain and calls Anthropic directly.

So if your goal is "start it, get a URL, paste it into an AI chat, let it control my PC" -- use `serve`. No key.

## Features

- **MCP server out of the box** -- one command exposes a full toolset over stdio or HTTP.
- **Connect by URL** -- `noticode serve` prints a server URL you paste straight into an MCP client.
- **Telegram bot** -- `noticode telegram` turns NotiCode into a bot you can DM. The model replies and drives your machine, so you can kick off work from your phone.
- **Real machine access** -- read/write/edit files, glob search, run any shell command, query system info.
- **Four ways to run it:**
  - `noticode mcp` -- serve tools to Claude and friends over stdio.
  - `noticode serve` -- serve tools over HTTP and print a connectable URL.
  - `noticode chat` -- an interactive agent loop in your terminal, powered by Claude.
  - `noticode telegram` -- a Telegram bot bridge to the same agent loop.
- **Workspace-scoped** -- operations are rooted at a workspace you choose.
- **Safety switches** -- disable writes or shell execution with one env var, gate the HTTP endpoint with a token, or lock the bot to a single chat.
- **Tiny + hackable** -- TypeScript, a clean tool registry, no framework lock-in.

## Quick start

```bash
git clone https://github.com/Antropov31/noticode-mcp.git
cd noticode-mcp
npm install
npm run build
```

Copy the env template (only needed if you want to tweak defaults or use `chat` / `telegram`):

```bash
cp .env.example .env
```

### Mode 1 -- MCP server over stdio (connect Claude Desktop)

```bash
node dist/index.js mcp
# or: npm run mcp
```

Register it with your MCP client. For **Claude Desktop**, add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "noticode": {
      "command": "node",
      "args": ["/absolute/path/to/noticode-mcp/dist/index.js", "mcp"],
      "env": {
        "NOTICODE_WORKSPACE": "/absolute/path/to/your/project"
      }
    }
  }
}
```

Restart Claude, and NotiCode's tools show up. No API key required.

### Mode 2 -- MCP server over HTTP (connect by URL)

This is the "start it, get a URL, paste into a chat" flow. **No API key needed.**

```bash
node dist/index.js serve
# or: npm run serve
```

You'll see something like:

```
  ▸█ NotiCode
  the blue coding agent · MCP-native

  MCP server URL  http://127.0.0.1:4319/mcp
  workspace: /home/you/project
  auth: none · bound to 127.0.0.1
  Paste this URL into your MCP client (HTTP transport) and it gets hands on this machine.
```

Paste that URL into any MCP client that supports the **HTTP (Streamable HTTP) transport** (e.g. Cursor, Cline, or Claude via a custom connector). The assistant connects and can now act on your machine through NotiCode.

Knobs (env or `.env`):

- `NOTICODE_HOST` -- host to bind (default `127.0.0.1`, localhost only).
- `NOTICODE_PORT` -- port (default `4319`).
- `NOTICODE_TOKEN` -- set it to require `Authorization: Bearer <token>` on every request.

> Want a client on another machine to reach it? Keep the bind on localhost and put a tunnel in front (e.g. `cloudflared` or `ngrok`), and set `NOTICODE_TOKEN` so it isn't wide open. Exposing raw shell access on a public URL with no token is asking for trouble.

### Mode 3 -- Terminal chat agent

```bash
node dist/index.js chat
# or: npm run chat
```

This mode talks to the model itself, so it needs `ANTHROPIC_API_KEY` in your `.env`. It plans, calls its own tools, and reports back.

```
  ▸█ NotiCode
  the blue coding agent · MCP-native

you › create a python script that prints the fibonacci sequence and run it
noti › Done. Wrote fib.py and ran it -- output: 0 1 1 2 3 5 8 13 21 34
```

### Mode 4 -- Telegram bot

DM NotiCode from your phone and let it work on the machine it's running on. Needs `ANTHROPIC_API_KEY` and `TELEGRAM_BOT_TOKEN`.

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token into `TELEGRAM_BOT_TOKEN`.
2. (Recommended) Message [@userinfobot](https://t.me/userinfobot) to get your chat ID, and set `TELEGRAM_CHAT_ID` to lock the bot to just you.
3. Run it:

```bash
node dist/index.js telegram
# or: npm run telegram
```

Now text your bot. Every message runs through the same agent loop as `chat`, so it can read/write files and run commands, then reply in the thread. Commands: `/start` (intro) and `/reset` (clear the conversation context).

> Heads up: the bot has the same machine access as every other mode. Always set `TELEGRAM_CHAT_ID` so only you can drive it, and lean on `NOTICODE_ALLOW_SHELL` / `NOTICODE_ALLOW_WRITE` if you want to limit what it can do.

## Tools

| Tool | What it does |
| --- | --- |
| `fs_read` | Read a text file, optionally a line range. |
| `fs_write` | Create or overwrite a file (makes parent dirs). |
| `fs_edit` | Exact-match string replacement inside a file. |
| `fs_list` | List files and directories under a path. |
| `fs_search` | Glob for files, optionally grep their contents. |
| `shell_exec` | Run any shell command on the host. |
| `sys_info` | OS, CPU, memory, user, workspace. |
| `tg_send` | Send a message to the user on Telegram. |
| `tg_read` | Read recent incoming Telegram messages. |

All tools are defined once in `src/tools/` and shared by the stdio server, the HTTP server, the chat agent, and the Telegram bot. Adding a tool is a few lines. The `tg_*` tools work in any mode (including `mcp` / `serve`) as long as `TELEGRAM_BOT_TOKEN` is set -- handy for letting a connected MCP client ping you on Telegram.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | -- | Required for `chat` and `telegram` modes. |
| `NOTICODE_WORKSPACE` | `cwd` | Root directory the agent operates in. |
| `NOTICODE_HOST` | `127.0.0.1` | Host the HTTP server (`serve`) binds to. |
| `NOTICODE_PORT` | `4319` | Port for the HTTP server (`serve`). |
| `NOTICODE_TOKEN` | -- | Optional bearer token to protect the HTTP endpoint. |
| `NOTICODE_MODEL` | `claude-sonnet-4-20250514` | Model used in chat and telegram modes. |
| `NOTICODE_ALLOW_SHELL` | `true` | Set `false` to block shell execution. |
| `NOTICODE_ALLOW_WRITE` | `true` | Set `false` to make the agent read-only. |
| `NOTICODE_MAX_OUTPUT` | `30000` | Max chars returned per tool call. |
| `TELEGRAM_BOT_TOKEN` | -- | Bot token from @BotFather. Required for `telegram` and the `tg_*` tools. |
| `TELEGRAM_CHAT_ID` | -- | Optional. Locks the bot to one chat and is the default `tg_send` target. |

## Security

NotiCode can run arbitrary commands and modify files. That is the whole point, and also the whole risk. Run it against projects you trust, scope `NOTICODE_WORKSPACE` tightly, and flip `NOTICODE_ALLOW_SHELL=false` / `NOTICODE_ALLOW_WRITE=false` when you only need read access. When using `serve`, keep the bind on `127.0.0.1` and set `NOTICODE_TOKEN` before exposing it through any tunnel. When using `telegram`, always set `TELEGRAM_CHAT_ID` so a stranger who finds your bot can't drive your machine.

## Project structure

```
src/
  index.ts            CLI entry (mcp | serve | chat | telegram | help)
  config.ts           Env-based configuration
  theme.ts            Blue terminal palette + banner
  mcp/
    server.ts         buildMcpServer + stdio entry point
    http.ts           Streamable HTTP entry point (prints a URL)
  agent/
    core.ts           Shared agent loop (model + tool-use) used by chat and telegram
    agent.ts          Interactive terminal chat loop
    telegram-bot.ts   Telegram bot bridge to the agent loop
  tools/
    index.ts          Tool registry
    types.ts          Shared tool + context types
    filesystem.ts     fs_read / fs_write / fs_edit / fs_list / fs_search
    shell.ts          shell_exec
    system.ts         sys_info
    telegram.ts       tg_send / tg_read
```

## Roadmap

- [x] HTTP / Streamable HTTP transport in addition to stdio
- [x] Telegram bot bridge
- [ ] Streaming responses in chat mode
- [ ] Pluggable LLM providers (OpenAI, local models)
- [ ] Per-tool permission prompts
- [ ] Git-aware diffs before writes

## License

MIT © Antropov31
