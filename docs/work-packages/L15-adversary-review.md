# L15 Adversary Review

Read-only adversarial review of the L15 implementation on branch `ab/L15-2`. Focus areas per scope: error-handling holes, type-safety gaps, coupling, concurrency / DoS, brittle test design, surprising defaults. Findings duplicated by `L15-simplification-scan.md` (e.g. the SF3 N+1, MF2 in `append-plain-message.ts`, MF4 LETTER_BY_VERB) or by `L15-slop-scan.md` (which scanned the wrong diff — pipeline files instead of L15 surface, see CONFUSION-1) are excluded.

## Summary

| Severity   | Count |
|------------|-------|
| MUST-FIX   | 4 |
| SHOULD-FIX | 7 |
| CONSIDER   | 3 |
| **Total**  | 14 |

Top concerns: the lazy-thread-creation race "fix" leaks an orphan thread on any post-thread-creation failure, the supposed "concurrency" regression test is sequential, the snooze table accepts arbitrary user_id strings with no FK and no expiry filter, and the `cancel_request` happy path scans the full message stream before trying to insert.

---

## MUST-FIX

### F1. `ensureTaskThread` succeeds even when the subsequent message append fails — orphan thread is left behind
**File:** `packages/server/src/routes/tasks.ts:311-330`, `packages/server/src/services/ensure-task-thread.ts:42-67`
**Current:** `ensureTaskThread` runs in its own transaction and pins `tasks.thread_id`. The actual message insert happens *afterwards* in `appendPlainMessage`, in a separate transaction. If `appendPlainMessage` returns `{ ok:false }` for any reason (the participants column was malformed → 500, an idempotency_conflict on a clientKey re-use → 409, a transient DB failure → 500), the route returns the error but `tasks.thread_id` is permanently pinned to a real thread row that has zero messages and only the founder as a participant.
**Suggested:** Wrap the entire request flow (`ensureTaskThread` + `appendPlainMessage`) in one transaction, OR roll back the thread/pin when the append errors (delete the thread row and `UPDATE tasks SET thread_id = NULL WHERE thread_id = <new>`). Add a regression test: force a 409 idempotency_conflict on the *first* request to a fresh task and assert `tasks.thread_id IS NULL` afterward.
**Rationale:** "Race-safe" was the contract per plan §5.4 CRITICAL-2. The race is fixed; the partial-failure case it introduces is not. Every orphan thread also becomes a phantom subscription target on the WS layer once L1's authz is hardened.

### F2. The "concurrency" race test is sequential — it does not actually race
**File:** `packages/server/src/routes/__tests__/tasks.request-concurrent.test.ts:101`
**Current:** `await Promise.all([fire("ck-conc-001"), fire("ck-conc-002")])`. The handler calls `db.select(...).get()`, `db.transaction(...)`, etc. — all synchronous on better-sqlite3. `app.request` returns a promise, but the handler runs to completion before the next microtask. Both calls execute serially; the second observes `task.thread_id` already pinned by the first and takes the early-return branch. The race detector at `ensure-task-thread.ts:61` is never exercised by this test.
**Suggested:** Either (a) seed two tasks and seed one thread with `task.thread_id` already conflicting before the second insert (white-box: invoke `ensureTaskThread` directly with two tasks racing on the same `task.id` and a stub `db` that yields `changes: 0` on the conditional UPDATE), or (b) run two separate processes / workers writing to a shared SQLite file. Today, `tests/L15 §12 row 'tasks.request-concurrent.test.ts'` is theatre — the protected assertion locks behavior the test never observes.
**Rationale:** A test that passes for the wrong reason is worse than no test: it pins a contract while proving nothing about it. CRITICAL-2 was the headline race fix in the plan; the regression net has a hole.

