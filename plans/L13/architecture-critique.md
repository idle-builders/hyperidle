# L13 — Architecture Critique

Reviewer pass over `plans/L13/architecture.md`. Read cold against the AC in `plans/work-packages/TRACK-L.md` L13 (lines 446–475), the concept doc, the design doc, and the rules in `.claude/rules/typescript.md`, `.claude/rules/testing.md`, and `.claude/rules/frontend.md`.

## Independent verification of source-driven claims

The architecture's "Source-driven notes" section makes several factual claims about the existing codebase. Reviewer verified each:

- `packages/server/src/routes/` confirmed: no `products.ts`, no `teams.ts`. Concur.
- `bets.ts` confirmed at the cited path with `GET /api/bets/:id` and `GET /api/bets/canvas`. Concur.
- `useFetch`-based fetch pattern, no React Query. Concur (verified `packages/web/package.json` has no `@tanstack/react-query`).
- `react-router-dom` v7 with `createBrowserRouter`. Concur (verified `router.tsx`).
- Schema: `teams.product_id NOT NULL`, `bets.product_id NOT NULL` + `bets.team_id NOT NULL`, `agents.team_id` nullable. Concur (verified `packages/db/src/schema.ts`).
- `WorkTeam.tsx` is a singleton with hardcoded `CANVAS_BETS` and `INITIAL_TASKS` and contains TaskSheet. Concur.
- IA spec at `cross-view-navigation-map.md` row "Portfolio Overview → Team View | Click product status card" is real. Concur (verified line 13).
- `MOCK_PRODUCTS` lives in `fixtures/portfolio-data.ts`, used at runtime in `WorkPortfolio.tsx` only. Concur (grep confirms one runtime import).

Source-driven discipline is good. One flagged-`⚠️ UNVERIFIED` block in the architecture (composite vs split endpoint precedent) is reviewer-call territory — addressed below.

---

## Pressure points the orchestrator asked the reviewer to apply

### 1. Composite vs split endpoint

The architecture commits to a single composite `GET /api/products/:id` returning `ProductDetail` (product + team + roster + burn + activeBets). Designer flags this as open.

**Reviewer judgement: composite is the right call for L13. Concur with the architecture's pick.** Reasoning:

1. The page renders all four regions on first paint. Splitting into three or four hooks introduces a cascade of loading states the design's V1 stack does not require — V1 is a single narrative, top-to-bottom. Three loading skeletons that resolve at different times would create a janky reveal that V1 explicitly designs against.
2. Precedent in the repo: `GET /api/bets/canvas` aggregates bets+tasks+activity. The composite is the established pattern for view-shaped reads. Concur with the architecture's citation.
3. The split is reversible. `GET /api/products/:id` can later become `GET /api/products/:id/header` + `/api/products/:id/roster` + `/api/products/:id/active-bets` without breaking the URL grammar — the composite endpoint can be removed in a future migration when one of the regions grows independently. The architecture flags this future-work seam correctly.
4. Round-trip economy: one round-trip vs three. For the demo founder context, this is dominant.

The decision is sound. **No change required.**

### 2. Application-layer enforcement of Product=Team 1:1 (no DB unique index now)

The architecture defers the `UNIQUE` index on `teams.product_id` to a follow-up. The 1:1 invariant is enforced by `assertOneTeamPerProduct` (a per-request check in the detail handler) and by convention in seed/test fixtures.

**Reviewer judgement: the deferral is acceptable but the enforcement is incomplete.** Three concerns:

1. **The assert only fires on the read path.** A future write path that creates a product without a team — or two teams for one product — does not trip the assert until someone reads the product. Concept §1 commits the system to "exactly one active Team per Product at any moment, no exceptions." The application-layer enforcement currently lives in zero write paths because L13 adds no write paths. **Acceptable for L13 scope** (no new write paths) but `follow-ups.md` must register the obligation that any future product-create write path takes a team in the same transaction.
2. **The 500-on-violation contract is the right surface.** A user-facing 404 would mask the bug; a user-facing 500 with `code: 'team_missing'` exposes the invariant break to operations and to tests. Concur.
3. **The `UNIQUE` index follow-up is one Drizzle line.** That's a nearly-free schema lift. The architecture flags it correctly. Reviewer recommends the follow-up be *named explicitly* in `plans/work-packages/follow-ups.md` (the architecture says it will be — verify in the build phase).

