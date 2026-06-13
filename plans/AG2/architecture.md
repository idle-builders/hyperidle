# AG2 Architecture — Portfolio Arrival & Honest Filters

Plan to implement the approved design (`plans/AG2/design/approved-candidate.md`). Pure presentation/visibility change in one page component; no schema, API, or hook changes. Verdict vocabulary and outcome-recording flow are frozen (contract).

## Scope of change
- **One production file edited:** `packages/web/src/pages/WorkPortfolio.tsx`.
- **No changes to:** `useBets.ts`, `useTeams.ts`, `/api/bets`, `/api/teams`, `BetCard`, `BetCreateDialog`, design-system components, DB, shared types.
- **Component budget:** zero new components.
- **AG5 boundary:** keep existing inline pill/segmented controls; do not introduce a new dropdown primitive (AG5 owns that later).

---

## 1. Derived-visibility model (the core)

Today every control is gated on `bets.length > 0`. Replace with three pure predicates over the bet list, memoized so render and tests share one source of truth.

```ts
// Computed in WorkPortfolio via useMemo over `bets`.
// "Completed" bucket folds completed + killed (matches existing filter semantics).

function distinctStatusBuckets(bets: BetListItem[]): Set<StatusFilter> // excludes "all"
function distinctTeamIds(bets: BetListItem[]): Set<string>
function hasAnyRecordedOutcome(bets: BetListItem[]): boolean   // some(b => b.outcomeVerdict != null)

const showStatusFilter  = distinctStatusBuckets(bets).size >= 2;
const showTeamFilter    = distinctTeamIds(bets).size >= 2;       // gate keys off distinctTeamIds(bets) ONLY; `teams` is a label lookup, never part of the gate
const showVerdictFilter = hasAnyRecordedOutcome(bets);
const showFilterZone    = showStatusFilter || showTeamFilter || showVerdictFilter;
```

**Honesty enforcement (AC-3 "every control shown can change the result set"):**
- Each control's render is gated on its predicate. A control is *structurally absent* unless its predicate is true.
- `showVerdictFilter` gates on recorded-outcome existence, NOT on `bets.length` — this is the founder's complaint fixed and the one non-obvious gate (verdict presence = bet lifecycle stage, not bet existence).
- The verdict pill *list* still shows all four verdicts + "Not evaluated" once the zone is active (vocabulary completeness; zone-level honesty already satisfied).
- The filter zone row is omitted entirely when `showFilterZone === false` — no empty bar (no dead chrome).

These predicates are the testable seam: extract them as **module-level pure functions** (exported for unit test) rather than inline expressions, so component tests and pure unit tests both assert on them.

> Extract to a small colocated module `packages/web/src/pages/work/portfolioFilters.ts` exporting the three predicates + `formatPortfolioCount`. This is committed (task 1) — the §A unit tests import from this module path, so the location is fixed, not deferred. Component render imports the same functions; one source of truth.

## 2. State & reset

Existing state stays: `statusFilter`, `selectedTeamId`, `activeVerdictFilters: Set<string>`, `dialogOpen`.

Add: **`clearFilters()`** — resets `statusFilter→"all"`, `selectedTeamId→null`, `activeVerdictFilters→new Set()`. Used by the empty-result-set "Clear filters" action. Atomic (one handler, three setters).

`filteredBets` memo is unchanged in logic (status + team + verdict narrowing already correct in current source, lines 91–118). The combine-predictably behavior (AC-5) already holds — verified by existing `WorkPortfolio.outcome.test.tsx` + the team/status filter tests.

## 3. Render structure (replaces lines 152–296 header + 299–378 body)

