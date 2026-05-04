# L15 Architecture Critique

**Plan under review:** `docs/architecture-plans/L15-plan.md`
**Spec:** `docs/work-packages/TRACK-L.md` §L15 (lines 511–540)
**Approved design:** `docs/design-explorations/L15/approved.md`
**Shared contracts:** `docs/work-packages/SHARED.md`

---

## Round 1

### Score: 7.0/10  (SA:9 LI:9 AC:7 DM:7 N:9 MD:7 FMC:5 S:6 V:6)

| Dim | Score | One-line reason |
|---|---|---|
| Spec Alignment (SA) | 9 | Every L15 AC traces to a §6 task; no scope creep. |
| Layer Integrity (LI) | 9 | Web → server only via existing routes; shared/types live in correct packages. |
| API Contracts (AC) | 7 | Existing routes used unchanged; new client request/response shapes specified; one shape gap (`onSent.messageCount` ambiguous). |
| Data Model (DM) | 7 | No schema changes; `KanbanTask` fields specified, but the `ownerAgentId` source is undefined for the fixture (plan says "add to fixture rows" without a value). |
| Naming (N) | 9 | `requestableVerbsFor`, `formatRequestMessageBody`, `verbDisplayLabel` all honest; `task-verbs.ts` is a clean module name. |
| Module Depth (MD) | 7 | Five exports from `task-verbs.ts` is right-sized; `TaskRequestPopover` is a single-page composition (not over-extracted). |
| Failure-Mode Coverage (FMC) | 5 | Rate-limit deferred to follow-up without a clear gate; missing failure spec for the on-mount per-task fan-out (≤25 GETs); no behaviour spec when one of the per-task GETs fails; `EmptyState` for "no thread yet" not in current DS inventory. |
| Simplicity (S) | 6 | Two new web pages + one new shell composition + one new server test for what is "delete drag + ship a popover"; the `WorkTeamTaskThread` page is a thin re-mount of `ConversationsReview` — could call existing surface. |
| Verifiability (V) | 6 | Tests are named per task, but two protected/touched test files are wrong: `packages/design-system/src/__tests__/Tag.test.tsx` does NOT exist; the plan lists it as a target. `Kanban.keyboard-drag.test.tsx` is the file that contains the `draggable-task-…` selectors and is NOT mentioned in §6 task 8 (the plan only mentions `WorkKanban.grouped.test.tsx`). |

---

### CRITICAL

- **[plan §5.2 Design system]** Plan lists `packages/design-system/src/__tests__/Tag.test.tsx` as a file to edit. **That file does not exist** (`ls` confirms only `Tag.stories.tsx` exists; no co-located test). Either (a) create `Tag.test.tsx` as a NEW file (then list it as new, not modified) and specify the failing assertion shape, or (b) put the unread-variant test in an existing DS test file. Without this fix, /write-tests will silently produce a misnamed file or skip the test entirely. → **Fix:** edit §5.2 + §6 task 3 to mark `Tag.test.tsx` as NEW, and specify the assertion (`renders a leading dot span when unread is true; background applies primary tint`).

