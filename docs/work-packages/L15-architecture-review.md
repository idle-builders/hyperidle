## Architecture Review: L15 (implementation)

Worktree: `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2` · branch `ab/L15-2`. Implementation is uncommitted in the working tree (verified via `git status`); review reads files at HEAD + uncommitted changes. Sources audited: `docs/work-packages/L15-plan.md` (1087 LOC, locked plan), `docs/work-packages/TRACK-L.md` §L15 (lines 511–540), `docs/concept/HUMAN_INTERFACE_LAYER.md` §4.5, `docs/work-packages/SHARED.md`, `docs/ARCHITECTURE.md`, plus the implementation files enumerated in the request brief. Out-of-scope (already filed): everything in `L15-simplification-scan.md` and `L15-slop-scan.md`.

| Severity   | Count |
|------------|-------|
| MUST-FIX   | 1     |
| SHOULD-FIX | 5     |
| CONSIDER   | 4     |
| **Total**  | 10    |

Per-rubric posture: **AC-traceability 9/10, Layer integrity 8/10, Contracts 9/10, Data model 9/10, Naming 10/10, Failure-mode coverage 8/10, Verifiability 9/10.** CRITICAL-1 (`appendPlainMessage` extraction scope), CRITICAL-2 (lazy-thread race), and CRITICAL-3 (`assertTaskParticipantAuthz` resolution order + 404 isolation) all land cleanly with backing tests. The single MUST-FIX is a contract drift on the request endpoint's HTTP status that the plan §10 row 12 calls out as load-bearing. Most other findings are second-order — N+1, cross-route coupling, two unwired UI items.

---

### 1. Spec alignment — 9/10

Every AC in TRACK-L.md §L15 has both an implementation artifact and a verification artifact, traceable to plan §1 and §14:

- AC-1 (drag removed) — `Kanban.tsx:9-66` strips `@dnd-kit/core`; `WorkTeam.tsx` deletes `handleMoveTask`. Verified by `Kanban.test.tsx:99-127` (DOM + source-grep) + `Kanban.no-drag.test.tsx:34-67` + `team-board-no-drag.spec.ts`.
- AC-2 (request affordance) — `tasks.ts:260-331` (`POST /:id/request`); `TaskActionsMenu.tsx`; verified by `tasks.request.test.ts`, `TaskActionsMenu.test.tsx`, `team-board-request.spec.ts`.
- AC-3 (Canvas drag survives) — `Canvas.tsx` untouched; verified by `canvas-drag-survives.spec.ts`.
- AC-4/AC-5/AC-6 — covered by Vitest + Playwright suite enumerated in plan §12.

Validation scenarios from TRACK-L lines 527–530 each map to a verification artifact. No happy-path-only ACs.

### 2. Layer integrity — 8/10

The three-layer rule holds: `packages/web/**` reaches the server only via `/api/...` fetches (`WorkTeam.tsx:131-182`); `packages/server/**` does not import from `web`; the new `services/*.ts` helpers stay within the server boundary; `packages/shared/src/task-request-verbs.ts` and `task-pending.ts` carry zero runtime dependencies (the runtime `zod` lives in `packages/server/src/routes/threads-schema.ts`, preserved). One soft scratch noted at MUST-FIX-1 / SHOULD-FIX-2 below: `packages/server/src/routes/tasks.ts` imports `rowToMessage` from `packages/server/src/routes/threads.ts`, lifting it from a private helper to a public route-module export. The cleaner placement is the same `services/` directory the L15 helpers already inhabit.

### 3. API contracts — 9/10

Plan §6 route checklist greps:
- `router.post|router.delete` against `tasks.ts` returns the four mutations + `GET /` + `POST /:id/transition` + `POST /:id/handoff` (the existing handlers). Confirmed at `tasks.ts:82,118,164,188,199,260,337,383`. All four L15 handlers landed.
- `authMiddleware` is mounted once at `app.ts:246` under `api.use("*", ...)`. The `api.route("/tasks", createTaskRoutes(...))` mount at `app.ts:266` runs after the auth gate. Inheritance contract holds: every L15 handler (`/:id/request`, `/:id/snooze` POST and DELETE) inherits auth.
- `createRateLimiter` is mounted PRE-auth at `app.ts:197-207` with `skipPaths` for `/api/health`, `/api/status/health`, `/api/auth`. None of the four new L15 routes are in `skipPaths`. W-2 invariant holds (rate limit before auth).
- `readSenderId` appears in every new task handler (`tasks.ts:263,339,385`).
- `assertTaskParticipantAuthz` is called in every new task mutation handler (`tasks.ts:272,344,390`) BEFORE any thread mutation. CRITICAL-3 chokepoint contract holds.
- `appendPlainMessage` appears in BOTH `tasks.ts:23,318` AND `threads.ts:38,405`. The plain-type delegation is wired exactly per plan §5.4.
- `ensureTaskThread` / `TaskThreadRaceLost` appear at `services/ensure-task-thread.ts:24,26`. CRITICAL-2 idiom present.

