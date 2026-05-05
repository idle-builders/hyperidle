# L13 — Code Review (Phase 4)

Reviewer: same Reviewer that critiqued the design + architecture in Phase 2. Read against `plans/work-packages/TRACK-L.md` L13 (lines 446–475), `plans/L13/architecture.md`, `plans/L13/design/approved.md`, the six lenses (architecture / design / security / adversarial / simplification / slop), and AC completeness.

Verification performed:
- Diff read end-to-end (3,694 insertions, 527 deletions across 36 files).
- `bun run check` — green (0 type errors).
- `bun run lint` — green (0 errors; 171 warnings, all pre-existing).
- `bun run test` — green (3,365 passed, 3 skipped).
- `bun x playwright test e2e/L13-product-drilldown.spec.ts` — **7/7 passed**.
- `bun x playwright test e2e/L15-task-request.spec.ts` — **4/4 passed** (the BLOCKING fix verified end-to-end).
- `bun x playwright test e2e/work.spec.ts` — **5 FAILED, 2 passed** (Team Board describe block was not removed when the route was deleted).
- `bun x playwright test e2e/synthesis.spec.ts e2e/task-thread.spec.ts e2e/work-surface.spec.ts e2e/touch-targets.spec.ts` — **4 more FAILED**, 4 skipped, 15 passed.
- Visual verification: live SPA screenshots captured at `/work/portfolio`, `/work/product/p1` (populated), `/work/product/p-empty` (empty bets), `/work/product/missing` (404). All four states render correctly.

## AC table

Spec lines 452–460 enumerate the acceptance criteria. Each is verified against either a passing test, a verified API contract, or a captured screenshot.