- **Header row 1:** title (always) + count sub-line (`bets.length > 0`) + existing routine/agent summary spans (their own gates, unchanged) + "New bet" `btn-primary` (**always present**, including zero — frame invariant). The current code only renders the "New bet" header button when `bets.length > 0` (lines 286–295); this gate is **removed** so the button is unconditional.
- **Header row 2 (filter zone):** rendered iff `showFilterZone`. Inside, each control rendered iff its own predicate. `mt-[12px] flex items-center gap-[12px] flex-wrap`.
- **Body:** two-way branch (the third "team-scoped empty" branch is **retired** — see WARNING-arch-1 decision below):
  - `bets.length === 0` → **portfolio-empty** state: EmptyState (onboarding pitch), `data-testid="portfolio-empty"`. The primary CTA button **must** carry `data-testid="create-bet-cta"` and its accessible name (button label) **must be literally `"Create bet"`** — NOT "Create a bet", NOT "Create your first bet" (those break the adjacency `/create bet/i` requires; verified `/create bet/i.test("Create your first bet") === false`). The surrounding pitch prose may say "Create your first bet" as non-button copy, but the button label is `"Create bet"` (R2 contract — see CRITICAL-2/CRITICAL-3).
  - `bets.length > 0 && filteredBets.length === 0` → **filter-excluded-empty** state: EmptyState "No bets match these filters" + ghost "Clear filters" (`data-testid="portfolio-no-matches"`). Covers ALL filter-excluded cases, including a team filter that excludes all.
  - else → existing BetCard grid (`data-testid="bet-grid"`).

Count sub-line helper: `formatPortfolioCount(bets)` → `"N bet(s) · M team(s)"` using `distinctTeamIds(bets).size`. Pure, unit-testable.

### WARNING-arch-1 decision — three-way empty collision resolved to TWO states

Current code (lines 322–339) has a `selectedTeamId ? "No bets for this team" : "No bets yet"` branch *inside* the single `filteredBets.length === 0` block — a third empty meaning that collides with the new filter-excluded state. **Decision: retire the team-scoped empty copy.** A team filter that excludes all bets is semantically a *filter-excluded* result, not a distinct "this team is empty" condition. Pin exactly two empty states:

| State | Trigger | Copy | Action | testid |
|---|---|---|---|---|
| **portfolio-empty** | `bets.length === 0` | "No bets yet" + onboarding pitch | primary CTA, button label literally **"Create bet"** (`create-bet-cta`) | `portfolio-empty` |
| **filter-excluded-empty** | `bets.length > 0 && filteredBets.length === 0` | "No bets match these filters" | "Clear filters" (ghost, atomic reset) | `portfolio-no-matches` |

The string "No bets for this team" and the `selectedTeamId ? … : …` conditional in the empty block are **deleted**. Verified safe against all seven test files: `WorkPortfolio.{cycle,j8}.test.tsx` assert only `getByTestId("portfolio-empty")` presence (testid preserved); no test asserts the "No bets for this team" string. This decision is mirrored in `design/approved-candidate.md`.

## 4. Tokens / AQ
- Spacing on-grid only (`12/18/24`). Type from scale (`20/13/12`). Reuse existing accent tint literals already in the file (do NOT add new hex — AQ-008). Motion `--motion-default`, opacity/transform only, reduced-motion honored (AQ-013/14). 44px touch targets at ≤1024px (AQ-015) — existing pills already meet via py padding; verify in visual pass.
- The docking entrance (opacity+translateY) is optional polish; if added, use a `motion-reduce:` Tailwind guard. Not required for AC pass.

---

## Test plan — covers every AC

Existing tests **updated, not deleted** (contract). The behavior they assert changes: verdict pills no longer appear merely because a bet exists.

### A. Pure unit tests — `packages/web/src/pages/work/__tests__/portfolioFilters.test.ts` (new)
Imports the extracted predicates.
- `hasAnyRecordedOutcome`: false for `[]`, false for all-null-verdict bets, true when any `outcomeVerdict` set. **(AC-2 core)**
- `distinctStatusBuckets`: size 1 for all-active, size 2 when active+completed, killed folds into completed bucket. **(AC-3 status gate)**
- `distinctTeamIds`: 1 vs ≥2. **(AC-3 team gate)**
- `formatPortfolioCount`: pluralization + team count.

### B. Component tests — the SEVEN protected `WorkPortfolio*` test files (CRITICAL-1)

