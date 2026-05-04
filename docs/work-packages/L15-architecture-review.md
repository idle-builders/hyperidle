# L15 — Architecture Review (read-only, post-implementation)

**Phase.** Code review against spec + plan + step-9 applied notes. Distinct from `L15-plan-critique.md` (which scored the plan, pre-code).

**Inputs read.**
- Spec: `docs/work-packages/TRACK-L.md` § L15 (lines 511–540)
- Plan: `docs/work-packages/L15-plan.md` (1087 lines, all sections)
- Step-9 apply summary: `docs/work-packages/L15-step9-applied.md`
- Concept: `docs/concept/HUMAN_INTERFACE_LAYER.md` § 4.5 (Thread primitive)
- Shared contract: `docs/work-packages/SHARED.md`
- Implementation files (full read):
  - `packages/shared/src/task-request-verbs.ts`
  - `packages/shared/src/task-pending.ts`
  - `packages/shared/src/thread.ts` (RequestPayload + PlainPayload.request)
  - `packages/server/src/services/task-authz.ts`
  - `packages/server/src/services/append-plain-message.ts`
  - `packages/server/src/services/ensure-task-thread.ts`
  - `packages/server/src/services/thread-row.ts`
  - `packages/server/src/routes/tasks.ts`
  - `packages/server/src/routes/threads.ts` (plain-branch delegation)
  - `packages/server/src/routes/threads-schema.ts`
  - `packages/design-system/src/TaskActionsMenu.tsx`
  - `packages/web/src/shell/Kanban.tsx`
  - `packages/web/src/pages/WorkTeam.tsx`
  - `packages/web/e2e/L15-team-board-no-drag.spec.ts`
  - `packages/web/src/__tests__/Kanban.no-drag.test.tsx`
  - `packages/server/src/routes/__tests__/tasks.request-authz.test.ts`

---

## Verdicts

### (a) Layer integrity — **PASS**

Strict downward dependency holds end-to-end:

- **Human Interface (`packages/web/src/pages/WorkTeam.tsx`, `packages/web/src/shell/Kanban.tsx`):** never touches the DB or the Primitive Store. The page calls `fetch("/api/tasks/:id/request", …)` (Meta-layer surface). The Kanban shell is presentation-only — receives `tasks` + `renderTaskActions` slot from the page, owns no request semantics.
- **Meta Layer (`packages/server/src/routes/tasks.ts`):** orchestrates DB + EventBus only. Does not invoke a model. The handler composes pure services (`assertTaskParticipantAuthz`, `ensureTaskThread`, `derivePendingRequest`, `appendPlainMessage`) — no agent runtime calls.
- **Agent Runtime:** untouched by L15.
- **Component packages:** `web` does not reach into `server` internals. The new `TaskActionsMenu` lives in `packages/design-system` (Tier-2, per plan § 11) and is consumed by web — correct direction.
- **Service chokepoints:** the four new services (`task-authz`, `ensure-task-thread`, `append-plain-message`, `thread-row`) sit at the right abstraction boundary — they are pure functions over `(db, …)` + Hono-context-free, importable by any future task-scoped writer.

### (b) Plan adherence — **MIXED** (matches on the core path; six silent divergences from the plan; spec ACs all met or testable)

| Spec AC | Status | Evidence |
|---|---|---|
| AC-1 drag removed from Team Board | Met | `Kanban.tsx` no `@dnd-kit/core` imports; `Kanban.no-drag.test.tsx` greps source + DOM for absence; `WorkTeam.tsx` has no `handleMoveTask`. |
| AC-2 request affordance + thread message | Met | `TaskActionsMenu.tsx` renders state-conditional verbs; `POST /api/tasks/:id/request` persists a plain message with `payload.request.verb`. E2E asserts the network call. |
| AC-3 Canvas drag survives | Met (via source-grep) | `Kanban.no-drag.test.tsx` lines 90–100 assert `Canvas.tsx` still imports `DndContext`, `KeyboardSensor`, `PointerSensor`. **However** the dedicated `canvas-drag-survives.spec.ts` planned at § 8 task 23 is missing — see CRITICAL-3 below. |
| AC-4 Vitest coverage | Partially met | Server + e2e + service tests present; design-system + shared unit tests for L15 primitives are missing — see CRITICAL-1 below. |
| AC-5 Playwright e2e | Met (consolidated) | Two flows live in one spec `L15-team-board-no-drag.spec.ts`. The plan named two specs; consolidation is fine. |
| AC-6 CI green | Met (per step-9: 3218 passed, 1 pre-existing unrelated failure). | Verified in step-9-applied.md. |

