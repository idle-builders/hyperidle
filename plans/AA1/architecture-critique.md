# AA1 Architecture Critique — Routine Visibility & Team Scoping

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:8 LI:9 AC:7 DM:7 N:8 MD:8 FMC:6 S:8 V:7

---

## Dimension Scores

### 1. Spec Alignment — 8/10

Every AC maps to at least one task:

| AC | Task(s) | Coverage |
|----|---------|----------|
| AC-1: Routines visible alongside bets | Task 7 (WorkTeam R5) | Full |
| AC-2: Name, schedule, agent, last run, next run, cost | Task 2 (types), Task 5 (API), Task 7 (UI) | Full |
| AC-3: States beyond boolean (active/paused/error) | Task 1 (schema), Task 2 (types), Task 3 (mapping) | Full |
| AC-4: Every routine belongs to a team (NOT NULL) | Task 1 (migration + backfill), Task 6 (seed) | Full |
| AC-5: Click shows run history + config | Task 8 (WorkRoutine page) | Full |
| AC-6: Portfolio shows routine count per team | Task 9 (WorkPortfolio) | Full |

The plan does not invent requirements beyond what the ACs demand. The AA2-prep columns (sessions.routine_id) are justified by the constraint "no incremental migrations across the track." The design-it-twice sections address real ambiguities. No scope creep detected.

One gap: AC-4 says "Only team members can manage a team's routines." The plan adds PATCH /api/routines/:id but does not describe any middleware or guard that restricts PATCH to team members. The existing API key auth is the only gate. This is noted in the security section as "API key based (existing pattern)" but the AC explicitly calls out team-membership-scoped management. This is either an AC that the plan intentionally defers (desktop single-user context) or a gap.

### 2. Layer Integrity — 9/10

The plan respects layer boundaries cleanly:
- Schema changes in `packages/db` (Data Layer)
- Shared types in `packages/shared` (contract boundary)
- Status mapping in `packages/design-system` (Human Interface)
- API routes in `packages/server` (Meta Layer)
- Frontend pages in `packages/web` (Human Interface)

No cross-layer violations. The `humanizeSchedule` utility lives in `packages/server/src/services/` -- correct placement since it serves the API response composition. The `routineStateToStatus` mapping lives in the design-system -- correct placement alongside the existing `betStatusToStatus`, `taskStateToStatus`, etc.

One minor observation: the plan puts `RoutineCardSummary` and `RoutineDetail` types in `packages/shared` rather than co-locating them in `packages/server` (where they're composed) or `packages/web` (where they're consumed). This is correct -- `packages/shared` is the wire-type contract boundary, which is where all TeamDetail/TeamListItem types live. Consistent.

### 3. API Contracts — 7/10

Routes are specified with HTTP method, path, and response shapes:

| Route | Method | Request | Response | Status codes |
|-------|--------|---------|----------|-------------|
| `/api/teams/:id` | GET | -- | TeamDetail (extended) | 200, 404, 500 |
| `/api/teams` | GET | -- | TeamListResponse (extended) | 200 |
| `/api/routines/:id` | GET | -- | RoutineDetail | 200, 404 |
| `/api/routines/:id` | PATCH | updateRoutineSchema | Routine row | 200, 404 |
| `/api/routines/:id/trigger` | POST | -- | session or run result | 201, 403, 404, 409 |

The RoutineDetail type is well-specified with field-by-field definitions in section 3.1. The RoutineCardSummary is similarly complete.

**Gaps:**

1. The `GET /api/routines/:id` response shape is `RoutineDetail` which contains `runs: RoutineRunSummary[]`. The plan says "LIMIT 20" for run history but this is not part of the type contract -- the consumer has no way to know there might be more runs or to paginate. For AA1 scope (max a few runs per routine), this is acceptable, but the limitation should be documented in the type's JSDoc.

2. The `lastRunOutcome` field in `RoutineCardSummary` is described as "derived from latest routine_run" in section 5.1 but the code sample shows `null` as a hardcoded placeholder (`/* derived from latest routine_run */ null`). The implementation needs to actually query the latest `routine_runs` row to populate this field. The plan acknowledges this needs work but does not specify the query.

3. The `PATCH /api/routines/:id` response shape is unspecified -- the plan shows the update schema but not the response type. Existing pattern returns the updated row, but for AA1 the row has new columns that the existing response shape does not include.

### 4. Data Model Alignment — 7/10

Schema changes are thorough:

**routines table additions:** name (TEXT NOT NULL DEFAULT ''), description (TEXT), team_id (TEXT NOT NULL DEFAULT '' FK -> teams), state (TEXT NOT NULL DEFAULT 'active'), cost_actual_minor (INTEGER), cost_actual_currency (TEXT). Index on team_id.

**routine_runs table:** id (TEXT PK), routine_id (TEXT NOT NULL FK -> routines ON DELETE RESTRICT), started_at (TEXT NOT NULL), ended_at (TEXT), outcome (TEXT NOT NULL), cost_minor (INTEGER), cost_currency (TEXT), error_message (TEXT). Composite index on (routine_id, started_at).

**sessions table:** routine_id (TEXT FK -> routines ON DELETE SET NULL). Index on routine_id.

**Issues:**

1. **Missing `createdAt` on routines.** The plan's RoutineDetail type includes `createdAt: string | null` with the comment "routines table has no createdAt yet -- nullable." But the migration does not add a `createdAt` column. The plan acknowledges the gap by making it nullable in the type, but this means the detail page's "Created" KV pair will always show null. The migration should add `created_at TEXT` (nullable, since existing rows have no creation timestamp) and backfill it with the current migration timestamp or leave null.

2. **Missing `createdAt` on routine_runs.** The `routine_runs` table has no `created_at` column. For an append-only log this is fine since `started_at` serves the same purpose, but all other tables in the schema have `createdAt`. This inconsistency is minor but worth noting for the builder.

3. **FK violation on `team_id NOT NULL DEFAULT ''`.** The plan uses `DEFAULT ''` for the new `team_id` column. This means the `ALTER TABLE ADD COLUMN` succeeds on existing rows (they get `''`). But `''` is not a valid team id, so the FK constraint `REFERENCES teams(id)` would be violated. The plan addresses this with the two-step backfill UPDATE in section 1.2 (step 1: agents with teams, step 2: factory-wide -> first team). But between the ADD COLUMN and the UPDATE, the FK is violated. In PostgreSQL, a NOT NULL + DEFAULT + FK added via ALTER TABLE in a migration will check the FK constraint at statement level. The migration must either: (a) add the column without the FK, backfill, then add the FK via ALTER TABLE ADD CONSTRAINT, or (b) use a transaction where all statements run before the constraint is checked (PG checks at transaction commit for DEFERRED constraints, but DEFAULT constraints are IMMEDIATE). The plan does not address this ordering concern.

4. **Duplicate FK definition in routine_runs SQL.** Section 1.3 defines `routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE RESTRICT` inline and then also adds `CONSTRAINT routine_runs_routine_fk FOREIGN KEY (routine_id) REFERENCES routines(id)`. This creates two FK constraints on the same column, which PostgreSQL will accept but is wasteful. One should be removed.

5. **`pgTable` vs `sqliteTable`.** The plan uses `pgTable` throughout. The CLAUDE.md says "Drizzle ORM (SQLite + PostgreSQL)" but the actual schema uses `pgTable`. This is consistent with reality (the codebase is PG-only as of the Phase 2 migration). No issue, just confirming.

### 5. Naming — 8/10

Names are honest and consistent:

- `RoutineState` parallels `TaskState`, `BetStatus`, `SessionState`. Good.
- `RoutineRunOutcome` parallels `SessionOutcome`. Good.
- `RoutineCardSummary` parallels `BetCardSummary`. Consistent naming convention.
- `RoutineDetail` parallels `TeamDetail`. Good.
- `routineStateToStatus` parallels `betStatusToStatus`, `taskStateToStatus`. Good.
- `humanizeSchedule` is descriptive and non-generic. Good.
- `ROUTINE_STATE_MAP` parallels `BET_STATUS_MAP`, `TASK_STATE_MAP`. Good.

One naming concern: `RoutineRunSummary` vs `RoutineRun` (the Drizzle inferred type). The plan exports both. `RoutineRun` is the full DB row type; `RoutineRunSummary` is the API response type (with `durationSeconds` computed from started_at/ended_at and `cost` as WireMoney). The naming distinction is clear. No conflict with existing closed vocabularies.

### 6. Module Depth — 8/10

The plan creates a minimal public surface:

- One new shared type file (`routine.ts`) with 5 types and 2 const tuples -- reasonable for a new primitive.
- One new status-mapping function + const -- mirrors the existing pattern exactly.
- One new server utility (`schedule-label.ts`) with one exported function -- deep module (complex cron parsing behind a single `humanizeSchedule()` call).
- One new API route (GET /api/routines/:id) + extensions to two existing routes -- minimal surface.
- One new page (WorkRoutine) + one new hook (useRoutine) + one section addition (WorkTeam R5) + one modification (WorkPortfolio summary).

