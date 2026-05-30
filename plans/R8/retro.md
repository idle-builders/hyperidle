# R8 Signal-to-Noise Defaults — Retrospective

**Pipeline Dates:** 2026-05-30 22:21 to 2026-05-31 06:00 (7h 39m elapsed)

**Status:** Complete and merged. All acceptance criteria pass. No open findings.

---

## Cost Signals

### Commits & Timeline

| Phase | Commits | Count | Timeline |
|-------|---------|-------|----------|
| Planning | WIP scaffold, architecture plan, architecture critique | 3 | May 30 22:21–22:35 (14m) |
| TDD Red | Failing tests for signal-to-noise defaults | 1 | May 30 22:44 (9m later) |
| Code Review Round 1 | Implementation code + first review findings | 2 | May 31 00:46–01:00 (14m + 60m gap) |
| Code Review Round 2 | Review findings documented + fixes applied | 2 | May 31 03:55–05:30 (90m + 15m fix verification) |
| Code Review Round 3 | Final review + minor fix (DB handle cleanup) | 2 | May 31 05:45–06:00 (15m + 15m final review) |

**Total: 10 commits over 7h 39m**

### Code Statistics

| Category | Files | Lines Added | Lines Removed | Net |
|----------|-------|-------------|---------------|-----|
| **Implementation** | 8 | 231 | 14 | +217 |
| **Tests** | 7 | 1,039 | 1 | +1,038 |
| **Plan artifacts** | 5 | 852 | 0 | +852 |
| **Total** | 20 | 2,122 | 15 | +2,107 |

**Breakdown:**
- Implementation is dominated by `dispatcher.ts` (+147 lines): alert preferences reader injected, `applyAlertPreferences` pure filter function, event metadata tracking, @lore event mapping table
- Tests are almost entirely the new comprehensive test file (`R8-signal-to-noise.test.ts`, 994 lines): 29 test cases covering all 5 ACs, configurations, edge cases, and integration scenarios
- Plan artifacts: 471 (architecture) + 77 (critique) + 137 (round 1 review) + 136 (round 2 review) + 31 (final review) = 852 lines documenting design decisions, finding resolution, and verification

### Review Rounds & Findings

**Round 1 (May 31 01:00):** 6 findings identified
- F-01 (CRITICAL): Dispatcher reads `server_config` directly, violating planned dependency injection
- F-02 (WARNING): `AlertPreferences` type not exported from fabric barrel
- F-03 (WARNING): Unsafe `as` casts in the direct read function
- F-04 (WARNING): E2E fixtures not updated for new `quietHoursEnabled` field
- F-05 (MINOR): No Playwright E2E test for quiet hours toggle
- F-06 (MINOR): AC1 documentation tests are tautological (assert on local arrays, not runtime)

**Round 2 (May 31 05:30):** All 6 findings resolved + 1 new finding
- F-01 through F-06: Verified RESOLVED (DI properly wired, exports added, tautological tests replaced with behavioral tests, fixtures updated, E2E tests added)
- F-07 (WARNING): 6 of 9 test describe blocks missing `handle.close()` in afterEach, causing 107s test timeouts under concurrent load

**Round 3 (May 31 06:00):** All findings resolved
- F-07 fixed: All 9 describe blocks now properly close DB handles
- Final verdict: DONE. All 5 ACs pass with 29 tests

---

## Process Observations

### What Went Well

1. **TDD discipline worked.** The test file was written before implementation (red phase on May 30 22:44), forcing clear specification of all 5 ACs as concrete assertions. When implementation code was written (May 31 00:46), it had a clear target.

2. **Architectural analysis in planning prevented scope creep.** The architecture plan (471 lines) identified the "two config stores" disconnection (factorySettings vs server_config) as a critical gap that made the constraint "defaults overridable via Settings" unmet. This forced a dependency injection solution that respects layer integrity. Without this upfront analysis, the builder might have taken the shortcut in F-01 (direct read of server_config from fabric, violating layer independence).