| # | AC | Verification | Status |
|---|---|---|---|
| 1 | The 5-level hierarchy is captured in the concept docs: portfolio > product > bet > task > session. Product = Team (1:1). | `plans/L13/concept.md` §"What 1:1 actually means" + §"What the concept commits us to" #4 enumerate the 5 levels. | PASS |
| 2 | A Product page exists and is reachable by clicking a product card on Portfolio. The page shows what a team page should show — the team roster, active bets, team burn vs cap, and (after L12 lands) the team's artifact aggregation. | `pages/WorkProduct.tsx` renders R1 header + R4 burn + R2 active bets + R3 roster + artifact slot. Screenshot `02-product-populated.png` shows all five regions rendered. Playwright e2e step 1 + step 3 verify drill-down. | PASS |
| 3 | Navigation is a drill-DOWN from Portfolio. It is NOT a side navigation tree. | `WorkPortfolio.tsx` line 124 `navigate(/work/product/...)`. Submenu under Work reduced to a single `Portfolio` item (`AppShell.tsx:60`). Screenshot `01-portfolio.png` shows only "Portfolio" in the submenu. | PASS |
| 4 | The previous denormalized team route is removed; legacy links redirect to a sensible fallback. | `router.tsx:36–39` mounts `<Navigate to="/work/portfolio" replace />` at `/work/team`. Playwright e2e step 5 verifies the redirect. `WorkTeam.tsx`, `WorkTeam.stories.tsx`, `WorkTeam.test.tsx`, `WorkTeam.task-request.test.tsx` all deleted. | PASS (with caveat — see Adversarial F1) |
| 5 | The system serves real product, roster, and bets data; the matching inventory rows from L6 are closed. | `routes/products.ts` returns real DB-backed rows. `WorkPortfolio.tsx` consumes `useProducts()` for live data. `plans/reviews/hardcoded-data-inventory.md` line 31 marked **CLOSED L13**. | PASS |
| 6 | Vitest unit tests cover the dispatch. | `routes/__tests__/products.test.ts` — 7 dispatch tests covering empty list, populated list, 404, 500/team_missing, populated detail, all-shipped, null-cap. All passing. | PASS |
| 7 | Playwright e2e: from Portfolio, click a product card → the product page renders → roster and bets are visible. | `e2e/L13-product-drilldown.spec.ts` step 1 (drill-down) + step 3 (roster + bets visible) — both passing. | PASS |
| 8 | `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green. | First three: GREEN. **Full e2e suite: NOT GREEN — 9 tests fail across 5 spec files because the Team Board describe-blocks were not migrated.** | **FAIL** |
| Validation 1 | Given a user clicks a product card on Portfolio, the URL becomes that product's page and that team's roster, active bets, and burn show. | Playwright e2e step 1, screenshot `02-product-populated.png`. | PASS |
| Validation 2 | Given a product has no active bets, the page shows a clear empty state, not a fallback fake bet. | Playwright e2e step 2, screenshot `03-product-empty-bets.png` shows "No active bets / This product team has no bets in flight." (corrected copy). | PASS |

**AC pass count: 9 of 10.** AC #8 (full e2e suite stays green) fails — see Adversarial F1.

---

## Findings by lens

### Architecture (positive)

The composite `GET /api/products/:id` endpoint matches the `ProductDetail` shape defined in `packages/shared/src/product.ts`. Layer integrity holds: `WorkProduct.tsx` (Human Interface) → `useProduct.ts` (hook) → `/api/products/:id` (Meta Layer) → Drizzle queries against `products` / `teams` / `agents` / `bets` / `tasks` (DB). No agent-runtime touches. The Phase 2 BLOCKING fix is real: `WorkBet.tsx` lines 199, 422–446, 469–477 wire TaskSheet into the bet's task table with `data-testid="bet-task-row"`, click + keyboard handlers, and the same `resolveOrCreateTaskThread` / `postRequestMessage` flow the deleted WorkTeam used. The L15 e2e was re-routed and passes 4/4 against the live SPA — verified independently.

Application-layer 1:1 enforcement (`loadProductTeam` in `services/product-team.ts`) throws `ApiError(500, 'team_missing')` when the team is missing and `ApiError(500, 'invariant_broken')` when there are 2+. The dispatch test 4 exercises the `team_missing` path and asserts `code: "team_missing"`. The `UNIQUE(teams.product_id)` follow-up is now registered in `plans/work-packages/follow-ups.md` lines 70–95 — Phase 2 required item #2 closed.

Concerns:
- **A1 (LOW).** The product list endpoint at `routes/products.ts:65–141` does N+1 queries: for each product, two count queries plus an inner loop fetching tasks per active bet. The risk register flagged this and proposed "single SELECT with subquery counters" — builder shipped the simple per-row loop. Fine for the demo seed. Should be flagged as a follow-up (it isn't, today).
- **A2 (LOW).** The bets sort in `routes/products.ts:206–211` does a linear `find` per pair-comparison (O(n²)). Trivial at small N, but the simpler shape would be to sort `activeBetRows` by `createdAt desc` before the `.map(...)` and let the `BetCardSummary[]` carry the order naturally.

### Design (positive)

V1 stacked layout matches the design exactly: breadcrumb chip ("← Portfolio") above the H1, product name + status chip on a single row, phase + lead inline below, then Burn vs Cap section with KeyValue rows + `<progress>`, then Active Bets, then Roster, then artifact slot. Verified against `02-product-populated.png` — every region present, correct order, correct token usage (`var(--density-gap)`, `var(--density-card-pad)`, `var(--r0)`, `var(--r1)`, `var(--surface-2)`, `var(--surface-3)`).

Empty-states present and correctly rendered. The Phase 2 design-critique nit on the empty-bets copy ("Shape a pitch on the team's Canvas") was fixed: copy now reads "This product team has no bets in flight." Screenshot `03-product-empty-bets.png` confirms.

Component budget respected: zero new design-system components. Every primitive used is from the existing 19-component catalog.

Concerns:
- **D1 (MEDIUM, dishonest naming / design contract drift).** `WorkProduct.tsx:282` maps bet status to StatusChip status: `bet.status === "committed" ? "behind" : "healthy"`. A "committed" bet is not "behind" — it is the normal state of an active bet. This is a category error that visibly mis-renders the active bet in the populated screenshot (Auth migration shows BEHIND instead of HEALTHY/COMMITTED). Either the StatusChip needs a "committed" / "in_progress" status added to its closed enum, or the BetCard primitive (which renders `bet.status` natively) should be used instead of inventing a row component. Builder's `BetRow` is a single-call-site re-implementation of BetCard's compact row — see Simplification S1.
- **D2 (LOW).** `WorkProduct.tsx:154` `Lead: {product.leadAgentId}` renders the agent ID (`agent-lead`) verbatim — the design says "lead avatar". The roster region knows the agent's display name; the header should show that, not the ID. Visible in `02-product-populated.png` ("Lead: agent-lead"). Fix: resolve `leadAgentId` → roster member name on the server (or pass the lead's name on `ProductSummary`).
- **D3 (LOW).** The artifact slot leaks an L12-shaped dev string: `<p>Artifacts aggregation lands in L12</p>` (line 262). Phase 2 architecture-critique optional improvement #2 flagged this. Workpackage IDs should not appear in rendered UI. Builder did not address it. Suggested fix: render an empty `<section>` with the testid only.
- **D4 (LOW).** `WorkPortfolio.tsx:125` uses `bg-base-200 rounded-lg` (DaisyUI) instead of the closed-radius scale (`var(--r1)` etc.). Pre-existing, but L13 modified the surrounding code; while there, this would have been the moment to align with the radius system. Not a regression — flag only.

### Security

- Auth: `routes/products.ts` is mounted under `/api` after `auth-required` middleware (verified by `routes/__tests__/products.test.ts` setting `X-API-Key`). All four resource endpoints (list, detail, 404, 500) require the API key. Concur with the architecture (no auth changes needed — same demo founder context).
- Input validation: `productId` is a path parameter; the only use is in a Drizzle `eq(products.id, productId)` clause — parameterized, no SQL injection surface. The `:productId` is also URL-encoded in the client (`encodeURIComponent` on line 211 of `WorkProduct.tsx` and line 124 of `WorkPortfolio.tsx`).
- Information disclosure: the 500 error envelope includes `code: 'team_missing'` and the message `Product ${productId} has no team`. The product id is the same as the URL path, so this is not a new disclosure. The team id is NOT echoed (the architecture committed to keeping it internal — verified).
- Rate limiting: GET endpoints, no new POST/PATCH. No rate-limit gap introduced.
- Path traversal / SSRF: none of the new endpoints take path or URL inputs.

No security findings. Concur with the architecture's "no identity/auth changes" commitment.

### Adversarial (negative)

- **F1 (HIGH — REGRESSION).** **9 Playwright e2e tests fail because the deleted WorkTeam route is still referenced across 5 untouched spec files.**
  - `e2e/work.spec.ts:25–60` — entire `Work Team Board` describe block (5 tests) tries `page.goto('/work/team')` then `waitForSelector('[data-testid=\'work-team-page\']')`. After redirect, the selector never appears.
  - `e2e/synthesis.spec.ts:126` — flow 8 (PitchSelector detail) navigates `/work/team`.
  - `e2e/task-thread.spec.ts:108` — L18 task-sheet thread surface test starts at `/work/team`.
  - `e2e/work-surface.spec.ts:43` — J5 Work Surface "Team Board → Select Pitches" test.
  - `e2e/touch-targets.spec.ts:31` — K8 audit visits `/work/team` and waits for `work-team-page`.

  The L13 spec says "the full e2e suite stays green" (AC #8). It does not. The builder updated `accessibility.spec.ts` and `accessibility-K8.spec.ts` (commit 2709ffe) but missed the other five. CI flakiness is being tracked separately — but this is not flake. These tests fail deterministically against the new routing. **AC #8 fails until these are migrated or marked obsolete.**

  Fix shape (per spec): each test must either (a) migrate to a corresponding L13/Bet-detail flow, or (b) be removed if its surface is genuinely gone (e.g., the "Work Team Board" tests are testing the deleted Kanban — they should be deleted, not migrated, with a `[skip ci]` doc note tracking why). The L18 task-thread spec at `e2e/task-thread.spec.ts:108` likely needs the same re-route the builder applied to `e2e/L15-task-request.spec.ts`.

- **F2 (LOW — Saboteur lens).** `routes/products.ts:56` reads:
  ```
  const overBudget = team.costCap !== null && team.costCap !== null && costActual >= team.costCap;
  ```
  The `team.costCap !== null` check is duplicated. The second clause is dead. Almost certainly a paste artifact — but the kind of paste artifact a saboteur would slip in to mask an intent ("did you mean `costCap > 0`?"). Functionally harmless today but it tells the next reader the author was distracted in this spot. Fix: collapse to a single `team.costCap !== null && costActual >= team.costCap`.

- **F3 (LOW — race condition).** `useProduct.ts` and `useProducts.ts` use the same `cancelled` flag pattern as `useBet`. Verified safe — the `cancelled = true` runs in the cleanup function. No new race surface.

- **F4 (LOW — Auditor lens).** The PR claim "verify is green" is technically true (the verify gate runs `check + lint + test`, not Playwright), but the AC says "the full e2e suite stays green." The PR description must reconcile this — see F1.

### Simplification (negative)

- **S1 (MEDIUM — single-use re-implementation).** `WorkProduct.tsx:269–288` defines a `BetRow` component that re-implements what `BetCard` (existing primitive) already does — pitch title + status + appetite + progress in a single row. The design doc explicitly said "Each row reuses the existing `BetCard`". Builder ships a fresh button + flex-row instead. The cost: D1 (the made-up "committed → behind" status mapping), missing tabular numerals on the progress text, no shared design tokens for status color, two truths about how a bet row should render (BetCard vs BetRow). Suggested fix: import `BetCard` from `@hyperidle/design-system` and pass it the `BetCardSummary` shape; the design and architecture both committed to this.

- **S2 (LOW — unnecessary three-way override prop).** `WorkProductProps` defines `overrideData?: ProductDetail | null`, `overrideLoading?: boolean`, `overrideError?: Error | null`. The mirror in `WorkBet.tsx` is `overrideBet?: BetDetail` — one prop, not three. The three-prop variant is wider than needed; tests inject `overrideData` only. The 4-line `if (overrideLoading === true || …)` cluster on lines 62–74 of `WorkProduct.tsx` is the visible cost. Suggested fix: collapse to `overrideData?: ProductDetail | null` (with `null` meaning "rendered 404"), and let stories drive the loading/error states by mocking `useProduct` instead of by props.

- **S3 (LOW — fallback to MOCK_PRODUCTS at runtime).** `WorkPortfolio.tsx:45–60` falls back to `MOCK_PRODUCTS` when the API hasn't returned. The architecture said the Portfolio "switches to `useProducts()`" and the fixture "moves to test/story-only via comment update". The runtime fallback is a real new path: if the `/api/products` call fails or is slow, the user sees a fixed fixture, not the loading state. The page-level `loading` prop is now driven only by an explicit caller, not by `useProducts().loading` (the @lore comment on lines 65–67 acknowledges this). The decision is defensible (keeps existing tests passing) but it's a hidden lie in the production render path. Suggested fix: in production, surface the loading skeleton when `useProducts().loading` is true; in tests, mock `useProducts` to skip the loading step. The current path is a different shape from what the architecture committed.

### Slop (negative)

- **L1 (LOW — comment lies).** `WorkProduct.tsx:1` reads `/* L13 — Work/Product page: unified product team view. (CI trigger fix: 2026-05-05) */`. The "CI trigger fix" suffix is a commit-message artifact that escaped into the file header. Source code does not need to remember why a CI re-run was kicked off. Fix: drop the suffix.
- **L2 (LOW — duplicated null check).** `routes/products.ts:56` — see F2 above.
- **L3 (LOW — todo dust).** None visible. The L13 changes do not introduce "TODO" or "FIXME" markers.
- **L4 (LOW — comment density vs payload).** `WorkProduct.tsx` has multiple `{/* R1 — Product header */}`, `{/* R4 — Team burn vs cap */}` etc. comments. These mirror the design doc and are useful, but combined with `aria-label` and `data-testid` the same information is repeated three times. Acceptable — the comments help the next reader cross-reference the design.
- **L5 (LOW — defensive over-engineering).** `routes/products.ts:218` `costActual: teamRow.costActual ?? 0` and similar fallbacks across the file. The `costActual` column has `default(0)` in the schema, so the value cannot be null at read time unless the column is genuinely null on a row that bypassed the default. The `?? 0` is defensive coding that papers over what should be the schema default. Not a bug. Flag only.
- **L6 (LOW — orphaned `WorkTeam` references in comments).** `TaskSheet.tsx:19,197` and `WorkBet.tsx:181,241` still reference the deleted `WorkTeam.tsx` in `@lore` comments. The references are factual ("the same pattern WorkTeam used"), but `WorkTeam` no longer exists in the tree, so a future reader running `grep WorkTeam` will find only comments pointing at nothing. Suggested fix: rephrase as "(formerly in the deleted WorkTeam.tsx, now in WorkBet.tsx)" or replace with the live counterpart.

---

## Required before advancing

1. **F1 (HIGH).** Migrate or delete the 9 failing Playwright e2e tests across `e2e/work.spec.ts`, `e2e/synthesis.spec.ts`, `e2e/task-thread.spec.ts`, `e2e/work-surface.spec.ts`, `e2e/touch-targets.spec.ts`. The `Work Team Board` describe block in `work.spec.ts` tests a deleted surface — it should be removed. The L18 `task-thread.spec.ts` test at line 108 likely needs the same Bet-detail re-route the builder applied to `L15-task-request.spec.ts`. Without this, AC #8 is unmet.

2. **D1 (MEDIUM).** Fix the BetRow status mapping. `bet.status === "committed" ? "behind" : "healthy"` mis-renders an active bet as BEHIND. Either (a) replace `BetRow` with a `BetCard` mount per the design's stated intent, or (b) extend StatusChip's closed enum to accept `"committed"` / `"in_progress"` and pass them through unmapped.

3. **D2 (LOW, visible).** Replace `Lead: {product.leadAgentId}` with the lead agent's display name. The roster knows it; either lift the lookup into the server response (`leadAgentName` on `ProductSummary`) or do the join client-side from the loaded `roster`.

4. **F2 / L2 (LOW).** Collapse the duplicated `team.costCap !== null && team.costCap !== null` to a single check on `routes/products.ts:56`.

## Optional improvements

1. **S1.** Replace the bespoke `BetRow` with the existing `BetCard` primitive. (Tied to D1; if D1 is fixed by extending StatusChip, S1 may stay as-is — but the design doc was explicit about reuse.)
2. **S2.** Collapse `WorkProduct`'s three override props to one (`overrideData`).
3. **S3.** Drive the Portfolio loading skeleton from `useProducts().loading` in production; mock the hook in tests.
4. **D3.** Remove "Artifacts aggregation lands in L12" leakage; render the empty section with the testid only.
5. **L1.** Drop the "(CI trigger fix: 2026-05-05)" suffix from `WorkProduct.tsx:1`.
6. **L6.** Replace orphaned `WorkTeam` references in `@lore` comments with their live counterparts.
7. **A1.** Log the products-list N+1 query loop as a performance follow-up.

---

## Verdict

**NOT DONE.**

The L13 work is overwhelmingly correct. The Phase 2 BLOCKING fix (TaskSheet on WorkBet) is real and verified end-to-end via the live SPA. The composite endpoint matches the contract. The design's V1 stacked layout matches the screenshots. The empty-state copy was corrected. The 1:1 invariant follow-up was registered. 9 of 10 ACs pass.

But AC #8 ("the full e2e suite stays green") is unmet: 9 Playwright tests across 5 spec files fail because the deleted Team Board surface is still referenced. This is a deterministic regression, not flake. Builder must migrate or delete those tests before merge.

Two visible visual bugs (D1 active-bet "BEHIND" mis-render, D2 lead-id leak) and one slop bug (F2 duplicated null check) round out the required fixes.

**Most important fix:** **F1** — repair the 9 broken e2e tests. AC #8 is a hard gate; the spec is explicit. Once F1 + D1 + D2 + F2 land, the work is done.

Visual proof: `/tmp/L13-shots/01-portfolio.png`, `02-product-populated.png`, `03-product-empty-bets.png`, `04-product-404.png` captured during this review (not committed; ephemeral evidence).
