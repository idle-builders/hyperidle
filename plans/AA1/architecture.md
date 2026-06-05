# AA1 Architecture — Routine Visibility & Team Scoping

## Required reading

- `docs/process-layer/recurring-routines.md` -- concept doc for routines
- `plans/AA1/design/approved.md` -- approved UI design (Variant B integrated status table)
- `packages/db/src/schema.ts` lines 196-223 -- current routines table
- `packages/server/src/routes/routines-routes.ts` -- current API
- `packages/server/src/routes/teams-routes.ts` -- TeamDetail composition (GET /api/teams/:id)
- `packages/shared/src/team.ts` -- TeamDetail, TeamListItem types
- `packages/shared/src/types.ts` -- TriggerType, BetStatus enums
- `packages/design-system/src/status-mapping.ts` -- *ToStatus mapping functions
- `packages/web/src/pages/WorkTeam.tsx` -- current Work team page
- `packages/web/src/pages/WorkPortfolio.tsx` -- current Work portfolio
- `packages/web/src/router.tsx` -- route definitions

---

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|----------------|---------|------------|
| Routines have a `name` column | No `name` column exists | Migration adds `name TEXT NOT NULL DEFAULT ''`; backfill derives from id |
| Routines have a `team_id` FK | No `team_id` column exists | Migration adds `team_id TEXT NOT NULL` FK to `teams.id`; backfill derives from ownerAgent's team |
| Routines have a tri-state `state` | Only `active BOOLEAN` exists | Migration adds `state TEXT NOT NULL DEFAULT 'active'`; backfill from `active` boolean; drop `active` column |
| `seed-agent-cos` (COS) has a teamId | COS has `teamId: null` -- factory-wide agent | Backfill assigns COS routines to the first team (seed-product-1). In real usage, factory-wide routines belong to the team whose work they monitor. See "Design-it-twice" below. |
| Practice facilitators have teamId | PFs have `teamId: null` | Same treatment as COS -- backfill to first team. PFs own `builtin:practice-meeting`. |
| Run history exists somewhere | No routine_run_log table; sessions have no routine_id FK | Add `routine_runs` table. See "Design-it-twice" below. |
| Routines have cost tracking | No cost columns on routines | Add `cost_actual_minor INTEGER` + `cost_actual_currency TEXT` on routines; updated by routine run completion. |
| `GET /api/teams/:id` returns routines | TeamDetail has no routines field | Extend TeamDetail type to include `routines: RoutineCardSummary[]` |
| `GET /api/teams` returns routine counts | TeamListItem has no routineCount | Extend TeamListItem to include `routineCount: number` |
| Route `/work/routine/:id` exists | No such route | Add WorkRoutine page + route |
| `routineStateToStatus` mapping exists | No such function | Add to `status-mapping.ts` |

---

## Design-it-twice: Factory-wide agents owning team-scoped routines

**Problem:** The spec requires `team_id NOT NULL` on routines. But 4 of 6 seed routines are owned by factory-wide agents (COS, practice facilitators) with no team assignment.

**Option A: Assign factory-wide routines to a designated team.**
Backfill assigns COS/PF-owned routines to the first team. When a new team is created, factory-wide routines stay on their original team. This means "Cost sentinel" shows up under one team even though it monitors the whole factory.
- Trade-off: Conceptually incorrect -- cost sentinel is factory-wide, not team-scoped.
- Migration cost: Simple -- one UPDATE statement per ownerAgentId.

**Option B: Add a special "Factory" pseudo-team.**
Create a `factory` team row that holds factory-wide routines. This team appears in the submenu and Work view alongside real teams.
- Trade-off: Adds a pseudo-entity that breaks the 1:1 Product=Team invariant. The "Factory" team has no bets, no roster in the traditional sense. Extra complexity in every query that needs "real teams."
- Migration cost: INSERT one team row + UPDATE routines.

**Decision: Option A.** Factory-wide routines get assigned to the first team during migration. This is a pragmatic choice:
1. The number of factory-wide routines is small (4-5).
2. AA2 will add routine creation UI where the user explicitly chooses the team.
3. The backfill is one-time -- future routines will have team_id set at creation.
4. If a factory needs multiple teams, the COS can be assigned to one and its routines will naturally scope there.

Rejected: Option B. The pseudo-team adds complexity to every team query and violates the 1:1 invariant that the entire codebase relies on.

---

## Design-it-twice: Run history source