**Plan deviations**, classified:

1. **Documented in step 9 (acceptable):**
   - H1 (`threads.ts` plain-branch → `appendPlainMessage` delegation) — applied path (a). Verdict-race regression pinned. Verified line-by-line: `threads.ts:340–351` is a clean `if (input.type === "plain")` delegate; verdict/review/questionnaire branches stay intact at `threads.ts:414–533`. The `VerdictRaceConflict` rowcount idiom at 463–477 survives identically.
   - H2 row-helper consolidation (`thread-row.ts`) — applied; both routes now import `rowToMessage` / `rowToThread` from one place.
   - H3 `readSenderId` / `DEFAULT_FOUNDER_ID` consolidated into `services/task-authz.ts` — applied.
   - W-2: five no-op callbacks + the `handleAddToCanvas` page-level shim deleted; `NOOP_MOVE_BET` named for the required Canvas prop. Acceptable.
   - L1 six unused `KanbanProps` callbacks dropped.

2. **Silent divergences (NOT in spec ACs, NOT in step-9 deferral list, NOT in `follow-ups.md`):**
   - **D-1.** `task_snoozes` table + migration `0010_add_task_snoozes.sql` (plan §§ 5.1, 5.2): not implemented. No `taskSnoozes` Drizzle table in `packages/db/src/schema.ts` or `schema.pg.ts`. No migration file. No PG migration.
   - **D-2.** `POST /api/tasks/:id/snooze` + `DELETE /api/tasks/:id/snooze` (plan § 5.5): not implemented in `packages/server/src/routes/tasks.ts`.
   - **D-3.** `task_snoozed` event (plan § 5.7): not added to `packages/shared/src/events.ts`.
   - **D-4.** Server-side `pendingRequest` + `snoozedUntil` projection on `GET /api/tasks` (plan § 5.6): not implemented. The list endpoint at `tasks.ts:100–120` returns the bare task row.
   - **D-5.** `StatusChip` `request_pending` variant + label override (plan § 4.5): not implemented. `request_pending` does not appear in `packages/design-system/src/StatusChip.tsx`.
   - **D-6.** `TaskCard.tsx` `pendingRequest` slot + `onActivate` (plan § 4.4): not implemented. `KanbanTaskCard` in `Kanban.tsx` (line 91) never reads `task.pendingRequest`; `TaskCard` props were not extended. The `KanbanTask.pendingRequest` field is wired through but currently dead-ends — `WorkTeam.tsx` always passes `pendingRequest: null`.

   **Net effect:** the plan's read-model (snooze + pending projection + chip rendering) is missing end-to-end. The cancel-only flow still works (`derivePendingRequest` runs server-side at cancel time per `tasks.ts:237–254`), so the spec's "cancel" semantics are intact, but **the user has no way to know a request is pending without opening the menu** — there is no chip render. Spec AC-2 says "Each task gains an affordance to request a state change OR open the task's attached thread"; the chip is not strictly required by the spec text, so AC-2 is technically met. The plan over-promised; the impl shipped a smaller surface.

3. **Test coverage gaps vs. plan § 12 protected list:**
   - Missing entirely: `task-request-verbs.test.ts`, `task-pending.test.ts`, `thread-plain-with-request.test.ts` (plan § 12 lines 964–966).
   - Missing entirely: `tasks.snooze.test.ts`, `tasks.list-pending.test.ts`.
   - Missing entirely: `TaskActionsMenu.test.tsx` (functional unit), `TaskCard.test.tsx`, `StatusChip.test.tsx` for the new variant. Visual-regression files exist (`*.visual.test.tsx`), but the functional units the plan locked do not.

### (c) Top issues

---

## CRITICAL findings

### CRITICAL-1 — Protected unit tests missing for shared primitives (`task-request-verbs`, `task-pending`, plain-with-request validation)

