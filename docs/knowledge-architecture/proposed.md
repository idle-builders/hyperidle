## Proposed
- Update practice "file-handling" → add 2MB chunk size guidance for Coolify
- New anti-pattern: "large chunk sizes on memory-constrained hosts"
```

The writeback parses these notes and creates the appropriate records: learned items → new `knowledge_items` rows with status `CAPTURED`; proposed edits → modifications to existing items through the normal writeback path; failures → linked to the task's failure records AND promoted as candidate anti-patterns.

The facilitator pipeline (§9) then scores, organizes, and routes these items through the CAPTURED → PROVISIONAL → VALIDATED lifecycle.

### 5.6 File watcher implementation notes

The watcher must handle: **debouncing** (agents often write files in bursts — a 500ms debounce window collapses rapid writes into one writeback event); **atomic writes** (some editors write to a temp file then rename — trigger on the rename); **container environments** (Docker volumes may not support `inotify` — fall back to polling every 2s); **concurrency** (the watcher runs in its own thread/process, writeback operations use a mutex to prevent concurrent writes to the same row); **manifest updates** (after each successful writeback, the manifest is updated with new version numbers for accurate conflict detection on subsequent writes).

---