Contract: "Existing portfolio tests updated, not deleted." Glob-verified actual inventory (paths confirmed against the repo — note **two distinct directories**):

| # | File (actual path) | What it asserts | Filter-presence? | Update needed |
|---|---|---|---|---|
| 1 | `packages/web/src/pages/__tests__/WorkPortfolio.outcome.test.tsx` | verdict pills + `outcomeVerdict` filtering (1× `verdict-filter-pills`, 8× `outcomeVerdict`, status filter use) | **YES (verdict)** | **UPDATE** — split into "no recorded outcome → no `verdict-filter-pills`" (new red test, AC-2) + "≥1 outcome → pills present, click narrows" (existing, re-fixtured under a with-outcomes mock). `MOCK_BETS_WITH_OUTCOMES` already has an evaluated bet so the positive case survives. |
| 2 | `packages/web/src/__tests__/WorkPortfolio.test.tsx` | `work-portfolio-page`, h2 "All bets", `bet-grid`, `new-bet-btn`, `portfolio-empty`, dialog open. (`status` hits are fixture data props, **not** status-filter assertions.) | No | **UPDATE** — `new-bet-btn` test currently relies on bets existing; ensure it also passes at zero bets (frame invariant). Empty-state test must keep `portfolio-empty` testid. Add `create-bet-cta` assertion if folded in (optional; e2e R2 owns it). |
| 3 | `packages/web/src/__tests__/WorkPortfolio.AA1.test.tsx` | routine summary spans (18× routine, 9× summary) | No | **VERIFY only** — routine summary gates unchanged; re-run. No edit expected. |
| 4 | `packages/web/src/__tests__/WorkPortfolio.AB2.test.tsx` | agent summary spans (49× agent, 26× summary) | No | **VERIFY only** — agent summary gates unchanged; re-run. No edit expected. |
| 5 | `packages/web/src/__tests__/WorkPortfolio.cycle.test.tsx` | `portfolio-empty` present, no `cycle-stripe`, no `team-card` | No (empty-state) | **VERIFY only** — asserts `portfolio-empty` testid (preserved). Does NOT assert "No bets for this team" string, so the WARNING-arch-1 retirement is safe. Re-run. |
| 6 | `packages/web/src/__tests__/WorkPortfolio.L13.test.tsx` | bet-card click navigates to `/work/bet/:id` (`bet-grid`, `work-bet-page`) | No (nav) | **VERIFY only** — single-bet fixture, grid + nav unaffected. Re-run. |
| 7 | `packages/web/src/__tests__/WorkPortfolio.j8.test.tsx` | empty (`portfolio-empty`), no `team-card`, populated (`bet-grid`) | No (empty/grid) | **VERIFY only** — testids preserved. Re-run. |

**Blast radius:** only #1 and #2 require edits. #3–#7 are verify-and-rerun (no current assertion keys off verdict-always-on or the team-scoped empty string). The builder MUST run all seven, not two. New AC-2 red proof lives in #1.

Render via existing mock pattern (`vi.mock` useBets/useTeams).
- **AC-1:** zero bets → `portfolio-empty` present, create CTA present, header `new-bet-btn` present, NO `verdict-filter-pills`, NO status/team controls. *(updates existing "shows empty state" test.)*
- **AC-2 (the headline fix):** bets all with `outcomeVerdict: null` → `verdict-filter-pills` NOT in document; status/team controls present iff their gate passes. **New assertion — today's code fails this** (this is the red test that proves the bug-fix).
- **AC-2 inverse:** ≥1 bet with recorded verdict → `verdict-filter-pills` present; clicking "Refuted" narrows set. *(existing outcome tests, now gated — keep them but move under a "≥1 outcome" fixture; the existing `MOCK_BETS_WITH_OUTCOMES` already has b1 validated so the suite stays valid.)*
- **AC-3:** single-team + single-status fixture → neither team nor status control rendered (no dead chrome). Two-team fixture → team pills rendered.
- **AC-4:** structural — title `h2` + `new-bet-btn` present in BOTH zero-bet and populated fixtures (same selectors resolve in both renders). Asserts the frame invariant.
- **AC-5:** team filter + status filter active together → only bets matching both shown. *(existing combine test — keep.)*
- **Empty-result-set:** populated bets + a verdict filter that excludes all → `portfolio-no-matches` present, `portfolio-empty` absent, "Clear filters" resets and restores grid.

