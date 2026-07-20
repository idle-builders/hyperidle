# routine — Service-as-Product Re-Architecture (AU20, both lenses)

Layer: core-api · Substrate: **owned-tables** (`routines`, `routineRuns`) · Consumers: settings, dispatch, session-requests, tool-handlers (+ HTTP routes) · Verdict: **STANDALONE leaf product**

> "Store routine definitions and their run history; answer who's due, what's running, and what it cost."

---

## 1. INSIDE-OUT (anchor)

**Substrate kind: (a) OWNED DB TABLES.** Two tables, no external system, no free-standing algorithm. This is a plain data product — the floor is CRUD over the two tables, and the shape is dictated by them, not by any caller.

### The tables
- **`routines`** — routine config: `teamId`, `active`, `triggerType` (`calendar`/`heartbeat`/`continuous`/…), `nextRunAt`, schedule fields, `costActualMinor`/`costActualCurrency`, `deletedAt` (soft-delete), summary fields.
- **`routineRuns`** — run history: `routineId`, `outcome` (`running`/…), `startedAt`, `costMinor`. Append-only history — rows are never hard-deleted.

### The floor (5×tables = 10 anchor; realistic 8)
Plain CRUD per table — create / get / list / update / delete:

| Table | create | get | list | update | delete |
|---|---|---|---|---|---|
| `routines` | insertRoutine | getRoutine | listRoutines | updateRoutine | *(soft-delete = `updateRoutine({deletedAt})`, no hard delete)* |
| `routineRuns` | insertRoutineRun | getRoutineRun | listRoutineRuns | updateRoutineRun | *(history — never deleted)* |

5×2 = **10** is the substrate anchor. Both hard-deletes fold away (routines soft-delete through `updateRoutine`; runs are immutable history), so the **real CRUD floor is 8**.

### Genuine owned capabilities beyond the floor (+3)
1. **`incrementRoutineCost`** — atomic `coalesce(costActualMinor,0)+delta` accumulator. Owns the one raw-SQL fragment on `routines.costActualMinor` so no caller imports the table to build coalesce. A real in-service capability (concurrent cost accumulation), not a caller convenience.
2. **`sumRunCost`** — cost aggregation over `routineRuns` (`kind:"sum"` = `coalesce(sum(costMinor),0)`; `kind:"avg"` = `round(avg(costMinor))` over cost-bearing runs). Owns the `sum`/`avg` SQL; the run-cost analytics the product genuinely owns.
3. **`humanizeSchedule`** — pure cron/schedule → human label. No DB; derived purely from the routine's own schedule config. Routine's own display concern.

Everything else a consumer wants is a **WHERE-predicate on one of the two tables** → absorbed by the two `list(filter)` builders, never a new method.

---

## 2. OUTSIDE-IN (real demand)

From the consumer data (22 requests across 4 modelled services + HTTP routes), the demand is narrow and repetitive:

- **settings** → `listRoutines` (team config listing).
- **dispatch** (scheduler, heaviest consumer) → `insertRoutine`, `getRoutine`, `updateRoutine`, `insertRoutineRun`, `findRunningRoutineRun`, `listActiveRoutines`, `listScheduledRoutinesMissingNextRunAt`, `sumRoutineRunCostSince`.
- **session-requests** → `getRoutineRun`, `getRoutine`, `updateRoutineRunIfRunning`.
- **tool-handlers** → `insertRoutine`, `getRoutine`, `updateRoutine`.

Every request is one of: get-by-id · filtered list · insert · patch · cost sum. The demand is **CRUD + a filtered list + cost aggregation** — exactly the inside-out floor. No consumer needs anything the tables don't already offer. The historical sprawl came from encoding each *predicate* (`listActive…`, `listScheduled…MissingNextRunAt`, `findRunning…`) and each *aggregation* (`avg…`, `sum…Since`, `sum…ForRoutinesSince`) as its own method — fragmentation, not new capability.

---

## 3. THE COHERENT PRODUCT API (fused)

### Routines
1. **`insertRoutine(exec, values, opts?)`** — create. `opts { onConflictDoNothing? }` inline. *(inside-out: routines.create · demand: dispatch/tool-handlers)*
2. **`getRoutine(exec, id)`** — by-id full row. *(routines.read · session-requests/dispatch/tool-handlers)*
3. **`listRoutines(exec, filter?)`** — `filter { teamId?, active?, triggerType?, missingNextRunAt?, includeDeleted? }`. One WHERE builder; every routine read is a predicate here. `missingNextRunAt` = the active + schedulable + `nextRunAt IS NULL` compound. Count = `.length`. *(routines.list — fuses settings' listRoutines + dispatch's listActive/listScheduledMissing)*
4. **`updateRoutine(exec, id, patch)`** — general setter; soft-delete is `updateRoutine(id,{deletedAt})`. *(routines.update/delete · dispatch/tool-handlers)*
5. **`incrementRoutineCost(exec, id, deltaMinor, currency)`** — atomic cost accumulator (genuine capability; owns coalesce SQL). *(inside-out capability · dispatch/session-lifecycle)*

