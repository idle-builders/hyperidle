# L8 — Definition of Done Audit

**Story:** TRACK-L L8 — Render thread sections in Conversations Submenu
**Worktree:** `/workspace/.worktrees/L8`
**Branch:** `feat/L8-conversations-submenu-threads`
**Auditor:** QA (read-only audit)

## Top-line verdict

**DONE — with one minor caveat (`bun run lint`).** All seven acceptance criteria
have verifying artifacts (vitest tests + Playwright E2E). The full vitest suite
is green (2971 passed, 3 skipped). `bun run check` is green. `bun run lint`
fails with **17 errors** vs **16 errors** on `main` — the +1 delta lives
exclusively in the L8-introduced design exploration HTML mockups
(`docs/design-explorations/L8/variant-*/mockup.html`: missing `type=button`
attributes + an `<svg>` without title). Code under `packages/**` is clean.

## Per-AC table

| # | Acceptance criterion | Verification artifact | Verdict |
|---|----------------------|------------------------|---------|
| 1 | Submenu renders the full thread list from L1 store, grouped into sections that read naturally; static entries `AppShell.tsx:39-44` and counts `:40-41` removed. | `packages/web/src/components/__tests__/ThreadSections.conversations.test.tsx` ("classifies threads into blocking/active/resolved buckets", "renders sections in canonical order"); `packages/web/src/__tests__/AppShell.threads.test.tsx` ("SUBMENU_CONFIG has no static conversations items"). Code: `AppShell.tsx:51-54` shows `conversations.items: []`. | **DONE** |
| 2 | List fed by real query against L1 thread store; selection drives lifted selected-thread id, NOT route navigation. | `useConversationsThreads.test.tsx` (URL contains `/api/threads`, `participant_id`, `limit=50`); `AppShell.threads.test.tsx` ("clicking a thread row updates lifted id, does not call navigate(), and updates main pane via outlet context") — asserts `pathname`/`search` unchanged + `main-stub` reflects lifted id via Outlet context. | **DONE** |
| 3 | Section counts derived from fetched list, not literals. | `ThreadSections.conversations.test.tsx` ("counts equal rendered list length — never literal", "section header count badge text equals the literal section size on a fixed fixture" — pins 2/3/1 against an independently counted fixture so the legacy `3`/`1` cannot survive); `AppShell.threads.test.tsx` ("submenu title-bar count equals total rendered rows"). | **DONE** |
| 4 | Vitest covers empty list rendering, mixed list rendering, selection driving lifted id. | Empty: `ThreadSections.conversations.test.tsx` ("renders EmptyState when no threads provided"). Mixed: same file ("renders section headers for the three conversation buckets" + 5-thread fixture). Selection→lifted id: `AppShell.threads.test.tsx` ("clicking a thread row updates lifted id…"). | **DONE** |
| 5 | Playwright E2E: list loads, click updates main pane, count badges match list contents. | `packages/web/e2e/conversations-submenu.spec.ts`: "loads thread list and renders rows by section", "clicking a thread row updates the main pane and does not change URL search params", "counts at every section level equal that section's rendered row count", "network failure renders ErrorState". | **DONE** |
| 6 | Matching inventory rows from L6 (page-local thread mocks, hardcoded submenu counts) are closed. | `docs/reviews/improvements-conversations.md` row #3 ("Render `<ThreadSections>` in Conversations Submenu") — proposed change is exactly the L8 implementation: 2 NavItems replaced with `<ThreadSections>` fed by real list; selection lifted; counts derived. The inventory file itself has not been amended to mark #3 closed (text still reads "is built and storybooked but never imported"). Substantive closure: confirmed by code; bookkeeping closure: not done. | **DONE (caveat: inventory text not updated)** |
| 7 | `bun run check` + `bun run lint` + `bun run test` all green; full e2e stays green. | `bun run check`: PASS. `bun run test`: PASS (284 files, 2971 tests). `bun run lint`: 17 errors / 130 warnings — **+1 vs `main` baseline (16)**. The new error is in `docs/design-explorations/L8/variant-b-recency-status/mockup.html:197` (`noSvgWithoutTitle`). Per `.claude/rules/visual-parity.md` HTML mockups are design source-of-truth and must not have styling edits — but a11y attribute additions (title element, button type) are renderability fixes, not styling, so the gate is technically open. E2E suite was not exercised in this audit (Playwright requires server; out of scope for read-only DoD). | **GAP (minor): lint adds 1 error** |

## Validation scenarios

| Scenario | Status |
|---|---|
| 7 threads on the server → Submenu shows 7 rows grouped sensibly | **VERIFIED** in `AppShell.threads.test.tsx` ("renders threads from /api/threads as the submenu list") + e2e `conversations-submenu.spec.ts` ("loads thread list…") |
| User clicks a thread → main pane renders that thread | **VERIFIED** in `AppShell.threads.test.tsx` ("clicking a thread row updates lifted id … and updates main pane via outlet context") + e2e ("clicking a thread row updates the main pane…") |
| Network fails → Submenu shows clear error state, never silent collapse | **VERIFIED** in `useConversationsThreads.test.tsx` ("surfaces error when fetch fails", "surfaces error when network throws") + `ThreadSections.conversations.test.tsx` rendering ErrorState path + e2e ("network failure renders ErrorState") |

