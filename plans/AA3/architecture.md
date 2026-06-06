# AA3 — Routine Cost & Appetite Model — Architecture Plan

## Required reading

The builder must read these files before implementing:

- `plans/AA3/design/approved.md` — visual contract (fixed, do not re-litigate)
- `packages/db/src/schema.ts` — routines and routineRuns table definitions
- `packages/fabric/src/services/cost-cap.ts` — C7 cost cap enforcement
- `packages/fabric/src/services/routine-scheduler.ts` — scheduler firing logic
- `packages/server/src/services/session-provisioning.ts` — cost_update event loop (lines 540-615)
- `packages/server/src/services/session-lifecycle.ts` — endSession/crashSession + updateRoutineRunOnSessionEnd
- `packages/server/src/routes/routines-routes.ts` — CRUD + trigger endpoints
- `packages/server/src/routes/teams-routes.ts` — GET /:teamId (TeamDetail assembly, lines 291-471)
- `packages/shared/src/routine.ts` — RoutineInfo, RoutineDetail, RoutineRunOutcome types
- `packages/shared/src/team.ts` — TeamBurn, TeamDetail types
- `packages/web/src/pages/WorkTeam.tsx` — R4 section + RoutineRow
- `packages/web/src/pages/WorkRoutine.tsx` — detail page + RunRow
- `packages/web/src/pages/work/RoutineCreateDialog.tsx` — create form

---

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| `costCapPerRunMinor` exists on routines table | YES — schema.ts line 284, nullable integer | Use as-is |
| `costCapMonthlyMinor` exists on routines table | NO — does not exist anywhere | Add via schema + migration (Task 1) |
| `budget_exhausted` / `monthly_budget_exhausted` outcomes exist | NO — RoutineRunOutcome is 5 values | Add to type union + const array (Task 2) |
| `RoutineBudget` type exists | NO | Create in shared/src/routine.ts (Task 2) |
| `TeamBurn.betCostActual` and `TeamBurn.routineCostThisMonth` exist | NO — TeamBurn has only costActual, costCap, capacity, activeBets | Add to TeamBurn type (Task 2) |
| `recordCostAndCheck` knows about routine per-run caps | NO — it only checks agent/team/factory hierarchy | Add routine-level check (Task 3) |
| `checkAndFireRoutine` checks monthly cap | NO — only checks factory cost cap | Add monthly cap check (Task 4) |
| Session provisioning terminates on per-run cap breach | NO — cost_update loop has no per-run cap awareness | Add per-run cap termination (Task 3) |
| WorkRoutine shows Budget section | NO — shows Config + Last Run Summary + Run History | Add Budget section (Task 6) |
| RoutineCreateDialog has monthly cap field | NO — only has per-run cap field | Add monthly cap field (Task 7) |
| Teams-routes computes bet vs routine cost breakdown | NO — returns single costActual | Add breakdown computation (Task 5) |

---

## Phase 0 — Interrogation (settled)

All questions are pinned by the spec, approved design, and existing code:

1. **Per-run cap enforcement mechanism?** Settled: hook into the cost_update event loop in session-provisioning.ts. When `totalCostCents >= perRunCap`, set `crashed = true` and break the loop. The session ends with outcome "budget_exhausted" instead of "completed."

2. **Monthly cap enforcement timing?** Settled: check at fire time (before session creation), not during the session. The scheduler (checkAndFireRoutine) and the trigger endpoint (POST /:id/trigger) both check monthly spend before creating a session.

3. **Where does monthly aggregation happen?** Settled: server-side in the GET /api/routines/:id endpoint (budget stats) and in teams-routes.ts (aggregate routine cost for TeamBurn).

4. **How does the cost_update loop learn the per-run cap?** The routine's `costCapPerRunMinor` is read from the DB at session provisioning time and passed through to the event loop via a new field on the provisioning context.

---

## Acceptance criteria + verification

