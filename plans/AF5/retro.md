# AF5 Retro — Type-green the web frontend

**Workpackage:** AF5  
**Branch:** feat/AF5-type-green-web  
**Status:** SHIPPED  
**Duration:** ~3 days (concept → code review → attestation)  
**Commits:** 9 (1 WIP-open, 1 plan, 1 critique, 1 re-critique, 1 red-phase, 2 fix, 1 attestation, 1 code-review)

---

## Cost Signals

| Signal | Count | Notes |
|--------|-------|-------|
| **Diff size** | 105 files, +766/-393 | Type-only; no behavior change |
| **Type errors drained** | 211 → 0 | Gate-accurate measurement (reference-noise filtered) |
| **Test-file errors** | 155/211 (73%) | Call-site updates, not contract changes |
| **Story errors** | 32/211 (15%) | Missing required props in render calls |
| **Production-src errors** | 24/211 (12%) | Guards + narrowing, type-only (no behavior change) |
| **Phase 2 critique rounds** | 1 CRITICAL (fixed) + 2 WARNINGs | Hard constraint on SettingsBackend triage; plan revision applied |
| **Code review findings** | 0 CRITICAL, 0 WARNING | All AC-1 through AC-5 PASS on first attempt |
| **Behavioral regressions** | 0 | Protected-test assertions unchanged (density deletion = 1 permitted exception) |

---

## Key Observations

### Success: Measurement Discipline (CC-010 working)

- **Real numbers, not guesses.** Plan measured 211 own-errors gate-accurately (reference-noise TS6305/6307/6059 filtered per gate protocol). Spec had 203; difference (203 → 211 drift) documented and correctly explained (shared/db leaf pre-build stability).
- **Plan reconciliation caught the 235 stored in typecheck-debt.json** as cosmetic; gate reads only the package KEY, not the count. Plan §7 reconciliation table made this explicit. Builder deleted wholesale `{ web }` entry, count included.
- **Z8-170 measurement protocol documented** — future AF5-like type-debt workpackages have an executable `shared+db pre-build, grep TS6305, re-measure` procedure rather than repeating the measurement error from AF4.

### Success: Critique + Revision Loop (CC-024 working, CC-009 strong)

- **CRITICAL finding on SettingsBackend.tsx:24 TS2367** — critique empirically proved the ambient contract (`platform: "electron"` closed literal vs field `backendMode` for local/shared mode). Plan's initial "widen platform type" option was forbidden by the critique. Plan revision applied: type-only simplification of dead `!== "shared"` comparison, with `@lore AF5/L` deferring the real behavioral fix to AF13–AF16.
- **Plan revision was clean, not late.** Critique Round 1 found CRITICAL, plan revision committed (commit 8552b10e), then builder started Phase 3. No builder-discovered surprises.
- **Two-lens model effective.** Critique caught the latent-bug triage (architectural risk); code review caught implementation details (BlockId brand alignment, test-setup intersections).

### Success: TDD Discipline (CC-010 protected)

- **Red-phase commit before implementation** (commit bc940000: test-debt quarantine removal + 0 measurement). Green-phase (commits c650b922 + 32d8c34d) followed with guarded fixes + test updates.
- **No assertion drift beyond density deletion.** Protected-test audit (§11 in plan) holds — 155 test-file updates were prop additions / `!`/`toBeDefined()` guards, not behavioral assertion changes.
- **Fast turnaround:** no rework cycles between green-phase commits and code review. Implementation matched plan task-by-task (104 files, measured).

### Success: No Behavior Change Proven

- **Regression injection passed** (code-review methodology: inject `const x: string = 123` into web, gate FAILs naming web, confirms web is live-gated not excepted).
- **Baseline test suite green** (test and test:integration all pass; verify full pass, no protected-test assertion changes).
- **SettingsBackend.tsx type-only fix:** `isLocal = true` now a constant (dead `!== "shared"` branch collapsed), same runtime output. @lore documents deferred behavioral fix.
- **Index-access guards in src:** real guards (`if (x === undefined) return`, `?? null`, `first !== undefined` ternary) not `!` casts. AF2 policy held.

### Friction: Plan Measurement Minor Drift (not blocking)

- **Spec assumed 203 errors; actual 211 gate-accurate.** Not a hard blocker (plan correctly re-measured), but documents measurement uncertainty. Retro log this for future planners: type-debt counts are live snapshots, not predictions. Builder re-measures after each cluster anyway (plan §3).

### Friction: SettingsBackend Triage Was Subtle (resolved by critique)

