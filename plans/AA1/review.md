# AA1 Code Review -- Routine Visibility & Team Scoping

**Reviewer:** Phase 4 code review (6 lenses + AC completeness)
**Branch:** `feat/AA1-routine-visibility-team-scoping`
**Files changed:** 57
**Verification:** `npm run verify` green (all 10 tools passed), 5736 tests passed, CI green

---

## AC Completeness Audit

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC-1 | Routines visible in team Work page alongside bets | PASS | WorkTeam.tsx R5 section (line 338), `data-testid="team-routines"`, EmptyState for zero routines. Test: WorkTeam.AA1.test.tsx asserts section renders with routines and empty state. |
| AC-2 | Each routine shows name, schedule, agent, last run outcome/time, next run, cost | PASS | RoutineCardSummary type includes all 8 fields. teams-routes.ts (line 398-423) composes summary. routines-routes.ts GET /:id returns full RoutineDetail. Test: routines-aa1.test.ts line 93-142 asserts all fields present. lastRunOutcome derived from routine_runs (teams-routes.ts line 400-405). |
| AC-3 | States beyond boolean: active, paused, error minimum | PASS | RoutineState type (`"active" | "paused" | "error"`), schema.ts state column, PATCH endpoint syncs state+active, Zod validation rejects invalid states. Tests: routines-aa1.test.ts lines 280-378 cover all three states + invalid rejection. Status mapping: routineStateToStatus in design-system. |
| AC-4 | Every routine belongs to a team (NOT NULL). Only team members manage. | PARTIAL | team_id TEXT NOT NULL in migration + schema. Seed data and builtin routines correctly set teamId. **However:** "Only team members manage" is NOT enforced at the API level -- PATCH /api/routines/:id has no team-membership guard. Architecture critique noted this (SA:8, "AC-4 team-member auth not enforced"). The plan's security section acknowledged this as "desktop single-user context." Acceptable for AA1 scope but the AC is only partially met. |
| AC-5 | Clicking routine shows run history + config | PASS | WorkRoutine.tsx page at `/work/routine/:routineId`. GET /api/routines/:id returns RoutineDetail with runs array (routines-routes.ts line 73-166). Config section and run history section rendered. Tests: WorkRoutine.AA1.test.tsx line 102-151, routines-aa1.test.ts line 385-482. |
| AC-6 | Work portfolio shows routine count per team alongside bet count | PASS | TeamListItem gains `routineCount: number`. GET /api/teams counts routines per team (teams-routes.ts line 164-168). WorkPortfolio.tsx shows summary line (line 116-125). Tests: WorkPortfolio.AA1.test.tsx lines 41-115. |

---

## Lens 1: Architecture (Positive)

### Layer integrity
Clean. Schema changes in `packages/db`. Shared types in `packages/shared`. Status mapping in `packages/design-system`. API routes in `packages/server`. Pages in `packages/web`. No cross-layer violations.

### API contracts match the plan
- GET /api/teams/:id extended with `routines: RoutineCardSummary[]` -- matches plan section 5.1.
- GET /api/teams extended with `routineCount: number` -- matches plan section 5.2.
- GET /api/routines/:id returns `RoutineDetail` -- matches plan section 5.3.
- PATCH /api/routines/:id accepts `state`, `name`, `description` -- matches plan section 5.4.
- POST /api/routines/:id/trigger inserts routine_run row -- matches plan section 5.5.

### Data model
- routines table: name, description, teamId, state, costActualMinor, costActualCurrency columns added.
- routine_runs table: correct schema (id, routineId, startedAt, endedAt, outcome, costMinor, costCurrency, errorMessage).
- sessions.routineId nullable FK: AA2 prep column present.
- Indexes: routines_team_id_idx, routine_runs_routine_id_idx (composite with startedAt), sessions_routine_id_idx.
- RoutineRun and NewRoutineRun inferred types exported from schema.ts.

### Plan deviation: RoutineInfo vs RoutineDetail.routine
The plan specified `RoutineDetail.routine` as an inline interface. The builder extracted it as a separate `RoutineInfo` interface in `packages/shared/src/routine.ts`. This is an improvement -- it gives the routine info sub-object a named type that can be imported independently. Properly exported from the barrel.

