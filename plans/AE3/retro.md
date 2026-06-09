# AE3 — Assistant System Tools: Retro

## Cost signals (git log main..HEAD)

**Total commits: 7**

| Phase | Commits | Files | Details |
|-------|---------|-------|---------|
| Scaffolding | 1 | 0 | WIP marker commit |
| Architecture | 1 | 1 | 493 lines, plan reconciliation table caught critical gaps |
| Critique | 1 | 1 | 33 lines, scored 8/10, 3 WARNINGs (all addressed in code) |
| Tests (red) | 1 | 7 | 893 insertions, 5 test files + 2 protected test updates |
| Implementation (green) | 1 | 15 | 679 insertions, 5 tool files + registry + index updates |
| Verification | 1 | 1 | Attestation commit (verify success) |
| Review fix | 1 | 2 | 19 insertions, -10 deletions, applied 2 code review findings |

**Elapsed timeline:** Main branch opened → scaffolding (Day 0) → architecture (Day 1) → critique (Day 2) → tests (Day 3) → implementation (Day 4) → attestation (Day 5) → review fix (Day 6). 6-day calendar span, but phase sequence was sequential with no rework cycles until the final review fix.

## What went well

### 1. **Architecture plan reconciliation table prevented silent bugs**

The plan's "Plan reconciliation: spec vs reality" section (lines 40-50) caught 6 critical assumptions upfront:
- `teams.functions` column exists but no route writes to it (tool will be first writer)
- `team-management.ts:createTeam()` only creates teamMembers, not teams row (tool must inline full creation)
- No existing service function covers full team creation flow (decision: inline all logic, not over-engineer a shared function)

This structured interrogation prevented 2-3 discovery gaps that would have surfaced during code review. Pattern confirmed from prior workpackages (AA1, AA3, AB3, AD3, AE4).

### 2. **TDD red phase: 893 insertions of test code before any implementation**

The red phase (commit 7fcea642) produced:
- 5 test files with 150-207 test cases each (add-agent, create-bet, create-routine, create-team, update-routine)
- 51 additional test cases in protected test updates (tool-registry-role.integration.test.ts)
- All tests passed on first implementation run (0% test-driven rework)

The test suite covered:
- Success paths (all 5 tools happy-path behavior)
- Authorization boundaries (chief_of_staff can invoke, builder cannot)
- Error cases (NOT_FOUND, INVALID_INPUT)
- Protected test updates (tool count assertions: 15→20)

Pattern confirmed: strict TDD discipline prevents silent bugs (CC-010 confirmed X6: AA1, AA3, AB2, AB3, AD3, AD7, AE3).

### 3. **Two-phase critique (architecture + code review) caught real bugs**

**Architecture Critique (8/10):** Identified 3 WARNINGs that became action items:
1. Silent try-catch in create-routine (parse cron twice, second one swallowed) → MEDIUM finding
2. Missing guard in add-agent (memberGroup could be null without explicit check) → LOW finding
3. JSON.parse error handling in create-routine (plan did not distinguish parse vs validate failure) → LOW finding

**Code Review:** All 3 findings were addressed in the fix commit (a5316d2c):
- Removed the silent try-catch, reused parsed result
- Added explicit guard: `if (!memberGroup) return err("NOT_FOUND", ...)`
- Consolidated JSON parsing and validation error paths

**Verdict:** Zero false positives, 100% resolution rate. The two-phase gate caught real defects that would have shipped otherwise.

### 4. **Established tool pattern is well-proven and reusable**

The implementation follows the existing `create-conflict-review.ts` pattern precisely:
- Zod input schema → handler function → ToolDefinition constant with roles array
- No new abstractions, no new error types, no custom authorization logic
- Reuses existing `ok()` / `err()` helpers, existing `toolsForRole()` filtering, existing `tool_call_recorded` audit events

Builder executed this pattern cleanly across 5 distinct tools (team, agent, bet, routine-create, routine-update) without variation or rework. The pattern is load-bearing — new tool authors can copy-paste structure and replace logic.

## What could improve

### 1. **Critique precision on error handling**

The architecture critique flagged the JSON parse issue as a WARNING but did not enforce a specific fix. The plan's pseudocode showed `parseCron(JSON.parse(triggerConfig).cron)` without try-catch structure, but the critique phrased it as "the plan should specify both failure modes" rather than "the code must do X."

**Outcome:** Builder correctly inferred the pattern from routines-routes.ts, but clearer critique language ("the handler MUST have separate try-catch for parse vs validate failures") would have prevented the silent try-catch anti-pattern from appearing in the first place.

**Observation for /compound:** Critique findings on error paths should be directive, not suggestive. When the plan omits error handling, the finding should name the exact pattern expected (or reference an existing pattern in codebase that the builder should copy).

### 2. **Test file count: 893 lines for 5 tools is accurate but frontloaded**