3. **Review-then-code-review cycle was effective.** The architecture critique (8/10) provided warnings about the `applyAlertPreferences` return type (classification vs silence/enqueue distinction), which the builder correctly addressed by keeping quiet hours separate from alert preferences. The first code review found the DI shortcut immediately (F-01) because the architecture was explicit.

4. **Behavioral test replacement for AC1 was the right call.** The initial tautological documentation tests (asserting on local constants) were replaced in round 2 with genuine behavioral tests that emit events and observe the dispatcher's handler being called or not. This makes AC1 verifiable at the behavior level, not just as documentation.

5. **Test reliability issue (F-07) was caught before merge.** The SQLite handle leak affecting concurrent test execution would have caused flaky CI failures if merged. Catching it in round 2 and fixing it before final review prevented a "works locally, flakes in CI" problem.

### What Was Wasteful

1. **Three review rounds to find and resolve one architectural issue (F-01).**
   - Round 1 identified the shortcut (direct read of server_config from fabric), which was a substantive violation of the planned DI approach.
   - Round 2 verified the fix was applied correctly.
   - Round 3 was needed for F-07 (test reliability), which was independent of F-01.
   
   **Root cause:** The implementation shortcut (reading server_config directly) was a reasonable-looking choice without the architecture document's explicit dependency injection mandate. The plan's "Revised approach" section (lines 253–265) detailed how to wire the reader through the three layers (dispatcher defines type, bootstrap accepts reader, server-factory provides closure), but the implementation deviated on the first try. This suggests the plan could have been more prescriptive about the wiring sequence, or the builder needed to ask for clarification before implementing.

2. **E2E fixture updates spread across 5 files (F-04).** The architecture plan identified all 5 locations that needed `quietHoursEnabled: false` added, but the first implementation run missed them. The fixes were straightforward (adding one field to mock objects), but the distributed nature of the change meant the review had to catch each location. A checklist in the task list would have helped: "Verify quietHoursEnabled is added to all 5 fixture files before commit."

3. **Test reliability issue found in round 2, not round 1.** F-07 (missing `handle.close()` calls) was not caught in the initial review because the issue only manifested under concurrent load (107s timeout). The builder's local test runs (likely single-threaded) passed. This suggests the R8 test needs to be run in parallel mode (`vitest --run --parallel`) before the first review to catch resource leak issues earlier.

### What Should Have Been Caught Earlier

1. **The DI shortcut (F-01) could have been prevented with pre-implementation review.**
   The architecture plan was crystal clear about Option A (dependency injection), with code blocks showing how to wire it. A 10-minute code review of the first implementation (feat commit May 31 00:46) before pushing would have caught the direct read shortcut immediately. Instead, it was caught in the first formal review (May 31 01:00), requiring a fix commit (May 31 03:55) and verification in round 2. Lost time: ~2h.

2. **E2E fixtures (F-04) should have had a before-commit checklist.**
   The architecture plan listed all 5 files. A simple grep before commit would have verified:
   ```bash
   grep -l "notifications" packages/web/e2e/*.ts | xargs grep -L "quietHoursEnabled"
   ```
   This takes <1s and would have caught 5 missing fields. Instead, they were found in review, requiring a follow-up fix commit.

3. **Test resource leaks (F-07) need concurrent-run validation in TDD red phase.**
   The failing tests were written (May 30 22:44) and passed locally, but the parallel execution model wasn't validated until implementation was done. The test suite should be run with `vitest --run --parallel` in the red phase, not just `vitest --run` (single-threaded). This would have caught F-07 before implementation.

### Findings Preventability

| Finding | Round | Preventable? | How |
|---------|-------|--------------|-----|
| F-01 | 1 | Yes | Pre-implementation architectural review of first commits. Plan was explicit but implementation deviated. |
| F-02 | 1 | Yes | Export checklist: "If a new type or function is added to a module, check it's exported from the barrel (index.ts)." |
| F-03 | 1 | Yes | Security scan for `as Record<string, unknown>` in codebase would have flagged it immediately. Linting rule could forbid untyped casts. |
| F-04 | 1 | Yes | Grep check before commit: `grep -L "quietHoursEnabled" packages/web/e2e/*.ts` |
| F-05 | 1 | Yes | Test coverage checklist: "User-facing feature => Playwright E2E test required." |
| F-06 | 1 | Yes | Review rule: "Tests asserting on static data (hardcoded arrays, fixtures) are not sufficient. Test must emit real events or call real functions." |
| F-07 | 2 | Yes | Run tests with `--parallel` flag in TDD red phase. Single-threaded passing doesn't guarantee concurrent safety. |

