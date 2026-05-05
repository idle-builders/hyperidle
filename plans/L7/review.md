# L7 — Adversary Review

Reviewer: adversary
Scope: `docs/work-packages/TRACK-L.md` lines 238–265 (story), `docs/work-packages/L7-plan.md`, full L7 worktree diff (tracked + untracked).

Tests run during this review: 25 server-side + 26 client-side L7-specific tests; all pass. Typecheck (`bun run check`) clean. Findings are **NOT** about test redness — they are about correctness and completeness gaps the green tests fail to catch.

---

## CRITICAL (must fix before proceeding)

### C1. `AgentResponseRouter` is never instantiated in production. The agent-unblock half of the story is dead code.

- File: `/workspace/.worktrees/L7/packages/server/src/skill-tools/await-thread-response.ts:91-93`
- File: `/workspace/.worktrees/L7/packages/server/src/skill-tools/tool-registry.ts:36-42` (interface), no caller.
- Plan §5 lists `packages/server/src/server-factory.ts` as "Modified — instantiate `AgentResponseRouter` and pass into `ToolContext`." That file is **not in the diff**. `grep -rn responseRouter packages/server/src --exclude=tests` returns zero non-test references outside the tool itself.
- Effect: in any real harness session the tool returns `err("INTERNAL", "responseRouter is not wired into ToolContext")` on every call — the sync-unblock path the spec calls "the whole point of a response" (story line 246) is never reached. The drain-fallback works because it does not need the router, so cursory "happy path on first inbox poll" testing might pass — but the story's *waiting agent unblocks now* contract is unimplemented in production.
- Acceptance criterion at TRACK-L.md:246 ("response becomes an event that **unblocks the agent waiting on it (sync)**") is not met. Validation scenario at line 256 ("agent waiting on that response receives the unblock event and continues its tool call") is asserted only against a hand-constructed router in the test; production never instantiates one.
- Test theatre: `await-thread-response.test.ts:128-140` builds `responseRouter` directly into the test ToolContext; the corresponding production wiring is never exercised. There is no integration test that walks through the real HTTP commit → real EventBus → real router → real tool path.

### C2. Postgres migration for `agent_thread_cursor` is missing. Postgres deployment is broken.

- `/workspace/.worktrees/L7/packages/db/drizzle/0009_agent_thread_cursor.sql` exists (sqlite).
- `/workspace/.worktrees/L7/packages/db/drizzle-pg/` contains migrations 0000–0007. **There is no 0008+/`agent_thread_cursor` migration for PG.**
- `schema.pg.ts:217-235` declares the table, so types compile, but `bun run db:migrate` against PG will not create it. First production deploy on PG will throw on the first `INSERT INTO agent_thread_cursor` from the tool handler.
- The "dual-driver" test in `packages/db/src/__tests__/agent-thread-cursor.dual-driver.test.ts:75` is **sqlite-only despite the file name** — it uses `createTestDb()` (better-sqlite3) and `PRAGMA` introspection. Search for `postgres|pg` in the file: only the comment header. Plan §10.3 mandated "both SQLite + Postgres" coverage for this exact file.

### C3. The `last_seen_message_id` schema is internally contradictory; the trigger workaround is sqlite-only and changes the FK semantics silently.

- `schema.ts:235`: `lastSeenMessageId` declared `text(...).notNull().references(messages.id, { onDelete: "set null" })`. NOT NULL + SET NULL is a schema impossibility — the moment a referenced message is deleted, the action attempts to write NULL into a NOT NULL column and fails.
- The migration file `0009_agent_thread_cursor.sql:23-32` papers over this with a hand-written sqlite `BEFORE DELETE` trigger that **deletes the cursor row instead of setting NULL**. This silently converts the declared `SET NULL` semantic into `CASCADE` for the message FK only on sqlite.
- PG side has no trigger and no equivalent — even when the PG migration is added (C2), every message hard-delete will throw a NOT NULL constraint violation on the cursor row.
- The lore comment on `schema.ts:228-233` admits the conflict ("a literal SET NULL would fail with a NOT NULL constraint violation") but does not resolve it — the right fix is either (a) make the column nullable, or (b) declare `onDelete: "cascade"` and drop the misleading SET NULL+trigger combo. The current state is a footgun: introspection (`PRAGMA foreign_key_list`) reports SET NULL while the trigger silently does CASCADE, so any future audit of FK actions will be wrong.
- The dual-driver test at line 162-174 actually **asserts the SET NULL declaration** is configured — it never tests that a real message delete works without the trigger, never tests the trigger fires correctly on PG (because there is no PG run), and never tests what happens if the trigger is dropped. This is a textbook "test the comment, not the behavior" failure.

