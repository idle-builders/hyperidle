# L15 — Simplification Scan

Read-only findings. Developer applies fixes.

Severities: **MUST-FIX** = clear over-abstraction or bloat; **SHOULD-FIX** = judgment call but worth doing; **CONSIDER** = style/preference.

| Severity   | Count |
|------------|-------|
| MUST-FIX   | 4     |
| SHOULD-FIX | 7     |
| CONSIDER   | 5     |
| **Total**  | 16    |

---

## MUST-FIX

### MF1 — `rowToMessage` duplicated verbatim across two route files
**File:** `packages/server/src/routes/tasks.ts:39-64` and `packages/server/src/routes/threads.ts:104-131`
**Current:** Both files declare a private `rowToMessage(row: DbMessage): Message` with the identical Zod-parse → switch-on-type body. The `tasks.ts` copy was added by L15 to support `derivePendingRequest` row mapping; it is byte-identical to `threads.ts:104` aside from the lost JSDoc.
**Proposed:** Either (a) inline the call in `tasks.ts` once (it has only two call sites, both inside the same handler — three lines of `messageRowSchema.parse + base + switch` is acceptable), or (b) keep one private copy in `threads.ts` and import from there. Do not extract to a third file just for this; one inline copy is fine.
**Rationale:** Two structurally-identical converters in the same package will drift on the next message-type addition. The L15 plan already required `appendPlainMessage` to ship its own copy (`append-plain-message.ts:68-89`), so we now have **three** copies of the same loader. Pick one to keep.

### MF2 — `appendPlainMessage` carries its own `rowToThread` + `rowToMessage` copies
**File:** `packages/server/src/services/append-plain-message.ts:53-89`
**Current:** Service-layer file re-implements `rowToThread` (53-66) and a plain-only `rowToMessage` (68-89) so the helper can return its own materialised `Message` and `Thread`. Includes a defensive `if (parsed.type !== "plain") throw` (`:83-87`) for a row the helper itself just inserted with `type: "plain"`.
**Proposed:** Drop the throw — it is "unreachable" by the helper's own contract (only `plain` rows are inserted in the same function, ten lines above). If the boundary insists on belt-and-braces, an `exhaustiveAssert(parsed.type)` would at least be honest. Better: have the helper return `{ messageId, threadId }` and let the caller re-load on its own terms — both call sites already do `db.select().from(...).get()` once more after the call.
**Rationale:** Three near-identical row→domain converters in three files (MF1 + this) is the smell. Either centralise once or inline; the current state is the worst of both.

### MF3 — `cancel_request` early-exit re-derives pending instead of reading the projection
**File:** `packages/server/src/routes/tasks.ts:307-340`
**Current:** The `cancel_request` branch in `POST /:id/request` issues its own `db.select().from(messagesTable).orderBy(...).all()` + `msgRows.map(rowToMessage)` + `derivePendingRequest(msgs)` to validate that *something* is pending. This is the same query the `GET /` projection runs at `:166-180`.
**Proposed:** Either drop the pre-check entirely and let `appendPlainMessage` succeed (an extra "cancel" plain message on a thread with no pending is a no-op the read-model already handles — `derivePendingRequest` returns null for it), or keep the validation but accept that a `409 already_resolved` is not load-bearing. The `try/catch` swallowing parse errors at `:323-328` is deadweight: if the row is malformed, the response should be 500, not "no pending."
**Rationale:** The verb→state matrix (`isVerbLegalForState`) already rejects every other illegal verb at line 335. `cancel_request` is the only special case, and its 409 fires only when (a) the user double-clicks the cancel button, or (b) two clients race. The cost is one extra full-thread scan per cancel. The simpler shape: skip the pre-check, accept the message, and let UI poll the projection.

### MF4 — `LETTER_BY_VERB` has duplicate shortcut bindings (silent ambiguity)
**File:** `packages/design-system/src/TaskActionsMenu.tsx:54-62`
**Current:**
```
request_hold: "H",
hand_back: "H",         // duplicate
request_changes: "C",
cancel_request: "C",    // duplicate
```
The keyboard handler at `:166` does `items.find(it => it.shortcut === upper)`, so pressing **H** in `in_progress` (where both `request_hold` and `hand_back` are legal) silently fires `request_hold` and shadows `hand_back`. Same for **C** when a pending request exists in `review` — `request_changes` wins, `cancel_request` is unreachable by keyboard.
**Proposed:** Either give every verb a unique letter (e.g. `hand_back: "K"` for "back", `cancel_request: "X"`), or drop `LETTER_BY_VERB` entirely — the secondary text + click affordance is enough for Tier 2. Don't ship a shortcut table that lies.
**Rationale:** A keyboard accelerator that fires the wrong action is worse than no accelerator. This is a correctness bug masquerading as polish.

