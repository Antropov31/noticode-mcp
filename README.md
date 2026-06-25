<div align="center">

# NotiCode

**The blue, MCP-native coding agent.**

Runs as an MCP server so Claude (or any MCP client) can plug in, chat, and let it edit files and drive your whole machine.

</div>

---

## What is this?

NotiCode is an open AI coding agent in the spirit of OpenCode and Claude Code, with one twist: **it speaks [MCP](https://modelcontextprotocol.io) first.**

Launch it and it boots a Model Context Protocol server. Point Claude Desktop, Cursor, or any MCP-compatible client at it, and your assistant suddenly gains hands: it can read and write files, run shell commands, and inspect your system. Prefer a standalone experience? Run the built-in terminal chat agent and talk to NotiCode directly.

It is blue. Not orange. On purpose.

## Do I need an API key?

**Only for `chat` mode.** Here's the split:

- `noticode mcp` / `noticode serve` — **no key needed.** NotiCode is just the *hands*. The MCP client you connect (Claude, Cursor, ...) is the *brain* and brings its own model. NotiCode never calls an LLM itself in these modes.
- `noticode chat` — needs `ANTHROPIC_API_KEY`, because here NotiCode *is* the brain and calls Anthropic directly.

So if your goal is "start it, get a URL, paste it into an AI chat, let it control my PC" — use `serve`. No key.

## Features

- **MCP server out of the box** — one command exposes a full toolset over stdio or HTTP.
- **Connect by URL** — `noticode serve` prints a server URL you paste straight into an MCP client.
- **Real machine access** — read/write/edit files, glob search, run any shell command, query system info.
- **Three ways to run it:**
  - `noticode mcp` — serve tools to Claude and friends over stdio.
  - `noticode serve` — serve tools over HTTP and print a connectable URL.
  - `noticode chat` — an interactive agent loop in your terminal, powered by Claude.
- **Workspace-scoped** — operations are rooted at a workspace you choose.
- **Safety switches** — disable writes or shell execution with one env var, or gate the HTTP endpoint with a token.
- **Tiny + hackable** — TypeScript, a clean tool registry, no framework lock-in.

## Quick start

```bash
git clone https://github.com/Antropov31/noticode-mcp.git
cd noticode-mcp
npm install
npm run build
```

Copy the env template (only needed if you want to tweak defaults or use `chat`):

```bash
cp .env.example .env
```

### Mode 1 — MCP server over stdio (connect Claude Desktop)

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

### Mode 2 — MCP server over HTTP (connect by URL)

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

- `NOTICODE_HOST` — host to bind (default `127.0.0.1`, localhost only).
- `NOTICODE_PORT` — port (default `4319`).
- `NOTICODE_TOKEN` — set it to require `Authorization: Bearer <token>` on every request.

> Want a client on another machine to reach it? Keep the bind on localhost and put a tunnel in front (e.g. `cloudflared` or `ngrok`), and set `NOTICODE_TOKEN` so it isn't wide open. Exposing raw shell access on a public URL with no token is asking for trouble.

### Mode 3 — Terminal chat agent

```bash
node dist/index.js chat
# or: npm run chat
```

This mode talks to the model itself, so it needs `ANTHROPIC_API_KEY` in your `.env`. It plans, calls its own tools, and reports back.

```
  ▸█ NotiCode
  the blue coding agent · MCP-native

you › create a python script that prints the fibonacci sequence and run it
noti › Done. Wrote fib.py and ran it — output: 0 1 1 2 3 5 8 13 21 34
```

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

All tools are defined once in `src/tools/` and shared by the stdio server, the HTTP server, and the chat agent. Adding a tool is a few lines.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | Required for `chat` mode only. |
| `NOTICODE_WORKSPACE` | `cwd` | Root directory the agent operates in. |
| `NOTICODE_HOST` | `127.0.0.1` | Host the HTTP server (`serve`) binds to. |
| `NOTICODE_PORT` | `4319` | Port for the HTTP server (`serve`). |
| `NOTICODE_TOKEN` | — | Optional bearer token to protect the HTTP endpoint. |
| `NOTICODE_MODEL` | `claude-sonnet-4-20250514` | Model used in chat mode. |
| `NOTICODE_ALLOW_SHELL` | `true` | Set `false` to block shell execution. |
| `NOTICODE_ALLOW_WRITE` | `true` | Set `false` to make the agent read-only. |
| `NOTICODE_MAX_OUTPUT` | `30000` | Max chars returned per tool call. |

## Security

NotiCode can run arbitrary commands and modify files. That is the whole point, and also the whole risk. Run it against projects you trust, scope `NOTICODE_WORKSPACE` tightly, and flip `NOTICODE_ALLOW_SHELL=false` / `NOTICODE_ALLOW_WRITE=false` when you only need read access. When using `serve`, keep the bind on `127.0.0.1` and set `NOTICODE_TOKEN` before exposing it through any tunnel.

## Project structure

```
src/
  index.ts            CLI entry (mcp | serve | chat | help)
  config.ts           Env-based configuration
  theme.ts            Blue terminal palette + banner
  mcp/
    server.ts         buildMcpServer + stdio entry point
    http.ts           Streamable HTTP entry point (prints a URL)
  agent/
    agent.ts          Interactive chat loop with Anthropic tool-use
  tools/
    index.ts          Tool registry
    types.ts          Shared tool + context types
    filesystem.ts     fs_read / fs_write / fs_edit / fs_list / fs_search
    shell.ts          shell_exec
    system.ts         sys_info
```

## Roadmap

- [x] HTTP / Streamable HTTP transport in addition to stdio
- [ ] Streaming responses in chat mode
- [ ] Pluggable LLM providers (OpenAI, local models)
- [ ] Per-tool permission prompts
- [ ] Git-aware diffs before writes

## License

MIT © Antropov31
