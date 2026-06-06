# AA2 Architecture — Routine Management & Session Adaptation

## Required reading

Downstream agents must read these files before implementing:

- `plans/AA2/concept.md` -- locked concepts (Routine Session, Last Run Summary, Coalescing)
- `plans/AA2/design/approved.md` -- locked UI design (RoutineCreateDialog, schedule picker, edit/delete)
- `packages/db/src/schema.ts` lines 220-310 -- routines + routineRuns + sessions.routineId
- `packages/shared/src/routine.ts` -- RoutineState, RoutineRunOutcome, wire types
- `packages/server/src/routes/routines-routes.ts` -- existing CRUD + trigger routes
- `packages/server/src/services/session-provisioning.ts` -- 11-phase provisioning orchestrator
- `packages/fabric/src/session-context.ts` -- buildSessionContextData
- `packages/fabric/src/prompt-composition.ts` -- composePrompt
- `packages/fabric/src/services/routine-scheduler.ts` -- scheduler, checkAndFireRoutine
- `packages/web/src/pages/WorkRoutine.tsx` -- existing detail page
- `packages/web/src/pages/work/BetCreateDialog.tsx` -- create dialog pattern
- `packages/web/src/pages/WorkTeam.tsx` -- routines section (trigger point for create dialog)

---

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| POST /api/routines (create) exists | No POST / route on the routines router | Add POST / route to `routines-routes.ts` |
| DELETE /api/routines/:id (soft delete) exists | No DELETE route; only POST /:id/retire (sets active=false) | Add DELETE /:id route with `deleted_at` timestamp. Retire route stays for backward compat. |
| `routines.deleted_at` column exists | No `deleted_at` column on routines table | Migration adds `deleted_at TEXT` nullable column |
| `routines.last_run_summary` column exists | No `last_run_summary` column | Migration adds `last_run_summary TEXT` nullable column |
| `routines.cost_cap_per_run_minor` column exists | No cost cap per run column | Migration adds `cost_cap_per_run_minor INTEGER` nullable column |
| `routines.created_at` column exists | No `created_at` column; `RoutineInfo.createdAt` returns `null` | Migration adds `created_at TEXT` column with backfill |
| `RoutineRunOutcome` includes 'running' and 'timeout' | Current type: `'success' \| 'error' \| 'skipped'` | Extend to `'success' \| 'error' \| 'skipped' \| 'running' \| 'timeout'` |
| `routine_runs.session_id` FK exists | No session_id column on routine_runs | Migration adds `session_id TEXT` nullable FK to sessions.id |
| `routine_runs.summary` column exists | No summary column on routine_runs | Migration adds `summary TEXT` nullable column |
| Routine sessions use different context assembly | `buildSessionContextData` requires taskId -> task -> bet | Add `buildRoutineSessionContextData` in `packages/fabric/src/session-context.ts` |
| `provisionSession` supports routine context | `ProvisionSessionParams` has no routineId | Extend `ProvisionSessionParams` with optional `routineId` |
| GET /api/routines filters soft-deleted | Current GET / returns all routines | Add `WHERE deleted_at IS NULL` filter to GET / and GET on teams |
| Schedule picker presets produce standard cron | No picker exists | Frontend-only: `SchedulePicker` inline component in create dialog |
| `checkAndFireRoutine` performs coalescing | No coalescing check exists | Add active-session check before firing in `routine-scheduler.ts` |
| Agent list available for create dialog | `GET /api/teams/:id` returns roster with agent info | Reuse existing roster from TeamDetail response |

---

## Design-it-twice decisions

### Decision 1: How `provisionSession` branches for routine context

**Option A: Branch inside `provisionSession`.**
Add `routineId?: string` to `ProvisionSessionParams`. When present, call `buildRoutineSessionContextData` instead of `buildSessionContextData` in Phase 6/8.5. One function, one conditional.

- Trade-off: Adds a conditional branch to an already-complex function (11 phases, 644 lines). Increases cognitive complexity.
- Reason to reject: It works but makes an already-dense function denser.

**Option B: Caller-provided context override.**
Add an optional `contextOverride?: SessionContextData` to `ProvisionSessionParams`. The caller (routine scheduler, trigger endpoint) builds the context before calling `provisionSession` and passes it in. `provisionSession` uses the override when present, falls back to task-based assembly when absent.

- Trade-off: Context assembly happens outside the provisioning orchestrator, which currently owns Phases 6 and 8.5. The caller needs DB access and the routine row.
- Reason to reject: Breaks the encapsulation of the provisioning orchestrator. Context assembly is not the caller's responsibility.

**Decision: Option A.** The branch is a single `if (params.routineId)` that swaps one function call. The cognitive complexity increase is minimal compared to the alternative of pushing context assembly to every caller. The provisioning orchestrator already coordinates context (Phase 6, 8.5) -- this is the right place for the branch.

### Decision 2: Where coalescing lives

**Option A: In `checkAndFireRoutine` (routine-scheduler.ts).**
Before creating a session, query `sessions WHERE routineId = :routineId AND state = 'active'`. If count > 0, skip and insert a routine_run with outcome='skipped'. Same function, same transaction scope.

- Trade-off: Coalescing is specific to the scheduler path. Manual triggers via `POST /api/routines/:id/trigger` also need coalescing.
- Handling: Apply the same check in both locations. Extract to a shared helper.

