# Architecture Critique: AG2 — Portfolio Arrival & Honest Filters

ARCHITECTURE-SCORE: 8/10  rounds=3  score-line: SA:8 LI:10 AC:9 DM:10 N:8 MD:8 FMC:8 S:8 V:8
ARCHITECTURE-SCORE-ROUND-2: 6/10  score-line: SA:8 LI:10 AC:9 DM:10 N:8 MD:8 FMC:7 S:8 V:5
ARCHITECTURE-SCORE-ROUND-1: 6/10  score-line: SA:7 LI:10 AC:9 DM:10 N:8 MD:8 FMC:6 S:8 V:4

Scored against the spec ACs, concept.md, approved design, and the actual codebase (`WorkPortfolio.tsx`, all seven `WorkPortfolio*` test files, R2/U9 e2e specs, `WorkTeam.tsx` breadcrumb). The plan's *technical shape* is sound — one file, three pure predicates, no schema/API churn, layer-clean. It loses on **Verifiability**: its protected-test enumeration is wrong against codebase reality (CC-007/CC-008), which is exactly the class of gap this critique exists to catch before code.

## CRITICAL
- **[plan §Test plan B + §Risks — protected-tests enumeration is incomplete and partly wrong (CC-008 / CC-007).** The plan names exactly two component test files: `WorkPortfolio.outcome.test.tsx` (correct path: `packages/web/src/pages/__tests__/`) and `WorkPortfolio.test.tsx` at `packages/web/src/pages/__tests__/` — **but that file does not exist at that path.** `WorkPortfolio.test.tsx` lives at `packages/web/src/__tests__/`. There are **seven** `WorkPortfolio*` test files, not two:
  - `packages/web/src/pages/__tests__/WorkPortfolio.outcome.test.tsx` (named)
  - `packages/web/src/__tests__/WorkPortfolio.test.tsx` (named, **wrong path in plan**)
  - `packages/web/src/__tests__/WorkPortfolio.AA1.test.tsx` (routine summary — **unmentioned**)
  - `packages/web/src/__tests__/WorkPortfolio.AB2.test.tsx` (agent summary — **unmentioned**)
  - `packages/web/src/__tests__/WorkPortfolio.cycle.test.tsx` (**unmentioned**)
  - `packages/web/src/__tests__/WorkPortfolio.L13.test.tsx` (drill-down nav, single-bet fixture — **unmentioned**)
  - `packages/web/src/__tests__/WorkPortfolio.j8.test.tsx` (empty/grid/loading — **unmentioned**)
  The contract "Existing portfolio tests updated, not deleted" cannot be honored if the plan doesn't know they exist. Most assert grid/empty/summary/nav (not filter presence) so they likely survive, but the builder must be told to run all seven and re-validate, not just two. **Fix:** replace the two-file list with the full seven-file enumeration above, marking which assert filter-presence (none currently do) vs which assert grid/empty/summary (all the rest), so the builder knows the blast radius.

- **[plan §Test plan D "Regression" — the R2 regression claim is false and unverified.** The plan asserts "Existing portfolio specs (U9, R2) … assert page presence and bet grid, not verdict-always-on, so they should be unaffected." **R2 is directly affected.** `R2-work-first-landing.spec.ts` (not skipped) asserts on the *empty-portfolio create affordance* — the exact surface AG2 rewrites — via `page.getByTestId("create-bet-cta")` and `page.getByRole("button", { name: /create bet/i })`. **Neither selector exists in the current `WorkPortfolio.tsx`** (the empty action is `data-testid="portfolio-empty"` with button text "New bet"; there is no `create-bet-cta`). So R2's CTA block is either already red on this branch or passing by some fixture accident — either way the plan's "unaffected" claim is unverified and almost certainly wrong. The approved design's empty CTA copy is "Create your first bet" (would match `/create bet/i`) but carries no `create-bet-cta` testid. **Fix:** the plan must (a) add R2 to the protected/affected e2e list, (b) decide whether the new empty CTA carries `data-testid="create-bet-cta"` and copy matching `/create bet/i` so R2 passes, or explicitly update R2's selectors, and (c) state R2's current pass/fail baseline before the change. Do not ship a plan that claims a directly-impacted spec is untouched.

## WARNING
- **[plan §3 Render structure vs approved design — body-branch disagreement.** The plan collapses the body to a two-way branch (`bets.length===0` → portfolio-empty; `filteredBets.length===0` → no-matches) and silently drops the existing **team-scoped empty copy** ("No bets for this team", current code lines 322-339). The approved design doesn't mention retiring it either. This is an undocumented behavior change to an existing branch. **Fix:** explicitly state that the team-scoped empty string is retired in favor of the unified "no matches / clear filters" state (recommended), or preserve it with defined precedence. Either is fine — but the plan must decide, not omit.
- **[plan §Test plan C — e2e entry-point #2 selector is correct but #1 is hand-waved.** Entry-from-team-screen uses `team-breadcrumb-back` — **verified present** in `WorkTeam.tsx:241` linking to `/work/portfolio` with text "← Portfolio". Good. But entry-from-sidebar ("click Work section header → /work/portfolio") names no selector and no fixture; the sidebar Work-header click target is unverified in the plan. **Fix:** name the sidebar selector (e.g. the nav item testid) so the e2e author isn't guessing.
- **[plan §Test plan C "LIFO route override" claim — inaccurate.** The plan cites U9's pattern as "LIFO route override." `U9-screen-layouts.spec.ts` sets `page.route("**/api/bets", …)` and `page.route("**/api/teams", …)` *before* `page.goto`, in a `beforeEach` — it is plain route registration, not a LIFO override stack. R2 uses `page.route` in `beforeEach` too. Minor, but the e2e author should copy the actual U9/R2 pattern, not an invented one. **Fix:** drop "LIFO route override," reference the concrete U9 `beforeEach` route-registration pattern.

## SUGGESTION
- **[plan §1 — resolve the "module vs top-of-file consts" indecision before red phase.** The plan leaves the predicate location as "decide in task 2" (colocated `portfolioFilters.ts` OR top-of-file exported consts). The test plan (§A) already commits to importing from `portfolioFilters.ts`. Commit to the module now — the unit tests depend on the import path and dangling the decision risks a red-phase rewrite. Pick the module.
- **[plan §1 — `showTeamFilter` has a latent double-gate.** Plan: `showTeamFilter = distinctTeamIds(bets).size >= 2` with an inline note "AND teams.length >= 2 for pill labels." Two different sources of truth (bets' distinct teamIds vs `useTeams()` length) can disagree (a team with zero bets inflates `teams.length` but not `distinctTeamIds`). The honest gate is `distinctTeamIds(bets).size >= 2` alone — pill labels resolve from `teams` but the gate must key off bet-distinct-teams only, or a single-team-with-bets portfolio could show team pills (dead chrome, AC-3 violation). **Fix:** state the gate is `distinctTeamIds(bets).size >= 2` exclusively; `teams` is only a label lookup.
- **[plan §Test plan A — `formatPortfolioCount` unit test is good but verify the pluralization fixture.** "N bet(s) · M team(s)" — ensure the test covers 1-bet-1-team (singular both) and 0 (the sub-line is suppressed at 0 per design, so `formatPortfolioCount` is never called at 0 — confirm the predicate, not the formatter, owns suppression).

## What's Working Well
- **Layer integrity is perfect (LI 10) and data-model is a non-event (DM 10):** one presentation file, zero schema/API/hook/shared-type changes, verdict vocabulary frozen — the plan correctly scopes this as pure presentation and resists inventing data work.
- **The status-bucket folding claim is verified accurate.** The plan's `distinctStatusBuckets` (completed+killed → one "Completed" bucket) matches the existing `filteredBets` logic exactly (code lines 98-102), and the plan flags the drift risk (§Risks) and the single-helper mitigation. That is precisely the kind of consistency reasoning that prevents a gate showing a control that can't distinguish — well caught by the architect.

---

# ROUND 2 — re-critique of revised architecture.md (commit e6c9039)

VERDICT: **REVISE** (one CRITICAL remains). Architecture re-score **6/10** (Verifiability 4→5, FMC 6→7, SA 7→8; one new CRITICAL replaces two resolved). Design unchanged at **8/10**.

## Resolutions verified against code

| Round-1 finding | Designer's resolution | Verification | Status |
|---|---|---|---|
| **CRITICAL-1** (test enum wrong/incomplete) | All 7 `WorkPortfolio*` files enumerated with exact paths + per-file update plan | `find` confirms exactly 7 files at the stated paths, incl. the two-directory split (`pages/__tests__/` vs `__tests__/`). Per-file blast-radius (only #1, #2 edited; #3–#7 verify-only) is accurate. | **RESOLVED** |
| **CRITICAL-2** (R2 baseline false/unverified) | R2 added to affected list; claims R2 CTA assertions currently RED on this branch base; new empty state emits `create-bet-cta` + `/create bet/i` to fix without editing R2 | **Baseline claim VERIFIED ACCURATE empirically.** Ran `R2 "Create bet CTA"` against branch base: **5 of 6 tests FAIL, 1 passes** (the "hidden when bets exist" trivially passes). Root cause traced: U9 (37e06caf) renamed the empty-state testid `create-bet-cta`→`portfolio-empty` in WorkPortfolio.tsx; U11 (#167) re-baselined other refs but missed R2's CTA block. So R2's CTA assertions reference a testid the page no longer emits — the "currently red" claim is true. **BUT the fix is only half-correct — see CRITICAL-3 below.** | **PARTIALLY RESOLVED** |
| **WARNING-arch-1** (team-scoped empty collision) | Retire "No bets for this team"; pin two empty states with a table | `grep` confirms NO test asserts the string (only WorkPortfolio.tsx itself); cycle/j8 assert only `portfolio-empty` testid (preserved). Retirement **safe**. Mirrored in design candidate §Body. | **RESOLVED** |
| **WARNING-arch-2** (sidebar selector hand-waved) | `[data-section-header="work"]` cited, `Sidebar.tsx:140` | Verified: `Sidebar.tsx:140` emits `data-section-header={view}` on a `<button>` firing `onViewChange`. Selector valid; SPA-view-switch (not href) correctly noted. | **RESOLVED** |
| **WARNING-arch-3** (LIFO route claim inaccurate) | Dropped "LIFO override," cites real U9/R2 `beforeEach` page.route pattern | Plan §Test plan C now describes plain registration + cites concrete line ranges. Accurate. | **RESOLVED** |
| **WARNING-design-1** (AC-3 zone honesty) | Recorded as accepted interpretation in design candidate §AC-3 (lines 33–40) | Present and explicit; Phase-4 instructed not to re-litigate. | **RESOLVED** |

## CRITICAL (new — blocks approval)

- **[CRITICAL-3] [plan §3 line 54, §Test plan D line 131; design candidate line 54] — the R2 fix is HALF-WRONG: CTA copy "Create your first bet" does NOT match `/create bet/i`, so 3 of the 5 red R2 tests stay RED.** Both the architecture plan and the design candidate assert *"the copy 'Create your first bet' satisfies `/create bet/i`."* **This is false.** Playwright's `getByRole(..., {name: /create bet/i})` runs `RegExp.test()` against the accessible name; `/create bet/i.test("Create your first bet") === false` (verified) — the words "your first" sit between "Create" and "bet", breaking the required adjacency. R2's CTA block has **two distinct assertion families**:
  - `getByTestId("create-bet-cta")` — lines 221, 304. **Fixed** by emitting the testid. ✓
  - `getByRole("button", { name: /create bet/i })` — lines 230, 239, 251, 265 (3 tests: "button is inside the CTA", "opens dialog", "no product selector", "no appetite fields"). **NOT fixed** — copy "Create your first bet" fails the regex. ✗
  Emitting only the testid turns ~2 of the 5 red tests green; the 3 `/create bet/i` button-name tests stay RED, and `npm run test:e2e`/verify will fail. **The plan ships a verified-false claim as its CRITICAL-2 resolution** — the exact unverified-baseline class this critique exists to catch. **Fix (pick one, state it in both docs):** (a) change the empty-state CTA accessible name to literally contain "create bet" adjacent (e.g. **"Create bet"** — note "Create a bet" ALSO fails the regex, only "create bet" with no intervening words passes); OR (b) explicitly update R2's 4 `/create bet/i` selectors (contradicts the "don't edit R2" stance and the clean-main posture). Recommend (a): set the primary CTA label to "Create bet" (or keep "Create your first bet" as display copy but ensure the *accessible name* the role query sees is "create bet" — not viable without an aria-label hack; simplest is the literal label "Create bet"). Until the copy is pinned to satisfy `/create bet/i`, CRITICAL-2 is NOT resolved.

## SUGGESTION (non-blocking, carried from round 1)

- **[plan §1 line 26] `showTeamFilter` double-gate still present.** Line 26 retains the `// AND teams.length >= 2 for pill labels` comment — the two-source-of-truth (bets' distinct teamIds vs `useTeams()` length) I flagged in round 1. A zero-bet team inflating `teams.length` could surface team pills on a single-team-with-bets portfolio (dead chrome, AC-3). The §A unit test keys off `distinctTeamIds(bets)` only, so a wrong impl would be caught — but the plan text stays ambiguous. State the gate is `distinctTeamIds(bets).size >= 2` exclusively; `teams` is label-lookup only.
- **[plan §1 line 39 vs §tasks line 139] predicate-module indecision lingers.** Line 39 still says "Decide in task 2"; task 1 (line 139) commits to `portfolioFilters.ts`. The operative task list resolves it, but the §1 hedge should be deleted for a clean red phase.

## What improved

The 7-file enumeration, R2 affected-list addition, two-empty-state pin, and selector/pattern citations are all real, verified fixes — Verifiability climbs 4→5. The plan now knows its blast radius precisely. The one remaining gap is a copy-string regex mismatch that the designer reasoned about but did not execute (the `/create bet/i` adjacency) — a single-token fix, but load-bearing for e2e green, hence CRITICAL not WARNING.

---

# ROUND 3 — final re-critique of revised architecture.md + approved-candidate.md (commit 8996478)

VERDICT: **APPROVED.** Architecture re-score **8/10** (Verifiability 5→8, FMC 7→8 — last false-claim removed; the plan's blast radius and R2 contract are now empirically exact). Design unchanged at **8/10** (no material design change; the copy-string fix is contract-text, not direction). This is the final round; no blocking findings remain.

## Resolutions verified empirically

| Round-2 finding | Designer's resolution | Verification | Status |
|---|---|---|---|
| **CRITICAL-3** (CTA copy "Create your first bet" does NOT match `/create bet/i`) | Both `architecture.md` (§3 line 54, §4 task line 142, §test-plan-D table) and `approved-candidate.md` (§Body lines 52, 54) pin the button's accessible name to the literal label **"Create bet"**; "Create your first bet" demoted to non-button pitch prose only. | Ran `/create bet/i.test(...)`: **"Create bet" → true**, **"Create your first bet" → false**, **"Create a bet" → false**. Confirmed both docs assert ONLY "Create bet" as the button/accessible name, and explicitly flag the two failing variants as non-button copy. No surviving claim that "Create your first bet" is the button name. The R2 contract (`create-bet-cta` testid + `/create bet/i` accessible name) is now satisfiable by the documented impl. | **RESOLVED** |
| **NIT-1** (`showTeamFilter` double-gate comment) | arch line 26 comment rewritten | Now reads: `gate keys off distinctTeamIds(bets) ONLY; \`teams\` is a label lookup, never part of the gate`. The `teams.length >= 2` second source-of-truth is gone. Single honest gate. | **RESOLVED** |
| **NIT-2** ("Decide in task 2" predicate-module hedge) | arch §1 line 39 rewritten | Now: module path `packages/web/src/pages/work/portfolioFilters.ts` committed as task 1, "the location is fixed, not deferred." No hedge remains; matches §A test import path and §tasks line 139. | **RESOLVED** |

## Note (non-finding)

`portfolioFilters.ts` does not yet exist on disk — correct for pre-implementation Phase 2. The commit message's "commit predicate module" refers to resolving the doc-level location indecision, not landing source. The module is a task-1 deliverable for Phase 4.

## Final scores

- **Architecture: 8/10** — SA:8 LI:10 AC:9 DM:10 N:8 MD:8 FMC:8 S:8 V:8. Layer-clean single-file presentation change, exact 7-file blast radius, empirically-verified R2 contract, two pinned empty states, honest per-control + zone-level gates. Verifiability now full — every "unaffected"/"satisfies" claim in the plan has been checked against code and regex truth.
- **Design: 8/10** — unchanged. H:9 S:9 T:8 C:8 Co:9 St:9 A:7 AS:9 PP:7. Variant A (persistent frame, docking honest filters) blessed in `design/approved.md`.
