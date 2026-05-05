# L9 — Architecture Critique (round 1)

**Verdict: APPROVED (>=7)**

ARCHITECTURE-SCORE: 8/10 rounds=1 score-line: SA:9 LI:10 AC:8 DM:n/a N:9 MD:8 FMC:7 S:9 V:9

The plan is small, well-mapped, and grounded. I verified every load-bearing path reference against the worktree before scoring. Spec fidelity is excellent (every AC traces to a file or test), layer integrity is clean (everything is inside `packages/web`), and the test plan is explicit enough that a builder can execute it without redesign. One CRITICAL finding (a concrete legacy URL shape the plan misses), one WARNING (Outlet-context migration is partly under-specified), and a couple of suggestions.

---

## File-path verification (CC-007 reality check)

Every path the plan names was checked in the worktree:

| Plan reference | Verified |
|---|---|
| `packages/web/src/router.tsx` (current shape) | YES — matches §3 description verbatim, including `/settings` → `/conversations/review?settings=open` redirect at line 41. |
| `packages/web/src/pages/ConversationsReview.tsx` (current page) | YES — exists; uses `EmptyState`/`ErrorState`/`SkeletonList`/`ThreadShell`; the fetch + `decodeThreadDetail` lifecycle the plan extracts is at lines 159–193. |
| `packages/web/src/pages/ConversationsChat.tsx` (deleted) | YES — exists; is the mock fixture the plan describes. |
| `packages/web/src/pages/ConversationsChat.stories.tsx`, `ConversationsReview.stories.tsx` | YES — both exist. |
| `__tests__/ConversationsChat.test.tsx`, `.chatmode.test.tsx`, `.j8.test.tsx` (deletes) | YES — all three exist. |
| `__tests__/ConversationsReview.dispatch.test.tsx`, `.reasoning.test.tsx`, `.test.tsx` (renames) | YES — all three exist. |
| `packages/web/src/layouts/AppShell.tsx` lines named in §2.2 | YES — `selectedThreadId` state at L441; `setSelectedThreadId` at L442; `handleViewChange` navigate at L287; `handleSearchNavigate` default branch navigate at L360; Outlet context publishes `selectedThreadId` at L587. |
| `packages/web/src/pages/WorkTeam.tsx` line 168 | YES — exact match: ``navigate(`/conversations/chat?thread=${encodeURIComponent(threadId)}`)``. |
| `packages/web/src/shell/TaskSheet.tsx` line 193 | YES — `@lore` comment references `/conversations/chat`. The plan correctly notes that the actual nav is delegated through `onNavigateToThread` and only the lore comment changes. |
| `packages/web/scripts/visual-compare-map.ts` | YES — exists at `packages/web/scripts/`. |
| Existing e2e specs the plan enumerates in §6.5 | Verified at the directory level (e2e/ exists; specs named are present). The plan correctly identifies the legacy-URL grep is ~99 hits across `packages/web/src`/`scripts`/`e2e`. |
| `EmptyState`/`ErrorState` `dataTestId` prop | YES — both primitives accept `dataTestId?: string` and pass it through as `data-testid`. The plan's `dataTestId="conversations-empty"`, `"thread-not-found"`, `"thread-error"` are valid. |

No phantom files. No invented APIs. The plan is grounded.

---

## L9-specific concerns

### Are file paths real? (CC-007)

YES — see verification table above. No drift.

### Does the dispatch shape lean on L1's renderer or introduce a parallel switch?

LEAN. §1 D8 is unambiguous: "Page-level dispatch: None. The page does not branch on review-vs-chat. `ThreadShell` (L1) owns dispatch via TypeScript discriminant exhaustiveness on `Message.type`." The Vitest plan in §6.1 includes both a "review-shape thread" and a "plain-shape thread" assertion — two cases, same page, `ThreadShell` mounted. That proves no per-shape branching at the page layer, which is the L1 contract Concept §3 contract 2 requires. Clean.

### Does the redirect helper handle ALL legacy URL shapes (path-style and query-string)?

