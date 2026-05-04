# L15 — Plan Critique (Round 1)

**Reviewer.** Adversary.
**Plan under review.** `docs/work-packages/L15-plan.md`.
**Sources verified against.** `docs/work-packages/TRACK-L.md` §L15 (511–540), `docs/design-explorations/L15/approved.md`, `docs/concept/HUMAN_INTERFACE_LAYER.md` §4.5, `docs/work-packages/SHARED.md`, `.claude/rules/visual-parity.md`, `packages/server/src/routes/threads.ts`, `packages/server/src/routes/tasks.ts`, `packages/web/src/pages/WorkTeam.tsx`.

---

## Scoring (0–10 per dimension)

| # | Dimension | Score | One-line justification |
|---|---|---|---|
| 1 | Spec alignment | 9 | Every AC (AC-1..AC-6) and every Validation Scenario from §511–540 maps to an implementation artifact AND a verification artifact in §1 + §14. No silent gaps. |
| 2 | Layer integrity | 8 | Human Interface (web, design-system) → Meta (server routes, fabric n/a here) → Agent Runtime — no upward calls. The new `tasks.ts` handler delegates downward into `appendMessageToThread`. Minor concern: `TaskActionsMenu` lives in `packages/design-system` but imports `RequestVerb` from `@hyperidle/shared` (shared is a sibling, not upward). OK. |
| 3 | Contracts | 7 | Types are precise (`task-request-verbs.ts`, `RequestPayload`, `PendingRequestSummary`). BUT: (a) `tasks.list-pending` response shape is hand-wavy ("includeSnoozed=false (or whatever the contract is)" §12 row) — that's a literal admission of imprecision. (b) The `appendMessageToThread` helper signature is undefined — the plan says "extracted helper" without naming the input/output type. (c) Event payload for `task_snoozed` is sketched but `events.ts` integration is "⚠ FLAG" deferred to impl. |
| 4 | Data model | 8 | `task_snoozes` table is justified (sidecar workflow state, not a thread message). PK `(user_id, task_id)` is correct for upsert idempotency. Index is sensible. Pending derivation from message stream is the right call — no duplicate state. Minor: SQLite stores `snoozedUntil` as TEXT ISO; plan needs to lock the comparison semantics ("snoozed_until > now()") — string comparison works for ISO-8601 Z but only if the writer always emits the canonical form. Not lethal, but undocumented. |
| 5 | Naming | 9 | Verbs are snake_case identifiers, render-text is title-case, components are PascalCase, files match conventions. `derivePendingRequest` / `isVerbLegalForState` / `renderRequestText` are honest verb-noun names. `taskSnoozes` table name is clear. |
| 6 | Depth | 7 | Phases A–G are ordered with explicit dependencies. Each task names files and the blocking test. BUT: §5.4 task "Extract message-append body of `threads.ts:380-550-ish`" — "ish" is the architect dodging precision on a load-bearing refactor. The current handler at lines 380–550 contains verdict authz, resolvesMessageId race-handling, willReopen logic, and the VerdictRaceConflict sentinel — none of which the plan acknowledges. The extraction is significantly riskier than "thin convenience layer" implies. See CRITICAL-1. |
| 7 | Failure-mode coverage | 7 | §10 enumerates 13 abuse rows — strong. Race conditions on cancel are addressed (read-model derivation per call). BUT: (a) the lazy-thread-creation transaction race is unaddressed — two concurrent `POST /api/tasks/:id/request` calls could both see `tasks.thread_id IS NULL` and try to insert; the plan needs a unique constraint on `tasks.id` ⇒ thread or `INSERT ... ON CONFLICT` semantics. (b) The "task_updated_at < latest_request_msg.created_at" check in the pending derivation (§2.2) compares two different clocks (DB row update vs message createdAt) — if a transition writes `tasks.updated_at` before the message is committed, this can flicker. (c) No rate-limit verification — §10 row 1 has "⚠ VERIFY at impl time" which is a punted critical control. |
| 8 | Simplicity | 7 | Extending `PlainPayload` rather than adding a new MessageKind is the right call (concept §4.5.8 rule 5). `task_snoozes` is the minimum viable shape. BUT: (a) `appendMessageToThread` extraction is *premature consolidation* — it's done *for* this story to avoid duplication, but the threads handler has 6+ branches (review/questionnaire/verdict/plain × resolve/reopen/race) that the new caller does NOT need; the helper's signature has to encompass shapes the request endpoint never produces. Risk: the helper grows a "skip verdict logic" flag, drifting toward god-function. (b) `pendingRequest` projection in the list endpoint is acknowledged as parallel to L1's batched-unresolved query — fine — but the plan does not define the SQL; "single batched query joined onto the message stream" is hand-wave. (c) Six callback props on `Kanban` (`onRequestStateChange`, `onCancelPendingRequest`, `onOpenThread`, `onReplyInThread`, `onSnooze24h`, `onCopyLink`) — could be one `onTaskAction(taskId, action)` discriminated union; spec'd as six anyway. |
| 9 | Verifiability | 8 | §12 lists 16 protected test files with assertion locks per file. Route checklist (§6) exists with greps. Visual-parity concern partially handled (StatusChip / TaskCard / TaskActionsMenu HTML files all listed). BUT: (a) no protected test verifies that visual-parity threshold (5% pixel diff) passes for the three HTML files; the plan says `bun run ds:sync` "must pass" but doesn't include it in the route checklist's grep set. (b) AC-4 "drag is a no-op on task cards" is verified at the unit-test level but the keyboard-no-op assertion in `Kanban.no-drag.test.tsx` is described as "no drag listener attaches at the document level after Kanban mounts" — that is a brittle assertion (depends on @dnd-kit internals). |

