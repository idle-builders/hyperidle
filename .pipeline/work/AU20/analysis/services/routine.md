# routine — Service-as-Product Audit (AU20)

Layer: core-api · Owned tables: `routines`, `routineRuns` · Current exports: 24 · Consumers: 7 services (+ HTTP routes)

## 1. Existence / Consolidation Verdict — **STANDALONE**

`routine` is a genuine leaf domain product. Routines are one of the five first-class process
primitives (Teams / Bets / Tasks / Sessions / **Routines**); this service is the sole owner of the
two tables that back them (`routines` config + `routineRuns` history). It has real, broad demand:
7 service consumers (settings, context-assembly, dispatch, lifecycle-projection, session-lifecycle,
session-requests, tool-handlers) plus HTTP routes (`routines-routes.ts`, `teams-routes.ts`) that the
service census doesn't model but the source comments enumerate. That is not a table-ownership
artifact — it is a coherent product: *"store routine definitions and their run history; answer who's
due, what's running, and what did it cost."*

**Candidate cluster: [] (none) — confirmed.** The landscape pass proposed no neighbor for `routine`,
and that's right. The obvious "merge with the thing that runs it" temptation is `dispatch`, but the
AU19 catalog's separation claim holds up under challenge: `dispatch` owns *scheduling decisions*
(when should a routine fire — cron/due-eval, builtin handlers, the scheduler loop) and consumes
`routine` as a data dependency. Folding data-ownership into the scheduler would drag a stateful
CRUD/history store into a service already flagged (AU20 landscape) for bundling 5 jobs — the wrong
direction. `routine` correctly stays the passive data product; `dispatch` stays the active policy.
Zero outbound edges is the tell of a clean leaf, not of a service too small to exist — the demand is
real and multi-consumer.

Verdict: **standalone**. The boundary is earned. The work is entirely INSIDE — the current surface
is per-call-site sprawl, not a coherent API.

## 2. The Deliberate Target Public API

The real demand (22 requests) is narrow and repetitive: get-by-id, filtered lists, insert, patch,
and cost sums. The 24 exports fragment that into a bespoke method per predicate. Collapse to **~15
exports (11 functions + 4 types)**.

### Routines
1. **`getRoutine(exec, id)`** — by-id full row. *(replaces `getRoutineById`)*
2. **`listRoutines(exec, filter)`** — `filter { teamId?, active?, triggerType?, missingNextRunAt?, includeDeleted? }`.
   Every routine read is `select from routines where <predicate>`; this parameterizes the predicate.
   *(replaces `listRoutines`, `listRoutinesByTeam`, `listActiveRoutines`,
   `listScheduledRoutinesMissingNextRunAt`, and `countRoutinesByTeam` — a team's count is
   `listRoutines({teamId}).length`; routine counts per team are tiny, no dedicated COUNT query earns
   its own export at MVP tier.)*
3. **`insertRoutine(exec, values, opts?)`** — `opts { onConflictDoNothing? }` inline (drop the named
   `InsertRoutineOpts` export).
4. **`updateRoutine(exec, id, patch)`** — *(renames `updateRoutineById`)*
5. **`incrementRoutineCost(exec, id, deltaMinor, currency)`** — atomic `coalesce(cost,0)+delta`
   accumulator. **Keeps its own method deliberately**: it owns the `routines.costActualMinor` column
   ref + coalesce SQL so no caller has to import the table to build the fragment. This is a real
   in-service capability, not per-caller sprawl.

### Runs
6. **`getRoutineRun(exec, id)`** — *(replaces `getRoutineRunById`)*
7. **`listRoutineRuns(exec, filter)`** — `filter { routineId?, running?, limit?, order? }`.
   *(replaces `listRoutineRunsByRoutine` and `findRunningRoutineRun` — the "find the running run" is
   just `listRoutineRuns({ routineId, running: true, limit: 1 })[0]`.)*
