# L13 — Architecture

## Goal

Mount a Product page at `/work/product/:productId` that renders the unified product team (product facet + team facet + active bets + artifact slot for L12). Wire the Portfolio page's product cards to drill into it. Remove the legacy `/work/team` route and redirect to `/work/portfolio`. Replace the runtime hardcoded product list, the active-bets-on-team mock, and the team-burn mock with real fetches from the existing schema. Close the L6 inventory rows that L13 owns: `WorkPortfolio.tsx:131-138 MOCK_CYCLE` (cycle stripe stays portfolio-level — out of scope), `WorkPortfolio.tsx fixtures/portfolio-data.ts:23-64 MOCK_PRODUCTS`, the active-bets fragment that the Product page surfaces.

## Non-goals

- No new primitive, no schema migration, no new column. (Concept §1.)
- No `/api/teams` resource. The team facet is reached *through* the product, never as a standalone collection.
- No artifact aggregation widget on the Product page (L12 fills the placeholder slot).
- No PitchSelector, no Canvas, no Kanban on the Product page. Tasks remain accessible only via Bet detail (v3 humans-act-at-bet-level).
- No Bet detail or Task detail change. The Bet route at `/work/bet/:betId` is unchanged.
- No identity/auth changes. The page assumes the same demo founder context the rest of the app uses.
- No cycle stripe move. The cycle stripe stays on the Portfolio page; the Product page does not duplicate it.
- No "form team" / "dissolve team" / "rename team" verbs. Team lifecycle remains tied to product lifecycle (concept §1).

## Source-driven notes

- Hono routes are confirmed in repo. The bets resource lives at `packages/server/src/routes/bets.ts`; it already exposes `GET /api/bets/:id` (line 106) and `GET /api/bets/canvas` (line 86). The bets list endpoint at `GET /api/bets` (line 67) supports pagination but does NOT today filter by `productId` — L13 extends it OR adds a per-product detail endpoint (see §API). The agents resource at `packages/server/src/routes/agents.ts` exposes `GET /api/agents` (line 43) with a list shape. **No `products` route file exists** (`grep` confirms zero hits in `packages/server/src/routes`). **No `teams` route file exists.** L13 adds either `routes/products.ts` or extends an aggregate endpoint.
- Schema confirmed: `products` (no `team_id` column on it; the relationship lives on the team side via `teams.product_id`), `teams.product_id NOT NULL`, `agents.team_id` nullable, `bets.product_id NOT NULL` + `bets.team_id NOT NULL`. Both `bets.product_id` and `bets.team_id` are `ON DELETE RESTRICT`. The 1:1 invariant is enforceable at the application layer; L13 does NOT add a `UNIQUE` index on `teams.product_id` (flagged as a follow-up — see §"Future-work").
- Data-fetching pattern is `useFetch`-based (no React Query — verified in `packages/web/package.json` and grep on `packages/web/src`). Existing one-shot hooks (`useBet`, `useArtifact`, `useArtifacts`) all wrap `useFetch` or follow its pattern. L13 follows the same pattern with a `useProduct(productId)` hook.
- Routing is `react-router-dom` v7 with `createBrowserRouter`. The route table lives in `packages/web/src/router.tsx`. Adding a new route + a redirect is a 3-line change. (Verified at `router.tsx:23-72`.) The IA spec (`docs/information-architecture/cross-view-navigation-map.md` row "Portfolio Overview → Team View / Click product status card / Within Work (Level 1 → 2)") already commits this drill-down — L13 is the implementation pass.
- Submenu config is at `AppShell.tsx:58-62` (`SUBMENU_CONFIG.work`). Removing the `Team Board` entry is a one-item delete.
- The legacy `WorkTeam.tsx` page (`packages/web/src/pages/WorkTeam.tsx`) is a singleton: it does not take a productId, mounts a hardcoded `CANVAS_BETS` and `INITIAL_TASKS`, and contains the L15 task-request affordances. Removing the route AND the page file would orphan the L15 task-request flow and the tests (`WorkTeam.test.tsx`, `WorkTeam.task-request.test.tsx`). **Decision:** delete the page file AND its tests; the L15 surface lives on Bet detail (Tasks under a bet open via TaskSheet from there). The L15 founder direction "drag/drop on tasks REMOVED" + "task-request affordance" was implemented for the WorkTeam Kanban surface — but that surface itself was already obsolete on the v3 model. The Kanban view of tasks-across-bets is gone in L13; tasks are reached via Bet detail. (See §"Out-of-scope risk: L15 task-request surface".)
- Lore reference: `MOCK_PRODUCTS` lives in `packages/web/src/fixtures/portfolio-data.ts:23-64`. Removing it from the runtime path means `WorkPortfolio.tsx` switches to `useProducts()` (a new hook) and the fixture becomes story/test-only. The L6 inventory row at `plans/reviews/hardcoded-data-inventory.md:31` flags this row as L12-owned — but the L13 spec line "the system serves real product, roster, and bets data; the matching inventory rows from L6 are closed" pulls the closure forward into L13 for the rows the Product page actually consumes. Inventory ownership notes will be updated.

