# AD9 — Architecture: Uniform Section Navigation & Work Overview as Team List

**Fixed inputs:** `plans/AD9/concept.md` (locked concept), `plans/AD9/design/approved.md` (locked visual contract). This plan decides routes, file paths, wiring, and the test migration — NOT hierarchy, component vocabulary, or interaction grammar.

**Scope guardrail:** routing + navigation + one new page component + one pure helper. **No data-model change, no new endpoint, no new query.** `useTeams()` → `GET /api/teams` already returns `TeamListItem[]` with every status signal.

---

## Required reading (for the engineer)

- `plans/AD9/concept.md`, `plans/AD9/design/approved.md`.
- `packages/web/src/shell/Sidebar.tsx` (SectionHeader + Work sub-list), `packages/web/src/shell/shell-types.ts` (`ViewId`).
- `packages/web/src/layouts/AppShell.tsx` (`handleViewChange` ~L305; `handleSearchNavigate` ~L376 has a `/work/portfolio` fallback).
- `packages/web/src/router.tsx` (route table + `RedirectProductToTeam`).
- `packages/web/src/navigation/parentPathFor.ts`.
- `packages/web/src/pages/Conversations.tsx`, `packages/web/src/pages/KnowledgeList.tsx` (overview frame to mirror).
- `packages/web/src/pages/WorkPortfolio.tsx` (the page being retired — read for the `New bet` header behavior + empty state to preserve).
- `packages/shared/src/team.ts` (`TeamListItem`, `TeamStatus`).
- `packages/design-system/src/{ItemList,Row,StatusChip,EmptyState,Skeleton,ErrorState,Button}.tsx`.

---

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| `useTeams` exists, returns status signals | ✅ `TeamListItem` carries `status` (healthy/behind/blocked, inherited from `TeamSummary`) + `activeBets: number` (the active-bet count) — the two signals the simplified row needs — plus `phase`, `progress{done,total}`, `agentCount`, `activeAgentCount`, `agentHealthWarning`, `routineCount`, `shipped`, `shipRate` (now unused by the row). `useTeams()` already fetches it. | Use `status` + `activeBets` only. No new query, no new field, no data-model change. |
| `TeamStatus` maps to `StatusChip` | ✅ `Status` (`healthy\|behind\|blocked\|…`) ⊇ `TeamStatus` 1:1. | Pass `team.status` straight into `StatusChip`. |
| `/work/portfolio` is post-setup landing + parent | ✅ `FirstRunRedirect`, `SetupFlow`, `parentPathFor`, `WorkBet`/`WorkTask` breadcrumbs, `WorkBetCreate`, `WorkRoutine`, `NotFound`, `RedirectProductToTeam`, `handleSearchNavigate` all reference it. | Enumerated in Migrations §. Repoint all to `/work`; `/work/portfolio` → redirect to `/work`. |
| `useBets` only feeds the grid | ✅ Only consumers: `WorkPortfolio.tsx` + `portfolioFilters.ts`. | Delete `useBets.ts`, `WorkPortfolio.tsx`, `pages/work/portfolioFilters.ts` and their tests (see Migrations). |
| `BetCard` reused in team view | ✅ `BetCard` is rendered in team detail; the portfolio grid is a *second* consumer. | Keep `BetCard`. Only the grid usage goes. |
| 1-team Work shortcut exists | ✅ `handleViewChange` already navigates 1-team → `/work/team/:id`. | Preserve; the 2+ branch changes from `/work/portfolio` to `/work`. |
| Tests assert portfolio behavior | ⚠️ 9 `WorkPortfolio.*` unit tests + e2e `R2-work-first-landing`, `AG2-portfolio-arrival`, `work.spec`, `W3-sidebar` assert testids/routes being removed. | These assert deleted behavior → **retire/migrate**, not preserve. Detailed in Migrations §. NOT in `protectedTests`. |

**No spec/concept contradiction found.**

---

## Design-it-twice — the Work landing route

**Decision: where does the team-list overview live, and what happens to `/work/portfolio`?**