### AC1: Per-run and per-month cost caps on routines

**Schema:** `costCapMonthlyMinor` (nullable integer) and `costCapMonthlyCurrency` (nullable text) columns on the `routines` table. Parallels existing `costCapPerRunMinor`.

**Verification:**
- `npm run check` passes (type system confirms columns exist and are typed correctly)
- Integration test: POST /api/routines with `costCapMonthlyMinor: 2500` returns 201 with the value persisted. PATCH /api/routines/:id with `costCapMonthlyMinor: null` clears the cap.

### AC2: Per-run cap terminates session with "budget_exhausted"

**Mechanism:** In session-provisioning.ts, the cost_update event handler (line 550-575) checks `totalCostCents >= routinePerRunCap` after each cost accumulation. When breached, set a `budgetExhausted = true` flag and break the event loop. The session outcome becomes "budget_exhausted" instead of "completed". The routine_run outcome is also "budget_exhausted".

**Verification:**
- Unit test in cost-cap or session-provisioning tests: mock a routine session with per-run cap of 50 cents. Emit cost_update events totaling 55 cents. Assert the session ends with outcome "budget_exhausted" and the routine_run row has outcome "budget_exhausted".

### AC3: Monthly cap skips sessions with "monthly_budget_exhausted"

**Mechanism:** In `checkAndFireRoutine` (routine-scheduler.ts) and in the POST /:id/trigger route, before creating a session: query `SUM(routineRuns.costMinor) WHERE routineId = :id AND startedAt >= first-of-current-month`. If the sum >= `costCapMonthlyMinor`, skip the run and insert a routine_run row with outcome "monthly_budget_exhausted".

**Verification:**
- Unit test: create a routine with monthly cap of 1000 (= $10.00). Insert routine_runs totaling 1050 for the current month. Call checkAndFireRoutine. Assert it returns `{ fired: false, reason: "monthly cost cap reached" }` and a routine_run row with outcome "monthly_budget_exhausted" is inserted.

### AC4: Team Work page shows aggregate routine cost alongside bet cost

