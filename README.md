
# NotiCode

**The blue, MCP-native AI agent for your whole machine.**

Runs as an MCP server so Claude (or any MCP client) can plug in, chat, and let it edit files and drive your machine. DM it on Telegram. Or run **everything at once** and control one shared agent from your MCP client *and* your phone.

---

## What is this?

NotiCode is an open AI agent in the spirit of OpenCode and Claude Code, with one twist: **it speaks [MCP](https://modelcontextprotocol.io) first.**

It has hands. It can read/write files, run shell commands, inspect your system, **drive a headless browser**, **take screenshots and webcam photos**, **control your Home Assistant smart home**, **schedule recurring jobs**, and **message you on Telegram** (text and photos). Connect it to an MCP client, talk to it in your terminal, or DM the Telegram bot, all backed by the same toolset.

It is blue. Not orange. On purpose.

## The one-command setup: `all`

```bash
node dist/index.js all
# or: npm run all
```

This boots **everything in a single process**:

- the **HTTP MCP server** (prints a URL you paste into any MCP client),
- the **Telegram bot** (DM it from your phone),
- the **scheduler** (cron jobs that notify you when done).

They all share the same tools and workspace. So you can text the bot "измени мои файлы" / "edit my files and run the tests", *or* type the same thing into an MCP client, and the same agent does the work on the same machine. Needs `ANTHROPIC_API_KEY` (for the bot) and `TELEGRAM_BOT_TOKEN` (to enable Telegram); the HTTP server and scheduler run even without them.

## Do I need an API key?

- `noticode mcp` / `noticode serve` -- **no key.** NotiCode is just the *hands*; the MCP client you connect brings the *brain*.
- `noticode chat` / `noticode telegram` / `noticode all` -- needs `ANTHROPIC_API_KEY`, because here NotiCode calls the model itself.

## Modes

| Command | What it does | Needs key? |
| --- | --- | --- |
| `all` | HTTP MCP + Telegram bot + scheduler, one process, shared agent. | Yes (for bot) |
| `mcp` | MCP server over stdio (connect Claude Desktop). | No |
| `serve` | MCP server over HTTP, prints a connectable URL. | No |
| `chat` | Interactive terminal agent. | Yes |
| `telegram` | Telegram bot only. | Yes |

## Quick start

```bash
git clone https://github.com/Antropov31/noticode-mcp.git
cd noticode-mcp
npm install
npx playwright install chromium   # only if you want the browser_* tools
npm run build
cp .env.example .env               # fill in keys you want to use
```

Then pick a mode, e.g. the full stack:

```bash
npm run all
```

### Connect Claude Desktop (stdio)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "noticode": {
      "command": "node",
      "args": ["/absolute/path/to/noticode-mcp/dist/index.js", "mcp"],
      "env": { "NOTICODE_WORKSPACE": "/absolute/path/to/your/project" }
    }
  }
}
```

### Connect by URL (HTTP)

`npm run serve` (or `all`) prints something like `http://127.0.0.1:4319/mcp`. Paste it into any MCP client that supports the HTTP (Streamable HTTP) transport.

### Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather), put the token in `TELEGRAM_BOT_TOKEN`.
2. (Recommended) Get your chat ID from [@userinfobot](https://t.me/userinfobot) and set `TELEGRAM_CHAT_ID` to lock the bot to just you.
3. `npm run telegram` (or `npm run all`). Text the bot. `/start` and `/reset` are supported.

## Tools

| Tool | What it does |
| --- | --- |
| `fs_read` / `fs_write` / `fs_edit` | Read, create/overwrite, exact-match edit files. |
| `fs_list` / `fs_search` | List dirs; glob + grep file contents. |
| `shell_exec` | Run any shell command on the host. |
| `sys_info` | OS, CPU, memory, user, workspace. |
| `tg_send` / `tg_send_photo` / `tg_read` | Message the user on Telegram (text/photo), read incoming messages. |
| `notify` | Send a task/event notification (via Telegram, or logged). |
| `ha_states` / `ha_call_service` | List Home Assistant entities; control devices and scenes. |
| `browser_navigate` / `browser_click` / `browser_type` / `browser_eval` / `browser_screenshot` | Drive a headless Playwright browser. |
| `screen_capture` / `webcam_capture` | Screenshot the desktop / snap a webcam photo (saved as PNG). |
| `schedule_add` / `schedule_list` / `schedule_cancel` | Cron jobs that run a command, an agent prompt, or a reminder. |

Image tools save a PNG and return its path; send it on with `tg_send_photo`. All tools are defined once in `src/tools/` and shared by every mode.

## Scheduler

`schedule_add` takes a cron expression and a job `type`:

- `shell` -- run a command; you get the output when it finishes.
- `prompt` -- run an agent instruction (only in `all`/`chat` with an API key).
- `notify` -- a plain reminder.

Results are pushed to you via Telegram when configured. Example: "every weekday at 9am, pull the repo and run tests" becomes a `shell` job on `0 9 * * 1-5`.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | -- | Required for chat / telegram / all. |
| `NOTICODE_WORKSPACE` | `cwd` | Root directory the agent operates in. |
| `NOTICODE_HOST` / `NOTICODE_PORT` | `127.0.0.1` / `4319` | HTTP server bind. |
| `NOTICODE_TOKEN` | -- | Optional bearer token for the HTTP endpoint. |
| `NOTICODE_MODEL` | `claude-sonnet-4-20250514` | Model for chat/telegram/all. |
| `NOTICODE_ALLOW_SHELL` | `true` | `false` to block shell execution. |
| `NOTICODE_ALLOW_WRITE` | `true` | `false` to make the agent read-only. |
| `NOTICODE_MAX_OUTPUT` | `30000` | Max chars returned per tool call. |
| `TELEGRAM_BOT_TOKEN` | -- | Bot token from @BotFather. |
| `TELEGRAM_CHAT_ID` | -- | Lock the bot to one chat; default notify target. |
| `HOME_ASSISTANT_URL` | -- | Base URL of your Home Assistant. |
| `HOME_ASSISTANT_TOKEN` | -- | Long-lived access token for Home Assistant. |

## Security

NotiCode runs arbitrary commands, edits files, drives a browser, sees your screen and camera, and can control your home. That power is the point and the risk. Scope `NOTICODE_WORKSPACE` tightly, flip `NOTICODE_ALLOW_SHELL` / `NOTICODE_ALLOW_WRITE` to `false` when you only need read access, keep the HTTP bind on `127.0.0.1` and set `NOTICODE_TOKEN` before tunneling, and **always set `TELEGRAM_CHAT_ID`** so a stranger who finds your bot can't drive your machine.

## Project structure

```
src/
  index.ts              CLI entry (all | mcp | serve | chat | telegram | help)
  config.ts             Env-based configuration
  theme.ts              Blue terminal palette + banner
  runner/
    all.ts              Unified mode: HTTP MCP + Telegram bot + scheduler
  mcp/
    server.ts           buildMcpServer + stdio entry point
    http.ts             Streamable HTTP entry point (prints a URL)
  agent/
    core.ts             Shared agent loop (model + tool-use)
    agent.ts            Interactive terminal chat
    telegram-bot.ts     Telegram bot bridge to the agent loop
  scheduler/
    scheduler.ts        Cron scheduler runtime
  tools/
    index.ts            Tool registry
    types.ts            Shared tool + context types
    filesystem.ts       fs_read / fs_write / fs_edit / fs_list / fs_search
    shell.ts            shell_exec
    system.ts           sys_info
    telegram.ts         tg_send / tg_send_photo / tg_read
    notify.ts           notify
    home-assistant.ts   ha_states / ha_call_service
    browser.ts          browser_navigate / click / type / eval / screenshot
    capture.ts          screen_capture / webcam_capture
    scheduler.ts        schedule_add / schedule_list / schedule_cancel
```

## Roadmap

- [x] HTTP / Streamable HTTP transport in addition to stdio
- [x] Telegram bot bridge
- [x] Unified `all` mode
- [x] Browser automation, screen/webcam capture, Home Assistant, scheduler
- [ ] Streaming responses in chat mode
- [ ] Pluggable LLM providers (OpenAI, local models)
- [ ] Per-tool permission prompts
- [ ] Git-aware diffs before writes

## License

MIT © Antropov31