**Required before advancing:** add a one-liner to `follow-ups.md` registering the `UNIQUE(teams.product_id)` migration as a follow-up obligation, with a pointer to L13 architecture §"Future-work". The architecture text already commits to this; it must actually be written. (This is a 1-line doc change, not a re-architecture.)

### 3. Legacy redirect target (`/work/portfolio`)

The architecture redirects `/work/team` → `/work/portfolio` via `<Navigate to="/work/portfolio" replace />`.

**Reviewer judgement: correct fallback. Concur.** Three alternatives considered and rejected:

1. Redirect to first product (`/work/product/<first-id>`). Arbitrary; user might not want that product.
2. Render 404. Hostile to bookmarks.
3. Render a "Choose a product" landing distinct from Portfolio. Duplicative — Portfolio *is* the chooser.

`/work/portfolio` is the legitimate landing. The `replace` is correct (vestigial URL).

One reviewer-nit: the test plan covers the redirect via `router.test.tsx` (test 13) and the Playwright spec (step 5: "Navigate to `/work/team` directly, assert URL becomes `/work/portfolio`"). Both sufficient.

### 4. Empty-state for zero active bets — concrete enough to test?

Architecture §"Empty-state design" specifies the JSX:

```tsx
<EmptyState
  title="No active bets"
  description="This product team has no bets in flight. Shape a pitch on the team's Canvas to commit one."
  dataTestId="product-active-bets-empty"
/>
```

**Reviewer judgement: concrete enough to test.** The Vitest test 3 ("Renders the empty-state when active bets list is empty") and Playwright test 2 ("seed a product with zero active bets, navigate to its Product page, assert the empty-state for active bets is visible") cover the criterion.

**One nit (carried from design-critique):** the description copy references "the team's Canvas" — but the Canvas no longer mounts on the Product page (it lived on the legacy WorkTeam, which L13 deletes). PitchSelector is L17. The copy points to a non-existent affordance. The architecture inherits the design's copy verbatim; it is not architecturally broken, but the copy needs revision in builder phase. Recommend: "No active bets. Shape a pitch when you're ready to commit one."

This is a copy nit, not architectural. Does not block advance.

### 5. Out-of-scope: artifact aggregation slot (L12) — clean seam?

Architecture §"Out-of-scope" commits: "L12 owns this. L13 ships the `<section data-testid="product-artifact-slot">` placeholder; L12 fills it without re-touching the page layout."

**Reviewer judgement: the seam is clean.** The placeholder is a labeled `<section>` with a stable testid. L12 can render artifacts inside it without re-flowing the V1 stack. The slot is at the bottom of the page (per V1 ASCII), so L12's height-growth does not push earlier regions off-screen.

One reviewer-pressure: the architecture says the placeholder text is "Artifacts aggregation lands in L12". This text is visible to the user. **Recommend either suppress the user-visible string entirely** (render an empty `<section>` with the testid only, accepting that L12 will populate it) **or replace the L12-leakage copy with a generic "No artifacts yet" empty-state** (reusing `EmptyState`). The current text leaks workpackage IDs into the rendered UI. That's a small thing but it's an "I'm a building site" tell that the v3 trust principle disfavours.

Optional improvement, not required for advance. Builder-call.

### 6. The 13 ordered tasks — TDD red-green-refactor? PR-shape?

Reviewer evaluates each:

| # | Task | Red? Green? Coarse? Reviewer note |
|---|---|---|
| 1 | Write tests first (Vitest + Playwright) | RED. Correct ordering. |
| 2 | Shared types | GREEN-prep. Type additions. Acceptable as one commit. |
| 3 | Server route + helper + wiring | GREEN. Coarse — combines route file, helper, and app.ts wiring. Reviewer-judgement: acceptable for one PR-shaped commit *because* the tests are co-authored, so adding the route is the smallest unit that turns a failing test green. Not over-coarse. |
| 4 | Client hooks (useProduct + useProducts) | GREEN. Two hooks in one task; both mirror `useBet`. Acceptable. |
| 5 | Product page component + stories + testids | GREEN. The largest task. Composes 8+ existing primitives, adds 10 testids, 7 storybook entries. Reviewer-flag: **this is the right size for one focused commit.** Splitting into "page + states" then "stories" is artificial — the stories test the states the page renders. |
| 6 | Routing changes (router + AppShell) | GREEN. Two small files. Acceptable. |
| 7 | Update L15 e2e for the new path | **CRITICAL CONCERN — see §"Specific failure" below.** |
| 8 | Delete the legacy page (WorkTeam.tsx + tests) | GREEN. Clean delete after the L15 re-route lands. |
| 9 | Wire Portfolio to real data | GREEN. Hook substitution + test re-mock. |
| 10 | Run the e2e | Verification, not a code task. Acceptable as a step. |
| 11 | Close the inventory rows | Doc update. Acceptable. |
| 12 | Verify gate | Verification. |
| 13 | Visual proof (screenshot) | Per CLAUDE.md "Proof & Definition of Done". Required. |

**Order respects TDD red-green-refactor:** task 1 is red, tasks 2–9 are green, tasks 10–13 are verify+proof. No refactor-only tasks (correct — there is no existing code being refactored, only added or deleted).

**No task is too coarse for one PR-shaped commit.** Task 5 (the page) is the largest; it is a single coherent surface, not a split-able unit.

### 7. The L15 task-request e2e re-route — does it cover the L15 acceptance, or did the designer just move a test?

**THIS IS THE LOAD-BEARING CONCERN.** The architecture text in §"Source-driven notes" (line 25 of architecture.md) and Risk register §1 claims:

> "The same affordance ships unchanged on `TaskSheet.tsx` (which is invoked from the Bet detail's task list and from any other Kanban surface that mounts it). Removing `WorkTeam.tsx` removes the *Kanban* surface but does NOT remove the *TaskSheet* surface."

**Reviewer verifies independently: this claim is FALSE.** Direct file inspection:

- `grep TaskSheet packages/web/src/**/*.tsx` (excluding tests/stories) returns exactly two non-test files: `pages/WorkTeam.tsx:209` (the surface being deleted) and `shell/TaskSheet.tsx` (the component itself). **No other page mounts TaskSheet.**
- `packages/web/src/pages/WorkBet.tsx` renders tasks as `<tr>` rows in a sortable table (lines 383–390). No `onClick` on the rows. No TaskSheet import. No "click a task → open the request sheet" affordance.
- The L15 e2e (`packages/web/e2e/L15-task-request.spec.ts`) navigates to `/work/team`, waits for `data-testid='work-team-page'`, asserts no draggable affordances exist on `data-testid='work-team-kanban'`, clicks a task title to open the dialog, exercises the radio + send-request flow. **Every selector in this spec is bound to the WorkTeam Kanban surface.**

**The architecture's plan to "re-route the L15 e2e through Bet detail (`/work/bet/:id`), where the TaskSheet is reachable from the bet's task list" assumes a TaskSheet integration on Bet detail that does not exist.** Re-pointing the spec at `/work/bet/:id` will fail at the first assertion (`page.waitForSelector("[data-testid='work-team-kanban']")` becomes `[data-testid='work-bet-page']` — but the click on a task title `await page.getByText("Implement login endpoint").click()` will not open a dialog, because WorkBet's rows have no onClick).

**Conclusion: task 7 as written cannot succeed.** Two paths to fix it:

A. **Add TaskSheet integration to WorkBet.tsx in L13.** This is a real piece of work, not a "test re-route." It means: import TaskSheet on WorkBet, add `useState` for `openTask`, wire `onClick` on each task `<tr>` to open the sheet, mount the sheet at the bottom of the page. Plus the `data-testid` hooks. Plus the storybook update. This is a new task (call it 7a) and it must precede the e2e re-route. It also expands L13 scope into territory that arguably belongs to L14 or L18 (task interaction model).

B. **Keep the L15 e2e on its current `/work/team` URL by NOT deleting WorkTeam.tsx and by NOT redirecting `/work/team`.** The Product page lives at `/work/product/:productId` as a new surface; legacy `/work/team` continues to render WorkTeam (with its own Canvas + Kanban + TaskSheet) until L18 (or whoever owns the task interaction redesign) moves the TaskSheet to a v3-correct surface. **This violates the L13 spec line "The previous denormalized team route is removed; legacy links redirect to a sensible fallback."** So path B is non-conformant.