- **Option 1 — New canonical `/work` route; redirect `/work/portfolio` → `/work`.** New `WorkOverview` page mounted at `/work`. `handleViewChange("work")` (2+ teams) → `navigate("/work")`. Old path 301-style `<Navigate to="/work" replace>`. Trade-off: introduces one new path but keeps old bookmarks alive via redirect. Reject reason: none material.
- **Option 2 — Rename in place: mount `WorkOverview` at `/work/portfolio`, drop the word only from UI.** Trade-off: zero route churn in callers. Reject reason: **violates the concept hard rule** — "portfolio" must not survive in any user-facing path. The URL is user-facing. Rejected.

**Chosen: Option 1.** Canonical `/work` overview; `/work/portfolio` redirects to `/work` (graceful, mirrors how `work/product/:id` already redirects). All internal references (landing, breadcrumb, parent, fallback) point at the new `/work` directly to avoid a redirect hop; the redirect exists only for external/bookmarked links and any test that still hits the old path.

### The 1-team short-circuit (single chokepoint)

**Decision: the 1-team skip lives in `WorkOverview` itself**, not at each redirect site.

Spec validation scenarios are explicit: a 1-team user (the post-setup common case — `SetupFlow` creates exactly one team) lands on `/work/team/:teamId`, and `/work/portfolio` resolves to "their first team's page." The concept's AD3 rule ("1 team → skip the overview, it's noise") says the same. Multi-team users (2+) still land on the `/work` overview (the team list).

Two ways to enforce this:

- **(a) Per-redirect-site short-circuit** — make `FirstRunRedirect`, `SetupFlow`, and the `/work/portfolio` route each branch on `teams.length === 1`. Trade-off: three callsites each fetch teams + branch; `SetupFlow` already knows the created team id but the others must read `useTeams`; a bookmarked `/work` (no redirect at all) still falls through to a 1-row overview. Rejected — three places to keep in sync, and it leaves a hole (direct `/work` navigation).
- **(b) Single chokepoint in `WorkOverview`** — `WorkOverview` renders at `/work`; when `useTeams` resolves to exactly one team it returns `<Navigate to={`/work/team/${id}`} replace>` instead of the list. Every entry path collapses through one branch: post-setup landing → `/work` → (1 team) → team page; `/work/portfolio` redirect → `/work` → (1 team) → team page; bookmarked `/work`; sidebar header (already short-circuits in `handleViewChange`, harmlessly redundant). Trade-off: the redirect resolves after the teams fetch (one extra fetch + `replace` hop on the 1-team landing) rather than synchronously — acceptable: `WorkOverview` fetches teams anyway, and `replace` keeps history clean.

**Chosen: (b).** Single chokepoint, no per-site duplication, no fall-through hole. This is the reviewer's recommended fix and it also closes the design-critique WARNING (a 1-team user reaching `/work` by any non-sidebar route now never sees a 1-row list). All `/work/portfolio` redirect sites and post-setup landings therefore target `/work` unconditionally — the 1-team collapse happens once, downstream, inside the page.

**State contract update for `WorkOverview`:** loading → `SkeletonList`; error → `ErrorState`; **`teams.length === 1` → `<Navigate to={`/work/team/${encodeURIComponent(teams[0].id)}`} replace>`**; `teams.length === 0` → `EmptyState(/setup)`; else (2+) → the attention-sorted team list. The 1-team branch sits between error and empty so it only evaluates on resolved, non-error data.

---

## Acceptance criteria (each with verification method)

**AC1 — Section headers switch-and-surface, not deep-link (uniform grammar).**
Verify: component test on `AppShell`/`handleViewChange` (or a router integration test) — clicking the Work section header with 2+ teams navigates to `/work` (the overview), not `/work/portfolio`; Conversations header → `/conversations`; Knowledge header → `/knowledge`. Assert resulting `location.pathname`.