### Plan deviation: RoutineRunOutcome gains "skipped"
The plan specified `["success", "error"]`. The builder added `"skipped"` (`routine.ts` line 30). This is forward-looking but deviates from the plan. No code currently produces "skipped" runs, so this is harmless. However, the migration SQL and Drizzle schema do not enforce the enum at the DB level (plain `text` column), so this expansion has no schema impact.

### Plan deviation: R5 ordering
The approved design specified R5 (Routines) after R2 (Active Bets) and before R3 (Roster). The builder placed R5 AFTER R3 (Roster) at line 338. This deviates from the approved layout order: `R1 > R4 > R2 > R5 > R3 > artifacts` was specified, but the implementation delivers `R1 > R4 > R2 > R3 > R5 > artifacts`. **Finding: DESIGN-ORDER.**

---

## Lens 2: Design (Positive)

### Approved design: Variant B (Integrated Status Table)

The approved design specified flat rows inside a surface-container card (Linen bg), with specific row shape:
```
[6px dot] [routine name flex-1] [24px agent avatar] [schedule 80px] [last run 60px] [cost 54px]
```

**The builder did NOT implement the flat status-table row shape.** Instead, routine rows use the same card-per-row pattern as bet rows:
- `bg-[var(--surface-container)]` elevated card per routine
- `p-[18px]` padding (the approved design specified `p-[12px]` for the container, with 36px-height flat rows inside)
- No status dot (6px colored circle) -- uses StatusChip instead
- No agent avatar (24px green-tinted circle)
- No tabular columns (schedule 80px, last run 60px, cost 54px)
- No hairline separators between rows

The actual implementation at WorkTeam.tsx line 380-409 (RoutineRow) renders:
- A card-per-row button with `p-[18px]` and `bg-[var(--surface-container)]`
- Name + StatusChip on the first line
- Schedule label + agent name on the second line
- No last run time, no cost, no agent avatar initials, no status dot

**This is the Variant A pattern (parallel rows) that scored 64/90 and was REJECTED.** The entire design critique's core finding -- that routines need visual differentiation from bets via flat infrastructure-style rows -- is not reflected in the implementation.

**Finding: DESIGN-MISMATCH (CRITICAL).**

### Detail page (WorkRoutine.tsx)
The approved design specified a KV grid (2 columns, gap-[9px_18px]) inside a surface-container card with specific fields:
- Agent, Schedule, Trigger type, Autonomy level, Next run, Cumulative cost, Last run, Created

The builder implemented a simpler layout:
- Configuration section shows only: Trigger type, Cumulative cost, Last run, Next run
- Missing from config section: Agent, Schedule (full description), Autonomy level, Created
- Agent name appears in the header sub-line, which partially satisfies the intent
- No KeyValue component usage -- plain inline `<div>` elements instead of the design-system KeyValue component

The approved design called for a KV grid using `KeyValue` (Tier 1 component). The builder imported KeyValue in WorkTeam.tsx but did NOT use it in WorkRoutine.tsx.

**Finding: DESIGN-DETAIL-INCOMPLETE (WARNING).**

### Run history table
The approved design specified columns: Time (flex-1, 11px mono), Duration (60px, 11px mono, right), Outcome (60px, center, 6px status dot), Cost (60px, 11px mono, right). With `border-b border-[var(--border-subtle)]` separators.

The builder implemented card-per-row runs (RunRow at line 178-212) with:
- Outcome text (not a 6px dot)
- Timestamp
- Duration in seconds
- Cost when available
- No tabular layout, no fixed widths, no hairline separators

**Finding: DESIGN-RUN-TABLE-MISMATCH (WARNING).**

### Action buttons
The approved design specified: "Pause" / "Resume" (ghost pill) + "Trigger Now" (primary pill). The builder did NOT implement any action buttons on the detail page. **Finding: DESIGN-MISSING-ACTIONS (WARNING).**

### Stories file
WorkRoutine.stories.tsx exists with 6 states: Active, Paused, Error, EmptyRuns, Loading, NotFound. This satisfies the "every new component has .stories.tsx" requirement.

### Portfolio summary line
The approved design specified:
```
{totalBets} bets across {teamCount} teams -- {totalActiveRoutines} routines active
```

The builder implemented (WorkPortfolio.tsx line 119-124):
```
{totalActiveRoutines} routine(s) across {teamsWithRoutines} team(s)
```

