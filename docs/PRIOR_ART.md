# Prior art / design references

AntroSwarm was designed after surveying existing multi-agent coding coordination systems. The MVP is original TypeScript code; no source code was copied from the projects below. They are credited because their public designs strongly informed the architecture.

- **aweb** — independent runtimes/sessions connected to a shared coordination layer: https://github.com/awebai/aweb
- **MCP Agent Mail** — durable agent mail and file reservations: https://github.com/Dicklesworthstone/mcp_agent_mail
- **agent-mailbox-mcp** — MCP-native mail/tasks/handoffs/presence patterns: https://github.com/Kipachu-1/agent-mailbox-mcp
- **Beads** — dependency-aware task graph / ready-work semantics: https://github.com/gastownhall/beads
- **Gas Town / Gas City** — role/controller/reconciliation patterns for agent fleets: https://github.com/gastownhall/gastown and https://github.com/gastownhall/gascity
- **worktree-mcp** — worktree lifecycle as a first-class agent primitive: https://github.com/broskees/worktree-mcp
- **Overstory / Warren** — isolated worker trees, mail and merge-oriented control planes: https://github.com/jayminwest/overstory and https://github.com/jayminwest/warren
- **OpenAI Symphony** — project tracker as control plane, isolated workspaces and proof/PR workflow: https://github.com/openai/symphony

The key AntroSwarm-specific choice is combining those coordination ideas with a **reverse local runner** and a **one-MCP-many-logical-identities model** aimed at manually opened ordinary chat sessions.