---

## Composite

- **Average:** 7.78
- **Lowest:** 7 (Contracts, Depth, Failure-mode coverage, Simplicity)
- **Composite (lower of avg / min):** **7.0**
- **Threshold:** ≥ 7.
- **Verdict: PASS — with mandatory patches.**

The plan clears the bar but only barely. Four dimensions sit at 7. Two issues are CRITICAL and one is a CONFUSION the architect explicitly punted. The architect should apply the patches below before write-tests, but a re-critique round is not required if all CRITICAL items are addressed in the plan revision.

---

## CRITICAL (must fix before write-tests)

### CRITICAL-1 — `appendMessageToThread` extraction scope is understated

§5.4 + §8 task 8 describes a "pure refactor" extracting `threads.ts:380–550-ish`. The actual code in that range (verified by reading `packages/server/src/routes/threads.ts:460-560`) includes:

- verdict-specific authz (`isFounder`, `selfVerdict`, 403 on violation)
- `resolvesMessageRow` lookup and validation
- `willReopen` calculation
- `VerdictRaceConflict` sentinel + tx-internal `WHERE resolvedAt IS NULL` race guard
- distinct event emission paths (`thread_message_appended`, `verdict_emitted`, etc.)

The L15 request endpoint posts ONLY `plain` messages with `request` payload. None of the verdict/review/questionnaire branches apply. The extraction must either (a) keep all branches in the helper and have the request endpoint pass `type: "plain"` (helper handles all types), or (b) extract a narrower `appendPlainMessage` and leave verdict logic at the route. The plan does not specify which.

**Patch:** §5.4 must (i) name the helper signature explicitly: `appendMessageToThread(db, eventBus, ctx, threadRow, input: MessageInput): Promise<{message, thread}>` or the narrower `appendPlainMessage(...)`, (ii) state which branches move and which stay, (iii) name the protected test that asserts the verdict race (`threads.test.ts` row in §12 says "must stay green" — confirm the L1 step9-applied verdict-race test is still exercised post-refactor).

### CRITICAL-2 — Lazy-thread-creation race condition unaddressed

§5.4 step 2 says "Lazily create the task's thread if `tasks.thread_id IS NULL`" inside a transaction. Two concurrent `POST /api/tasks/:id/request` calls (same task, two founders, or one founder with two tabs) can both see `thread_id IS NULL`, both INSERT a thread row, both UPDATE `tasks.thread_id` — last-writer-wins leaves an orphan thread.