**Mechanism:** In teams-routes.ts GET /:teamId, compute:
- `betCostActual`: SUM of `bets.costActualMinor` WHERE `teamId = :id AND status = 'active'`
- `routineCostThisMonth`: SUM of `routineRuns.costMinor` WHERE `routineRuns.routineId` IN (team's routines) AND `routineRuns.startedAt >= first-of-current-month`

Add both to the TeamBurn response object.

**Verification:**
- Integration test: seed a team with 2 active bets ($5 + $3 costActualMinor), 2 routines with 3 runs this month ($2 + $1 + $3). GET /api/teams/:id. Assert `burn.betCostActual.minor === 800`, `burn.routineCostThisMonth.minor === 600`.

### AC5: Routine detail shows avg cost, monthly cost, budget utilization

**Mechanism:** In routines-routes.ts GET /:id, compute:
- `avgCostPerRun`: AVG of `routineRuns.costMinor` WHERE costMinor IS NOT NULL AND costMinor > 0
- `costThisMonth`: SUM of `routineRuns.costMinor` WHERE `startedAt >= first-of-current-month`
- `perRunUtilizationPercent`: if costCapPerRun set, `(lastRunCost / costCapPerRunMinor) * 100`
- `monthlyUtilizationPercent`: if costCapMonthly set, `(costThisMonth / costCapMonthlyMinor) * 100`

Return as `budget: RoutineBudget` on the RoutineDetail response.

**Verification:**
- Integration test: create routine with per-run cap 100 and monthly cap 500. Insert 3 runs: cost 80, 90, 30 (this month). GET /api/routines/:id. Assert `budget.avgCostPerRun.minor === 67`, `budget.costThisMonth.minor === 200`, `budget.perRunUtilizationPercent === 30` (30/100*100), `budget.monthlyUtilizationPercent === 40` (200/500*100).

---

## Ordered task list

### Task 1: Schema migration — add monthly cost cap columns

**Files:**
- `packages/db/src/schema.ts` — add `costCapMonthlyMinor` and `costCapMonthlyCurrency` to routines table
- `packages/db/drizzle/0025_AA3_routine_cost_caps.sql` — generated migration

**Changes:**
```typescript
// In routines table definition, after costCapPerRunMinor:
/** AA3: Optional per-month cost ceiling in minor units. NULL = no cap. */
costCapMonthlyMinor: integer("cost_cap_monthly_minor"),
/** AA3: Currency code for costCapMonthlyMinor. */
costCapMonthlyCurrency: text("cost_cap_monthly_currency"),
```

**Depends on:** nothing

**Test:** Migration runs without error. `npm run check` confirms types.

---

### Task 2: Shared types — RoutineBudget, extended TeamBurn, new outcomes

**Files:**
- `packages/shared/src/routine.ts` — add RoutineBudget type, extend RoutineRunOutcome, add to RoutineDetail
- `packages/shared/src/team.ts` — add betCostActual + routineCostThisMonth to TeamBurn
- `packages/shared/src/index.ts` — export RoutineBudget

**Type signatures:**

```typescript
// routine.ts additions:

export type RoutineRunOutcome =
  | "success" | "error" | "skipped" | "running" | "timeout"
  | "budget_exhausted"             // AA3: per-run cap hit
  | "monthly_budget_exhausted";    // AA3: monthly cap hit

export const ROUTINE_RUN_OUTCOMES: readonly RoutineRunOutcome[] = [
  "success", "error", "skipped", "running", "timeout",
  "budget_exhausted", "monthly_budget_exhausted",
] as const;

export interface RoutineBudget {
  /** Mean of completed routineRuns.costMinor (where costMinor > 0). Null when no runs with cost. */
  avgCostPerRun: WireMoney | null;
  /** SUM routineRuns.costMinor for the current calendar month. Null when no runs this month. */
  costThisMonth: WireMoney | null;
  /** From routines.costCapPerRunMinor. Null = no cap. */
  costCapPerRun: WireMoney | null;
  /** From routines.costCapMonthlyMinor. Null = no cap. */
  costCapMonthly: WireMoney | null;
  /** Last completed run cost / per-run cap * 100. Null when no per-run cap. */
  perRunUtilizationPercent: number | null;
  /** This month cost / monthly cap * 100. Null when no monthly cap. */
  monthlyUtilizationPercent: number | null;
}

export interface RoutineDetail {
  routine: RoutineInfo;
  runs: RoutineRunSummary[];
  budget: RoutineBudget;  // AA3: add budget stats
}

// RoutineInfo additions (for PATCH response):
export interface RoutineInfo {
  // ... existing fields ...
  costCapMonthly: WireMoney | null;  // AA3: monthly cap
}

// RoutineCreatePayload additions:
export interface RoutineCreatePayload {
  // ... existing fields ...
  costCapMonthlyMinor?: number | null;  // AA3: monthly cap
}

// team.ts additions to TeamBurn:
export interface TeamBurn {
  costActual: WireMoney | null;           // existing
  costCap: WireMoney | null;              // existing
  capacity: number;                        // existing
  activeBets: number;                      // existing
  betCostActual: WireMoney | null;         // AA3: sum of active bets' costActualMinor
  routineCostThisMonth: WireMoney | null;  // AA3: sum of routine runs this calendar month
}
```

**Depends on:** nothing (types only, no runtime deps)

**Test:** `npm run check` passes.

---

### Task 3: Per-run cap enforcement in session provisioning

**Files:**
- `packages/server/src/services/session-provisioning.ts` — add per-run cap check in cost_update loop

**Mechanism:**

1. At the start of `provisionSession`, if `params.routineId` is set, read the routine's `costCapPerRunMinor` from the DB. Store it in a local variable `routinePerRunCap: number | null`.

2. In the cost_update event handler (after line 561 `totalCostCents += ...`), add:

```typescript
// AA3: per-run cost cap enforcement for routine sessions.
if (routinePerRunCap != null && totalCostCents >= routinePerRunCap) {
  budgetExhausted = true;
  break;
}
```

3. Add a `let budgetExhausted = false;` alongside the existing `let crashed = false;` (line ~500).

4. After the event loop exits, check `budgetExhausted`:

```typescript
if (budgetExhausted) {
  // Terminate gracefully with budget_exhausted outcome.
  // Use endSession (not crashSession) — this is a policy stop, not an error.
  await endSession(db, eventBus, sessionContext, totalCostCents, 0);
  // Override the routine_run outcome from "success" to "budget_exhausted".
  if (params.routineId) {
    await overrideRoutineRunOutcome(db, params.routineId, "budget_exhausted");
  }
  return { sessionId, outcome: "budget_exhausted", totalCostCents, ... };
}
```

5. Add a small helper `overrideRoutineRunOutcome` in session-lifecycle.ts that updates the most recent routine_run row for this routineId from "success" to "budget_exhausted". (Because `endSession` already calls `updateRoutineRunOnSessionEnd` with outcome "success", we override it.)

**Alternative considered: modify endSession to accept a custom outcome.** This would be cleaner but changes the endSession signature, which is called from multiple places. Overriding after the fact is simpler and localized. The write is idempotent — if the row is already "budget_exhausted", the update is a no-op.

**Depends on:** Task 1 (schema column), Task 2 (outcome type)

**Test:** Unit test mocking the event stream. Create a routine session with per-run cap 50. Emit cost_updates summing to 55. Assert:
- Session state = "done" (graceful end)
- Session outcome = "budget_exhausted"
- Routine run outcome = "budget_exhausted"

---

### Task 4: Monthly cap enforcement in scheduler and trigger

**Files:**
- `packages/fabric/src/services/routine-scheduler.ts` — add monthly cap check in checkAndFireRoutine
- `packages/server/src/routes/routines-routes.ts` — add monthly cap check in POST /:id/trigger

**Mechanism:**

Add a helper function `isMonthlyCapReached`:

```typescript
// In routine-scheduler.ts (or a shared routine-cost.ts helper file)
export async function getRoutineMonthlySpend(
  db: HyperIdleDb,
  routineId: string,
): Promise<number> {
  const now = new Date();
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${routineRuns.costMinor}), 0)` })
    .from(routineRuns)
    .where(
      and(
        eq(routineRuns.routineId, routineId),
        gte(routineRuns.startedAt, firstOfMonth),
      )
    )
    .limit(1);
  
  return row?.total ?? 0;
}
```

In `checkAndFireRoutine`, after the factory cost cap check (line ~348):

```typescript
// AA3: Check routine monthly cost cap
if (routine.costCapMonthlyMinor != null) {
  const monthlySpend = await getRoutineMonthlySpend(db, routine.id);
  if (monthlySpend >= routine.costCapMonthlyMinor) {
    // Insert a skipped run record
    const runId = crypto.randomUUID();
    await db.insert(routineRuns).values({
      id: runId,
      routineId: routine.id,
      startedAt: now.toISOString(),
      outcome: "monthly_budget_exhausted",
    });
    const nextRunAt = computeNextRunAt(routine, now);
    await db.update(routines).set({ nextRunAt }).where(eq(routines.id, routine.id));
    return { fired: false, reason: "monthly cost cap reached" };
  }
}
```

Same check in POST /:id/trigger (routines-routes.ts), before the coalescing check.

**Depends on:** Task 1 (schema column), Task 2 (outcome type)

**Test:** Unit test:
- Create routine with monthly cap 1000.
- Insert 3 routine_runs with startedAt in current month, costMinor 400+400+300 = 1100.
- Call checkAndFireRoutine. Assert: `{ fired: false, reason: "monthly cost cap reached" }`.
- Assert a routine_run row with outcome "monthly_budget_exhausted" was inserted.

---

### Task 5: Team endpoint — bet vs routine cost breakdown

**Files:**
- `packages/server/src/routes/teams-routes.ts` — compute betCostActual and routineCostThisMonth in GET /:teamId

**Mechanism:**

After loading `activeBetRows` (line 323-327), compute bet cost:

```typescript
// AA3: Sum of active bets' costActualMinor for bet cost breakdown
const betCostActualMinor = activeBetRows.reduce(
  (sum, bet) => sum + (bet.costActualMinor ?? 0), 0
);
```

After loading `routineRows` (line 363-367), compute routine monthly cost:

```typescript
// AA3: Sum of routine runs this calendar month for routine cost breakdown
const now = new Date();
const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

