# capture-writeback — Service-as-Product Audit (AU20)

**Layer:** agent-orchestration · **Owned tables:** none · **Current public exports:** 23 · **Own-service consumers:** 0 (boot-wired subscriber + one REST-route reader) · **Depends on:** `knowledge` (create/update/recordConflict, via DI port) · **Receives events from:** `filesystems`, `session-lifecycle`.

---

## 1. Existence / Consolidation Verdict — **CONSOLIDATE into `session-runtime`**

The package is not one product. It is **two unrelated EventBus subscribers stapled into one package** because AU19 moved both out of `packages/server` at the same time:

1. **Sandbox writeback** (`writeback.ts` + `writeback-subscriber.ts`) — subscribes to `sandbox_writeback_changes_detected`, turns a session's sandbox filesystem edits into canonical `knowledge` writes + session-notes updates. Depends on `knowledge` (port) and writes the `sessions` row's notes at teardown.
2. **Session activity buffer** (`session-activity-buffer.ts`) — an in-memory ring buffer subscribing to `tool_call_recorded` / `session_ended`, serving `getActivity(sessionId)` to the dial-in REST route. **Zero** relation to writeback, knowledge, or the manifest. Pure ephemeral read-model for a live-observation UI.

These share nothing — no types, no dependency, no data, no lifecycle contract — beyond "both are subscribers." That is convenience packaging, exactly the boundary-by-mechanism the frame rejects.

**Challenging AU19's "why separate" claim.** AU19 justifies the package as "the direct resolution of the `filesystems ⚠ capture-writeback` against-grain edge." That reasoning is invalid: the against-grain edge is resolved by the **EventBus inversion mechanism** (`filesystems` emits `sandbox_writeback_changes_detected`; an orchestration-layer subscriber consumes it) — *any* orchestration-layer subscriber resolves it equally. It justifies "a subscriber somewhere in the orchestration layer," never "a dedicated package." The inversion is preserved no matter which orchestration service hosts the handler. And the fact that a completely unrelated activity buffer was bundled in proves the boundary carries no product coherence.

**Both halves are session-runtime concerns.** Both are side-effects of a *running/ending agent session*:
- The activity buffer **observes a live session** (tool calls) and evicts on `session_ended`.
- Writeback **captures the session's sandbox back** at teardown — it is literally the capture half of session teardown, and `session-lifecycle` *already* owns the counterpart (`context.ingestion.dispose()` / `watcher.stop()` at session end, both normal and error paths, per `writeback-subscriber.ts`'s own `@lore`).

So the candidate-cluster steer is correct: **fold into `session-runtime`** (the proposed `run-orchestration` + `session-lifecycle` + `context-assembly` merge). session-runtime becomes the whole "admit → assemble → run → **observe** → **capture** → terminate a session" product; capture-writeback's two modules are its observe/capture facets. This owns 0 tables and has 0 own-consumers, so dissolving it loses no boundary anyone depends on.

**Not standalone:** zero tables, zero own-consumers, two incoherent halves, and the only stated separation reason (the inversion) is a mechanism not a boundary.

---

## 2. Deliberate Target Public API

Current 23 exports are ~18 leaked internals (helpers + granular DI sub-types + the buffer class + processing types) surfaced only because the barrel re-exports everything and tests import it. The real demand is tiny: **the composition root wants to (a) install this capability's subscribers and (b) read live activity for a route.** Design to that.

| # | Interface | Shape | Subsumes (current per-caller exports) | Why a meaningful shared capability |
|---|---|---|---|---|
| 1 | `registerSessionCapture` | `registerSessionCapture(deps: SessionCaptureDeps): Dispose` | `registerCaptureWriteback`, `CaptureWritebackSubscriberDeps`, and the manual `SessionActivityBuffer.start()/stop()` wiring | One boot call installs **all** session-scoped capture/observe subscribers (sandbox writeback + activity buffer) and returns one dispose. The composition root asks "wire this service's event handlers," not a menu of per-subscriber registrations. |
| 2 | `getSessionActivity` | `getSessionActivity(sessionId: string): ReadonlyArray<ActivityEntry>` | `SessionActivityBuffer` (class), `ToolCallData` | The dial-in read-model query — parameterized by `sessionId` (a filter), the general "read live activity for a session" shape. Hides the ring buffer entirely. `ActivityEntry` already lives in `@hyperidle/shared` (not re-exported here). |
| 3 | `SessionCaptureDeps` | `{ db; eventBus; knowledge: KnowledgeWriter }` (the injected `knowledge` port shape) | `CaptureWritebackDeps`, `CaptureWritebackKnowledgeWriter` (+ its 8 sub-types folded internal) | The single DI seam the composition root implements to inject `knowledge`. Preserves the no-cross-service-import rule with one interface instead of ten. |

