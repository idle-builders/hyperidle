# Sync and Conflict Resolution

Knowledge flows from agent sandboxes back to the canonical store in two phases: context assembly at session start, then **continuous writeback via file watcher** for the rest of the session. There is no dependency on a session-end hook — knowledge syncs incrementally as the agent works, and `ingestion.dispose()` at session end is only a final flush (`packages/server/src/services/session-lifecycle.ts:270`).

This doc owns the write flow: watcher, writeback rules, conflict resolution, layer precedence, edit log. What gets assembled and the sandbox zone layout are owned by [the knowledge fabric](the-knowledge-fabric-how-knowledge-moves.md) §3; store semantics by [the canonical store](the-canonical-store.md).

## 1. Two phases

**Phase 1 — assembly (session start).** The session lifecycle calls `strategy.assembleContext(...)` (`session-lifecycle.ts:197`), which writes knowledge items as real files into the sandbox and records every item's version in `.fabric/manifest.json`. Selection, zones, and the manifest shape live in [the fabric doc](the-knowledge-fabric-how-knowledge-moves.md).

**Phase 2 — continuous writeback (during session).** The watcher is started *separately* by the session lifecycle via the Strategy port — `strategy.beginLearningIngestion(...)` (`session-lifecycle.ts:213`), not inside `assembleContext` (AK2 kernel/strategy decoupling; the sandbox path is an input to assembly, not its return value). From that point the sandbox is a live-syncing working copy. The agent has no awareness of the sync — it reads and writes files normally; the watcher lives in the server process.

## 2. The watcher

- Native `fs.watch(dir, { recursive: true })` — FSEvents/inotify under the hood (`packages/fabric/src/file-watcher.ts:118`).
- Explicit **polling fallback** for environments where `fs.watch` is unsupported (`packages/fabric/src/polling-watcher.ts:41`).
- **500ms debounce** — writes settle before a flush (`file-watcher.ts:23`, `DEFAULT_DEBOUNCE_MS`).
- Watches only `knowledge/` and `work/` (`packages/fabric/src/writeback.ts:74-76`); `context/` is read-only reference material.

## 3. Writeback rules

All in `packages/fabric/src/writeback.ts`:

| Change | Behavior |
|---|---|
| New file in `knowledge/` | New `knowledge_items` row, status `captured`, kind inferred from subdirectory (`decisions/` → decision, `failures/` → failure, `practices/` → pattern; default pattern) (`writeback.ts:165-179`) |
| Modified file in `knowledge/` | Optimistic version check against the manifest; match → update + bump version + update manifest; `VersionConflictError` → open `knowledge_conflicts` row, and the manifest is **fast-forwarded** to the current version so subsequent writes don't re-conflict (`writeback.ts:196-248`) |
| Deleted file in `knowledge/` | Flagged as an open conflict record (`proposedBody: "[DELETED]"`) for facilitator review — never auto-deleted (`writeback.ts:252-280`) |
| `work/session-notes.md` or `work/task-notes.md` | Upserted into `sessions.notes` (`writeback.ts:104`, `:283-287`) |
| Anything else under `work/` | Ignored (`writeback.ts:110-114`). Incremental artifact-to-task linking is **not implemented**; filesystem capture-back is a separate seam (see [run-unit-model](../architecture/run-unit-model.md)) |

Successful updates emit `knowledge_item_updated` (`packages/fabric/src/events.ts:4`), bridged via `setKnowledgeEventBus` to the shared EventBus as `knowledge_updated` (`packages/shared/src/events.ts:142`) and pushed over WebSocket to open Knowledge views (`packages/server/src/services/ws-broadcaster.ts:45`).

## 4. Conflict resolution

Concurrent edits are rare but possible. Two scenarios:

- **Agent vs. human** — a human edits an item in the Knowledge view (writes go directly to the canonical store) while an agent's session assembled the same item. The agent's next writeback to that file hits a version mismatch.
- **Agent vs. agent** — two concurrent sessions assembled the same item; the first writeback wins, the second finds the mismatch.

Resolution is **per-field last-writer-wins with escalation** — not CRDTs, not whole-document locking (`packages/fabric/src/conflict-resolution.ts`):