### C4. The `AgentResponseRouter` race contract documented in plan §4.4b is **not implemented in the router**. The drain check happens in the tool handler but is sequenced wrong.

- Plan §4.4b (lines 171-184) describes "register waiter under router internal lock → run drain SELECT in same critical section → release lock." This is the load-bearing race-safety claim.
- `agent-response-router.ts:60-87` (`waitFor`) has **no internal drain check at all** — it only registers the waiter. The drain SELECT lives in the tool handler at `await-thread-response.ts:140-150`, which runs **before** `router.waitFor` is called (line 163), not "in the same critical section" as registration.
- Failure scenario: the tool handler runs `SELECT` (line 144), gets no row, then `await router.waitFor` (line 163). Between the SELECT and the `waitFor` registration, an HTTP commit can run (it is a separate request handler in JS event-loop slots opened by every `await`) and emit `thread_message_appended`. The router has no waiter yet, so the event is dropped. The waiter then registers, sees nothing, and times out 60 s later — even though a qualifying message landed.
- The tests do not catch this because they never await between drain and registration. The router test at `agent-response-router.test.ts:135-148` registers the waiter first, then inserts; the tool test at `await-thread-response.test.ts:228-239` uses `await Promise.resolve()` to "tick the microtask queue" but inserts AFTER that yield — never tests the "commit during drain→register window" hazard.
- This invalidates the @lore claim at `agent-response-router.ts:12-15` that "a waiter registered before the commit's `bus.emit(...)` always receives the event" because the contract being protected (the drain) is OUTSIDE the router and there is no register-then-drain-under-lock sequencing anywhere.

### C5. The async-ack toast detection is wrong. Verdict commits that resolve the head fire the async toast.

- `ConversationsReview.tsx:215-234`: `nextResolvedAt` is read from the commit response body (`thread.resolvedAt`), `priorResolvedAt` is read from the prior detail. The async branch fires when `nextResolvedAt === null && priorResolvedAt === null`.
- Failure case 1 — verdict `request-changes` / `edit` on a review HEAD: the verdict appends a verdict message that resolves the HEAD message but the **thread itself stays open** (`thread.resolvedAt` remains null because there are still subsequent unresolved messages or the host workflow keeps the thread alive). Plan §4.5 says "An async thread is one where: thread.resolvedAt === null AND the appended message did NOT cause resolution (i.e. it wasn't a verdict that resolved the head)." The implementation only checks thread-level `resolvedAt`, not head-message resolution. Result: a verdict that resolves the head but leaves the thread open fires the async-ack toast saying "agent will pick it up on next session" — **false UI for a sync-resolution event**.
- Failure case 2 — `priorResolvedAt === null` is read from `detail.thread.resolvedAt` at click time, but if the thread was already resolved before the user clicked (e.g. another reviewer raced), `priorResolvedAt` is non-null and the async branch is silently suppressed — even when the response IS a non-resolving plain reply (correct copy: "agent will pick it up next session"). The toast goes missing.
- The Vitest test at `ConversationsReview.commit.test.tsx:287-306` asserts only the case where both prior and next are null, never the head-resolves-but-thread-doesn't case, never the prior-resolved-thread case. Contract miss is not test-covered.

### C6. `useToastBridge` falls back to a local timer that leaks across unmounts and bypasses the toast region's invariants.