---

## SHOULD-FIX

### SF1 — `taskSnoozes` upsert hand-rolled instead of `onConflictDoUpdate`
**File:** `packages/server/src/routes/tasks.ts:386-405`
**Current:** Read-then-update-or-insert pattern. Drizzle SQLite supports `insert(...).onConflictDoUpdate(...)` against the `(userId, taskId)` PK, halving the work and removing the time-of-check race.
**Proposed:** Replace the if/else with one `db.insert(taskSnoozes).values({...}).onConflictDoUpdate({ target: [taskSnoozes.userId, taskSnoozes.taskId], set: { snoozedUntil: until } })` call.
**Rationale:** Two queries when one suffices, and the current shape has a (small) race where two snoozes for the same task arrive concurrently and both go down the insert branch.

### SF2 — `taskSnoozes` per-task subquery in list projection is N+1
**File:** `packages/server/src/routes/tasks.ts:181-186`
**Current:** Inside `result.map(...)`, the projection does one `db.select().from(taskSnoozes)` per task row. For a 50-task board that's 50 + 50 (messages) extra queries per `GET /api/tasks` call.
**Proposed:** Batch — one `db.select().from(taskSnoozes).where(and(eq(taskSnoozes.userId, userId), inArray(taskSnoozes.taskId, taskIds)))` followed by Map lookup. Same shape `threads.ts:222-239` already uses for `unresolvedThreadIds`.
**Rationale:** L8 simplification scan called out the same N+1 shape in the threads list and you already have the pattern. Repeating it in `tasks.ts` is a regression.

### SF3 — Pending-request projection runs full per-thread message scans
**File:** `packages/server/src/routes/tasks.ts:166-180`
**Current:** For each task with a `threadId`, the projection issues a full `select * from messages where threadId = ?` ordered ASC, then materialises every message through `rowToMessage` (full Zod parse + JSON parse) just to find the most recent plain-with-request. On a long thread this is O(N) per task.
**Proposed:** Either (a) the simplest fix: query only `type = 'plain'` rows, ORDER DESC, LIMIT 1, and parse just that payload to look for `payload.request`; (b) batch across all threads via `inArray(threadId, [...])`; or (c) cache `pending_request_message_id` on `tasks` (write side), since L15 §2.2 explicitly chose the read-model — only do this if (a)+(b) prove insufficient.
**Rationale:** `derivePendingRequest` is pure but the cost is paid in the loader. `tasks.list-pending` test will hide this — the seed data is small.

### SF4 — `try/catch` around `derivePendingRequest` swallows malformed payloads
**File:** `packages/server/src/routes/tasks.ts:174-179` and `:322-328`
**Current:** `try { ...derivePendingRequest(msgs) } catch { pendingRequest = null }` in both the list-projection and the `cancel_request` pre-check. The only thing that throws here is the `messageRowSchema.parse` inside `rowToMessage`. A malformed row silently disappears.
**Proposed:** Drop the catch. Boundary parse errors should propagate — this is the convention `threads.ts` and `append-plain-message.ts:104-112` follow (500 on malformed). The CLAUDE.md typescript rule explicitly says "let unexpected errors propagate — no swallowing with try-catch."
**Rationale:** Two parts of the same file disagree on the failure model: `appendPlainMessage` returns 500 on malformed participants, `tasks.ts` projection returns success-with-null. Pick one; the project's rule is propagation.

### SF5 — `useCallback` on every handler in `WorkTeam.tsx` provides no memo benefit
**File:** `packages/web/src/pages/WorkTeam.tsx:131-198`
**Current:** Six `useCallback`-wrapped handlers (`handleRequestStateChange`, `handleCancelPendingRequest`, `handleOpenThread`, `handleReplyInThread`, `handleSnooze24h`, `handleCopyLink`, `handleMoveBet`, `handleSelectPitch`, `handleAddToCanvas`). None of the consumers (`Kanban`, `Canvas`, `PitchSelector`) are wrapped in `React.memo`, so the stable references buy nothing.
**Proposed:** Drop `useCallback` and inline the handlers — they're 3-line `void fetch(...)` bodies. Trim the imports (`useCallback` goes away).
**Rationale:** Cargo-cult memoisation. Every `useCallback` adds dependency-array bookkeeping for zero render-saving benefit; the six closures allocate every render anyway because `setSelectedPitchIds`'s setter is the only stable identity in the file.

