## 5. The Sync Protocol

Two phases: context assembly at session start, then continuous writeback via file watcher throughout the session. No dependency on a session-end hook — knowledge flows back to the canonical store incrementally, as the agent works.

### 5.1 Context assembly (session start)

```
Session provisioner calls Knowledge Fabric:
  fabric.assemble context(session_id, task, agent, product, role)

Knowledge Fabric:
  1. Queries knowledge_items for the relevant slice
  2. Converts each item to its target format (TOON or markdown)
  3. Writes files to the workspace directory
  4. Writes .fabric/manifest.json with item versions
  5. Starts file watcher on knowledge/ and work/ directories
  6. Returns the workspace path to the session provisioner
```

The workspace is now a live-syncing working copy. The agent starts working immediately; the file watcher handles the rest.

### 5.2 Continuous writeback (during session)

A file watcher (e.g., `inotify` on Linux, `FSEvents` on macOS, or a polling fallback in containers) monitors the `knowledge/` and `work/` directories for changes. When a file is written:

```
File watcher detects change in knowledge/ or work/:
  1. Debounce: wait 500ms for additional writes to settle
  2. For knowledge/ changes:
     a. Modified files → diff against assembled version
     b. New files → new knowledge_items rows (status: CAPTURED)
     c. Deleted files → flag for facilitator review (not auto-deleted)
     d. For each changed item:
        - Read current version from knowledge_items
        - Compare to manifest version
        - If versions match → apply update, bump version, update manifest
        - If versions differ → conflict (see §6)
     e. On successful write → push update via WebSocket to open Knowledge view tabs
  3. For work/ changes:
     a. Link artifacts to the task record incrementally
     b. Update session notes
```

The agent has no awareness of the sync. It reads and writes files normally. The file watcher is invisible infrastructure.

### 5.3 Session close

When a session ends (normally or abruptly), the Knowledge Fabric:

```
1. Stops the file watcher
2. Runs one final writeback pass (catches any writes between the last
   watcher event and shutdown)
3. Records session outcome in the sessions table
4. Cleans up the workspace directory
```

Because writeback is continuous, the final pass is a lightweight delta — usually zero changes. **If the agent crashes or the session terminates abruptly, almost all knowledge is already synced.** The worst case is losing the last 500ms of writes (the debounce window), not an entire session's worth.

### 5.4 Why continuous sync

The original design was session-boundary sync: assemble context at start, write back at end. This had a critical fragility — it depended on a clean session-end hook that may never fire if the agent crashes, the container is killed, or the harness doesn't support pre-termination callbacks. With continuous sync: no data loss on crash; humans see progress in real time; no hoarding incentive; simpler harness adapter contract (the adapter doesn't need to guarantee a session-end callback).

### 5.5 Session notes and knowledge promotion

When a session ends, the agent writes **session notes** — a structured summary of what happened, what was learned, and what should be promoted:

```
Session notes (written by agent to work/session-notes.md):