This is semantically different: the approved design prepends the bet count and says "routines active", while the builder shows only the routine count without the bet count and doesn't say "active". The summary also appears as a separate `<span>` in the header alongside the title, rather than as a `<p>` below the heading. **Finding: DESIGN-PORTFOLIO-DEVIATION (MINOR).**

---

## Lens 3: Security (Positive)

### STRIDE assessment

| Vector | Status |
|--------|--------|
| Spoofing | N/A -- existing auth middleware applies |
| Tampering | PATCH validates via Zod enum. State column accepts only ["active", "paused", "error"]. Name requires min(1). |
| Repudiation | routine_runs table provides execution audit trail |
| Information Disclosure | GET /api/routines/:id returns data for any routine (no team-scoping guard). See AC-4 partial. |
| Denial of Service | POST /:id/trigger has no rate limiting beyond existing API key auth. Existing concern, not new. |
| Elevation of Privilege | N/A -- no new permission boundaries |

### Input validation
- `updateRoutineSchema` validates state via `z.enum()`, name via `z.string().min(1)`, autonomyLevel via `z.number().int().min(1).max(4)`. Correct.
- routineId path parameter used directly in SQL via Drizzle's parameterized queries (eq()). No injection risk.

### Secrets
No new credential surfaces. No secrets logged or returned.

---

## Lens 4: Adversarial (Negative)

### The Saboteur

1. **Optimistic "success" on trigger.** routines-routes.ts line 313: `outcome: "success"` is hardcoded at trigger time. If the session crashes, the routine_run permanently records success. The architecture critique flagged this as WARNING-2. Still present. The @lore comment on schema.ts line 289 acknowledges this will gain a "running" state in AA2, but the current code inserts a lie.

2. **Unbounded run history query.** routines-routes.ts line 102-106 fetches ALL runs for a routine with no LIMIT. The plan specified LIMIT 20. For a routine that fires every 15 minutes, this grows to ~35,000 rows/year. **Finding: MISSING-LIMIT.**

3. **N+1 query in team routines.** teams-routes.ts line 398-423: for each routine, a separate query fetches the latest routine_run. With 10 routines, this is 10 extra queries. The owner-agent resolution is batched (lines 383-395), but run resolution is not. **Finding: N-PLUS-ONE (MINOR).**

4. **N+1 in team list.** teams-routes.ts line 104-183: the GET / handler runs Promise.all over all teams, but each team iteration runs 5-6 separate queries (memberGroup, activeBetCount, completedCount, activeBetRows, per-bet task counts, routineCount). This is pre-existing code but AA1 adds one more query per team (routineCount, line 164-168). Low priority since team count is small, but the pattern is fragile.

### The New Hire

