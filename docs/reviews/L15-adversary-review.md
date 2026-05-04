# L15 — Adversary Review (read-only)

**Scope.** Working-tree changes on `ab/L15-1a` for L15 only (drag deletion + per-task request affordance + thread page). Pre-existing block-1a plumbing (`vitest-toon-reporter`, `scripts/verify.ts`, `pipeline/progress.ts`) is out of scope and not reviewed.

**Inputs read.** Spec `docs/work-packages/TRACK-L.md` §L15 (511-540); plan `docs/architecture-plans/L15-plan.md`; approved design `docs/design-explorations/L15/approved.md`; prior findings `docs/reviews/L15-scan-resolutions.md`; production files (`Kanban.tsx`, `TaskRequestPopover.tsx`, `WorkTeam.tsx`, `WorkTeamTaskThread.tsx`, `lib/thread-detail.ts`, `Tag.tsx`, `task-verbs.ts`); test files (`Kanban.test.tsx`, `TaskRequestPopover.test.tsx`, `WorkTeam.test.tsx`, `WorkTeamTaskThread.test.tsx`, `e2e/team-request.spec.ts`).

**Mode.** Read-only. Findings only.

---

## MUST-FIX

### M1. Popover has no `Esc` close handler — design §6.3 contract violated

`packages/web/src/shell/TaskRequestPopover.tsx:148-153` only handles `Cmd/Ctrl+Enter` on the textarea. There is **no `Esc` key handler anywhere in the file**. The approved design §6.3 explicitly says: *"`Esc` while popover is open: cancel + close."* Hitting `Esc` today does nothing (or, when focus is on the textarea, the browser/DaisyUI may swallow it — neither dispatches `close()`). There is also **no click-outside dismiss** (no `useEffect` listening on `document` for outside clicks; no DaisyUI `dialog` semantics that would handle it). Once the dropdown is `open: true`, the only ways out are `Cancel` button, `Send` success, or remounting. `aria-label="Request state change"` advertises a `role="dialog"` that traps the user with no keyboard escape.

This is also an a11y regression — `role="dialog"` without an `Esc` handler fails WCAG 2.1.1 (Keyboard) and ARIA APG dialog pattern. The L15-scan/slop-scan called this out under S9 and it was DEFERRED ("needs design call"). It's not a design call — `Esc-closes-popover` is already in the locked design at §6.3. Implement the listener; the design call S9 referenced was the broader menu-vs-dialog ARIA pattern, not whether `Esc` works.

**Failure scenario.** A founder opens the popover, decides not to act, hits `Esc` → nothing happens → confused user clicks elsewhere → still open → must hunt for `Cancel`. Worse with screen readers: `role="dialog"` announces a modal contract the implementation does not honor.

### M2. `WorkTeam.tsx:164-191` re-fetch effect runs once and never re-runs after a request — `threadId` is silently inconsistent across remounts

The mount effect's dependency array is `[]` and it iterates `INITIAL_TASKS` (the constant), not the live `tasks` state. After `handleTaskRequestSent` mutates `tasks` to add a `threadId`, the next time the popover sees that task it has the optimistic `threadId`. Good. But: a user who sends a request through `TaskRequestPopover` while the **server-side first-request POST is racing the mount fetch** can produce two threads: the mount `GET /api/threads?host_kind=task&host_id=t1` returns `{threads:[]}` (server hasn't seen the create yet), the popover then `POST /api/threads` (creates thread A), the mount fetch resolves *after* with `{threads:[]}` and `setTasks` overwrites `threadId: <A>` back to `null`. Next request creates thread B for the same task. The 800ms p95 budget claimed in the plan §5.3 makes this race more likely on slow networks.

The race window is small but real and the consequence is silent thread duplication for the same `(host_kind, host_id)` pair. The server has no uniqueness constraint on `(hostKind, hostId)` (verified in plan §3 reconciliation: `POST /api/threads` "does NOT pre-validate that the host row exists"). The optimistic `setTasks` in `handleTaskRequestSent` cannot win if it lands before the mount fetch settles.

