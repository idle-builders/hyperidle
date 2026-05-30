# T2 Retrospective — Knowledge WYSIWYG Editing

**Workpackage:** T2 "Knowledge WYSIWYG Editing"  
**Period:** ~2 weeks (5 pipeline phases, 3 review rounds)  
**PR:** #148  
**Status:** DONE ✓  
**Shipped commit:** `d25e9693`

---

## What Went Well

### 1. **Architecture Decisions Had High Signal**

The three-phase pre-code pipeline (concept → design → architecture) produced a tight spec that guided implementation with minimal back-and-forth on *what* to build. The architecture plan's 7 tasks were clear, the API contract (PATCH with version field for optimistic locking) was correct, and the dependency graph (Task 4 independent of Tasks 1–2) saved rework. Zero architecture disagreements in the code review.

**Signal:** Reviewers spent zero time on "why did you do it this way?" and could focus immediately on "does it work correctly?"

### 2. **Stale Closure Bug Was Self-Caught Early**

The builder identified the `onSaved` callback capturing stale `editContent` during development and flagged it in the code review submission itself (F-ARCH-1). This is strong self-review practice — the fix (option b: track latest content in a `useRef<string>`) was then incorporated and regression-tested in R1→R2, demonstrating ownership of the problem.

**Pattern:** The builder knew the code had an issue before review. The review process validated the fix rather than discovering the bug.

### 3. **Test Decisions Were Correct**

Unit tests for the two new hooks (`useAutoSave`, `useKnowledgeItem`) were comprehensive (11 + 5 tests, 100% coverage including the new regression case). Integration tests for `KnowledgeDetail` and `KnowledgeCreateDialog` focused on shell behavior (Edit → Done flow, button presence, state transitions) rather than TipTap internals, which is the right scope for integration E2E. The lore comment in the new E2E tests explains why complex editor interactions are left to TipTap's own test suite.

**Signal:** No test-coverage arguments in review. All acceptance criteria were provably tested.

### 4. **Review Scope Stayed Focused**

The 3-lens positive review (architecture, design, security) found zero violations: layer integrity, API contract fidelity, data model accuracy, XSS safety, injection safety, auth, SSRF all clean. This allowed the negative lenses to focus on correctness bugs (F-ARCH-1), regressions (F-E2E-3), and quality issues (unsafe casts, verbose comments) without having to re-argue foundational decisions.

**Signal:** Code quality gates were independent. Fixing bugs was decoupled from arguing about architecture.

---

## What Went Wrong

### 1. **Broken E2E Tests Were Not Caught by Builder (CRITICAL)**

**Root cause:** The builder did not own "regression in pre-existing E2E tests."

T2's changes removed the textarea, Save button, Cancel button, and preview pane — these were the UI elements that 5 existing E2E tests in `l23-knowledge-body.spec.ts` and `knowledge-detail.spec.ts` were targeting. The builder created 4 new E2E tests to cover the new BodyEditor UI, but did not update the 5 pre-existing tests that now targeted removed elements.

**Finding:** Round 1 review found this in the "AC Completeness Audit" but marked it "NOT CHECKED." The builder responded "E2E tests for pre-existing features are outside scope for T2" and moved on. The reviewer caught this in R2 and marked F-E2E-3 as CRITICAL (must-fix before merge).

**Cost signal:**
- R1 review flagged potential breakage (listed but not validated as actual failures).
- Builder interpreted "outside scope" and did not investigate.
- R2 reviewer had to enumerate all 5 broken tests and demand fixes.
- R2→R3 fix: 80 lines of test rewrites to replace textarea interactions with BodyEditor + Done flow.

**Pattern to address:** "Regression ownership" is undefined. The builder thinks pre-existing tests are reviewer territory. The reviewer thinks the builder should run the full test suite before submit. No one actually validates.

### 2. **E2E Tests Were Written Without Understanding TipTap DOM (MAJOR)**

**Root cause:** E2E tests written before understanding how BodyEditor renders in the browser.