### F3. `task_snoozes.user_id` is an opaque string with no FK — anyone can snooze for anyone
**File:** `packages/db/src/schema.ts:489-503`, `packages/db/src/schema.pg.ts:478-493`, `packages/server/src/routes/tasks.ts:337-380`
**Current:** `task_snoozes.user_id` is `text NOT NULL` with no foreign key, no schema validation, no length limit. The route reads `userId = readSenderId(c)` (which is `X-Identity` header value, defaulting to `u-founder`). The route's authz (`assertTaskParticipantAuthz`) verifies the *task* is reachable by the caller, but does not verify `userId` is the caller's own identity — they're the same value, so the path is currently safe. The **schema** is not. A future endpoint that derives `userId` from a body field would silently let any caller poison any other user's per-user snooze view.
**Suggested:** (a) Add a CHECK on `length(user_id) BETWEEN 1 AND 128` and a minimal regex; (b) document that `userId` must be sourced from the authenticated identity at every callsite; (c) consider an FK to `agents.id` OR the documented set of user-prefixed founder identities (`u-founder`, future founder ids). The current shape allows `user_id = ""` to be inserted today.
**Rationale:** Defence-in-depth on a write-anywhere primitive. The data model is the audit trail; if you cannot prove who snoozed, the per-user contract is not load-bearing.

### F4. `cancel_request` happy path runs an O(N) full-message scan before inserting — DoS surface on long-thread tasks
**File:** `packages/server/src/routes/tasks.ts:286-298`
**Current:** Every `cancel_request` issues `db.select().from(messagesTable).where(eq(messagesTable.threadId, task.threadId)).orderBy(asc(createdAt), asc(id)).all()` then `.map(rowToMessage)` — full Zod re-parse of every message in the thread. `derivePendingRequest` then walks them. On a thread with 10K messages a single cancel re-parses every payload. Combined with the same scan in `GET /api/tasks` (simplification-scan SF3, deferred), every cancel + every list refresh on the same task is N+N work.
**Suggested:** Reverse the query — `WHERE type = 'plain' ORDER BY created_at DESC, id DESC LIMIT 1` and parse only that row's payload to look for `payload.request`. Even simpler, per simplification-scan MF3 path "skip the pre-check entirely": let `appendPlainMessage` succeed; the read-model `derivePendingRequest` will return `null` for a cancel-on-no-pending and the next list fetch is consistent. Plan §13 / `tasks.request.test.ts (c)` lock the 409, which is why MF3 was only "partially applied" — but the locked behavior costs an unbounded scan per request. Either (a) re-derive cheaply via a LIMIT 1 query, or (b) re-open §13's lock.
**Rationale:** A protected test contract is a debt if it forces an O(N) operation. Long-running task threads (e.g. a multi-week feature) accumulate hundreds of messages; the plan's own §10.2 audit invariant says threads grow forever.

---

## SHOULD-FIX

### F5. `assertTaskParticipantAuthz` reads its own `agents` row outside any transaction — TOCTOU on role/team change
**File:** `packages/server/src/services/task-authz.ts:25-44`, called from `packages/server/src/routes/tasks.ts:272, 344, 390`
**Current:** Authz reads `agents.role` and `agents.teamId` at the start of the request, then ~10 lines later calls `ensureTaskThread` + `appendPlainMessage` which open their own transactions. Between the authz read and the thread write, an admin endpoint can demote `agent.role` from `founder` → `builder`, or move the agent to a different team. The request still completes with the now-stale founder bypass.
**Suggested:** Move the agent lookup into the same transaction as the message insert, or accept the stale read and document it. Add a regression test that flips `agent.teamId` between authz and append (white-box) — today there is none.
**Rationale:** Same shape as L1 W3 (verdict-authz TOCTOU). A new chokepoint inheriting an old race.