**Fix direction.** Either (a) merge in the mount results without overwriting a locally-set `threadId` (`prev.map(t => meta && t.threadId == null ? {...t, threadId: meta.threadId, ...} : t)`), or (b) gate the popover's `Send` until mount fetches have settled, or (c) write the popover to first re-do the lookup right before posting (single round-trip cost, kills the race).

### M3. The orphan-thread fallback path is asserted in code but never tested

Plan §5.3 claims: *"when a per-task GET fails (network, 4xx, 5xx) the affected card renders with `threadId=null, threadCount=0, threadUnread=0`."* `WorkTeam.tsx:140-156` implements that — `Promise.allSettled` catches rejections, fulfilled-only iteration, `if (!meta) return t`. **No test exercises the rejection path.** `WorkTeam.test.tsx:9-20` only stubs successful 200 responses; the "issues GET on mount" test at lines 110-126 also only returns 200. There is no test for: per-task fetch rejection, list 5xx, detail 5xx, mixed-success-failure batch. The "boring choice" is undocumented behaviour without a test pinning it. The next agent who refactors `fetchThreadMetaForTask` and removes the inner `if (!listRes.ok)` branches breaks the fallback contract silently. **This is a CRITICAL test-coverage hole given testing rules require error-path coverage.**

### M4. `TaskRequestPopover` retry violates server idempotency contract — fresh `clientKey` on every retry

`TaskRequestPopover.tsx:124-146`. On `Send` failure, the error strip renders, `Send` stays enabled, and the user clicks again. `handleSend` calls `clientKey: crypto.randomUUID()` **inside** the `try` block — every click generates a new UUID. The server's idempotency contract (per plan §10 trade-off 4 + threads.ts contract) collapses replays of the same `(threadId, sender, clientKey)` to one row. Burning a fresh key on retry defeats this: a user who clicks Send twice on a flaky network where the first request actually succeeded but the response was lost gets **two messages** posted to the thread. The L15-scan called this out as SHOULD-FIX and the resolutions doc DEFERRED it ("needs design discipline"). It does not need design discipline; it needs `clientKey` hoisted out of the closure scope so the same key is reused on retry. Until the user successfully sends or cancels the popover, the key is stable. Trivial fix; high blast-radius bug if left.

### M5. Race / use-after-unmount in popover `handleSend`

`TaskRequestPopover.tsx:124-146` calls `setSending`, `setError`, `setOpen`, `triggerRef.current?.focus()` after an `await postRequest(…)` with no abort signal and no mounted-check. If the user navigates away mid-request (clicks the thread chip or a nav-rail item), the parent unmounts the popover; the awaited `setSending(false)` then runs on an unmounted component. React 18 swallows the warning, but the more interesting consequence is `triggerRef.current?.focus()` — `triggerRef.current` is now `null`, so focus drops to `<body>`, breaking the focus-return contract from design §6.2 ("focus returns to the `Request ▾` trigger"). On older React or stricter setups, this surfaces as warnings in the dev console. Either pass an `AbortSignal` into `postRequest` and abort on unmount, or guard the post-await state writes with a `cancelled` ref. Either pattern would also have caught M3's untested rejection path.

---

## SHOULD-FIX

### S1. The 800ms p95 perf SLO has zero coverage

Plan §5.3 explicitly carves out: *"≤ 800ms p95 for ≤ 25 visible tasks. … Vitest assertion: a mocked-fetch test renders the Kanban with 10 tasks and asserts all 10 mock-fetches were issued before any first paint of `Thread (N)` chip data."* Looking at `WorkTeam.test.tsx:110-126`: the test asserts `> 0` fetches. It does NOT assert (a) all 5 fixture tasks were fetched in parallel, (b) the fan-out completed within any time bound, (c) no chip rendered before all fetches resolved (or that they did resolve in parallel rather than sequential). The plan's "Vitest assertion" is unfulfilled. The 800ms budget is a vibe, not a measurement. If a future change accidentally serialises the fan-out (e.g. await inside the loop), no test fails.