**Option B: In a middleware on the trigger endpoint.**
A pre-handler middleware on POST /trigger checks for active sessions and returns 409 Conflict.

- Trade-off: Middleware is the wrong abstraction. Coalescing is domain logic, not HTTP middleware. And it doesn't cover the scheduler path.
- Reason to reject: Splits domain logic across two layers.

**Decision: Option A with extraction.** Create a `shouldCoalesce(db, routineId): Promise<boolean>` helper in `packages/fabric/src/services/routine-scheduler.ts`. Both `checkAndFireRoutine` and `POST /trigger` call it.

### Decision 3: Stub task for routine sessions

**Option A: Create a dedicated stub task per routine at routine creation time.**
When a routine is created, insert a task row with title "Routine: {name}" and state "accepted". Store the taskId on the routine row (`stub_task_id TEXT`). All routine sessions use this taskId.

- Trade-off: Adds a task row that is never worked on directly. But it satisfies the FK cleanly and gives routine sessions a stable task reference.
- One extra column on routines, one INSERT per routine creation.

**Option B: Find or create a stub task at session creation time (current behavior).**
The existing `POST /trigger` endpoint searches for any task owned by the agent. This is fragile -- it couples routine sessions to task data they have no relationship with.

- Trade-off: Fragile, non-deterministic (picks arbitrary task), couples unrelated entities.
- Reason to reject: The concept doc says "the provisioning orchestrator MUST NOT read task/bet context from this stub." Using a random existing task makes this contract fragile.

**Decision: Option A.** A dedicated stub task per routine is clean, deterministic, and makes the "don't read task context" contract enforceable. The stub task is created at routine creation time and stored as `routines.stub_task_id`.

---

## 1. Schema migration (0024_AA2_routine_management.sql)

### 1.1 Alter `routines` table

```sql
-- Soft delete
ALTER TABLE routines ADD COLUMN deleted_at TEXT;

-- Last run summary (continuity bridge between routine sessions)
ALTER TABLE routines ADD COLUMN last_run_summary TEXT;

-- Cost cap per run (minor units, nullable = no cap)
ALTER TABLE routines ADD COLUMN cost_cap_per_run_minor INTEGER;

-- Created timestamp (backfill existing routines with epoch)
ALTER TABLE routines ADD COLUMN created_at TEXT;

-- Stub task ID for routine sessions
ALTER TABLE routines ADD COLUMN stub_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;

-- Index for soft-delete queries
CREATE INDEX routines_deleted_at_idx ON routines(deleted_at);
```

### 1.2 Alter `routine_runs` table

```sql
-- Link runs to sessions
ALTER TABLE routine_runs ADD COLUMN session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL;

-- Store per-run summary
ALTER TABLE routine_runs ADD COLUMN summary TEXT;

-- Index for session linkage
CREATE INDEX routine_runs_session_id_idx ON routine_runs(session_id);
```

### 1.3 Backfill

```sql
-- Backfill created_at for existing routines
UPDATE routines SET created_at = '2026-01-01T00:00:00.000Z' WHERE created_at IS NULL;
```

Stub tasks for existing routines are created by the application seed script, not raw SQL (requires task table FK constraints and team context).

---

## 2. Drizzle schema changes (`packages/db/src/schema.ts`)

### 2.1 routines table additions

```typescript
// Add to the routines table definition (inside the column object):

/** AA2: Soft delete timestamp. When set, routine is archived. */
deletedAt: text("deleted_at"),

/** AA2: Last successful run's summary. Single-slot overwrite per concept doc. */
lastRunSummary: text("last_run_summary"),

/** AA2: Optional per-run cost ceiling in minor units. NULL = no cap. */
costCapPerRunMinor: integer("cost_cap_per_run_minor"),

/** AA2: Creation timestamp. Backfilled for pre-existing routines. */
createdAt: text("created_at"),

/** AA2: Dedicated stub task for routine sessions. Created at routine creation. */
stubTaskId: text("stub_task_id")
  .references(() => tasks.id, { onDelete: "set null" }),
```

Add to table indexes:
```typescript
index("routines_deleted_at_idx").on(table.deletedAt),
```

### 2.2 routineRuns table additions

```typescript
// Add to the routineRuns table definition:

/** AA2: Link to the session that executed this run. NULL for pre-AA2 runs. */
sessionId: text("session_id")
  .references(() => sessions.id, { onDelete: "set null" }),

/** AA2: Agent-produced summary of this run's outcome. */
summary: text("summary"),
```

Add to table indexes:
```typescript
index("routine_runs_session_id_idx").on(table.sessionId),
```

---

## 3. Shared types (`packages/shared/src/routine.ts`)

### 3.1 Extend RoutineRunOutcome

```typescript
export type RoutineRunOutcome = "success" | "error" | "skipped" | "running" | "timeout";

export const ROUTINE_RUN_OUTCOMES: readonly RoutineRunOutcome[] = [
  "success",
  "error",
  "skipped",
  "running",
  "timeout",
] as const;
```

### 3.2 Extend RoutineInfo

```typescript
export interface RoutineInfo {
  // ... existing fields ...
  /** AA2: per-run cost cap in minor units. Null = no cap. */
  costCapPerRun: WireMoney | null;
  /** AA2: last successful run's summary. Null when no successful runs. */
  lastRunSummary: string | null;
}
```

### 3.3 New: RoutineCreatePayload