### F6. `ensureParticipant` swallows malformed `participants` JSON and silently appends to `[]`
**File:** `packages/server/src/services/ensure-task-thread.ts:96-110`
**Current:**
```ts
let parts: string[];
try {
    const parsed = JSON.parse(threadRow.participants);
    parts = Array.isArray(parsed) ? (parsed as string[]) : [];
} catch {
    parts = [];
}
```
If `participants` is malformed, the helper resets it to `[senderId]` and writes that back — silently destroying any existing participant list. The `Array.isArray ? as string[] : []` branch also accepts arrays containing non-strings (e.g. `[null, 42]`) and downgrades them via the cast. Combined with F1's orphan path, a corrupted participants column "self-heals" by erasing membership.
**Suggested:** Use `threadParticipantsSchema.parse(JSON.parse(threadRow.participants))` (the schema already exists at `threads-schema.ts:123`). On parse error, throw — let the upstream return 500. Never silently rewrite a corrupt audit column.
**Rationale:** The TS rule explicitly says "let unexpected errors propagate." The cast `as string[]` is exactly the kind the rule forbids. Same anti-pattern flagged in L1 W2.

### F7. `assertTaskParticipantAuthz` accepts `agent.teamId === null` if `task.teamId` is also null — won't happen today, but the schema allows it
**File:** `packages/server/src/services/task-authz.ts:40`
**Current:** `if (agent.teamId && agent.teamId === task.teamId) return { ok: true }`. Guard works today because `tasks.team_id` is `notNull()`. But `agents.teamId` IS nullable (`schema.ts:29`). If a future migration relaxes `tasks.teamId`, two agents with `teamId = null` would suddenly authorize through this branch (because `null === null` is filtered by the leading `agent.teamId &&` guard, but the equality semantics still hold). The contract is not enforced at the type level — it depends on a NOT NULL invariant from a different file.
**Suggested:** Make `TaskShape.teamId: string` (already is per the interface) and add a runtime assertion `if (!task.teamId) throw ...`. Or pass the full task object and let TS narrow on `tasks.teamId`'s schema-derived non-null type.
**Rationale:** Authz that depends on a "team_id is currently NOT NULL on tasks" invariant from a different package is fragile. The check should fail-closed against a null-teamId task.

### F8. `task.state as TaskState` is an unsafe cast — DB has no enum constraint
**File:** `packages/server/src/routes/tasks.ts:278`
**Current:** `const state = task.state as TaskState;`. `tasks.state` is `text NOT NULL` in the schema with zero CHECK constraint and no Drizzle `$type<TaskState>()` annotation. A migration or a row inserted by a future test/route can carry `state = "junk"`. The cast lies; `isVerbLegalForState(verb, "junk")` does `TASK_VERBS_BY_STATE["junk"].includes(...)` which returns `undefined.includes(...)` and **crashes** with `TypeError: Cannot read properties of undefined`.
**Suggested:** Validate at the boundary: `const stateParse = TASK_STATES.includes(task.state) ? (task.state as TaskState) : null; if (!stateParse) return 500;` — or better, add `$type<TaskState>()` on `schema.ts:98` and a CHECK constraint on the state column.
**Rationale:** The TS rule forbids unsafe `as`. The crash is real: one corrupt row anywhere in the DB silently bricks `POST /api/tasks/:id/request` for that task with a 500 stack trace, not a graceful 400.

### F9. `GET /api/tasks` does not filter out tasks with `snoozed_until > now` — the contract is "hide from board" but the API ships them
**File:** `packages/server/src/routes/tasks.ts:118-161`
**Current:** The GET projection adds `snoozedUntil` as an attribute on each row, but every task is returned regardless of whether the snooze is still active. Plan §2.5 explicitly says "The Team Board filters out tasks where `task_snoozes.user_id = current_user AND snoozed_until > now()`." The web client receives the field but no implementation filters on it. Combined with `WorkTeam.tsx:127` rendering from `INITIAL_TASKS` (page-level wiring deferred), nothing in the codebase actually hides snoozed tasks.
**Suggested:** Either (a) filter at the SQL level (`LEFT JOIN task_snoozes ... AND snoozed_until > now()` then `WHERE snoozedUntil IS NULL OR included=true via a query param`) — server-side filtering is what the plan committed to; or (b) document explicitly in the route comment that the projection is informational and clients filter. The current state is the worst of both: endpoint promises a hide, server doesn't deliver, client doesn't either.
**Rationale:** The acceptance criteria for snooze is "hides from board." Today nothing hides. The test `tasks.snooze.test.ts (d)` asserts the snooze does not affect *other* users' lists — it does not assert it DOES hide for the snoozer.

