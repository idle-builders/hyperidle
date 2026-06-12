# AG2 Approved Design — Portfolio Arrival & Honest Filters

> Reviewer's Phase-2 blessing. Approved at design 8/10, architecture 8/10 (round 3, final). Builds on `approved-candidate.md` (the full spec) — this file records the verdict and the load-bearing contracts Phase 4 must enforce.

## Verdict: APPROVED

**Variant A — Persistent Frame with Docking Honest Filters.** The portfolio header is an invariant frame at every data volume; filter controls dock into a single filter zone only when they can change the result set; the empty portfolio states its purpose and offers a prominent create affordance.

Full design spec: `plans/AG2/design/approved-candidate.md`. Architecture: `plans/AG2/architecture.md`. Scores and resolutions: `plans/AG2/design-critique.md`, `plans/AG2/architecture-critique.md`.

## Conditions of approval — Phase 4 contracts (enforce, do not re-litigate)

1. **R2 contract — empty-state CTA.** The portfolio-empty create affordance MUST carry `data-testid="create-bet-cta"`, and the CTA button's **accessible name MUST be the literal label `"Create bet"`** — pinned to satisfy `/create bet/i` (verified: `/create bet/i.test("Create bet") === true`; "Create your first bet" and "Create a bet" both FALSE — never use either as the button/accessible name; they may appear only as non-button pitch prose). This makes `R2-work-first-landing.spec.ts` pass without editing R2. Phase 4 enforces BOTH the testid and the exact accessible name.

2. **Zone-level verdict honesty (AC-3).** Verdict pills are gated as a ZONE on `≥1 bet has outcomeVerdict !== null`; once shown, all five pills render for vocabulary completeness. This is the **accepted AC-3 interpretation** (status/team are per-control honest; verdict is zone-level honest). Phase 4 treats zone-level verdict honesty as the contract — NOT a per-pill-honesty bug.

3. **Exactly two empty states.** `portfolio-empty` (`bets.length === 0`, onboarding pitch + "Create bet" CTA) and `filter-excluded-empty` (`bets.length > 0 && filteredBets.length === 0`, "No bets match these filters" + "Clear filters"). The legacy "No bets for this team" team-scoped copy is RETIRED (folds into filter-excluded). Verified safe against all seven `WorkPortfolio*` test files (none assert the retired string).

## Scores

- **Design: 8/10** — H:9 S:9 T:8 C:8 Co:9 St:9 A:7 AS:9 PP:7.
- **Architecture: 8/10** (round 3) — SA:8 LI:10 AC:9 DM:10 N:8 MD:8 FMC:8 S:8 V:8.

## Rejected alternatives (do not re-open)

Title-only empty header (Variant B); verdict pills filtered to only-present verdicts; empty filter bar when no control qualifies; onboarding pitch on empty-result-set; portfolio landing card/dashboard tiles. Rationale in `approved-candidate.md` §Rejected.