```typescript
/** Wire type for POST /api/routines request body. */
export interface RoutineCreatePayload {
  name: string;
  description?: string;
  teamId: string;
  ownerAgentId: string;
  triggerType: "calendar";
  triggerConfig: string; // JSON: { cron: "<expression>" }
  costCapPerRunMinor?: number | null;
}
```

### 3.4 Schedule presets constant

```typescript
/** Cron presets for the schedule picker. */
export const SCHEDULE_PRESETS = [
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every day at 9am", cron: "0 9 * * *" },
  { label: "Every weekday at 9am", cron: "0 9 * * 1-5" },
  { label: "Every Monday at 9am", cron: "0 9 * * 1" },
  { label: "Every month (1st at 9am)", cron: "0 9 1 * *" },
] as const;
```

---

## 4. API routes

### 4.1 POST /api/routines — Create routine

**File:** `packages/server/src/routes/routines-routes.ts`

```typescript
const createRoutineSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  teamId: z.string().min(1),
  ownerAgentId: z.string().min(1),
  triggerType: z.literal("calendar"), // AA2: only calendar triggers
  triggerConfig: z.string().min(1),   // JSON: { cron: "..." }
  costCapPerRunMinor: z.number().int().min(0).nullable().optional(),
});
```

Implementation:
1. Validate body via Zod
2. Verify teamId exists (FK check)
3. Verify ownerAgentId exists and is an agent (not human)
4. Parse triggerConfig JSON, validate cron expression via `parseCron` from routine-scheduler
5. Generate routine id: `crypto.randomUUID()`
6. Create stub task: insert a task row with title `"Routine: {name}"`, state `"accepted"`, teamId, ownerAgentId
7. Insert routine row with all fields, `state: "active"`, `active: true`, `createdAt: now`
8. Compute and set `nextRunAt` from the cron expression
9. Return the created routine row with 201

**Response:** `201 Created` with the routine row JSON.

**Error responses:**
- 400: Invalid body (Zod validation)
- 404: Team not found, agent not found
- 400: Invalid cron expression

### 4.2 PATCH /api/routines/:id — Update routine (extend existing)

**Extend `updateRoutineSchema`** to accept:
```typescript
triggerConfig: z.string().optional(),    // already exists
costCapPerRunMinor: z.number().int().min(0).nullable().optional(), // NEW
```

When `triggerConfig` is updated:
- Validate the new cron expression via `parseCron`
- Recompute `nextRunAt`

When `costCapPerRunMinor` is updated:
- Store the new value (nullable)

**Soft-delete guard:** If `routine.deleted_at IS NOT NULL`, return 404 (treat deleted routines as not found for PATCH).

### 4.3 DELETE /api/routines/:id — Soft delete

**New route** on the routines router.

```typescript
router.delete("/:id", async (c) => {
  const routineId = c.req.param("id");
  const [existing] = await db.select().from(routines)
    .where(eq(routines.id, routineId)).limit(1);
  if (!existing || existing.deletedAt) {
    return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
  }

  const now = new Date().toISOString();
  await db.update(routines).set({
    deletedAt: now,
    state: "paused",       // stop future runs
    active: false,          // backward compat
  }).where(eq(routines.id, routineId));

  return c.json({ deleted: true, deletedAt: now });
});
```

Soft delete sets `deleted_at`, `state: "paused"`, `active: false`. The routine and its run history remain in the DB.

### 4.4 GET / and GET /:id — Filter soft-deleted

**GET /:** Add `WHERE deleted_at IS NULL`:
```typescript
const allRoutines = await db.select().from(routines)
  .where(isNull(routines.deletedAt));
```

**GET /:id:** Add soft-delete check:
```typescript
if (routine.deletedAt) {
  return c.json({ error: "Routine not found", code: API_ERROR_CODES.NOT_FOUND }, 404);
}
```

**GET /api/teams/:id (teams-routes.ts):** The routine query inside TeamDetail also needs `WHERE deleted_at IS NULL`.

### 4.5 POST /api/routines/:id/trigger — Add coalescing

Before creating a session, check for active sessions:

```typescript
// Coalescing: skip if a session for this routine is already active
const coalesced = await shouldCoalesce(db, routineId);
if (coalesced) {
  // Record a skipped run
  const runId = crypto.randomUUID();
  await db.insert(routineRuns).values({
    id: runId,
    routineId,
    startedAt: now,
    outcome: "skipped",
    errorMessage: "Coalesced: previous session still active",
  });
  return c.json({ routineId, fired: false, reason: "coalesced" }, 200);
}
```

---

## 5. Session adaptation (fabric package)

### 5.1 Routine session context data

**File:** `packages/fabric/src/session-context.ts`

New function alongside the existing `buildSessionContextData`:

```typescript
export interface RoutineSessionContextConfig {
  sessionId: string;
  routineId: string;
  agentId: string;
  agentRole: UserRole;
  teamId: string;
}

export interface RoutineSessionContextData {
  routine: {
    id: string;
    name: string;
    description: string | null;
    lastRunSummary: string | null;
  };
  agent: {
    id: string;
    name: string;
    role: string;
  };
  team: {
    id: string;
    name: string;
  };
}

export async function buildRoutineSessionContextData(
  db: HyperIdleDb,
  config: RoutineSessionContextConfig,
): Promise<RoutineSessionContextData> {
  const [routine] = await db.select().from(routines)
    .where(eq(routines.id, config.routineId)).limit(1);
  if (!routine) throw new Error(`Routine ${config.routineId} not found`);

  const [agent] = await db.select().from(users)
    .where(eq(users.id, config.agentId)).limit(1);
  if (!agent) throw new Error(`Agent ${config.agentId} not found`);

  const [team] = await db.select().from(teams)
    .where(eq(teams.id, config.teamId)).limit(1);
  if (!team) throw new Error(`Team ${config.teamId} not found`);

  return {
    routine: {
      id: routine.id,
      name: routine.name,
      description: routine.description,
      lastRunSummary: routine.lastRunSummary,
    },
    agent: {
      id: agent.id,
      name: agent.name,
      role: agent.role,
    },
    team: {
      id: team.id,
      name: team.name,
    },
  };
}
```

### 5.2 Routine prompt composition

**File:** `packages/fabric/src/prompt-composition.ts`

Add a new `buildRoutineTaskSection` function (parallel to `buildTaskSection`):

```typescript
function buildRoutineTaskSection(context: RoutineSessionContextData): string {
  const parts: string[] = [
    "## Routine",
    "",
    `**Name:** ${context.routine.name}`,
  ];

  if (context.routine.description) {
    parts.push(`**Purpose:** ${context.routine.description}`);
  }

  parts.push("");

  if (context.routine.lastRunSummary) {
    parts.push("### Last Run Summary", "", context.routine.lastRunSummary, "");
  } else {
    parts.push("### Last Run Summary", "", "This is the first run of this routine.", "");
  }

  return parts.join("\n");
}
```

And a corresponding `composeRoutinePrompt` function that uses `buildRoutineTaskSection` instead of `buildTaskSection`. This function follows the same structure as `composePrompt` but substitutes the task section for the routine section.

### 5.3 Extend `provisionSession`

**File:** `packages/server/src/services/session-provisioning.ts`

Add `routineId?: string` to `ProvisionSessionParams`:

```typescript
export interface ProvisionSessionParams {
  // ... existing fields ...
  /** AA2: When present, this is a routine session. Context comes from the routine. */
  readonly routineId?: string;
}
```

In the provisioning function, Phase 6/8.5 branches:

```typescript
// Phase 6/8.5: context assembly
let sessionContextData: SessionContextData | RoutineSessionContextData;
let composedPrompt: string;

if (params.routineId) {
  // Routine session: context from routine, not task+bet
  const routineContext = await buildRoutineSessionContextData(db, {
    sessionId,
    routineId: params.routineId,
    agentId: params.agentId,
    agentRole,
    teamId: teamId ?? params.productId,
  });
  sessionContextData = routineContext;

  const { composedPrompt: prompt } = await composeRoutinePrompt({
    soulPromptText,
    context: routineContext,
    tools: toolSummaries,
    workspacePath,
  });
  composedPrompt = prompt;
} else {
  // Task session: existing context path
  const taskContext = await buildSessionContextData(db, { ... });
  sessionContextData = taskContext;
  const { composedPrompt: prompt } = await composePrompt({ ... });
  composedPrompt = prompt;
}
```

### 5.4 Update routine scheduler for coalescing + session adaptation

**File:** `packages/fabric/src/services/routine-scheduler.ts`

Add `shouldCoalesce` helper:

```typescript
export async function shouldCoalesce(
  db: HyperIdleDb,
  routineId: string,
): Promise<boolean> {
  const [activeSession] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.routineId, routineId),
        eq(sessions.state, "active"),
      ),
    )
    .limit(1);
  return activeSession !== undefined;
}
```

Modify `checkAndFireRoutine` to:
1. Call `shouldCoalesce` before creating a session
2. If coalesced, insert a `routine_runs` row with `outcome: "skipped"` and return
3. Pass `routineId` to the session creation so `sessions.routineId` is populated
4. Create a `routine_runs` row with `outcome: "running"` (not "success") at trigger time
5. Store the `sessionId` on the routine_run row

### 5.5 Session completion hook for routine runs

**File:** `packages/server/src/services/session-lifecycle.ts`

When a session with `routineId IS NOT NULL` ends:
1. Find the `routine_runs` row with `routineId` and `outcome = 'running'` and `sessionId`
2. Update it with: `outcome` (success/error/timeout), `endedAt`, `costMinor`, `costCurrency`, `summary`
3. Update `routines.last_run_summary` with the agent's summary (from session notes or a dedicated write)
4. Update `routines.last_run_at`

This is a post-session hook, not a new lifecycle phase. It runs inside `endSession` and `crashSession`.

---

## 6. Frontend changes

### 6.1 RoutineCreateDialog

**File:** `packages/web/src/pages/work/RoutineCreateDialog.tsx` (new)

Follows `BetCreateDialog.tsx` pattern exactly (see approved design for full spec). Key implementation notes:

- Native `<dialog>` with `showModal()`/`close()` JSDOM guard
- Form state reset on open
- Team select hidden when single team
- Schedule picker (see 6.3)
- `apiFetch("/api/routines", { method: "POST", ... })`
- On success: `onCreated()` callback for parent to refresh

**Props:**
```typescript
export interface RoutineCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  teams: { id: string; name: string }[];
  agents: { id: string; name: string }[];
}
```