The Hono `router.post("/:id/request", validateBody(requestBodySchema), ...)` shape matches established patterns in the same file (`tasks.ts:82,164,188,199`). Body validation runs before any handler logic. Verified pattern usage against existing routes; consistent.

### 4. Data model — 9/10

`task_snoozes` migration (`drizzle/0010_add_task_snoozes.sql` + `drizzle-pg/0009_add_task_snoozes.sql`) matches the Drizzle schema (`schema.ts:489-503` + `schema.pg.ts:478-492`) on column types, primary key shape `(user_id, task_id)`, the supporting index `task_snoozes_user_until_idx`, and the FK with `ON DELETE CASCADE`. Both journals updated to record the new entries (`drizzle/meta/_journal.json:75-81`, `drizzle-pg/meta/_journal.json:68-74`). Side-by-side parity is clean — same column names, same nullability, same index name. The PG migration emits `TIMESTAMPTZ`-style? No — the implementation kept `text` for both `snoozed_until` and `created_at` (see SHOULD-FIX-3 below). `tasks.thread_id` lazy population uses the conditional `UPDATE ... WHERE thread_id IS NULL` returning `result.changes === 0` (race detector) at `ensure-task-thread.ts:56-66`. Mirrors the `VerdictRaceConflict` rowcount idiom at `threads.ts:528-541`. Race-safe per CRITICAL-2.

### 5. Naming — 10/10

`REQUEST_VERBS` matches the plan §2.4 list exactly (7 entries, same order, same string identifiers). `RequestVerb` type alias exposed. `assertTaskParticipantAuthz` callable shape matches plan §2.6 (`db, senderId, task → TaskAuthzResult`); the `task` parameter widens the plan signature from `Task` to a structural `TaskShape = { id, teamId }` (same fields, no surprise). `ensureTaskThread`, `TaskThreadRaceLost`, `appendPlainMessage`, `AppendPlainInput`, `AppendPlainResult`, `PendingRequestSummary`, `derivePendingRequest`, `REQUEST_VERB_TEXT`, `TASK_VERBS_BY_STATE`, `isVerbLegalForState`, `renderRequestText`, `task_snoozed` event — all match plan §3 / §5.4 / §5.7 verbatim.

### 6. Failure-mode coverage — 8/10

Plan §10 abuse table → code mapping:
- Rate-limit (row 1): inherited from global mount; not regressed.
- Input-trust (row 2): `text` is server-rendered from `REQUEST_VERB_TEXT[verb]` at `tasks.ts:317` via `renderRequestText`. Verb is enum-validated by Zod (`tasks.ts:256`). Reason capped at 2048 (`tasks.ts:257`). Honest.
- Authn/authz (row 3): chokepoint at `assertTaskParticipantAuthz`; called BEFORE `ensureTaskThread` (`tasks.ts:272` before `:311`). CRITICAL-3 contract holds.
- Cross-team founder pollution (row 4): test `tasks.request-authz.test.ts:158-189` pins. Verified.
- Idempotency conflict (row 5): inherited via `appendPlainMessage:140-149`. Verified.
- `cancel_request` without pending (row 6): `tasks.ts:279-298` returns 409 `already_resolved` — see MUST-FIX-1 for HTTP code drift on a sibling case.
- Snooze flood (row 7): PK `(user_id, task_id)` deduplicates; the upsert uses read-then-update-or-insert (flagged by simplification scan SF1 — out of scope).
- 404 vs 403 isolation (row 10): `assertTaskParticipantAuthz` returns 404 with `code: "not_found"` and `message: "Task not found"` for both phantom and cross-team. Honest.
- Stale `pendingRequest` (row 12): plan locked at HTTP 409 `already_resolved` for the cancel-when-cleared case. Implementation honors this — but inconsistently for one sibling case (see MUST-FIX-1).