const [routineCostRow] = await db
  .select({ total: sql<number>`coalesce(sum(${routineRuns.costMinor}), 0)` })
  .from(routineRuns)
  .where(
    and(
      inArray(routineRuns.routineId, routineRows.map(r => r.id)),
      gte(routineRuns.startedAt, firstOfMonth),
    )
  )
  .limit(1);
const routineCostThisMonthMinor = routineCostRow?.total ?? 0;
```

Update the `burn` object in TeamDetail response:

```typescript
burn: {
  costActual: /* existing */,
  costCap: /* existing */,
  capacity: /* existing */,
  activeBets: /* existing */,
  betCostActual: betCostActualMinor > 0
    ? { minor: betCostActualMinor, currency: teamCurrency as CurrencyCode }
    : null,
  routineCostThisMonth: routineCostThisMonthMinor > 0
    ? { minor: routineCostThisMonthMinor, currency: teamCurrency as CurrencyCode }
    : null,
},
```

**Edge case:** When `routineRows` is empty, skip the SUM query (no routines = no routine cost). Return `routineCostThisMonth: null`.

**Depends on:** Task 2 (TeamBurn type)

**Test:** Integration test seeding bets with known costActualMinor and routineRuns with known costMinor within the current month. Assert the GET response has correct breakdowns.

---

### Task 6: Routines endpoint — budget stats

**Files:**
- `packages/server/src/routes/routines-routes.ts` — compute RoutineBudget in GET /:id

**Mechanism:**

After fetching `allRuns` (line 305-311), compute budget stats:

```typescript
// AA3: Compute budget stats
const now = new Date();
const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