**AC2 — Work overview renders a team list with per-row status + active-bet count, mirroring the overview pattern.**
Verify: component test mounts `WorkOverview` with a `useTeams`-shaped fixture of 3 teams; asserts 3 `data-testid="team-row"` rows, each containing a `StatusChip` reflecting `team.status` and a subtitle reading `${activeBets} active bet${activeBets===1?"":"s"}` (the active-bet count from `TeamListItem.activeBets`), and that row click navigates to `/work/team/:id`. **No agents cell, no progress cell** — the founder design-review dropped both; assert neither `team-agents` nor `team-progress` testids render.

**AC3 — Attention-sort default ordering.**
Verify: unit test on the pure `sortTeamsByAttention(teams)` helper — input mixed `[healthy, blocked, behind]` → output order `[blocked, behind, healthy]`; ties broken by `name` asc **only**. Asserts the returned id order. (This is the production sort path imported by the page, not a reimplementation.) **No `agentHealthWarning` tie-break** — it depended on the now-removed agents signal (founder design-review); within-rank order is purely `name` asc.

**AC4 — All four list states render.**
Verify: component tests — loading → `SkeletonList`; error → `ErrorState` with retry; empty (0 teams) → `EmptyState` with `/setup` action; populated → rows. Assert the distinguishing testid/role per state.

**AC5 — `/work/portfolio` redirects to `/work` (then the page resolves by team count).**
Verify: router integration test (jsdom, `MemoryRouter` at `/work/portfolio`). With a 2+-team `useTeams` fixture it resolves to `WorkOverview` (testid `work-overview-page`) — i.e. the overview, not a 404 and not the old grid. With a **1-team** fixture it resolves through `/work` to `/work/team/:id` (satisfies spec scenario 3 "redirected to their first team's page"). The redirect route itself is unconditional `<Navigate to="/work" replace>`; the team-count branch is `WorkOverview`'s (AC11).

**AC6 — Post-setup landing is `/work` (the page then collapses 1 team → its team page).**
Verify: `FirstRunRedirect` test — `hasUser && hasTeams` → target `/work` (not `/work/portfolio`), unconditional (no team-count branch in `FirstRunRedirect`). `SetupFlow` test — submit success navigates to `/work?onboarding=true`. Assert the `Navigate to` / `navigate()` arg. The single-team landing → team-page outcome (spec scenario 1) is enforced by `WorkOverview`'s 1-team short-circuit, covered in AC11, not by these callsites.

**AC7 — `parentPathFor` + breadcrumbs + NotFound fallback point at `/work`.**
Verify: unit test on `parentPathFor` — `/work/bet/:id`, `/work/routine/:id`, `/work/team/:id` → `/work` (was `/work/portfolio`). Breadcrumb assertions in `WorkBet`/`WorkTask` tests assert `to="/work"`. `NotFound` test asserts fallback `/work`.

**AC8 — Sidebar Work sub-list unchanged in reveal model; teams list switches under the selected section.**
Verify: `Sidebar` component test — active view `work` with 2+ teams shows the team sub-list; clicking a team row calls `onSelectTeam` → navigates to `/work/team/:id`; with 1 team the sub-list is suppressed (AD3, unchanged). Existing `W3-sidebar`/`Sidebar` tests cover most; assert no regression.

**AC9 — Portfolio page + dead code removed; no dangling imports.**
Verify: `npm run check` (zero TS errors after deletion) + `npm run lint` (knip catches unused `useBets`/`portfolioFilters` if any reference survives). Grep gate: zero `WorkPortfolio` / `portfolioFilters` / `useBets` imports in production `src` (excluding deleted files).

**AC10 — Conversations & Knowledge overviews not regressed.**
Verify: existing `Conversations`/`KnowledgeList` component + e2e tests stay green unchanged. Listed in `protectedTests`.

**AC11 — `WorkOverview` short-circuits a single team to its team page (spec scenarios 1 & 3, AD3 "skip the overview at 1 team").**
Verify: component test mounts `WorkOverview` with a 1-team `useTeams` fixture and asserts it renders a redirect to `/work/team/:id` for that team (no `team-row`, no `work-overview-page` list) — e.g. mount in a `MemoryRouter` with a sentinel route at `/work/team/:teamId` and assert the sentinel renders with the correct id, or assert the `<Navigate>` target. With a 2-team fixture it renders the list (no redirect). This is the single chokepoint; multi-team users (2+) keep the `/work` overview.