### SF6 — `handleReplyInThread` posts `request_changes`, not a generic reply
**File:** `packages/web/src/pages/WorkTeam.tsx:158-164`
**Current:** The "Reply in thread…" menu item is wired to `POST /api/tasks/:id/request` with `verb: "request_changes"`. The verb is the wrong shape for an open-ended message — `request_changes` is only legal in `review` state (per `TASK_VERBS_BY_STATE`). On any other state this fetch returns 400.
**Proposed:** Either (a) remove the "Reply in thread…" item from `TaskActionsMenu` until there is a real reply endpoint (a plain message via `POST /api/threads/:id/messages`), or (b) wire it to that thread endpoint with no verb.
**Rationale:** The page-level wire-up was punted to follow-up per L15 §7 CONFUSION-1, but shipping a button that posts a state-mismatched verb is worse than shipping nothing. Test coverage will not catch this because `WorkTeam.test.tsx` mocks fetch.

### SF7 — `TaskCardWithMenu` is a single-call helper that adds nothing
**File:** `packages/web/src/shell/Kanban.tsx:90-133`
**Current:** Internal component that does pure prop forwarding from `Kanban`'s callback shape (`(taskId, ...args)`) to `TaskActionsMenu`'s shape (`(...args)`). One call site (`renderTask` at `:176`).
**Proposed:** Inline the JSX into `renderTask`. The closure `(verb, reason) => onRequestStateChange(task.id, verb, reason)` etc. lives at the call site without a helper component.
**Rationale:** A six-prop helper that exists to bind `taskId` once is cheaper as an inline JSX expression. The component name suggests it's a meaningful boundary; it's not.

---

## CONSIDER

### C1 — `STATUS_STYLES` carries an `unknown` key for a runtime guard the type system already forbids
**File:** `packages/design-system/src/StatusChip.tsx:57-93`, `:95-103`, `:108-110`
**Current:** Even though `StatusChipProps.status` is typed as `Status`, the component re-validates against a `KNOWN_STATUSES` `Set` and falls back to an `unknown` style. The lore comment (`I4 adversary W4`) names the version-skew justification.
**Rationale:** The defence is defensible but adds a third source of truth (`Status` union, `STATUS_STYLES` keys, `KNOWN_STATUSES` set). Adding an 8th status now requires three edits. CONSIDER deriving `KNOWN_STATUSES` from `Object.keys(STATUS_STYLES).filter(k => k !== "unknown")` so additions don't drift.

### C2 — `VERB_SECONDARY` copy treats every verb the same ("agent decides")
**File:** `packages/design-system/src/TaskActionsMenu.tsx:64-72`
**Current:** Five of seven entries end "— agent decides"; `hand_back` says "— agent confirms"; `cancel_request` is the odd one. Six of seven are functionally the same string with the verb name varied.
**Rationale:** The repetition reads as boilerplate. CONSIDER one constant `AGENT_DECIDES_HINT = "asks the agent to X — agent decides"` parameterised by verb action, or drop the secondary text on the verbs and keep it only for the universal actions where the copy actually adds info.

### C3 — `setOpenSync` wraps `setOpen` purely to enable test ergonomics
**File:** `packages/design-system/src/TaskActionsMenu.tsx:87-90`
**Current:** Component-level `flushSync(() => setOpen(next))` wrapper, justified in the docstring as "tests that fire a single bare click see the open menu without needing an extra `act()` flush."
**Rationale:** Production code paying a performance / correctness tax (`flushSync` forces synchronous reconciliation, which is documented to be a foot-gun) for test convenience. CONSIDER reverting to a normal `setOpen` and updating the tests to await the next paint with `await act(...)` — that's the React-Testing-Library norm.

### C4 — JSDoc + `@lore` headers on tiny pure-data files
**File:** `packages/shared/src/task-request-verbs.ts:1-12`, `packages/shared/src/task-pending.ts:1-8`
**Current:** Both files lead with a multi-line `@lore` block before declaring 6 lines of `as const` enum or a 16-line pure function.
**Rationale:** The CLAUDE.md rule says "default to writing no comments." The `@lore` here repeats what the next 8 lines already make obvious. CONSIDER leaving only the matrix-level lore (`TASK_VERBS_BY_STATE` at `:34`) and dropping the file-level preamble.

### C5 — Inline IIFE-style `...(reason !== undefined ? { reason } : {})` spread pattern
**File:** `packages/shared/src/task-pending.ts:41`, `packages/web/src/pages/WorkTeam.tsx:136`, `packages/server/src/routes/tasks.ts:360`
**Current:** Three sites use the conditional-spread idiom to omit a key when undefined (a workaround for `exactOptionalPropertyTypes`). Locally readable; appears in three different files, once each.
**Rationale:** Cosmetic. CONSIDER a tiny `optional("reason", reason)` helper if the pattern grows beyond five sites. Below that, keep inline — three sites is not enough to warrant abstraction.