NEAR-COMPLETE — see CRITICAL #1 below. The plan handles four canonical legacy URL shapes (review/chat × no-id/with-id) via two route entries plus one helper component (`RedirectLegacyConversation`) parameterised on `paramName: "id" | "thread"`. The helper preserves all *other* query params (loop in §3 deletes only the legacy id paramName) which is correct migration hygiene. **What it misses:** there is a fifth legacy shape that exists in source today — `/conversations/review?settings=open` (the current `/settings` redirect target at `router.tsx` line 41). The plan correctly updates the `/settings` redirect to `/conversations?settings=open` (D7) — but does not consider whether someone with a bookmark to the *old* `/conversations/review?settings=open` URL (typed manually, or shared from before D7 lands) ends up at `/conversations` (queue, settings open) via the redirect helper, or just lands at `/conversations` with `settings=open` dropped. Trace through `RedirectLegacyConversation paramName="id"` mounted at `/conversations/review`: `params.get("id")` returns null, `carry.delete("id")` is a no-op (id wasn't there), `carry` retains `settings=open`, `suffix = "settings=open"`, `id` is null, target = ``/conversations?settings=open``. ✓ Actually correct. **But the plan doesn't say so.** Add a test case in `RedirectLegacyConversation.test.tsx` and a row in §6.2 covering "preserves `settings=open` and other unrelated query params on a legacy /conversations/review URL with no id." See SUGGESTION #1.

### Are tests addressing every AC? Vitest for unknown-thread fallback AND dispatch? Playwright e2e for Work → bet → detail?

YES.