---

## Type signatures / contracts

```ts
// packages/web/src/pages/work/sortTeamsByAttention.ts  (NEW — pure, testable)
import type { TeamListItem } from "@hyperidle/shared";
export function sortTeamsByAttention(teams: readonly TeamListItem[]): TeamListItem[];
// rank: blocked(0) < behind(1) < healthy(2); within rank tie-break name asc ONLY.
// (No agentHealthWarning tie-break — the row no longer surfaces the agents signal per the founder design-review.)

// packages/web/src/pages/WorkOverview.tsx  (NEW — the team-list overview page)
export function WorkOverview(): JSX.Element;
//   data: const { data, loading, error } = useTeams();  const teams = data?.teams ?? [];
//   states (in order): loading → SkeletonList; error → ErrorState;
//           teams.length===1 → <Navigate to={`/work/team/${encodeURIComponent(teams[0].id)}`} replace>  // AC11 chokepoint
//           teams.length===0 → EmptyState(/setup);
//           else (2+) → ItemList(variant="flush", as="ul") of Row per sortTeamsByAttention(teams).
//   Row per team: title=team.name; subtitle=`${activeBets} active bet${activeBets===1?"":"s"}`;
//           single end cell <StatusChip status={team.status}/>. No agents/progress cell (founder design-review).
//   header: "Teams" title + optional "${n} teams" sub-line + "New bet" Button → /work/bet/new.
//   page testid: "work-overview-page"; row testid: "team-row".
//   @lore AD9: the 1-team branch is THE single chokepoint for the AD3 "skip the overview at 1 team"
//     rule + spec scenarios 1 & 3. Every entry path (post-setup landing, /work/portfolio redirect,
//     bookmarked /work) flows through /work → here; redirect sites stay unconditional → /work.
```

No changes to `packages/shared`, `packages/server`, `packages/db`, `packages/fabric`.

---

## Route checklist (router.tsx after AD9)

| Path | Element | Change |
|---|---|---|
| `work` | `<WorkOverview />` | **NEW** canonical Work overview; **1 team → `<Navigate>` to its team page (AC11 chokepoint)**, 2+ → team list |
| `work/portfolio` | `<Navigate to="/work" replace />` | **CHANGED** (was `<WorkPortfolio />`) — unconditional redirect to `/work`; the team-count branch happens in `WorkOverview`, so a 1-team user ends on `/work/team/:id` (spec scenario 3) |
| `work/team/:teamId` | `<WorkTeam />` | unchanged |
| `work/product/:productId` | `<RedirectProductToTeam />` | unchanged (but its empty-id fallback `/work/portfolio` → `/work`) |
| `work/routine/:routineId` | `<WorkRoutine />` | unchanged |
| `work/bet/new` | `<WorkBetCreate />` | unchanged |
| `work/bet/:betId` | `<WorkBet />` | unchanged |
| `work/bet/:betId/task/:taskId` | `<WorkTask />` | unchanged |
| index `/` | `<FirstRunRedirect />` | landing target `/work` |

`/architecture-review` greps router.tsx + the redirect against this table.

---

## Migrations (every callsite — delete | reroute | rename)