- `ConversationsReview.tsx:120-142`: when the page is rendered without an enclosing `<ToastRegion>` (the doc comment says "some unit tests, storybook"), it calls a bare `setTimeout` to clear `localMessage` after 4 s. There is no cleanup on unmount. If the user navigates away within 4 s, the setState fires on an unmounted component → React warning + memory leak in real navigation.
- It also bypasses the single-toast invariant the ToastRegion is documented to enforce (`ToastRegion.tsx:8-9`): rapid messages stack timers; the latest message's timer wins by overwrite, but earlier timers still fire `setLocalMessage(null)` and can race the second toast's display.
- The "fallback" exists ONLY because the `ConversationsReview` page mounts in tests without `<ToastRegion>` — a test problem, not a product problem. The right fix is to wrap the page-level RTL render in `<ToastRegion>`, not to add a parallel rendering path with weaker guarantees that ships to production.
- The async-ack vitest at line 304-305 asserts `screen.findByText(/Response recorded.../)` but never validates which path produced it (region vs. fallback) — the test passes against the broken fallback indistinguishably from a working one.

---

## WARNINGS (should fix, creates risk)

### W1. `Composer.tsx` payload preservation relies on uncontrolled DOM state, which contradicts the React paradigm and breaks programmatic control.

- `Composer.tsx:69-83`: the textarea is uncontrolled — text lives only in `node.value`. The author's @lore comment at lines 70-74 admits this is to "sidestep React's controlled-input value tracker." That is a workaround for a problem that doesn't exist if state is lifted properly.
- Consequences:
  - Page-level retry that wants to re-send the same text cannot read the composer's content without a ref handshake the page does not have.
  - The "Idle: renders enabled textarea" test at `Composer.pending-error.test.tsx:73-78` does not test that pre-existing content survives a `pending=true` → `pending=false` transition — only that the DOM node exists. The "preserved on error" test at line 130-140 sets `value` directly via DOM (not via React) so it tautologically passes even if React would reset on re-render.
  - The retry path on the page (`ConversationsReview.tsx:249-253`) uses `lastInputRef.current` for verdicts but cannot replay composer text because the composer never lifted it to the page on submit failure. The composer's local `setLocalError` swallows the failure but doesn't expose the unsent text.

### W2. `await_thread_response` participant authz parses `participants` as JSON in the handler, duplicating logic that exists elsewhere.

- `await-thread-response.ts:107-117`: re-implements thread-participant decoding from a JSON-encoded text column. Compare to `read-inbox.ts` and `threads.ts:572-604` (`rowToThread`). Three independent implementations of the same logic, each with their own error handling. When the participant encoding changes (e.g. add identity-tag suffixes), all three drift.
- Lower priority but should be folded into a single decoder in `@hyperidle/db` or `@hyperidle/shared`.

### W3. The "drain check" in the tool handler does an `agent_thread_cursor` lookup followed by a `messages` lookup to fetch the cursor's `createdAt`. That is N+1 by design.

- `await-thread-response.ts:120-138`: select cursor → if cursor exists, second SELECT to get `messages.createdAt` for the cursor's `lastSeenMessageId` → only then run the drain SELECT.
- A single join (`agent_thread_cursor LEFT JOIN messages ON last_seen_message_id = messages.id`) returns the same data in one round-trip. The cursor row could also store `lastSeenAt` (already present!) — the schema has it but the handler ignores it and re-fetches `createdAt` from `messages` instead. Two writes (`writeCursor` sets both) but only one is used downstream. Either drop `lastSeenAt` or use it.

### W4. The skill-tool registry exposes `await_thread_response` to `chief_of_staff` and `practice_facilitator` roles, but those roles never run as harness agents that block on a thread.