The new E2E test for the create dialog (Scenario 2, R1) used `getByPlaceholder("Describe it in markdown...")` — this selector finds `<textarea>` or `<input>` elements with a `placeholder` attribute. BodyEditor renders a TipTap `contenteditable` div with a placeholder plugin extension — this div has no `placeholder` attribute. The test would fail at runtime.

Scenario 4 (conflict banner) had a silent fallback that would skip the actual test interaction if TipTap's contenteditable was not found, resulting in a false pass if rendering failed.

**Finding:** R2 reviewer flagged F-E2E-1 and F-E2E-2. Both were fixed in R2→R3 (using `locator('[contenteditable="true"]')` and removing the silent fallback).

**Cost signal:**
- R1 tests: 2 tests with DOM selector misunderstandings.
- R2 fixes: builder had to learn TipTap's actual DOM structure and rewrite selectors.
- Token cost: R2 reviewer had to manually inspect the test code and explain why it would fail, then validate the fix in R3.

**Pattern to address:** E2E tests should be written against an actual browser render or with knowledge of the target DOM structure. "Write the test, see it fail, fix the code" works for unit tests. For E2E, "see the component in the browser, write the test to match the actual DOM" would prevent these misses.

### 3. **Lint Errors Made It Into Verify Phase (MINOR)**

**Root cause:** Builder did not run `npm run lint` before submitting PR.

Ship phase (Phase 5, `verify` command) found lint errors:
- `label-without-control`: accessibility violation in a template
- `organizeImports`: import statement not in alphabetical order
- `stale mock-inventory`: unused mock in the test setup

These are all caught by `npm run lint:fix` (which the builder apparently did not run pre-submit).

**Finding:** Commit `ef7680a9` ("fix(T2): lint errors") was necessary to get ship phase to pass.

**Cost signal:**
- 1 extra commit between R3 approval and ship.
- Lint errors are non-blocking but add friction.

**Pattern to address:** Pre-submit checklist should include `npm run lint` before opening PR.

### 4. **Unsafe Type Casts Were Left for Review to Address**

**Root cause:** Two unsafe `as` casts in `KnowledgeDetail.tsx` (lines 228, 232) were in the code review but marked as MINOR. Builder did not proactively add runtime guards.

F-ARCH-3 was not a blocker but added complexity to the R1→R2 cycle. The builder then fixed it correctly (adding `toKnowledgeStatus()` and `toScopeKind()` validator functions) in R2.

**Finding:** These casts were pre-existing pattern (the reviewer noted this), so the decision to fix them was a matter of test coverage rather than new-code quality. This is a grey zone.

**Cost signal:**
- Low — the fix was straightforward and the reviewer accepted it in R2.
- But this indicates the builder did not proactively review their own TypeScript for unsafe patterns.

---

## Cost Signals

### Token Efficiency

| Phase | Artifact | Token Estimate | Notes |
|-------|----------|--------|-------|
| Design | `design/approved.md` + mockups | ~3k | Tight spec, no rework |
| Architecture | `architecture.md` + tasks | ~5k | 7 tasks, correct API contract |
| TDD (write-tests) | 28 unit tests + 4 E2E test suites | ~8k | Comprehensive, 100% coverage, lore comments |
| Write-code | Main feature implementation | ~15k | `useAutoSave`, `useKnowledgeItem`, component wiring |
| **Phase 4: R1 Code Review** | `code-review.md` (3 pos + 3 neg lenses, AC audit) | **~12k** | Found 2 critical bugs (F-ARCH-1, F-E2E-3), 3 major gaps (F-E2E-1, F-E2E-2, broken tests) |
| **Phase 4: R2 Re-Review** | `code-review-r2.md` (fixes for R1 findings) | **~10k** | Validated F-ARCH-1 fix, enumerated all 5 broken tests, found 2 more E2E issues |
| **Phase 4: R3 Re-Review** | `code-review-r3.md` (final validation) | **~4k** | Quick validation of all fixes, DONE |
| **Phase 5: Ship (lint fixes)** | `ef7680a9` | ~1k | Minor lint corrections |
| **Total non-code cost (reviews + fixes)** | | **~26k** | **Almost 2x the implementation cost** |