---

## Notes

- Skipped: tests under `__tests__/` and Playwright specs under `e2e/` per scope.
- The L15 plan (`docs/work-packages/L15-plan.md`) explicitly prohibits "skip verdict logic" flags on `appendPlainMessage`, and that decision holds — none of the findings above ask for it.
- `ensureTaskThread.ts` and `task-authz.ts` are clean-shaped helpers; nothing flagged.

---

## Resolution

### MUST-FIX
- **MF1: applied** — Promoted `rowToMessage` to a named export in `packages/server/src/routes/threads.ts`; `tasks.ts` now imports it. Removed the duplicate copy and the now-unused `Message` / `MessageType` / `DbMessage` / `messageRowSchema` imports from `tasks.ts`.
- **MF2: applied (partial)** — Replaced the unreachable `throw` in `append-plain-message.ts:rowToMessage` with the same exhaustive `switch` shape used by `threads.ts`. Did not delegate cross-file (would create a runtime cycle: `threads.ts` already imports `appendPlainMessage`); the helper still owns local `rowToMessage` / `rowToThread`, but the throw — the actual smell — is gone.
- **MF3: applied (partial; 409 contract preserved)** — Removed the `try/catch` swallow around `derivePendingRequest` in the `cancel_request` pre-check. Did NOT drop the pre-check itself: L15-plan §13 and `tasks.request.test.ts` (c) lock the `409 already_resolved` response, so removing the check would weaken a protected assertion. The N+1 cost SF3 calls out is filed as a follow-up (`docs/work-packages/follow-ups.md` → `L15-task-list-projection-N+1`).
- **MF4: applied** — Disambiguated `LETTER_BY_VERB` in `TaskActionsMenu.tsx`: `hand_back: "K"` (hand-bacK), `cancel_request: "X"` (eXit). Replaced the hardcoded `"C"` in the `verb-cancel` item with `LETTER_BY_VERB.cancel_request` so the table is the single source. Existing `(e) letter-shortcut keydown` test (`S` → `Request stop`) remains green; no protected-test assertion checked for `H`/`C` specifically.

### SHOULD-FIX
- **SF1: deferred** — `taskSnoozes` upsert. Behaviour-correct as-is; the race window is a single user double-clicking their own snooze button, which lands on the same row either way. Refactor is mechanical but out of scope for an apply-review pass focused on correctness.
- **SF2: deferred to follow-up** — Filed as `L15-task-list-projection-N+1` in `follow-ups.md`. Touches the request hot path and deserves its own perf story with a load-test gate.
- **SF3: deferred to follow-up** — Same row as SF2 in `follow-ups.md`.
- **SF4: applied** — Removed both `try/catch` blocks around `derivePendingRequest` in `tasks.ts` (list-projection at `:165-180` and cancel pre-check at `:307-340`). Parse errors now propagate as 500, matching the project rule.
- **SF5: skipped** — `useCallback`-stripping in `WorkTeam.tsx` is style/perf at zero benefit but also zero cost. Out of scope for an apply-review pass; happy to re-evaluate in a dedicated tidy-up pass.
- **SF6: applied** — `handleReplyInThread` in `WorkTeam.tsx` no longer posts `verb: "request_changes"` (illegal in every state but `review`). It is now a documented no-op; the live wire-up to `POST /api/threads/:id/messages` is part of the L15 §7 CONFUSION-1 page-level wiring follow-up.
- **SF7: skipped** — `TaskCardWithMenu` inline-helper. Cosmetic; inlining the JSX into `renderTask` is fine but not load-bearing. Re-evaluate next time we touch `Kanban.tsx`.

### CONSIDER
- **C1: skipped** — Deriving `KNOWN_STATUSES` from `STATUS_STYLES` keys is < 5 lines but lives in `StatusChip.tsx` outside the L15 surface. Defer to next StatusChip touch.
- **C2: skipped** — `VERB_SECONDARY` copy is designer-owned; not a developer call.
- **C3: skipped** — `flushSync` removal would require updating the menu tests' `act` shape; out of scope.
- **C4: skipped** — Top-of-file `@lore` blocks in `task-request-verbs.ts` / `task-pending.ts` were added deliberately during L15; removing them is a doc call, not a code call.
- **C5: skipped** — Three sites of conditional spread is below the threshold the finding itself proposes (five).