**Patch:** §5.4 must specify the race resolution. Options: (i) `UPDATE tasks SET thread_id = ? WHERE id = ? AND thread_id IS NULL` returning rowcount; if 0, re-read and use the existing thread_id. (ii) Add a unique constraint on `(host_kind, host_id)` for `host_kind='task'` and treat ON CONFLICT as "another tx already created it." Add a protected test in `tasks.request.test.ts` covering the concurrent-request case.

### CRITICAL-3 — `readSenderId` identity model assumption is wrong-by-default

§2.6 + §7 CONFUSION-2 assumes `readSenderId(c)` returns an `agentId` and that the founder is "seeded as an agent row with `role='founder'`". I verified `packages/server/src/routes/threads.ts:50-56`: `readSenderId` returns the `X-Identity` header OR the constant `DEFAULT_FOUNDER_ID = "u-founder"`. The string `"u-founder"` is a *user* identity prefix, not an agent. Whether `agents` table has a row with id `u-founder` is undocumented in the plan — the lazy-thread-creation step adds `senderId` to `participants[]` without verifying it resolves to either an agent or a user row. If it doesn't, downstream participant authz can succeed against a phantom identity.

**Patch:** §2.6 must (i) explicitly state "founder identity is the string returned by `readSenderId`, treated as opaque — participants list accepts any opaque string" — confirmed by reading `threadParticipantsSchema` (it's just strings). (ii) The `assertTaskParticipantAuthz(senderId, task)` helper §10-row-4 must define what "founder has access to task.team_id" means in code — does it query `agents` to find `role='founder'`? Does it accept any `u-*` identity? Add a protected test in `tasks.request.test.ts`: a request from `senderId="u-other-team-founder"` against a task in team A must return 404 (per §10 row 10).

---

## WARNINGS (should fix; address in plan revision but not gate-blocking)

### W-1 — Pending derivation clock-skew (§2.2)

The predicate `task.updated_at < latest_request_msg.created_at` mixes two distinct write paths' timestamps. A transition that writes `tasks.updated_at` AFTER the message append (because the agent posts a verdict that triggers a transition) can leave `pending=true` for a beat. Address: derive pending purely from messages (latest non-cancel request is "pending" until a `cancel_request` or a `verdict` message lands in the same thread).

### W-2 — Rate-limiter punted (§10 row 1)

"⚠ VERIFY at impl time that the rate-limiter is registered globally on `/api`" is the architect outsourcing a security control to write-code. Either confirm the middleware exists now (a 30-second grep of `packages/server/src/middleware/`) or add an explicit task to Phase C to wire one before the new endpoints land.

### W-3 — Mobile bottom-sheet deferral risks AC-2 (§2.8)

"L15 desktop-first ships" — but AC-2 says "each task gains an affordance to request a state change OR open the task's attached thread" with no platform qualifier. Playwright `team-board-request.spec.ts` runs desktop only per §12. If the mobile shell renders a broken centred dialog, the AC is met by letter, failed by intent. Add a Playwright mobile-viewport check OR explicitly scope the AC in TRACK-L (out of L15's authority — flag in follow-ups).

### W-4 — Visual parity rule under-enforced (§4.4, §4.5)

The plan says StatusChip.html / TaskCard.html / TaskActionsMenu.html "must be updated by Claude Design first; the TSX matches" — correct intent. But §12 protected tests do not include the visual-regression test (`bun run ds:sync` or equivalent) in the protected list. Add it. Per `.claude/rules/visual-parity.md`, the 5% pixel-diff threshold is non-negotiable; not testing for it leaves a hole.

### W-5 — `bun run db:generate` not gated (§8 task 7)

"Run `bun run db:generate` and inspect" is a manual step. The CI gate (§8 task 24 `bun run check`) does not exercise the generated drizzle artifacts. Add a test that the migration applies cleanly to both sqlite and pg drivers (the existing `db/__tests__/schema-parity.test.ts` should cover this — confirm).

### W-6 — `cancel_request` no-op-on-already-cleared returns 400

§10 row 12: "if the server has already cleared the pending, the cancel itself becomes a no-op (its `cancel_request` legality check fails) and returns 400. Toast on the client surfaces the no-op as 'Already resolved.'"

400 is the wrong shape for "the server already did the thing you asked." 409 (Conflict) is more honest — "your view of state is stale" — and lets the client distinguish "you sent a malformed verb" (400) from "the action is moot" (409). Minor — but client toast logic gets cleaner.

---

## OBSERVATIONS

### O-1 — Six callback props on Kanban

`onRequestStateChange`, `onCancelPendingRequest`, `onOpenThread`, `onReplyInThread`, `onSnooze24h`, `onCopyLink` — could be one `onTaskAction(taskId, action: TaskAction)` where `TaskAction` is a discriminated union. Six props is fine; one is cleaner. Architect's call.

### O-2 — `cancel_request` legality "any state IFF pending"

§2.4 says `cancel_request` is "legal in any state IFF the task is currently pending." Fine — but the `TASK_VERBS_BY_STATE` matrix omits it from every state. The legality check is therefore split between two code paths (matrix + special-case). Single-source-of-truth principle is mildly violated. Acceptable; document the split with `@lore`.

### O-3 — Letter shortcut `H` collision (§2.7)

`H` = `Request hold` on `in_progress` AND `Hand back` on `accepted`. "First-wins by render order" — fine, but since render order depends on the matrix in §2.4 and the matrix is data, the binding is fragile if a future story reorders verbs. Add a test asserting the bindings are stable.

### O-4 — `INITIAL_TASKS` mock data carries `pendingRequest: null`

§4.2 leaves `WorkTeam.tsx` with mocked data; live-fetch wiring is "out of L15 scope but the type signature lands now." This is fine, but the AC-2 V-2c Playwright test ("reload → message visible in the task's thread") MUST run against the real API + live wiring, not against `INITIAL_TASKS`. Confirm the e2e harness exercises the server, not the page-mock fallback. The plan implies but does not assert this.

### O-5 — `request_pending` Status name

Existing `Status` enum uses lowercase single words: `healthy | behind | blocked | paused | done | error`. Adding `request_pending` (snake_case) breaks the convention. Either rename to `pending` (overloaded — taken by what?) or accept the naming inconsistency. Minor.

---

## VERDICT

**REVISE** — composite 7.0 (passes threshold). Apply the three CRITICAL patches above to the plan, address WARNINGS in the revision text where cheap, then proceed to `/write-tests`. A second critique round is NOT required if CRITICAL-1, CRITICAL-2, CRITICAL-3 are addressed in `L15-plan.md` revisions.

### Patches the architect must apply (round 1)

1. **§5.4 — name `appendMessageToThread` signature** explicitly; state which branches (verdict, reopen, race) move into the helper vs stay at the threads route. (CRITICAL-1)
2. **§5.4 step 2 — specify the lazy-thread-creation race resolution** (conditional UPDATE returning rowcount, or unique constraint + ON CONFLICT). Add a protected test for concurrent requests. (CRITICAL-2)
3. **§2.6 + §10 row 4 — define `assertTaskParticipantAuthz` precisely**; document that `readSenderId` returns an opaque identity string (verified `threads.ts:50-56`), and add a protected test for cross-team founder isolation. (CRITICAL-3)
4. **§2.2 — change pending predicate to message-stream-only** (drop the `task.updated_at` clock comparison). (W-1)
5. **§10 row 1 — confirm-or-add rate-limiter** before the new endpoints land. (W-2)
6. **§12 — add visual-regression test** to the protected-tests list (`bun run ds:sync` or equivalent against TaskActionsMenu.html / TaskCard.html / StatusChip.html). (W-4)
7. **§10 row 12 — change cancel-on-cleared response** from 400 to 409. (W-6)

After patches: re-emit the plan; no second critique needed unless the patches introduce new contracts.

---

**Status: CLEAR to proceed AFTER applying the 7 patches above.** No second round required. Hand back to architect for revision, then to `/write-tests`.
