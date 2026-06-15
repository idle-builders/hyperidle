# AK2 Retro: Strategy port + minimal reference strategy

**Ship date:** 2026-06-15  
**Status:** MERGED (PR #297, attestation DONE)  
**Commits:** 13 across 5 phases (concept → critique → red → green → review → fix → docs)  
**Duration:** ~1 working day start-to-merge (AK2 branched from stale #287 base; full main rebase mid-pipeline required)

---

## What Went Well

### 1. Architecture Critique Caught a Critical Gap Before Code Was Written
The critique identified that `session-lifecycle.ts` independently hard-imports both `assembleContext` and `startWatcher` from fabric — a second Kernel call site the plan had missed entirely (plan §0 claimed "exactly these call sites" but omitted this file). 

**Signal:** This was a CRITICAL finding that would have broken the AC4 static guard (`no-restricted-imports` lint) during the green phase. Instead, the critique surfaced it before any code was written, allowing a single design revision round (fold the gap into the call-site table and decouple tasks) before red tests were written.

**Cost averted:** ~3-4 hours of code + test rework + re-review cycle.

**Pattern value:** This is the second major AK-track gap where architecture-critique caught load-bearing oversights before implementation (AK1 had similar call-site misses; /architecture-critique is proving cost-justifying on this track).

### 2. Empirical Approach to the Port Surface
The plan correctly identified the physical boundary by reading actual code (`session-provisioning.ts`) and finding that the composed prompt is built only from Kernel-owned data (system prompt, tools, DB rows) — knowledge reaches the agent as *files in the sandbox*, not embedded. This narrow scope (two operations: assemble-in, ingest-out) is what makes the Fabric trivially satisfiable and keeps the port implementable.

**Signal:** Zero behaviour change achieved via proper boundary analysis, not luck. The "empirical cut" (§0) is the central load-bearing insight.

### 3. TDD Red Phase Caught Vacuity Early
The red-phase tests wrote assertions on both happy path AND failure paths. When the builder ran green-phase code, the failure-path tests revealed that the AD2 dispatcher needed a Strategy registered to function at all — the test suite self-reported vacuous assertions that would pass silently without it.

**Signal:** TDD red phase caught a design gap (AD2 needs an injected Strategy, not an optional side effect) before review. Fix-pass added the Strategy registration to AD2 test blocks and a dedicated AC3 parity test.

**Failure mode avoided:** Silent pass of tests that claimed to verify behaviour that wasn't actually exercised.

### 4. Generic Type Parameter Resolved Dependency Cycle Cleanly
The plan flagged a hard design question: `strategy-port.ts` lives in `@hyperidle/shared` but needs the type `HyperIdleDb` from `@hyperidle/db`. The cycle (shared → db, db → shared) seemed unsolvable with a direct import. Instead, the builder parameterized the request types: `ContextAssemblyRequest<TDb>`. This keeps shared db-agnostic and the concrete binding happens at the composition root (`server-factory.ts`).

**Signal:** Generic type parameter cleanly resolves architecture cycles without runtime impact. Reusable pattern for the fabric-strategy binding (fabric implementation provides its own `HyperIdleDb` concrete type when it wires the Strategy into the registry).

### 5. Decouple Succeeded with Strict Allowlist
The `no-restricted-imports` ESLint rule was set up to ban exactly two imports (`assembleContext`, `startWatcher`) from Kernel source, with an allowlist for the composition root (`server-factory.ts`). The strict rule enforced the contract automatically — no residual hard imports left behind.

**Signal:** Lint-based enforcement (not test-based) is the right tool for static architectural properties. The binary pass/fail on CI is stronger than test coverage.

---

## What Was Costly / Wasteful

### 1. Stale-Base Hazard Mid-Pipeline (Critical Timeline Impact)
AK2 was branched from commit #287/AJ1's merge (which added design-system code). During the run, `origin/main` **reverted** that design-system code. The branch carried dead code; when pre-ship checklist ran `git merge origin/main`, the divergence was severe — the rebase wasn't caught by the Phase 3 "check if main advanced" step, only later by the full merge attempt.

**Cost signal:** ~2 hours of pipeline stall diagnosing "ds:sync fails locally" (later resolved as an artifact of the stale base, not a real regression). The "rebase check" in Phase 3 only does `merge origin/main`, masking how far the divergence had gone until forced to resolve merge conflicts.

**Process signal:** Pipeline should detect when a branch's base commit has been reverted on main earlier, not late in ship. Recommendation: add a safety gate in Phase 1 (after opening WIP) or Phase 3 that checks `if base commit still exists on origin/main`, and surfaces the hazard explicitly.

### 2. Vacuous Tests Discovered in Review, Not During Green Phase
The green-phase builder ran the tests and saw them pass. The review phase (independently) noticed that AD2 dispatcher's failure path wasn't being exercised — the test passed because the registry was unset, which caused the *happy-path test* to assert on the inertness, guarded by `if (fs.existsSync)` after the sandbox had been cleaned up.

**Cost signal:** This should have been caught by the builder running with explicit failure-path scaffolding in place (mock a Strategy, verify dispatch; mock no Strategy, verify the error). The red phase wrote the tests but didn't validate the test harness setup during green.

**Pattern:** Matches CC-008 (E2E/integration discipline). Builders are not consistently validating the full failure/happy-path matrix in the harness before declaring green. Recommendation: add a pre-green-checkpoint in the builder harness that validates "all red-phase test failure paths are exercised with the test harness fully set up."

### 3. Process: Unused Agent Turns on Attestation/Main Merge Sync
The full merge of current `origin/main` (Phase 3 → Phase 4) left stale attestations hanging. The `/ship` skill then flagged these as needing re-signing. The builder had to delete old attestations and re-run verify. This was automatable but required manual intervention because the pipeline doesn't automatically clean stale attestations when the base changes.

**Cost signal:** ~30 minutes of orchestration overhead; ~2 agent turns spent on "fix attestation state" instead of verification logic.

**Process signal:** attestation state should be scoped to the current branch + base commit. If base changes, attestations against the old base are stale and should be auto-cleaned. Recommendation: `/ship` pre-check should delete attestations scoped to previous base commits, not require manual intervention.

---

## Observations

### Key Non-Recurrence Learning

1. **Architecture critique continues to be high-value on AK track.** The gap this round (missing call-site in `session-lifecycle.ts`) is orthogonal to the AK1 gap (same pattern: empirical boundary analysis missed a second call path). This suggests a systemic gap in how "find all callers" is done — likely grep patterns that miss files (searching in one file instead of grep -r, or incomplete function name patterns). Recommendation for AK-track future: `/architecture` should end with "grep -r 'assembleContext\|startWatcher' packages/server/src/" to verify the call-site census is exhaustive.

2. **Vacuity in tests is a blindspot when the harness setup is incomplete.** The AD2 dispatcher tests passed vacuously because the test fixture (vitest `describe` block) didn't register a Strategy upfront. The builder ran green phase and saw green; the review caught it independently. This pattern appeared in the log as CC-002 (test-harness-incompleteness), recurs in this AK2 round, and also in earlier workpackages (R5 merge function untested, U7 E2E selectors mismatched DOM). Recommendation: add a pre-green-checkpoint that validates "for every red-phase test case, verify it fails without the implementation" — this forces builders to discover vacuous tests during green, not after.

3. **Stale-base detection is weak in the pipeline.** The rebase check in Phase 3 only does `merge origin/main`; it doesn't check whether the base commit still exists on main. This masked the #287 revert until merge-conflict time. Recommendation: add a gate that checks `git merge-base --is-ancestor <base-commit> origin/main` and surfaces "base commit has been reverted" as a blocker before proceeding to merge-and-verify.

4. **Process: No automatic cleanup of stale attestations when base changes.** The `/ship` flow didn't auto-clean attestations from previous base commits; the builder had to manually delete them and re-run verify. This is low-cognitive-load but is wasted agent turns. Recommendation: `/ship` should delete attestations scoped to previous base commits as a pre-check, not after hitting the stale-attestation error.

---

## Concrete Suggestions

### For the AK2 Branch (Complete)
None — this workpackage is merged and documented.

### For Future Workpackages (Use /compound)

1. **Base-commit revert detection (Phase 1 / Phase 3):** Add `git merge-base --is-ancestor <base> origin/main` check; if false, surface "base commit was reverted on main" and block merge until resolved. Cost: <30s per run, huge signal value.

2. **Stale-attestation auto-cleanup (/ship pre-check):** Before attempting verify, scan `.verify-attestations/` for files scoped to previous base commits (parse `<commit-hash>.json`); delete them. Cost: <1s per run, eliminates a whole category of stale-attestation errors.

3. **Vacuous-test detector (pre-green checkpoint):** Before declaring green-phase done, run each red-phase test with a "null implementation" (mock that fails or returns empty) and verify it fails. This forces discovery of vacuous guards before code review. Cost: ~2-5 min per run depending on test count, catches test-harness gaps early.

4. **Grep-sweep checkpoint in /architecture (/architecture post-task §9):** After "empirical call-site survey", run `grep -r '<import-name>' packages/server/src/` for each identified symbol (assembleContext, startWatcher, etc.) and verify the hit-list matches the §0 table. Cost: <1min per symbol, ensures no second call-paths are missed.

### Policy Recommendations

- **Mandatory pre-green validation:** Red-phase tests MUST be validated for failure-path exercise during green phase using a null implementation or failure mock. Add this to the /write-code checklist.
- **Attestation scope:** Attestations are scoped to current branch + base commit. When base changes mid-pipeline, old attestations are auto-dropped. Document in `/ship`.
- **Architecture plans on AK track:** Include a post-write `grep -r` step for all identified symbols to verify the call-site census is exhaustive, not just search-by-inspection.

---

## Cost Summary

- **Productive phases:** Concept (0.5h) + Critique (0.5h) + Red tests (1h) + Green code (2h) + Review (1h) + Fix (0.5h) + Docs (0.5h) = **~6h productive work**
- **Infrastructure/process overhead:** Stale-base diagnosis (2h) + attestation churn (0.5h) + main merge conflict resolution (0.5h) = **~3h overhead** (33% of productive time)
- **Pattern:** This mirrors U6 and earlier AK-track runs where 30-50% of duration is consumed by infrastructure (attestation loops, stale bases, CI sync) rather than domain work.

**Signal:** Infrastructure overhead is a recurring cost signal worth addressing in `/compound` — the patterns (stale bases, attestation churn, main divergence hazards) appear in ≥3 recent runs.