**Review cost analysis:**
- R1 found critical architectural bug (F-ARCH-1: stale savedContent) that would silently lose user data.
- R1 found regression in 5 pre-existing E2E tests that the builder did not own.
- R1 found 2 structural issues in new E2E tests (wrong DOM selectors, silent fallback).
- R2 required deep inspection to enumerate all 5 broken tests and explain TipTap DOM structure.
- R2→R3 was validation-only, indicating the builder responded correctly to feedback.

**Token ROI:** The 26k tokens spent in review prevented:
- A data-loss bug going live (F-ARCH-1 would manifest in production as lost edits).
- 5 broken CI tests blocking unrelated PRs.
- 2 E2E tests that would silently pass on local but fail in CI.

This is strong ROI for a pre-merge review cycle.

### Rework Breakdown

| Round | Blocker | Type | Commits | Estimate |
|-------|---------|------|---------|----------|
| R1 → R2 | F-ARCH-1 (stale closure) | Architecture + test regression | `1b559682` | 40 lines, 2h debug |
| R1 → R2 | F-ARCH-2 (missing E2E) | Feature gap + test suite | `1b559682` | ~100 lines of E2E tests |
| R1 → R2 | F-ARCH-3 (unsafe casts) | Type safety | `1b559682` | 15 lines (validators) |
| R1 → R2 | F-E2E-3 (broken tests) | Regression owner | `5306a5b9` | 80 lines of test rewrites |
| R2 → R3 | F-E2E-1 (wrong selectors) | Test DOM selector | `5306a5b9` | 3 lines (selector change) |
| R2 → R3 | F-E2E-2 (silent skip) | Test robustness | `5306a5b9` | 10 lines (remove fallback) |
| R3 → Ship | Lint errors | Code cleanliness | `ef7680a9` | 3 lines |

**Total rework:** ~3 commits, ~150 lines of fixes, 2 full review rounds. **Cost: 1 full developer day equivalent for code review + rework.**

---

## Patterns

### Pattern 1: Regression Ownership is Undefined

**Observation:** The builder did not update pre-existing E2E tests that their changes broke. When asked why, they said "outside scope." The reviewer caught this in R2 and demanded fixes.

**Pattern trigger:** T2 changed UI surface (removed textarea, Save button, preview pane). 5 pre-existing tests targeted those removed elements. No one was assigned to validate regression.

**Evidence:**
- R1 code review: "AC Completeness Audit" flagged "no regressions in existing tests" as "NOT CHECKED" (not yet validated).
- R1 builder response: "E2E tests for pre-existing features are outside scope for T2."
- R2 reviewer: "5 E2E tests across 2 files will fail" (F-E2E-3, CRITICAL).
- R2→R3 fix: 80 lines of test rewrites.

**Similar patterns from prior workpackages:** (Not available in this retro scope, but this should be checked against L10, L20, etc.)

### Pattern 2: E2E Tests Written Without DOM Knowledge

**Observation:** Two new E2E tests used selectors that don't exist in the actual rendered DOM (`getByPlaceholder` for a TipTap contenteditable, silent fallback for missing editor).

**Pattern trigger:** Builder wrote tests before rendering BodyEditor in a real browser. Selectors were guessed based on the old textarea UI.

**Evidence:**
- R1 submission: E2E tests with `getByPlaceholder("Describe...")` and silent fallback.
- R2 reviewer inspection: "This test will fail at runtime" (F-E2E-1, F-E2E-2, MAJOR).
- R2→R3 fix: Changed to `locator('[contenteditable="true"]')` and removed silent fallback.

**Root cause:** `npm run test` ran the unit tests (which passed), but the new E2E tests were never actually executed before submit. Playwright tests need a running browser — they're not caught by `npm run test` (Vitest only). This is a gap in the pre-submit validation.

### Pattern 3: Builder Catches Own Bugs but Doesn't Fix Pre-Merge

**Observation:** The builder identified the stale `editContent` closure bug (F-ARCH-1) in the code review comments but did not fix it before submitting. The reviewer validated the identification and required a fix in R2.

**Pattern trigger:** Builder did careful self-review but didn't iterate to a fix before submitting the PR.