- **The "always-local" behavior was not obvious from code review alone.** Critique had to read `window.d.ts:24` + `SettingsWorker.stories.tsx:35` to confirm `platform` never carries mode, only `backendMode` does. The type-only fix (collapse the always-true comparison) preserves the current always-local UI correctly, but without the critique, the plan could have corrupted the contract by widening `platform` to include `"shared"` (masking a behavioral bug, not fixing it).
- **Lore at the fix site (@lore AF5/L) is durable.** If AF13–AF16 switches the read to `backendMode`, they'll find the breadcrumb explaining the current always-local state and why it's a behavioral bug waiting to be fixed.

### Friction: BlockId Brand Constraint Needed Clarification (resolved by critique)

- **Warning 1 in critique:** plan described `blockId()` constructor as applicable for re-branding id strings; critique pointed out the constructor takes `BlockIdInput` (structured), not raw strings. **Lesson:** when naming a constructor as the fix, the signature matters. Critique flagged the mismatch; builder verified call sites and fixed via map-key-type alignment instead of casting.
- **No `as BlockId` introduced.** Only design-system stub has the forbidden pattern; AF5 respected the anti-pattern constraint and aligned types at the boundary instead.

### Friction: Debt-Count Reconciliation Was Cosmetic (but documented)

- **Critique Warning 2:** typecheck-debt.json stored `errors: 235` while plan measured 211 (and spec said 203). Gate reads only the package KEY, so the stored count doesn't affect gate behavior. **Lesson:** AF1 gate design is sound (count is cosmetic), but future plans should document this explicitly so builders don't chase reconciliation. Plan §7 now has a row: "stored `errors:235`/`note` fields are cosmetic and removed wholesale."

### Observation: Test Strictness Policy Held Across Phases

- **Grep scan (code review stage):** zero new `any` / `@ts-expect-error` / `@ts-ignore` / unsafe `as X` in src files. Test files had legitimate intersection casts (test-setup: `window as Record<...>`, mocks: `as unknown as Response`) and `!` on indexed access — all per AF2 policy.
- **No prop-contract loosening.** Every TS2741/TS2739 fix was a call-site update, never a component prop type widened to silence a call site. Contract-as-truth policy held.

### Observation: No Rework; High Specificity of Plan

- **Critique → plan revision → code review → all ACs pass on first attempt.** The architectural plan's level of detail (469 lines, file:line references for every error, 24-line src-error inventory, categorized fix approach per category A–M) eliminated mid-implementation discovery.
- **Task-by-task execution:** builder followed §5 ordered task list (density, src guards, src params, src unused, confirm src, stories, tests, drain) with no scope surprises. No "back-to-architecture" moments.

### Gap: Z8-084 Density Leftover Was Minor But Instructive

- **Two deletion sites (useSettings.ts:36 + useSettings.test.ts:129) were the only behavioral-surface-adjacent changes.** Both were deletions (dead `density: "auto"` and assertion on removed field). Confirmed as W2 artifact.
- **KeyValue.density.test.tsx filename:** code review confirmed it's a dead test file (no imports, not in root test run). Not in scope to delete (would be a separate cleanup workpackage), but no type error surfaced from it. Plan was right to flag it as "worth checking" but not mandate deletion if clean.
- **Lesson:** Z8-084 residual was already-tested for by the measure-and-gate discipline. No behavioral bug hiding.

### Observation: No CI/Infrastructure Friction

- **Verify + attestation clean.** No dirty-state loops (CC-005 worktree-cleanup + cwd preamble from AF4 held). No attestation ordering issues. No e2e selector mismatches.
- **Gate stayed green-or-quarantined throughout.** Web was quarantined (listed in debt file) until commit 88b05012 (removal + +0 measurement), then gate re-ran and web showed **PASS** (not QUARANTINED, not STALE, not FAIL).
- **Suggests AF1 gate + typecheck-debt system is stable.** Z8-166/Z8-169 escalations from AF3/AF4 did not recur; measurement protocol held.

### Pattern Confirmation: Multi-Phase Review Catches Different Bugs (CC-009)

- **Phase 2 architect-critic:** caught the latent behavioral bug (SettingsBackend reads wrong property), proved it via contract inspection, and ruled out the corrupting fix.
- **Phase 4 code-reviewer:** caught the test-harness casts (legitimate but worth documenting), verified no src casts slipped in, confirmed BlockId pattern applied correctly, and proved gate is live.
- **Neither review alone would have been sufficient.** Architect's latent-bug expertise ≠ reviewer's implementation-detail expertise. Preserving both lenses is load-bearing.

### Pattern Confirmation: TDD Red-Phase Before Code (CC-010)