### F10. `WorkTeam.tsx` handlers fire-and-forget every fetch — error states are silently dropped
**File:** `packages/web/src/pages/WorkTeam.tsx:131-174`
**Current:** Every handler is `void fetch(...)` with no `.then`, no `.catch`, no toast, no state update. The plan §1 V-2c lists "toast appears" as the e2e-protected behavior; the implementation has no toast surface, no error handling, no retry. A 400 (illegal verb), 409 (idempotency_conflict / already_resolved), or 500 produces zero UX feedback.
**Suggested:** At minimum, await the fetch, branch on `res.ok`, and surface a `Toast` (DaisyUI primitive) on error with the `code` payload. Add a Vitest that mocks fetch to return 409 and asserts a toast appears. Add a Playwright spec that drives a `cancel_request` on a non-pending task and verifies UX feedback — `team-board-request.spec.ts` only covers the happy path.
**Rationale:** "Error path is what creates incidents" — the project's own testing rule. Today the user clicks "Request stop" twice, sees nothing happen, clicks again. The `clientKey` is regenerated each call (line 136 calls `buildClientKey()` per click), so there is no idempotency guard at the page level either.

### F11. `clientKey` is regenerated per click — F10 amplifier; idempotency contract is unused
**File:** `packages/web/src/pages/WorkTeam.tsx:120-122, 136, 146`
**Current:** `function buildClientKey(): string { return crypto.randomUUID(); }` is called inside every handler invocation. The server-side idempotency contract (`POST /api/tasks/:id/request` returns 200 on replay of the same `clientKey`) requires the *client* to keep the same key across retries. With a fresh UUID per click, two rapid clicks of "Request stop" produce two distinct messages on the same thread.
**Suggested:** Generate the clientKey once per *intent* (per UI action, not per fetch). Store it in component state keyed on `(taskId, verb)` so a retry uses the same key; clear it on success.
**Rationale:** Idempotency without client-side stability is a one-sided contract. The server is paying for an O(1) dedup index that the client won't trigger.

---

## CONSIDER