## Type / schema changes

### Database

**None.** All four facets read from existing tables: `products`, `teams`, `agents`, `bets`. No migration.

### `packages/shared`

Add three read-side types for the Product page composite endpoint:

```ts
// packages/shared/src/product.ts (new file)
export interface ProductSummary {
  id: string;
  name: string;
  phase: string;                       // "shape" | "build" | "cool-down" | …
  status: Status;                      // "healthy" | "behind" | "blocked" — derived server-side
  leadAgentId: string | null;          // teams.lead_agent_id; null on a freshly-created team
}

export interface RosterMember {
  agentId: string;
  name: string;
  role: string;                        // agents.role
  isLead: boolean;                     // matches leadAgentId on the team
}

export interface ProductBurn {
  costActual: number;                  // teams.cost_actual; cents (matches existing convention)
  costCap: number | null;              // teams.cost_cap; null when not configured
  capacity: number;                    // teams.capacity (max parallel bets)
  activeBets: number;                  // teams.active_bets cached counter
}

export interface ProductDetail {
  product: ProductSummary;
  team: { id: string; formedAt: string; dissolvedAt: string | null };
  roster: RosterMember[];              // sorted: lead first, then by name asc
  burn: ProductBurn;
  activeBets: BetCardSummary[];        // bets WHERE product_id = :id AND status IN ('committed','in_progress')
}

export interface BetCardSummary {
  id: string;
  pitchTitle: string;                  // derived first-line of bets.pitch (existing pattern)
  appetite: string;                    // "1 week" | "2 weeks" | "6 weeks"
  status: BetStatus;                   // "committed" | "in_progress"
  progressDone: number;                // count(tasks where state='done')
  progressTotal: number;               // count(tasks)
}
```

(`Status` and `BetStatus` already exist in `@hyperidle/design-system` and `@hyperidle/shared` respectively; the file just imports them.)

### `packages/web/src/types`

A small `ProductDetail`-shaped client type alias re-exporting the shared types. No widening. The `ProductsList` shape returned by `GET /api/products` is `ProductSummary[]` plus the lightweight portfolio counters (`activeBets`, `shipped`, `shipRate`) — added at the server only when those values are cheaply derivable from existing data; the Portfolio page will gracefully degrade where they aren't.

## API endpoints

Two new endpoints. One extension. One client navigation route.

### `GET /api/products` (new)

Returns the list of products with the columns the Portfolio page consumes today (replaces `MOCK_PRODUCTS`). Server response shape:

```ts
{
  products: Array<ProductSummary & { activeBets: number; shipped: number; shipRate: string; progress: { done: number; total: number } }>
}
```

Implementation: select all rows from `products`. For each, count `bets WHERE product_id = ? AND status IN ('committed','in_progress')` (active), `bets WHERE product_id = ? AND status = 'shipped'` (shipped), and compute ship rate from those two over the historical window the Portfolio page already shows (existing fixture treats it as cumulative — server mirrors that). Progress is a sum across active bets' `(tasks done / tasks total)`. Errors propagate; standard `ApiErrorResponse` envelope. No auth changes.

### `GET /api/products/:productId` (new)

Returns the `ProductDetail` shape. Implementation:

1. `db.select().from(products).where(eq(products.id, productId)).get()` — 404 if absent.
2. `db.select().from(teams).where(eq(teams.productId, productId)).get()` — 500 if absent (the 1:1 invariant is broken; this is a server error, not user-visible 404).
3. `db.select().from(agents).where(eq(agents.teamId, team.id)).all()` for the roster.
4. `db.select().from(bets).where(and(eq(bets.productId, productId), inArray(bets.status, ['committed','in_progress']))).all()` for active bets.
5. Per active bet, count tasks done/total via `db.select({…}).from(tasks).where(eq(tasks.betId, bet.id)).all()`.
6. Construct the response with the lead-first roster sort and the bets ordered by `createdAt desc`.

⚠️ UNVERIFIED — pattern of inline aggregate counters in a single GET vs a per-aggregate endpoint. The repo has both: `GET /api/bets/canvas` aggregates; `GET /api/bets/:id/artifact-thread-summary` is a per-aggregate endpoint. The composite call mirrors `/api/bets/canvas` (one round-trip serves the whole page) and is the simpler choice for L13. If a future story splits the Product page into independent surfaces, the endpoint can be re-shaped without breaking the URL.

### Extension to `GET /api/bets`

Add an optional `productId` query parameter. When present, filters `bets.product_id = ?`. When absent, behaviour is unchanged. (This is for completeness; the Product page itself uses `GET /api/products/:id` which embeds the bets, so the extension is not on the L13 critical path. **Decision:** ship the extension only if it is one extra line in `bets.ts:67-83`; otherwise defer to L12.)

### Client route

```ts
// packages/web/src/router.tsx (additions)
{ path: "work/product/:productId", element: <WorkProduct /> },
{ path: "work/team", element: <Navigate to="/work/portfolio" replace /> },
```

The `work/team` line replaces the existing `{ path: "work/team", element: <WorkTeam /> }`. The `WorkTeam` import + the file disappear.

## File paths

### New

- `packages/shared/src/product.ts` — read-side `ProductDetail` + helper types. Re-exported through `packages/shared/src/index.ts`.
- `packages/server/src/routes/products.ts` — Hono router exporting `createProductRoutes(db, eventBus)`. Mounted in `packages/server/src/app.ts` next to `createBetRoutes`.
- `packages/server/src/routes/__tests__/products.test.ts` — Vitest dispatch tests. Cover: list with zero/one/many products; detail happy-path; detail 404 for unknown product; detail with zero active bets; detail with zero roster members; detail when `teams.cost_cap` is null.
- `packages/web/src/pages/WorkProduct.tsx` — page component composing the four regions (R1-R4 + artifact slot) + the breadcrumb chip + the empty/loading/error states.
- `packages/web/src/pages/WorkProduct.stories.tsx` — Storybook entries: populated, empty bets, empty roster, no cap, loading, error, 404.
- `packages/web/src/pages/__tests__/WorkProduct.test.tsx` — Vitest tests: renders header, renders bets when populated, renders empty state when zero bets, renders roster, renders burn-vs-cap, breadcrumb navigates to Portfolio, click on bet row navigates to `/work/bet/:id`.
- `packages/web/src/hooks/useProduct.ts` — one-shot fetch hook for `/api/products/:id`. Mirrors `useBet` line-for-line.
- `packages/web/src/hooks/useProducts.ts` — one-shot fetch hook for `/api/products` (replaces the runtime `MOCK_PRODUCTS` import in `WorkPortfolio.tsx`).
- `packages/web/src/hooks/__tests__/useProduct.test.ts` and `useProducts.test.ts` — Vitest tests covering fetch / 404 / abort / success paths.
- `packages/web/e2e/L13-product-drilldown.spec.ts` — Playwright e2e: Portfolio renders → click product card → URL is `/work/product/:id` → product page renders header, roster, active bets, burn-vs-cap. Plus: empty-state path with a product that has zero active bets. Plus: legacy `/work/team` redirects to `/work/portfolio`. Plus: direct URL to `/work/product/<unknown>` shows the 404 empty state.

### Modified