### S2. Tag's `unread` precedence is documented one way and implemented another

`Tag.tsx:13` TSDoc: *"Mutually exclusive with `kind` — when both are set, `kind` wins (the dot is skipped)."* Implementation at lines 38-71: the precedence is *valid kind* > unread > default. If a caller passes `kind="some-bogus-string" as TagKind` (defensive guard at line 44 falls to `meta = undefined`) AND `unread={true}`, the unread branch wins despite both `kind` and `unread` being set. The defensive guard documents itself with `@lore J1`, but the documented "kind wins" contract on `TagProps` is now violated under that branch. Either change the doc to "valid kind > unread > default" or invert the precedence. The L15 simplification scan flagged this; resolution doc DEFERRED. Should be fixed because a downstream caller reading the TSDoc will assume `kind: <any string>` defeats the unread branch — it does not.

### S3. `WorkTeam.tsx:128-134` casts JSON parse to declared interfaces — unsafe `as` violates the project rule

```ts
const list = (await listRes.json()) as ThreadListResponse;
const detail = (await detailRes.json()) as ThreadDetailResponse;
```

`packages/.claude/rules/typescript.md` is explicit: *"No `any`, no `@ts-ignore`, no unsafe `as` casts."* Both lines are unsafe casts of `unknown` (the actual return type of `Response.json()`) to a specific interface, with no runtime check. This is the exact pattern the M1/M2 of the simplification scan got fixed for in `WorkTeamTaskThread.tsx` (the page now uses `decodeThreadDetail` to validate). The same risk vector here is dismissed as "needs design call" in the resolutions doc. There's nothing to design — extract `decodeThreadList` next to `decodeThreadDetail` in `lib/thread-detail.ts` and reuse. Otherwise a server contract drift on `{threads: [...]}` shape (e.g. `threads` becoming `items`, or array-of-strings becoming array-of-richer-objects with a different `id` location) silently corrupts the Kanban.

### S4. `TaskRequestPopover.tsx` similarly casts the POST response

Lines 79 and (implicitly) 94 cast the JSON response to `{thread: {id: string}}` and trust `body.thread.id`. If the server returns a different shape — for example, a redirect proxy, an HTML error page mistakenly served as 201, or a future field rename — `body.thread.id` is `undefined` and `onSent({threadId: undefined})` propagates garbage upstream. The optimistic `setTasks(prev.map(... t.threadId = result.threadId))` then poisons the local state. Should validate the response shape before trusting it, same pattern as `decodeThreadDetail`.

### S5. `dropdown dropdown-end` does not implement the design's auto-flip — opposite anchor

Approved design §10 + plan Q3: *"Auto-flip placement at viewport edges: when the popover would overflow the right edge, anchor to `right: 0` instead. Architect picks the boundary detection."* Plan §4 Q3 specifies *"`dropdown-end` is applied to cards in column index 3 (`in_progress`) and beyond."* Implementation at `TaskRequestPopover.tsx:156`: `<div className="dropdown dropdown-end">` — applied to *every* popover unconditionally. So instead of cards in the leftmost column anchoring left and rightmost anchoring right, every popover anchors right-end-of-trigger. For a card in the leftmost column (Planned), the popover hangs off the left edge of the trigger and may clip on small viewports. The design's column-aware switching is unimplemented. Acceptable choice if argued ("we always end-anchor"), but currently it silently diverges from the plan without note.

### S6. `WorkTeamTaskThread.tsx` collapses decode failure into a generic `error.message`

Line 71-78: `catch (cause)` lumps network failures, JSON parse errors, and `ThreadDetailDecodeError` into one bucket and shows `cause.message`. A `ThreadDetailDecodeError` reading `"thread detail decode: thread.hostKind"` is leaked as user-facing copy in the `<ErrorState>` description. Diagnosable, but ugly and a minor info disclosure (server-shape hints in the UI). Distinguish decode-error from network-error so the user sees a sane message and the agent debugging it gets the structured cause.

