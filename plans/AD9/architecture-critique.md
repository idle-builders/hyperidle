# Architecture Critique: AD9

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:6 LI:10 AC:8 DM:10 N:9 MD:9 FMC:8 S:9 V:8

The plan is disciplined, well-reasoned, and contract-grounded on every dimension except **Spec Alignment**, where one genuine spec/plan contradiction (the 1-team landing destination) and one missing migration callsite drag the score. Both are concretely fixable in the plan before `/write-tests`. Data-model, layer integrity, simplicity, and the test retire/migrate classification are all verified correct against the codebase.

## Verification performed

- **Data source (no new endpoint).** `TeamListItem` (`packages/shared/src/team.ts:100-113`) carries `status` (via `TeamSummary`), `phase`, `activeBets`, `progress{done,total}`, `agentCount`, `activeAgentCount`, `agentHealthWarning`, `routineCount`. `useTeams()` already fetches it. The plan's central claim — usable per-row status with zero data-model/endpoint change — is **TRUE**. (DM:10)
- **`StatusChip` 1:1.** `Status` (`StatusChip.tsx:4`) = healthy|behind|blocked|paused|done|error ⊇ `TeamStatus`. Pass-through is type-safe. ✓
- **handleViewChange 1-team branch.** `AppShell.tsx` confirmed: 1 team → `/work/team/:id`; else → `/work/portfolio` (the branch the plan repoints to `/work`). ✓
- **Test classification (the dominant risk).** Spot-checked both buckets against source:
  - Retire `WorkPortfolio.outcome.test.tsx` — asserts verdict filter pills (removed). Correctly retired. ✓
  - Retire `useBets.test.ts` — tests the hook feeding the deleted grid. Correctly retired. ✓
  - Migrate `FirstRunRedirect.R2.test.tsx` — asserts post-setup landing *target*; intent survives, repoint string. Correctly migrate. ✓
  - Migrate `AG4-parentPathFor.test.ts` — asserts parent paths; intent survives, repoint. Correctly migrate. ✓
  - The retire-vs-migrate split is **sound**: retires assert removed behavior (grid/filters/useBets), migrates assert surviving intent (landing/parent/route) repointed to `/work`. No misclassification found.
- **Dead-code deletion safety.** `useBets` / `portfolioFilters` consumers confirmed = only `WorkPortfolio` + `portfolioFilters` (+ comment references in `WorkBetCreate.tsx`, `ArtifactSection.tsx` which the plan correctly treats as comment-only). Deletion is safe; knip will catch any survivor. ✓
- **Layer integrity.** Pure `packages/web` routing + read-only list render. No layer reach. (LI:10)
- **Security block.** Every STRIDE class marked N/A with a defensible reason (no new write/input/path/URL surface). Correct for a read-only routing change. (FMC strong.)

## CRITICAL

- **[plan §AC6 + §Migrations + §Route-checklist — spec contradiction on the 1-team landing destination]**
  The spec's validation scenarios are explicit:
  - Scenario 1: "new user completing setup with **1 team** → browser navigates to **`/work/team/:teamId`**."
  - Scenario 3: "navigating to `/work/portfolio` → **redirected to their first team's page**."
  - AC: "After setup, the user lands on **their team's Work page, not a portfolio grid**."

  The plan routes the single-team case to the **overview**, not the team page:
  - AC6: FirstRunRedirect `hasUser && hasTeams` → `/work` (unconditional).
  - AC6: SetupFlow success → `/work?onboarding=true`.
  - AC5 / Route-checklist: `/work/portfolio` → `<Navigate to="/work" replace>` (the overview, for everyone).

  SetupFlow always creates exactly one team during onboarding, so the common post-setup path lands a 1-team user on a **1-row `/work` overview list** — which the concept itself calls "noise" (AD3 exception: "1 team → skip the overview"). This is a direct contradiction of BOTH the spec validation scenarios AND the concept's own AD3 rule. The `handleViewChange` sidebar path handles the 1-team shortcut, but FirstRunRedirect, SetupFlow, and the `/work/portfolio` redirect do **not** — and `WorkOverview.tsx` has no 1-team redirect branch (its state contract is loading/error/empty/populated only).

  **Fix (pick one and pin it in the plan):**
  (a) Make `FirstRunRedirect` and `SetupFlow` apply the same 1-team shortcut they already encode in `handleViewChange` — target `/work/team/:onlyId` when `teams.length === 1`, else `/work`; OR
  (b) Give `WorkOverview` itself a 1-team short-circuit (`teams.length === 1 → <Navigate to="/work/team/:id" replace>`) so every entry path (landing, redirect, bookmark, breadcrumb) collapses to the team page uniformly — this is the cleaner single chokepoint and the one I recommend, and it also closes the design-critique WARNING about a 1-team user reaching `/work` by a non-sidebar route.
  Then update AC5 (the `/work/portfolio` redirect must resolve to the team page for 1-team users to satisfy spec scenario 3) and AC6's asserted targets, and add an AC for the 1-team `/work` short-circuit.