- `packages/server/src/app.ts` — register the new route: `api.route("/products", createProductRoutes(options.db, eventBus));` next to bets.
- `packages/web/src/router.tsx` — add the `/work/product/:productId` route and the `/work/team → /work/portfolio` redirect; remove the `/work/team → <WorkTeam />` entry; drop the `WorkTeam` import.
- `packages/web/src/layouts/AppShell.tsx` — `SUBMENU_CONFIG.work.items` becomes `[{ label: "Portfolio", path: "/work/portfolio" }]`. The `Team Board` row is deleted.
- `packages/web/src/pages/WorkPortfolio.tsx` — switch from `MOCK_PRODUCTS` import to `useProducts()`; product cards become `<Link to={"/work/product/" + product.id}>` (or wired with `useNavigate` to match the existing onClick conventions). The `MOCK_PRODUCTS` constant in `fixtures/portfolio-data.ts` survives — moves to test/story-only via comment update; runtime importers gone.
- `packages/web/src/__tests__/WorkPortfolio.test.tsx` (and J8 / cycle / BetCard.portfolio tests) — switch to `useProducts()` mocking. Same rendered output, same data; the seam moves from a static import to a hook return.
- `packages/web/src/__tests__/router.test.tsx` — add: legacy `/work/team` URL renders the Portfolio page (asserts the redirect by checking `data-testid="work-portfolio-page"`).

### Deleted

- `packages/web/src/pages/WorkTeam.tsx`
- `packages/web/src/pages/WorkTeam.stories.tsx`
- `packages/web/src/__tests__/WorkTeam.test.tsx`
- `packages/web/src/__tests__/WorkTeam.task-request.test.tsx`