### S7. The e2e test `card.getByRole("button", {name: /request/i})` matches the dropdown trigger AND any verb button containing "request"

`packages/web/e2e/team-request.spec.ts:120`. None of the 5 verb labels contain "request" today (`Pause`, `Resume`, `Mark blocked`, `Ready for review`, `Kill`), so the selector resolves uniquely. But this is positional luck — a future verb labelled "Request review" would break the e2e silently. Use a more specific selector (`button[aria-haspopup="menu"]`, or a `data-testid`).

### S8. The e2e flow asserts the message body via the popover's deterministic format but never asserts `clientKey` is present in the post

`team-request.spec.ts:55-77` collects `postedBodies` from `body.initialMessage.payload.text` but never inspects `body.initialMessage.clientKey`. The plan calls out idempotency as a security mitigation (§8 — "Idempotency replay attacks: replays with the same `clientKey` collapse"). The popover unit test asserts `typeof body.clientKey === "string"`; the e2e doesn't carry that assertion forward. If the production call ever drops the `clientKey` field, the unit test catches it but the e2e is silent on the contract.

### S9. `WorkTeam.test.tsx:93-96` and `Kanban.test.tsx:93-97` both assert `mod.COLUMN_TO_STATE === undefined`

Two files, same negative-export assertion. The L15-scan flagged this as NICE-TO-HAVE; for an adversary review it's worth restating: structural negative-space tests rot the moment someone re-exports any unrelated symbol with a similar name. The drag-is-no-op behaviour is asserted at `Kanban.test.tsx:114-129` already (`fireEvent.dragStart` + assert no reorder) — that's the contract that matters. Drop the export-shape duplicate.

### S10. `WorkTeamTaskThread` page has no test for the `error` LoadState

`WorkTeamTaskThread.test.tsx` covers `loaded` (lines 68-112) and `empty` (lines 114-129). Neither `loading` nor `error` is asserted. The `error` branch was the entire point of the M1 simplification fix (replacing the unsafe `as unknown as Thread` cast with strict decoding). That fix's behaviour — *malformed server response routes to error LoadState* — is unverified by test. The decoder's strictness (`lib/thread-detail.ts`) has no test coverage at all in this scan; the only place it executes is via the `WorkTeamTaskThread.test.tsx` happy path. A unit test on `decodeThreadDetail({...invalid...})` asserting `ThreadDetailDecodeError` is the missing minimum.

### S11. The popover's `role="dialog"` + DaisyUI `dropdown` is a structural mismatch

`TaskRequestPopover.tsx:156` uses DaisyUI's `dropdown` class (a CSS-only menu pattern) and the inner `dropdown-content` carries `role="dialog" aria-label="Request state change"`. DaisyUI `dropdown` is keyboard-driven via `:focus-within` (CSS) and was designed for menu semantics, not dialog. The result: the popover doesn't auto-close on outside-click (no DaisyUI behaviour AND no React handler), and `:focus-within` lifecycle interacts oddly with `useState(open)` — a click outside removes focus → CSS hides → React still thinks `open: true` → next trigger click flips `open` to `false`, requiring two clicks to reopen. This was flagged in the slop-scan as S9 and DEFERRED. The right fix is either (a) commit to dialog semantics with explicit click-outside + Esc + focus-trap, or (b) commit to menu semantics with arrow-key navigation and `role="menu"`/`role="menuitem"`. Today it's neither — the worst of both.

### S12. `noopAppend` in `WorkTeamTaskThread.tsx:30-32` produces a composer the user can interact with, but submission silently no-ops

Wiring `<ThreadShell onAppendMessage={noopAppend}>` makes the thread page mount a working composer that, on submit, returns `Promise.resolve()` and does nothing. The user types, hits send, sees no error, no message appears. The doc-comment says "the popover is the L15 write surface" — but the user has no way to know that from the UI. Either (a) pass a sentinel that ThreadShell understands as read-only and hides the composer, or (b) document the omission in user-facing copy on the page. Today it's a UX trap.