// Runs with non-zero cost
const runsWithCost = allRuns.filter(r => r.costMinor != null && r.costMinor > 0);
const avgCostMinor = runsWithCost.length > 0
  ? Math.round(runsWithCost.reduce((sum, r) => sum + (r.costMinor ?? 0), 0) / runsWithCost.length)
  : null;

// This month cost — query ALL runs (not just the 20 in allRuns)
const [monthCostRow] = await db
  .select({ total: sql<number>`coalesce(sum(${routineRuns.costMinor}), 0)` })
  .from(routineRuns)
  .where(
    and(
      eq(routineRuns.routineId, routineId),
      gte(routineRuns.startedAt, firstOfMonth),
    )
  )
  .limit(1);
const costThisMonthMinor = monthCostRow?.total ?? 0;

// Last completed run cost (for per-run utilization)
const lastCompletedRun = allRuns.find(r =>
  r.costMinor != null && r.costMinor > 0 &&
  (r.outcome === "success" || r.outcome === "budget_exhausted")
);
const lastRunCostMinor = lastCompletedRun?.costMinor ?? null;

const perRunUtilizationPercent = (routine.costCapPerRunMinor != null && lastRunCostMinor != null)
  ? Math.round((lastRunCostMinor / routine.costCapPerRunMinor) * 100)
  : null;

