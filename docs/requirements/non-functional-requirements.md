## 5. Non-Functional Requirements

### NF-1: Performance

**NF-1.1** Review thread items must render within 200ms of opening.

**NF-1.2** Sidebar ambient updates (bet status, cost burn, blocker status) must propagate within 5 seconds of the underlying state change.

**NF-1.3** Session startup (Knowledge Fabric context assembly: querying `knowledge_items`, relevance scoring, writing workspace files including TOON packs and markdown, generating manifest, starting file watcher) must complete within 10 seconds for the laptop profile. Per-file incremental writeback (single file diff, version check, write to `knowledge_items`) must complete within 1 second. Final session-close pass must complete within 5 seconds.

### NF-2: Reliability

**NF-2.1** No silent data loss. If a session crashes, the last checkpoint (session notes written to the task) is recoverable.

**NF-2.2** Hitting WIP or cost limits produces visible thread items, never silent drops.

**NF-2.3** The system must gracefully degrade when the model API is unavailable (queue work, notify humans, pause non-essential routines).

### NF-3: Scalability

**NF-3.1** Support up to 5 concurrent products with 4–6 agents each (20–30 agents total) on the laptop profile.

**NF-3.2** Support up to 20 concurrent products (80–120 agents) on the VPS/cloud profiles.

**NF-3.3** SQLite must remain the viable default for the laptop and small-VPS profiles. Postgres is optional for deployments exceeding ~50 agents.

### NF-4: Extensibility

**NF-4.1** New agent types (specialist roles beyond Builder/Growth/Ops) can be added by creating a system prompt, assigning skills, and joining a team — no code changes to the process layer.

**NF-4.2** New skills can be added by dropping a skill package into the skills directory and getting human approval via a review thread.

**NF-4.3** New deployment profiles can be added by implementing the workspace interface (`spawn`/`exec`/`read`/`write`/`snapshot`/`destroy`) and the scheduling interface.

---