**Data source for agents:** The parent component (WorkTeam) already fetches TeamDetail which includes `roster: RosterMember[]`. Filter roster members with `isAgent: true` to populate the agent select.

### 6.2 WorkTeam.tsx — Add "New routine" button

Add a "New routine" button in the routines section header (right-aligned). Clicking opens the RoutineCreateDialog.

State additions:
```typescript
const [createRoutineOpen, setCreateRoutineOpen] = useState(false);
```

Agent list derived from `data.roster.filter(m => m.isAgent)`.

### 6.3 Schedule picker (inline component)

**File:** Inside `RoutineCreateDialog.tsx` (not a separate file -- this is page-level UI)

Two stacked elements:
1. DaisyUI `select` with preset options + "Custom..." option
2. DaisyUI `input` shown only when "Custom..." is selected

Presets from `SCHEDULE_PRESETS` constant in shared package.

Custom cron validation: call `humanizeSchedule("calendar", JSON.stringify({ cron: value }))` on change. If it returns "Calendar" (the fallback), the expression is invalid.

### 6.4 WorkRoutine.tsx — Delete button + inline editing

**Delete button:** Add to existing action bar, right-aligned with flex spacer. Inline confirmation (not dialog).

**Inline editing:** Each editable KeyValue field gains an edit mode toggle. One field at a time. Uses PATCH endpoint.

### 6.5 WorkRoutine.tsx — Display new fields

Add to the KV grid:
- `<KeyValue label="Cost cap per run" value={...} />`
- `<KeyValue label="Created" value={...} />`
- `<KeyValue label="Last run summary" value={...} />` (below config section, in its own section)

### 6.6 useRoutine hook — Add mutate support

The existing `useRoutine` hook is read-only. Add a `mutate()` function for optimistic updates after PATCH/DELETE.

---

## 7. Acceptance criteria with verification methods

### AC-1: Create routine from Work surface

**Criterion:** A team lead can create a routine with name, description, schedule, agent, and optional cost cap.

**Verification:**
- **Integration test** (`packages/server/src/__tests__/routines-aa2.test.ts`): POST /api/routines with valid body returns 201 with all fields populated. Routine appears in GET /api/routines. Routine appears in GET /api/teams/:id routines array.
- **Integration test**: POST /api/routines with invalid cron returns 400.
- **Integration test**: POST /api/routines with nonexistent teamId returns 404.
- **Component test** (`packages/web/src/__tests__/RoutineCreateDialog.test.tsx`): Dialog renders all fields. Submit calls API. Cancel closes dialog. Invalid state disables Create button.

### AC-2: Pause, resume, delete routines

**Criterion:** Team lead can pause, resume, and delete routines. Pausing stops future runs. Deleting archives.

**Verification:**
- **Integration test**: PATCH /api/routines/:id with state:"paused" returns 200 with state=paused.
- **Integration test**: PATCH /api/routines/:id with state:"active" returns 200 with state=active.
- **Integration test**: DELETE /api/routines/:id sets deleted_at, state=paused.
- **Integration test**: GET /api/routines does not return soft-deleted routines.
- **Integration test**: GET /api/routines/:id returns 404 for soft-deleted routine.
- **Integration test**: Paused routine does not fire via scheduler (existing routine-scheduler.test.ts coverage + new case).
- **Component test** (`packages/web/src/__tests__/WorkRoutine.AA2.test.tsx`): Delete button shows confirmation. Confirm delete calls API. Cancel restores action bar.

### AC-3: Routine sessions reuse provisioning infrastructure with adapted context

**Criterion:** Routine sessions use the same `provisionSession` function but receive routine context instead of task+bet context.

**Verification:**
- **Unit test** (`packages/fabric/src/__tests__/routine-session-context.test.ts`): `buildRoutineSessionContextData` returns routine name, description, lastRunSummary, agent, team. No task or bet fields.
- **Unit test** (`packages/fabric/src/__tests__/routine-prompt-composition.test.ts`): `composeRoutinePrompt` produces prompt with "## Routine" section, not "## Task" section. Includes last run summary when present. Shows "This is the first run" when absent.
- **Integration test**: `provisionSession` with `routineId` set produces a session with routine context (verify via composed prompt content).

### AC-4: Clean session starts with last run summary continuity

**Criterion:** Each routine session starts clean. Continuity comes from last_run_summary and knowledge items only.

**Verification:**
- **Unit test**: `buildRoutineSessionContextData` reads `routines.last_run_summary` and includes it in context. Does NOT read session notes from previous sessions.
- **Integration test**: After a routine session completes and writes summary, the next routine session's context includes that summary.
- **Schema test**: `routines.last_run_summary` column exists and is writable.

### AC-5: Coalescing

**Criterion:** If a routine session is still active when the next beat arrives, the beat is coalesced (skipped with a log entry).

**Verification:**
- **Unit test** (`packages/fabric/src/__tests__/routine-scheduler.test.ts` or new section): `shouldCoalesce` returns true when an active session exists for the routine, false otherwise.
- **Integration test**: Insert an active session with routineId=X. Call `checkAndFireRoutine` for routine X. Assert: fired=false, reason contains "coalesce". Assert: routine_runs row inserted with outcome="skipped".
- **Integration test**: POST /api/routines/:id/trigger while a session is active returns 200 with fired=false.

### AC-6: Routine session outcomes recorded

**Criterion:** Routine session outcomes (success/failure/timeout, summary, cost) are recorded in run history.