const monthlyUtilizationPercent = (routine.costCapMonthlyMinor != null && costThisMonthMinor > 0)
  ? Math.round((costThisMonthMinor / routine.costCapMonthlyMinor) * 100)
  : null;

const budget: RoutineBudget = {
  avgCostPerRun: avgCostMinor != null ? { minor: avgCostMinor, currency: "USD" as CurrencyCode } : null,
  costThisMonth: { minor: costThisMonthMinor, currency: "USD" as CurrencyCode },
  costCapPerRun: routine.costCapPerRunMinor != null
    ? { minor: routine.costCapPerRunMinor, currency: "USD" as CurrencyCode } : null,
  costCapMonthly: routine.costCapMonthlyMinor != null
    ? { minor: routine.costCapMonthlyMinor, currency: "USD" as CurrencyCode } : null,
  perRunUtilizationPercent,
  monthlyUtilizationPercent,
};
```

Also: add `costCapMonthly` to the RoutineInfo object (alongside existing `costCapPerRun`).

Also: add `costCapMonthlyMinor` to the `createRoutineSchema` and `updateRoutineSchema` Zod schemas.

**Depends on:** Task 1 (schema), Task 2 (types)

**Test:** Integration test: create routine with per-run cap 100 and monthly cap 500. Insert runs with known costs. GET /api/routines/:id. Assert budget fields.

---

### Task 7: Frontend — WorkTeam R4, WorkRoutine Budget, RoutineCreateDialog, RunRow

**Files:**
- `packages/web/src/pages/WorkTeam.tsx` — R4 section cost breakdown
- `packages/web/src/pages/WorkRoutine.tsx` — Budget section + RunRow amber outcomes
- `packages/web/src/pages/work/RoutineCreateDialog.tsx` — monthly cap input
- `packages/web/src/hooks/useRoutine.ts` — may need type update for RoutineBudget

**WorkTeam R4 changes:**

Replace the single "Cost (actual)" KeyValue with three lines:

```tsx
<KeyValue label="Bet cost" value={formatMoney(burn.betCostActual)} />
<KeyValue label="Routine cost" value={
  burn.routineCostThisMonth
    ? `${formatMoney(burn.routineCostThisMonth)} (this month)`
    : "$0.00 (this month)"
} />
<KeyValue label="Total cost" value={formatMoney(burn.costActual)} />
```

**WorkRoutine Budget section:**

New section between Configuration and Last Run Summary:

```tsx
<section
  aria-label="Budget"
  className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px]"
  data-testid="routine-budget"
>
  <h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
    Budget
  </h2>
  <div className="flex flex-col gap-[9px]">
    <KeyValue label="Avg cost per run" value={budget.avgCostPerRun ? formatMoney(budget.avgCostPerRun) : "---"} />
    <KeyValue label="Cost this month" value={formatMoney(budget.costThisMonth)} />
    <KeyValue label="Cost cap per run" value={budget.costCapPerRun ? formatMoney(budget.costCapPerRun) : "No cap"} />
    <KeyValue label="Monthly cap" value={budget.costCapMonthly ? formatMoney(budget.costCapMonthly) : "No cap"} />
  </div>
  {budget.perRunUtilizationPercent != null && (
    <div className="mt-[9px]">
      <Progress
        label="Per-run budget"
        value={budget.perRunUtilizationPercent}
        variant={budget.perRunUtilizationPercent > 80 ? "amber" : "green"}
      />
    </div>
  )}
  {budget.monthlyUtilizationPercent != null && (
    <div className="mt-[9px]">
      <Progress
        label="Monthly budget"
        value={budget.monthlyUtilizationPercent}
        variant={budget.monthlyUtilizationPercent > 80 ? "amber" : "green"}
      />
      {budget.monthlyUtilizationPercent >= 100 && (
        <p className="text-[11px] text-[var(--accent-secondary)] mt-[3px]">
          Monthly budget exhausted — runs skipped until next month
        </p>
      )}
    </div>
  )}