**Evidence:**
- R1 code review: "The builder flagged this issue" (referring to F-ARCH-1 stale closure).
- Builder's own comment in the code: flagged the problem in an inline note.
- R1 verdict: "CRITICAL: Fix stale `savedContent` in `onSaved` callback."
- R2: Builder fixed it.

**Root cause:** Gap between "I see the problem" and "I fix it before code review." This suggests the builder was aware but uncertain about the fix approach, or ran out of time before submitting PR.

### Pattern 4: Lint Checks Are Optional Pre-Submit

**Observation:** `npm run lint` was not run before PR submission. Three lint errors made it into the code review artifact and were only caught during the verify (Phase 5) step.

**Pattern trigger:** No pre-submit checklist enforcing `npm run lint`.

**Evidence:**
- R3 → Ship: Ship phase ran `npm run verify`, which includes lint. Found 3 errors.
- Commit `ef7680a9`: "fix(T2): lint errors — label-without-control + organizeImports + stale mock-inventory"
- Error types: accessibility (`label-without-control`), import order, unused mock.

**Root cause:** CLAUDE.md says "Target: `npm run check` + `npm run lint` + `npm run test`" but there's no blocking gate before PR submission. Builders can submit with lint violations.

---

## Recommendations

### 1. **Add "Regression Ownership" to Architecture Phase** (Process)

**Problem:** Builders don't know they own regression testing for pre-existing tests. Reviewers assume builders own it. Tests break silently until review.

**Fix:** In the `/architecture` skill output, add an explicit section:

```
### Regression Testing

For each AC that modifies or removes UI, list the existing E2E/integration tests that might break:
- [ ] Search `e2e/` for selectors/IDs referencing the removed/changed elements
- [ ] List them in the plan
- [ ] Include regression test fixes in the implementation scope

Example:
"This change removes `knowledge-edit-textarea` and `knowledge-edit-preview`.
Search found 5 existing tests in l23-knowledge-body.spec.ts and knowledge-detail.spec.ts
that target these elements. Regression fixes are included in Task 7."
```

**Owner:** Designer/architect producing the plan. **Validator:** Code reviewer checks that every modified UI surface has regression tests listed and fixed.

**Benefit:** Regression ownership becomes explicit. Builder can't say "outside scope" if it's in the architecture plan.

### 2. **Validate E2E Tests Against Rendered Component Before Submit** (Process)

**Problem:** E2E tests use selectors that don't exist in the actual DOM (guessed from old UI, not validated against the new component).

**Fix:** Require a manual browser render or visual inspection before submitting E2E tests. Add to pre-submit checklist:

```
Pre-submit checklist:
- [ ] npm run check (type safety)
- [ ] npm run lint (code style)
- [ ] npm run test (unit tests)
- [ ] npm run dev, then manual browser render of modified components (visual validation)
- [ ] npm run test:e2e (Playwright E2E tests, if added)
```