**Verification:**
- **Integration test**: After a routine session completes, the routine_runs row has outcome="success", endedAt set, costMinor set, summary set.
- **Integration test**: After a routine session crashes, the routine_runs row has outcome="error", errorMessage set.
- **Integration test**: GET /api/routines/:id returns runs with the new outcome types and summary field.
- **Type test**: `RoutineRunOutcome` includes "running" and "timeout".

---

## 8. Ordered task list

### Task 1: Schema migration + Drizzle schema

**Files:**
- `packages/db/drizzle/0024_AA2_routine_management.sql`
- `packages/db/src/schema.ts`

**Steps:**
1. Add new columns to `routines` definition in schema.ts (deletedAt, lastRunSummary, costCapPerRunMinor, createdAt, stubTaskId)
2. Add new columns to `routineRuns` definition (sessionId, summary)
3. Add indexes (routines_deleted_at_idx, routine_runs_session_id_idx)
4. Write migration SQL with backfill
5. Run `npm run db:generate` to verify consistency
6. Run `npm run db:migrate` to apply

**Verification:** `npm run db:migrate` succeeds. `npm run check` passes.

**Test:** `packages/db/src/__tests__/routine-schema-aa2.test.ts`
- Insert routine with all new columns, read back, assert
- Insert routine_run with sessionId + summary, read back, assert
- Soft-delete query filter works (WHERE deleted_at IS NULL)

**Dependencies:** None (first task).

### Task 2: Shared types extension

**Files:**
- `packages/shared/src/routine.ts`
- `packages/shared/src/index.ts`

**Steps:**
1. Extend `RoutineRunOutcome` with "running" and "timeout"
2. Add `costCapPerRun` and `lastRunSummary` to `RoutineInfo`
3. Add `RoutineCreatePayload` type
4. Add `SCHEDULE_PRESETS` constant
5. Export new types and constants from index.ts

**Verification:** `npm run check` passes across all packages.

**Dependencies:** None (can run parallel with Task 1).

### Task 3: Routine session context + prompt composition

**Files:**
- `packages/fabric/src/session-context.ts`
- `packages/fabric/src/prompt-composition.ts`
- `packages/fabric/src/index.ts`

**Steps:**
1. Add `RoutineSessionContextConfig`, `RoutineSessionContextData` interfaces
2. Implement `buildRoutineSessionContextData`
3. Add `buildRoutineTaskSection` and `composeRoutinePrompt`
4. Export new functions from index.ts

**Verification:** Unit tests.

**Tests:**
- `packages/fabric/src/__tests__/routine-session-context.test.ts`: context assembly from routine + agent + team
- `packages/fabric/src/__tests__/routine-prompt-composition.test.ts`: prompt includes routine section, last run summary

**Dependencies:** Task 1 (schema), Task 2 (types).

### Task 4: Coalescing helper

**Files:**
- `packages/fabric/src/services/routine-scheduler.ts`

**Steps:**
1. Add `shouldCoalesce(db, routineId)` function
2. Export from fabric index

**Verification:** Unit test.

**Test:** New section in `packages/server/src/__tests__/routine-scheduler.test.ts`
- Active session exists for routine -> shouldCoalesce returns true
- No active session -> shouldCoalesce returns false
- Completed session exists -> shouldCoalesce returns false (only "active" state counts)

**Dependencies:** Task 1 (schema -- needs sessions.routineId column to exist).

### Task 5: API — POST /api/routines (create) + DELETE + extend PATCH/GET

**Files:**
- `packages/server/src/routes/routines-routes.ts`

**Steps:**
1. Add `createRoutineSchema` Zod validation
2. Implement POST / route (create routine + stub task + compute nextRunAt)
3. Implement DELETE /:id route (soft delete)
4. Extend PATCH /:id schema with `costCapPerRunMinor`
5. Add soft-delete filter to GET / and GET /:id
6. Add coalescing check to POST /:id/trigger
7. Extend RoutineInfo response with new fields (costCapPerRun, lastRunSummary, createdAt)

**Verification:** Integration tests.

**Tests:** `packages/server/src/__tests__/routines-aa2.test.ts` (new file)
- POST /api/routines with valid body -> 201
- POST /api/routines with invalid cron -> 400
- POST /api/routines with missing name -> 400
- POST /api/routines with nonexistent teamId -> 404
- DELETE /api/routines/:id -> sets deleted_at
- DELETE /api/routines/:nonexistent -> 404
- GET /api/routines excludes soft-deleted
- GET /api/routines/:deleted -> 404
- PATCH /api/routines/:id with costCapPerRunMinor -> updates
- PATCH /api/routines/:deleted -> 404
- POST /api/routines/:id/trigger while active session exists -> coalesced

**Dependencies:** Task 1 (schema), Task 2 (types), Task 4 (coalescing).

### Task 6: Extend provisioning for routine sessions

**Files:**
- `packages/server/src/services/session-provisioning.ts`
- `packages/server/src/services/session-lifecycle.ts`

**Steps:**
1. Add `routineId?: string` to `ProvisionSessionParams`
2. Branch context assembly in Phase 6/8.5 based on routineId
3. Add routine session completion hook in `endSession`/`crashSession`: update routine_runs, write last_run_summary
4. Set `sessions.routineId` in the session INSERT

**Verification:** Integration test with full provisioning path (may need adapter mocks).