**Problem:** AA1 AC-5 requires "clicking a routine shows its run history (recent runs with timestamp, duration, outcome, cost)." Sessions don't link to routines (AA2 scope). Where does run history come from?

**Option A: `routine_runs` table (append-only log).**
Each time a routine fires (via scheduler or manual trigger), insert a row: `id, routine_id, started_at, ended_at, outcome (success/error), cost_minor, cost_currency, error_message`. Lightweight, purpose-built. The routine trigger endpoint inserts a run row when it fires.
- Trade-off: Duplicates some session data (once AA2 links sessions to routines).
- Migration cost: One new table. AA2 can backfill routine_runs from sessions + routine_id when it links them.

**Option B: Query sessions by ownerAgentId + time range.**
No new table. Derive run history from sessions where `agentId = routine.ownerAgentId` and `startedAt >= routine.createdAt`.
- Trade-off: Lossy -- an agent runs sessions for tasks AND routines; no way to distinguish. Also, the routine trigger endpoint creates sessions with `taskId` pointing at an arbitrary existing task (D5 stub). The join is unreliable.
- Migration cost: Zero.

**Decision: Option A (routine_runs table).** The data is clean, purpose-built, and the table is small (a few rows per routine per day). AA2 can migrate to session-linked runs later; routine_runs remains the lightweight record either way. The append-only shape also means the table can serve as the definitive audit log for routine execution.

---

## 1. Schema migration (0022_AA1_routine_visibility.sql)

### 1.1 Alter `routines` table

```sql
-- Add new columns
ALTER TABLE routines ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE routines ADD COLUMN description TEXT;
ALTER TABLE routines ADD COLUMN team_id TEXT NOT NULL DEFAULT '' REFERENCES teams(id) ON DELETE RESTRICT;
ALTER TABLE routines ADD COLUMN state TEXT NOT NULL DEFAULT 'active';
ALTER TABLE routines ADD COLUMN cost_actual_minor INTEGER;
ALTER TABLE routines ADD COLUMN cost_actual_currency TEXT;
```

### 1.2 Backfill existing routines

```sql
-- Derive name from id: 'builtin:cost-sentinel' -> 'Cost sentinel', 'seed-routine-daily_digest' -> 'Daily digest'
UPDATE routines SET name = REPLACE(REPLACE(REPLACE(id, 'builtin:', ''), 'seed-routine-', ''), '_', ' ')
  WHERE name = '';

-- Capitalize first letter (done in application code during migration, not raw SQL)

-- Derive team_id from ownerAgent's team membership
-- users.teamId -> teamMembers.id -> teamMembers.teamId
-- For agents with teamId: follow the join
-- For factory-wide agents (teamId IS NULL): assign to first team

-- Step 1: agents with team membership
UPDATE routines SET team_id = (
  SELECT tm.team_id FROM users u
  JOIN team_members tm ON u.team_id = tm.id
  WHERE u.id = routines.owner_agent_id
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM users u
  JOIN team_members tm ON u.team_id = tm.id
  WHERE u.id = routines.owner_agent_id
);

-- Step 2: factory-wide agents -> first team
UPDATE routines SET team_id = (SELECT id FROM teams ORDER BY created_at ASC LIMIT 1)
WHERE team_id = '';

-- Derive state from active boolean
UPDATE routines SET state = CASE WHEN active = true THEN 'active' ELSE 'paused' END;
```

### 1.3 Create `routine_runs` table

```sql
CREATE TABLE routine_runs (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE RESTRICT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  outcome TEXT NOT NULL, -- 'success' | 'error'
  cost_minor INTEGER,
  cost_currency TEXT,
  error_message TEXT,
  CONSTRAINT routine_runs_routine_fk FOREIGN KEY (routine_id) REFERENCES routines(id)
);
CREATE INDEX routine_runs_routine_id_idx ON routine_runs(routine_id, started_at);
```

### 1.4 AA2-prep columns (added now per contract: "no incremental migrations")

```sql
-- Sessions -> routines link (AA2 will populate)
ALTER TABLE sessions ADD COLUMN routine_id TEXT REFERENCES routines(id) ON DELETE SET NULL;
CREATE INDEX sessions_routine_id_idx ON sessions(routine_id);
```

### 1.5 Add index on routines.team_id

```sql
CREATE INDEX routines_team_id_idx ON routines(team_id);
```

### 1.6 Drop `active` column

