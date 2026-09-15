# AntroSwarm

A shared coordination MCP for **multiple independent AI coding chats** plus an **outbound local runner** for your PC.

The target workflow is intentionally different from a normal multi-agent CLI. You manually open 2–8 ordinary ChatGPT/Codex/Claude sessions, connect all of them to the **same AntroSwarm MCP**, give them the same project goal, and let them become distinct logical agents inside one swarm.

```text
 Chat A ─┐
 Chat B ─┼──────────────┐
 Chat C ─┤              │ Streamable HTTP MCP
 Chat D ─┘              ▼
                    AntroSwarm Cloud
            ┌────────────┼────────────┐
            │ tasks/mail │ locks/RFCs │ memory/barriers
            └────────────┼────────────┘
                         │ WebSocket (outbound from your PC)
                         ▼
                   AntroSwarm Runner
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
      worktree A     worktree B     worktree C ...
          │              │              │
          └──────────────┴──────────────┘
                    your Git repo
```

The PC never needs an inbound port, public IP, ngrok, or Cloudflare Tunnel. The local runner connects **outbound** to the public coordination server and waits for structured commands.

## What is already in the MVP

- one shared MCP endpoint for many normal chat sessions;
- `swarm_join`: every chat gets a separate logical `agent_id` + secret token;
- compact `swarm_sync` snapshot to reduce context/token waste;
- dependency-aware tasks with atomic claims;
- durable typed agent-to-agent mail/broadcasts;
- file/glob reservations with TTL and conflict rejection;
- write-time reservation enforcement for runner file edits;
- architecture proposals, voting, quorum resolution;
- non-blocking synchronization barriers;
- shared project memory;
- agent presence/heartbeats;
- outbound WebSocket local runner;
- isolated Git worktree per agent/task;
- structured local file read/write/edit/list;
- structured Git status/diff/commit/push;
- configurable build command;
- optional generic execution, **disabled by default**;
- JSON persistence with atomic file replacement;
- CI + core coordination tests.

## 1. Run the cloud MCP

Use an always-reachable Node host (Railway, Fly.io, Render, a small VPS, Docker host, etc.). The important part is that **only the cloud service is public**.

```bash
npm install
npm run build
cp .env.example .env
```

Set at minimum:

```env
ANTRO_HOST=0.0.0.0
ANTRO_PORT=4320
ANTRO_RUNNER_TOKEN=a-long-random-secret
ANTRO_MCP_TOKEN=
```

Then:

```bash
npm start
```

Endpoints:

```text
GET  /health
POST /mcp       Streamable HTTP MCP
GET  /mcp       MCP stream/session transport
WS   /runner    local runner connection
```

If your MCP client supports bearer authentication, set `ANTRO_MCP_TOKEN`. For an initial private test you can leave it empty, but do **not** expose an unauthenticated production endpoint publicly.

### Docker

```bash
docker build -t antroswarm .
docker run --rm -p 4320:4320 \
  -e ANTRO_RUNNER_TOKEN=change-me \
  -v antroswarm-data:/app/.antroswarm \
  antroswarm
```

## 2. Run the local PC runner

Clone AntroSwarm on the machine that contains the project and set:

```env
ANTRO_CLOUD_URL=https://swarm.example.com
ANTRO_RUNNER_TOKEN=the-same-secret
ANTRO_WORKSPACE=D:\\downloads\\HollowSignal
ANTRO_RUNNER_ID=antropov-pc
ANTRO_BASE_REF=origin/main
ANTRO_BUILD_COMMAND=gradlew.bat clean build
```

Then:

```bash
npm run build
npm run runner
```

The runner dials `wss://swarm.example.com/runner` itself. Nothing connects directly to your PC.

## 3. Connect ChatGPT

Add the cloud `/mcp` URL as one remote MCP app. You do **not** need four separate identities/apps like aweb.

Open four normal chats. Give each chat the same bootstrap prompt from [`docs/AGENT_PROMPT.md`](docs/AGENT_PROMPT.md).

Each chat calls:

```text
swarm_join(
  swarm_id="hollowsignal-7",
  expected_agents=4,
  goal="Improve HollowSignal together",
  repo="Antropov31/HollowSignal"
)
```

and gets a different identity automatically:

```text
Chat A -> agent-81aecc12
Chat B -> agent-f043117c
Chat C -> agent-972ceb40
Chat D -> agent-0923fbca
```

The `agent_token` returned by `swarm_join` is the credential for that chat. It should stay in that chat and be supplied to later AntroSwarm calls.

## 4. Recommended swarm protocol

A useful four-agent run looks like this:

```text
JOIN
  ↓
independent repository analysis
  ↓
swarm_barrier(stage="analysis", expected=4)
  ↓
read all analyses / create task DAG
  ↓
atomic task claims
  ↓
path reservations
  ↓
runner_prepare_worktree
  ↓
parallel implementation
  ↕
mail / RFC proposals / dependency messages
  ↓
cross-review
  ↓
build
  ↓
commit + push each branch
  ↓
integration / PRs
```

`swarm_barrier` does not hold an HTTP call open for minutes. It returns `waiting` or `released`; agents can do safe read-only work and poll it later.

## 5. File ownership model

Example:

```text
Agent A reserves: src/main/java/**/entity/**
Agent B reserves: src/main/java/**/client/**
```

A conflicting reservation is rejected. More importantly, if Agent B tries `runner_write` on a path matched by Agent A's active reservation, the coordinator rejects the write **before the PC runner sees it**.

Agents should still use separate worktrees. Locks prevent conceptual overlap; worktrees prevent physical overwrites.

## 6. Local runner security

The first version intentionally does **not** expose your old NotiCode-style unrestricted `shell_exec` by default.

Structured actions are provided for filesystem, Git, worktrees and builds. Generic `runner_exec` requires:

```env
ANTRO_RUNNER_ALLOW_EXEC=true
```

and is still filtered by `ANTRO_RUNNER_ALLOWED_PREFIXES` plus simple shell-control/path-escape checks. This is a convenience guard, not a VM sandbox. Keep the runner under a dedicated OS account or VM if you need a stronger trust boundary.

See [`SECURITY.md`](SECURITY.md).

## Current limitations / next steps

This is an MVP intended to test the exact workflow before building a large platform.

- logical agent credentials are currently returned to the model and supplied explicitly on later tool calls;
- JSON persistence is single-process; move to Postgres/SQLite/WAL before horizontal scaling;
- file reservation overlap detection is deliberately conservative;
- agents cannot wake an already-finished ChatGPT turn; they must poll/sync during their active turn;
- PR creation is expected to use the chat's GitHub connector or normal GitHub tooling after `runner_git_push`;
- no web dashboard yet;
- no OAuth provider yet;
- no automatic lead process: coordination is distributed by default.

The point of v0.1 is to validate whether four independent ordinary chat sessions can actually cooperate productively on one real repository without a human copying messages between them.

## License

MIT. See [LICENSE](LICENSE).