**Dependencies:** Task 1 (schema), Task 3 (context/prompt), Task 4 (coalescing).

### Task 7: Update routine scheduler

**Files:**
- `packages/fabric/src/services/routine-scheduler.ts`

**Steps:**
1. Add coalescing check in `checkAndFireRoutine` (call `shouldCoalesce`)
2. Set `routine_runs.outcome = "running"` at trigger time (not "success")
3. Pass `routineId` to session creation
4. Link `routine_runs.session_id` to the created session

**Verification:** Extend existing `routine-scheduler.test.ts`.

**Dependencies:** Task 4 (coalescing helper), Task 6 (provisioning changes).

### Task 8: Extend teams-routes for soft-delete filtering

**Files:**
- `packages/server/src/routes/teams-routes.ts`

**Steps:**
1. Add `WHERE deleted_at IS NULL` to routine queries in GET /api/teams/:id
2. Update routine count queries in GET /api/teams

**Verification:** Existing team route tests + new case for filtered deleted routines.

**Dependencies:** Task 1 (schema).

### Task 9: Frontend — RoutineCreateDialog + WorkTeam trigger

**Files:**
- `packages/web/src/pages/work/RoutineCreateDialog.tsx` (new)
- `packages/web/src/pages/work/RoutineCreateDialog.stories.tsx` (new)
- `packages/web/src/pages/WorkTeam.tsx` (extend)

**Steps:**
1. Create RoutineCreateDialog with all form fields + schedule picker
2. Create stories file with key states (empty, filled, submitting, error)
3. Add "New routine" button to WorkTeam routines section
4. Wire dialog open/close state
5. Pass agents from roster

**Verification:** Component tests + stories.

**Test:** `packages/web/src/__tests__/RoutineCreateDialog.test.tsx`
- Dialog renders all fields
- Create button disabled when fields empty
- Create button enabled when required fields filled
- Submit calls API with correct payload
- Cancel closes dialog
- Error state shows error message
- Schedule picker shows presets
- Custom schedule input appears when "Custom..." selected

**Dependencies:** Task 2 (shared types), Task 5 (API endpoint).

### Task 10: Frontend — WorkRoutine.tsx extensions (delete, edit, new fields)

**Files:**
- `packages/web/src/pages/WorkRoutine.tsx`

**Steps:**
1. Add Delete button with inline confirmation
2. Add inline edit capability for name, description, schedule, costCapPerRun
3. Display new KV fields (costCapPerRun, createdAt, lastRunSummary)
4. Add lastRunSummary section below configuration

**Verification:** Component tests.

**Test:** `packages/web/src/__tests__/WorkRoutine.AA2.test.tsx`
- Delete button renders
- Clicking Delete shows confirmation
- Confirm delete calls DELETE API
- Cancel restores action bar
- New KV fields render with correct values
- Last run summary section shows summary text or "No previous runs" when null

**Dependencies:** Task 5 (API endpoints), Task 9 (dialog pattern reference).

### Task 11: Seed data update + test seeding

**Files:**
- `packages/db/src/seed.ts`
- `packages/db/src/seed-fixtures.ts`
- All test files that insert routines

**Steps:**
1. Update seed routines with `createdAt` field
2. Create stub tasks for seed routines
3. Update test fixtures to include new columns

**Verification:** `npm run test` all green.

**Dependencies:** Task 1 (schema).

---

## 9. Task dependency graph

```
Task 1 (Schema) ─────────────┬─── Task 2 (Shared types)
                              │
                              ├─── Task 3 (Context + prompt) ← Task 2
                              │
                              ├─── Task 4 (Coalescing helper)
                              │
                              ├─── Task 5 (API routes) ← Tasks 2, 4
                              │
                              ├─── Task 6 (Provisioning) ← Tasks 3, 4
                              │
                              ├─── Task 7 (Scheduler) ← Tasks 4, 6
                              │
                              ├─── Task 8 (Teams routes filter)
                              │
                              ├─── Task 9 (Frontend create dialog) ← Tasks 2, 5
                              │
                              ├─── Task 10 (Frontend detail page) ← Task 5
                              │
                              └─── Task 11 (Seed + test data)
```

**Critical path:** Task 1 -> Task 2 -> Task 3 -> Task 6 -> Task 7

**Parallel tracks:**
- Tasks 2, 4, 8, 11 can start as soon as Task 1 completes
- Tasks 9, 10 can start as soon as Tasks 2 and 5 complete
- Task 5 needs Tasks 2 and 4

---

## 10. Security & abuse cases

| Vector | Applicable? | Mitigation |
|--------|-------------|------------|
| Rate-limit on POST /api/routines | YES | Existing API key auth middleware. A user creating routines at high frequency is not a realistic attack vector in a single-tenant desktop app. No additional rate limiting needed. |
| Input trust on name/description | YES | Zod validation: `name` max 200 chars, `description` max 2000 chars. Both are stored as-is (no HTML rendering risk -- React escapes by default). |
| Cron expression injection | YES | `parseCron` validates cron expressions structurally. Invalid expressions throw. The cron string is stored as JSON inside `triggerConfig` -- never executed as code. The scheduler evaluates cron fields numerically, never as shell commands. |
| Cost cap bypass | LOW | `costCapPerRunMinor` is advisory in AA2 (enforcement is AA3 scope). Setting it to 0 or negative is prevented by Zod `z.number().int().min(0)`. |
| Soft-delete bypass | LOW | Soft-deleted routines return 404 on all GET/PATCH/DELETE endpoints. No API path allows un-deleting a routine (deliberate -- restoring would be a POST /:id/restore, out of scope). |
| Cross-team routine creation | YES | POST /api/routines validates `teamId` FK exists. `ownerAgentId` is validated as an existing user. No check that the agent belongs to the team -- this is intentional (factory-wide agents own routines in any team, per AA1 architecture decision). |
| Path traversal | N/A | No path inputs in routine CRUD. |
| SSRF | N/A | No outbound URLs. |
| Secret handling | N/A | No new credential surfaces. |