**Spec/plan ref.** L15-plan.md § 12 protected-tests block, lines 964–966 explicitly list:
```
"packages/shared/src/__tests__/task-request-verbs.test.ts",
"packages/shared/src/__tests__/task-pending.test.ts",
"packages/shared/src/__tests__/thread-plain-with-request.test.ts",
```

**Reality.** `ls packages/shared/src/__tests__/` shows none of these files. The functions `isVerbLegalForState`, `renderRequestText`, `derivePendingRequest`, and the `messageInputSchema` round-trip with a `request` payload have **no unit-test coverage**. The plan called these out as the lowest-cost / highest-leverage tests (pure functions, zero infra).

The protected-tests block in plan § 12 is the contract write-tests must honor; missing protected tests is a CC-008 recurrence (the very class of regression `/architecture-critique` § 7 was written to prevent).

**Why it matters architecturally.**
- `derivePendingRequest` is the **single source of truth** for the pending read-model (plan § 2.2). A regression here flickers UI state and could let a "stale view" bypass the cancel-409 invariant. It currently runs only at one server callsite (`tasks.ts:245`) and has zero direct tests; bug surface is hidden.
- `isVerbLegalForState` is the only wall between a client sending `request_unblock` on a `done` task and a polluted thread; it has zero tests covering the matrix exhaustively.
- The plan's W-3 acceptance test ("a `plain` message with `payload.request = {…}` validates through `messageInputSchema`") is the only proof that the closed-discriminant rule from concept § 4.5.8 hard rule 5 was preserved. Without it, a future Zod refactor could drop the `request` field silently.

**Suggested fix.** Add the three test files with the assertions enumerated in plan § 12 lines 1003–1005. They are pure-function tests; an afternoon of write-tests work.

---

### CRITICAL-2 — `appendPlainMessage` does not auto-add same-team agents to existing thread participants → contradicts plan § 2.6 and creates a 403 trap on the second team-member writer

**Spec/plan ref.** L15-plan.md § 2.6 ("Participant addition"), lines 273–275:
> "If `created === false` (existing thread), and `senderId` is not in `participants[]`, the helper APPENDS senderId via a conditional UPDATE inside the same `appendPlainMessage` transaction…"

**Reality.** `appendPlainMessage` (lines 50–59) hard-rejects non-participants:
```ts
if (!participants.includes(input.senderId)) {
  return { ok: false, status: 403, code: "forbidden", message: "Sender is not a participant" };
}
```
No conditional-UPDATE-append logic exists anywhere in the file. `ensureTaskThread.ts:52` constructs a thread with `participants: JSON.stringify([senderId])` for new threads, so the FIRST writer is always a participant. Subsequent writers — even those who pass `assertTaskParticipantAuthz` — get 403.

**Concrete failure scenario** (not covered by `tasks.request-authz.test.ts`):
1. `u-founder` POSTs `request_stop` on task-A (team-A). Thread created, participants = `["u-founder"]`. → 201.
2. `agent-A1` (same team as task-A — passes `assertTaskParticipantAuthz`) POSTs `request_stop` on task-A. → `appendPlainMessage` reads existing thread, sees `["u-founder"]` lacks `agent-A1`, returns **403** "Sender is not a participant".

This is a **layer-confusion bug**: the `assertTaskParticipantAuthz` chokepoint says "yes, you're a team participant" and then a second authz layer (thread-participant) says "no, you're not on the thread roster". The two checks contradict.

The existing `tasks.request-authz.test.ts` row (b) "same-team agent → 201" passes only because `agent-A1` is the first writer for that task in that test (line 130 — first POST in the test, no prior thread). Reverse the order and it fails.

