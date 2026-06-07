# AA3 — Routine Cost & Appetite Model — Design Brief

DESIGN-CLASS: routine  ref=WorkTeam(R4),WorkRoutine,RoutineCreateDialog  pattern=none-needed

## Story

As a founder, I want each routine to have cost caps (per-run and per-month) and to see aggregate routine costs alongside bet costs — so recurring agent work does not silently consume more than it is worth.

## Classification rationale

Both axes match:
1. **Existing component reference** — extends three existing surfaces: WorkTeam R4 "Burn vs Cap" section (add routine cost line), WorkRoutine detail (add budget section), RoutineCreateDialog (add monthly cap field).
2. **Pattern match** — all UI composes from existing primitives: KeyValue, Progress, formatMoney, DaisyUI inputs. No new shapes.

Result: **routine** — 1 variant with "did we consider" checks.

## AC to UI surface mapping

| AC | Surface | Change |
|----|---------|--------|
| AC1 | RoutineCreateDialog + PATCH endpoint | Add `costCapMonthlyMinor` field parallel to existing `costCapPerRunMinor` |
| AC2 | No UI (backend enforcement) | Session terminates with "budget_exhausted" — RunRow shows amber dot |
| AC3 | No UI (backend enforcement) | Session skipped with "monthly_budget_exhausted" — RunRow shows amber dot |
| AC4 | WorkTeam R4 "Burn vs Cap" | Add routine cost line alongside bet cost |
| AC5 | WorkRoutine detail | Add Budget section: avg cost/run, cost this month, utilization bars |

## Interrogation — settled by existing code

All probes are answered by the codebase:

1. **Who is doing this?** A founder/team lead scanning the WorkTeam page to understand cost breakdown. Settled: the R4 section is the cost decision surface.
2. **Smallest UI surface?** Three additions to existing pages. No new pages, no new components. Settled.
3. **Primary state?** Populated (routines with runs). Empty state only for "no runs yet" which shows dashes. Settled.
4. **New primitive?** No. Extension of existing patterns. Settled.
5. **Overflow/truncation?** Cost values use formatMoney (fixed width). No truncation concern. Settled.
6. **Compose from?** KeyValue, Progress, formatMoney, DaisyUI input. All exist. Settled.

No probes needed — proceeding directly to variant.