⚠️ The L15 task-request affordance was wired through the Kanban on `WorkTeam.tsx`. The same affordance ships unchanged on `TaskSheet.tsx` (which is invoked from the Bet detail's task list and from any other Kanban surface that mounts it). Removing `WorkTeam.tsx` removes the *Kanban* surface but does NOT remove the *TaskSheet* surface. The L15 e2e (`L15-task-request.spec.ts`) currently navigates via the Team Board; it must be updated to navigate via Bet detail instead. **This is in-scope for L13** — see Task 7 in §Ordered tasks.

## Server logic notes

### 1:1 invariant enforcement

The server-side `assertOneTeamPerProduct(productId)` helper is added to `packages/server/src/services/product-team.ts`. Called by the detail handler:

```ts
function loadProductTeam(db: HyperIdleDb, productId: string): Team {
  const rows = db.select().from(teams).where(eq(teams.productId, productId)).all();
  if (rows.length === 0) throw new ApiError(500, 'team_missing', `Product ${productId} has no team`);
  if (rows.length > 1) throw new ApiError(500, 'invariant_broken', `Product ${productId} has ${rows.length} teams`);
  return rows[0];
}
```

The 500 is intentional: if the application created a product without a team, that's a programming bug, not a user error. It surfaces loudly via the standard `ApiErrorResponse` envelope. The Product page renders an `ErrorState` for it. (A follow-up that adds `UNIQUE` on `teams.product_id` makes the second branch unreachable.)

### Lead-first roster sort

```ts
roster.sort((a, b) => {
  if (a.isLead && !b.isLead) return -1;
  if (b.isLead && !a.isLead) return 1;
  return a.name.localeCompare(b.name);
});
```

Stable tiebreaker on name asc.

### Active-bets `progress` math

For each active bet, count tasks: `total = COUNT(*) FROM tasks WHERE bet_id = ?` and `done = COUNT(*) FROM tasks WHERE bet_id = ? AND state = 'done'`. Express the result as `{ done, total }`. Zero-task bets render `{ done: 0, total: 0 }` and the BetCard renders that as "—" per its existing fallback.

### Status derivation for the product header

`product.status` (in `ProductSummary`) is derived as:
- `"blocked"` if any active bet has any task in `state = 'blocked'`.
- `"behind"` if `teams.active_bets > teams.capacity` OR `teams.cost_actual >= teams.cost_cap` (when cap is set).
- `"healthy"` otherwise.

This is the same shape the Portfolio cards already render. The existing `MOCK_PRODUCTS` rows hardcoded these as strings; the server now derives them.

## URL grammar (final)

| URL | Renders | Notes |
|---|---|---|
| `/work/portfolio` | Portfolio page | Unchanged. |
| `/work/product/:productId` | Product page (new) | productId is the public identifier. |
| `/work/bet/:betId` | Bet detail | Unchanged. |
| `/work/team` | Redirect → `/work/portfolio` | Replaces the legacy WorkTeam page. |

## Empty-state design (zero active bets)

When `GET /api/products/:id` returns `activeBets: []`, the Product page renders, in the R2 region:

```tsx
<EmptyState
  title="No active bets"
  description="This product team has no bets in flight. Shape a pitch on the team's Canvas to commit one."
  dataTestId="product-active-bets-empty"
/>
```

The roster region remains populated (it is not bet-derived). The burn region remains populated (cap-derived). The artifact slot remains a placeholder. No fallback BetCard, no fake row.

## Test plan

### Vitest dispatch (server)

`packages/server/src/routes/__tests__/products.test.ts` — all use `createTestDb()` and `createTestApp()`:

1. `GET /api/products` returns `{ products: [] }` when the table is empty.
2. `GET /api/products` returns one row with derived `activeBets`, `shipped`, `shipRate` for a seeded product+team+bet+task fixture.
3. `GET /api/products/:id` returns `404` for an unknown id.
4. `GET /api/products/:id` returns `500` with `code: 'team_missing'` when the team for a product is absent (regression test for the 1:1 invariant).
5. `GET /api/products/:id` returns the populated `ProductDetail` for a seeded product+team+roster (lead+two members)+two active bets+one shipped bet — verifies the bets filter excludes shipped, the roster sort puts the lead first, and the bets carry `progressDone`/`progressTotal`.
6. `GET /api/products/:id` returns the populated shape with `activeBets: []` for a product whose bets are all shipped — verifies the empty case.
7. `GET /api/products/:id` with `teams.cost_cap = null` returns `burn.costCap: null` — verifies null preservation through the Drizzle layer.

### Vitest dispatch (client unit)

`packages/web/src/pages/__tests__/WorkProduct.test.tsx`:

1. Renders the page H1 with the product name when the fetch resolves.
2. Renders one BetCard row per active bet.
3. Renders the empty-state when active bets list is empty.
4. Renders one roster row per agent; lead row has `data-is-lead="true"` (or equivalent ARIA).
5. Renders the burn-vs-cap with formatted currency and a `<progress>` element.
6. Click on the breadcrumb chip navigates to `/work/portfolio` (asserted via test router).
7. Click on a bet row navigates to `/work/bet/:id`.
8. Renders the 404 empty state when the fetch returns `404`.
9. Renders an `ErrorState` when the fetch returns 500.

`packages/web/src/hooks/__tests__/useProduct.test.ts` and `useProducts.test.ts`:

10. Successful fetch sets `data` and clears `loading`.
11. Failed fetch sets `error` and clears `loading`.
12. Unmount during in-flight cancels the update (state never sets after unmount).

`packages/web/src/__tests__/router.test.tsx` (extended):

13. URL `/work/team` renders the Portfolio page (the redirect target's `data-testid`).

`packages/web/src/__tests__/WorkPortfolio.test.tsx` (extended):

14. Click on a product card navigates to `/work/product/:id` (the productId from the seeded fixture).

### Playwright e2e

`packages/web/e2e/L13-product-drilldown.spec.ts`:

1. **Drill-down.** Navigate to `/work/portfolio`, click the first product card, assert URL becomes `/work/product/<id>`, assert product header / roster region / active-bets region / burn-vs-cap region all visible.
2. **Empty state.** Seed (via `/api/test-routes` helper) a product with zero active bets, navigate to its Product page, assert the empty-state for active bets is visible (`data-testid="product-active-bets-empty"`).
3. **Roster + bets visible.** With a seeded product that has roster + active bets, assert at least one `data-testid="product-roster-row"` and one BetCard.
4. **Breadcrumb.** Click the breadcrumb chip on the Product page, assert URL returns to `/work/portfolio`, assert Portfolio page is visible.
5. **Legacy redirect.** Navigate to `/work/team` directly, assert URL becomes `/work/portfolio`.
6. **Unknown product.** Navigate to `/work/product/does-not-exist`, assert the 404 empty-state (`data-testid="product-not-found"`).
7. **No-Kanban / no-Tasks.** Assert there is no Kanban region on the Product page (negative — the v3 ownership rule is visible in the absence of the surface).

The `verify` gate after the build phase: `bun run check` + `bun run lint` + `bun run test` + Playwright suite stays green.

## Ordered tasks

1. **Write tests first (TDD red).** Author the Vitest dispatch tests (`products.test.ts`), the client unit tests (`WorkProduct.test.tsx`, `useProduct.test.ts`, `useProducts.test.ts`, `router.test.tsx` extension, `WorkPortfolio.test.tsx` extension), and the Playwright e2e (`L13-product-drilldown.spec.ts`). Run the suite — they all fail (red).

2. **Shared types.** Add `packages/shared/src/product.ts` with `ProductSummary`, `RosterMember`, `ProductBurn`, `BetCardSummary`, `ProductDetail`. Re-export through `packages/shared/src/index.ts`. `bun run check` passes.

3. **Server route.** Create `packages/server/src/routes/products.ts` with `createProductRoutes(db, eventBus)`. Implement `GET /api/products` and `GET /api/products/:id`. Add the `assertOneTeamPerProduct` helper in `packages/server/src/services/product-team.ts`. Wire into `packages/server/src/app.ts`. Run server tests — they go green.

4. **Client hooks.** Create `useProduct.ts` (mirrors `useBet`) and `useProducts.ts`. Add their tests. Hook unit tests go green.

5. **Product page component.** Create `pages/WorkProduct.tsx` with the V1 stacked layout, the four regions, the breadcrumb chip, the empty/loading/error states. Compose from `BetCard`, `KeyValue`, `StatusChip`, `EmptyState`, `SkeletonCard`, `ErrorState`. Add the testids (`work-product-page`, `product-breadcrumb-back`, `product-active-bets`, `product-active-bets-empty`, `product-roster`, `product-roster-row`, `product-burn-vs-cap`, `product-artifact-slot`, `product-not-found`). Add the `WorkProduct.stories.tsx`.

6. **Routing changes.** In `router.tsx`: import `WorkProduct`; add the `/work/product/:productId` route; replace the `/work/team` route's element with `<Navigate to="/work/portfolio" replace />`; drop the `WorkTeam` import. In `AppShell.tsx`: drop the `Team Board` item from `SUBMENU_CONFIG.work`. Run the router test — it goes green.

7. **Update L15 e2e for the new path.** `L15-task-request.spec.ts` currently navigates via Team Board. Re-route it through Bet detail (`/work/bet/:id`), where the TaskSheet is reachable from the bet's task list. Re-run the L15 e2e — it stays green. (No L15 functionality changes; the affordance still ships in TaskSheet, which is unchanged.)

8. **Delete the legacy page.** Remove `pages/WorkTeam.tsx`, `pages/WorkTeam.stories.tsx`, `__tests__/WorkTeam.test.tsx`, `__tests__/WorkTeam.task-request.test.tsx`. Run the full test suite — it stays green (the L15 e2e re-route from step 7 catches any orphaned reference).

9. **Wire Portfolio to real data.** In `WorkPortfolio.tsx`, swap `MOCK_PRODUCTS` for `useProducts()`. Wire each product card's onClick to `navigate("/work/product/" + product.id)`. The `MOCK_PRODUCTS` fixture stays in `fixtures/portfolio-data.ts` for stories and tests; its lore comment is updated to "test/story-only — runtime is `useProducts()`" (per the L6 inventory's distinction between forbidden runtime imports and allowed fixtures). Update `WorkPortfolio.test.tsx` to mock `useProducts`. Re-run the Portfolio tests — they go green.

10. **Run the e2e.** `bun run test` (Vitest) + Playwright suite. All previously failing tests are now green. The `L13-product-drilldown.spec.ts` proves the drill-down end-to-end.

11. **Close the inventory rows.** Update `plans/reviews/hardcoded-data-inventory.md`: mark the row at line 31 (`MOCK_PRODUCTS`) as closed by L13; mark the runtime active-bets-on-team mock fragments owned by L13 as closed; leave the rows L13 does not own (L12's `CANVAS_BETS`/`MOCK_PITCHES`, L17's `MOCK_CYCLE`, L15-already-closed `INITIAL_TASKS`) untouched.

12. **Verify gate.** `bun run verify` (orchestrated check + lint + test). Zero failures. Push to the open draft PR.

13. **Visual proof.** Screenshot of the Product page (populated state + zero-bets empty state + 404 state) attached to the PR. The "I looked at code, not pixels" anti-rationalisation is closed by visual artifact.

## Risk register

### Risk: legacy `/work/team` removal orphans the L15 surface

The L15 task-request affordance was originally wired through the WorkTeam Kanban. Removing the route + the page eliminates that mount point. The same affordance lives in `TaskSheet.tsx`, which is mounted from the Bet detail's task list; therefore the affordance survives, but its Playwright e2e (`L15-task-request.spec.ts`) needs a routing update.

**Mitigation:** task 7 in the ordered list explicitly re-routes the L15 e2e through `/work/bet/:id` → click a task row → TaskSheet opens → the request affordance is exercised. This is a test re-route, not a code change to L15's logic.

### Risk: `MOCK_PRODUCTS` is shared with `GlobalSearchPanel`

Spot-check: `grep -r "MOCK_PRODUCTS" packages/web/src` returns one runtime import (`WorkPortfolio.tsx`) plus story and test files. `GlobalSearchPanel.tsx` builds its results from a different fixture path. **No conflict.** If a later cross-cutting change couples search to the same source, the hook is the single seam.

### Risk: server `GET /api/products` performance under many products

Each product triggers two count queries (active-bets, shipped) plus a sum across active bets' tasks. For the demo seed (4 products, ~6 bets, ~20 tasks) this is well under any threshold. For production scale (50+ products) the per-row count loop is O(N) round-trips. **Mitigation:** the v0 implementation is a single SELECT with subquery counters using Drizzle's `sql` template — one round-trip total. If that proves too dense for the v0 timeline, fall back to a per-row loop and flag a follow-up to consolidate via a materialised aggregate (out of L13 scope; documented as a follow-up in `plans/work-packages/follow-ups.md`).

### Risk: 1:1 invariant violation in seed/test data

If a test fixture creates a product without a team (or two teams for one product), `loadProductTeam` throws 500. **Mitigation:** the existing seed (`packages/db/src/seed.ts`) already creates `seed-product-1` + `seed-team-1` together. Test fixtures must follow suit — covered by the dispatch test that asserts the 500 path (test 4 in §Vitest dispatch). The follow-up `UNIQUE` index lifts this from "convention" to "schema-enforced", out of L13 scope.

### Risk: `useProducts` race with the Portfolio's existing J8 loading skeleton

The Portfolio page already supports `loading?: boolean` as a prop (J8). The hook's `loading` state should drive the same prop, so the skeleton path remains a single source of truth. **Mitigation:** the Portfolio test already covers the loading state via the prop; the rewire passes `useProducts().loading` to the same prop.

## Out-of-scope items (slot leaving)

- **Artifact aggregation on the Product page.** L12 owns this. L13 ships the `<section data-testid="product-artifact-slot">` placeholder; L12 fills it without re-touching the page layout.
- **Cycle stripe on the Product page.** Out of scope; the cycle stripe stays portfolio-level.
- **PitchSelector on the Product page.** Out of scope; pitch authorship is L17's territory.
- **Tasks-across-bets Kanban on the Product page.** Explicitly excluded by v3 (humans act at the bet level).
- **`UNIQUE` index on `teams.product_id` to enforce 1:1 in the schema.** Follow-up; L13 enforces at the application layer with a server-side assert.
- **`/api/teams` resource.** Not added. Team data is reached only through `GET /api/products/:id`.
- **Rename product → rename team.** Not surfaced. The product-rename flow lives in Settings (out of scope).

## Open questions

None block the implementation. Two designer/reviewer-call items:

1. **Composite vs split endpoint.** The architecture above uses one composite endpoint (`GET /api/products/:id`) returning the full `ProductDetail`. An alternative is three endpoints (`/products/:id`, `/products/:id/roster`, `/products/:id/active-bets`) the page mounts in parallel via three hooks. The composite is simpler for v1 and matches the `/api/bets/canvas` precedent; the split is more future-proof if any single region grows independently. Reviewer to challenge if the composite is the wrong call.
2. **Focus restoration on Portfolio return.** The design notes a designer-call: on breadcrumb click, restore focus to the originating product card or fall back to the page H1. The simpler "focus the H1 on return" path is acceptable for L13. The card-restore path adds `location.state` plumbing in `WorkPortfolio.tsx`; defer to the polish story if reviewer agrees.

## Future work (logged here, not in scope)

- Add `UNIQUE` index on `teams.product_id` (a one-line Drizzle migration). Lifts the 1:1 invariant from convention to schema.
- A `lead_changed` event on `teams.lead_agent_id` updates so the rail can surface lead-rotation activity.
- Move the cycle stripe to a separate panel that the Portfolio AND the Product page consume (today the Product page does not show cycle context).

---

Proceed to phase 2 (reviewer critiques).
