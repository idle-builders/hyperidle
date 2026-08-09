# Sync and Conflict Resolution

Knowledge flows from agent sandboxes back to the canonical store in two phases: context assembly at session start, then **continuous writeback via file watcher** for the rest of the session. There is no dependency on a session-end hook — knowledge syncs incrementally as the agent works, and disposing the ingestion handle at session end is only a final flush (`endSession`, `layers/agent-orchestration/run-orchestration/src/transition-run.ts:176-179`).

This doc owns the write flow: watcher, writeback rules, conflict resolution, layer precedence, edit log. What gets assembled and the sandbox zone layout are owned by [the knowledge fabric](the-knowledge-fabric-how-knowledge-moves.md) §3; store semantics by [the canonical store](the-canonical-store.md).

## 1. Two phases

**Phase 1 — assembly (session start).** `assembleAgentContext` (`layers/agent-orchestration/run-orchestration/src/context.ts`) writes the pre-baked knowledge bundle as real files into the sandbox and records every item's version in `.fabric/manifest.json`. Selection, zones, and the manifest shape live in [the fabric doc](the-knowledge-fabric-how-knowledge-moves.md).

**Phase 2 — continuous writeback (during session).** `beginAgentWriteback` starts the watcher separately from assembly (`context.ts`), calling `ports.filesystems.startWatcher(...)`. From that point the sandbox is a live-syncing working copy. The agent has no awareness of the sync — it reads and writes files normally; the watcher lives in the server process. There is no "Strategy" port abstraction anymore — run-orchestration calls the filesystem watcher directly.

## 2. The watcher

- Native `fs.watch(dir, { recursive: true })` — FSEvents/inotify under the hood (`layers/agent-orchestration/run-orchestration/src/file-watcher.ts`).
- **No polling fallback.** The old fabric had one for environments where `fs.watch` is unsupported; it was not carried over — the relocated watcher is `fs.watch` only.
- **500ms debounce** — writes settle before a flush (`file-watcher.ts`, `DEFAULT_DEBOUNCE_MS`).
- Watches only `knowledge/` and `work/` (`isWatchedPath`, `file-watcher.ts:36-38`); `context/` is read-only reference material.

The watcher doesn't process changes itself — it debounces filesystem events and emits one `sandbox_writeback_changes_detected` event per flush (`framework/domain-model/src/events.ts:342-348`) onto the shared EventBus.

## 3. Writeback rules

A subscriber registered on `sandbox_writeback_changes_detected` (`registerCaptureWriteback`, `layers/agent-orchestration/run-orchestration/src/writeback-processor.ts:355-382`) processes the batch:

| Change | Behavior |
|---|---|
| New file in `knowledge/` | New `knowledge_items` row, status `captured`, kind inferred from subdirectory (`decisions/` → decision, `failures/` → failure, `practices/` → pattern; default pattern) (`handleCreate`, `writeback-processor.ts:216-250`) |
| Modified file in `knowledge/` | Optimistic version check against the manifest; match → update + bump version + update manifest; version mismatch → open `knowledge_conflicts` row, and the manifest is **fast-forwarded** to the current version so subsequent writes don't re-conflict (`handleModify`, `writeback-processor.ts:253-305`) |
| Deleted file in `knowledge/` | Flagged as an open conflict record (`proposedBody: "[DELETED]"`) for facilitator review — never auto-deleted (`handleDelete`, `writeback-processor.ts:308-332`) |
| `work/session-notes.md` or `work/task-notes.md` | Upserted into `sessions.notes` (`handleSessionNotes`, `writeback-processor.ts:335-339`) |
| Anything else under `work/` | Ignored. Incremental artifact-to-task linking is **not implemented**; filesystem capture-back is a separate seam (see [run-unit-model](../architecture/run-unit-model.md)) |

There is no live WebSocket push on knowledge writeback today. The old fabric emitted `knowledge_item_updated`, bridged to `knowledge_updated` on the shared EventBus and broadcast to open Knowledge views; that generic broadcast forwarder was deleted (AU21 §6 Decision L4) because it had zero real frontend consumers. Knowledge writes are visible on next fetch, not via a live socket push.

## 4. Conflict resolution

Concurrent edits are rare but possible. Two scenarios:

- **Agent vs. human** — a human edits an item in the Knowledge view (writes go directly to the canonical store) while an agent's session assembled the same item. The agent's next writeback to that file hits a version mismatch.
- **Agent vs. agent** — two concurrent sessions assembled the same item; the first writeback wins, the second finds the mismatch.

Resolution today is simpler than a full per-field merge: a version mismatch on `modify` or any `delete` always opens a `knowledge_conflicts` row (`recordConflict`, `layers/core-api/knowledge/src/knowledge-conflicts.ts:48-60`) rather than overwriting — the manifest fast-forwards to the current version so the same session doesn't re-conflict on its next writeback. The old fabric's kind-differentiated behavior (field-by-field merge for structured kinds, whole-document last-writer-wins for prose kinds) was not carried over; every conflict is recorded uniformly and surfaces for review.

**Open conflicts block auto-promotion** — checked inside the promotion transaction (`promoteToValidatedAuto`, `layers/core-api/knowledge/src/promotion-pipeline.ts`) and inside the manual promote path (`"open conflict blocks promotion to validated"`, `layers/core-api/knowledge/src/knowledge-repository.ts:1255`). Conflicts surface as review items in the facilitator's queue (`create_conflict_review` tool, `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts`; see [facilitators](facilitators.md)).

Table shapes (`knowledge_conflicts`, `knowledge_edit_log`) are owned by `framework/db/src/schema.ts` — not restated here.

## 5. Layer precedence

When guidance conflicts across layers, higher layers win: **L4 > L3 > L2 > L1** (see [the five layers](the-five-layers.md)). Enforced at **promotion time**: `detectLayerContradiction` (`layers/core-api/knowledge/src/promotion-pipeline.ts:264`) checks a proposed L3 practice against same-topic L4 principles; a structural contradiction flags the item for review instead of auto-promoting it (`promotion-pipeline.ts:451-461`). Contradiction flagging at context-assembly time is **not implemented**. Within a layer, the `confidence` field weights items in relevance scoring — owned by [relevance and attention](relevance-and-attention.md).

## 6. Edit log

Every edit to a knowledge item is logged to `knowledge_edit_log` alongside the update — the human edits directly in the Knowledge view and the API writes the log entry (`layers/core-api/src/routes/knowledge.ts`). Live `editType` values: `create`, `update`, `scope_change`, `merge`, `split`, `archive`, `flag` (repository + API routes) plus `refinement` written by the auto-promotion pipeline as provenance (`promotion-pipeline.ts:627`). Facilitators review what humans correct; the promotion pipeline writes its own entries to keep status changes attributable.

## 7. Session close

When a session ends — normally or by crash (`endSession`/`crashSession`, `layers/agent-orchestration/run-orchestration/src/transition-run.ts`):

1. Dispose the ingestion handle — one final writeback flush (`endSession`, `transition-run.ts:176-179`; crash path wraps it defensively, `crashSession`, `:255-261`).
2. CAS-write the terminal state/outcome to the sessions row.
3. Remove the sandbox directory (`transition-run.ts:239`).

Because writeback is continuous, the final pass is a lightweight delta — usually zero changes. Worst-case loss on a hard crash is the **500ms debounce window**, not a session's worth of work.

## 8. Why continuous sync, not session-boundary

The original design was session-boundary sync: assemble at start, write back at end. That depends on a clean session-end hook that may never fire — the agent crashes, the process is killed, the harness has no pre-termination callback. Continuous sync eliminates the fragility: no data loss on crash, humans see progress in near-real time, no hoarding incentive, and the harness adapter contract stays simple (no session-end callback obligation).

## 9. Why not CRDTs or OT

CRDTs (Yjs, Automerge) solve keystroke-level real-time collaboration. HyperIdle's concurrent edit rate is near zero — the median session has zero conflicts. Paying that complexity cost for a problem that barely exists is over-engineering; version-checked writeback with an escalation record covers it. OT doesn't fit either: it requires a persistent client-server connection during editing, and agent sessions are disconnected — the agent works on local assembled files and syncs through the watcher. No CRDT/OT library is a dependency anywhere.

## 10. Deferred: real-time co-editing

Continuous watcher sync is near-real-time, not keystroke-level. If true real-time co-editing of a single document is ever needed (two humans, or human + agent, at the character level), Yjs can be layered on per editing session — Yjs handles the keystroke merge, the writeback processor handles the durable write. Purely additive: canonical store, sandbox layout, manifest, and conflict resolution all stay as they are. Still not built.