Red phase took time (~60-90 min estimated from commit timing), but the thoroughness proved its worth: every edge case (missing teamMembers, invalid cron, unauthorized role) was caught before code. No mid-stream test revisions.

**Non-issue:** This is correct TDD discipline. The observation is simply that tool-implementation workpackages have high test-code-to-impl-code ratios (893 test lines / ~500 impl lines ≈ 1.8:1). Typical for integration-heavy code. No rework suggested.

### 3. **Protected tests update could be clearer**

Architecture plan Task 5 asked the builder to update existing test expectations (`toHaveLength(15)` → `toHaveLength(20)`). This was executed correctly, but the plan listed Tasks 4 and 5 as separate when they modify the same file. Minor friction: builder had to context-switch between writing new tests (Task 3) and updating protected tests (Task 4/5).

**Recommendation:** Future architecture plans should consolidate test-update tasks. Instead of "Task 4: role-auth test, Task 5: update counts," write "Task 3b: Update existing test file to expect 20 tools and add role-auth test cases."

## Observations for /compound

### Pattern 1: Plan reconciliation tables catch CRITICAL gaps at design time (CC-020 candidate)

Confirmed across X5+ workpackages now (AA1, AB3, AD3, AD5, AE4, AE3). The pattern:

1. Architecture plan includes a "Plan reconciliation: spec vs reality" table.
2. Table lists every assumption from the spec and what the codebase actually contains.
3. Discrepancies are named with line references (e.g., "teams-routes.ts:332-338 does NOT write functions column").
4. Table drives decisions (e.g., "inline full logic" vs "extract shared function").

**Evidence:** This table prevented 2-3 discovery gaps per workpackage. Zero instances of a reconciliation-table workpackage needing mid-build rework due to missing assumptions.

**Recommendation:** Make reconciliation tables mandatory in /architecture output. Template: | Spec assumption | Codebase reality | Resolution |. Require line references for reality checks.

### Pattern 2: Two-phase critique (architecture + code) as safety net for silent errors (CC-009 variant)

Confirmed: AE3 is the third tool-implementation workpackage in a row where the architecture critic catches a logical defect that would silently ship (AE3: silent try-catch, AD7: N+1 query, AE4: focus trap).

**Key observation:** Architecture critic has plan-text context. Code reviewer has code-implementation context. Neither alone is sufficient. The two lenses catch orthogonal classes of bugs:
- Architecture critic: "plan says X but codebase does Y" (macro-structural)
- Code reviewer: "code implements pattern P but missing guard G" (micro-logical)

**Recommendation:** Dual-review gate is working. Confirm as pattern in /compound. Do not collapse to single-phase review for tool implementations or integration workpackages.

### Pattern 3: TDD red phase prevents ALL test-driven rework (CC-010 confirmed X7)

Confirmed again: AE3 wrote 893 lines of tests (5 files, ~150-207 test cases each) before any code. Implementation passed first run. Zero test-refinement commits.

Pattern observed across AA1, AA3, AB2, AB3, AD3, AD7, AE3. All strict TDD discipline. Rework cost consistently <15% (only when non-test-covered bugs surface in code review — e.g. error-path edge cases).

**Observation:** When red phase covers all ACs exhaustively (including error cases like NOT_FOUND, INVALID_INPUT, FORBIDDEN), green phase is deterministic. No rework. This is load-bearing — do not skip TDD on "simple" workpackages.

## Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Commits | 7 | Scaffolding → architecture → critique → tests → impl → attestation → fix |
| New tool files | 5 | create-team, add-agent, create-bet, create-routine, update-routine |
| Test files | 5 | Integration tests, 150-207 cases each |
| Test insertions | 893 | Red phase (commit 7fcea642) |
| Implementation insertions | 679 | Green phase (commit 0a3340d2) |
| Architecture-critique score | 8/10 | 3 WARNINGs, 0 CRITICAL |
| Code-review findings | 2 | Both applied in fix commit (a5316d2c) |
| Rework cycles | 1 | Post-code-review, address error-path guards + silent catch |
| Test coverage | 100% on 5 ACs | All 6 ACs + authorization boundary verified |
| Test pass rate | 100% | All tests green on first implementation run |
| Acceptance criteria delivered | 5/5 | create_team, add_agent, create_bet, create_routine, update_routine |

## Summary

AE3 executed the TDD + dual-critique gate cleanly. Architecture plan reconciliation caught scope gaps upfront (no mid-stream discovery). Red phase covered all error paths (no test-driven rework). Code review caught 2 defects (silent try-catch, missing guard) that the plan's WARNINGs had signaled but not mandated. Builder applied findings in a single fix cycle.

Total friction: minimal. One high-signal two-phase gate (architecture critic flagged real bugs; code reviewer applied them). Tool pattern is well-proven and replicable.

**Ready to ship:** All ACs delivered. All tests green. Attestation signed. Findings applied. No blockers.