---

## 11. Protected tests (must not change assertions)

```yaml
protectedTests:
  - packages/server/src/__tests__/routines.test.ts
  - packages/server/src/__tests__/builtin-routines.test.ts
  - packages/server/src/__tests__/routine-scheduler.test.ts
  - packages/server/src/__tests__/api-e2e.integration.test.ts
  - packages/web/src/__tests__/WorkRoutine.AA1.test.tsx
  - packages/web/src/__tests__/hints.integration.test.tsx
  - packages/server/src/__tests__/routines-aa1.test.ts
```

**Risk assessment:**
- `routines.test.ts`: Inserts routines without new columns. Migration adds columns with defaults/nullable, so INSERT still works. GET responses will include new nullable fields -- existing assertions that check specific properties should still pass since they don't assert the absence of new fields.
- `routine-scheduler.test.ts`: Tests `checkAndFireRoutine`. The coalescing addition changes behavior ONLY when an active session exists for the routineId -- existing tests don't set up this condition, so behavior is preserved.
- `api-e2e.integration.test.ts`: Tests PATCH and retire endpoints. Behavior preserved. GET /api/routines will now filter soft-deleted -- existing test data has no deleted_at, so results are unchanged.
- `WorkRoutine.AA1.test.tsx`: Uses `overrideData` prop. The `RoutineInfo` type gains new optional fields -- existing fixture data missing these fields will show them as null/undefined in the component, which is the correct behavior.

---

## 12. Migration checklist for renamed/moved symbols

| Symbol | Change | Affected files |
|--------|--------|----------------|
| `RoutineRunOutcome` | Gains "running", "timeout" values | `packages/shared/src/routine.ts`, status-mapping if needed |
| `RoutineInfo` | Gains `costCapPerRun`, `lastRunSummary` | `packages/shared/src/routine.ts`, `routines-routes.ts` (GET /:id response), `WorkRoutine.tsx` |
| `routines` table | Gains 5 columns | `packages/db/src/schema.ts`, all test files inserting routines |
| `routineRuns` table | Gains 2 columns | `packages/db/src/schema.ts`, all test files inserting routine_runs |
| `ProvisionSessionParams` | Gains `routineId` optional | `packages/server/src/services/session-provisioning.ts`, `sessions-routes.ts` (no change needed -- routineId is optional) |
| `GET /api/routines` | Now filters `WHERE deleted_at IS NULL` | `routines-routes.ts` |
| `POST /api/routines/:id/trigger` | Now checks coalescing first | `routines-routes.ts` |
| `updateRoutineSchema` | Gains `costCapPerRunMinor` | `routines-routes.ts` |

---

## 13. Risks and ambiguities

1. **Provisioning path complexity.** Adding a branch to `provisionSession` for routine context increases the cognitive complexity of an already-dense function. Mitigation: the branch is a single `if` that swaps one function call. The two context builders are independent functions, not interleaved logic.

2. **Stub task lifecycle.** When a routine is soft-deleted, its stub task remains. This is acceptable -- the task has no independent meaning and doesn't appear in any task list (it's never assigned to a bet). If the routine is later hard-deleted, the stub task becomes orphaned. AA2 does not implement hard delete, so this is deferred.

3. **Last run summary write timing.** The concept doc says "written by the agent during session teardown." In practice, the agent writes session notes to `work/task-notes.md` (materialized path), and the fabric's writeback watcher syncs them. For routine sessions, we need to route the session notes to `routines.last_run_summary` instead of `tasks.notes`. This requires the writeback watcher to be aware of routine sessions. Alternative: read session notes from the workspace at session end and write to `routines.last_run_summary` in the `endSession` hook. This is simpler and avoids modifying the watcher.

4. **Cron validation depth.** The `parseCron` function in `routine-scheduler.ts` handles standard 5-field cron. Users entering unusual cron (e.g., `*/5 * * * *` for every 5 minutes) need to see a human-readable preview. The `humanizeSchedule` function only handles simple patterns. Complex cron falls back to showing the raw expression. This is acceptable for AA2.

5. **RosterMember isAgent field.** The RoutineCreateDialog needs to filter agents from the roster. The `RosterMember` type must include enough information to distinguish agents from humans. The current roster includes `role: string` which can be checked against agent roles. Verify at implementation time.

6. **Active boolean deprecation.** AA1 kept `active` for backward compat and deferred dropping it to AA2. AA2 still has code paths reading `active` (e.g., `routine-scheduler.ts` line 399: `eq(routines.active, true)`, line 445: `eq(routines.active, true)`). Fully dropping `active` should be deferred to after AA2, when all code paths have been migrated to use `state`. AA2 continues the sync pattern: setting `state` also sets `active`.
