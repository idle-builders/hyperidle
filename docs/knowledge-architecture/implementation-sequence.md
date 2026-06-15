## 12. Implementation Sequence

1. **`knowledge_items` table + basic CRUD API.** The canonical store. All other work depends on this.
2. **Context assembly engine.** Given a session context, produce a workspace directory. This unlocks agent sessions with real knowledge loading.
3. **File watcher + continuous writeback engine.** Watch `knowledge/` and `work/` for changes, diff and write back to `knowledge_items` incrementally. Includes debouncing, atomic-write handling, and polling fallback. This closes the sync loop.
4. **Knowledge view API + WebSocket push.** The read/write API for the human-facing Knowledge view, with real-time updates pushed when the file watcher writes back agent changes.
5. **Manifest + conflict detection.** Version tracking and the per-field LWW merge.
6. **Context assembly budget + relevance scoring.** The intelligence layer that decides what gets loaded.
7. **Git export routine.** Re-export human-readable files to Git after edits.

---