8. **`insertRoutineRun(exec, values)`**
9. **`updateRoutineRun(exec, id, patch, opts?)`** — `opts { onlyIfRunning? }`. The race-guard is one
   extra `eq(outcome,"running")` predicate, not a second method.
   *(replaces `updateRoutineRunById` + `updateRoutineRunIfRunning`.)*
10. **`sumRunCost(exec, query)`** — `query { routineIds, since?, kind: "sum" | "avg" }` → number.
    Collapses the run-cost-aggregation trio the landscape pass called out. All three are
    `aggregate(costMinor) over runs where routineId in (…) [and startedAt >= since]`; `kind` picks
    sum vs avg (avg additionally filters `costMinor > 0`). *(replaces `avgRoutineRunCost`,
    `sumRoutineRunCostSince`, `sumRoutineRunCostForRoutinesSince`.)*

### Display
11. **`humanizeSchedule(...)`** — pure cron→label helper, no DB. Routine's own display concern; keep.

### Types (4)
`Routine`, `RoutineRun`, `RoutinePatch`, `RoutineRunPatch`. Filter/query shapes stay **inline**
(structural typing — consumers pass object literals, no import needed), so they add no exports.

**Target export count: ~15** (down from 24).

## 3. INSIDE Lens

- **One filter builder per entity.** `listRoutines` and `listRoutineRuns` each compose their WHERE
  from an optional-field filter object — a new predicate is a new `if (filter.x) legs.push(...)`
  branch, never a new file/export. The predicate zoo becomes data.
- **Column refs stay private.** `incrementRoutineCost` and `sumRunCost` own every raw-SQL fragment
  (`coalesce`, `sum`, `avg`), so the `routines`/`routineRuns` table objects never leak past the
  barrel — the AU19 Table-ACL invariant holds by construction.
- **Narrow the patch types.** `RoutinePatch`/`RoutineRunPatch` currently widen to `T | SQL` only so a
  caller could pass a raw cost-accumulation fragment. With `incrementRoutineCost` owning that one
  case, the `| SQL` widening can drop back to `Partial<NewRoutine>` — removing the last reason a
  caller would ever hand-build SQL.

## 4. Scaling Argument (sub-linear)

Apply the test: add dozens of consumers and hundreds of calls — how many new methods?
- "list paused routines" → `listRoutines({ active: false })`. No new method.
- "routines of trigger X for team T" → `listRoutines({ teamId, triggerType })`. No new method.
- "runs in a window" → add `since?`/`until?` to the run filter — one field, all callers benefit.
- "avg cost across a team's routines this month" → `sumRunCost({ routineIds, since, kind: "avg" })`.
  No new method.

Contrast the current surface: it grew `listActiveRoutines`, then
`listScheduledRoutinesMissingNextRunAt`, then would grow `listPausedRoutines`, `listByTriggerType`…
— **one method per predicate, linear in use cases**. The parameterized `list(filter)` /
`sumRunCost(query)` shape absorbs new use cases as new *arguments*, so the export count stays flat
while consumers multiply. Sub-linear: proven.

## 5. Key Collapses

- **5 routine reads → `listRoutines(filter)` + `getRoutine`.** `listRoutines`, `listRoutinesByTeam`,
  `listActiveRoutines`, `listScheduledRoutinesMissingNextRunAt`, `countRoutinesByTeam` → one filtered
  list (count via `.length`).
- **2 run reads → `listRoutineRuns(filter)`.** `findRunningRoutineRun` is `{running:true,limit:1}`.
- **2 run writes → `updateRoutineRun(…, {onlyIfRunning?})`.** The race-guard is a flag, not a twin.
- **3 cost aggregators → `sumRunCost({routineIds, since?, kind})`.** The trio the landscape steer
  named, collapsed to one parameterized query.
- **Drop `InsertRoutineOpts` as a named export** (inline the one `onConflictDoNothing` flag).
- Net: 24 → ~15.