- **[plan §6 task 8 + §3 reconciliation row 7]** Plan only edits `WorkKanban.grouped.test.tsx` and creates `Kanban.test.tsx` — but `packages/web/src/__tests__/Kanban.keyboard-drag.test.tsx` is the file that exhaustively tests the DnD path (`onMoveTask`, `draggable-task-*` selectors, `resolveKanbanDrop`). Deleting the DnD scaffolding without addressing this file leaves a tree of dead-but-failing tests. **CC-007 (spec drift): the plan does not see this file.** → **Fix:** add a step 7.5 to §6: "Delete `Kanban.keyboard-drag.test.tsx` entirely (its assertions become invariants of the new no-op behaviour, covered by the new `Kanban.test.tsx` no-op assertion in step 7)." Add `Kanban.keyboard-drag.test.tsx` to §3 reconciliation row 7 explicitly. Add a new bullet in §9 Protected tests clarifying which DnD-related tests are explicitly being removed (so the protected-tests gate doesn't trip when this file vanishes).

- **[plan §8 Security]** The rate-limit row says "If `/architecture-critique` requires a rate limit before merge, scope a rate-limiter middleware on `/api/threads*` POSTs (per-sender, 30 req/min). Currently marked as inherited risk." — **the critique does not require it as a blocker for L15**, but the plan does NOT name a *route checklist* for whatever guard L15 *does* provide (CC re: L7 PROPOSED-L7-B). The 80ms minimum-show is not a security control (plan acknowledges this) but is the only client-side throttling. The plan should explicitly state: "L15 ships zero per-sender rate-limit middleware; the inherited gap is documented in `follow-ups.md`." Then add to §7 Route checklist a row marking the two POST routes as "rate-limit: NONE (inherited gap, see follow-ups: thread-message-rate-limit)." → **Fix:** (a) add the followup row to `docs/work-packages/follow-ups.md` (currently absent — `grep` shows no `thread-message-rate-limit` entry); (b) add the explicit "NONE" row in §7. Without (a), the deferred risk has no tracking artifact.

### WARNING

- **[plan §5.2 + §5.4 + §3 reconciliation row 3]** `INITIAL_TASKS` fixture currently has NO `ownerAgentId` field (verified WorkTeam.tsx:32-72). Plan §6 task 9 says "add `ownerAgentId` to the fixture rows" — but the design's popover REQUIRES the participants list to be `[founderId, ownerAgentId]` per §5.3. There is no concrete value source for `ownerAgentId` in the fixture. → **Fix:** specify the fixture's `ownerAgentId` values explicitly in §5.2 (e.g. `"agent-dev-1"`, `"agent-dev-2"` matching the existing `owner: "Dev Agent 1"` display strings) and document this is *fixture data only*, with the real agent-team-membership story tracked in follow-ups.

- **[plan §5.3 + §11 Open risks]** The "≤ 25 GETs at mount + ≤ 25 follow-ups" data-flow is specified, but no failure semantics are specified. **What renders if 1-out-of-25 GETs fails?** Does the affected card show a skeleton forever? Does the action footer collapse to "no thread"? The design's §7 "Loading (action footer)" state covers in-flight, but not "fetch errored." → **Fix:** add a row to §5.3 specifying: "If the per-task GET fails, the card renders the action footer with `threadId=null, threadCount=0, threadUnread=0` (treat as orphan-no-thread). The next request will create the thread implicitly. No retry logic." This is a small, defensible call; just commit to it.

- **[plan §5.3 Note on `threadCount` (A)]** "≤ 25 GETs at mount + ≤ 25 follow-ups" = up to **50 sequential round-trips** to render one Kanban. Plan calls this "acceptable" but provides no perf budget assertion. → **Fix:** spec a minimum: "All thread-metadata fetches use `Promise.allSettled` for parallelism. Total wall time SLO: ≤ 800 ms p95 against the local SQLite dev driver. If either becomes a problem, escalate to follow-up `kanban-thread-metadata-batched-endpoint`." This converts vibes ("acceptable") into a testable budget that /write-tests can encode.

- **[plan §5.2 — `WorkTeamTaskThread.tsx`]** The plan adds a new full page that is described as "Mirrors the `ConversationsReview` page's fetch + decode pattern." Two concerns: (1) Is this *necessary* for L15? AC says "opening a thread lifts it correctly" — the ConversationsReview page already lifts threads when a thread id is selected. The simpler path is: clicking the chip navigates to `/conversations/<threadId>` (or whatever the ConversationsReview deep link is). Re-creating a parallel page mirrors complexity without justification. (2) If L15 *must* introduce a task-scoped route, the plan should (a) cite why the existing thread surface cannot serve and (b) add a design-it-twice block weighing the two options. → **Fix:** either (A) drop `WorkTeamTaskThread.tsx` from §5.2 + §6 and route the chip click through the existing thread surface (preferred — fewer files, fewer tests, fewer e2e selectors); or (B) keep it but add a §10 trade-off row explaining why the ConversationsReview surface won't work for `host_kind=task` threads. Currently it's neither.

- **[plan §5.1 `TaskRequestPopoverProps.onSent`]** `onSent: (result: { threadId: string; messageCount: number })` — `messageCount` is the *server-confirmed total after the append*. But the plan §5.3 data flow returns `messages: [...]` from POST /api/threads (count=1), and `{message, thread}` from POST /api/threads/:id/messages (count=??). There's no field on the message-append response that reports a fresh total. The popover would have to do a separate GET, OR the parent re-derives count optimistically (`previousCount + 1`). → **Fix:** clarify in §5.1: "`messageCount` is the parent's optimistic `previousCount + 1`; the popover does not re-fetch. The parent reconciles on the next mount." OR change the prop to `onSent: (result: { threadId: string }) => void` and let the parent manage the count delta entirely.

- **[plan §9 Protected tests — Canvas DnD entry]** Plan lists `Canvas.dnd.test.tsx` with "if exists; check before merge." `ls` would resolve this in 0.1 seconds. → **Fix:** resolve before /write-tests. Either name the actual canvas DnD test file (`packages/web/src/__tests__/Canvas.test.tsx` is the only hit; verify it covers DnD) or remove the speculative line.

### SUGGESTION

- **[plan §4 Q3 + §7 Route checklist]** The chosen DaisyUI `dropdown` solution doesn't auto-flip vertically. Design §7 mentions popover overflow at viewport edges. Worth adding a §10 trade-off bullet: "Bottom-edge popover clipping is acceptable for L15; the Kanban scroll container is short enough that vertical overflow is rare. Re-evaluate if the verb list grows to >5."

- **[plan §10 — Trade-off 4 ULID]** Plan picks `crypto.randomUUID()` instead of ULID despite SHARED's L11 picker mention. The existing codebase already imports a UUID generator widely (RichMessageCard tests show `clientKey: id` usage). A one-line "verified consistent with L11 implementation: web `clientKey` is generated via `crypto.randomUUID()` per `RichMessageCard.tsx:<line>`" would close the open-loop on the `⚠️ UNVERIFIED` flag in §4.

- **[plan §6 task 14 e2e]** The Playwright spec's "attempt drag" assertion needs a concrete *what counts as no-op* gesture. `mouse.move + mouse.down + mouse.move` may or may not trigger any DOM event with the DnD scaffolding gone. → Suggest: assert that after the gesture, the task card stays in its starting column (`column.contains(card)` is true).

### What's Working Well

- **§3 Plan reconciliation** is exemplary — every spec assumption is grepped against actual code, with file:line evidence and an explicit action. This is the right shape for a reconciliation block; future plans should mirror it.
- **§4 Q1 / Q3 / idempotency answers** are decisive (with rationale + alternatives + trade-offs), not theatrical. The location call (`shared` for `requestableVerbsFor`) cites the right concept-doc reasoning (closed enum + build-time exhaustiveness).
- **§5.4 "Drag is dead" enumerates every line to delete** — this is the exact granularity /write-code needs to avoid leaving zombie imports.
- **§9 Protected tests is populated and explicit** about the "append-allowed, edit-forbidden" rule for `threads.routes.test.ts`. Most plans skip this entirely.

---

## Decision

**Score 7.0 ≥ 7.0 gate** — the plan is acceptable for `/write-tests` once the **CRITICAL** items are addressed in place. The two CRITICAL findings encode the wrong intent into tests if not fixed:

1. The non-existent `Tag.test.tsx` (creates a misnamed test file).
2. The unaccounted `Kanban.keyboard-drag.test.tsx` (leaves DnD assertions failing against deleted code).

Both are CC-007 (spec/codebase drift) — exactly what this gate exists to catch.

**Recommend:** architect amends in place, then we re-score Round 2 quickly to confirm fixes landed.

---

## Round 2 (post-amendment re-score)

### Score: 8.4/10  (SA:9 LI:9 AC:9 DM:8 N:9 MD:8 FMC:8 S:8 V:8)

| Dim | Δ | Reason |
|---|---|---|
| Spec Alignment (SA) | 9 → 9 | unchanged |
| Layer Integrity (LI) | 9 → 9 | unchanged |
| API Contracts (AC) | 7 → 9 | `onSent` shape clarified to `{threadId}` only; parent owns count delta. |
| Data Model (DM) | 7 → 8 | `INITIAL_TASKS` `ownerAgentId` values pinned (`agent-dev-1`, `agent-dev-2`); fixture provenance documented + tracked in follow-up. |
| Naming (N) | 9 → 9 | unchanged |
| Module Depth (MD) | 7 → 8 | Design-it-twice on `WorkTeamTaskThread` documents why `ConversationsReview` reuse is rejected; surface URL communicates intent; `ThreadShell` is the actual reused primitive. |
| Failure-Mode Coverage (FMC) | 5 → 8 | Per-task GET failure semantics specified (orphan-no-thread fallback, no retry); `Promise.allSettled` parallelism; ≤ 800ms p95 perf budget; rate-limit explicitly marked NONE in route checklist with follow-up link. |
| Simplicity (S) | 6 → 8 | `WorkTeamTaskThread` justified via design-it-twice; rejected the simpler "reuse ConversationsReview" path with explicit category-error reason (review grammar ≠ plain task chat). |
| Verifiability (V) | 6 → 8 | `Tag.test.tsx` is now declared NEW with three explicit assertion shapes; `Kanban.keyboard-drag.test.tsx` deletion is in §5.2 *and* §6 task 7.5; `Canvas.dnd.test.tsx` speculative line removed. |

### Findings status

- ✓ **CRITICAL — non-existent `Tag.test.tsx`:** resolved. Plan §5.2 marks it (NEW); §6 task 3 unchanged but the file's status is now correctly stated.
- ✓ **CRITICAL — `Kanban.keyboard-drag.test.tsx` blind spot:** resolved. New step 7.5 deletes the file in full; §5.2 carries the same instruction with rationale.
- ✓ **CRITICAL — rate-limit + route-checklist gap:** resolved. §7 carries explicit "NONE (inherited gap)" rate-limit column for both POST routes; `thread-message-rate-limit` follow-up appended to `docs/work-packages/follow-ups.md`.
- ✓ **WARNING — `INITIAL_TASKS` ownerAgentId source:** resolved. Concrete values + follow-up `team-scoped-tasks-and-agent-membership` registered.
- ✓ **WARNING — fan-out failure semantics:** resolved. `Promise.allSettled` + orphan-fallback + p95 budget specified.
- ✓ **WARNING — perf budget:** resolved. ≤ 800ms p95; follow-up `kanban-thread-metadata-batched-endpoint` registered.
- ✓ **WARNING — `WorkTeamTaskThread` necessity:** resolved. Design-it-twice block in §10 documents the rejection of `ConversationsReview` reuse on category-error grounds.
- ✓ **WARNING — `onSent` shape ambiguity:** resolved. Now `{threadId: string}` only; parent owns the count delta.
- ✓ **WARNING — `Canvas.dnd.test.tsx` speculative line:** resolved. Removed; protected list contains only verified files.
- ✓ **SUGGESTION — popover bottom-edge clipping:** addressed in §10.
- ✓ **SUGGESTION — ULID verification:** addressed; `⚠️ UNVERIFIED` flag replaced with explicit verification against `RichMessageCard.test.tsx:139-156`.
- ◯ **SUGGESTION — e2e gesture concreteness:** plan §5.2 e2e bullet now describes `mouse.down + mouse.move + mouse.up` and the assertion (column container still contains card). Adequate.

### Decision

**Score 8.4/10 ≥ 7 gate. Plan is approved for `/write-tests`.**

All CRITICAL items closed. No remaining CRITICAL or WARNING blockers.

---

## Unresolved risks the developer must keep in mind

1. **Per-user read state ships as `0`.** The unread-chip variant is testable with synthetic data but the live feed will read `0` until `kanban-per-user-thread-read-state` lands. Don't be confused when a real Kanban shows zero unreads even after agent activity.
2. **Per-task fetch fan-out is sequential round-trips bound by an 800ms p95 budget.** If real production telemetry shows the budget is exceeded, escalate to `kanban-thread-metadata-batched-endpoint` rather than tweaking timeouts.
3. **No rate-limit on POST messages.** A scripted client can flood threads. Tracked in `thread-message-rate-limit`; do not paper over with a client-side throttle masquerading as security.
4. **`INITIAL_TASKS` is fixture data.** The `ownerAgentId` values (`agent-dev-1`, `agent-dev-2`) are synthetic; real agent-team membership is in `team-scoped-tasks-and-agent-membership`. Don't promote the fixture to a contract.
5. **Bottom-edge popover clipping.** DaisyUI `dropdown` does not auto-flip vertically. If a future verb-list expansion (or a tall textarea) makes this visible, swap to `@floating-ui/react` (already in SHARED's dep list).
6. **The `cursor: grab → pointer` change has no `onClick` target yet.** TaskCard's body is currently click-inert; the design's "200ms left-border flash on click" only fires on the chip path. Don't wire a placeholder `onClick={() => {}}` — wait for the future task-detail story.