### C. Playwright visual journey — `packages/web/e2e/AG2-portfolio-arrival.spec.ts` (new)
Desktop width (set viewport `{ width: 1440, height: 900 }`).

**Route-registration pattern (WARNING-arch-3 — use the real U9/R2 pattern):** register all `page.route("**/api/…", handler)` calls inside `test.beforeEach`, *before* `page.goto`. This is plain registration — Playwright matches the most-recently-registered handler for overlapping globs, but the spec does not rely on stacking. Concretely: `U9-screen-layouts.spec.ts` registers `page.route("**/api/teams", …)` + `page.route("**/api/bets", …)` in a `beforeEach` then `goto("/work/portfolio")` (lines 136–159). `R2-work-first-landing.spec.ts` registers `page.route("**/api/bets/canvas", …)` + `page.route("**/api/artifacts**", …)` in its `beforeEach`. Copy this exact shape — do NOT invent a "LIFO route override stack." Mock `/api/bets` + `/api/teams` (and `/api/bets/canvas` + `/api/artifacts**` if the page hits them) per these specs. Three data fixtures: empty, unevaluated (bets, no outcomes), evaluated (≥1 recorded outcome).
- **Entry from sidebar (WARNING-arch-2 — exact selector):** the sidebar Work entry is the SectionHeader button `[data-section-header="work"]` (verified `Sidebar.tsx:218,284`, rendered by `SectionHeader`, lines 133–161). It is a `<button>` that fires `onViewChange("work")` (SPA view switch, not an `href`). E2E: `await page.locator('[data-section-header="work"]').click()` then assert URL `/work/portfolio` and `getByTestId("work-portfolio-page")` visible. (There is no nav-link `to="/work/portfolio"` in the sidebar; the Work-header click is the entry point.) Screenshot.
- **Entry from team screen:** goto a team page, click `team-breadcrumb-back` (verified `WorkTeam.tsx:240–244`, `<Link to="/work/portfolio" data-testid="team-breadcrumb-back">← Portfolio</Link>`) → lands on portfolio. Screenshot. *(Both entry points per AC-6.)*
- **Empty state:** empty fixture → screenshot `ag2-portfolio-empty.png`; assert no `verdict-filter-pills`, no status tabs, `portfolio-empty` + create CTA visible. **(validation scenario 1)**
- **Unevaluated state:** 3 bets no outcomes spanning 2 teams → screenshot `ag2-portfolio-unevaluated.png`; assert team filter present, status present if ≥2 statuses, `verdict-filter-pills` absent. **(validation scenario 2)**
- **Evaluated state:** ≥1 recorded outcome → screenshot `ag2-portfolio-evaluated.png`; assert `verdict-filter-pills` present; click a verdict, assert grid count changes. **(validation scenario 3)**
- All three screenshots reviewed for zero AQ hard-rule violations (track proof bar).

### D. Regression — affected e2e specs (CRITICAL-2)

| Spec | Status | Current baseline vs AG2 | Action |
|---|---|---|---|
| `U9-screen-layouts.spec.ts` | active | Asserts `/work/portfolio` page presence, bet grid, team pill filters. Does NOT key off verdict-always-on or the team-scoped empty string. Unaffected. | Re-run to confirm green. |
| `R2-work-first-landing.spec.ts` | **active — DIRECTLY AFFECTED** | The "WorkPortfolio — Create bet CTA (R2 AC7)" block asserts the **empty-portfolio create affordance** via `page.getByTestId("create-bet-cta")` and `page.getByRole("button", { name: /create bet/i })` (verified, spec lines ~190–230). **Neither selector exists in the current `WorkPortfolio.tsx`** — today's empty action is `data-testid="portfolio-empty"` with button text "New bet"; there is no `create-bet-cta` and no `/create bet/i` button. So R2's CTA block is currently **failing (red) on this branch** unless masked by a fixture. R2 also mocks `/api/bets/canvas` + `/api/artifacts**` (not `/api/bets`) and asserts the CTA is *hidden* when a bet exists. | See decision below. |