The `active` boolean is replaced by `state`. However, existing code in `team-management.ts` queries `routines.active`. The column should be preserved for backward compatibility during this workpackage and marked deprecated. AA2 can drop it.

**Decision: Keep `active` column, mark deprecated.** The migration backfills `state` from `active`. Code that reads `active` continues to work. New code reads `state`. A follow-up in AA2 drops `active`.

---

## 2. Drizzle schema changes (`packages/db/src/schema.ts`)

```typescript
// Updated routines table definition
export const routines = pgTable("routines", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  description: text("description"),
  ownerAgentId: text("owner_agent_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "restrict" }),
  triggerType: text("trigger_type").notNull(),
  triggerConfig: text("trigger_config"),
  skillId: text("skill_id"),
  doneCondition: text("done_condition"),
  stateKey: text("state_key"),
  delegationAllowed: boolean("delegation_allowed").default(false),
  humanReview: boolean("human_review").default(false),
  autonomyLevel: integer("autonomy_level"),
  silent: boolean("silent").default(false),
  /** @deprecated Use `state` instead. Kept for backward compat until AA2. */
  active: boolean("active").notNull().default(true),
  /** Routine lifecycle state: 'active' | 'paused' | 'error'. Replaces boolean `active`. */
  state: text("state").notNull().default("active"),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at"),
  costActualMinor: integer("cost_actual_minor"),
  costActualCurrency: text("cost_actual_currency"),
}, (table) => [
  index("routines_team_id_idx").on(table.teamId),
]);

// New routine_runs table
export const routineRuns = pgTable("routine_runs", {
  id: text("id").primaryKey(),
  routineId: text("routine_id")
    .notNull()
    .references(() => routines.id, { onDelete: "restrict" }),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  outcome: text("outcome").notNull(), // 'success' | 'error'
  costMinor: integer("cost_minor"),
  costCurrency: text("cost_currency"),
  errorMessage: text("error_message"),
}, (table) => [
  index("routine_runs_routine_id_idx").on(table.routineId, table.startedAt),
]);

// Sessions gains routine_id (nullable, AA2 prep)
// In sessions table definition, add:
//   routineId: text("routine_id").references(() => routines.id, { onDelete: "set null" }),
```

Add inferred types:
```typescript
export type RoutineRun = typeof routineRuns.$inferSelect;
export type NewRoutineRun = typeof routineRuns.$inferInsert;
```

---

## 3. Shared types (`packages/shared/src/`)

### 3.1 New file: `packages/shared/src/routine.ts`

```typescript
import type { WireMoney } from "./types/money.js";

/** Routine lifecycle state — closed enum. */
export const ROUTINE_STATES = ["active", "paused", "error"] as const;
export type RoutineState = (typeof ROUTINE_STATES)[number];

/** Run outcome — closed enum. */
export const ROUTINE_RUN_OUTCOMES = ["success", "error"] as const;
export type RoutineRunOutcome = (typeof ROUTINE_RUN_OUTCOMES)[number];

/**
 * Summary shape for a routine row in the WorkTeam page.
 * Returned as part of the extended TeamDetail response.
 */
export interface RoutineCardSummary {
  id: string;
  name: string;
  state: RoutineState;
  /** Human-readable schedule: "Every Monday at 10am", "Every 15 min", "On bet completion" */
  scheduleLabel: string;
  /** Owner agent display name */
  agentName: string;
  /** Owner agent 2-letter initials */
  agentInitials: string;
  /** ISO timestamp of last run, or null if never run */
  lastRunAt: string | null;
  /** Last run outcome, or null if never run */
  lastRunOutcome: RoutineRunOutcome | null;
  /** ISO timestamp of next scheduled run, or null for event-triggered */
  nextRunAt: string | null;
  /** Cumulative cost across all runs */
  costActual: WireMoney | null;
}

/**
 * Full routine detail returned by GET /api/routines/:id.
 */
export interface RoutineDetail {
  routine: {
    id: string;
    name: string;
    description: string | null;
    state: RoutineState;
    triggerType: string; // 'heartbeat' | 'calendar' | 'event'
    triggerConfig: string | null;
    scheduleLabel: string;
    ownerAgentId: string;
    agentName: string;
    agentInitials: string;
    teamId: string;
    teamName: string;
    autonomyLevel: number | null;
    humanReview: boolean;
    delegationAllowed: boolean;
    lastRunAt: string | null;
    lastRunOutcome: RoutineRunOutcome | null;
    nextRunAt: string | null;
    costActual: WireMoney | null;
    createdAt: string | null; // routines table has no createdAt yet — nullable
  };
  runs: RoutineRunSummary[];
}

/**
 * Single run in the run history table.
 */
export interface RoutineRunSummary {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  outcome: RoutineRunOutcome;
  cost: WireMoney | null;
  errorMessage: string | null;
}
```

