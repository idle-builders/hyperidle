# L8 — Adversary Review

**Branch:** `feat/L8-conversations-submenu-threads`. **Mode:** read-only. **Spec:** TRACK-L.md L269-L294. **Plan:** L8-plan.md.

Tally: **2 Blocking · 4 Major · 3 Minor**

---

## BLOCKING

### B1. Lifted selection never reaches the main pane — AC violated, tests rubber-stamp it
**File:** `packages/web/src/layouts/AppShell.tsx:515`; `packages/web/src/pages/ConversationsReview.tsx` (untouched).
- AppShell holds `selectedThreadId` state (line ~390) and updates it on row click. **`<Outlet />` is rendered with no `context=` prop.** ConversationsReview does not read `useOutletContext`. The lifted id is write-only.
- Plan §6 task 12 explicitly required this wiring. It was skipped.
- AC L8: *"Selection drives a lifted selected-thread id"* AND *"clicking a thread updates the main pane"* (validation scenario). The current build satisfies neither — clicking a row paints `aria-current` and does nothing else. The pre-existing `?id=` URL param is the only way the main pane ever picks a thread, and L8 doesn't change that pathway.
- **Protected test §7.2 does NOT catch this.** `AppShell.threads.test.tsx:157` ("clicking a thread row updates lifted id, does not call navigate()") asserts pathname/search are unchanged. It never inspects main-pane content. The plan §7.2 spec required *"the Main pane reflects threadId=3 (read via testid)"* — that assertion is absent from the test body.
- Playwright `conversations-submenu.spec.ts:72` is named "updates the main pane and does not change URL search params" but its body only checks URL stability + `aria-current` count. Title is a lie.
- **Fix:** wire `<Outlet context={{ selectedThreadId }}>` and have ConversationsReview consume it; add a test that asserts main-pane DOM reflects the clicked id.

### B2. Abort/refetch race leaks stale data into state
**File:** `packages/web/src/hooks/useConversationsThreads.ts:108-144`.
- `AbortController.abort()` only cancels the in-flight `fetch`. After `await res.json()` resolves, the async closure proceeds to `setThreads(...)` / `setStatus("ready")` regardless of whether a newer effect ran. There is no `if (ac.signal.aborted) return` guard between `await res.json()` and the state writes, and no per-effect "is this the latest" token.
- Concrete failure: rapid `retry()` (or `participantId` change) — request A starts, `tick` bumps, request B starts, request B aborts A, B finishes first writing `ready`, A's body parse completes a moment later and overwrites with stale rows. State silently regresses to a prior list.
- Effect-cleanup also calls `ac.abort()` on unmount, but the same race produces `setState`-after-unmount warnings and dead writes.
- **Fix:** check `ac.signal.aborted` after each await before any setState, OR use an effect-scoped `cancelled` boolean closed over by the closure (the standard React pattern).

---

## MAJOR

### M1. `isThreadListRow` type guard is partial — server drift will corrupt rows silently
**File:** `useConversationsThreads.ts:50-61`. Guard validates `id`, `hostKind`, `hostId`, `lastActiveAt`, `hasUnresolvedReview`. It does NOT validate `pinned`, `resolvedAt`, `initiatorId`, `participants`, `createdAt`. `rowToItem` then reads `row.pinned` and `row.resolvedAt` without any defensive coercion. If the server omits `pinned`, rows pass the guard with `pinned === undefined`; downstream `sortActive` does `a.pinned !== b.pinned` (undefined vs undefined) — silent sort breakage. Use Zod (already in repo) or finish the guard.

### M2. Count-derivation tests are tautological
**File:** `ThreadSections.conversations.test.tsx:114-131`.
- The "counts equal rendered list length — never literal" test reads `data-thread-section-count` and `[data-ds-component='ThreadRow']` from the same render. The component renders both from the same `section.items.length` / `section.items.map`. By construction these match — the test cannot fail. It would catch only a hand-typed literal in the JSX, not a stale prop, a wrong source array, or a filter that operates on counts but not rows.
- The chrome-level test in `AppShell.threads.test.tsx:141` asserts `badge?.textContent === "7"` for 7 threads. **This** would catch a literal regression. Plan §7.1 promised richer assertions (filter='Resolved' → badge=2 — never written).
- Net: §7.1 is partially encoded. Acceptable as-is for a recurrence guard, but the plan oversells what's tested.

### M3. Empty `SUBMENU_CONFIG.conversations.items: []` + `handleViewChange` special-case is over-fitted
**File:** `AppShell.tsx:39-44, 272-278`.
- The `SUBMENU_CONFIG` map now has a structural exception (one entry has `items: []`); the click handler grew an `if (view === "conversations")` branch to compensate. The "no items, here is a hardcoded route" branch is exactly the kind of static-route data the AC asked us to delete. We removed two NavItems and added a routing constant in code instead. Net loss in honesty.
- The route `/conversations/review` is the *fallback default* — and is the same route the URL is on when the view is conversations. The `navigate()` call here is a no-op in steady state and only fires if the user clicks the conversations icon while on a different view. Either delete the special case (no nav at all when target view is conversations) or move the default route into a constant declared next to the SUBMENU_CONFIG.

### M4. `host_kind` validation drops rows silently — no telemetry, no test
**Files:** `useConversationsThreads.ts:131` (`.filter(isThreadListRow)`); plan §5 promised "Zod parses at boundary; the Submenu drops the `hostTag` pill if the kind is not in the closed enum."
- The hook `.filter`s out invalid rows but never logs or surfaces the count drift. If a server change adds a new `HostKind`, the user sees fewer threads than exist, the title-bar badge undercounts, and no test catches it. The "counts must match list length" contract holds *for the filtered list*, not the actual server response.
- Either validate-then-render-defensively (preserve the row, drop the pill — what §5 promised) or fail loudly. The current "silent drop" is the third path neither doc described.

---

## MINOR

### m1. `formatRelative` returns `""` for malformed `lastActiveAt`
`useConversationsThreads.ts:65`. NaN-parse path silently surfaces an empty timestamp cell. EmptyState is preferable, or "—".

### m2. `FALLBACK_AVATAR` is the *only* avatar
Hook hardcodes the same SVG for every row regardless of `initiatorId` / `participants`. Plan §3.2 said "identity → avatar mapping; reuse existing identity-avatar helper". Helper not used. Visual: every row has the same grey square. Acceptable as L8 stub — but it should be acknowledged as a known regression vs. design (rows look identical), not silently shipped.

### m3. `DEMO_FOUNDER_ID = "u-founder"` duplicated, not imported
The same constant exists elsewhere (plan §2 references L1's `DEFAULT_FOUNDER_ID`). Two literals will drift. Import the L1 constant.

---

## VERDICT

**STOP.** B1 is an AC failure shipped behind a test that was named to imply coverage it does not provide. The protected `selection-not-routing` test (§7.2) is the canonical example of a test that proves what's easy to prove (URL didn't change) and skips what matters (the main pane updated). B2 is a real data-corruption race in the only network code in this story. Both are fixable in under an hour; do not merge until they are.
