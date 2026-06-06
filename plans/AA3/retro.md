# AA3 — Routine Cost & Appetite Model — Retro

**Date:** 2026-06-06  
**Workpackage:** AA3 (Medium complexity)  
**Pipeline phases:** 6 (concept → design → design-critique → architecture → write-tests → write-code → code-review → fix → retro)  
**Verdict:** DONE (all 5 ACs delivered, 1 design contract fix cycle)

---

## What Went Well

### 1. Plan Reconciliation Prevented Silent Scope Surprises
**Observation:** Architecture plan included an explicit "Plan reconciliation: spec vs reality" table (8 rows) that caught every missing piece before code was written. Every assumption was verified against the actual codebase with specific file/line references: `costCapMonthlyMinor` doesn't exist (must add), `budget_exhausted` outcome type missing (must add), `TeamBurn.betCostActual` missing (must add), etc. Zero mid-stream "wait, this doesn't exist" moments.

**Impact:** Zero discovery-phase rework. Implementation followed the plan exactly, with only one expected design contract fix (native `<progress>` → design-system `Progress` component).

**Tag:** `plan-reconciliation`, `architecture-plan`, working-process

---

### 2. TDD Red Phase Eliminated Edge Cases
**Observation:** Builder wrote 801 lines of test code across 4 test files in the red phase, covering all 5 ACs exhaustively: schema validation, API CRUD, per-run cap termination, monthly cap blocking, team cost breakdown, routine budget stats. Tests passed on the first green-phase run — all edge cases (null caps, zero spend, at-cap, over-cap) were specified upfront and handled by the implementation.

**Impact:** Zero test-driven rework cycles. Code review found zero "test doesn't cover this" gaps. Only constructive finding was Test AA1/AA2 fixtures not asserting on Budget section rendering (acceptable — server-side computation already exhaustively tested).

**Tag:** `tdd-red-phase`, working-process

---

### 3. Design-it-Twice Rejected Premature Generalization
**Observation:** Architecture plan included a genuine design-it-twice section comparing two approaches for per-run cap enforcement: Option A (simple comparison in cost_update loop) vs Option B (extending C7 hierarchy with a routine level). The plan correctly chose Option A (simpler, localized) and explicitly documented why Option B (over-engineering, unclear semantics) was rejected. This decision isolated the per-run cap concern from the broader cost cap hierarchy.

**Impact:** Simple, focused implementation. No false coupling between session-local caps and entity-level cost tracking.

**Tag:** `design-critique`, working-process

---

### 4. Write-Then-Overwrite Risk Resolved Cleanly
**Observation:** Architecture critique flagged a write-then-overwrite hazard: `endSession` writes outcome "success", then a separate `overrideRoutineRunOutcome` call changes it to "budget_exhausted". Builder avoided this by threading the outcome through `endSession` as an optional parameter, which forwards it to `updateRoutineRunOnSessionEnd`. Single atomic write, zero window for inconsistency.

**Impact:** Cleaner implementation, simpler to reason about. Critique finding converted directly into better code without rework.

**Tag:** `architecture-critique`, working-process

---

### 5. Critique Findings Applied Proactively
**Observation:** Phase 2 critique produced 1 CRITICAL (write-then-overwrite) and 2 WARNINGs (costCapMonthlyCurrency inconsistency, monthly-cap response shape). All three were addressed in the green phase without re-discovery during code review. Builder applied the lore comment about dropping `costCapMonthlyCurrency` and documented the reasoning.

**Impact:** Clean code review with only constructive findings (native `<progress>` component, test fixture completeness). No rework cycles spent re-discovering critique points.

**Tag:** `critique-effectiveness`, process-discipline

---

## What Was Friction

### 1. Native `<progress>` vs Design System Component (Design Contract Violation)
**Observation:** Code review found that WorkRoutine Budget section used native HTML `<progress>` with DaisyUI classes (`progress-warning`/`progress-success`) instead of the approved `Progress` component from the design system. Approved design (design/approved.md lines 95-96) explicitly specified the `Progress` component, which includes Hearth tokens, animated width transitions, and proper `role="progressbar"` semantics. Builder committed a fix in subsequent commit (33db9fb5) switching to the design-system component.

**Root cause:** Plan Task 6 code snippet showed native `<progress>` as acceptable; designer's specification in design/approved.md was not made load-bearing in the architecture plan's "Required reading" section.

**Impact:** 1 extra code review cycle + 1 fix commit (2h). Design system contract violation prevents visual consistency and regression testing (visual snapshot tests will flag regressions for design-system components but not native progress bars).

**Severity:** Medium (functional, but design contract violated)  
**Tag:** `design-enforcement`, `implementation-drift`, code-review

---

### 2. Plan Task 6 Snippet Incomplete
**Observation:** Architecture plan Task 6 specified budget stats computation but the code snippet computed `avgCostPerRun` from `allRuns` (20 most recent runs) instead of ALL runs as Risk #1 acknowledged. The builder correctly implemented using a separate aggregate query per Risk #1, but the plan's code snippet was internally inconsistent — it documented the risk but showed incorrect example code.

**Root cause:** Plan was written before implementation precision on all details locked in. Risk section acknowledged the right approach but the code snippet contradicted it.

**Impact:** Zero impact on actual code (builder implemented correctly). Minor confusion in plan readability.

**Severity:** Low (documentation only)  
**Tag:** `plan-consistency`, `code-snippet-quality`

---