No unnecessary abstractions. No premature generics. The RoutineRow is kept inline rather than promoted to a design-system component -- correct decision for a 4-row table.

### 7. Failure-Mode Coverage — 6/10

**Addressed:**
- Security section covers rate-limiting, input-trust, team-scoping, state manipulation.
- Error responses specified for 404 on GET /api/routines/:id.
- Empty/loading/error states specified for all UI surfaces.
- Validation on PATCH state field via Zod enum.

**Gaps:**

1. **`seedBuiltinRoutines` in `@hyperidle/fabric` is not mentioned.** This is the most critical gap. The plan lists 6 protected tests (routines.test.ts, builtin-routines.test.ts, etc.) and identifies that routines.test.ts needs seeding updates. But `seedBuiltinRoutines()` in `packages/fabric/src/services/builtin-routines.ts` is the function that creates all 5 builtin routines. After the migration adds `teamId NOT NULL`, `seedBuiltinRoutines` will insert routines without `teamId`, getting the default empty string, which violates the FK. The plan's Task 10 mentions updating test files that INSERT routines, but `seedBuiltinRoutines` is production code in `@hyperidle/fabric`, not a test file. It must be updated to include `name`, `teamId`, and `state` fields. The `BUILTIN_ROUTINE_SEEDS` in `seed-fixtures.ts` must gain these fields too (the plan mentions this in Task 6 but not the corresponding `seedBuiltinRoutines` consumer in fabric).

2. **The `routine-scheduler.test.ts` inserts routines directly.** The plan lists it as a protected test but does not mention that its `db.insert(routines).values({...})` calls will fail after the migration because they don't include `teamId`. Task 10 says "Update routine-scheduler.test.ts seeding" but does not describe what specifically needs to change (add teamId, name, state to every insert).

3. **`builtin-routines.test.ts` calls `seedBuiltinRoutines(db)`.** After the migration, this call will fail because `seedBuiltinRoutines` does not set `teamId`. The test does not insert routines directly -- it calls `seedBuiltinRoutines`. So the fix is in `seedBuiltinRoutines`, not in the test file. The plan's Task 10 says "Update `packages/server/src/__tests__/builtin-routines.test.ts` seeding" -- but the seeding in this test is via `seedBuiltinRoutines(db)`, not direct INSERT. The plan should identify that `seedBuiltinRoutines` must be updated in Task 6 (seed data update).

4. **No timeout/retry specified for the routine trigger endpoint.** POST /api/routines/:id/trigger creates a routine_run row with `outcome: "success"` optimistically. The plan notes "AA2 will update on session end." But if the session crashes, the routine_run row permanently records "success." There is no mechanism to update the outcome. This is not a failure-mode gap per se (AA2 scope), but the optimistic success is misleading -- it would be more honest to insert with `outcome: "pending"` or omit the outcome until session completion. The plan does not address this.

5. **Missing route in the protected-tests route-checklist.** The plan adds `GET /api/routines/:id` but does not enumerate which middleware applies (API key auth, rate limiting). The security section says "Auth is API key based (existing pattern)" -- but the routines router is already mounted under the auth middleware, so this is implicitly covered. Documenting it explicitly would be better.

### 8. Simplicity / Over-Engineering Risk — 8/10

The plan avoids over-engineering:

- No feature flags, no plugin points, no registries.
- No abstract base class for "WorkPrimitive" even though bets and routines share patterns.
- `humanizeSchedule` is a pure function with no dependencies -- minimal.
- RoutineRow is inline, not a design-system component.
- The design-it-twice sections are genuine tradeoff analyses, not theatre. Option B (pseudo-team) is a real alternative that was correctly rejected.

One minor concern: the plan keeps the `active` boolean for backward compatibility AND adds the `state` column. This means every PATCH to `state` must also sync `active`. This dual-write is complexity that exists solely for backward compat with code that reads `active`. The plan should enumerate exactly which files read `active` so the builder knows the blast radius. If only `team-management.ts` and the trigger endpoint check `active`, the backward compat shim might be unnecessary (just update those two files to read `state`).

### 9. Verifiability — 7/10

Each task has a verification method and most have named test files:

| Task | Test file | Assertions |
|------|-----------|------------|
| 1 (Schema) | routine-schema.test.ts | Insert with all fields, FK violations |
| 2 (Types) | npm run check | TypeScript compilation |
| 3 (Mapping) | status-mapping.test.ts | 3 state->status mappings |
| 4 (Schedule) | schedule-label.test.ts | 5 input->output pairs |
| 5 (API) | routines-aa1.test.ts | 7 API assertions |
| 6 (Seed) | npm run db:seed | No assertion -- just success |
| 7 (WorkTeam) | WorkTeam.AA1.test.tsx | 3 UI assertions |
| 8 (WorkRoutine) | WorkRoutine.AA1.test.tsx | 4 UI assertions |
| 9 (Portfolio) | WorkPortfolio.AA1.test.tsx | 2 UI assertions |
| 10 (Test seeding) | npm run test | All existing tests pass |

**Gaps:**

1. **Task 5 test for `lastRunOutcome` derivation.** The RoutineCardSummary includes `lastRunOutcome` which must be derived from the latest routine_run. No test assertion verifies this derivation. The routines-aa1.test.ts should include: "After inserting a routine_run with outcome='error', GET /api/teams/:id returns the routine with lastRunOutcome='error'."

2. **Task 6 has no test.** "npm run db:seed succeeds" is a verification method but not a test. The seed test should verify that after seeding, all routines have non-empty `teamId` and valid `name`. This would catch the `seedBuiltinRoutines` gap identified in Dimension 7.

3. **No test for the portfolio summary line content.** Task 9 test says "Summary line shows correct routine count" and "Summary line hidden when no routines" -- good. But it should also verify that `routineCount` in TeamListItem is actually populated from the API (not hardcoded to 0).

4. **Protected tests list is correct** but does not mention the `builtin-routines.test.ts` seeding path through `seedBuiltinRoutines`. As noted above, the protected test will fail not because its assertions changed but because `seedBuiltinRoutines` will violate the FK constraint.

---

## Findings

### CRITICAL