**Target export count: 3** (down from 23). Everything else internal.

Internalized (0 public): `processWriteback`, `readManifest`, `writeManifest`, `isKnowledgePath`, `isSessionNotesPath`, `WritebackChange/Config/Result`, `SessionActivityBuffer`, `ToolCallData`, and the 8 granular `CaptureWriteback*` port sub-types (`CreateKnowledgeItemInput`, `UpdateResult`, `KnowledgeItem`, `KnowledgeKind`, `KnowledgeLayer`, `RecordConflictInput`, `Manifest`, `ManifestEntry`). None are consumed outside the package today except by its own tests — and tests never justify an export.

---

## 3. Inside Lens

- **Two internal modules stay** as internal implementation of session-runtime's observe/capture area: a pure `processWriteback` function (classification + manifest reconciliation) and the ring-buffer class. Both remain testable via package-internal imports without being public.
- **The knowledge DI port stays a seam** (one `KnowledgeWriter` interface) so `knowledge` is injected, not cross-imported — the discriminated `UpdateResult` (no `instanceof VersionConflictError` across the boundary) is kept internal.
- **The EventBus inversion stays** (`filesystems` emits; session-runtime subscribes) — unchanged by the merge.
- Because the public surface is only "install subscribers" + "read activity," internal changes — new path-classification rules, a new captured signal, manifest format tweaks — never ripple to any consumer.

## 4. Scaling Argument

The current shape grows a method per captured signal: writeback shipped `registerCaptureWriteback` + `CaptureWritebackSubscriberDeps`; the activity buffer then bolted on its own `SessionActivityBuffer` + `ActivityEntry` + `ToolCallData`; a third signal (cost samples, transcript capture) would add a third `register*` + `*Deps` + read helpers. That is linear method-per-intent sprawl.

The target scales sub-linearly:
- **Add a captured signal** (e.g. capture cost samples at teardown) → a new internal handler wired inside `registerSessionCapture`. **Zero new exports.**
- **Add a projection dimension** to the read (filter by tool name, time window) → an optional filter arg on `getSessionActivity`, not a new `getSessionActivityByTool`. Parameterized-by-filter absorbs the use case.
- Imagine dozens more session side-effects: `registerSessionCapture` still installs them all through one call; the surface stays at ~3. The rejected alternative (`registerCaptureWriteback` + `registerActivityBuffer` + `registerCostCapture` + a `*Deps` each) is precisely the `listActiveByTeam / listPinnedByHost` anti-pattern.

## 5. Key Collapses

1. **10 → 1 DI types.** The `CaptureWritebackKnowledgeWriter` port and its 8 referenced sub-types + `CaptureWritebackDeps` collapse to a single `SessionCaptureDeps` (with the writer shape inline). The composition root implements one interface, not imports ten.
2. **8 → 0 writeback internals.** `processWriteback`, `readManifest`, `writeManifest`, `isKnowledgePath`, `isSessionNotesPath`, `WritebackChange/Config/Result` become fully internal — the only public writeback entry is the subscriber, installed by `registerSessionCapture`.
3. **3 → 1 activity surface.** `SessionActivityBuffer` (class) + `ToolCallData` collapse behind one `getSessionActivity(sessionId)` read; `ActivityEntry` is dropped as a redundant re-export (canonical in `@hyperidle/shared`).
4. **2 → 1 registration.** `registerCaptureWriteback` + `CaptureWritebackSubscriberDeps` become the general `registerSessionCapture(deps)` that installs both subscribers.
5. **Package dissolved.** The whole `capture-writeback` boundary folds into `session-runtime`; the two modules become the observe/capture facets of the session-runtime product, co-located with the teardown code (`context.ingestion.dispose()`) they already couple to.
