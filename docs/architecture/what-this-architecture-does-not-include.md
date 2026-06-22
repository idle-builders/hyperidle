## 8. What This Architecture Does Not Include

- **A model-calling loop.** That's the harness.
- **A workflow engine or DAG executor.** Sequences emerge from task dependencies and handoffs.
- **MCP servers for external tool discovery.** Skills call CLIs and APIs directly.
  (Exception: X2 MCP Bridge exposes HyperIdle's tools TO external harnesses
  via MCP — the inverse direction. See plans/X2/concept.md.)
  (Evolution: Track AN adds an *outbound* MCP client so HyperIdle can broker a
  user's connected external tools — riding the MCP standard, not reimplementing
  each service. See plans/AN/concept.md + the System Boundary below.)
- **A vector database.** pgvector on Postgres handles semantic search when needed; SQLite FTS5 is the default.
- **A separate auth service.** Tailscale + API keys for now.
- **A backlog.** Pitches live on the canvas; unpicked ones expire.
- **Multiple applications.** One app, two form factors.
- **Jira-style reporting.** Conversations (review threads) and Work (bet/task views) are the human surfaces for status.
- **A git forge, a CI engine, or deploy infrastructure.** HyperIdle rides the git substrate (code in a local-first, forge-optional git repo), integrates CI/registries/deploy/SSO via API/MCP, and triggers side-effects through connected systems — it never hosts repos, runs runners, or executes a deploy itself. See [System Boundary](./system-boundary.md). The trigger-not-executor seam is the [AL7 review execution loop](../../plans/AL7/concept.md); the tool-integration substrate is [Track AN](../../plans/AN/concept.md).

---