### 3.2 Extend `packages/shared/src/team.ts`

```typescript
// Add to TeamDetail:
export interface TeamDetail {
  team: TeamSummary;
  teamMembers: { id: string; formedAt: string; dissolvedAt: string | null };
  roster: RosterMember[];
  burn: TeamBurn;
  activeBets: BetCardSummary[];
  routines: RoutineCardSummary[]; // NEW — AA1
}

// Add to TeamListItem:
export interface TeamListItem extends TeamSummary {
  activeBets: number;
  shipped: number;
  shipRate: string;
  progress: { done: number; total: number };
  routineCount: number; // NEW — AA1
}
```

### 3.3 Export from `packages/shared/src/index.ts`

```typescript
// ── Routine primitive (AA1) ──
export type {
  RoutineCardSummary,
  RoutineDetail,
  RoutineRunOutcome,
  RoutineRunSummary,
  RoutineState,
} from "./routine.js";
export { ROUTINE_RUN_OUTCOMES, ROUTINE_STATES } from "./routine.js";
```

---

## 4. Status mapping (`packages/design-system/src/status-mapping.ts`)

```typescript
import type { RoutineState } from "@hyperidle/shared";

export const ROUTINE_STATE_MAP: Record<RoutineState, Status> = {
  active: "healthy",
  paused: "paused",
  error: "error",
};

export function routineStateToStatus(state: RoutineState): Status {
  return ROUTINE_STATE_MAP[state];
}
```

Export from `packages/design-system/src/index.ts`.

---

## 5. API routes

### 5.1 Extend `GET /api/teams/:id` (teams-routes.ts)

The TeamDetail response gains a `routines` field. After loading roster, bets, and burn, add:

```typescript
// Load routines for this team
const teamRoutines = await db.select().from(routines)
  .where(eq(routines.teamId, teamId));

// For each routine, resolve agent name + compute schedule label + last run outcome
const routinesSummary: RoutineCardSummary[] = teamRoutines.map(r => {
  const agent = agentRows.find(a => a.id === r.ownerAgentId);
  return {
    id: r.id,
    name: r.name,
    state: r.state as RoutineState,
    scheduleLabel: humanizeSchedule(r.triggerType, r.triggerConfig),
    agentName: agent?.name ?? r.ownerAgentId,
    agentInitials: (agent?.name ?? "??").slice(0, 2).toUpperCase(),
    lastRunAt: r.lastRunAt,
    lastRunOutcome: /* derived from latest routine_run */ null,
    nextRunAt: r.nextRunAt,
    costActual: toWireMoney(r.costActualMinor, r.costActualCurrency),
  };
});
```

Note: `agentRows` query must be broadened. Currently it queries `users WHERE teamId = memberGroup.id`. But a routine's ownerAgent may be a factory-wide agent (teamId null) assigned to this team's routines. The query should also join against routine.ownerAgentId to resolve names for agents not in the roster.

### 5.2 Extend `GET /api/teams` (teams-routes.ts)

Add `routineCount` to TeamListItem:

```typescript
const [routineCountRow] = await db
  .select({ count: count() })
  .from(routines)
  .where(eq(routines.teamId, team.id));
const routineCount = routineCountRow?.count ?? 0;

// Add to returned TeamListItem:
return { ...existing, routineCount };
```

### 5.3 New: `GET /api/routines/:id` (routines-routes.ts)

Returns `RoutineDetail` with run history.

```
GET /api/routines/:id
Response 200: RoutineDetail
Response 404: { error: "Routine not found", code: "not_found" }
```

Implementation:
1. Select routine by id
2. Join with users table to get agent name
3. Join with teams table to get team name
4. Select recent routine_runs (ORDER BY started_at DESC LIMIT 20)
5. Compose RoutineDetail response

### 5.4 Extend `PATCH /api/routines/:id` (routines-routes.ts)

Add `state` to the update schema:

```typescript
const updateRoutineSchema = z.object({
  active: z.boolean().optional(),
  state: z.enum(["active", "paused", "error"]).optional(),
  triggerConfig: z.string().optional(),
  autonomyLevel: z.number().int().min(1).max(4).optional(),
  silent: z.boolean().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
});
```

When `state` is set, also sync the `active` boolean for backward compat:
- `state: "active"` -> `active: true`
- `state: "paused"` or `state: "error"` -> `active: false`

### 5.5 Extend `POST /api/routines/:id/trigger` (routines-routes.ts)

After creating a session, also insert a `routine_runs` row:

```typescript
await db.insert(routineRuns).values({
  id: crypto.randomUUID(),
  routineId,
  startedAt: now,
  outcome: "success", // Initial optimistic; AA2 will update on session end
  costMinor: null,
  costCurrency: null,
});
```

### 5.6 New utility: `humanizeSchedule()` (`packages/server/src/services/schedule-label.ts`)

Converts triggerType + triggerConfig into a human-readable string:
- `calendar` + `{"cron":"0 10 * * MON"}` -> "Every Monday at 10:00 AM"
- `heartbeat` + `{"intervalSeconds":900}` -> "Every 15 minutes"
- `event` + `{"eventType":"bet_state_changed"}` -> "On bet completion"

This is a pure function with no dependencies. Uses a minimal cron parser (no external dependency -- manual parsing of the 5 standard cron fields is sufficient for the limited cron expressions in the seed data).

---

## 6. Frontend changes

### 6.1 WorkTeam.tsx — Add R5 Routines section

After the Active Bets section (R2), before Roster (R3):

```tsx
{/* R5 — Routines */}
<section aria-label="Team routines" data-testid="team-routines">
  <h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
    Routines
  </h2>
  {data.routines.length === 0 ? (
    <EmptyState
      title="No routines"
      description="This team has no recurring work configured."
      dataTestId="team-routines-empty"
    />
  ) : (
    <div className="bg-[var(--surface-container)] rounded-[var(--r-subtle)] p-[12px]">
      {data.routines.map((routine, i) => (
        <RoutineRow key={routine.id} routine={routine} isLast={i === data.routines.length - 1} />
      ))}
    </div>
  )}
</section>
```

`RoutineRow` is an inline component (not a design-system export) styled per the approved design: 36px height, flat rows with hairline separators.

### 6.2 New page: `packages/web/src/pages/WorkRoutine.tsx`

Route: `/work/routine/:routineId`

Layout:
- Breadcrumb (btn-ghost btn-xs): "Portfolio / {team.name}"
- Heading: routine name + StatusChip
- Sub-line: agent name, trigger type
- Configuration section: KeyValue grid in surface-container card
- Run history section: table with time, duration, outcome dot, cost
- Action buttons: Pause/Resume (ghost), Trigger Now (primary)

Data: `useRoutine(routineId)` hook fetches `GET /api/routines/:id`.

### 6.3 New hook: `packages/web/src/hooks/useRoutine.ts`

One-shot fetch hook following the existing useTeam/useBet pattern:

```typescript
export interface UseRoutineResult {
  data: RoutineDetail | null;
  loading: boolean;
  error: Error | null;
}

export function useRoutine(routineId: string | undefined): UseRoutineResult {
  // Same pattern as useTeam -- useState + useEffect + apiFetch
}
```

### 6.4 Router update (`packages/web/src/router.tsx`)

Add route:
```typescript
import { WorkRoutine } from "./pages/WorkRoutine";
// In children array:
{ path: "work/routine/:routineId", element: <WorkRoutine /> },
```

### 6.5 WorkPortfolio.tsx — Add routine summary line

Below the "All bets" heading, when `totalActiveRoutines > 0`:

```tsx
<p className="text-[13px] text-[var(--text-secondary)]">
  {totalBets} bets across {teams.length} teams — {totalActiveRoutines} routines active
</p>
```

Where `totalActiveRoutines = teams.reduce((sum, t) => sum + t.routineCount, 0)`.

### 6.6 Seed data update (`packages/db/src/seed.ts`)

Update routine seed insertions to include `name`, `teamId`, `state`:

```typescript
await db.insert(routines).values({
  id: "seed-routine-daily_digest",
  name: "Daily digest",
  ownerAgentId: "seed-agent-cos",
  teamId: "seed-product-1",  // NEW
  state: "paused",            // NEW (was active: false)
  triggerType: "calendar",
  triggerConfig: JSON.stringify({ cron: "0 8 * * *", taskId: "seed-task-daily-digest" }),
  active: false,
  // ... rest unchanged
});
```