**Preventability score: 7/7.** All findings were preventable with process discipline.

---

## Recommendations

### Process Improvements for Future Workpackages

1. **Pre-implementation architectural checkpoint (15m before first code commit).**
   - Spend 15 minutes on the first implementation commit reviewing it against the architecture plan.
   - Developers should annotate their commits with references to plan tasks ("Task 2, step 3: DI setup").
   - Reviewers should check plan-to-code alignment before the formal review, not after.
   - **For R8 specifically:** This would have caught F-01 immediately instead of 1h into review.

2. **Concurrent test validation in TDD red phase.**
   - Always run failing tests with `vitest --run --parallel` to validate resource safety, not just `vitest --run`.
   - Single-threaded test passing masks resource leaks (handles, DB connections, timers).
   - **For R8:** F-07 would have been caught on May 30 22:44, not May 31 05:30.

3. **Fixture/mock checklists for schema changes.**
   - When adding a new field to a public API response (e.g., `NotificationSettings.quietHoursEnabled`), include a pre-commit checklist of every location where that shape is mocked or tested.
   - Use `grep --files-with-matches` to enumerate: `grep -l "notifications.*:" packages/**/*.{ts,tsx}` — then verify each file has the new field.
   - **For R8:** F-04 would have been caught pre-commit, not in review.

4. **Linting rule: forbid untyped `as` casts.**
   - ESLint has `@typescript-eslint/no-explicit-any` and could have a rule against `as Record<string, unknown>` or bare `as T` casts.
   - When casts are unavoidable (parsing untrusted JSON), require Zod/io-ts parsing instead.
   - **For R8:** F-03 would have been blocked by linting, not caught in manual review.

5. **Review rule: Behavioral tests required for AC documentation.**
   - "If an AC is about what the system does (or doesn't do), the test must emit a real event, not assert on hardcoded data."
   - "Documentation ACs (AC1: 'defaults documented') are verified by test assertions on behavior, not by test-level documentation."
   - **For R8:** F-06 would have been required in the red phase, not re-done in round 2.

6. **Three-round review should be a rare exception, not a pattern.**
   - R8 took 3 review rounds. This is acceptable here (one was F-07, a novel test reliability issue; the other two were plan deviation + follow-up verification).
   - If a pattern emerges of 3+ rounds per workpackage, add a "pre-review validation" checklist step before formal review to catch common issues early.
   - **For future workpackages:** Track round count. If >2 rounds, post-retro, run a root-cause analysis on why the second round didn't catch all issues.

### Patterns to Avoid

1. **Taking architectural shortcuts without documenting the deviation.**
   - F-01 was reading server_config directly (a valid shortcut in isolation) without a `@lore` block explaining why the plan's DI approach was changed.
   - If you deviate from the plan, document it with a `@lore` or comment explaining the tradeoff.
   - **Lesson:** Plan explicitly. Deviations need explanation, not silence.

2. **Assuming single-threaded test passes mean concurrent safety.**
   - F-07 passed locally and in sequential runs but failed at 107s timeout in parallel execution.
   - SQLite handle exhaustion is a resource leak issue that scales with concurrency.
   - **Lesson:** Validate test safety in the same execution mode as CI (parallel).

3. **Spreading schema changes across multiple mock locations without a manifest.**
   - F-04 required updates to 5 different files (fixtures, E2E specs, etc.). Without a pre-made list, each was found independently during review.
   - **Lesson:** Document the "signature change impact list" in the architecture plan (R8 did this correctly; the issue was compliance, not planning).

### Patterns to Repeat