---

## NICE-TO-HAVE

### N1. `TaskRequestPopover.tsx` `verbDisplayLabel` is called inside the verb-list `.map`. For 5 verbs it's free; if a future audit flags it, hoist to a memo.

### N2. `TaskRequestPopover.tsx:184` selected-verb tint uses inline `bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]`. The design §1 Fix 2 specified `--primary-dim` (0.08). If `--primary-dim` is a token, prefer it for grep-ability when the design system tweaks the value. (Token verification not done — flag for designer.)

### N3. `WorkTeam.tsx:164-191` is the only consumer of `fetchThreadMetaForTask`. The function is exported by virtue of being module-scoped but not exported. Fine as-is. If a future page (e.g. a per-bet view) needs the same fan-out, extract to `lib/thread-meta.ts` then.

### N4. `Kanban.test.tsx:107-112` asserts `aria-roledescription="draggable"` is gone, which is dnd-kit specific. Acceptable as a regression guard; if dnd-kit is ever upgraded with a different attribute, the assertion is stale-positive (passes when broken). Low risk.

### N5. `task-verbs.ts` `formatRequestMessageBody` does not escape `actorName`. If an actor ever gets a name with `\n` in it, line-1's "deterministic regex" parse on the agent side breaks. Bounded-trust today (actor name from server-side founder identity per plan §8), but worth a follow-up.

### N6. `Kanban.tsx:83-84` defaults `DEFAULT_FOUNDER_ID="u-founder"` and `DEFAULT_FOUNDER_NAME="A. Founder"`. Already on the follow-up list (S2 in scan resolutions). Restating: when real auth lands, every popover instance carries this default and silently posts as `u-founder`. A test that mounts `<Kanban>` without `founderId` prop should assert the default explicitly so the day someone removes the default they catch the impact.

---

## VERDICT

**REVISE.**

Five MUST-FIX items: a missing `Esc` close handler that violates the locked design contract and ARIA dialog APG (M1); a mount/popover race that silently duplicates threads server-side (M2); an untested error-fallback path that the plan boasts about as a "deliberate boring choice" but has zero coverage (M3); an idempotency-defeating retry (M4); and a use-after-unmount in `handleSend` that breaks the focus-return contract (M5). M2 and M4 are correctness bugs that produce user-visible duplicate state under realistic conditions; M1 and M5 are contract violations that fail accessibility/UX guarantees the design docs already locked in. M3 means the boundary you're relying on is undocumented behaviour.

Twelve SHOULD-FIX items, three of which (S1 the missing perf assertion, S3/S4 unsafe `as` casts, S10 the error-LoadState test gap) are project-rule violations the resolutions doc dismissed as "needs design call" when they don't.

The good news: the L15 contract types are sound. `task-verbs.ts` is the right shape, the deterministic body format is solid, drag deletion is total and well-tested, the decoder extraction (lib/thread-detail.ts) is a clean fix from the prior round, and the e2e covers the AC end-to-end. The remaining debt is concentrated in the popover (M1/M4/M5/S5/S11) and the WorkTeam mount effect (M2/M3/S1/S3) — both are surfaces that will see daily founder use. Fix M1-M5 before merge.

---

## Files referenced

- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-1a/packages/web/src/shell/TaskRequestPopover.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-1a/packages/web/src/shell/Kanban.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-1a/packages/web/src/pages/WorkTeam.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-1a/packages/web/src/pages/WorkTeamTaskThread.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-1a/packages/web/src/lib/thread-detail.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-1a/packages/design-system/src/Tag.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-1a/packages/shared/src/task-verbs.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-1a/packages/web/src/__tests__/Kanban.test.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-1a/packages/web/src/__tests__/TaskRequestPopover.test.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-1a/packages/web/src/__tests__/WorkTeam.test.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-1a/packages/web/src/__tests__/WorkTeamTaskThread.test.tsx`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-1a/packages/web/e2e/team-request.spec.ts`