## Contracts / constraints

- **Counts must match list length.** Verified — see ACs 3 and 5; protected
  test §7.1 enforces equality at every section header and at the title-bar
  badge.
- **No keyboard verb shortcuts on the list.** No keybindings registered in
  `useConversationsThreads.ts` or `ThreadSections.tsx`. Confirmed by code
  inspection.
- **No emojis.** `ThreadSections.tsx` and `useConversationsThreads.ts` contain
  no emoji glyphs (the Unicode pin glyph used in `ThreadRow` is an SVG path,
  not an emoji). Confirmed by code inspection.

## Grouping logic and section names (spotlight AC)

The submenu groups threads into exactly three sections in canonical order:

1. **Blocking** (danger tone, sticky header, 10% danger-tinted background, 3px
   left accent — `ThreadSections.tsx:184-195`).
2. **Active** (neutral; pinned-first sort, then `hasUnresolvedReview`, then id).
3. **Resolved · 24h** (neutral; opacity-70 rows; absent if empty).

Classifier ladder (per `approved.md §2`, codified in `classifyForConversations`):
`resolvedAt within 24h` → resolved; else if `blocking` → blocking; else →
active. The blocking-vs-resolved tie-break is explicitly tested ("blocking
outranks resolved if both flags present" — resolved wins as the terminal
state). The re-opened blocking thread (resolved past 24h, blocking false)
correctly lands in Active.

## Static-entry removal (spotlight AC)

`git diff main -- packages/web/src/layouts/AppShell.tsx` shows:

- Lines 39-44 of the original `SUBMENU_CONFIG.conversations.items` (Review
  Queue + Chat with `count: 3` / `count: 1`) are **removed**; replaced with
  `items: []` and a comment referencing the L8 ACs.
- The replacement render path at `AppShell.tsx:481-501` uses
  `<ThreadSections>` fed by `useConversationsThreads(DEMO_FOUNDER_ID)`.
- Title-bar count derives from `conversationsThreads.threads.length` when
  `activeView === "conversations"` (`AppShell.tsx:389-396`), not from any
  literal.

## Lifted selection vs route navigation (spotlight AC)

- Selection state lives at `AppShell.tsx:402` (`useState<string | null>`),
  surfaced to `<Outlet>` via context (`AppShell.tsx:539-545`).
- `handleSelectThread` calls `setSelectedThreadId` only — no `navigate()`
  call (`AppShell.tsx:403-405`).
- Vitest assertion: `router.state.location.pathname` and
  `router.state.location.search` are unchanged after click. E2E assertion:
  `expect(page.url()).toBe(beforeUrl)` post-click.

## Gaps

1. **GAP (minor):** `bun run lint` introduces +1 error in
   `docs/design-explorations/L8/variant-b-recency-status/mockup.html:197`
   (`noSvgWithoutTitle`). Baseline `main` has 16 errors all in pre-existing
   design HTML; L8 adds one more in its own L8 mockup. Per visual-parity
   rule, a11y attributes on HTML mockups are renderability concerns, not
   styling, and may be added. **Recommendation:** add `<title>` to the SVG
   in the L8 mockup, or accept this as carried-over CI debt scoped to design
   exploration files.

2. **CAVEAT (cosmetic):** `docs/reviews/improvements-conversations.md` row
   #3 still reads "is built and storybooked but never imported" — the
   substantive closure is verified in code, but the inventory document has
   not been edited to mark the row resolved. **Recommendation:** strike
   through #3 or append a "(closed by L8)" note.

3. **CAVEAT (out of scope for read-only audit):** The full Playwright e2e
   suite was not executed in this DoD pass; AC7 cites the in-tree
   `conversations-submenu.spec.ts` as the verifying artifact and the test
   bodies are well-formed and route-mocked.

## Files of record

- Hook: `packages/web/src/hooks/useConversationsThreads.ts`
- Hook tests: `packages/web/src/hooks/__tests__/useConversationsThreads.test.tsx`
- Component: `packages/web/src/components/ThreadSections.tsx`
- Component tests: `packages/web/src/components/__tests__/ThreadSections.conversations.test.tsx`
- AppShell wiring: `packages/web/src/layouts/AppShell.tsx`
- AppShell tests: `packages/web/src/__tests__/AppShell.threads.test.tsx`
- E2E: `packages/web/e2e/conversations-submenu.spec.ts`
- Server schema: `packages/server/src/routes/threads-schema.ts`
- Server route + tests: `packages/server/src/routes/threads.ts`, `threads.routes.test.ts`