1. **Explicit architecture plan with reconciliation table.**
   - R8's plan included a "Plan Reconciliation" table (AC vs Reality) identifying exactly what was already satisfied and what needed to change. This forced the analysis of a real architectural gap (two config stores, one unreachable) that spec-only thinking would have missed.
   - **Pattern:** Always include a "what exists, what needs change" reconciliation table in architecture. This prevents blindly implementing spec without understanding codebase state.

2. **Dependency injection to respect layer boundaries.**
   - The DI solution (dispatcher defines type, bootstrap accepts reader, server-factory provides closure) is a textbook example of inverting a dependency that would otherwise violate layer integrity.
   - The plan's "Revised approach" section (lines 253–265) showed the exact call chain. When F-01 was found, re-implementing it took ~30 minutes because the path was explicit.
   - **Pattern:** Document dependency injection patterns in architecture with explicit call chains and file paths. This makes both correctness and debugging faster.

3. **Behavioral test cases that enumerate preference combinations.**
   - R8's test matrix is comprehensive: (blockerAlerts on/off) × (costAlerts on/off) × (hard breach safety override) = clear cases with names. No "test X with Y enabled" vagueness.
   - The test file's structure (9 describe blocks, each covering one AC or constraint area, with 3-7 concrete test cases per block) is self-documenting.
   - **Pattern:** Name test cases as "condition → expected outcome" (e.g., "blockerAlerts=false + blocking item → no notification"). This makes the test file a spec document.

4. **Concurrent-mode validation in TDD red phase.**
   - The R8 test suite (994 lines, 29 tests) caught F-07 only when run in parallel. Validating concurrency safety early prevents last-minute surprises.
   - **Pattern:** In TDD red phase, run tests with `--parallel` by default, not as an afterthought.

5. **Review rounds as incremental verification, not rework cycles.**
   - Round 1 identified issues. Round 2 verified fixes and found a new issue (F-07). Round 3 verified the final fix.
   - No issue was re-reviewed without being re-fixed (i.e., no "you said fix X, but you didn't" → "oh, we're fixing it now" → repeat).
   - **Pattern:** Each review round includes a "verdict" section (DONE, NOT DONE, BLOCKED). If NOT DONE, list exactly what must be re-checked in the next round.

---

## Workpackage Metrics

| Metric | Value | Comment |
|--------|-------|---------|
| **Pipeline duration** | 7h 39m | WIP open at 22:21 on May 30; final review at 06:00 on May 31 |
| **Commits** | 10 | 3 plan, 1 test, 1 impl, 2 review cycles + fixes, 2 final |
| **Review rounds** | 3 | Typical for a medium-complexity multi-layer change involving DB schema, API, UI, and 3 dependent packages |
| **Lines added/code** | 217 | Implementation: dispatcher (147), bootstrap (12), server-factory (23), server-config (8), routes (3), web components (24) |
| **Lines added/tests** | 1,038 | Comprehensive test file: 29 tests across 5 ACs, all configurations, edge cases |
| **Lines added/artifacts** | 852 | Architecture (471), critique (77), 3 review rounds (304) |
| **Test pass rate** | 100% (29/29) | All 5 ACs verified; all findings resolved |
| **Findings** | 7 total; 0 open | 6 in round 1, 1 new in round 2; all resolved by round 3 |

---

## Summary

R8 was a successful medium-complexity workpackage that exposed a real architectural gap (two config stores, signal preferences unreachable from the dispatcher) and solved it cleanly via dependency injection. The planning phase was rigorous (471-line architecture document with reconciliation table), the testing was thorough (29 test cases in TDD red phase), and the review process was effective at catching both plan deviations (F-01) and novel issues (F-07).

**Key win:** The architecture plan's explicit identification of the two-config-store problem forced a clean DI solution that respects layer boundaries. This prevented a shortcut that would have created maintenance debt.

**Key learning:** Three review rounds is acceptable for a multi-layer change, but 7 of 7 findings were preventable with process discipline (pre-commit checks, concurrent test validation, architectural review before code review). Future workpackages should adopt the checklists and validation patterns to reduce surprises.

**Readiness for merge:** All acceptance criteria pass. All findings resolved. Test suite green. Ready to ship.
