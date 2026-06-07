# AA3 — Routine Cost & Appetite Model — Approved Design

DESIGN-CLASS: routine (single variant, no competing alternatives needed)

---

## Summary

Three incremental additions to existing surfaces. Zero new components. Zero new pages. All changes compose from KeyValue, Progress, formatMoney, and DaisyUI form primitives already in use.

---

## Surface 1: WorkTeam R4 "Burn vs Cap" — Aggregate cost breakdown

### Location

Inside the existing R4 "Burn vs Cap" section (`<section aria-label="Team burn vs cap">`), between the existing KeyValue rows and the progress bar.

### Changes

Replace the single "Cost (actual)" KeyValue with a three-line cost breakdown:

```
BURN VS CAP
───────────────────────────────────
Bet cost          $42.30
Routine cost      $12.80 (this month)
Total cost        $55.10
Cap               $100.00
Capacity          3 / 5
[===========================-------] 55%
```

**Component mapping:**
- `KeyValue label="Bet cost" value={formatMoney(burn.betCostActual)}` — existing bets.costActualMinor aggregated across active bets
- `KeyValue label="Routine cost" value={formatMoney(burn.routineCostThisMonth) + " (this month)"}` — new field, SUM of routineRuns.costMinor for current calendar month
- `KeyValue label="Total cost" value={formatMoney(burn.costActual)}` — renames existing "Cost (actual)". This is the team-level costActual (agent+routine combined)
- `KeyValue label="Cap"` — unchanged
- `KeyValue label="Capacity"` — unchanged
- DaisyUI `<progress>` bar — unchanged, reflects total cost vs cap

**Data changes to TeamBurn type:**
```typescript
export interface TeamBurn {
  costActual: WireMoney | null;      // existing — total team cost
  costCap: WireMoney | null;         // existing
  capacity: number;                   // existing
  activeBets: number;                 // existing
  betCostActual: WireMoney | null;    // NEW — sum of active bets' costActualMinor
  routineCostThisMonth: WireMoney | null; // NEW — sum of routine runs this calendar month
}
```

### States

- **No routines:** `Routine cost` row shows "$0.00 (this month)". Still visible — tells the lead "routines exist as a cost category, currently zero."
- **No bets:** `Bet cost` row shows "$0.00". Same logic.
- **No cap set:** Progress bar shows 0% with "Cost cap not set" aria-label (existing behavior).
- **Cap exceeded:** Progress bar at 100%. The total cost value uses default text color (no color override — status through the progress bar, not text).

### Why not a separate section?

The team lead's question is "what does this team cost?" Bets and routines are both cost lines under the same budget. A separate section forces the eye to scan farther and breaks the mental model of "one team, one budget."

---

## Surface 2: WorkRoutine detail — Budget section

### Location

New `<section aria-label="Budget">` inserted between the existing "Configuration" section and "Last Run Summary" section.

### Layout

```
BUDGET
───────────────────────────────────
Avg cost per run    $0.42
Cost this month     $12.80
Cost cap per run    $0.50
Monthly cap         $25.00

Per-run budget                  84%
[========================------]

Monthly budget                  51%
[==============-----------------]
```

**Component mapping:**
- `KeyValue label="Avg cost per run" value={formatMoney(budget.avgCostPerRun) ?? "---"}`
- `KeyValue label="Cost this month" value={formatMoney(budget.costThisMonth)}`
- `KeyValue label="Cost cap per run" value={budget.costCapPerRun ? formatMoney(budget.costCapPerRun) : "No cap"}`
- `KeyValue label="Monthly cap" value={budget.costCapMonthly ? formatMoney(budget.costCapMonthly) : "No cap"}`
- `Progress label="Per-run budget" value={budget.perRunUtilizationPercent} variant={budget.perRunUtilizationPercent > 80 ? "amber" : "green"}` — only when costCapPerRun is set
- `Progress label="Monthly budget" value={budget.monthlyUtilizationPercent} variant={budget.monthlyUtilizationPercent > 80 ? "amber" : "green"}` — only when costCapMonthly is set

