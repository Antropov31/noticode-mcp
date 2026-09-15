# AntroSwarm Control Center

The Control Center is the operator UI for sending one prompt to all connected agents or a direct prompt to one agent without manually pasting the same text into every chat.

## Command lifecycle

Each dashboard command has one delivery state per target agent:

`queued -> delivered -> running -> done | failed`

Broadcasts therefore do not become globally "done" just because one agent finished. Every target is tracked independently.

Commands are durable in `.antroswarm/commands.json` and survive cloud process restarts when the same data directory is retained.

## Agent worker flow

A connected chat can be put into worker mode with a single prompt:

```text
Use AntroSwarm. You are already connected to the swarm.
Repeatedly call swarm_wait with wait_ms=20000.
When a command arrives, call swarm_ack, execute it, then call swarm_report with done or failed and a concise result.
Continue polling while this turn remains active. Do not create a new identity.
```

`swarm_next_command` is the immediate non-waiting version of `swarm_wait`.

Important: ordinary ChatGPT conversations still cannot be externally awakened after a turn has fully ended. The queue removes manual copy/paste and supports long polling while a turn is active, but a future persistent-agent runtime is still needed for true always-on workers.

## Dashboard

Open `/dashboard` on the AntroSwarm cloud endpoint. It shows swarms, agent presence, current tasks/branches, connected runners, recent commands and per-agent delivery state.

The command composer supports `All agents` or one selected agent.

If `ANTRO_MCP_TOKEN` is configured, dashboard and dashboard APIs accept the same token through `?token=...` for browser use or the normal `Authorization: Bearer ...` header.