</section>
```

Also: remove "Cumulative cost" and "Cost cap per run" from the Configuration section (Budget section now owns all cost display, per approved design).

**RunRow amber outcomes:**

In the `dotColor` derivation in RunRow (WorkRoutine.tsx), add:

```typescript
const dotColor =
  run.outcome === "success"
    ? "var(--status-success)"
    : run.outcome === "error" || run.outcome === "timeout"
      ? "var(--status-error)"
      : run.outcome === "budget_exhausted" || run.outcome === "monthly_budget_exhausted"
        ? "var(--accent-secondary)"  // amber — policy stop
        : "var(--text-tertiary)";     // skipped, running
```

**RoutineCreateDialog:**

Add a monthly cap input below the existing per-run cap input. Same pattern:

```tsx
const [costCapMonthlyRaw, setCostCapMonthlyRaw] = useState("");

// In the form:
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

// In handleSubmit:
const costCapMonthlyMinor = costCapMonthlyRaw.trim()
  ? Math.round(Number.parseFloat(costCapMonthlyRaw.trim()) * 100)
  : null;
// Add to payload:
...(costCapMonthlyMinor !== null ? { costCapMonthlyMinor } : {}),
```

**Depends on:** Task 2 (types), Task 5 (team endpoint), Task 6 (routine endpoint)

**Test:**
- Playwright E2E or component test: navigate to WorkRoutine detail page with fixture data including budget. Assert Budget section renders avg cost, monthly cost, progress bars.
- Component test: RoutineCreateDialog renders monthly cap input; submitting with value sends costCapMonthlyMinor in POST body.

---

## Design-it-twice: per-run cap enforcement integration

### Option A: Hook into cost_update loop in session-provisioning.ts

Read the routine's `costCapPerRunMinor` at provisioning time. In the cost_update handler, after `totalCostCents += ...`, check `totalCostCents >= routinePerRunCap`. If true, break the loop and end the session with "budget_exhausted."

**Trade-off:** Modifies the session provisioning hot loop. But the check is a single integer comparison per cost_update event — negligible cost. Localized to one file.

**Reject reason for choosing this:** None — this is the chosen approach.

### Option B: Extend recordCostAndCheck in cost-cap.ts with a "routine" level

Add `routineId` and `routinePerRunCap` to `RecordCostAndCheckParams`. The existing agent -> team -> factory hierarchy gains a `routine` level that checks per-run spend. On breach, emit `cost_cap_breached` with `capLevel: "routine"`. The session provisioning loop already listens for `cost_cap_breached` events (indirectly via the event bus).

**Trade-off:** More elegant, reuses the C7 hierarchy. But adds a fourth level to a three-level hierarchy that was designed for agent/team/factory. The "routine" level is semantically different — it is per-session, not per-entity. It would require the session provisioning loop to listen for "routine"-level breach events and terminate, which is indirect and harder to reason about.

**Reject reason:** Over-engineering. The per-run cap is a simple integer comparison that belongs in the event loop, not a new level in the cost cap hierarchy.

### Decision: Option A

Per-run cap enforcement is a simple comparison in the cost_update loop. Monthly cap enforcement is a pre-flight check at fire time. Neither needs a new level in the C7 hierarchy.

---

## Security & abuse cases

| Case | Status | Resolution |
|---|---|---|
| Rate-limit on POST/PATCH | N/A | Existing endpoints, no new POST/PATCH routes created (existing ones gain new fields) |
| Input trust boundary | Applicable | `costCapMonthlyMinor` is validated by Zod: `z.number().int().min(0).nullable().optional()`. Same as existing `costCapPerRunMinor`. Negative values rejected at boundary. |
| Secret handling | N/A | No new credentials or secrets |
| Path traversal | N/A | No path inputs |
| SSRF | N/A | No outbound URLs |
| Integer overflow on monthly SUM | Applicable | PostgreSQL `sum()` returns `bigint` for integer columns. At 100 runs/day * $10/run * 31 days = ~$31,000/month = 3,100,000 cents — well within JavaScript's safe integer range. No overflow risk for realistic usage. |
| Agent sets own cost cap to MAX_INT | Applicable | Cost caps are set via human-facing routes (create/edit), not by agents. Agents do not have write access to routine cost cap fields in the current architecture. The PATCH endpoint is human-initiated. |

---

## Protected tests

```
protectedTests:
  - packages/server/src/__tests__/sessions.test.ts
  - packages/server/src/routes/__tests__/routines.test.ts
  - packages/server/src/routes/__tests__/teams.routes.test.ts
  - packages/server/src/routes/__tests__/products.test.ts