**Section chrome:** Same as Config section — `rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px]`

### Data changes to RoutineDetail

Add a `budget` object to the RoutineDetail response (alongside `routine` and `runs`):

```typescript
export interface RoutineBudget {
  avgCostPerRun: WireMoney | null;           // mean of routineRuns.costMinor where costMinor > 0
  costThisMonth: WireMoney | null;           // SUM routineRuns.costMinor for current calendar month
  costCapPerRun: WireMoney | null;           // from routines.costCapPerRunMinor (existing)
  costCapMonthly: WireMoney | null;          // from routines.costCapMonthlyMinor (NEW schema column)
  perRunUtilizationPercent: number | null;    // last run cost / per-run cap * 100, null when no cap
  monthlyUtilizationPercent: number | null;   // this month cost / monthly cap * 100, null when no cap
}

export interface RoutineDetail {
  routine: RoutineInfo;
  runs: RoutineRunSummary[];
  budget: RoutineBudget;  // NEW
}
```

### States

| State | Avg cost | Monthly cost | Per-run bar | Monthly bar |
|-------|----------|--------------|-------------|-------------|
| No runs | "---" | "$0.00" | hidden or 0% | hidden or 0% |
| Runs, no caps | formatted | formatted | hidden | hidden |
| Runs, per-run cap only | formatted | formatted | visible (green/amber) | hidden |
| Runs, monthly cap only | formatted | formatted | hidden | visible (green/amber) |
| Both caps | formatted | formatted | visible | visible |
| Monthly exhausted | formatted | formatted | visible | 100% amber |

When monthly budget is exhausted (100%), add a text line below the progress bar:
```
<p className="text-[11px] text-[var(--accent-secondary)] mt-[3px]">Monthly budget exhausted — runs skipped until next month</p>
```

### Why a separate section from Configuration?

Configuration is settings (what you configure). Budget is live status (what is happening). Different concerns, different update cadences. The config section contains the cap *settings*; the budget section shows *utilization* against those settings plus computed stats. Mixing them produces a KV grid where some rows are editable settings and others are read-only metrics — confusing.

However, the "Cost cap per run" and "Monthly cap" KeyValues in the Budget section duplicate what is also in Configuration. Resolution: **move** the cost cap display from Configuration to Budget. The Configuration section drops "Cost cap per run" and "Cumulative cost" KeyValues. Budget owns all cost-related display. Configuration keeps: Agent, Schedule, Trigger type, Autonomy level, Next run, Last run, Created.

---

## Surface 3: RoutineCreateDialog — Monthly cap field

### Location

Below the existing "Cost cap per run (USD, optional)" input field.

### Design

Exact same pattern as the per-run field:

```html
<label className="flex flex-col gap-[3px]">
  <span className="text-xs text-[var(--text-tertiary)]">
    Monthly cost cap (USD, optional)
  </span>
  <input
    type="number"
    className="input input-bordered input-sm text-base w-full"
    value={costCapMonthlyRaw}
    onChange={(e) => setCostCapMonthlyRaw(e.target.value)}
    placeholder="e.g. 25.00"
    disabled={submitting}
    min="0"
    step="0.01"
    aria-label="Monthly cost cap"
  />
</label>
```

### PATCH endpoint

The existing `updateRoutineSchema` already accepts `costCapPerRunMinor`. Add `costCapMonthlyMinor` with the same validation:

```typescript
costCapMonthlyMinor: z.number().int().min(0).nullable().optional(),
```

---

## Surface 4: RunRow — New outcome colors

### New RoutineRunOutcome values

Add two new outcomes to the `RoutineRunOutcome` union:

```typescript
export type RoutineRunOutcome =
  | "success" | "error" | "skipped" | "running" | "timeout"
  | "budget_exhausted"          // NEW: per-run cap hit
  | "monthly_budget_exhausted"; // NEW: monthly cap hit
```

