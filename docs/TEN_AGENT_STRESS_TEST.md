# AntroSwarm 10-agent stress test

This scenario validates the Control Center, reconnect-safe joins, durable command fanout, task/worktree isolation, and coordination with ten independent agent chats.

## What this test can and cannot guarantee

AntroSwarm can keep agent identity, commands, tasks, locks, barriers, and worktrees durable across reconnects. It can long-poll commands while an ordinary ChatGPT turn remains active.

An ordinary ChatGPT browser tab cannot be externally awakened after its turn has ended. For a truly permanent unattended worker, use a persistent agent runtime/API client later. The browser-chat worker loop is a best-effort stress-test mode, not a daemon guarantee.

## 1. Start cloud, runner, and tunnel

Run the AntroSwarm cloud and local runner. The runner should prefer `ANTRO_CLOUD_URL=http://127.0.0.1:4320` when cloud and runner are on the same PC, so a temporary public tunnel is only used by remote MCP clients.

Open `/dashboard` and verify the runner is connected.

## 2. Create ten independent chats

Use a fresh swarm ID, for example `mod-stress-10-1`, with `expected_agents: 10`.

Each chat must generate its own random `join_key` once and reuse it if `swarm_join` is retried. This makes join idempotent and prevents duplicate agents after network retries.

Common bootstrap prompt:

```text
Use AntroSwarm Test.

This is a NEW independent chat. Do not reuse an old agent_id.
Generate one random UUID-like join_key now and keep it for all join retries in this chat.

Join:
swarm_id: mod-stress-10-1
expected_agents: 10
goal: Together design and implement a new Minecraft mod. Independently inspect the project, communicate findings, choose roles yourselves, split work, avoid file conflicts, review each other, and reach a working build.
repo: <local project name>
join_key: <your unique key>

After joining, call swarm_sync. Do not start implementation until 10 agents are connected. Once all 10 are present, enter worker mode and wait for Control Center commands.
Never push unless the operator explicitly asks.
```

The server rejects an 11th new identity when the swarm capacity is already 10. Retrying with the same `join_key` resumes the existing logical agent instead of creating a duplicate.

## 3. Put all chats into worker mode

```text
Keep your existing AntroSwarm identity. Do not call swarm_join again.
Enter worker mode:
- repeatedly call swarm_wait with wait_ms=20000;
- when a command arrives, call swarm_ack;
- execute it;
- for long work periodically call swarm_command_heartbeat;
- report done/failed with swarm_report;
- immediately return to swarm_wait while this turn remains active.
```

## 4. Broadcast one autonomous project goal

From Control Center select the new swarm, target `All agents`, and send a single goal-oriented prompt. Do not preassign roles if the purpose is to test self-organization.

Example:

```text
Together build a new Minecraft mod from this local project. First independently inspect the code and propose ideas. Share findings, agree on one product direction, create a dependency-aware task plan, divide work across all 10 agents, use separate worktrees and path reservations, implement in parallel, review each other, and finish with a clean build and QA checklist. Do not push to GitHub.
```

## 5. What to watch in Control Center

- 10/10 agents connected and online during active polling.
- No duplicate logical agents after join retries.
- Broadcast command fans out to ten independent deliveries.
- Delivery transitions: `queued -> delivered -> running -> done/failed`.
- A disconnected delivery returns to `queued` after its lease expires instead of becoming permanently stuck.
- Failed deliveries can be retried from Control Center.
- Tasks distribute across agents without one agent claiming everything.
- File reservations prevent overlapping edits.
- Barriers release at the intended participant count.
- Runner remains connected even if the public MCP tunnel changes.

## 6. Failure injection

During the test, deliberately close or disconnect one worker after it receives a command but before it reports completion. After the command lease expires, reconnect that same chat with its existing identity or the same `join_key`. The command should become available again rather than remain stuck forever.

Also retry `swarm_join` in one chat with the same `join_key`: total agent count must remain 10.

## Pass criteria

The test passes when all ten agents receive the broadcast, coordinate a nontrivial division of work, use isolated worktrees, survive at least one reconnect/retry event without duplicate identity or lost command, complete their work, and produce a reviewed build/QA result.