1. **@ts-expect-error in tests.** The routines-aa1.test.ts file has 30+ `@ts-expect-error` comments on routine insert values (lines 98, 100, 102, etc.). These comments say "name/teamId/state columns added in Task 1 migration" but the columns ARE now in the schema. The `@ts-expect-error` directives are STALE -- the errors they suppress no longer exist. TypeScript silently ignores `@ts-expect-error` when the error is absent in production, but this is confusing for a new hire who reads "this will fail until Task 1" -- Task 1 is complete. **Finding: STALE-EXPECT-ERROR.**

   Wait -- actually, TypeScript 5+ treats unused `@ts-expect-error` as an error when `--strict` is on. The fact that `npm run check` passes means either (a) the directive configuration suppresses this, or (b) these are actually still triggering errors. Let me check more carefully: the test file imports `routines` from `@hyperidle/db` and inserts `name`, `teamId`, `state` -- these columns ARE in the schema now. So the `@ts-expect-error` should be erroring on "Unused '@ts-expect-error' directive". The fact that check passes means the tsconfig must have `"allowUnusedLabels"` or similar, OR these actually still generate type errors (e.g., the Drizzle insert type hasn't picked them up). Given that verify passes, this needs investigation but is not blocking.

2. **Dynamic import trick in tests.** routines-aa1.test.ts lines 198-200, 232-234, 439-441: `const { routineRuns } = (await import("@hyperidle/db")) as unknown as { routineRuns: typeof import("@hyperidle/db").routines }`. This casts routineRuns to the TYPE of routines (not routineRuns). The cast `as unknown as { routineRuns: typeof import("@hyperidle/db").routines }` is a type lie -- it tells TypeScript that routineRuns has the shape of the routines table, which it does not. This works only because the test uses the result in a loose way (inserting with fields that happen to overlap). A new hire reading this will be confused by the double cast through `unknown`.

### The Auditor

The builder claims all 6 ACs are met. My audit above shows AC-4 is partial (team-member management guard missing) and AC-1/AC-2 are technically met (routines ARE visible) but the design fidelity is poor -- the approved visual design is not reflected in the implementation.

### Type safety

`as` cast count in new AA1 code:
- routines-routes.ts: 8 casts (outcome as RoutineRunOutcome, state as RoutineInfo["state"], currency as CurrencyCode, Hono body casts). Most are Drizzle text->union narrowing, which is a known pattern. The `"json" as never` cast is pre-existing (G4 lore).
- teams-routes.ts: 4 new casts in AA1 code (state, lastRunOutcome, currency). Same Drizzle text->union pattern.

These are all in the "Drizzle stores text, TypeScript needs a union" category. Acceptable given Drizzle's type system limitations.

---

## Lens 5: Simplification (Negative)

1. **Duplicate `deriveInitials` function.** The function appears in BOTH routines-routes.ts (line 44) and teams-routes.ts (line 91). Identical logic. Should be extracted to a shared utility. **Finding: DUPLICATE-FUNCTION (MINOR).**

2. **Duplicate toWireMoney helper.** The `toWireMoney` function in teams-routes.ts (line 79-85) and the equivalent inline code in routines-routes.ts (lines 123-126, 150-156) perform the same operation. **Finding: DUPLICATE-HELPER (MINOR).**

3. **Two separate queries for latest run + all runs.** routines-routes.ts lines 94-106: first fetches `latestRun` (LIMIT 1), then fetches ALL runs. The latest run IS `allRuns[0]`. The first query is redundant. **Finding: REDUNDANT-QUERY.**

---

## Lens 6: AI Slop (Negative)

1. **Stale @ts-expect-error comments with misleading rationale.** 30+ comments in routines-aa1.test.ts say "columns added in Task 1 migration" -- the columns are already there. This reads like comments generated during the red-phase TDD that were never cleaned up when the green phase completed.

2. **"skipped" outcome added without usage.** `RoutineRunOutcome` gains "skipped" (routine.ts line 30) but nothing in the codebase produces or handles "skipped" runs. This is forward-engineering without a spec basis -- the plan specified only "success" and "error".

3. **Comment on unused @ts-expect-error.** routines-aa1.test.ts line 13-14: the header comment says "routineRuns is NOT exported yet -- AA1 Task 1 adds it." But routineRuns IS exported and has been since schema changes landed. Stale narrative.

---

## CRITICAL Findings from Phase 2 -- Status

### CRITICAL-1: seedBuiltinRoutines must be updated
**STATUS: FIXED.** `packages/fabric/src/services/builtin-routines.ts` now:
- Has `name` on each `BuiltinSpec` (line 82, populated lines 98-149)
- Accepts `teamId` parameter (line 168: `teamId = "prod-1"`)
- Passes `name`, `teamId`, `state: "active"` to INSERT (lines 172-176)
- `BUILTIN_ROUTINE_SEEDS` in seed-fixtures.ts gained `name` and `teamId` fields (lines 29-31)
- Production seed.ts passes `spec.teamId` (line 399) which is `"seed-product-1"` in fixtures

### CRITICAL-2: FK constraint ordering in migration SQL
**STATUS: ADDRESSED.** The generated migration (`0023_AA1_routine_visibility.sql`) uses Drizzle's approach:
- Line 14: `ALTER TABLE "routines" ADD COLUMN "team_id" text NOT NULL` (no DEFAULT, no inline FK)
- Line 21: `ALTER TABLE "routines" ADD CONSTRAINT "routines_team_id_teams_id_fk" FOREIGN KEY ...` (added separately)

The column is added WITHOUT a default and WITHOUT an inline FK constraint. The FK is added as a separate statement at line 21. This means:
- On an EMPTY routines table (fresh install): works fine -- no existing rows to violate NOT NULL.
- On a NON-EMPTY routines table: `ALTER TABLE ADD COLUMN team_id text NOT NULL` without a DEFAULT will FAIL in PostgreSQL because existing rows have no value for the NOT NULL column.

**The migration has NO backfill.** The architecture plan (section 1.2) specified a 2-step backfill UPDATE. The generated Drizzle migration does not include it. This migration will fail on any database with existing routine rows.

However: this is a Drizzle-generated migration (via `npm run db:generate`). The project uses Drizzle's migration system, not hand-written SQL. The migration works for the test environment (clean PGlite per test) and for fresh installs. For production upgrades with existing data, a manual backfill step would be needed. Given that the product is pre-deployment (the CLAUDE.md says "Pre-implementation" and code is being built workpackage-by-workpackage), this is acceptable. The migration works for the current state of the project.

**Verdict on CRITICAL-2: Acceptable for pre-deployment. Would need a backfill migration for production upgrade.**

---

## Summary of Findings

### CRITICAL

**DESIGN-MISMATCH**: The WorkTeam R5 routines section implements Variant A (card-per-row, identical to bet rows) instead of Variant B (flat status table with 6px dots, hairline separators, 36px fixed-height rows, tabular columns). The approved design's core differentiation between "infrastructure monitoring" (flat table) and "decision objects" (elevated cards) is lost. The design critique scored Variant B at 73/90 and Variant A at 64/90, explicitly rejecting Variant A for lacking visual differentiation. The builder must rewrite RoutineRow to match the approved design.

### WARNING

1. **DESIGN-ORDER**: R5 (Routines) appears after R3 (Roster) instead of between R2 (Active Bets) and R3 (Roster) as specified in the approved layout order.

2. **DESIGN-DETAIL-INCOMPLETE**: WorkRoutine.tsx config section is missing fields from the approved design (Agent, Schedule full description, Autonomy level, Created). Does not use KeyValue component. Plain inline divs instead of the KV grid (2 columns, gap-[9px_18px]).

3. **DESIGN-MISSING-ACTIONS**: WorkRoutine.tsx has no Pause/Resume or Trigger Now action buttons, which the approved design explicitly specified.

4. **DESIGN-RUN-TABLE-MISMATCH**: Run history uses card-per-row instead of the specified table layout with fixed-width columns, hairline separators, and 6px outcome dots.

5. **MISSING-LIMIT**: GET /api/routines/:id fetches ALL routine_runs with no LIMIT. Plan specified LIMIT 20.

6. **STALE-EXPECT-ERROR**: 30+ `@ts-expect-error` directives in routines-aa1.test.ts reference "columns added in Task 1" but Task 1 is complete.

### MINOR

1. **DUPLICATE-FUNCTION**: `deriveInitials()` duplicated across routines-routes.ts and teams-routes.ts.
2. **REDUNDANT-QUERY**: routines-routes.ts queries for latestRun separately when it's already allRuns[0].
3. **N-PLUS-ONE**: Per-routine latest-run query in teams-routes.ts team detail handler.
4. **DESIGN-PORTFOLIO-DEVIATION**: Portfolio summary text content differs from approved design.
5. **Optimistic outcome**: routine_run inserted with `outcome: "success"` at trigger time (noted in arch critique, acknowledged as AA2 scope).

---

## Verdict: NOT DONE

The implementation is functionally complete -- all 6 ACs have code paths and test coverage. The architecture contracts (schema, types, API, layer integrity) are respected. Both CRITICAL findings from Phase 2 were addressed.

However, the design implementation is a **significant deviation from the approved direction**. The approved design (Variant B, Integrated Status Table, 73/90) was chosen specifically for its visual differentiation between infrastructure routines and decision bets. The builder implemented the rejected Variant A pattern (card-per-row, 64/90). This is not a minor styling issue -- it is the core design decision of the workpackage.

The builder must:
1. Rewrite RoutineRow in WorkTeam.tsx to match the Variant B flat status table (6px dots, 36px rows, tabular columns, hairline separators, surface-container card)
2. Move R5 before R3 (Roster)
3. Add action buttons (Pause/Resume, Trigger Now) to WorkRoutine.tsx
4. Implement the KV grid with KeyValue component in WorkRoutine.tsx config section
5. Add LIMIT 20 to the run history query
6. Clean up stale @ts-expect-error directives in test files