### RunRow dot color mapping

| Outcome | Dot color | Notes |
|---------|-----------|-------|
| success | `var(--status-success)` | green (existing) |
| error | `var(--status-error)` | red (existing) |
| skipped | `var(--text-tertiary)` | gray (existing) |
| running | `var(--text-tertiary)` | gray (existing) |
| timeout | `var(--status-error)` | red (existing) |
| budget_exhausted | `var(--accent-secondary)` | amber — policy stop, not error |
| monthly_budget_exhausted | `var(--accent-secondary)` | amber — policy stop, not error |

Amber is the correct choice per Hearth principle: amber is the "attention-drawing" accent (AESTHETICS.md AQ-011), and budget exhaustion is a policy-level attention signal, not an error. Using red would imply something broke; amber says "this was a deliberate stop."

---

## Surface 5: RoutineRow (WorkTeam) — No changes

The existing RoutineRow in WorkTeam shows cumulative cost in a 54px column. This is the most useful at-a-glance number for lifetime ROI. Monthly cost belongs on the detail page. No changes to RoutineRow.

---

## Rejected directions

1. **Monthly cost in RoutineRow** — rejected. The 54px column cannot fit "this month" context. Cumulative cost (lifetime) is more useful for ROI scanning. Monthly cost is a detail-page concern.
2. **Separate "Routine Costs" section in WorkTeam** — rejected. Bets and routines are both cost lines under one team budget. Separating them fragments the cost story.
3. **"budget_exhausted" as a routine state** — rejected. Budget exhaustion is a run outcome, not a routine lifecycle state. The routine stays active; it is the individual run or monthly period that is blocked. Adding a fourth state to the three-state lifecycle (active/paused/error) would create confusion about whether the routine is "broken" vs "budget-limited."
4. **Per-run utilization Progress bar showing live session spend** — rejected. Per-run utilization is ephemeral (only meaningful during a running session). Show it as a historical stat based on the last completed run's cost vs the cap. Monthly utilization is the more actionable metric.
5. **Color-coding the cost text when over budget** — rejected. Hearth uses status through content (dots, badges), not structural text color. The amber Progress bar at 100% plus the explanatory text line is sufficient.

---

## Component budget impact

**Zero new components.** All surfaces compose from:
- KeyValue (existing, Tier 0) — budget stats
- Progress (existing, Tier 0) — utilization bars
- formatMoney (existing, shared util) — cost formatting
- DaisyUI `input` (existing) — monthly cap field
- DaisyUI `progress` (existing, used in R4) — team burn bar

Component count remains at 19.

---

## Mobile adaptation

Desktop is the primary form factor. On mobile (three-tab layout):
- WorkTeam R4 section: KeyValue rows stack naturally (inline layout). No special adaptation needed.
- WorkRoutine Budget section: Same stacking. Progress bars are full-width, which works at any viewport.
- RoutineCreateDialog: Already a modal dialog with full-width inputs. Monthly cap field follows the same pattern.

---

## Open questions for the architect

1. **Schema migration**: Add `costCapMonthlyMinor` and `costCapMonthlyCurrency` to the routines table. Same nullable integer + text pattern as existing `costCapPerRunMinor`.
2. **Monthly aggregation query**: SUM of `routineRuns.costMinor` WHERE `routineRuns.routineId` in team's routines AND `routineRuns.startedAt` >= first-of-current-month. Calendar month boundary = UTC midnight on the 1st.
3. **Per-run cap enforcement integration**: How does `recordCostAndCheck` in cost-cap.ts learn about the routine's per-run cap? The session needs to know it is a routine session and what the cap is.
4. **Monthly cap enforcement timing**: The check happens at fire time in `checkAndFireRoutine` (or the trigger endpoint), not during the session. The scheduler sums current month spend and skips if over cap.
5. **Budget response computation**: The GET /api/routines/:id endpoint computes budget stats server-side (avg, monthly sum, utilization percentages) to avoid sending all run data to the client.