- Plan §8.1 (line 343) says: "visible to roles `["builder", "chief_of_staff", "practice_facilitator"]`." Implementation matches (`await-thread-response.ts:213`). But the spec at line 246 frames the contract around "the agent waiting on it" — the harness loop. Chief-of-staff and practice-facilitator roles are not harness loop agents in any current code path I can find (they are orchestrators / human-facing workflows).
- Risk: granting the tool to a role that has no harness loop means a misconfigured agent can call `await_thread_response` and pin a server-side waiter for up to 10 minutes, holding a Promise reference and the EventBus subscription. The DoS mitigation (plan §9 row "Promise leak") was the timeoutMs cap; granting the tool more broadly weakens that.
- Recommend: visible to `builder` only until a second harness role explicitly needs it.

### W5. `tool-registry.test.ts` was edited from "12 tools" to "13 tools" and `tool-registry-role.test.ts` was edited from "all 12 tools" to "all 13 tools" — but the *original* tests were the protected canonical-set assertions per plan §10.2. Plan §10.2 said "additive edits only — no existing assertions weakened." Bumping the count and adding `await_thread_response` to the canonical set IS additive. But the **role visibility check at line 90-94** of `tool-registry-role.test.ts` (existing, untouched) was a `toHaveLength(12)` exact-match. Plan promised explicit role-visibility assertions for the new tool ("HIDDEN from any future founder-as-agent role … add explicit assertions for each role"). Implementation only bumped the count and added one `expect(names).toContain("await_thread_response")` — the per-role hide-from-founder assertions promised in the plan are missing.

### W6. The Composer keyboard suppression (`isPending` short-circuit at `Composer.tsx:94`) only catches the `metaKey || ctrlKey + Enter` combo. Bare Enter in a textarea inserts a newline; that's fine. But the Composer also does NOT suppress the click handler on the Send button independently — it relies on `disabled={isPending || !hasContent}`. If the page-level `pending` is true but `hasContent` is false (empty textarea + a retry that just cleared it on success of a different commit), Send becomes enabled at the moment `pending` flips false. Race: a stale `mousedown` event fired during the `pending=true` window could land its `click` after `pending=false` because `click` fires on `mouseup`. The button-pressed-state test at `Composer.pending-error.test.tsx:80-87` only checks `aria-busy` at one moment in time, not the cross-transition behavior.

### W7. The Vitest `ConversationsReview.commit.test.tsx` `installFetch` global stub at line 53-60 is never restored except via `vi.restoreAllMocks()` at `afterEach` — but the assignment is `(globalThis as any).fetch = vi.fn(...)`, and `vi.restoreAllMocks` resets spies but does not restore properties assigned imperatively. If a later test in the same file (or a parallel file via worker reuse) reads `globalThis.fetch`, it gets a dead `vi.fn` from the prior test's closure. Test pollution risk that grows as the file grows.

---

## OBSERVATIONS (worth discussing)

### O1. The plan is 446 lines for a "M (~2-3d)" story. The architecture document is doing the work the implementation should do — every contract is restated verbatim with column counts, table cardinalities, error taxonomies, and 24 rows of failure-mode tables. This is the kind of plan that, in retrospect, is what a `/architecture` skill produces when uncertain. The implementation's complexity tax is now permanently fixed at the level of the plan, even where simpler designs were available.
- Concrete simpler alternative the plan dismissed without evidence: WebSocket subscription from the harness back to the server (plan §12 alternative B). The plan rejected B for "doubles the transport surface" and "auth complexity," but the harness already speaks WS for `ws-broadcaster` events and `ws-subscribe-authz` is the same participant check the new tool re-implements. The chosen solution invents a second transport (in-process EventBus + waiter map) plus a new DB table plus a tool that wraps both — three new moving parts where one (a thread-scoped WS subscription gated by participant authz) would have done.
- The "Reverse cost of (A) is small" claim in §12 is glib: the cost of removing the cursor table when Redis lands is non-trivial, and the cost of making `await_thread_response` work cross-process is the entire reason Redis is needed.

