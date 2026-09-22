# Sync and Conflict Resolution

Knowledge flows from agent sandboxes back to the canonical store in two phases: context assembly at session start, then **continuous writeback via file watcher** for the rest of the session. There is no dependency on a session-end hook — writes sync incrementally as the agent works, and disposing the ingestion handle at session end is only a final flush.

This doc owns the write flow: watcher, writeback rules, what a version conflict does, and where a document's history lives. What gets assembled and the sandbox tree layout are owned by [Knowledge Movement](the-knowledge-fabric-how-knowledge-moves.md); store semantics — the tree, its invariants, scope — by [the canonical store](the-canonical-store.md).

## 1. Two phases

**Phase 1 — assembly (session start).** Context assembly writes the pre-baked document bundle as real files into the sandbox — the real tree, not a set of layer buckets — and records every document's version and path in `.fabric/manifest.json`.

**Phase 2 — continuous writeback (during session).** A watcher starts separately from assembly, calling the filesystem watcher directly. From that point the sandbox is a live-syncing working copy. The agent has no awareness of the sync — it reads and writes files normally; the watcher lives in the server process.

## 2. The watcher

- Native `fs.watch(dir, { recursive: true })` — FSEvents/inotify under the hood (`layers/agent-orchestration/run-orchestration/src/file-watcher.ts`).
- **No polling fallback.** `fs.watch` only.
- **500ms debounce** — writes settle before a flush (`file-watcher.ts`, `DEFAULT_DEBOUNCE_MS`).
- Watches only `knowledge/` and `work/`; `context/` is read-only reference material — today just `session.toon`.

The watcher doesn't process changes itself — it debounces filesystem events and emits one `sandbox_writeback_changes_detected` event per flush onto the shared EventBus.

## 3. Writeback rules

A subscriber processes the batch, creates before modifies before deletes (so a move — a create whose id suffix matches a path this same batch also deletes — retargets the manifest before the paired delete runs and finds nothing left to do), calling the real `edit_document`/`search_documents` actions as the session's own agent (`layers/agent-orchestration/run-orchestration/src/writeback-processor.ts`):

| Change | Behavior |
|---|---|
| New directory in `knowledge/` | A new `document` row, status `proposed`, empty body, parented under its own parent directory's document, inheriting that parent's scope — "a folder is a document" |
| New file in `knowledge/`, filename carries an id suffix already tracked at a different path | **A move, not a create.** The document is reparented (through the same cycle/depth/scope invariants as any reparent) to the directory the file now sits in; a file dropped straight at the `knowledge/` root detaches to the top level |
| New file in `knowledge/`, no matching id suffix | A new `document` row (`as:"document"`), status `proposed`, parented under its wrapping directory's document — or, for a file dropped straight at the `knowledge/` root, under the session's own task/thread parent if it has one |
| Modified file in `knowledge/` | `edit_document` with the manifest's tracked `version`. Version matches → the edit lands, manifest advances to the new version. Version is stale → the edit is refused (problem `stale`) and **discarded, not applied and not recorded as a conflict** — a document has no conflict object. The manifest is re-read and fast-forwarded to the document's current durable version so the same session's next save carries the fresh version instead of clashing again |
| Deleted file in `knowledge/` | The manifest simply stops tracking it. The document row itself is **untouched** — a file removed from a sandbox is not a document deletion |
| `work/session-notes.md` or `work/task-notes.md` | Upserted into `sessions.notes` |
| Anything else under `work/` | Ignored |

Batch pairing of a matched delete+create was rejected as the move-detection mechanism — it fails a directory rename (which is N deletes plus N creates that never line up 1:1) and edit-while-move. Ordering the passes, not pairing entries, is what makes moves safe.

**There is a live websocket push on document writes.** Every `document.created`/`document.changed` row also pushes once on two topics — `document:<id>` and the broad `documents` topic — so an open Knowledge view and an open document both update without a refetch (§7 of [the canonical store](the-canonical-store.md), architecture-level detail in `layers/core-api/document/src/document-actions.ts`).

## 4. What a version conflict does

Concurrent edits are rare but possible — a human editing a document in the Knowledge view while an agent's session assembled the same document, or two concurrent sessions assembling the same one. There is no per-field merge, no `knowledge_conflicts` table, and nothing to review: **a stale write is refused and discarded**, full stop (founder ruling — a document has no conflict object). The loser's text never lands; the manifest advances to the durable version so the same session's next save doesn't immediately re-collide. Whoever's edit committed first wins; the other side has to look at the current body again and decide whether to redo the change.

## 5. History

There is no `knowledge_edit_log`, no `knowledge_access_log`, no separate edit-log table at all. Every create and edit — from a human in the Knowledge view, an agent's own `edit_document` tool call, or a writeback-processed file — writes one row to the shared `changes` table (`object='document'`, `kind='created'|'changed'`, `actor`, a JSON diff, a timestamp). That table is the document's full history; reading a document's past means reading its `changes` rows, not a second log. A move — a reparent — is an ordinary `changed` row on `parent_kind`/`parent_id`, and a scope change is an ordinary `changed` row on `scope_kind`/`scope_id`, cascaded to any wider descendant as its own `changed` row with the same actor and timestamp (see [the canonical store](the-canonical-store.md#the-tree)) — every field edit, tree position included, goes through the same one diff mechanism.

## 6. Session close

When a session ends — normally or by crash:

1. Dispose the ingestion handle — one final writeback flush.
2. CAS-write the terminal state/outcome to the sessions row.
3. Remove the sandbox directory.

Because writeback is continuous, the final pass is a lightweight delta — usually zero changes. Worst-case loss on a hard crash is the **500ms debounce window**, not a session's worth of work.

## 7. Why continuous sync, not session-boundary

The original design was session-boundary sync: assemble at start, write back at end. That depends on a clean session-end hook that may never fire — the agent crashes, the process is killed, the harness has no pre-termination callback. Continuous sync eliminates the fragility: no data loss on crash, humans see progress in near-real time, no hoarding incentive, and the harness adapter contract stays simple (no session-end callback obligation).

## 8. Why not CRDTs or OT

CRDTs (Yjs, Automerge) solve keystroke-level real-time collaboration. HyperIdle's concurrent edit rate is near zero — the median session has zero version clashes. Paying that complexity cost for a problem that barely exists is over-engineering; refuse-and-discard on a stale version covers it. OT doesn't fit either: it requires a persistent client-server connection during editing, and agent sessions are disconnected — the agent works on local assembled files and syncs through the watcher. No CRDT/OT library is a dependency anywhere.

## 9. Deferred: real-time co-editing

Continuous watcher sync is near-real-time, not keystroke-level. If true real-time co-editing of a single document is ever needed (two humans, or human + agent, at the character level), Yjs can be layered on per editing session — Yjs handles the keystroke merge, the writeback processor handles the durable write. Purely additive: canonical store, sandbox layout, and manifest all stay as they are. Still not built.