Update `BUILTIN_ROUTINE_SEEDS` in `seed-fixtures.ts` to include `name` and `teamId` fields. The `teamId` for builtin routines will be `"seed-product-1"` (the only team in seed data).

---

## 7. Security & abuse cases

| Vector | Applicable? | Mitigation |
|--------|-------------|------------|
| Rate-limit on POST /routines/:id/trigger | YES | Existing API key auth. AA1 does not add new POST endpoints beyond the existing trigger. Rate limiting is existing middleware concern. |
| Input-trust on agent-authored fields | N/A | Routine names and descriptions are set by the system (seed/migration) in AA1. AA2 adds creation UI -- input validation will be addressed there. |
| Secret handling | N/A | No new credential surfaces. |
| Path traversal | N/A | No path inputs. |
| SSRF | N/A | No outbound URLs. |
| Team scoping auth | YES | `GET /api/teams/:id` already scopes data by teamId. The routine list is filtered by `WHERE team_id = :teamId` in the query. No cross-team data leak. `GET /api/routines/:id` returns data for a single routine -- auth is API key based (existing pattern). |
| Routine state manipulation | LOW | PATCH /api/routines/:id accepts `state` field. Validated by Zod enum to `["active", "paused", "error"]`. No arbitrary string injection. |

---

## 8. Protected tests (must not change assertions)

```
protectedTests:
  - packages/server/src/__tests__/routines.test.ts
  - packages/server/src/__tests__/builtin-routines.test.ts
  - packages/server/src/__tests__/routine-scheduler.test.ts
  - packages/server/src/__tests__/api-e2e.integration.test.ts
  - packages/web/src/__tests__/router.L13.test.tsx
  - packages/web/src/__tests__/hints.integration.test.tsx
```

These existing tests must pass without changing their assertions. The schema migration adds columns with defaults, so existing INSERT statements (without the new columns) continue to work. Existing test assertions on response shapes will still match because:
- `GET /api/routines` returns routine rows -- new columns appear but existing property checks still pass.
- WorkTeam test renders with `overrideData` -- the new `routines` field defaults to `[]` via the type extension.

**Caution:** The `routines.test.ts` file inserts routines WITHOUT the new `teamId` column. After migration, `teamId NOT NULL DEFAULT ''` means the INSERT still works. But the default empty string will fail the FK constraint if `teams` has no row with id `''`. **Resolution:** The test seeding must be updated to include `teamId: "prod-1"` in the routine INSERT. This is a seeding change, not an assertion change -- the test behavior is preserved.

---

## 9. Migration checklist for renamed/moved symbols

| Symbol | Change | Affected files |
|--------|--------|---------------|
| `TeamDetail` type | Gains `routines` field | `packages/shared/src/team.ts`, `packages/server/src/routes/teams-routes.ts`, `packages/web/src/pages/WorkTeam.tsx`, `packages/web/src/__tests__/hints.integration.test.tsx` (fixture data) |
| `TeamListItem` type | Gains `routineCount` field | `packages/shared/src/team.ts`, `packages/server/src/routes/teams-routes.ts`, `packages/web/src/pages/WorkPortfolio.tsx` |
| `routines` Drizzle table | Gains columns: name, description, teamId, state, costActualMinor, costActualCurrency | `packages/db/src/schema.ts`, all files that INSERT into routines (seed.ts, seed-fixtures.ts, test files) |
| `updateRoutineSchema` | Gains state, name, description fields | `packages/server/src/routes/routines-routes.ts` |
| `BUILTIN_ROUTINE_SEEDS` | Gains name, teamId | `packages/db/src/seed-fixtures.ts` |

---

## 10. Ordered task list

### Task 1: Schema + Migration

**Files:** `packages/db/src/schema.ts`, `packages/db/drizzle/0022_AA1_routine_visibility.sql`

1. Add new columns to `routines` table definition in schema.ts (name, description, teamId FK, state, costActualMinor, costActualCurrency)
2. Add `routineRuns` table definition to schema.ts
3. Add `routineId` nullable FK on `sessions` table (AA2 prep)
4. Add index on routines.team_id
5. Export new inferred types (RoutineRun, NewRoutineRun)
6. Write migration SQL with backfill logic
7. Run `npm run db:generate` to verify migration consistency
8. Run `npm run db:migrate` to apply

