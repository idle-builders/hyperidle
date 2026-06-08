## 13. Summary

1. **One canonical store.** All knowledge lives in a single `knowledge_items` table in SQLite. No split across multiple databases and file trees.
2. **Two projections.** The Knowledge Fabric projects the store into rich web UI for humans (the Knowledge view) and materialized file workspaces for agents (TOON packs + markdown).
3. **Continuous sync.** Knowledge is materialized at session start, then written back incrementally via file watcher. Optimistic concurrency with per-field last-writer-wins for the rare conflict.
4. **Three views for humans**: Conversations (messaging, reviews), Work (bets, tasks), Knowledge (wiki — practice, product, and factory scope). Plus the Rail. See `HUMAN_INTERFACE_LAYER.md` for full specs. <!-- @lore AD8a: historical — Rail removed in U6 -->
5. **A family of facilitator agents** — Product Manager per product, Practice Facilitator per community, assistant at the factory — continuously organizes information, scores it for human attention, and routes the right question to the right view at the right time.
6. **Every information item has a state** (captured → provisional → needs-human → validated → active → stale → archived) and an attention score. Most items never need a human. The ones that do carry exactly the signal humans add value on.
7. **Knowledge flows up through promotion**: L1 discoveries → L3 practices → L4 principles. Failures travel the same path as anti-patterns.
8. **Layer precedence: L4 > L3 > L2 > L1.** Higher layers are more absolute.
9. **Edit log for facilitator learning.** Every human edit is logged in `knowledge_edit_log` so facilitators can learn from corrections.

---
