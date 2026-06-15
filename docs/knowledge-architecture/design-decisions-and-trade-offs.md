## 11. Design Decisions and Trade-offs

**Why SQLite, not Postgres, as the canonical store?** SQLite is the right default: zero ops, single-file backup, fast reads, works on a laptop. The factory is built for small teams — the write throughput ceiling of SQLite (WAL mode, ~50K writes/sec) far exceeds anything a factory of <50 agents will produce. If a deployment grows beyond SQLite's comfort zone, the Postgres adapter extends to `knowledge_items` with the same schema.

**Why not CRDTs everywhere?** CRDTs (Yjs, Automerge) solve real-time keystroke-level collaboration. HyperIdle's concurrent edit rate is near zero — the median session has zero conflicts. Paying the complexity cost for a problem that barely exists is over-engineering. The upgrade path to Yjs for specific editing sessions (§8) gives us the option without baking it into the foundation.

**Why not OT (Operational Transform)?** OT requires a persistent connection between clients and server during editing. Agent sessions are disconnected — the agent works on local files, syncs at boundaries. OT doesn't fit the session model.

**Why context assembly over FUSE?** See §4.2. The short version: FUSE doesn't work in containers, turns file reads into DB queries, and breaks when the daemon crashes. Context assembly is boring and correct.

**Why three workspace zones instead of one?** Without the `context/` vs `knowledge/` vs `work/` split, the writeback can't distinguish "the agent read this file and happened to modify it while experimenting" from "the agent intentionally proposes this knowledge change." The zones make intent explicit, which makes the writeback reliable.

**Why continuous sync instead of session-boundary?** Session-boundary sync depends on a clean session-end hook — fragile when agents crash, containers are killed, or harnesses don't support pre-termination callbacks. Continuous sync via file watcher eliminates this fragility: knowledge flows back within seconds of being written. The worst-case data loss is the 500ms debounce window, not an entire session.

---
