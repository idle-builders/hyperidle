## 8. What This Architecture Does Not Include

- **A model-calling loop.** That's the harness.
- **A workflow engine or DAG executor.** Sequences emerge from task dependencies and handoffs.
- **MCP servers or protocol adapters.** Skills call CLIs and APIs directly.
- **A vector database.** pgvector on Postgres handles semantic search when needed; SQLite FTS5 is the default.
- **A separate auth service.** Tailscale + API keys for now.
- **A backlog.** Pitches live on the canvas; unpicked ones expire.
- **Multiple applications.** One app, two form factors.
- **Jira-style reporting.** The Rail and Coach thread are the human surfaces for status.

---