**Verification:** `npm run db:migrate` succeeds. `npm run check` passes. Integration test inserts a routine with all new columns and reads it back.

**Test:** `packages/db/src/__tests__/routine-schema.test.ts`
- Insert a routine with name, teamId, state -> read back, assert all fields
- Insert a routine without teamId -> assert FK violation
- Insert a routine_run with routineId FK -> read back, assert fields
- Insert a routine_run with invalid routineId -> assert FK violation

### Task 2: Shared types

**Files:** `packages/shared/src/routine.ts` (new), `packages/shared/src/team.ts`, `packages/shared/src/index.ts`

1. Create `routine.ts` with RoutineState, RoutineRunOutcome, RoutineCardSummary, RoutineDetail, RoutineRunSummary
2. Extend TeamDetail with `routines: RoutineCardSummary[]`
3. Extend TeamListItem with `routineCount: number`
4. Export all new types from index.ts

**Verification:** `npm run check` passes across all packages.

### Task 3: Status mapping

**Files:** `packages/design-system/src/status-mapping.ts`, `packages/design-system/src/index.ts`

1. Add `ROUTINE_STATE_MAP` and `routineStateToStatus()` function
2. Export from index.ts

**Verification:** `npm run check` passes.

**Test:** `packages/design-system/src/__tests__/status-mapping.test.ts` (extend existing if it exists, or create)
- `routineStateToStatus("active")` returns `"healthy"`
- `routineStateToStatus("paused")` returns `"paused"`
- `routineStateToStatus("error")` returns `"error"`

### Task 4: Schedule label utility

**Files:** `packages/server/src/services/schedule-label.ts` (new)

1. Implement `humanizeSchedule(triggerType: string, triggerConfig: string | null): string`
2. Handle calendar (cron), heartbeat (interval), event (eventType) trigger types
3. Graceful fallback for unparseable configs: return triggerType as-is

**Verification:** Unit tests.

**Test:** `packages/server/src/__tests__/schedule-label.test.ts`
- `humanizeSchedule("calendar", '{"cron":"0 10 * * MON"}')` returns "Every Monday at 10:00 AM"
- `humanizeSchedule("heartbeat", '{"intervalSeconds":900}')` returns "Every 15 minutes"
- `humanizeSchedule("event", '{"eventType":"bet_state_changed"}')` returns "On bet completion"
- `humanizeSchedule("calendar", null)` returns "Calendar" (fallback)
- `humanizeSchedule("unknown", null)` returns "Unknown" (fallback)

### Task 5: API — Extend team routes + routine detail

**Files:** `packages/server/src/routes/routines-routes.ts`, `packages/server/src/routes/teams-routes.ts`

1. Extend `GET /api/teams/:id` to include `routines` in TeamDetail response
2. Extend `GET /api/teams` to include `routineCount` in TeamListItem
3. Add `GET /api/routines/:id` returning RoutineDetail with run history
4. Extend `PATCH /api/routines/:id` to accept `state`, `name`, `description`
5. Extend `POST /api/routines/:id/trigger` to insert routine_run row

**Verification:** Integration tests.

**Tests:** `packages/server/src/__tests__/routines-aa1.test.ts` (new file)
- GET /api/teams/:id includes `routines` array with correct shape
- GET /api/teams/:id with no routines returns `routines: []`
- GET /api/teams lists teams with `routineCount` field
- GET /api/routines/:id returns RoutineDetail with run history
- GET /api/routines/:nonexistent returns 404
- PATCH /api/routines/:id with `state: "paused"` updates state and syncs active=false
- POST /api/routines/:id/trigger creates a routine_run row

### Task 6: Seed data update

**Files:** `packages/db/src/seed.ts`, `packages/db/src/seed-fixtures.ts`

1. Update `BUILTIN_ROUTINE_SEEDS` to include `name` and `teamId` fields
2. Update seed-routine-daily_digest insertion to include `name`, `teamId`, `state`
3. Run seed to verify no FK violations

**Verification:** `npm run db:migrate && npm run db:seed` succeeds. Seed test passes.

### Task 7: Frontend — WorkTeam routines section

**Files:** `packages/web/src/pages/WorkTeam.tsx`

1. Add R5 routines section after R2 (active bets)
2. Implement RoutineRow inline component per approved design
3. Handle empty/loading/error states
4. Click navigates to `/work/routine/:id`

