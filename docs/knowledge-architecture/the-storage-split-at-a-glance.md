## 2. The Storage Split, at a Glance

All knowledge lives in a single canonical SQLite store (`knowledge_items` table — see §3). The Knowledge Fabric projects it into the right format for each reader:

```
Layer      Artifact type              Agent projection       Human projection
─────      ────────────               ────────────────       ────────────────
L4         principles, focus          markdown files         Knowledge view (factory scope)
L3         practices, anti-patterns   TOON packs (read)      Knowledge view (practice scope)
                                      + markdown (write)
L2         brief, brand, arch         markdown files         Knowledge view (product scope)
L2         tasks, decisions, state    session.toon pack      Work view
L1         task state, failures       session.toon pack      Work view (sampled)
L0         working context            session.toon pack      not shown
```

**Same data, two projections.** Agents get token-efficient TOON packs and plain files they can grep. Humans get a rich web UI with inline editing. The Knowledge Fabric syncs continuously — materialization at session start, then a file watcher writes back changes incrementally as the agent works.

**If a file is human-readable, that means a human will actually read it.** Not "could theoretically read." Will. If no human will ever read it, it has no business being markdown — that's just token waste and version-control noise.

---