### Runs
6. **`insertRoutineRun(exec, values)`** — create. *(routineRuns.create · dispatch)*
7. **`getRoutineRun(exec, id)`** — by-id. *(routineRuns.read · session-requests)*
8. **`listRoutineRuns(exec, filter?)`** — `filter { routineId?, running?, limit?, order? }`. "Find the running run" = `listRoutineRuns({routineId,running:true,limit:1})[0]`. *(routineRuns.list — fuses listByRoutine + findRunning)*
9. **`updateRoutineRun(exec, id, patch, opts?)`** — `opts { onlyIfRunning? }` (race-guard = one extra `eq(outcome,'running')` leg). *(routineRuns.update — fuses updateById + updateIfRunning · session-requests/dispatch)*
10. **`sumRunCost(exec, query)`** — `query { routineIds, since?, kind:"sum"|"avg" }`. Genuine run-cost analytics. *(inside-out capability — fuses the avg/sumSince/sumForRoutines trio · dispatch)*

### Display
11. **`humanizeSchedule(...)`** — pure schedule→label, no DB. *(inside-out display capability)*

### Types (4)
`Routine`, `RoutineRun` (row types callers genuinely need), `RoutinePatch`, `RoutineRunPatch` (update patch shapes). Filter/query shapes stay **inline** (structural — object literals, no import), adding zero exports. With `incrementRoutineCost` owning the only raw-SQL patch case, `RoutinePatch`/`RoutineRunPatch` narrow from `T|SQL` back to `Partial<New…>` (no caller ever hand-builds SQL again).

---

## 4. TARGET NUMBERS

- **Substrate:** owned-tables (2).
- **Floor:** 10 (5×2 anchor); realistic CRUD = **8** (both hard-deletes fold: soft-delete via update, runs immutable).
- **Target methods: 11** = 8 CRUD + 3 genuine owned capabilities (`incrementRoutineCost`, `sumRunCost`, `humanizeSchedule`). Every one above the floor is justified by an owned table's column-SQL or an owned pure algorithm — none is per-caller.
- **Target types: 4** — `Routine`, `RoutineRun`, `RoutinePatch`, `RoutineRunPatch`. Filters inline.

### What gets DELETED (fragmentation → parameters), net 24 → 11
- 5 routine-read methods (`listRoutines`-old, `listRoutinesByTeam`, `listActiveRoutines`, `listScheduledRoutinesMissingNextRunAt`, `countRoutinesByTeam`) → **`listRoutines(filter)`** (count = `.length`).
- 2 run-read methods (`listRoutineRunsByRoutine`, `findRunningRoutineRun`) → **`listRoutineRuns(filter)`**.
- 2 run-write methods (`updateRoutineRunById`, `updateRoutineRunIfRunning`) → **`updateRoutineRun(…, {onlyIfRunning?})`**.
- 3 cost aggregators (`avgRoutineRunCost`, `sumRoutineRunCostSince`, `sumRoutineRunCostForRoutinesSince`) → **`sumRunCost({routineIds, since?, kind})`**.
- `InsertRoutineOpts` named type → inline `opts` on `insertRoutine`.
- `getRoutineById`/`getRoutineRunById`/`updateRoutineById` → renamed to the un-suffixed forms.

These are **fragmentation removals** (one method per predicate/aggregation), not capability removals.

---

## 5. LEAN *AND* COMPLETE — coverage proof

Every current real feature is still deliverable through the 11:
- Settings routine list → `listRoutines({teamId})`.
- Scheduler "who's due" → `listRoutines({active:true, missingNextRunAt:true})` / `listRoutines({active:true})`.
- Scheduler by trigger → `listRoutines({teamId, triggerType})`.
- "What's running" → `listRoutineRuns({routineId, running:true, limit:1})[0]`.
- Race-safe run finish → `updateRoutineRun(id, patch, {onlyIfRunning:true})`.
- Cost roll-ups (team/window, sum & avg) → `sumRunCost({routineIds, since?, kind})`.
- Live cost accumulation → `incrementRoutineCost`.
- Schedule display → `humanizeSchedule`.
- Create/patch/soft-delete routines & create/patch runs → the CRUD five/four.

New demand absorbs as **arguments, not methods**: "paused routines" = `listRoutines({active:false})`; "runs in a window" = add `since?`/`until?` to the run filter (one field, all callers benefit). Export count stays flat as consumers multiply — sub-linear.

**Note:** this service was already collapsed toward its floor in the AU20 Am2 pass and sits at the coherent target. The both-lens re-derivation from the owned-tables substrate independently lands on the same 11 — confirming the boundary and the surface are earned, not merely trimmed from the outside.