```

These existing test files must not have their existing assertions modified. New assertions can be added.

---

## Migration checklist

| Symbol | Change | Affected files |
|---|---|---|
| `RoutineRunOutcome` type | Add `budget_exhausted`, `monthly_budget_exhausted` | `packages/shared/src/routine.ts` |
| `ROUTINE_RUN_OUTCOMES` const | Add 2 values | `packages/shared/src/routine.ts` |
| `RoutineDetail` interface | Add `budget: RoutineBudget` | `packages/shared/src/routine.ts` |
| `RoutineInfo` interface | Add `costCapMonthly` | `packages/shared/src/routine.ts` |
| `RoutineCreatePayload` interface | Add `costCapMonthlyMinor` | `packages/shared/src/routine.ts` |
| `TeamBurn` interface | Add `betCostActual`, `routineCostThisMonth` | `packages/shared/src/team.ts` |
| `routines` table | Add 2 columns | `packages/db/src/schema.ts`, migration SQL |
| `createRoutineSchema` | Add `costCapMonthlyMinor` | `packages/server/src/routes/routines-routes.ts` |
| `updateRoutineSchema` | Add `costCapMonthlyMinor` | `packages/server/src/routes/routines-routes.ts` |
| WorkTeam R4 section | Replace single cost KV with 3 KVs | `packages/web/src/pages/WorkTeam.tsx` |
| WorkRoutine config section | Remove cost KVs (moved to Budget) | `packages/web/src/pages/WorkRoutine.tsx` |
| WorkRoutine page | Add Budget section | `packages/web/src/pages/WorkRoutine.tsx` |
| RunRow | Add amber dot for budget outcomes | `packages/web/src/pages/WorkRoutine.tsx` |
| RoutineCreateDialog | Add monthly cap input | `packages/web/src/pages/work/RoutineCreateDialog.tsx` |

---

## Risks and ambiguities

1. **avgCostPerRun from only 20 runs:** The GET /:id endpoint currently fetches only 20 most recent runs. The avg should be computed from ALL runs, not just the 20 displayed. Use a separate aggregate query.

2. **Monthly aggregation uses startedAt, not endedAt:** A run that starts on Jan 31 and ends on Feb 1 is counted in January's budget. This matches the mental model "I authorized this run in January" and avoids double-counting ambiguity.

3. **Per-run cap enforcement timing:** The cap is checked after each cost_update event, not continuously. A single large cost_update that jumps from $0.10 to $1.00 past a $0.50 cap will terminate the session at $1.00, not $0.50. This is acceptable — the cap is a budget guardrail, not a billing truncation mechanism. The alternative (rejecting individual API calls mid-stream) would require harness cooperation that does not exist.

4. **Currency mismatch:** All cost caps and costs are assumed to be in USD (single-currency factory in v1). The `costCapMonthlyCurrency` column exists for future multi-currency support but is not enforced at the comparison boundary. Same pattern as existing per-run cap.

5. **Empty routineRows in team SUM:** When a team has no routines, the SUM query should be skipped (not executed with an empty IN clause, which is a SQL error in some dialects). Guard with `if (routineRows.length > 0)`.
