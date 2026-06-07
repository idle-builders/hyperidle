# Architecture Critique: AA3

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:9 AC:7 DM:7 N:9 MD:8 FMC:7 S:8 V:8

---

## Dimension Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Spec Alignment | 9 | Every AC maps to tasks. No scope creep. Design contract matched. |
| Layer Integrity | 9 | No cross-layer violations. Fabric owns cost computation, server owns routes, web reads API. |
| API Contracts | 7 | Request/response shapes fully typed. Missing HTTP response spec for monthly-cap-blocked manual trigger. |
| Data Model Alignment | 7 | Schema changes correct. costCapMonthlyCurrency inconsistency with per-run cap (no corresponding currency column). |
| Naming | 9 | All names honest and consistent with existing patterns. No conflicts. |
| Module Depth | 8 | Helpers appropriately scoped. overrideRoutineRunOutcome is shallow but justified by trade-off analysis. |
| Failure-Mode Coverage | 7 | Security table complete. Missing failure analysis for write-then-overwrite pattern in Task 3. |
| Simplicity | 8 | Design-it-twice is genuine. No over-engineering. costCapMonthlyCurrency is minor premature generalization. |
| Verifiability | 8 | Every AC has concrete test with seed data and expected values. Protected tests listed. |

---

## CRITICAL

None.

## WARNING

1. **[Plan §Task 3, "overrideRoutineRunOutcome"]** The write-then-overwrite pattern (endSession commits outcome "success", then overrideRoutineRunOutcome changes it to "budget_exhausted") creates a window where the routine_run has incorrect data. If overrideRoutineRunOutcome fails (DB error, connection drop), the run is permanently recorded as "success" when it was actually budget-stopped. **Fix**: Either (a) wrap both writes in a transaction, or (b) pass the desired outcome through to `updateRoutineRunOnSessionEnd` by adding an optional `routineRunOutcome` parameter to `endSession` — this is more invasive but correct. At minimum, document that the override failure is acceptable (budget_exhausted is informational, not billing-critical).

2. **[Plan §Task 1, "Schema migration"]** Adding `costCapMonthlyCurrency` creates an inconsistency: `costCapPerRunMinor` has no corresponding currency column, but `costCapMonthlyMinor` would. Either add `costCapPerRunCurrency` too (for consistency) or drop `costCapMonthlyCurrency` (both caps inherit the factory's single currency). **Fix**: Drop `costCapMonthlyCurrency`. The factory is single-currency (Risk #4 says so explicitly). Adding a currency column to only one of two parallel cap fields creates confusion about whether currency matters.

3. **[Plan §Task 4, "POST /:id/trigger"]** The HTTP response shape for monthly-cap-blocked manual triggers is not specified. When checkAndFireRoutine returns `{ fired: false, reason: "monthly cost cap reached" }`, that internal shape needs translation to an HTTP response. **Fix**: Specify: `return c.json({ routineId, fired: false, reason: "monthly_budget_exhausted" }, 200)` — matching the coalescing pattern at line 502 of routines-routes.ts.

## SUGGESTION

1. **[Plan §Task 3, "budgetExhausted flag"]** The plan adds `budgetExhausted` as a separate boolean alongside existing `crashed`. Consider instead using a discriminated union or a single `exitReason: "completed" | "crashed" | "budget_exhausted"` to avoid the two-flag state space (what if both `crashed` and `budgetExhausted` are true?). This is minor since the plan's logic sets `budgetExhausted = true; break` which exits before `crashed` can be set in the catch block, but a single exit-reason variable is clearer.

2. **[Plan §Task 6, "avgCostPerRun"]** The plan computes avgCostPerRun from `allRuns` (the 20 most recent) but then acknowledges in Risk #1 that it should be from ALL runs. The Task 6 code snippet uses `runsWithCost = allRuns.filter(...)` which contradicts Risk #1. **Fix**: Use a separate `SELECT AVG(cost_minor) FROM routine_runs WHERE routine_id = :id AND cost_minor > 0` aggregate query, as Risk #1 recommends. Update the Task 6 code snippet to match.

3. **[Plan §Task 6, "costThisMonth"]** When `costThisMonthMinor === 0`, the plan returns `{ minor: 0, currency: "USD" }` (not null). But the RoutineBudget type says `costThisMonth: WireMoney | null` with the doc "Null when no runs this month." Zero cost and no runs are different states — a run with zero cost is not the same as no runs. The plan should decide: null for no-runs, `{ minor: 0 }` for runs-with-zero-cost? Or always return the WireMoney (never null for costThisMonth)?

4. **[Plan §Design-it-twice]** The plan correctly rejects Option B (extending C7 hierarchy with a routine level). Good decision. No action needed — noted for the record.

## What is Working Well

1. **Plan reconciliation table.** The 12-row "spec vs reality" table at the top is an exemplary artifact. Every assumption is verified against the actual codebase with a specific file/line reference. This eliminates the #1 failure mode (CC-007, spec/codebase drift) and should be the standard for all architecture plans.

2. **Design-it-twice on the per-run cap integration point.** This is a genuine two-option comparison with honest trade-offs, not a straw man. Option B (extending C7 hierarchy) is a real architectural alternative that a reasonable engineer might choose. The rejection reason is clear and correct.

3. **Risks and ambiguities section.** Five specific risks, each with a stated resolution. Risk #5 (empty IN clause) is the kind of edge case that only surfaces after deployment — catching it at plan time saves a bug report.
