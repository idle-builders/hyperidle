# AK3 Pipeline Retro — "Committing a bet starts work"

Run date: 2026-06-15. Fresh-context observation pass (Phase 6). Observe, don't fix.

## Cost signals

~16 commits over ~2h. Effort distribution:
- Phase 1 (concept→design→architecture): 4 prose commits, clean.
- Phase 2 (critique): 2 rounds. R1 architecture scored 6/10 with 3 CRITICALs; R2 reached 8/10 after one revision. Design approved at 8/10 first pass.
- Phase 3 (TDD): 6 red tests; green passed 42/42 (unit+integration+component) first full run.
- Phase 4 (code review): verdict DONE, zero CRITICALs, 2 non-blocking WARNINGs + 3 NITs. Both WARNINGs applied.
- Phase 5 (docs): 5 docs updated, 11 plan artifacts retired.

Rework was minimal: 1 architecture revision loop + 2 small review-fix items. No green-phase split needed.

## What the architecture critique caught early (3 CRITICALs, pre-code)

1. **AH3 is not a Strategy-port precedent.** AH3 assembles context inline with `sandboxPath:""` and never calls `assembleContext`; the plan claimed it as the model. Resolved by specifying an exact synthetic `ContextAssemblyRequest` (synthetic `decomp-${betId}` ids, scratch dir, `isRoutine:true`, try/catch→blocked, finally rm) — verified safe against `minimal-strategy.ts` (synthetic ids never hit a DB row).
2. **Session-less `propose_bet_tasks` tool execution unspecified.** The tool registry is session-scoped. Resolved by making deterministic server-side `insertProposedBetTasks` the v1 primary (PM turn runs `tools:[]`, returns structured `DecompositionTaskInput[]`); the harness-tool path is deferred behind the `runDecompositionTurn` seam.
3. **CAS crash-orphan hole.** `status NULL→running` guard leaves a crashed turn stuck on `running` forever. Resolved by a boot sweep `resolveOrphanedDecompositions` that flips stale `running` → `blocked/failed` before the subscriber registers.

Catching these before `/write-tests` is the core value of the producer/evaluator split — they were contract/boundary errors invisible to a passing test suite.

## What the two-review model caught that tests didn't

Code review (Phase 4) surfaced a **design-fidelity binding miss**: the blocked `EmptyState` was missing the amber alert glyph + `iconBg` token specified in the binding `approved.md`. Tests asserted testids/copy but not the icon affordance. Distinct gap class from the Phase-2 boundary CRITICALs — the two-review model continues to catch non-overlapping defect classes.

## Boundary enforcement (held in code)

- Subscriber is kernel-side (`packages/server/src/services/`), not bolted onto fabric's `lifecycle-propagation`.
- Task creation is server-only — no second provisioning route; reuses `task-dispatcher → provision-registry → session-provisioning`.
- Strategy port consumed via synthetic request; cost stayed kernel-side (`checkCostCap` direct import, not behind the port).
- AK2's ESLint guard correctly blocked strategy-specific imports in new kernel code.

## Friction / gaps (non-blocking)

- **AC5 (User Sovereignty) proven structurally, asserted weakly.** Negative/boundary ACs ("no tool use / no external action") repeatedly ship "proven by construction + code review" without an executable assertion (pattern also seen AH5, AJ1). A review-fix added a `tools:[]` assertion this run. Candidate process rule: a negative-property AC needs ≥1 executable assertion.
- **Design-binding misses recurring.** W-1 icon glyph is a repeat of the "architecture/design names a primitive/token to reuse, builder misses the binding" pattern (cf. L13, U6/U7). Feeds CC-022.
- **`runRealPmTurn` (~90 lines) untested** — acceptable per plan (eval-only, no LLM in suite), documented via `@lore`.
- **Double timeout NIT** on the real-turn path (outer `withTimeout` wraps a fn that already races its own timeout) — harmless redundancy.

## Process / harness friction (orchestrator-level)

- The orchestrator's untracked progress file (`.pipeline/progress/AK3.json`) was removed mid-run by a concurrent git operation in the shared main checkout and had to be recreated twice. Progress files for in-flight WPs are not committed until ship, so they're vulnerable to concurrent-worktree git ops. Candidate: write the progress checkpoint into the worktree branch earlier, or to a location not touched by other agents.
- AK2 had no progress file yet was merged (PR#297) — progress-file bookkeeping diverges from actual merge state across concurrent pipeline agents.

## Escalations

None. Zero CRITICALs in final review; both WARNINGs applied. Dependency chain AK2→AK3 resolved; AK4/AK5 unblocked (need only AK1).