C. **Move the L15 e2e to mount TaskSheet directly via a Storybook test or a dedicated test page**, then delete the WorkTeam-routed spec. This decouples L15's acceptance from the route. It is the cleanest path technically but requires an architectural call about whether L15's "the user can request a task state change" acceptance is satisfied if there is no user-reachable surface that mounts the TaskSheet.

**Reviewer's read: path A is the only honest fix.** The L13 spec is explicit that the legacy team route goes; L15's acceptance is that the affordance ships and is reachable; if the only mount-point of TaskSheet today is being deleted, the affordance is no longer reachable until a new mount-point exists. WorkBet is the natural new mount-point (tasks under a bet, opened from the bet's task list). Adding the integration in L13 is the price of the deletion.

**This is the most important finding in the critique.** The architecture text presents the e2e re-route as cosmetic ("test re-route, not a code change to L15's logic"). It is not cosmetic — it requires a code change on WorkBet that the task list does not include.

**Required before advancing:** the architecture must add a task between current task 6 and task 7 (call it task 6.5):

> **6.5. Wire TaskSheet into Bet detail.** Add TaskSheet mount to `WorkBet.tsx`. Add `onClick` handlers on each task `<tr>` that open the sheet for the clicked task. Add `data-testid="bet-task-row"` for e2e selection. Update `WorkBet.test.tsx` and `WorkBet.stories.tsx`. Re-run the suite green.

And task 7 must be reworded:

> **7. Update L15 e2e for the new path.** `L15-task-request.spec.ts` currently navigates via Team Board's Kanban. Re-route it through Bet detail: `/work/bet/<id>` → click `data-testid="bet-task-row"` for the matching task → TaskSheet opens (now mounted by 6.5) → the request affordance is exercised. Update the kanban-specific selectors (`work-team-kanban`, `work-team-page`) to bet-detail equivalents.

Without this, task 8 ("Delete the legacy page") leaves L15's acceptance broken in production. The L15 e2e would either fail (if updated mechanically) or pass against a hollow path (if the assertions are softened to "the test exists" — anti-pattern per `.claude/rules/testing.md`).

**Severity: BLOCKING.** Builder cannot succeed if this task is left as written.

---

## 9-dimension architectural rubric

| Dim | Score | Reviewer note |
|---|---|---|
| Spec coverage (every AC has a test) | 7 | Each of the 7 spec ACs has at least one Vitest or Playwright test. The "vitest unit tests cover the dispatch" AC is covered by `products.test.ts`. The "Playwright e2e: from Portfolio, click a product card → the product page renders → roster and bets are visible" AC is covered by spec step 1. The 7 is not 9 because the L15 surface deletion implicitly hits L15's prior acceptance, and the architecture's mitigation is broken (see §7 above). |
| Source-driven (citations exist for non-obvious choices) | 9 | The architecture cites file paths and line numbers for every load-bearing claim. The one `⚠️ UNVERIFIED` block is correctly flagged. |
| Layering integrity (Human Interface ↔ Meta Layer ↔ Agent Runtime) | 9 | The composite endpoint reads from the Meta Layer's tables only. No agent-runtime touch. No human-interface logic in the server. The hook layer (Human Interface) calls the API (Meta Layer). Concur. |
| Type discipline (no `any`, explicit return types, shared types in `@hyperidle/shared`) | 9 | The shared types in `packages/shared/src/product.ts` are well-shaped. `Status` and `BetStatus` are reused, not re-minted. Tabular numeral discipline (numbers vs strings) is right (`costActual: number`, not string). |
| Test plan (red-green-refactor, all states) | 7 | Vitest dispatch covers happy + 404 + 500 + empty-bets + null-cap; client unit covers populated + empty + error + breadcrumb + bet-click + 404; e2e covers drill-down + empty + roster + breadcrumb + redirect + 404 + no-Kanban. Comprehensive. The 7 (not 9) is because (a) the L15 re-route as written is broken (§7), and (b) the loading state for Vitest client unit is not enumerated explicitly — it's covered by `useProduct.test.ts` test 12 (unmount during in-flight) but the page-level "shows skeleton while loading" assertion isn't called out. Builder should add it. |
| Naming / file paths | 9 | `WorkProduct.tsx` mirrors `WorkPortfolio.tsx` and `WorkBet.tsx`. `useProduct` mirrors `useBet`. `products.ts` mirrors `bets.ts`. Stable conventions. |
| Out-of-scope discipline (slot leaving, follow-ups named) | 8 | Artifact slot is clean (§5). Cycle stripe is correctly excluded. PitchSelector excluded. UNIQUE index correctly logged as follow-up. The 8 (not 9) is because `follow-ups.md` does not yet contain the UNIQUE-index entry — the architecture text commits to it but the file isn't yet updated. Builder must do that in task 11 (or earlier). |
| Risk register (real risks, real mitigations) | 7 | Three risks named (legacy route orphans L15, MOCK_PRODUCTS sharing, server perf, 1:1 invariant in seed). The L15 risk's mitigation is broken (§7). The other three are well-mitigated. |
| Verifiability (every claim has a test or a citation) | 8 | The composite endpoint is verifiable (the Vitest dispatch covers the 7 cases). The page is verifiable (Vitest + Playwright). The redirect is verifiable. The 8 (not 9) is because the L15 acceptance, if path A is taken, requires a new test on `WorkBet.test.tsx` for the TaskSheet integration, which is not yet enumerated. |
| **Total** | **73** | |

(Note: the rubric is 9 dimensions; total above is 73 / 90.)

Six dimensions ≥ 7, three at 7, one at 7 borderline. **Three dimensions sit at 7 because of the L15 re-route concern.** Fixing §7 lifts spec coverage, test plan, risk register, and verifiability all by 1–2 points.

---

## Required before advancing

1. **L15 task-request surface preservation (BLOCKING).** Add a task 6.5 to wire TaskSheet into `WorkBet.tsx`, and rewrite task 7 to re-point the L15 e2e through Bet detail using the new mount. Without this, deleting WorkTeam orphans L15's acceptance and the e2e cannot be re-routed mechanically. See §7 above for the precise re-write.

2. **`follow-ups.md` entry for UNIQUE(teams.product_id).** Add a one-liner registering the migration as the schema-side enforcement of the 1:1 invariant. Architecture text commits to this; the file must actually be updated (task 11 is the natural place).

3. **Page-level loading state test.** Add an explicit Vitest assertion in `WorkProduct.test.tsx` for the loading skeleton render path. The architecture lists 9 client unit tests but none asserts "shows SkeletonCard while useProduct is in-flight." This is one extra test per state-table row.

## Optional improvements

1. **Empty-bets copy.** Drop the "team's Canvas" reference (carried from design-critique).
2. **Artifact slot user-visible text.** Replace "Artifacts aggregation lands in L12" with either an empty `<section>` (no copy) or a generic empty-state. Workpackage IDs should not leak into rendered UI.
3. **Composite endpoint perf.** The risk register's "v0 implementation is a single SELECT with subquery counters" deserves an explicit code shape in the architecture (vs the per-row count loop). The choice is not load-bearing for the demo but the builder will pick one of the two paths blind otherwise.
4. **Storybook coverage of breadcrumb states.** The storybook entries cover populated/empty/error/loading/404. Add a "with-breadcrumb-focused" story so the focus-restoration pattern is visually inspectable.

---

## Verdict

**REVISE.** The plan is structurally sound and the tasks are well-ordered, but three required items (one BLOCKING, two minor) must be addressed before builder execution:

- **BLOCKING:** L15 task-request surface preservation. The architecture's claim that re-routing the L15 e2e through Bet detail is "a test re-route, not a code change to L15's logic" is factually wrong — WorkBet does not mount TaskSheet today. A new task (6.5) must wire it in before the route deletion lands.
- **Minor:** UNIQUE-index follow-up entry must actually be written to `follow-ups.md`.
- **Minor:** loading-state Vitest assertion missing.

Once these are addressed, the plan is ready. The architecture's overall shape — composite endpoint, V1 stacked layout, drill-down with breadcrumb, application-layer 1:1 enforcement, three risks named with mitigations — is correct. The critique is targeted, not structural.

Reviewer confidence the plan is ready for builder execution **once the three items are fixed**: HIGH. As-written: MEDIUM (the L15 issue would surface as a builder-time blocker, costing one re-spin).