**Structured kinds** (`pattern`, `anti_pattern`, `decision`, `failure` — `STRUCTURED_KINDS`, `conflict-resolution.ts:9-14`): field-by-field merge (`mergeStructuredEdits`, `conflict-resolution.ts:62`). Fields changed by only one editor apply cleanly; fields changed by both apply the last write **and** record a conflict for review. Most of the time two editors touch different fields and both edits land.

**Prose kinds** (`brief`, `principle`, `reflection`, `focus` — everything not structured): no auto-merge. The older version stays active; the newer is stored as an open conflict record (`resolveProse`, `conflict-resolution.ts:186-228`). Prose conflicts need judgment — a facilitator (or human) resolves from a diff.

**Open conflicts block promotion** — `canPromote` (`conflict-resolution.ts:231`) and `promote` throws `"open conflict(s) exist"` (`conflict-resolution.ts:260-266`). Conflicts surface as review items in the facilitator's queue (`packages/server/src/tools/create-conflict-review.ts`; see [facilitators](facilitators.md)).

Table shapes (`knowledge_conflicts`, `knowledge_edit_log`) are owned by `packages/db/src/schema.ts` — not restated here.

## 5. Layer precedence

When guidance conflicts across layers, higher layers win: **L4 > L3 > L2 > L1** (see [the five layers](the-five-layers.md)). Enforced at **promotion time**: `detectLayerContradiction` (`packages/fabric/src/promotion-pipeline.ts:267`) checks a proposed L3 practice against same-topic L4 principles; a structural contradiction flags the item for review instead of auto-promoting it (`promotion-pipeline.ts:458-470`). Contradiction flagging at context-assembly time is **not implemented**. Within a layer, the `confidence` field weights items in relevance scoring — owned by [relevance and attention](relevance-and-attention.md).

## 6. Edit log

Every edit to a knowledge item is logged to `knowledge_edit_log` alongside the update — the human edits directly in the Knowledge view and the API writes the log entry (`packages/server/src/routes/knowledge.ts:642`). Live `editType` values: `create`, `update`, `scope_change`, `merge`, `split`, `archive`, `flag` (repository + API routes) plus `refinement` written by the auto-promotion pipeline as provenance (`promotion-pipeline.ts:594-603`). Facilitators review what humans correct; the promotion pipeline writes its own entries to keep status changes attributable.

## 7. Session close

When a session ends — normally or by crash (`endSession`/`crashSession`, `session-lifecycle.ts`):

1. Dispose the ingestion handle — one final writeback flush (`session-lifecycle.ts:270`; crash path wraps it defensively, `:364`).
2. CAS-write the terminal state/outcome to the sessions row.
3. Remove the sandbox directory (`session-lifecycle.ts:341`).

Because writeback is continuous, the final pass is a lightweight delta — usually zero changes. Worst-case loss on a hard crash is the **500ms debounce window**, not a session's worth of work.

## 8. Why continuous sync, not session-boundary

The original design was session-boundary sync: assemble at start, write back at end. That depends on a clean session-end hook that may never fire — the agent crashes, the process is killed, the harness has no pre-termination callback. Continuous sync eliminates the fragility: no data loss on crash, humans see progress in near-real time, no hoarding incentive, and the harness adapter contract stays simple (no session-end callback obligation).

## 9. Why not CRDTs or OT

CRDTs (Yjs, Automerge) solve keystroke-level real-time collaboration. HyperIdle's concurrent edit rate is near zero — the median session has zero conflicts. Paying that complexity cost for a problem that barely exists is over-engineering; per-field LWW plus escalation covers it. OT doesn't fit either: it requires a persistent client-server connection during editing, and agent sessions are disconnected — the agent works on local assembled files and syncs through the watcher. No CRDT/OT library is a dependency anywhere.

## 10. Deferred: real-time co-editing

Continuous watcher sync is near-real-time, not keystroke-level. If true real-time co-editing of a single document is ever needed (two humans, or human + agent, at the character level), Yjs can be layered on per editing session — Yjs handles the keystroke merge, the fabric handles the durable write. Purely additive: canonical store, sandbox layout, manifest, and conflict resolution all stay as they are. Still not built.