**Verification:** Component renders routines from TeamDetail.routines. Empty state shows when no routines.

**Test:** `packages/web/src/__tests__/WorkTeam.AA1.test.tsx`
- Renders routine rows when data.routines is populated
- Shows EmptyState when data.routines is empty
- Clicking a routine row navigates to /work/routine/:id

### Task 8: Frontend — WorkRoutine detail page

**Files:** `packages/web/src/pages/WorkRoutine.tsx` (new), `packages/web/src/hooks/useRoutine.ts` (new), `packages/web/src/router.tsx`

1. Create useRoutine hook (same pattern as useTeam)
2. Create WorkRoutine page with breadcrumb, header, config section, run history, actions
3. Add route to router.tsx

**Verification:** Page renders with mock data. Loading/error/not-found states work.

**Test:** `packages/web/src/__tests__/WorkRoutine.AA1.test.tsx`
- Renders routine name, status chip, KV grid
- Renders run history table
- Shows loading skeleton during fetch
- Shows not-found EmptyState for 404

### Task 9: Frontend — WorkPortfolio routine summary

**Files:** `packages/web/src/pages/WorkPortfolio.tsx`

1. Compute totalActiveRoutines from teams data
2. Add summary line below "All bets" heading when routines exist

**Verification:** Summary line appears when routine count > 0.

**Test:** `packages/web/src/__tests__/WorkPortfolio.AA1.test.tsx`
- Summary line shows correct routine count
- Summary line hidden when no routines

### Task 10: Update existing test seeding

**Files:** All test files that insert routines without the new required columns.

1. Update `packages/server/src/__tests__/routines.test.ts` seed to include `teamId`, `name`, `state`
2. Update `packages/server/src/__tests__/api-e2e.integration.test.ts` routine seeding
3. Update `packages/server/src/__tests__/routine-scheduler.test.ts` seeding
4. Update `packages/server/src/__tests__/builtin-routines.test.ts` seeding
5. Update any other test files that insert into routines

**Verification:** All existing tests pass. `npm run test` green.

---

## 11. Task dependency graph

```
Task 1 (Schema)
  |
  +---> Task 2 (Shared types) ---> Task 3 (Status mapping)
  |                                     |
  +---> Task 4 (Schedule label)         |
  |         |                           |
  +---> Task 5 (API routes) <----------+
  |         |
  +---> Task 6 (Seed data)
  |
  +---> Task 10 (Test seeding)
  |
  +---> Task 7 (WorkTeam UI) <--- Task 5
  |         |
  +---> Task 8 (WorkRoutine page) <--- Task 5
  |
  +---> Task 9 (WorkPortfolio) <--- Task 5
```

**Critical path:** Task 1 -> Task 2 -> Task 5 -> Tasks 7/8/9 (parallel)

Tasks 3, 4, 6, 10 can run in parallel with Task 2 after Task 1 completes.

---

## 12. Risks and ambiguities

1. **COS/PF agent team backfill.** Factory-wide agents own routines but have no team. The migration assigns to the first team. If there are multiple teams, this is arbitrary. Acceptable for seed data; real deployments will have explicit team assignments.

2. **Cron parsing.** The `humanizeSchedule` utility must parse cron expressions. The seed data uses simple patterns ("0 10 * * MON", "0 2 * * *", "0 10 1-7 * MON"). A minimal parser covering weekday names, hour/minute, and day-of-month ranges is sufficient. Complex cron (ranges, lists, step values) can fall back to the raw expression.

3. **Existing test seeding.** Multiple test files insert routines without the new `teamId` column. The `NOT NULL DEFAULT ''` default avoids INSERT failures, but the empty string fails the FK constraint. Each test file must be updated to include a valid `teamId`. This is the highest-risk task -- missed updates cause test failures.

4. **WorkTeam fixture data.** Tests using `overrideData` (e.g., hints.integration.test.tsx) pass TeamDetail fixtures. Adding `routines` to TeamDetail means these fixtures need a `routines: []` field. TypeScript will surface this at compile time.

5. **Run history population.** AA1 only populates routine_runs from the manual trigger endpoint. The scheduler (which fires routines on schedule) does not create routine_run rows in AA1 scope. Run history will be empty for auto-scheduled routines until AA2 integrates the scheduler with the run log. The UI handles this gracefully ("No runs recorded yet.").