| AC | Test pointer in plan |
|---|---|
| AC-1 (one queue + detail; legacy redirect, no 404) | §6.2 + §6.4 (legacy redirect Playwright + RedirectLegacyConversation Vitest) |
| AC-2 (detail renders the picked thread, rich messages inline) | §6.1 (mounts ThreadShell for review-shape AND plain-shape threads) + §6.4 (e2e visible ThreadShell on canonical URL) |
| AC-3 (naming collisions resolved per L1) | Concept §2 + §1.7 design + the file rename block in §2.2 |
| AC-4 (Vitest covers dispatch + unknown-thread fallback) | §6.1 (both branches present); §6.3 keeps the renamed dispatch + reasoning suites |
| AC-5 (Playwright e2e: Work → bet's thread → detail renders) | §6.4 first test, mocks `/api/bets/:id`, `/api/threads?host_kind=bet&host_id=…`, `/api/threads/:id` like `bet-thread.spec.ts` |
| AC-6 (`bun run check` + `lint` + `test` + e2e green) | §7 Phase V tasks 17–20 |

The "test before implementation" ordering is explicit (§7 splits Phase R / Phase G / Phase V; tests in R, code in G, verify in V). The DoD task is task 1 of Phase R — the rule "no code before DoD" is respected.

### Is the ordered task list executable by a builder without redesign?

YES, with one underspecified hand-off — see WARNING #1 (Outlet-context migration). The 22 ordered tasks each name a file and a delta. Phase R precedes Phase G precedes Phase V. The mass-update of e2e specs in §6.5 lists every spec by name with the count of replacements per spec — a builder can execute that mechanically with `sed` and re-run `bun run test:e2e` after each batch. The renames in tasks 16 use `git mv` (history-preserving), the deletes in task 15 are explicit. The biggest risk to execute-without-redesign is the AppShell change (task 11) — see WARNING #1.

### Risks: SSR vs client routing? Existing back-button flows broken by `replace`?

- SSR: not a concern. HyperIdle is a Vite SPA; `createBrowserRouter` is client-only. The plan does not invoke SSR.
- Back-button: §5 covers this explicitly. With `replace`, `/conversations/X` ← `/work/portfolio` (the page before the legacy URL). Tested in §6.4 third test ("Browser-history preservation"). The L9-single-detail.spec.ts test goes `/work/portfolio` → `/conversations/chat?thread=t1` → `goBack()` → expects `/work/portfolio`. That is the right test for the spec's "preserve history" clause.
- §8 risk #8 ("Race between redirect and AppShell mount") is correctly diagnosed: `<Navigate replace />` schedules synchronously during render, so the AppShell chrome does not flash the legacy state. No further fix needed.

---

## 9-dimension rubric scoring

| Dim | Score | Reasoning |
|---|---|---|
| Spec Alignment | 9 | All 6 ACs map to concrete file + test. No scope creep. The "follow-up: drop selectedThreadId Outlet field if no consumers" is correctly punted to a follow-up rather than absorbed. |
| Layer Integrity | 10 | All changes inside `packages/web` (Human Interface). No Meta or Agent reach. No backend. |
| API Contracts | 8 | `useThreadDetail` hook signature + `ThreadDetailStatus` discriminant are explicit (§4). The page signature is explicit (`Conversations(): JSX.Element`). No new HTTP contracts. The four-state status union is closed. |
| Data Model | n/a | No schema changes. Drops out of the average. |
| Naming | 9 | One canonical noun per concept. Page name = view name (`Conversations`). Hook name = its job (`useThreadDetail`). Helper name = its job (`RedirectLegacyConversation`). Status union members are exactly the four states the design names. The only minor naming slip is `paramName: "id" \| "thread"` — see SUGGESTION #2. |
| Module Depth | 8 | Three new modules: `useThreadDetail`, `Conversations`, `RedirectLegacyConversation`. Each has a single, narrow public surface. The hook is the only one with a non-trivial interface and that interface is exactly the four states the page consumes — not a 1:1 mirror of internal data. The only depth concern is the helper's `paramName` prop being publicly typed across two values when one inline implementation per route would have zero public surface — but the helper's reuse is real (two routes, identical body) so the prop is justified. |
| Failure-Mode Coverage | 7 | Status union covers loading/ready/error/not-found. AbortController handles unmount. Risk #5 (double-encoded ids) is honestly listed and punted to a test. Two coverage gaps: (1) **see CRITICAL #1** — the `?id=` param being itself empty-but-present (`/conversations/review?id=`) is not tested; (2) the "non-2xx that isn't 404" branch is one Vitest case (§6.1 row 6) — fine — but the plan should also assert the `error` field is non-null, since the existing `ConversationsReview` reports `HTTP ${status}` and the plan says "Anything else non-2xx is `error` with the message in `error`" without specifying the message format. CC-003 (security & abuse cases) is not applicable to a UI-only refactor — no POST/PATCH being added, no new trust boundary. |
| Simplicity | 9 | Small, focused, no abstraction-on-spec. The helper has *one* prop. The hook has one input. No feature flags, no plugin point, no backwards-compat shim that has no caller. The "design-it-twice" appears in §1 D1, D2, D3, D4 (each decision lists the rejected alternative with reason). None of the rejections are straw-manned. |
| Verifiability | 9 | Every AC has a concrete test (file path + assertion description). Phase R writes tests first; Phase G implements; Phase V verifies. Visual sanity in task 21 is explicit (open `localhost:5173/conversations`, click a thread, hit `/conversations/does-not-exist`, hit `/conversations/review`). Protected-tests block is implicit — the renamed `dispatch.test.tsx` and `reasoning.test.tsx` are framed as "stays as-is", which is the protected-tests contract for L9. Make explicit per SUGGESTION #3. |

**Weighted average: ~8.5/10. Plan ships at 8/10.**

---

## CRITICAL

1. **[plan §3 / §6.2]** **`RedirectLegacyConversation` does not handle the empty-string `?id=` (or `?thread=`) case.** The component reads `params.get(paramName)`. If the user visits `/conversations/review?id=` (no value), `params.get("id")` returns the empty string `""`, which is *truthy in `if (id)` only if non-empty* — actually JS `Boolean("")` is `false`, so the redirect target is correctly `/conversations` (no id). BUT if any caller passes whitespace (`?id=%20%20`), `params.get` returns `"   "` (truthy), and the helper builds `/conversations/${encodeURIComponent("   ")}` = `/conversations/%20%20%20`, which then 404s in `useThreadDetail` and lands on the not-found state — chained, technically the spec's "never 404" is honored only because of the 404→empty-state contract. **Fix:** in `RedirectLegacyConversation`, treat both empty-string and whitespace-only ids as "no id" (`const id = params.get(paramName)?.trim() || null;`). Add a test case to §6.2: "redirects /conversations/review?id=%20%20%20 → /conversations (whitespace-only id treated as no id)." This closes the gap between "the helper appears to handle missing ids" and "the helper handles every malformed id shape we shipped in 2024."

## WARNING

1. **[plan §1 D4 / D5 + task 11]** **Outlet-context migration is partly under-specified.** D4 says `AppShellOutletContext.selectedThreadId` becomes "derived from `useParams()` inside `AppShell` itself (read once via `useParams`, surfaced through Outlet for backwards compat)." But `AppShell.tsx` is the Layout route element — it does NOT have a `:threadId` param of its own; the param exists on the *child* route (`conversations/:threadId`). React Router v7's `useParams()` inside the layout returns the params merged from the matched child route, so this *should* work — but the plan does not say "verified", and the matched param key is `threadId`, while AppShell currently has `selectedThreadId` as a state (different name). The plan assumes the rename is mechanical; it isn't quite. **Fix:** add a sentence to D4 explicitly stating "`useParams<{ threadId?: string }>()` inside AppShell returns the child route's `threadId` param via React Router v7's merge-params behavior — verified by reading `react-router-dom@7` `useParams` source / matchRoutes" (the plan flagged this as ⚠️ UNVERIFIED in §3 — acceptable, but the verification needs to happen in Phase R when the failing test for AppShell.tsx publishes the derived `selectedThreadId`). Also: §8 risk #1 says "grep before commit — if no consumers, drop the field entirely" — but §6.1's renamed test `AppShell.threads.test.tsx` *does* consume `outletContext?.selectedThreadId` (verified at line 86 of the test file). The plan must keep the field, not drop it. Update §8 risk #1 to reflect the grep result rather than leave it as an open question for the builder.

## SUGGESTION

1. **[plan §6.2]** Add the case: "preserves unrelated query params (e.g. `settings=open`) when no legacy id param is present" — verifies the exact path through `RedirectLegacyConversation` for `/conversations/review?settings=open`, which is a real legacy URL shape (the current `/settings` redirect points there). The helper's logic already handles it correctly; the test makes that intentional.
2. **[plan §3]** `RedirectLegacyConversation`'s `paramName: "id" | "thread"` prop is fine but reads slightly opaque at the call site. Consider adding a JSDoc example in the component's TSDoc:
   ```
   // <RedirectLegacyConversation paramName="thread" /> redirects:
   //   /conversations/chat?thread=t1 → /conversations/t1
   ```
   Cheap clarity for the next reader.
3. **[plan §6.3 / new "Protected tests" subsection]** Make the protected-tests block explicit. Today it's implicit ("the test logic stands as-is"). Add a one-line "Protected tests (must not drift in L9):" block listing `Conversations.dispatch.test.tsx`, `Conversations.reasoning.test.tsx` (post-rename) — those two tests gate the L11 verdict-dispatch and the reasoning-message rendering invariants. CC-008 wants this list called out, even when the answer is short.
4. **[plan §8 risk #6]** "What if `handleSearchNavigate`'s 'conversation' result type carries an id?" — the plan says "verify with one grep." That grep should happen now, not be deferred. `AppShell.tsx` line 360 is the call site; reading the surrounding 20 lines tells you whether the result type has an id field. If it does, the plan should add a one-line task ("update handleSearchNavigate's conversation branch to navigate to `/conversations/:id` when the result carries an id; otherwise `/conversations`"). If not, mark the risk N/A. Leaving it as "verify" punts a 30-second check into Phase G where it becomes a redesign moment.

## What's Working Well

- **Decisions block at the top.** §1 lists 11 decisions with rejected alternatives. Every load-bearing pick is enumerated upfront. A reviewer can score against the decisions, and a builder can execute against them — no hidden choices baked into prose later. This is the right shape for a routine architecture doc.
- **File-path verification under-the-hood.** Every line number cited (AppShell L168, L193, L287, L360, L441) matches the worktree exactly. The plan was clearly drafted by reading the repo, not by speculating from memory. No CC-007 drift.
- **Honest unverifieds.** §3's ⚠️ UNVERIFIED on React Router v7's `<Navigate replace />` semantics is correctly flagged. The plan does not pretend to have re-read the v7 docs — it points to verified-by-grep prior usage in the repo and lets the test catch any v7 surprise. This is exactly the "Source-driven development" rule applied honestly.
- **`useThreadDetail` extraction.** Promoting "not-found" from a string match (`error === "Thread not found"`) to a typed status (`ThreadDetailStatus = "loading" | "ready" | "error" | "not-found"`) closes a real bug class — today's code stringly-compares the error message, which is brittle. The hook's type signature is small (4 fields), single-purpose, and testable. Good restructuring.