Gap noted at SHOULD-FIX-5: `tasks.request.test.ts` row (h) ("`appendPlainMessage` is the SAME code path as the plain-type branch of `POST /api/threads/:id/messages` (parity test: same input → same row layout)") is not present in the test — the protected list calls for it but the test file lacks the assertion.

### 7. Verifiability — 9/10

Every protected test in plan §12 exists with a real test body:
- `task-request-verbs.test.ts`, `task-pending.test.ts`, `thread-plain-with-request.test.ts` — present.
- `tasks.request.test.ts`, `tasks.request-concurrent.test.ts`, `tasks.request-authz.test.ts`, `tasks.snooze.test.ts`, `tasks.list-pending.test.ts` — present.
- `append-plain-message.test.ts`, `task-authz.test.ts` — present.
- `threads.verdict-race.test.ts` (the L1-step9 regression-pin) — present.
- `StatusChip.test.tsx`, `TaskCard.test.tsx`, `TaskActionsMenu.test.tsx` (+ `.visual.test.tsx` siblings) — present.
- `Kanban.test.tsx`, `Kanban.no-drag.test.tsx`, `WorkTeam.test.tsx`, `WorkKanban.grouped.test.tsx` — present.
- E2E specs `team-board-no-drag.spec.ts`, `team-board-request.spec.ts`, `canvas-drag-survives.spec.ts` — present.

The deletion of `Kanban.keyboard-drag.test.tsx` (plan §8 task 19) is recorded in `git status` as a deletion. No silent test deletion / weakening detected.

---

### MUST-FIX

#### MF-1 — `cancel_request` returns 409 `already_resolved` only when the thread doesn't exist OR no pending exists; the contract still leaks information when the task transitioned since the request

`packages/server/src/routes/tasks.ts:279-304` runs the following decision tree for `cancel_request`:

```
if !task.threadId:
  return 409 already_resolved
else:
  derive pending; if pending == null: return 409 already_resolved
  // else fall through, accept the cancel message
```

Plan §10 row 12 explicitly locks **409 `already_resolved`** as the response when "the cancel target is already cleared" — the implementation honors this for the no-pending-message case. But the implementation does **not** check the orthogonal "task transitioned since the request" predicate that plan §3.3 explicitly hands off to the caller (`task-pending.ts:8-9` docstring: "Caller is responsible for the 'task transitioned since request' check — this helper operates only on the message stream"). With the helper deferring this check and the route not running it, a `cancel_request` posted on a task that already moved out of the requested state succeeds with 201 — the same 200/201 happy path as a real cancel — instead of the 409 the plan locked. The W-6 client UX rule ("Toast on the client surfaces this as 'Already resolved.'") relies on the 409 being faithful; right now a stale view that races a transition gets a "Request cancelled" toast for an already-moot cancel.

Two options:
- (a) Drop the responsibility transfer in plan §3.3: add the transition-supersede check INSIDE `derivePendingRequest`, taking a `task: { state, transitionedAt }` argument so the helper returns null when `task.transitionedAt > pendingRequest.createdAt`. Update the route + the projection in `tasks.ts:138-158` to pass the task. Mirrors the L8 `unresolvedThreadIds` projection shape.
- (b) Leave the helper pure but add the transition-supersede check at the route, parallel to the existing `derivePendingRequest` call: `if (task.updatedAt > pending.createdAt && task.state in DONE_STATES) return 409 already_resolved`.