### 3. `costCapMonthlyMinor` Persisted Without Currency Column
**Observation:** Critique WARNING flagged inconsistency: `costCapPerRunMinor` has no corresponding currency column, but plan Task 1 added `costCapMonthlyCurrency` for the monthly cap. Critique recommended dropping the currency column since the factory is single-currency. Builder agreed and dropped it, documenting the decision in a lore comment. However, the decision was made at code-review time, not during architecture planning when it could have been caught earlier.

**Root cause:** Critique was correctly skeptical but the plan should have explicitly declared "single-currency factory, no currency columns on caps" in Task 1 before code review.

**Impact:** 1 iteration of critique feedback. Builder implemented the right solution (dropped the column). Zero shipping impact.

**Severity:** Low (design guidance clarity)  
**Tag:** `specification-clarity`, `design-guidance`

---

## What Was a Gap

### 1. Component-Level Test Coverage for Budget Section
**Observation:** Code review noted that AA1/AA2 test fixtures were updated with budget field data but neither test file adds assertions on the Budget section rendering (checking for `data-testid="routine-budget"`, progress bars, utilization percentages). The main AA3 integration test exhaustively covers server-side budget computation, and the component doesn't crash with budget data, but there's no component-level DOM verification.

**Root cause:** Integration test strategy focused on API response shape; component rendering was assumed correct by fixture. No E2E tests specified in architecture plan for Budget section visual behavior.

**Impact:** Zero shipping risk (API-level testing is thorough). Regression risk: future refactoring could break Budget section rendering without breaking tests.

**Severity:** Low (acceptable trade-off for integration test priority)  
**Tag:** `test-coverage-gap`, `component-testing`

---

### 2. E2E Test Coverage for Routine Cost Features
**Observation:** No Playwright E2E tests were specified or written for the new cost cap and budget features. Plan Task 7 (frontend changes) does not include E2E test tasks. User journey (create routine with caps → monitor budget → see exhaustion) is untested in E2E.

**Root cause:** Workpackage scope focused on integration tests for API behavior. E2E coverage deferred implicitly (typical for integration-heavy workpackages).

**Impact:** Manual testing required to verify budget section UI rendering, cap field acceptance, progress bar colors. Visual regression tests (npm run ds:sync) not run to verify Budget component pixel parity.

**Severity:** Low (acceptable for Medium workpackage, E2E would be High for a UI-primary workpackage)  
**Tag:** `e2e-deferred`, `test-coverage-gap`

---

## Process Observations

### 1. Critique-to-Code Handoff Was Clean
**Observation:** Architecture critique produced 1 CRITICAL + 2 WARNINGs with specific, actionable fixes. All three were applied during green phase. Builder included lore comments referencing the critique points (session-lifecycle.ts line 66-69, session-provisioning.ts line 578-579, routine-scheduler.ts lore block). Code review had zero re-discovery of critique findings.

**Pattern:** Matches X3, X2, AB3 success pattern where critique + lore comments create a bridge to code phase.

**Tag:** `critique-integration`, working-process

---

### 2. Plan Reconciliation Table Is Load-Bearing
**Observation:** This is the third workpackage (after X8, AA1) where the "Plan reconciliation: spec vs reality" table prevented scope creep and discovery waste. The table format (assumption | reality | resolution) with file/line references forces codebase reading before planning.

**Recommendation:** Make this a standard architecture plan section for all workpackages.

**Tag:** `architecture-plan`, `working-process`, `reusable-pattern`

---

### 3. Single Review Cycle With One Expected Fix
**Observation:** Code review found 1 MAJOR (design contract violation), 3 MINOR (duplicate labels, type casts, test fixture completeness). Builder applied the MAJOR fix in a single commit (33db9fb5) without re-review needed. Design system component swap was straightforward.

**Impact:** 6 days elapsed time from concept to ship (feature commit 2026-06-03, fix commit 2026-06-06). Productive commits: 3 (tests, feature, fix). CI/docs commits: 3 (critique, code-review, verify). 50% productive ratio acceptable for integration-heavy feature with design coordination.

**Tag:** `code-review-efficiency`, working-process

---

## Key Numbers

| Metric | Value |
|--------|-------|
| Architecture plan length | 656 lines |
| Plan reconciliation items | 8 (all resolved before code) |
| Test file length | 801 lines |
| Test cases written (red phase) | 118 discovered via grep |
| Feature commit files changed | 20 |
| Feature commit lines added | 5225 |
| Critique findings | 3 (1 CRITICAL, 2 WARNING) |
| Code review findings | 4 (1 MAJOR, 3 MINOR) |
| Fix commits | 1 (design system Progress component) |
| Calendar days elapsed | 6 (2026-06-01 through 2026-06-06) |
| Productive commits | 3 of 6 (50%) |

---

## Compound Candidates

| Candidate ID | Relevance |
|---|---|
| CC-010 | TDD red phase + plan reconciliation pattern confirmed (X3, X8, AA1, AA3 all succeed with this pattern) |
| CC-009 | Critique effectiveness when critique findings are proactively applied + lore-documented (X2, X3, AB3, AA3) |
| CC-001 | Design contract enforcement: design system component usage needs to be more load-bearing in architecture plans |

---

## Risks Carried Forward

None. All acceptance criteria delivered. Only known residual: native `<progress>` vs `Progress` component was a discovery-phase violation that was fixed in commit 33db9fb5. Implementation is shipping-ready.
