# L15 — Adversary Review

Read-only adversarial review of L15 baseline. Scope is broader than the prior simplification + slop scans; this review hunts for surviving over-engineering, error-path bugs, type holes, layer-coupling, race conditions, boundary-condition holes, idempotency edge cases, projection correctness, and test-quality lies.

Scope (file paths absolute):
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/shared/src/task-request-verbs.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/shared/src/task-pending.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/shared/src/thread.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/server/src/services/task-authz.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/server/src/services/ensure-task-thread.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/server/src/services/append-plain-message.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/server/src/services/thread-row.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/server/src/routes/tasks.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/server/src/routes/threads-schema.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/server/src/routes/threads.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/design-system/src/TaskActionsMenu.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/web/src/shell/Kanban.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/web/src/pages/WorkTeam.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/server/src/routes/__tests__/tasks.request*.test.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/server/src/services/__tests__/*.test.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/web/src/__tests__/Kanban.no-drag.test.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/web/src/__tests__/WorkTeam.menu.test.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-baseline/packages/web/e2e/L15-team-board-no-drag.spec.ts`

---

## CRITICAL

### CR-1 — `clientKey` regenerated per click; idempotency contract is still broken at the page layer

**File:** `packages/web/src/pages/WorkTeam.tsx:144,150`

The slop-scan flagged the `Date.now()` variant; the "fix" replaced it with `crypto.randomUUID()` captured **inside the click handler each time**:

```ts
void postRequest(taskId, verb, crypto.randomUUID(), reason);
```

Every click — including a user double-tap and a React StrictMode double-invoke during development — produces a brand new key. The idempotency contract on the server (`append-plain-message.ts:63-92`) is structurally unable to dedupe because the *caller's* contract is "give me a fresh key each time." This is exactly the same defect class as `Date.now()`, just with stronger entropy.

Symptoms in production:
- A user mashing the same menu item twice produces TWO request rows in the thread — and pending derivation keeps the latest, but the audit trail now shows duplicate intents.
- React 19 / dev StrictMode renders `useCallback`'d event handlers twice in dev; the second click — if the user fires while the first request is in flight — gets a different key and the deduplication that the test suite is asserting (`tasks.request.test.ts:272-306`) does not trigger from the real UI.
- A network retry from the browser (transient 5xx) cannot reuse the key; the retry is not a retry — it's a new write.

Fix: capture the key per-intent. Either disable the menu-item until the in-flight request settles, or compute `const key = crypto.randomUUID()` once per onClick and stash it in a ref keyed by `(taskId, verb)` so a re-fire of the same intent reuses it. The current shape ships server-side idempotency theatre paired with a caller that defeats it.

### CR-2 — E2E spec asserts UI surfaces that DO NOT EXIST → spec will fail or has been disabled

**File:** `packages/web/e2e/L15-team-board-no-drag.spec.ts:42-56, 97-99`

Two assertions in the e2e have NO production source:

1. `data-kanban-column` selector. Grep across `packages/web/src/` returns ZERO matches. The Kanban (`Kanban.tsx:138-194`) renders columns inside `<div key={col.key}>` with no `data-kanban-column` attribute. The xpath `ancestor::*[@data-kanban-column]` returns null. `beforeColumnText` and `afterColumnText` are both null, so `expect(after).toBe(before)` is `expect(null).toBe(null)` — a tautology that "passes" even if a real drag silently mutated columns.

2. `await expect(page.getByText(/Request sent/i)).toBeVisible()` — there is NO toast in `WorkTeam.tsx`. Grep for "Request sent" / "toast" finds hits only in unrelated `Rail.test.tsx` and `SettingsPanel`. The `postRequest` helper does not surface success or failure to the user. This assertion will time out and fail; or, if the e2e suite is not currently run as a gate, the failure is hidden.

Either the toast was specced and not implemented (AC-2 + plan §1 V-2c says "toast appears" — not implemented), or the e2e was authored against a fictitious UI. Either way the AC is not met. The L15-step9-applied.md "all green" line conflicts with the spec text — verify the e2e actually runs.

### CR-3 — `derivePendingRequest` has zero unit tests; it's load-bearing for cancel semantics

**File:** `packages/shared/src/task-pending.ts` (no test file exists)

`derivePendingRequest` is the projection that decides whether the menu shows "Cancel pending request" (`TaskActionsMenu.tsx:185`) AND whether the `cancel_request` route succeeds or 409s (`tasks.ts:237-255`). It walks the full message stream, has explicit edge cases (redacted payloads, request-less plain messages, cancel-then-new-request, multiple cancels, `m === undefined` from sparse arrays), and ships with **no dedicated unit test**. The only coverage is one cancel-happy-path integration test (`tasks.request.test.ts:360-385`) and one cancel-no-pending test.

Unverified failure modes the function will hit in production:
- **Cancel-then-new-request:** stream `[req_stop, cancel, req_hold]`. The function walks last → first, hits `req_hold`, returns it as pending. Correct. But there's no test pinning that.
- **Two consecutive cancels:** stream `[req_stop, cancel, cancel]`. Walks back, first non-skip is `cancel` → returns null. Correct. Untested.
- **Cancel without prior request:** stream `[cancel]`. Returns null. Untested.
- **Redacted request message:** the most recent request was redacted (`payload.redacted === true`). The `if ("redacted" in payload) continue;` skip means a redacted in-flight request appears as "no pending" — which means the cancel flow 409s and the user can't withdraw a redacted request. Designed? Probably not. Untested either way.
- **`m === undefined` (sparse array)** is never reachable — a `for (i ≥ 0; i--)` over a `ReadonlyArray<Message>` never yields undefined. The defensive `if (!m) continue;` is dead code AND lies to the reader about possible inputs.

Without unit tests in `packages/shared/src/__tests__/task-pending.test.ts`, every one of these branches is unverified. The first production thread with two cancels or a redacted request will surface the bug as an "agent decided to ignore" or "user can't cancel" support issue.

---

## WARNINGS

### W-1 — Cancel precheck is a TOCTOU race that the route hides behind idempotency

**File:** `packages/server/src/routes/tasks.ts:237-255`

The cancel branch reads ALL messages outside any transaction, derives pending in JS, then calls `appendPlainMessage` which opens its own transaction. Two concurrent cancels both pass the precheck because `derivePendingRequest` ran on identical pre-cancel state. Both writes succeed because their `clientKey`s differ.

The simplification scan (M5) flagged the cost; the race is the bigger problem. Today this manifests as: two request messages, both with `verb: "cancel_request"` — pending derivation still returns null, so functionally OK, but the audit shows duplicate cancel intents and the second cancel's "201 cancelled" lies (it cancelled nothing — the first one already did).

Either accept the race and skip the precheck (cancel becomes idempotent on verb), or push the check into the same transaction as the insert.

### W-2 — `assertTaskParticipantAuthz`'s `notFound` lies about the cause

**File:** `packages/server/src/services/task-authz.ts:39-43`

The function returns 404 for both "agent does not exist" AND "agent is in a different team." The lore correctly notes this is anti-information-leak. But the route at `tasks.ts:213-221` ALSO returns 404 when the task itself does not exist with a literal "Task not found" message, while the authz failure returns the same 404 + `code: "not_found"` + message "Task not found." A legitimate user holding an `X-Identity` for a deleted account gets a 404 indistinguishable from a typo'd task id; the operator chasing a support ticket cannot tell whether the user is mis-typed, the task is deleted, or there's a cross-team bug.

The plan calls for opacity to *adversarial* callers — but the server has no observability differentiating these cases either (no log line, no event, no metric). Add an internal-only signal (event bus tag, debug log) so operators can disambiguate without leaking to the wire.

### W-3 — `appendPlainMessage` swallows participant-shape errors via `.parse` throw

**File:** `packages/server/src/services/append-plain-message.ts:55`

`threadParticipantsSchema.parse(JSON.parse(threadRow.participants))` is wrapped in NO try/catch. If the participants column is malformed (a real possibility on legacy data, partial migrations, or a corrupt row), the helper throws `ZodError` to the route's default error handler. The L15-step9-applied.md note ("Zod `.parse` throw is the right unexpected-error signal") is defensible per the typescript rule, but the SAME column read in `threads.ts:362-368` HAS a try/catch returning a 500 with `code: "internal_error"`. Inconsistent error semantics for the same failure across two endpoints — clients see different shapes for the same DB defect.

Pick one: either both throw to default handler, or both return 500 result. The current state is silent drift inside L15's own changes.

### W-4 — `ensureTaskThread`'s race-loser branch is double-wrapped and depends on `cause` being a `TaskThreadRaceLost`, but a re-read failure will mask a successful race resolution

**File:** `packages/server/src/services/ensure-task-thread.ts:70-81`

In the catch:
```ts
if (cause instanceof TaskThreadRaceLost) {
  const reread = db.select().from(tasks)…get();
  if (!(reread && reread.threadId)) {
    throw new Error("ensureTaskThread: race lost but no winning thread_id present");
  }
  …
}
```

If the conditional UPDATE truly returned `changes === 0` we lost the race AND the winner pinned `threadId`. There is no scenario in this code where rowcount=0 happens without a winning thread_id — except: a third writer between our UPDATE and our re-read deleted the task entirely, or the winner's transaction also failed. The error message ("race lost but no winning thread_id present") implies an invariant violation; in reality it's a benign concurrent state. This is a tripwire that will fire under unrelated cleanup operations and crash the request.

Also: `(result as { changes: number }).changes` is an unsafe cast (rule violation per `.claude/rules/typescript.md` "no unsafe `as` casts"). Drizzle's run() return type should be checked — if better-sqlite3 in some test mode returns a different shape, this silently miscounts. Same defect at `threads.ts:475`.

### W-5 — Verdict-race regression test does not actually test the helper extraction's effect on the verdict path

**File:** `packages/server/src/routes/__tests__/threads.verdict-race.test.ts`

The test calls POST `/api/threads/:id/messages` with `type: "verdict"`. Per `threads.ts:340`, the plain branch is the ONLY path that delegates to `appendPlainMessage`. Verdict messages never touch the helper. So this test exercises code that the L15 extraction did NOT change — it pins the L1-step9 verdict-race semantic, but does NOT pin "the plain-branch extraction did not regress the verdict-branch." If a future developer accidentally moves the verdict code into the helper, this test passes because it never imported the helper.

The test name says "L1 invariant survives the L15 helper extraction" — that is a false claim. The test verifies nothing about the extraction itself; it verifies the verdict route still works. The truth-in-naming would be "verdict-race semantic still works; helper extraction not exercised here." The actual regression risk (someone migrates verdict to the helper and breaks the race guard) is unprotected.

### W-6 — `WorkTeam.tsx` fires-and-forgets `postRequest`; failures are silently dropped

**File:** `packages/web/src/pages/WorkTeam.tsx:142-151, 124-135`

`postRequest` returns `Promise<void>` and never reads `res.ok`, `res.status`, or `res.json()`. A 401 (auth expired), 403, 404, 409 (idempotency conflict), or 5xx response goes into `void`, the user sees nothing happen, the menu closes successfully, and the local state pretends the request succeeded. There is no toast (see CR-2), no error rail wiring, no retry. This is the canonical "fire-and-forget mutation" anti-pattern — it produces ghost actions in the UI.

Also: there's no AbortController on the fetch. If the user navigates away mid-request, the request continues, and on a slow network a verb dispatched on task A can land after the user moved to task B's view; with no UI feedback, that's invisible.

### W-7 — `TaskActionsMenu` shows three items ("Reply in thread…", "Open thread", "Snooze 24h", "Copy task link") with optional callbacks that the page passes as `undefined` → menu items are functional no-ops

**File:** `packages/design-system/src/TaskActionsMenu.tsx:207-247`, `packages/web/src/pages/WorkTeam.tsx:159-173`

The L15-step9-applied W-2 fix removed the stub `useCallback`s but kept the menu items rendering. Now the menu still SHOWS "Reply in thread…", "Open thread", "Snooze 24h", "Copy task link" — clicking them invokes `onReplyInThread?.("")`, `onOpenThread?.()`, etc., where the `?.` is undefined (page passes nothing). The click closes the menu. From the user's POV the action silently fails. The L15-plan W-2 deferred fix said "Either don't pass them so the menu hides the items, or add the items only when their handlers exist" — neither was done. The current shape is the worst option: the menu lies about what works.

The applied note claims this is acceptable because "the menu hides nothing — items still render but their `?.()` guards make the click a no-op." That's an accurate description of a UI bug, not a fix.

### W-8 — Tests rely on `.requestStop` text matching to find verbs but verbs are not localized — scale-fragility hidden

**File:** `packages/web/src/__tests__/WorkTeam.menu.test.tsx:85`, `packages/web/e2e/L15-team-board-no-drag.spec.ts:85,98`

Tests query `screen.findByRole("menuitem", { name: /request stop/i })`. The "Request stop" text comes from `REQUEST_VERB_TEXT.request_stop`. If wording changes (`"Stop the agent"`), every test breaks instead of being driven by a stable test id (e.g. `data-verb="request_stop"`). The TaskActionsMenu has zero `data-verb` attributes. For a menu whose entire purpose is "the canonical verbs," not exposing them as test ids is leaving the protocol implicit.

### W-9 — `ensure-task-thread.test.ts` race test is not actually concurrent — it simulates by pre-pinning

**File:** `packages/server/src/services/__tests__/ensure-task-thread.test.ts:104-143`

The "race lost" test pre-pins `tasks.thread_id = winnerThreadId` synchronously, then calls `ensureTaskThread` with a stale `Task` snapshot. This proves the conditional UPDATE notices the existing pin — but it does NOT test the actual race (two concurrent transactions hitting `WHERE thread_id IS NULL`). The integration test `tasks.request-concurrent.test.ts` does exercise concurrency via `Promise.all`, but better-sqlite3's transactions are synchronous + serialized inside the same process, so even that test can't reproduce true row-level concurrency. The behavior is verified at the semantic level (good) but the literal "two writers hit the conditional UPDATE simultaneously" path is unreachable from these tests.

This is acceptable for sqlite, but anyone porting to PostgreSQL must KNOW the race tests are semantic, not concurrent. There is no `@lore` comment saying so.

### W-10 — `requestBodySchema.reason` allows leading/trailing whitespace, control chars, and zero-width unicode

**File:** `packages/server/src/routes/tasks.ts:27`, `threads-schema.ts:37`

`z.string().min(1).max(2048).optional()` accepts:
- `" "` (single space) — passes min(1), is "empty" semantically
- `"​"` (zero-width space) — same
- `"\n\n\n"` — passes
- `"\x00..."` — null bytes pass and are JSON-encoded to `" "`, which sqlite stores fine but most loggers/UI render as garbage

`renderRequestText` then concatenates straight into "Request stop:  " — a request with an invisible reason. There's no `.trim()`, no control-char filter. The test suite never tries any of these. For a UI that renders this verbatim into a thread, it's both a usability defect and a (low-severity) injection vector for terminal/log corruption.

### W-11 — `clientKey` accepts dot, colon — but the regex treats it as URL-safe; the column comparison is byte-exact and dots collide with task ids if reused

**File:** `packages/server/src/routes/threads-schema.ts:22-23`

`/^[A-Za-z0-9_\-:.]+$/` length 8-128. The dedupe namespace is `(threadId, senderId, clientKey)`. There's no rule preventing a client from using a clientKey it already used in a DIFFERENT thread — fine in principle, but the message-input-schema validates the same regex on `POST /api/threads/:id/messages` and `POST /api/tasks/:id/request`. A poorly-built client could collide its key across these endpoints. The API contract permits it (different threadIds → different rows), but no test asserts the cross-endpoint behavior. The "8 chars minimum" is also defended in the code comment as forcing real UUIDs — but `"aaaaaaaa"` passes, so the defense is aspirational.

---

## OBSERVATIONS

### O-1 — `task-row.ts` `rowToMessage` will throw `ZodError` if any persisted message has a payload shape that doesn't match `messageRowSchema`

**File:** `packages/server/src/services/thread-row.ts:21-44`

`messageRowSchema.parse({type, payload: JSON.parse(...)})` throws on mismatch. There is no recovery, no log, no fallback. A single corrupt row (older format from a pre-L15 schema, partial migration) breaks the entire thread fetch (`threads.ts:201` maps over rows). The defensive choice the codebase made elsewhere (return 500 with `code: "internal_error"`) is not made here. One bad row poisons the whole list.

### O-2 — `ensureTaskThread.created` field still unread (defer was justified, but the field is still a lie)

**File:** `packages/server/src/services/ensure-task-thread.ts:25-28, 38, 78, 85`

Per simplification scan M3 (deferred). `created: false` is returned for both "race lost, found winner" and "thread already pinned" — semantically these are different (winner-create vs pre-existing). The field's truthiness reads as "I created this thread row right now," but in the race-lost path the value is `false` even though *someone* created it `false` ms ago. If a future caller branches on `created`, this is a footgun.

### O-3 — `TaskActionsMenu` is a Tier-2 design-system component that imports `@hyperidle/shared` types AND the canonical text table — cross-layer coupling

**File:** `packages/design-system/src/TaskActionsMenu.tsx:16-21`

`packages/design-system` should be the visual primitive layer (per `.claude/rules/design-system.md`). Importing `REQUEST_VERB_TEXT` and `TASK_VERBS_BY_STATE` from `@hyperidle/shared` makes this design-system component aware of domain semantics. Justifiable for the verb registry, but it means the design system is no longer a generic kit — it's HyperIdle-specific. If the design system is ever forked for another product, this component carries domain bleed.

### O-4 — `KanbanProps.renderTaskActions` is a render-prop pattern that obscures where the menu lives

**File:** `packages/web/src/shell/Kanban.tsx:34, 97, 176-177, 187`

The Kanban is presentation-only by design; passing `renderTaskActions` from the page is the right separation. But the type is `(task: KanbanTask) => TaskCardProps["actions"]` — `TaskCardProps["actions"]` is a `ReactNode | undefined`. So the page can pass any element, including unrelated ones. There's no constraint that the rendered element is actually a TaskActionsMenu. This is fine for the abstraction's purpose but means a future regression (someone passes a different element) won't surface in the type system.

### O-5 — `WorkTeam.tsx` `INITIAL_TASKS` mocks have hardcoded `pendingRequest: null` for every task; the menu's "cancel" path is unreachable from the page in the current shell

**File:** `packages/web/src/pages/WorkTeam.tsx:38-84`

No fixture exercises `pendingRequest != null` from the page. The `TaskActionsMenu`'s `hasPending` branch (`TaskActionsMenu.tsx:185-198`) is rendered correctly per its unit test, but the page never produces the input that would render the cancel item. So the e2e cannot click "cancel" without a real backend. The "cancel" UI is functionally untested at the page-integration level.

### O-6 — `threads.ts` and `tasks.ts` define `requestBodySchema` and `requestPayloadSchema` independently; reason-length is duplicated

**File:** `packages/server/src/routes/tasks.ts:25-29`, `packages/server/src/routes/threads-schema.ts:35-38`

L3 from simplification was deferred. Note for the record: any change to `reason.max` requires touching both. The plain-message route accepts a `request` payload via `plainPayloadSchema.request → requestPayloadSchema`, which means a request can reach the thread via TWO different endpoints with potentially different validation rules.

### O-7 — `Kanban.no-drag.test.tsx` source-grep tests will silently pass if the file is renamed or split

**File:** `packages/web/src/__tests__/Kanban.no-drag.test.tsx:26-27`

`readFileSync(join(Dirname, "..", "shell", "Kanban.tsx"), "utf8")` is hardcoded. If a future story moves Kanban into a sub-folder or renames it, the test's `readFileSync` throws ENOENT → the whole test file fails — but the assertion intent ("no DnD imports anywhere") is silently lost from the protected-tests set. The protection is fragile.

### O-8 — `appendPlainMessage` re-reads thread + message after insert (Slop O-8 deferred)

**File:** `packages/server/src/services/append-plain-message.ts:126-127`

Two extra SELECTs per write to fetch values we just wrote. Sqlite is fast enough that this doesn't matter, but the pattern propagates: it's already in `ensure-task-thread.ts:83` and the threads route. As volume grows this is N extra round-trips per request.

### O-9 — `task-pending.ts` `if (!m) continue;` is dead defensive code

**File:** `packages/shared/src/task-pending.ts:27`

`for (let i = messages.length - 1; i >= 0; i--)` over a `ReadonlyArray<Message>` cannot yield `undefined` for `m`. The guard exists because of `noUncheckedIndexedAccess` — the type system says `m: Message | undefined`. Adding `if (!m) continue;` silences the type error but tells the reader the array might be sparse. Better: assert `messages[i]!` or restructure the loop.

### O-10 — `appendPlainMessage` returns 200 with the OLD thread row on idempotent replay even if the thread was mutated since the original write

**File:** `packages/server/src/services/append-plain-message.ts:75-92`

On idempotent replay, the helper returns `rowToThread(threadRow)` where `threadRow` was read at the start of THIS call. But the message returned is the original message row — not re-fetched. If between the original write and the replay something resolved/redacted/mutated the thread, the replay's response mixes a current thread snapshot with a stale-ish message. Probably harmless but worth noting.

---

## Cross-cutting Observations

1. **Idempotency theatre.** Server idempotency works, but the ONE caller (`WorkTeam.tsx`) defeats it by generating a new key per click. Server-side tests pass because they construct stable `clientKey`s; the page does not. The contract is a fiction at the system boundary.

2. **The e2e is a paper tiger.** It asserts on attributes that don't exist, on a toast that doesn't render, and would either fail or "pass" via null-equals-null tautologies. Whoever signs off on AC-2 / V-2c needs to actually run it under a recording proxy.

3. **No unit tests for `derivePendingRequest`.** A pure function with branching logic and known edge cases (cancel, redacted, multiple cancels, request-less plain) ships untested. This is a load-bearing projection — the menu's cancel button and the route's 409 both depend on it.

4. **Verdict-race "regression pin" doesn't pin the regression it claims.** It pins the verdict semantic, which is unaffected by the L15 extraction. The actual regression (someone moves verdict into the helper) is not caught.

5. **Half-deleted UI items.** "Reply in thread…", "Open thread", "Snooze 24h", "Copy task link" all render and silently no-op when clicked. The product is teaching users "the menu lies."

---

## VERDICT

**STOP**.

CR-1 (idempotency at the page is broken — `crypto.randomUUID()` per click is identical in defect class to the `Date.now()` it replaced), CR-2 (e2e asserts on non-existent UI surfaces — either hidden failure or tautology pass), and CR-3 (`derivePendingRequest` has no unit tests despite branching logic and known edge cases) each block proceed.

W-6 (silent fire-and-forget on the page) and W-7 (four menu items render but no-op) compound CR-2 — the user-visible surface AC-2 promised does not work end-to-end. The L15-step9-applied "all green" line is at minimum incomplete; verify the e2e runs and the toast is rendered before re-running this review.

### Severity counts
- **CRITICAL:** 3
- **WARNINGS:** 11
- **OBSERVATIONS:** 10

### Top 3 most concerning
1. **CR-1** — `clientKey: crypto.randomUUID()` captured inside the click handler at `WorkTeam.tsx:144,150`. Same defect class as the `Date.now()` issue the slop scan caught. Server idempotency cannot dedupe what the caller refuses to dedupe.
2. **CR-2** — `L15-team-board-no-drag.spec.ts` asserts on `data-kanban-column` (does not exist in `Kanban.tsx`) and on a "Request sent" toast (not implemented anywhere in `WorkTeam.tsx`). Either the e2e fails, the e2e is not run, or the assertions tautologically "pass" on null. AC-2 / V-2c is not actually verified.
3. **CR-3** — `derivePendingRequest` is the load-bearing projection for the cancel UI and the cancel-409 server logic. Zero unit tests; redacted-payload skip behavior is undefined-by-default and will surface as "user can't cancel a redacted request" in production.