**CRITICAL-2/3 decision (recommended path taken):** AG2's new **portfolio-empty** state carries `data-testid="create-bet-cta"` on the EmptyState wrapper (or its action region) and the primary CTA button's accessible name is the literal label **`"Create bet"`** — which satisfies `/create bet/i` (adjacency holds). "Create your first bet" and "Create a bet" both FAIL the regex (intervening words break adjacency); the button label must be exactly `"Create bet"`. This makes R2's three CTA assertions PASS rather than requiring R2 selector edits. The R2 "CTA hidden when bets exist" assertion already holds because the empty state (and thus `create-bet-cta`) only renders at `bets.length === 0`. R2's `header new-bet-btn` is separate and unaffected. **This is a design contract** — documented in `design/approved-candidate.md` so Phase 4 enforces both `create-bet-cta` and `/create bet/i`. AG2 does NOT edit R2; it makes R2 green by emitting the contract selectors.

Run order: `npm run test` (component/unit green) → `npm run test:e2e` (new AG2 spec + R2 + U9 all green) → `npm run verify` before ship.

---

## Ordered implementation tasks

1. **Extract predicates** → `packages/web/src/pages/work/portfolioFilters.ts`: `hasAnyRecordedOutcome`, `distinctStatusBuckets`, `distinctTeamIds`, `formatPortfolioCount`. Pure, exported, explicit return types.
2. **Red — unit tests** (test plan A) against the new module. Run, confirm fail/author.
3. **Red — component tests** (test plan B, all seven files): update `WorkPortfolio.outcome.test.tsx` (#1) to gated structure ("no outcomes → no verdict pills" + "with outcomes → pills"); update `WorkPortfolio.test.tsx` (#2) so `new-bet-btn` passes at zero bets + keep `portfolio-empty`; verify #3–#7 (AA1/AB2/cycle/L13/j8) still green unedited. Confirm the AC-2 "no verdict pills when no outcomes" test FAILS against current code (proves the bug).
4. **Green — edit `WorkPortfolio.tsx`:** wire predicates, gate each control on its predicate, make "New bet" header button unconditional (remove the `bets.length > 0` gate at lines 286–295), add count sub-line, add filter-zone wrapper omitted when empty. **Empty block:** delete the `selectedTeamId ? "No bets for this team" : …` conditional (WARNING-arch-1); render exactly two states — portfolio-empty (with `data-testid="create-bet-cta"` + CTA button label literally `"Create bet"` per CRITICAL-2/3) and filter-excluded-empty (`portfolio-no-matches` + `clearFilters`). Make component tests pass.
5. **Stories:** update `WorkPortfolio.stories.tsx` to render empty / unevaluated / evaluated / no-match states so `/designsystem` shows all four.
6. **Red+Green — E2E:** author `AG2-portfolio-arrival.spec.ts` (test plan C), run `test:e2e`, capture screenshots.
7. **Visual review:** inspect the three screenshots against `.claude/rules/aesthetic-quality.md`; fix any AQ violation in TSX.
8. **Verify:** `npm run check` + `npm run lint` + `npm run test` + the new e2e green, then `npm run verify`.

## Risks / notes
- The existing `WorkPortfolio.outcome.test.tsx` mock fixture (`MOCK_BETS_WITH_OUTCOMES`) already contains an evaluated bet, so its verdict-pill assertions remain valid once gated — minimal churn. The *new* failing test is the "all-null-verdict → no pills" case, which is the AC-2 proof.
- Status-bucket folding (completed+killed→"Completed") must be consistent between `distinctStatusBuckets` and the existing `filteredBets` logic, or the gate could show a control that can't actually distinguish. Single helper avoids drift.
- `prefers-reduced-motion` must wrap any docking transition; absence of the transition is acceptable for AC pass.