### O2. `ToastRegion.tsx:78-83` hardcodes Tailwind arbitrary-value classes (`px-[12px]`, `py-[8px]`, `text-[13px]`) instead of density tokens (`var(--density-pad-x)`, `var(--density-text)`). Per `aesthetic-quality.md` AQ-002 this is a hard rule violation: "Density tokens for component internals … No hardcoded `p-[Npx]` / `gap-[Npx]`." The file claims to be a Tier 3 shell wrapper, which exempts it from the design-system component budget but NOT from token rules — "use tokens" applies anywhere they are available.

### O3. `ReviewVerdictBar.tsx:114` uses `min-h-[44px]` and a custom spinner element (lines 117-121) hand-rolled rather than DaisyUI's `loading loading-spinner` primitive. Frontend rule: "Use DaisyUI primitives directly — never wrap them." A custom `loading-spinner` class on a `border-r-transparent animate-spin` div is a reinvention.

### O4. `ConversationsReview.tsx:217` clones the Response (`res.clone().json()`) only to peek at `thread.resolvedAt`, but the page then refreshes via a separate `GET /api/threads/:id` (line 224). Two server hits where one would do — the commit response already contains the full thread. Either trust the commit response and skip the GET, or skip the clone and read the thread from the GET. Currently both are done.

### O5. The classification copy in `classifyError` (line 88-93) is a binary: AbortError → "timed out," everything else → "no connection." Plan §4.5 distinguishes "AbortError due to 15s timeout" (true timeout) from "network/AbortError on offline" (network drop). The implementation cannot tell them apart because both surface as `AbortError` in `fetch`. The 15s deadline timer at line 190 always fires `ac.abort()`; if the network fails first, the timer's `abort` may also fire afterwards. The two messages always disambiguate by "did the timer fire?" not by error class — but the classifier reads error class, so the differentiation is only correct because `TypeError("Failed to fetch")` (the Vitest mock throws this for network) bypasses AbortError and falls through to the network branch. Real-browser network drops mid-request often surface as AbortError too — the message will be wrong in production for that path.

### O6. The plan promised `ThreadShellPendingErrorComposition` story (plan §6 T7) and component tests asserting "focus moves to `[Retry]` on error, focus returns to textarea after composer success." Neither focus-movement assertion appears in the actual test files. The committed tests assert presence and aria-busy, not focus. AQ accessibility-coverage gap.

### O7. `await_thread_response` has no observability — no log line, no event emit, no metric increment. The plan §4.3 said "the unblock primitive observable in the existing tool-call event stream (`tool_call_recorded`, events.ts:153)." That happens at the registry layer (existing infrastructure), not in the tool — fine — but there is no per-call timing or success/failure breakdown for the router itself. When this misbehaves in production (timeouts spiking, supersedes spiking), there will be no signal until founders complain.

---

## VERDICT

**STOP.**

C1 alone blocks the story: the agent-unblock half is unwired in production. The story's stated definition of done — "response becomes an event that unblocks the agent waiting on it (sync)" — is not met. Tests pass because they construct the router by hand; the production code path returns INTERNAL.

C2/C3 block any PG deployment of this story. C4 makes the sync-unblock contract racy even if C1 is fixed. C5 ships visibly wrong UI on the verdict-resolves-head case. These are not nits — they are the load-bearing claims of the plan.

Required fixes before this lands:
1. Wire `AgentResponseRouter` into `server-factory.ts` and `ToolContext`, with an integration test that goes HTTP → EventBus → router → tool with a real server harness.
2. Add a Postgres migration (`drizzle-pg/000N_agent_thread_cursor.sql`).
3. Resolve the SET NULL + NOT NULL contradiction at the schema level. Pick one: nullable column, or CASCADE. Drop the trigger.
4. Move the drain check inside the router under the same critical section as `waitFor` registration, OR document and test the exact register-then-drain sequencing in the handler with a test that emits between drain and registration.
5. Detect head-resolution (not just thread-resolution) for the async-ack branch; add the test row.
6. Fix the toast fallback's unmount cleanup or remove the fallback entirely.

After those, the warnings (W1–W7) are addressable in a second pass. O1's recommendation to revisit transport choice is for a retro, not this story.
