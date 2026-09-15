# Shared workspace mode

AntroSwarm 0.4 can run many agents against one physical project directory instead of creating Git worktrees.

## Enable

Set the local runner environment:

```env
ANTRO_WORKSPACE=C:\Users\Antropov31\IdeaProjects\AgentMods
ANTRO_WORKSPACE_MODE=shared
ANTRO_CLOUD_URL=http://127.0.0.1:4320
```

Restart the local runner after changing the mode.

## Behavior

- `runner_list`, `runner_read`, `runner_write`, `runner_edit`, `runner_build`, and optional `runner_exec` use the same `ANTRO_WORKSPACE` for every agent.
- No task or `runner_prepare_worktree` call is required to read the project.
- Git and worktree actions are rejected by the runner in shared mode.
- Every `runner_write` / `runner_edit` requires an active `swarm_reserve_paths` reservation that covers the file.
- Conflicting reservations are rejected before writes.
- `runner_read` returns a SHA-256 digest. Pass it back as `expected_sha256` to `runner_write` / `runner_edit` to reject stale overwrites.
- File mutations are serialized inside the local runner so two writes cannot physically execute at the same instant.

## Recommended agent loop

1. `swarm_sync`
2. inspect with `runner_list` / `runner_read`
3. coordinate ownership using `swarm_send`
4. `swarm_reserve_paths`
5. re-read the files you are about to change
6. write/edit with `expected_sha256`
7. release the reservation when the work is finished
8. `runner_build` at agreed synchronization points

## Ten-agent stress test

For ten agents editing one directory, use a new swarm with `expected_agents: 10` and a unique `join_key` per chat. Let the agents negotiate file ownership before implementation. Prefer narrow reservations such as `src/main/java/.../entity/**` over reserving the entire source tree.

The Control Center remains the operator view for agent presence, commands, messages, tasks, barriers, reservations, and failures.