- **Red-phase test commit (bc940000) came before implementation.** Test: remove web from typecheck-debt, expect gate to fail (0-error web not excepted = gate fail). Green phase: drain web to 0, re-measure, remove debt entry, gate passes.
- **Red phase forced clarity:** the removal is coupled to zero-error target, gate-enforced. No ambiguity about what "done" means.
- **Result: zero rework.** First green-phase run was the final state. Matches CC-010 pattern (R5, S2, R6, T5, U6, X2, AA1, etc.).

---

## Acceptance Criteria Audit

| AC | Plan requirement | Verification | Result |
|---|---|---|---|
| **AC-1** | web compiles 0 errors, checked by gate, not quarantined | `npm run check` → `web 0 PASS`; injection proves gate is live | **PASS** |
| **AC-2** | web removed from typecheck-debt.json | Diff shows `.packages` went `{}` | **PASS** |
| **AC-3** | Z8-084 density + property-existence FIXED not suppressed | `useSettings.ts:36` `density:"auto"` deleted (no re-add, no suppression); grep src clean | **PASS** |
| **AC-4** | Prop contracts sound — no TS2741/TS2739 | Gate 0-error PASS covers it | **PASS** |
| **AC-5** | `npm run verify` passes | Test, integration, lint, check, knip, build, attestation all green | **PASS** |
| **(regression)** | Injection: new prop/type error → gate fails naming web | Injected error → gate FAIL, reverted clean | **PASS** |
| **(behavior)** | No protected-test assertion change | Audit: only density assertion deletion (permitted §11); no behavior drift | **PASS** |

---

## Lessons for Future Type-Debt Workpackages

1. **Measurement is a load-bearing artifact.** Gate-accurate count (pre-build leaves, filter reference-noise) must be measured live, not assumed. Document the protocol in @lore.
2. **Ambient type contracts are sound.** When AF5 or AF4 find a "wrong type" that affects display/control, inspect the full ambient declaration (`window.d.ts` for global bridges, schema.ts for DB types, etc.) before deciding if it's a contract bug or a real behavioral bug.
3. **Two-review model finds the latent bugs.** Architect-critic + code-reviewer uncovered the SettingsBackend always-local behavior; neither alone would have.
4. **Density residual from W2 was fully cleaned.** Future workpackages removing W2 artifacts should reference Z8-084 as proof the cleanup was complete.
5. **TDD red phase on debt removal is crisp.** Quarantine removal + measurement + gate re-run as one logical test, before implementation. Eliminates ambiguity.

---

## Escalations

None. AF5 shipped cleanly. Z8-166 (AF2 gate bypass), Z8-169 (stale-dist nondeterminism) did not recur — AF4's lore + measurement protocol held.

---

## Compound Candidates

- **CC-009 (multi-agent review finds non-overlapping bugs):** CONFIRMED, protect. AF5 is the 24th workpackage confirming this pattern.
- **CC-010 (TDD red-green):** CONFIRMED, protect. Red-phase test (remove debt, expect fail) → green-phase (drain to 0, gate pass). Pattern held.
- **CC-024 (critique findings applied before builder):** CONFIRMED, protect. Plan revision loop (critique → plan revision commit → builder starts) worked cleanly.
- **No new candidates.** AF5 is a narrow, well-scoped workpackage. Friction was resolved by existing infrastructure (AF4 lore, critique loop, gate discipline).

---

## Cost Summary

| Phase | Duration | Cost |
|---|---|---|
| Concept | 0 min | N/A (type-level, no new noun) |
| Design | 0 min | N/A (no UI surface change) |
| Architecture | ~60 min | 469-line plan + 54-line critique + 43-line re-critique |
| Red phase | ~20 min | 1 test (quarantine removal + measure) |
| Green phase | ~90 min | 2 commits (src + tests) |
| Code review | ~20 min | 1 review cycle, 0 blockers |
| Verify + attestation | ~20 min | Clean run, no loops |
| **Total** | ~270 min (4.5h) | Productive |

**Builder effort:** ~99 min on 676 tool-uses across 96 files (from code-review notes). Efficient TDD + guided fix-list (categories A–M) kept waste low.

---

## Metrics for Dashboard

- **Type-debt drained:** 211 → 0 errors
- **Lines of code changed:** 766 (+) / 393 (-)
- **Review rounds:** Phase 2 (1 CRITICAL + 2 WARNING), Phase 4 (0 CRITICAL, 0 WARNING)
- **Test suite status:** baseline green (no regression)
- **Gate status at end:** web **PASS** (not quarantined)
- **Rework cycles:** 0
- **Escalations:** 0

