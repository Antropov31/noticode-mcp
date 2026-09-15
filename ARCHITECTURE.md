# Architecture

## Why AntroSwarm exists

Most agent orchestrators own the model runtime: they spawn Claude Code/Codex processes, fork subagents, or call an LLM API. That is not the target here.

AntroSwarm assumes the expensive/smart agents already exist as **independent user-started sessions** (for example four normal ChatGPT chats). It provides the missing shared state and a safe bridge to the user's machine.

```text
                 independent model runtimes
          ┌─────────┬─────────┬─────────┬─────────┐
          │ Chat A  │ Chat B  │ Chat C  │ Chat D  │
          └────┬────┴────┬────┴────┬────┴────┬────┘
               └─────────┴─────┬────┴─────────┘
                               │ MCP
                               ▼
                     Coordination Plane
                     ------------------
                     logical identities
                     presence/heartbeat
                     dependency task DAG
                     durable mail
                     reservations
                     proposals/votes
                     barriers
                     shared memory
                               │
                     outbound command bus
                               │ WebSocket
                               ▼
                         Local Runner
                     ------------------
                     workspace boundary
                     agent worktrees
                     structured fs tools
                     structured git tools
                     build command
                     optional exec
```

## Identity

One remote MCP connection/account can host many logical agents. `swarm_join` creates a random `agent_id` and a random secret token. The server stores only SHA-256 of the token.

This intentionally avoids the aweb-style requirement that every UI chat be provisioned as a separate OAuth identity.

## Persistence

v0.1 uses a process-local `JsonStore` with a promise mutex and atomic temp-file rename. This makes the MVP dependency-light and sufficient for one cloud instance.

A production version should replace it with an interface-backed SQLite/Postgres implementation using real database transactions. The coordinator API is already separated from transport code to make this replacement straightforward.

## Coordination consistency

Operations that must be atomic (`claimTask`, reservation acquisition, barrier arrival, proposal votes) run under the store transaction mutex. This avoids the classic two-agents-claim-the-same-task race in a single server process.

## Reservations + worktrees

They solve different problems:

- reservation = social/architectural ownership and write guard;
- worktree = physical file isolation.

Using only reservations still allows bad local tools to overwrite working files. Using only worktrees still allows two agents to independently implement mutually incompatible changes. AntroSwarm uses both.

## Reverse runner

The cloud never dials the user's machine. The local process establishes a long-lived WebSocket to `/runner`, registers its capabilities, receives structured requests, executes them and returns results.

This removes the need for ngrok/Tunnel/inbound firewall rules and makes reconnect behavior explicit.

## Why no permanent leader

Four paid/valuable model sessions should not waste one full session as a non-coding manager. The MVP therefore uses distributed coordination: atomic state + proposals + quorum + barriers. A temporary integration/review role can be represented as an ordinary task.

A later version may add optional leader election/leases or an inexpensive local coordinator model.