**Production source — reroute `/work/portfolio` → `/work`:**
- `router.tsx` — replace `{ path: "work/portfolio", element: <WorkPortfolio/> }` with redirect; add `{ path: "work", element: <WorkOverview/> }`; remove `WorkPortfolio` import; in `RedirectProductToTeam` change empty-id fallback `/work/portfolio` → `/work`. *(reroute + rename)*
- `layouts/AppShell.tsx` — `handleViewChange` work-branch 2+ teams: `navigate("/work/portfolio")` → `navigate("/work")`; `handleSearchNavigate` work fallback `/work/portfolio` → `/work`. *(reroute)*
- `pages/FirstRunRedirect.tsx` — target `/work/portfolio` → `/work`. *(reroute)*
- `pages/SetupFlow.tsx` — `navigate("/work/portfolio?onboarding=true")` → `navigate("/work?onboarding=true")`; update @lore lines. *(reroute)*
- `navigation/parentPathFor.ts` — three `/work/portfolio` returns → `/work`; update header doc comment. *(reroute)*
- `pages/WorkBet.tsx` (L922) + `pages/WorkTask.tsx` (L192-193) + `pages/WorkTeam.tsx` (L257, `team-breadcrumb-back`) — breadcrumb `to: "/work/portfolio"` → `to: "/work"`. *(reroute)* The `WorkTeam` breadcrumb is an internal `/work/portfolio` emitter; rerouting it keeps risk #4 ("no internal caller still emits `/work/portfolio`") satisfied. Consistent with the other back-nav rules. A 1-team user clicking it lands on `/work` → the `WorkOverview` chokepoint bounces back to their team page (AC11) — no 1-row list flash, since `Navigate replace` resolves before paint.
- `pages/WorkBetCreate.tsx` (L101, L111) — `navigate("/work/portfolio")` + back link → `/work`. *(reroute)*
- `pages/WorkRoutine.tsx` (L152) — `navigate("/work/portfolio")` → `/work`. *(reroute)*
- `pages/NotFound.tsx` (L65) — fallback `navigate("/work/portfolio")` → `/work`. *(reroute)*
- `components/ArtifactSection.tsx` (L5) — comment mentions WorkPortfolio; update comment only. *(rename)*

**Production source — delete (dead after grid removal):**
- `pages/WorkPortfolio.tsx` — **delete.**
- `pages/work/portfolioFilters.ts` — **delete** (only consumer is WorkPortfolio).
- `hooks/useBets.ts` — **delete** (only consumers WorkPortfolio + portfolioFilters). Verify with knip.

**Tests — retire (assert deleted behavior; NOT protected):** delete these unit tests (they test the removed grid/filters/landing-to-portfolio):
- `__tests__/WorkPortfolio.test.tsx`, `WorkPortfolio.AG3.test.tsx`, `WorkPortfolio.AA1.test.tsx`, `WorkPortfolio.AB2.test.tsx`, `WorkPortfolio.L13.test.tsx`, `WorkPortfolio.cycle.test.tsx`, `WorkPortfolio.j8.test.tsx`, `M3-WorkPortfolio.no-mock.test.tsx`, `U9-work-portfolio-bet-grid.test.tsx`, `pages/__tests__/WorkPortfolio.outcome.test.tsx`, `hooks/__tests__/useBets.test.ts`.