**Why it matters architecturally.**
- Cross-team isolation (plan § 10 row 10) was supposed to be enforced by `assertTaskParticipantAuthz` so that `appendPlainMessage` could relax to "trust the caller". Either:
  - (A) The plan's spec for `appendPlainMessage` is wrong (don't auto-add — and then `assertTaskParticipantAuthz` is the only gate; the 403 in `appendPlainMessage` is unreachable for the request endpoint and reachable only for direct `POST /api/threads/:id/messages` callers — which is the legacy semantic), OR
  - (B) The implementation is wrong (must auto-add per the plan's explicit spec).
- Either way the system today has two concurrent gates with **opposing semantics** at the same boundary. That is a chokepoint failure (CRITICAL-3 from the plan was supposed to make `assertTaskParticipantAuthz` the one chokepoint).

**Suggested fix.** Either (A) document the deviation explicitly in step 9 / `follow-ups.md` and add a regression test that pins "founder-creates-then-team-member-posts → 403" so the contract is at least known, OR (B) implement the plan's auto-append behaviour and add the missing test "founder-creates-then-team-member-posts → 201, participants now includes both".

Recommend (B) because the spec text "Each task gains an affordance to request a state change" implies any user with task access can use it; (A) leaks the legacy single-participant rule into the new flow.

---

### CRITICAL-3 — `canvas-drag-survives.spec.ts` E2E missing — AC-3 ("Drag survives ONLY between Shaped → Committed") has only a source-grep proof

**Spec/plan ref.** TRACK-L.md § L15 AC-3 (line 522): "Drag survives ONLY between Shaped → Committed columns on the Canvas." Plan § 8 task 23 + § 12 protected E2E list both name `packages/web/e2e/canvas-drag-survives.spec.ts` with the assertion "drag a `shaped` bet on the Canvas → the bet appears in the `committed` column."

**Reality.** No such e2e spec exists. `Kanban.no-drag.test.tsx` (lines 90–100) asserts `Canvas.tsx` source still imports `DndContext`, `KeyboardSensor`, `PointerSensor` — but a source-grep is not behavioural evidence. The Canvas drag could be present-but-broken (e.g. the drop handler could be a no-op) and the unit test would still pass.

**Why it matters architecturally.** AC-3 is the only "drag SURVIVES" invariant in the spec. Without an e2e that actually drags a Canvas bet end-to-end, a future refactor that "consolidates" Canvas + Kanban dnd setup (predictable next-story temptation) can silently strip Canvas drag and pass CI. The plan flagged exactly this risk in § 8 task 23 ("protects the Canvas drag against accidental regression in a future story that 'consolidates' Kanban + Canvas").

**Suggested fix.** Add `packages/web/e2e/canvas-drag-survives.spec.ts` per plan § 12 — drag a `shaped` bet → assert it appears in `committed`. Cheap; behavioural; matches the L20+ regression risk surface.

---

## WARNINGS

### W-1 — `KanbanTask.pendingRequest` is dead state in `WorkTeam.tsx` and never rendered

`KanbanTask` (Kanban.tsx:21) carries `pendingRequest?: PendingRequestSummary | null`. `WorkTeam.tsx` always seeds it as `null` (lines 46, 55, 64, 73, 82). `KanbanTaskCard` never reads it. `TaskActionsMenu` reads `task.hasPendingRequest` from a separately-derived boolean (`Boolean(task.pendingRequest)` at WorkTeam.tsx:166), but since `pendingRequest` is always null the cancel item never shows.

This means the cancel-pending-request endpoint can succeed only if someone POSTs through curl — there is no UI path. Spec is silent on this (cancel was a plan extension); the plan promised it. With the snooze + projection deferrals (D-1..D-6), this is a coherent slice — but the dead `pendingRequest` field reads as cargo-culted from the plan rather than load-bearing.

**Suggested fix.** Either (a) remove the dead field from `KanbanTask` and `WorkTeam.tsx` until D-4 lands, OR (b) wire `WorkTeam.tsx` to fetch `GET /api/tasks` so the field becomes live. (a) honors the project's "no dead code" rule; (b) closes the loop the plan intended.

### W-2 — `clientKey` regex (8–128 chars) requires every `crypto.randomUUID()` call to fit the pattern — fine today, but brittle

`WorkTeam.tsx:144,150` uses `crypto.randomUUID()` as the `clientKey`. UUIDv4 is 36 chars (`8-4-4-4-12` with hyphens) → matches `/^[A-Za-z0-9_\-:.]+$/` and length-8-128. OK today. If a future story switches to a 6-char shortid (sid), it'll silently fail validation.

**Suggested fix.** Add a `task-request-verbs.test.ts` (or the missing `WorkTeam.menu.test.tsx`) assertion that the client-emitted `clientKey` shape passes `clientKeySchema`. Not blocking; preventive.

### W-3 — `TaskActionsMenu` shortcut letter table diverges from plan § 2.7

Plan § 2.7 locked `B = Request unblock`, `H = Request hold`, `D = Request mark done`, `C = Cancel pending request`, `S = Request stop`. Implementation (TaskActionsMenu.tsx:30–38) uses `S/H/U/D/C/B/X` — `U` for unblock (plan said `B`), `B` for hand_back (plan said `H` shared with hold via "first-wins by render order"), `X` for cancel (plan said `C`). The shortcuts are advisory per plan, but the divergence from the locked table means the "letter shortcuts work" assertion in plan § 12 (`TaskActionsMenu.test.tsx` row e) cannot be verified against the locked spec — and that test file doesn't exist anyway (CRITICAL-1).

**Suggested fix.** Either revise plan § 2.7 to match the implementation (the impl bindings are arguably better — no collisions) OR re-bind in code. Document the chosen direction in step-9 or `follow-ups.md` so the next agent reading both artifacts isn't confused.

### W-4 — `appendPlainMessage` happy-path uses an extra DB round-trip after insert

Lines 126–130 re-SELECT both the thread and the just-inserted message, then call `rowToThread` + `rowToMessage` to build the response. The transaction has just committed; we already have:
- `messageId` (line 95) and the input payload → can construct a `Message` object directly.
- `threadRow` (the pre-update row from line 50) plus the new `now` timestamp → can construct an updated `Thread` directly.

Two extra `SELECT` round-trips per request is fine at the current load tier, but architecturally it signals the helper distrusts its own write — and the `if (!(updatedThread && created)) throw new Error("Created message missing after insert")` branch is dead defensive code. The transaction either committed or it didn't; if it did, the rows are present.

**Suggested fix.** Construct the result objects from the input + the assigned ids instead of re-reading. Captures the same audit fact more cheaply. Defer to a perf story if not blocking.

### W-5 — `ensureTaskThread.ts:52` writes `pinned: 0` for the new thread row, but `Thread.pinned` is `boolean` — the type leaks the SQLite-int representation

The Drizzle schema for `threads.pinned` is `integer({ mode: "boolean" })` (the canonical pattern); writing `0` works at runtime (better-sqlite3 coerces) but bypasses the boolean abstraction. `rowToThread` at `thread-row.ts:13` reads it as `row.pinned === 1`. If a future schema migration tightens the column type, this insert breaks.

**Suggested fix.** Pass `pinned: false` and let Drizzle coerce. Single-line change.

---

## OBSERVATIONS

### O-1 — Plain-branch delegation in `threads.ts` looks correct line-by-line

I verified the verdict-race semantics survive:
- Line 463–477: `WHERE resolvesMessageRow.id … AND messages.resolvedAt IS NULL` rowcount-on-conditional-update idiom intact.
- `VerdictRaceConflict` sentinel (line 447) and 409 mapping (line 492) preserved.
- The `wasResolved && (review|questionnaire)` reopen detection (line 439) and `thread_reopened` event emission (line 524) preserved.
- `threads.verdict-race.test.ts` exists and per step-9 stays green.

This is the highest-leverage refactor in L15 and the impl honored the plan's branch-enumeration table line-for-line. Reads cleanly; no regressions surface.

### O-2 — `assertTaskParticipantAuthz` is a clean chokepoint and an excellent reusable primitive

The pure function over `(db, senderId, task)` is the right shape. `tasks.ts:218` is the single callsite today; the future snooze endpoints (D-2) and any task-scoped writer get the policy for free. The 404-instead-of-403 anti-information-leak choice matches plan § 10 row 10 and L8 security review precedent.

### O-3 — `derivePendingRequest` is correctly pure, correctly typed, and correctly handles the redacted-payload case

The early `if ("redacted" in payload) continue` (task-pending.ts:30) is the right type-guard pattern given the discriminated union. The "scan-from-newest, return-on-first-non-cancel" loop matches the plan § 2.2 SQL projection one-for-one.

### O-4 — The `TaskActionsMenu` consumes `REQUEST_VERB_TEXT` as the single source of truth for primary copy

Step-9 W-4 was applied correctly: `VERB_DEFS` only owns `secondary` + `shortcut`; primary text is `REQUEST_VERB_TEXT[verb]`. Adding a verb in `task-request-verbs.ts` automatically picks up in the menu (with empty secondary/shortcut until the menu's table is updated). Good seam.

### O-5 — `KanbanTask` interface drift between the page and the shell

`WorkTeam.tsx` constructs `KanbanTask[]` with `pendingRequest: null` and the shell `Kanban.tsx` declares `pendingRequest?: PendingRequestSummary | null`. Field is structurally compatible but currently never flows to render. See W-1.

### O-6 — `tasks.list-pending.test.ts` is named in plan § 12 but the corresponding endpoint extension (D-4) was never implemented

The test absence is consistent with the deferral. Nothing to fix in the impl — but the deferral itself is undocumented; flag in step-9-applied retroactively or in `follow-ups.md`.

---

## Spec-vs-impl drift table (compact)

| Plan section | Status | Note |
|---|---|---|
| § 3.1 task-request-verbs.ts | shipped | matrix exhaustive, text map locked |
| § 3.2 PlainPayload.request | shipped | additive extension; closed discriminant preserved |
| § 3.3 derivePendingRequest | shipped | correct pure function, no tests (CRITICAL-1) |
| § 4.1 Kanban drag stripped | shipped | correctly removed `@dnd-kit/core` imports |
| § 4.2 WorkTeam handler removed + callbacks wired | partially | wiring partial (no chip render — W-1) |
| § 4.3 TaskActionsMenu | shipped | shortcut bindings diverge from plan (W-3) |
| § 4.4 TaskCard pending-chip slot | **NOT IMPLEMENTED** (D-6) | undocumented deferral |
| § 4.5 StatusChip request_pending | **NOT IMPLEMENTED** (D-5) | undocumented deferral |
| § 5.1, 5.2 task_snoozes table | **NOT IMPLEMENTED** (D-1) | undocumented deferral |
| § 5.3 plain payload schema extension | shipped | clean addition |
| § 5.4 POST /api/tasks/:id/request | shipped | end-to-end correct except W-2 (auto-add participants) |
| § 5.5 snooze endpoints | **NOT IMPLEMENTED** (D-2) | undocumented deferral |
| § 5.6 GET /api/tasks projection | **NOT IMPLEMENTED** (D-4) | undocumented deferral |
| § 5.7 task_snoozed event | **NOT IMPLEMENTED** (D-3) | undocumented deferral |
| § 8 phase A–G ordered tasks | partial | snooze + projection + chip phases skipped silently |
| § 12 protected tests (shared) | **NOT IMPLEMENTED** | three named files missing (CRITICAL-1) |
| § 12 protected tests (server) | shipped | request, request-authz, request-concurrent, append-plain-message, ensure-task-thread, task-authz all present |
| § 12 protected tests (design-system) | partial | visual tests present; functional unit tests missing |
| § 12 protected tests (web) | shipped | Kanban.no-drag, WorkTeam.menu present; Kanban.keyboard-drag.test.tsx deleted per plan task 19 |
| § 12 E2E | partial | request + no-drag merged into one spec (OK); canvas-drag-survives missing (CRITICAL-3) |

---

## Recommendations (prioritized)

1. **Decide on the snooze + projection + chip slice** (D-1..D-6). Either (a) implement now to honor the plan, or (b) record a follow-up row per item in `docs/work-packages/follow-ups.md` and append to `L15-step9-applied.md` with rationale. Silent deferral is the worst option — every downstream skill (DoD, retro) reads "step-9 applied" as the truth and will mis-score.
2. **Resolve the `appendPlainMessage` participant-add contradiction** (CRITICAL-2). Pick (A) or (B); either is consistent. The current state ships a 403 trap.
3. **Add the three missing shared unit-test files** (CRITICAL-1). Pure-function tests, hour of work, large coverage gain on the load-bearing primitives.
4. **Add `canvas-drag-survives.spec.ts`** (CRITICAL-3). Behavioural proof of AC-3 instead of a source-grep.
5. **Remove the dead `pendingRequest` field from `KanbanTask`** OR wire it to live data (W-1). Don't keep cargo-cult fields.
6. **Reconcile W-3 shortcut bindings** between plan § 2.7 and implementation; document whichever wins.

---

**End of review.**