## WARNING

- **[plan §Migrations — missing callsite: `WorkTeam.tsx:257`]** `WorkTeam.tsx` has a breadcrumb `{ label: "Work", to: "/work/portfolio", testId: "team-breadcrumb-back" }`. The Migrations § enumerates `WorkBet.tsx` and `WorkTask.tsx` breadcrumbs but **omits `WorkTeam.tsx`**. Left unrepointed, this is a live internal `/work/portfolio` → redirect hop, violating the plan's own risk #4 ("Confirm no internal caller still emits `/work/portfolio`"). Add `pages/WorkTeam.tsx` (L257) → `to: "/work"` to the reroute list and add `team-breadcrumb-back` to the route-asserting test migrations.
- **[plan §Migrations — story-file route mounts unenumerated]** `WorkTeam.stories.tsx:69` and `SetupFlow.stories.tsx:16` mount a `<Route path="/work/portfolio">` stub. Not user-facing and harmless to leave, but they reference a path the plan claims to retire everywhere. Either repoint them to `/work` for consistency or note them as intentionally-left story stubs so the builder's grep-and-repoint pass (task 7) doesn't flag them as misses.
- **[plan §AC9 — grep gate is a script, not a test]** AC9 verifies "zero `WorkPortfolio`/`portfolioFilters`/`useBets` imports" via grep. Per CLAUDE.md "Validation Before Implementation," a static-codebase property should be enforced by knip / TS, not a grep gate masquerading as verification. The plan does also cite `npm run check` + knip, which is the right mechanism — drop the grep framing or label it a one-off confirmation, not an AC verification method. Minor.

## SUGGESTION

- **[plan §Migrations — `AG4-parentPathFor.test.ts:44`]** That test asserts `parentPathFor("/work/portfolio")` returns `null`. After AD9, `/work/portfolio` is only a redirect; the plan repoints the three `/work/portfolio` *returns* but doesn't say what happens to this `null`-case assertion (does `parentPathFor` keep a `/work/portfolio` arm at all?). Spell out whether the `/work/portfolio` input case is dropped or kept-as-null in the migration so the builder doesn't guess.
- **[plan §Risks #5 — route shadowing]** Good catch on `work` vs `work/team/:id`; the AC5 router test already covers both resolutions. Keep that assertion explicit (both `/work`→overview AND `/work/team/:id`→detail in the same test) — it's the cheap guard against a React Router v7 matching surprise.
- **[plan §Task 2 / Snapshot]** The plan correctly flags the `>=56` enumeration floor must bump when `WorkOverview.stories.tsx` is added (current count is exactly 49 + 7 = 56, so a new story trips the guard). Ensure the `.stories.tsx` renders the empty/loading/error/populated states so the snapshot net + the design empty-state copy are not dead (pairs with the design-critique WARNING).

## What's Working Well

- **The test retire-vs-migrate classification is the high-risk surface and the plan nailed it.** Naming each file by bucket, with the retire/migrate distinction grounded in "asserts removed behavior" vs "asserts surviving intent," is exactly the discipline that prevents both dead-assertion reintroduction and silent coverage loss. Spot-checks confirm the classification is correct.
- **Design-it-twice is genuine, not theatre.** Option 2 (rename-in-place at `/work/portfolio`) is a real alternative with a real rejection reason (concept hard rule: "portfolio" must not survive in any user-facing path). The plan didn't straw-man it.
- **Scope discipline.** "No data-model change, no new endpoint, no new query" is stated, justified against the actual `TeamListItem` shape, and held throughout. The plan resists every temptation to add a cross-team aggregation the spec deferred.

## Re-score (round 2, amended plan)

**Verdict: both prior findings cleanly resolved; no new CRITICAL.** ARCHITECTURE-SCORE: 9/10 rounds=2.

The CRITICAL (1-team landing contradiction) is fixed at the single chokepoint I recommended (option b): a new §"The 1-team short-circuit" + AC11 put the sole `teams.length===1 → <Navigate to="/work/team/:id" replace>` branch inside `WorkOverview`, ordered between error and empty in the state contract and the type signature. All redirect sites (FirstRunRedirect, SetupFlow, `/work/portfolio` route, breadcrumbs) are now unconditional `/work`, so every entry path collapses through one branch — hole-free, including bookmarked `/work` and the previously-leaky non-sidebar routes. AC5 (1-team `/work/portfolio` resolves through to the team page) and AC6 (unconditional `/work` landing, collapse delegated to AC11) are updated to match spec scenarios 1 & 3, and multi-team (2+) users correctly keep the `/work` overview. The WARNING (`WorkTeam.tsx:257` `team-breadcrumb-back`) is now in the Migrations reroute list (L154), task 5, and risk #4, with its test consequences spelled out (`WorkTeam.AG1.test.tsx` presence-only/no-change, `WorkProduct.test.tsx` href repoint). Builder may proceed.
