## 8. What This Architecture Does Not Include

- **A model-calling loop.** That's the harness.
- **A workflow engine or DAG executor.** Sequences emerge from task dependencies and handoffs.
- **MCP servers for external tool discovery.** Skills call CLIs and APIs directly.
  (Exception: X2 MCP Bridge exposes HyperIdle's skill-tools TO external harnesses
  via MCP — the inverse direction. See plans/X2/concept.md.)
- **A vector database.** pgvector on Postgres handles semantic search when needed; SQLite FTS5 is the default.
- **A separate auth service.** Tailscale + API keys for now.
- **A backlog.** Pitches live on the canvas; unpicked ones expire.
- **Multiple applications.** One app, two form factors.
- **Jira-style reporting.** The Rail and assistant thread are the human surfaces for status. <!-- @lore AD8a: historical — Rail removed in U6 -->

---
