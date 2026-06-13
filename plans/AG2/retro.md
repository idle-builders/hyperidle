# AG2 Retro — Portfolio Arrival & Honest Filters

**Workpackage:** AG2 (feat/AG2-portfolio-arrival, PR #274)  
**Date:** 2026-06-12  
**Status:** Phase 4 DONE; 6 ACs + 4 scenarios proven; full verify green (2781 tests)

---

## Executive Summary

A 4-phase pipeline with a 3-round critique loop that systematically caught critical blockers before implementation. Two load-bearing gaps in the architecture plan (test enumeration incomplete with wrong paths; R2 CTA copy failing regex adjacency) were surfaced and fixed before code shipped. The red phase TDD discipline and phase 2 empirical critique prevented Phase 3 from discovering broken test suites.

**Cost Signals:**
- Phase 1 (designer): concept + design (2 variants) + architecture; commits 56485c6, 4043494, 9022e58 (~97k subagent tokens)
- Phase 2 (critique): 3 rounds to APPROVED (6/10→6/10→8/10). R1 REVISE (2 CRITICAL), R2 REVISE (1 new CRITICAL), R3 APPROVED. Tokens: ~99k + 74k + 53k reviewer; +71k + 48k designer revisions = ~345k total
- Phase 3 (builder): red e1787bac, green 9993c1f5, fixes d59b41c8. Verify green (2781 tests). ~121k tokens, 251 tool uses, ~87 min
- Phase 4 (review): DONE first pass, 0 CRITICAL, 1 WARNING (e2e screenshot path hygiene, non-blocking). ~118k tokens. Fix commit 18b45396 (~42k tokens)
- **Total orchestration overhead:** ~797k tokens for one 12-file, 1472-line feature (Phase 2 critique rounds tripled costs but caught unshippable bugs)

---

## Top 3 Observations (Per User Request)

### 1. Phase 2 Critique Process Prevents Shipping Broken Tests (CC-009 pattern, success)

AG2 shipped with a 3-round critique that surfaced two load-bearing gaps before code was written:

**Round 1 CRITICAL-1:** Architecture plan enumerated only 2 of 7 WorkPortfolio test files and got one path wrong (`packages/web/src/pages/__tests__/WorkPortfolio.test.tsx` — file lives at `packages/web/src/__tests__/`). Five files were unmentioned (AA1, AB2, cycle, L13, j8). The contract "existing portfolio tests updated, not deleted" cannot be verified if the plan doesn't enumerate the sites. **Impact:** Phase 3 would have discovered only 2 of 7 test files to inspect; 5 would have been silently skipped. Critic's grep + find verification caught this pre-implementation.

**Round 2 CRITICAL-3:** R2 CTA contract required copy to be accessible name exactly matching `/create bet/i` regex. Approved design said "Create your first bet". Critic ran the regex test: **`/create bet/i.test("Create your first bet") === false`** — the words "your first" break adjacency. Designer then pinned both docs to the literal "Create bet" label. **Impact:** Without this verification, e2e would have shipped with 3 of 5 R2 CTA tests in RED (the role query for `/create bet/i` button name).

**Round 3:** All findings resolved; APPROVED at 8/10.

**Lesson:** Multi-agent critique surfaces distinct bug classes. The architect would not have caught the regex adjacency; the designer would not have enumerated all 7 files. Together, they prevented unshippable code. CC-009 pattern confirmed.

---

### 2. Latent Breakage on Main (U9→U11 chain) Discovered via Empirical Baseline Verification

R2 specs were silently broken on main before AG2 began. Pattern: U9 renamed empty-state testid `create-bet-cta`→`portfolio-empty`. U11 then rebaselined *most* references to the testid but missed R2's CTA block entirely. R2 had 5 CTA tests, 4 of which use `getByTestId("create-bet-cta")` and `getByRole("button", { name: /create bet/i })`. The testid no longer exists, and the copy changed post-U9.

**Empirical discovery:** Phase 2 Round 2 critique ran R2 tests against the branch base: **5 of 6 CTA tests FAILED, 1 trivially passed** ("hidden when bets exist" — no selector needed). This baseline empiricism proved the "R2 is unaffected" claim in the plan was false and flagged the real work needed.

**Impact on AG2:** The fix (emit `create-bet-cta` testid + pin accessible name to "Create bet") resolved the latent breakage as a side-effect. Without critique's empirical baseline check, the assumption would have held, and PR #274 would have merged without fixing hidden test failures.

**Lesson:** Empirical baseline verification (run the affected specs against the branch base before code) catches hidden main breaks that planning alone misses. This is a distinct signal from "plan reconciliation" — it's not about what's in the codebase now, but what's currently broken by prior changes.

---

### 3. Test Enumeration Pattern Recurring (CC-007/CC-008 recurring signal)

Architecture plan test enumeration has a systematic blindness: architects write a protected-tests list by naming convention (WorkPortfolio.test.tsx), but codebases split tests across directory hierarchies (`pages/__tests__/` vs `__tests__/`). The plan's two-file enumeration missed the five-file reality.

This is the third documented recurrence of CC-007/CC-008 (Spec/Reality Drift at plan time, Protected-test contracts drifting). The root cause is that `architecture/SKILL.md` Phase 1 reconciliation says "read the codebase," but architects read the codebase *visually/intuitively*, not *systematically with find+grep*.

**Fix recommendation (for CC-007/CC-008 evolution):** Add a mandatory `find` step to `architecture/SKILL.md` Phase 1:
```bash
find packages/web/src -name "*WorkPortfolio*" -name "*.test.ts*"
```

This single command would have enumerated all 7 files automatically. Combined with the existing "grep for every named table/route/component the spec references" rule, the result is systematic + reproducible.

**Cost signal:** This is not a minor lint fix. Test enumeration errors force Phase 3 code reviewers to catch missing test files (observed in L1, L13, U6, U7, T5 retros). A single `find` command in Phase 1 prevents them all.

---

## Observations Appended to Retro Log

11 JSON lines appended to `.pipeline/retro-log.jsonl`:
1. Three-round critique success (CC-009 pattern)
2. Latent main breakage via empirical baseline (U9→U11 chain on R2)
3. TDD red-phase empty-frame invariant (CC-010)
4. Predicate extraction single-source-of-truth discipline
5. Plan enumeration gap (test paths, CC-007/CC-008)
6. R2 CTA copy regex adjacency friction
7. Verdict zone-honesty contract clarity
8. Status-bucket folding consistency
9. E2E screenshot path hygiene (non-blocking warning)
10. Stale verdict filter edge case (noted, not a regression)
11. Test enumeration pattern recurring (CC-007/CC-008 evolution recommendation)

---

## Compound Candidates Referenced

- **CC-009** (Multi-agent parallel review finds non-overlapping bug classes) — CONFIRMED success. Critique Round 1 + 2 + 3 confirmed the pattern. Reviewer's empirical verification (regex test, baseline run) surfaces classes the designer alone would miss.
- **CC-010** (TDD red-then-green produces working code on first attempt) — CONFIRMED success. Red-phase e1787bac proved 45/45 tests green on first green-phase 9993c1f5 run.
- **CC-007** (Spec/reality drift discovered at plan time) — EMERGING recurrence. Test enumeration off by 5 files. Pattern: architects assume naming convention, don't systematically enumerate.
- **CC-008** (Protected-test contracts drift from spec changes) — EMERGING recurrence. Same root cause (test enumeration): 5 files unmentioned in plan, left unverified.

---

## Process Improvements Identified

1. **Empirical baseline verification for affected specs (new pattern):** Before finalizing the plan's "affected specs" list, run them against the branch base. If any are RED, the plan's "unaffected" assumption is wrong — fix the plan, not the test.
2. **Systematic test enumeration (CC-007/CC-008 evolution):** `find` command in Phase 1 beats visual inspection. One command generates the complete list; zero architectural misjudgment.
3. **Regex validation for contract strings:** When a design spec pins copy that must match a regex (e.g., Playwright's `/regex/i.test(copy)`), run the test in Phase 2 critique before code. Current critique process includes this for one copy; make it a standard "Copy contracts" check in architecture-critique/SKILL.md.