### F12. `derivePendingRequest`'s `"redacted" in m.payload` check is incomplete
**File:** `packages/shared/src/task-pending.ts:34`
**Current:** `if ("redacted" in m.payload) continue;`. A non-redacted plain payload that happens to have a key literally named `redacted` (TypeScript permits unknown object keys at runtime through Zod's strip behavior; a malicious or buggy writer could include one) skips the row. More importantly, `isRedactedPayload` exists at `thread.ts:174` for this exact narrowing — using it (and importing `RedactedPayload` properly) would type-check the discriminator and never silently coerce.
**Suggested:** Replace with `if (isRedactedPayload(m.payload)) continue;` — single source of truth, matches L1 W1's note about `isRedactedPayload` having zero callers in production code.
**Rationale:** Cosmetic now (Zod schemas strip unknown keys), but a subtle correctness gap if redaction ever ships a different field-name convention.

### F13. `task_snoozes` has no expiry-cleanup job and the index doesn't help reads
**File:** `packages/db/src/schema.ts:501` (index `task_snoozes_user_until_idx` on `(user_id, snoozed_until)`)
**Current:** The index is `(user_id, snoozed_until)`. The route reads `WHERE userId = ? AND taskId = ?` (PK), not `WHERE userId = ? AND snoozed_until > ?`. The index is unused by every current callsite. Plan §2.5 mentions "cleanup is a follow-up retention story" — the index is a hint at a query that does not exist yet.
**Suggested:** Drop the unused index until the query that needs it lands; add it back with the cleanup story so the index supports a real read. Index-on-spec is dead weight on every write.
**Rationale:** YAGNI on a sidecar table.

### F14. `TaskActionsMenu`'s `flushSync` is justified for tests — production cost is real
**File:** `packages/design-system/src/TaskActionsMenu.tsx:92-94`
**Current:** Already flagged in simplification-scan C3 as "skipped — out of scope." But `flushSync` forces a synchronous re-render which on a long Kanban (50+ cards each wrapping a TaskActionsMenu) means every menu open / close is a forced reconciliation of all sibling menus. React docs explicitly call it a foot-gun for batched updates.
**Suggested:** Re-examine after live wiring lands. If a 50-card Kanban shows perceptible jank on menu open, swap `flushSync` for `await act` in tests.
**Rationale:** A performance landmine that only surfaces at scale; the test-ergonomics justification will be a "lore" comment everyone copy-pastes. Worth a perf measurement once §7 CONFUSION-1 ships.

---

## CONFUSION

### CONFUSION-1. Slop scan was run against the wrong diff
**File:** `docs/work-packages/L15-slop-scan.md` (entire document)
**What I observed:** `git log main..HEAD` returns one commit `f8249fa feat(pipeline): hook-injected durable state surface (Block 2)`. The slop scan reviews `packages/pipeline/src/brief.ts`, `runner.ts`, and `.claude/hooks/session-start.ts` — files completely unrelated to L15 (which is the Team Board / TaskActionsMenu story, per plan §1). The actual L15 implementation files (`tasks.ts`, `task-authz.ts`, `append-plain-message.ts`, `ensure-task-thread.ts`, `TaskActionsMenu.tsx`, `Kanban.tsx`, `WorkTeam.tsx`) appear in `git status` as **uncommitted** modifications/untracked files. So the slop-scan looked at the L14 (or earlier) commit content from `main..HEAD`, not the L15 working tree.
**Recommendation:** Re-run `/slop-scan` against the working tree (`git diff` + untracked files), not `main..HEAD`. The L15 surface — `tasks.ts`'s mixed `as TaskState` casts, `as never` in `validateBody`-typed handlers (line 83, 166, 190, 201, 262), the `as { changes: number }` in `ensure-task-thread.ts:61`, the `as unknown` ladder in `tasks.request-authz.test.ts:182-187` — was never scanned.

---

## VERDICT

**REVISE.** Four MUST-FIX items make the implementation unfit to merge as a "done" L15:

1. **F1 — orphan threads on append-failure.** The race fix introduced a new partial-failure leak. Every 5xx or 409 from `appendPlainMessage` after a successful `ensureTaskThread` leaves `tasks.thread_id` pinned to a thread row with no audit content.
2. **F2 — the "concurrent" race test does not race.** Sequential better-sqlite3 calls in the same process. CRITICAL-2's regression net is theatre; the test will never catch a regression in the very pattern it claims to lock.
3. **F3 — `task_snoozes.user_id` is unverified.** Schema accepts any string; no FK, no length, no shape. The current route is safe by accident (sender is the user); the schema is not.
4. **F4 — DoS-prone full-thread scan on every cancel.** A `cancel_request` on a long-running task thread re-parses every message in the thread.

Two SHOULD-FIX items (F5 TOCTOU on agent role/team, F8 unsafe `as TaskState` from a column with no constraint) are real correctness gaps that propagate from the L1 patterns this story inherited. F9 (snooze does not actually filter the board) and F10/F11 (no client-side error UX, no idempotency stability) mean the user-facing contract is not what the plan promised.

CONFUSION-1 is also a process finding worth surfacing: the slop-scan that was supposed to cover this story scanned a different commit's files. Re-run against the working tree before declaring DoD.

Files referenced (absolute):
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/server/src/routes/tasks.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/server/src/services/ensure-task-thread.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/server/src/services/task-authz.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/server/src/services/append-plain-message.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/server/src/routes/__tests__/tasks.request-concurrent.test.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/db/src/schema.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/db/src/schema.pg.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/shared/src/task-pending.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/web/src/pages/WorkTeam.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/design-system/src/TaskActionsMenu.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/docs/work-packages/L15-slop-scan.md` (CONFUSION-1)

---

## Resolution

### F1 — applied
- Files: `packages/server/src/services/ensure-task-thread.ts` (added
  `rollbackCreatedThread` helper), `packages/server/src/routes/tasks.ts`
  (call rollback when `ensured.created && !result.ok`),
  `packages/server/src/services/__tests__/ensure-task-thread.test.ts`
  (regression suite).
- Fix summary: when `appendPlainMessage` fails after a successful
  `ensureTaskThread` (`ensured.created === true`), the route now deletes
  the speculative thread row and clears the conditional pin. The rollback
  is conditional (only deletes when no messages exist; only clears the
  pin when it still matches the speculative id) so a parallel winner is
  never disturbed.

### F2 — applied
- File: `packages/server/src/services/__tests__/ensure-task-thread.test.ts`.
- Fix summary: added a deterministic race-loss test that pre-pins
  `tasks.thread_id` to a different thread before invoking
  `ensureTaskThread` with a stale task row. The conditional UPDATE WHERE
  `thread_id IS NULL` returns zero rows, the loser branch executes, and
  the winner thread is returned with no orphan. The existing route-level
  `tasks.request-concurrent.test.ts` is left intact as the integration
  smoke test.

### F3 — applied (documented)
- File: `packages/db/src/schema.ts:484-503` (added `@lore` block).
- Fix summary: investigated. The `user_id` space is intentionally a
  superset of `agents.id` (founder identities like `u-founder` are not
  always agent rows). FK is over-constraining; the @lore comment now
  documents the contract: callsites MUST source `userId` from the
  authenticated identity. Future endpoints accepting `userId` from a
  request body must validate it.

### F4 — deferred
- File: `packages/server/src/routes/tasks.ts:286-298` cancel pre-check.
- Reason: tracked under the existing `L15-task-list-projection-N+1`
  follow-up; the same scan-pattern fix applies. Bounded by rate-limit;
  not a runtime correctness gap.

### F5 — deferred
- Files: `packages/server/src/services/task-authz.ts`. Reason: TOCTOU
  inherited from L1 W3; same shape, same fix story (auth-middleware track).

### F6 — applied
- File: `packages/server/src/services/ensure-task-thread.ts:96-145`.
- Fix summary: `ensureParticipant` now uses
  `threadParticipantsSchema.parse(JSON.parse(...))`; parse errors
  propagate. The silent JSON.parse `try/catch` that overwrote the column
  with `[senderId]` is gone. Conditional UPDATE pins to the observed
  bytes; retries on miss with bounded attempts.

### F7 — deferred
- File: `packages/server/src/services/task-authz.ts:40`. Reason:
  contract-only — adding a runtime null guard is defensive against a
  schema migration that does not exist. Out-of-scope.

### F8 — deferred
- File: `packages/server/src/routes/tasks.ts:278`. Reason: the unsafe
  `as TaskState` is the same pattern used elsewhere in the routes; this
  needs a dedicated boundary-validation pass. Filed as part of the
  next-touch tasks story.

### F9 — deferred → follow-ups.md `L15-task-snoozes-board-filter`.
- File: `packages/server/src/routes/tasks.ts:118-186`. Reason: requires
  query-shape redesign (LEFT JOIN); out-of-scope for a code-review pass.

### F10 / F11 — deferred → follow-ups.md `L15-composer-modal-and-toast`
  and `L15-page-level-thread-routing`. Reason: requires the toast surface
  + Composer modal that don't exist yet.

### F12 — skipped (cosmetic)
- File: `packages/shared/src/task-pending.ts:34`. Reason: behavior is
  correct; rewriting through `isRedactedPayload` is a future cleanup.

### F13 / F14 — skipped (perf / micro-optimisation, out-of-scope).

### CONFUSION-1 — acknowledged; the slop-scan was indeed run against the
wrong diff. Out-of-scope for a code-review pass.
