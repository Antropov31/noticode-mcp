# Security model

AntroSwarm deliberately separates the public coordination plane from the privileged machine runner.

## Cloud

The cloud server stores coordination state and runner connection metadata. Use HTTPS/WSS in production. Set a strong `ANTRO_RUNNER_TOKEN`. Configure MCP authentication at the hosting/proxy layer or with `ANTRO_MCP_TOKEN` when your client can send a bearer token.

The JSON state contains hashed agent tokens but may contain repository names, task descriptions, messages and shared memory. Protect the state volume accordingly.

## Runner

The runner is powerful because it can modify a repository and run a configured build. It accepts commands only over the authenticated outbound WebSocket.

Default capabilities:

- create dedicated Git worktrees;
- read/list/write/exact-edit files under the configured workspace/worktree roots;
- git status/diff/commit/push;
- execute one **user-configured** build command.

Generic shell execution is off unless `ANTRO_RUNNER_ALLOW_EXEC=true`.

Even when enabled, the prefix/control-token filter is not a security sandbox. Package managers and Git have extensibility features capable of running code. For hostile/untrusted models, run the local runner in a VM/container/dedicated low-privilege OS account and use a limited Git credential.

## File reservations

Reservations reduce accidental agent conflicts, not malicious behavior. `runner_write` and `runner_edit` ask the coordinator whether another live reservation matches the relative path before dispatching the write. Raw commands executed through an explicitly enabled generic exec channel could bypass that protection.

## Secrets

Never put GitHub tokens, runner tokens or private MCP credentials into shared swarm memory/messages. Agent tokens returned by `swarm_join` should remain in the individual chat that owns them.