**Tests — migrate (assert landing/route, keep the intent, repoint to `/work`):**
- `__tests__/FirstRunRedirect.test.tsx`, `FirstRunRedirect.P4.test.tsx`, `FirstRunRedirect.R2.test.tsx` — expected target `/work/portfolio` → `/work`.
- `__tests__/SetupFlow.test.tsx`, `AE2-SetupFlow.test.tsx`, `AE2-onboarding-autoopen.test.tsx` — navigate target → `/work`.
- `__tests__/AG4-parentPathFor.test.ts` — expected parents → `/work`.
- `__tests__/router.test.tsx`, `U6-router.test.tsx`, `router.L13.test.tsx` — `/work/portfolio` resolution → assert redirect to `/work`; add `/work` → `WorkOverview` case.
- `__tests__/WorkBetCreate.test.tsx`, `WorkRoutine.AA1.test.tsx`, `WorkRoutine.AA2.test.tsx`, `WorkProduct.test.tsx`, `W3-work.test.tsx` — repoint route asserts to `/work` (incl. `WorkProduct.test.tsx`'s `team-breadcrumb-back` `to`/href assertion → `/work`).
- `__tests__/WorkTeam.AG1.test.tsx` — asserts only `team-breadcrumb-back` **presence** (L474-476), not its `to`/href; no change needed (stays green after the reroute). Listed here so the builder's repoint pass doesn't mistake it for a miss.

**E2E — migrate (Playwright; local-only lane):**
- `R2-work-first-landing.spec.ts` — landing URL `/work/portfolio` → `/work`; `work-portfolio-page`/`create-bet-cta` selectors → `work-overview-page` + the new empty/`New bet` affordance. Re-scope "create bet" CTA to the new overview header button.
- `AG2-portfolio-arrival.spec.ts` — **retire** (tests portfolio filter zones / verdict pills / team pills, all removed). Replace with a small `work-overview.spec.ts` asserting team rows + status chips + row→team nav (optional, keep lean).
- `work.spec.ts`, `work-surface.spec.ts`, `W3-sidebar.spec.ts`, `navigation.spec.ts`, `R9-action-prominence.spec.ts`, `U9-screen-layouts.spec.ts`, `W3-screen-parity.spec.ts`, `AG3-bet-authoring.spec.ts`, `Q3-bet-creation.spec.ts`, `mock-data-purge.spec.ts`, `AI4-status-language.spec.ts`, `L13-product-drilldown.spec.ts`, `L21-coc-overlay.spec.ts`, `M3-api-wiring.spec.ts`, `synthesis.spec.ts`, `N2-auth.spec.ts`, `dialog-dismissal.spec.ts`, `accessibility*.spec.ts`, `setup-flow.spec.ts`, `ah1-onboarding-credentials.spec.ts`, `touch-targets.spec.ts`, `AG1-team-composition.spec.ts`, `U11-hearth-validation.spec.ts`, `ag5-dropdown.spec.ts`, `L12-artifact-surfaces.spec.ts`, `L9-single-detail.spec.ts` — any `goto("/work/portfolio")` → `goto("/work")`; any `work-portfolio-page` selector → `work-overview-page`. Most are incidental navigations; update the path string. The builder greps `work/portfolio` + `work-portfolio-page` across `e2e/` and repoints each. (e2e runs local-only per project rule — not a CI gate, but must be migrated so the local lane is green.)

**Docs (deferred to `/write-docs`, flagged in concept):** `docs/guides/user/three-core-views.md` §Portfolio, `getting-started.md` Work line. Not part of this code change.

---

## Security & abuse cases

- Rate-limit on POST/PATCH — **N/A.** AD9 adds no write endpoint; read-only `GET /api/teams` already exists.
- Input-trust boundary for agent-authored fields — **N/A.** No new input surface; team names already rendered elsewhere via the same components.
- Secret handling — **N/A.** No credentials touched.
- Path-traversal — **N/A.** No path input. Route ids already pass through existing `encodeURIComponent` on navigation.
- SSRF — **N/A.** No outbound URL.
- IDOR/auth — **N/A.** `GET /api/teams` auth boundary unchanged; the overview only renders what that endpoint returns for the authed user.

All N/A with reason — no new attack surface (pure routing + read-only list rendering).

---

## Ordered task list

1. **Add `sortTeamsByAttention` pure helper** — `pages/work/sortTeamsByAttention.ts`. Test: `sortTeamsByAttention.test.ts` (AC3). *(no deps)*
2. **Build `WorkOverview` page** — `pages/WorkOverview.tsx` + `WorkOverview.stories.tsx` (empty/loading/error/populated). Uses `useTeams`, `sortTeamsByAttention`, `ItemList`/`Row`/`StatusChip`/`Button`/`EmptyState`/`SkeletonList`/`ErrorState`, plus react-router `<Navigate>` for the 1-team short-circuit. Order the state branches loading → error → **1-team `<Navigate replace>`** → empty → list (per the type contract). Tests: `WorkOverview.test.tsx` (AC2, AC4, **AC11**). *(dep: 1)*
3. **Router** — mount `/work` → `WorkOverview`; `/work/portfolio` → `<Navigate to="/work" replace>`; remove `WorkPortfolio` import; fix `RedirectProductToTeam` fallback. Tests: migrate `router.*` (AC5). *(dep: 2)*
4. **`handleViewChange` + `handleSearchNavigate`** in `AppShell.tsx` → `/work` for 2+ teams / work fallback. Test: AppShell/handleViewChange (AC1). *(dep: 3)*
5. **Landing + nav helpers** — `FirstRunRedirect`, `SetupFlow`, `parentPathFor`, `NotFound`, breadcrumbs in `WorkBet`/`WorkTask`/`WorkTeam` (`team-breadcrumb-back`, L257), `WorkBetCreate`, `WorkRoutine` → `/work` (all unconditional; the 1-team collapse is the `WorkOverview` chokepoint from task 2). Migrate their tests (AC6, AC7). *(dep: 3)*
6. **Delete dead code** — `WorkPortfolio.tsx`, `pages/work/portfolioFilters.ts`, `hooks/useBets.ts`. Delete the retired unit tests (Migrations §). Run `npm run check` + `npm run lint`/knip (AC9). *(dep: 4,5)*
7. **E2E migration** — grep `work/portfolio` + `work-portfolio-page` across `e2e/`, repoint; retire `AG2-portfolio-arrival`, migrate `R2-work-first-landing`; optional lean `work-overview.spec.ts`. Run local e2e (AC10 non-regression for Conversations/Knowledge). *(dep: 6)*
8. **Verify** — full `npm run test` green; snapshot net unaffected (no new catalog story beyond `WorkOverview.stories.tsx`, which adds to the baseline — re-bless + bump the `>=56` floor if the enumeration guard trips). Confirm Conversations/Knowledge protected tests untouched.

---

## protectedTests
```
packages/web/src/pages/__tests__/Conversations*.test.tsx
packages/web/src/__tests__/*Knowledge*.test.tsx
packages/web/src/components/__tests__/ThreadSections*.test.tsx
packages/design-system/src/__tests__/catalog-snapshot.test.tsx
```
(The Conversations/Knowledge overview tests and the snapshot net must not have their assertions weakened. The `WorkPortfolio.*` tests are explicitly NOT protected — they are retired.)

## sharedFiles
```
packages/web/src/router.tsx
packages/web/src/layouts/AppShell.tsx
packages/web/src/navigation/parentPathFor.ts
packages/web/src/shell/Sidebar.tsx
packages/design-system/src/__tests__/__snapshots__/catalog-snapshot.test.tsx.snap   (if WorkOverview.stories.tsx adds a catalog entry)
```

## Risks / ambiguities (for the reviewer)

1. **Large test/e2e migration surface (the dominant risk).** ~11 unit tests retired, ~12 migrated, ~30 e2e specs touched (mostly incidental path repoints). The builder must distinguish *retire* (asserts removed behavior) from *migrate* (asserts intent that survives, repointed to `/work`). Misclassifying a retire as a migrate re-introduces dead assertions; misclassifying a migrate as a retire drops coverage. The Migrations § lists each by name to prevent this.
2. **Snapshot enumeration floor.** Adding `WorkOverview.stories.tsx` to the catalog raises the story count; the `>=56` enumeration guard and the `.snap` baseline must be re-blessed in the same PR (read the diff first — never blind `-u`).
3. **`WorkOverview` story is a real catalog deliverable** (unlike the deleted AD9 variant sketch). It must render the four states and ship.
4. **Redirect vs direct-link consistency.** Internal callers go straight to `/work` (no redirect hop); the `/work/portfolio` redirect exists only for external/bookmarked links and any stray test. All internal emitters are now enumerated in Migrations § — including `WorkTeam.tsx:257` (`team-breadcrumb-back`), the callsite the prior plan missed. Confirm zero `/work/portfolio` in production `src` (excluding the redirect route + story stubs) after the pass.
5. **`work` path collision.** `work` is a new top-level child route; verify it doesn't shadow `work/team/:id` etc. (React Router v7 matches the more specific static/param segments first — `/work` matches only the exact `/work`; `/work/team/x` matches the deeper route). Low risk, but the router test (AC5) must assert both `/work` → overview AND `/work/team/:id` → team detail still resolve.