1. **[plan section 8, 9, 10] `seedBuiltinRoutines` in `@hyperidle/fabric` must be updated.** The function at `packages/fabric/src/services/builtin-routines.ts:154` inserts routines without `name`, `teamId`, or `state`. After the migration, `teamId NOT NULL DEFAULT ''` means the insert succeeds but the FK constraint on `teams(id)` is violated (no team with id `''` exists). This breaks:
   - Production seed flow (`npm run db:seed` calls `seedBuiltinRoutines`)
   - `builtin-routines.test.ts` (calls `seedBuiltinRoutines(db)` in beforeEach)
   
   **Fix:** Add `seedBuiltinRoutines` update to Task 6. The `BuiltinRoutineSeed` interface in `seed-fixtures.ts` must gain `name: string` and `teamId: string` fields. The `seedBuiltinRoutines` function must pass `name`, `teamId`, and `state` when inserting. The `teamId` for builtin routines should come from a parameter (the first team's id) rather than being hardcoded, since the test uses `"prod-1"` and the seed uses `"seed-product-1"`.

2. **[plan section 1.2] FK constraint ordering in migration.** Adding `team_id TEXT NOT NULL DEFAULT '' REFERENCES teams(id)` in one ALTER TABLE statement will fail in PostgreSQL because the default value `''` violates the FK immediately. The migration must: (a) add the column as `TEXT NOT NULL DEFAULT ''` without the FK, (b) run the backfill UPDATEs, (c) then add the FK constraint via `ALTER TABLE routines ADD CONSTRAINT routines_team_id_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT`. The plan's section 1.1 combines the column addition and FK in one statement -- this will fail on non-empty tables.

### WARNING

1. **[plan section 5.1] `lastRunOutcome` derivation is a placeholder.** The code sample shows `lastRunOutcome: /* derived from latest routine_run */ null`. The plan must specify the actual query: `SELECT outcome FROM routine_runs WHERE routine_id = :id ORDER BY started_at DESC LIMIT 1`. Without this, the builder will either skip the derivation or invent their own query.

2. **[plan section 5.5] Optimistic `outcome: "success"` on trigger.** Inserting a routine_run with `outcome: "success"` at trigger time is incorrect -- the run has not completed. If the session crashes, the run log permanently shows success. The plan should either: (a) insert with a neutral outcome like `"running"` and add `"running"` to `ROUTINE_RUN_OUTCOMES`, or (b) not insert the outcome field at trigger time and update it on session end (AA2 scope). Option (b) is cleaner but means AA1 run history has no outcome column populated. Option (a) is honest but expands the enum.

3. **[plan section 1.6] Blast radius of `active` backward compat.** The plan keeps the `active` column for backward compatibility but does not enumerate which files read it. The builder needs this list to know whether the dual-write is justified. Files that read `routines.active`: `routines-routes.ts` (trigger endpoint checks `routine.active === false`), `routine-scheduler.ts` (likely checks active), `team-management.ts` (plan mentions this). If the list is short, it may be simpler to update those 2-3 files to read `state` instead of maintaining the dual-write.

4. **[plan section 5.1] Agent name resolution for factory-wide agents.** The plan notes that `agentRows` query in `GET /api/teams/:id` must be broadened because a routine's ownerAgent may be a factory-wide agent not in the team's roster. The plan acknowledges this but does not specify the query change. The builder needs explicit guidance: query agents by `routines.ownerAgentId` in addition to `users.teamId = memberGroup.id`, or do a separate lookup for routine owner agents.

5. **[plan section 2, Drizzle schema] Drizzle type for `state`.** The schema defines `state: text("state").notNull().default("active")` but the TypeScript type should be constrained. The Drizzle column is a plain `text` -- at runtime, any string can be stored. The plan relies on Zod validation at the API boundary (PATCH route) to enforce the enum, which is correct. But INSERT statements in production code (seedBuiltinRoutines, trigger endpoint) bypass the API boundary. The plan should note that any direct INSERT/UPDATE on `state` must use a `RoutineState` type assertion. The type system does not enforce this for Drizzle text columns.

### SUGGESTION

1. **[plan section 1] Add `created_at` to routines table.** The RoutineDetail type includes `createdAt: string | null` but the table has no such column. Adding `created_at TEXT` to the migration (nullable, no backfill) would let the detail page show a meaningful "Created" date for future routines. Existing routines would show null, which the UI already handles.

2. **[plan section 4] Move `humanizeSchedule` to `packages/shared`.** The function is a pure utility with no server dependencies. Placing it in `packages/shared` would allow the frontend to format schedule labels client-side if the API ever returns raw trigger config (e.g., for an edit form in AA2). However, for AA1 scope, the server-side placement is correct since only the API composes the label.

3. **[plan section 7] Rate-limit note for new GET route.** The plan's security section says "AA1 does not add new POST endpoints beyond the existing trigger." But it does add `GET /api/routines/:id` which is a new read endpoint. While GET endpoints are typically not rate-limited, noting it as "N/A -- read-only, no resource creation" would be more explicit.

4. **[plan section 10] Task 10 should specify the exact changes.** "Update test files that insert routines" is vague. The plan should list: (a) `routines.test.ts` -- add `teamId: "prod-1"`, `name: "Test"`, `state: "active"` to both routine INSERT values; (b) `routine-scheduler.test.ts` -- add `teamId` and `name` to every `db.insert(routines).values({...})` call; (c) `builtin-routines.test.ts` -- no direct changes needed if `seedBuiltinRoutines` is fixed (Task 6); (d) `api-e2e.integration.test.ts` -- check for routine insertions and add new fields.

### What is Working Well

- **Design-it-twice sections are genuine.** Both the factory-wide agent backfill and the run history source present real alternatives with concrete tradeoffs. The decisions are defensible and well-reasoned. Option B (pseudo-team) was correctly rejected -- it would have leaked complexity into every team query.

- **Plan reconciliation table is thorough.** Section "Plan reconciliation: spec vs reality" explicitly maps every spec assumption to the actual codebase state and documents the resolution. This is the kind of upfront honesty that prevents surprises during implementation. The table correctly identifies that COS has `teamId: null`, that `routines` has no name column, and that sessions have no routine_id FK.

- **Task ordering and dependency graph are correct.** The critical path (Schema -> Types -> API -> UI parallel) respects data dependencies. Tasks 3, 4, 6, 10 can genuinely run in parallel after Task 1. The graph accurately represents build ordering.

---

## Scoring Summary

| Dimension | Score | Key Issue |
|-----------|-------|-----------|
| Spec Alignment | 8 | AC-4 team-member auth not enforced at API level |
| Layer Integrity | 9 | Clean separation |
| API Contracts | 7 | lastRunOutcome derivation unspecified, PATCH response shape missing |
| Data Model | 7 | FK ordering in migration, missing createdAt, duplicate FK |
| Naming | 8 | Consistent with existing patterns |
| Module Depth | 8 | Minimal surface, no over-abstraction |
| Failure-Mode Coverage | 6 | seedBuiltinRoutines gap, optimistic outcome, blast radius unspecified |
| Simplicity | 8 | No over-engineering, dual-write is the only concern |
| Verifiability | 7 | lastRunOutcome test missing, seed test missing |
| **Average** | **7.6/10** | |

**Verdict: Plan passes at 7/10. The two CRITICAL findings (seedBuiltinRoutines update and FK ordering) must be addressed by the builder before implementation begins. The plan is otherwise solid and ready for `/write-tests`.**