Either fix closes the leak. The protected test `tasks.request.test.ts` row (c) only asserts the no-pending case; add a row (c') that exercises transition-then-cancel and asserts 409. The plan's own §13 "Open items" calls this out: "the `request` field in `PlainPayload` is optional; older messages don't carry it. Read-model handlers must handle `request === undefined` correctly" — that's the easy half; the harder half (transition supersede) was punted to the caller and the caller doesn't run it.

→ Anchor: `packages/server/src/routes/tasks.ts:277-304`; `packages/shared/src/task-pending.ts:20-46`; `packages/shared/src/task-pending.ts:8-9` (docstring contract that nobody honors).

---

### SHOULD-FIX

#### SF-1 — `ensureTaskThread.ts` keeps a dead `tx.delete(threads)` after `throw TaskThreadRaceLost` inside the same transaction

`packages/server/src/services/ensure-task-thread.ts:62-66`:

```ts
if ((result as { changes: number }).changes === 0) {
  // Roll back our speculative thread row and use the winner's id.
  tx.delete(threads).where(eq(threads.id, newThreadId)).run();
  throw new TaskThreadRaceLost();
}
```

The `tx.delete(...)` is dead code: the immediately-following `throw` aborts the better-sqlite3 transaction (drizzle-orm's `db.transaction` rethrows after rollback per better-sqlite3 docs at https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#transactionfunction---function). Rollback discards the speculative `tx.insert(threads)` already; the explicit `tx.delete` runs immediately before the throw and is then itself rolled back. The lore comment at `:62-63` is misleading — the rollback is what prevents the orphan, not the explicit delete. This still satisfies plan §5.4 ("The orphan thread is deleted in the same transaction so visibility never leaks") because rollback is functionally equivalent to deletion, but the code reads as if the delete is load-bearing.

Two acceptable shapes:
- (a) Remove the explicit `tx.delete` and replace the lore with "Transaction rollback discards the speculative insert; the throw is what triggers it."
- (b) Keep the delete and document it as "belt-and-braces — defensive against drivers that don't honor synchronous abort."

Either is fine; the current shape is the worst of both (dead code dressed as load-bearing).

→ Anchor: `packages/server/src/services/ensure-task-thread.ts:42-67`.

#### SF-2 — `rowToMessage` lifted from private to exported on `routes/threads.ts`; cross-route imports break the route-isolation convention

`packages/server/src/routes/tasks.ts:29` imports `rowToMessage` from `./threads.js`. Pre-L15 the helper was a private function inside `threads.ts`. The simplification scan MF1 already flagged the duplication; the resolution promoted `rowToMessage` to an export on the threads route. That fix removes one duplicate but introduces a route-to-route import that no other route module in `packages/server/src/routes/` does — every other route is a self-contained `createXRoutes(db, eventBus)` factory. The cleanest placement is `packages/server/src/services/row-mappers.ts` (or extend `services/append-plain-message.ts` to export it, since the helper is already a co-located concern). The current shape couples the tasks route to the threads route's surface; touching `threads.ts` becomes a concern for `tasks.ts` reviewers.

→ Anchor: `packages/server/src/routes/tasks.ts:29`; `packages/server/src/routes/threads.ts:104` (the export site).

#### SF-3 — PG migration uses `text` for `snoozed_until` instead of `TIMESTAMPTZ`

Plan §5.1: "pg: same with `TIMESTAMPTZ` for timestamps and `IF NOT EXISTS` clauses." Implementation (`drizzle-pg/0009_add_task_snoozes.sql:5`, `schema.pg.ts:485-486`) uses `text("snoozed_until")` — same as sqlite. Operationally, the snooze comparison `snoozed_until > now()` works because ISO-8601 strings sort correctly when generated in UTC, but pg's TIMESTAMPTZ would give index-friendly comparisons and rejection of malformed strings at insert time. Two existing tables in the same package (`tasks`, `bets`) keep `text` for `created_at` / `updated_at` for sqlite parity reasons — the codebase has chosen string timestamps consistently elsewhere. The plan called for the pg-side divergence; the implementation chose codebase consistency. Either is defensible; the plan and the impl diverge silently.

→ Anchor: `packages/db/drizzle-pg/0009_add_task_snoozes.sql:5`; `packages/db/src/schema.pg.ts:485-486`; `docs/work-packages/L15-plan.md:661`.

→ Resolution: pick one. If keeping `text`, edit the plan to acknowledge the codebase convention. If keeping the plan, switch the pg column to `timestamp({ withTimezone: true })`.

#### SF-4 — `WorkTeam.tsx` ships two unwired menu items in production

`packages/web/src/pages/WorkTeam.tsx:150-156` (`handleOpenThread`): "Page-level routing wire-up is a follow-up. For now […] use a window navigation hint" — the hash `#/tasks/:id` resolves to no route in the SPA. `handleReplyInThread` at `:163-166` is a documented no-op. Both ship live in the page; both are bound to menu items the user can click. Plan §13 names the page-level wire-up as a follow-up, but shipping a UI affordance that performs no observable action is worse than disabling the affordance.

Two acceptable shapes:
- (a) Disable the "Reply in thread…" menu item until the wiring lands; swap "Open thread" to a bare `console.warn` with a `data-testid` so e2e can verify the route is unwired.
- (b) Land the page-level routing in this story (the SHARED.md component budget allows it; opening the existing detail surface is a one-route addition).

Cosmetic: the `handleSnooze24h` does not handle the response (a 404 from a deleted task would surface no error to the user). A single `void fetch(...).catch(...)` with a toast hint would close the failure-mode. Out-of-scope filing acceptable.

→ Anchor: `packages/web/src/pages/WorkTeam.tsx:150-166`.

#### SF-5 — `tasks.request.test.ts` parity-test row (h) is missing

Plan §12 "Vitest assertion locks" for `tasks.request.test.ts` row (h): "`appendPlainMessage` is the SAME code path as the plain-type branch of `POST /api/threads/:id/messages` (parity test: same input → same row layout)." This assertion does not exist in `packages/server/src/routes/__tests__/tasks.request.test.ts` — neither as a parity test against the threads route nor as a function-mock spy. The L1-step9 regression test `threads.verdict-race.test.ts` covers the orthogonal verdict-race case, not the plain-type parity. Without this assertion, the next agent who touches `appendPlainMessage` cannot detect a behavioral drift between the two callers (e.g. the helper bumps `lastActiveAt` differently in one flow than the other).

→ Anchor: `packages/server/src/routes/__tests__/tasks.request.test.ts` (file present; row (h) absent); `docs/work-packages/L15-plan.md:1006` (the protected assertion text).

→ Resolution: add a parity case that posts a plain message with a request payload via BOTH `POST /api/tasks/:id/request` AND `POST /api/threads/:threadId/messages` (with the same logical input), and asserts the resulting message rows have identical `senderId`, `payload`, `clientKey`, and `lastActiveAt` semantics on the thread.

---

### CONSIDER

#### C-1 — `task-pending.ts` discards `RedactedPayload` messages but the plan does not specify the rule

`packages/shared/src/task-pending.ts:34` skips messages where `"redacted" in m.payload`. This is a reasonable interpretation of concept §4.5.8 mutability — a redacted message is no longer "the request that the founder made" — but the plan §3.3 does not specify the redaction rule. Worth adding one sentence to the helper's docstring: "Redacted messages are skipped because their payload no longer carries the original `request` field." The current behavior is correct; documenting the choice prevents a future agent from "fixing" it.

→ Anchor: `packages/shared/src/task-pending.ts:34`.

#### C-2 — `assertTaskParticipantAuthz` returns `status: 403` in its type but never produces it

`packages/server/src/services/task-authz.ts:17-18`: the `TaskAuthzResult` discriminator allows `status: 403 | 404`, but every non-`ok` branch returns 404 (lines 35, 43). The 403 case is dead. Plan §2.6 specifies "404 (not 403) on cross-team attempts to avoid leaking task existence" — so the 403 in the type union is reserved for a hypothetical future case (e.g. "agent is in the team but lacks scope"). Either the type narrows to `{ status: 404 }` and the 403 surface returns when it actually appears, or the docstring records the reservation. Today the type advertises a path that never executes.

→ Anchor: `packages/server/src/services/task-authz.ts:14-18`.

#### C-3 — `appendPlainMessage` does NOT add the sender to participants, leaving `tasks.ts` to call `ensureParticipant` in advance

The plan §5.4 helper signature comment said: "the helper APPENDS senderId via a conditional UPDATE inside the same `appendPlainMessage` transaction (see helper signature below)." The implementation chose differently: `append-plain-message.ts:122-125` returns 403 when `senderId` is not in `participants[]`, and the participant addition is handled BEFORE the call by `ensureParticipant` in `ensure-task-thread.ts`. The route (`tasks.ts:312-314`) calls `ensureParticipant` only when `!ensured.created` (i.e. the thread already existed). For the threads route delegate (`threads.ts:404-415`), no `ensureParticipant` runs — preserving the L1 behavior of 403-ing non-participants on `POST /api/threads/:id/messages`.

This split is correct (the L1 behavior must not change for the threads route), but it diverges from the plan's stated helper contract. Worth a one-line update to the helper's docstring at `append-plain-message.ts:18-20` documenting that participant addition is the CALLER's responsibility, not the helper's. Otherwise a future writer might attempt to "centralize" participant handling and break the L1 contract.

→ Anchor: `packages/server/src/services/append-plain-message.ts:99-125`; `docs/work-packages/L15-plan.md:274-276` (the plan's claim that the helper appends).

#### C-4 — `ensureTaskThread.ts:34` throws `Error` (not a typed sentinel) when a `task.threadId` points at a missing thread row

```ts
if (!existing) {
  throw new Error(`Thread ${task.threadId} pinned to task ${task.id} not found`);
}
```

Three throw sites in the same file (`:34`, `:72`, `:75`, `:84`) all use bare `Error`. The route's catch path doesn't differentiate them from `TaskThreadRaceLost`. Per plan §10 row 12 the response should be 500 (currently uncaught — propagates to Hono's `errorHandler`). The shape works but the mix of `TaskThreadRaceLost extends Error` (typed sentinel, caught) and bare `Error` (uncaught, propagates) reads inconsistently. CONSIDER a `TaskThreadInvariantViolation` typed throw for the "pointed-at thread missing" case so the route can emit a more precise 500 body.

→ Anchor: `packages/server/src/services/ensure-task-thread.ts:34,72,75,84`.

---

### What's working well

- CRITICAL-1 extraction is honest. `appendPlainMessage` covers exactly the rows in the plan §5.4 branch-enumeration table — no scope creep into verdict / re-open / questionnaire branches. The threads route's `if (input.type === "plain") return appendPlainMessage(...)` delegate at `threads.ts:404-415` is a six-line refactor that keeps the verdict-race semantics fully in-place at the original site.
- CRITICAL-2 race resolution is clean. Conditional `UPDATE ... WHERE thread_id IS NULL` returning `result.changes === 0` mirrors the L1-step9 verdict-race idiom precisely. Single transaction; same-tx rollback on race-lost; re-read winner outside the tx. Test (`tasks.request-concurrent.test.ts`) exercises `Promise.all` against a real db handle and asserts thread-row count=1, message-count=2, no orphans.
- CRITICAL-3 chokepoint is real. `assertTaskParticipantAuthz` is called in three places (request / snooze / un-snooze), always BEFORE `ensureTaskThread`, so a phantom or cross-team identity never pollutes participants. Tests (`tasks.request-authz.test.ts:131-189`) pin all four resolution-order rules.
- The `request_pending` `StatusChip` variant landed with both HTML and TSX edits; visual-regression test files exist for all three touched components.
- `task_snoozed` event is added to the discriminated union (`events.ts:210-217,242`) AND wired into the snooze handler (`tasks.ts:370-378`). Plan §5.7's "single-line addition" promise materialised as the strict-typed event, which forces consumer exhaustiveness.
- The protected `threads.verdict-race.test.ts` exists as a separate test file, locking the L1-step9 regression-pin OUTSIDE of `threads.test.ts` — a "silent deletion" of the regression now requires deleting a dedicated file, which `git diff --name-only` will surface.
- Foreign key + cascade on `task_snoozes.task_id` cleanly ties the per-user snooze to the task row's lifetime; PK `(user_id, task_id)` deduplicates re-snoozes (plan §10 row 7 contract holds).

---

## Resolution

### MF-1 — applied
- Files: `packages/server/src/routes/tasks.ts:300-308`,
  `packages/server/src/routes/__tests__/tasks.request.test.ts` (added (c')).
- Fix summary: route now checks `task.updatedAt > pending.createdAt` and
  returns 409 `already_resolved` for the cancel-supersede case. Added a
  regression test that requests, sleeps, transitions, and asserts the
  cancel returns 409.

### SF-1 — skipped (cosmetic; no behavior change)
- File: `packages/server/src/services/ensure-task-thread.ts:42-67`.
- Reason: the explicit `tx.delete(threads)` is dead code inside the
  rolled-back transaction, but removing it adds churn for zero behavior
  change and is out-of-scope vs the must-fix list.

### SF-2 — deferred
- File: `packages/server/src/routes/tasks.ts:29` imports `rowToMessage`
  from `./threads.js`.
- Reason: contained 6-line refactor to lift into `services/`; deferred to
  the next tasks-route touch to avoid scope creep.

### SF-3 — skipped (out-of-scope vs plan)
- Plan §5.1 / `schema.pg.ts:485-486` keep `text` for both column types per
  codebase consistency.
- Reason: not a correctness fix; either choice is defensible.

### SF-4 — deferred → follow-ups.md `L15-page-level-thread-routing`.
- File: `packages/web/src/pages/WorkTeam.tsx:150-166`.
- Reason: page-level routing wire-up is the documented L15 follow-up;
  out-of-scope for a code-review pass.

### SF-5 — applied (already present)
- File: `packages/server/src/routes/__tests__/tasks.request.test.ts:254-302`.
- Fix summary: row (h) parity test exists in the green-phase test file;
  the architecture review missed it. No additional change needed.

### CONSIDER C-1 / C-2 / C-3 / C-4 — skipped
- Cosmetic / docstring-only items; out-of-scope for the must-fix pass.