**Implementation:** In `CLAUDE.md` or a `.claude/settings.json` hook, add a pre-commit reminder. Better: make `npm run test:e2e` part of the standard `npm run verify` flow (it currently isn't, Playwright runs separately).

**Benefit:** Builder catches DOM selector bugs before review. False-pass E2E tests won't make it into review.

### 3. **Make Lint Failures Blocking in Pre-Submit** (Process + Tooling)

**Problem:** Three lint errors made it through PR submission and into verify phase.

**Fix:** Add a pre-commit hook or a stricter `npm run verify` that includes lint and exits non-zero on failure. Document in CLAUDE.md:

```
Before git push:
$ npm run verify (includes check + lint + test)

This is non-negotiable. If verify fails, fix it before pushing. 
The CI will also run this, but it should pass locally first.
```

**Implementation:** Git pre-commit hook that runs `npm run lint` and blocks the commit if there are errors (unless `--no-verify` is used, which requires explicit override). Or, add lint to the `npm run verify` orchestrator.

**Benefit:** Lint errors are caught during development, not during code review or ship phase.

### 4. **Split "E2E Test Correctness" from "E2E Coverage"** (Process)

**Problem:** The reviewer had to manually inspect E2E test code and explain why specific selectors would fail. This is high-touch code review work.

**Fix:** Create a `/write-tests` red-phase deliverable that includes:
- Test stubs with comments describing what will be tested (the contract)
- Actual selectors/interactions can be left as TODO or scaffold code

Then `/write-code` fills in the real selectors after the component is built. This forces early alignment on "what are we testing for" before selectors are guessed.

**Alternative:** Add an E2E-specific skill like `/test-e2e` that covers:
- Component render inspection (how does TipTap actually render?)
- Selector validation (does `locator()` find the expected element?)
- Flakiness prevention (wait for stable state before interaction)

**Benefit:** E2E test robustness is a separate concern from coverage. Splitting them makes the skill more focused.

### 5. **Create "Builder's Self-Review Checklist"** (Process)

**Problem:** Builder identified F-ARCH-1 (stale closure) but didn't fix it before submitting. This suggests gaps in the pre-submit review process.

**Fix:** Codify a self-review checklist that builders use before submitting PR:

```
## Builder's Self-Review Checklist

- [ ] I've run npm run verify and it passes
- [ ] I've read through my own code for logic bugs (use a separate pass, not just implementing)
- [ ] For any refs/closures, I've traced the lifecycle to confirm they're not stale
- [ ] For any state updates, I've checked that they happen at the right time
- [ ] For any API calls, I've verified the request payload matches the schema
- [ ] For any UI changes, I've checked the design spec and tokens match
- [ ] For any E2E tests, I've opened the browser and watched the test run
- [ ] I've read the architecture plan and checked off all tasks as implemented

If you find issues, fix them before submitting PR.
```

**Owner:** Builder uses before submitting. **Validator:** Reviewer checks that the checklist was applied (fewer cosmetic bugs, stale closure issues caught early).

**Benefit:** Reduces round-trip review time. Builders catch their own bugs before review finds them.

### 6. **Add "Regression Testing" as a Code Review Lens** (Process)

**Problem:** R1 review did a "AC Completeness Audit" but marked "no regressions in existing tests" as "NOT CHECKED" because it wasn't validated.

**Fix:** In `/review` skill, add a regression lens:

```
## Regression Testing Lens (NEW)

For every UI change, E2E test change, hook/API change:
- List all existing tests that reference the changed elements
- Run those tests locally
- Mark PASS or list FAIL + required fixes
- If FAIL, this is a must-fix before merge
```

**Owner:** Code reviewer. **Output:** Explicit "regression audit" section in the review artifact.

**Benefit:** Regressions are validated, not just listed as potential. Gives reviewer permission to demand fixes.

---

## Summary

**T2 shipped DONE with zero production bugs, but required 3 review rounds and ~150 lines of rework due to:**

1. **Regression ownership undefined** — builder didn't own pre-existing E2E test fixes. Demand fixed in R2.
2. **E2E tests written without DOM validation** — selectors didn't match the actual TipTap component. Fixed in R2→R3.
3. **Lint errors in pre-submit** — builder skipped `npm run lint`. Caught in ship phase (Phase 5).
4. **Self-caught bug not fixed pre-review** — stale closure identified but not fixed before R1. Fixed in R1→R2.

**The review process was high-quality and caught all issues before merge.** The cost of these patterns is ~1 developer-day in rework + review overhead. With **6 lenses + AC completeness**, the review prevented a data-loss bug (F-ARCH-1) and 5 broken CI tests from shipping.

**Process improvements focus on shifting validation earlier:**
- Explicit regression testing in the architecture plan
- Mandatory E2E browser render before submit
- Lint as a blocking pre-commit gate
- Self-review checklist for builders
- Regression lens in code review

**Estimated ROI:** If these 6 recommendations are adopted, future workpackages with similar scope (UI change + E2E + regression) should see:
- 1 fewer review round (validation happens pre-submit)
- ~40% reduction in rework lines
- Zero lint violations in review
- Zero E2E selector bugs

---

**Prepared by:** Retrospective process (Explore agent)  
**Date:** 2026-05-30  
**Next review:** Compile patterns from T2 + L10 + L20 into `/compound` process improvement proposal
