# L19 Architecture — Harness Jump-Out from Session Metadata

## 1. Summary

L19 adds three columns to the `sessions` table (`harnessUrl`, `tokensInput`, `tokensOutput`), enriches the `GET /api/bets/:id` response to include latest-session metadata per task, extends the frontend types and rendering to show an outcome chip and a jump-out link.

No new API endpoints. No new custom components. No new packages.

---

## 2. Schema Migration

**File:** `packages/db/drizzle/0010_add_session_harness_fields.sql`

```sql
ALTER TABLE sessions ADD COLUMN harness_url TEXT;
ALTER TABLE sessions ADD COLUMN tokens_input INTEGER;
ALTER TABLE sessions ADD COLUMN tokens_output INTEGER;
```

All three columns are nullable -- existing session rows predate these fields.

**Schema update:** `packages/db/src/schema.ts`

Add to the `sessions` table definition:

```ts
harnessUrl: text("harness_url"),
tokensInput: integer("tokens_input"),
tokensOutput: integer("tokens_output"),
```

These are placed after the existing `traceId` column.

**Drizzle meta:** Run `bun run db:generate` to regenerate the migration meta after adding the schema columns. The builder must verify the generated SQL matches the manual migration.

---

## 3. Shared Types

**File:** `packages/shared/src/types.ts`

Add `SessionOutcome` re-export or define it here. Currently `SessionOutcome` is defined in `packages/shared/src/events.ts` (line 49). It is already exported. No new type definition needed -- import from events.ts.

**File:** `packages/shared/src/index.ts` (barrel)

Ensure `SessionOutcome` is re-exported from the barrel if not already. Verify at build time.

---

## 4. API Changes

### 4.1 Enrich `GET /api/bets/:id` response

**File:** `packages/server/src/routes/bets.ts`

The current endpoint (lines 106-117) does:

```ts
const betTasks = db.select().from(tasks).where(eq(tasks.betId, betId)).all();
return c.json({ ...bet, tasks: betTasks });
```

Replace with a query that joins the latest session per task. The "latest session" is defined as the session with the most recent `started_at` for a given `task_id`.

**Strategy: correlated subquery via Drizzle sql template.** This avoids N+1 queries and is consistent with the L18 artifact-thread-summary pattern in the same file.

```ts
// Fetch tasks with latest session metadata
const betTasks = db
  .select({
    // All task columns
    id: tasks.id,
    betId: tasks.betId,
    productId: tasks.productId,
    teamId: tasks.teamId,
    ownerAgentId: tasks.ownerAgentId,
    title: tasks.title,
    description: tasks.description,
    doneCondition: tasks.doneCondition,
    state: tasks.state,
    dependencies: tasks.dependencies,
    artifacts: tasks.artifacts,
    costCap: tasks.costCap,
    costActual: tasks.costActual,
    durability: tasks.durability,
    riskTier: tasks.riskTier,
    attentionScore: tasks.attentionScore,
    crossTeam: tasks.crossTeam,
    threadId: tasks.threadId,
    notes: tasks.notes,
    auditTrail: tasks.auditTrail,
    createdAt: tasks.createdAt,
    updatedAt: tasks.updatedAt,
    // Latest session metadata via correlated subqueries
    latestSessionOutcome: sql<string | null>`(
      SELECT outcome FROM sessions
      WHERE task_id = ${tasks.id}
      ORDER BY started_at DESC LIMIT 1
    )`.as("latest_session_outcome"),
    latestSessionCost: sql<number | null>`(
      SELECT cost FROM sessions
      WHERE task_id = ${tasks.id}
      ORDER BY started_at DESC LIMIT 1
    )`.as("latest_session_cost"),
    latestSessionTokensInput: sql<number | null>`(
      SELECT tokens_input FROM sessions
      WHERE task_id = ${tasks.id}
      ORDER BY started_at DESC LIMIT 1
    )`.as("latest_session_tokens_input"),
    latestSessionTokensOutput: sql<number | null>`(
      SELECT tokens_output FROM sessions
      WHERE task_id = ${tasks.id}
      ORDER BY started_at DESC LIMIT 1
    )`.as("latest_session_tokens_output"),
    latestSessionHarnessUrl: sql<string | null>`(
      SELECT harness_url FROM sessions
      WHERE task_id = ${tasks.id}
      ORDER BY started_at DESC LIMIT 1
    )`.as("latest_session_harness_url"),
  })
  .from(tasks)
  .where(eq(tasks.betId, betId))
  .all();
```

**Performance note:** The `sessions_task_id_idx` index on `sessions.task_id` (schema line 148) ensures the correlated subqueries are index-covered. At expected volumes (< 50 tasks per bet, < 20 sessions per task), this is well within SQLite's capability. The five correlated subqueries could be collapsed into a single subquery returning a JSON object, but that adds parsing complexity for marginal performance gain. The explicit columns are clearer for the builder.

**Alternative considered:** A separate `GET /api/tasks/:id/latest-session` endpoint. Rejected: it would require N+1 fetches from the frontend (one per task in the list) or a batch endpoint. Inlining the data in the existing bet-detail response is simpler, one round trip, and consistent with how the page already fetches task data.

### 4.2 Session routes update

**File:** `packages/server/src/routes/sessions-routes.ts`

The `createSessionSchema` (line 14) needs to accept the new optional fields:

```ts
const createSessionSchema = z.object({
  agentId: z.string(),
  taskId: z.string(),
  modelTier: z.enum(["reasoning", "workhorse", "fast"]),
  harnessUrl: z.string().url().optional(),
  tokensInput: z.number().int().nonnegative().optional(),
  tokensOutput: z.number().int().nonnegative().optional(),
});
```

The `POST /api/sessions` handler (line 63) should pass these fields through to the insert:

```ts
harnessUrl: body.harnessUrl ?? null,
tokensInput: body.tokensInput ?? null,
tokensOutput: body.tokensOutput ?? null,
```

The `updateSessionSchema` should also accept token updates (agents may report final token counts at session end):

```ts
const updateSessionSchema = z.object({
  state: z.enum(["done", "crashed"]),
  outcome: z.string().optional(),
  notes: z.string().optional(),
  tokensInput: z.number().int().nonnegative().optional(),
  tokensOutput: z.number().int().nonnegative().optional(),
});
```

---

## 5. Frontend Type Changes

### 5.1 `BetDetail` type

**File:** `packages/web/src/types/bet.ts`

Extend the tasks array element with optional session metadata:

```ts
export interface BetDetail {
  // ... existing fields unchanged ...
  tasks: Array<{
    id: string;
    title: string;
    owner: string;
    state: TaskState;
    cost: string;
    // L19: latest session metadata (nullable -- no session yet)
    latestSessionOutcome: SessionOutcome | null;
    latestSessionCost: number | null;       // cents
    latestSessionTokensInput: number | null;
    latestSessionTokensOutput: number | null;
    latestSessionHarnessUrl: string | null;
  }>;
}
```

Import `SessionOutcome` from `@hyperidle/shared`.

### 5.2 `KanbanTask` interface

**File:** `packages/web/src/shell/Kanban.tsx`

Extend the KanbanTask interface with optional session fields:

```ts
export interface KanbanTask {
  id: string;
  title: string;
  owner: string;
  state: TaskState;
  cost?: string;
  betTag?: string;
  // L19: latest session metadata
  latestSessionOutcome?: SessionOutcome | null;
  latestSessionHarnessUrl?: string | null;
}
```

Only `outcome` and `harnessUrl` are needed on KanbanTask -- cost and tokens are detail-level data shown in TaskSheet, not on the Kanban card.

### 5.3 Status mapping

**File:** `packages/design-system/src/status-mapping.ts`

Add the session outcome mapping:

```ts
import type { SessionOutcome } from "@hyperidle/shared";

export const SESSION_OUTCOME_MAP: Record<SessionOutcome, Status> = {
  completed: "done",
  crashed: "error",
  stopped: "paused",
};

export function sessionOutcomeToStatus(outcome: SessionOutcome): Status {
  return SESSION_OUTCOME_MAP[outcome];
}
```

Export from `packages/design-system/src/index.ts`.

---

## 6. UI Changes

### 6.1 WorkBet.tsx — bet-detail task table

**File:** `packages/web/src/pages/WorkBet.tsx`

1. Add "Outcome" column between "Status" and "Owner" -- uses `SortableHeader` with column key `"outcome"`. The sort value is `task.latestSessionOutcome ?? ""`.

2. Add "Session" column after "Cost" -- non-sortable header. Cell contains the jump-out link or empty.

3. Update `SortColumn` type: `type SortColumn = "title" | "status" | "owner" | "cost" | "outcome";`

4. Update `sortTasks` to handle the `"outcome"` column: sort value is `task.latestSessionOutcome ?? ""`.

5. Outcome cell renders `<StatusChip status={sessionOutcomeToStatus(task.latestSessionOutcome)} />` when `task.latestSessionOutcome` is not null. Empty otherwise.

6. Session cell renders the jump-out link:

```tsx
{task.latestSessionHarnessUrl && isValidHarnessUrl(task.latestSessionHarnessUrl) ? (
  <a
    href={task.latestSessionHarnessUrl}
    target="_blank"
    rel="noopener noreferrer"
    className="font-mono text-xs text-[var(--primary)] hover:underline"
    aria-label="Open session in harness (opens in new tab)"
  >
    Open in harness
  </a>
) : null}
```

7. `isValidHarnessUrl` is a pure function co-located in WorkBet.tsx (or a shared util):

```ts
function isValidHarnessUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}
```

### 6.2 TaskSheet.tsx — session metadata section

**File:** `packages/web/src/shell/TaskSheet.tsx`

1. Extend `TaskSheetProps` to accept session metadata. Since `TaskSheet` already receives a `KanbanTask`, and we're extending `KanbanTask` (section 5.2), the outcome is available via `task.latestSessionOutcome`.

2. For the full session detail (cost, tokens, harness URL), `TaskSheet` needs the full task data. Two options:

   **Option A: Extend KanbanTask with all session fields.** Adds cost/tokens/url to KanbanTask. Simple but pollutes the Kanban-level interface with detail-level data.

   **Option B: Accept a separate `sessionMeta` prop on TaskSheet.** Decouples the Kanban card shape from the detail sheet.

   **Decision: Option A.** The data is small (5 nullable fields), the KanbanTask interface is already a page-shape type (not a wire type), and the alternative adds prop-threading complexity for minimal benefit. The fields are optional so callers that don't have session data (e.g., WorkTeam Kanban) don't break.

   Update `KanbanTask` to include all five session fields (all optional):

   ```ts
   export interface KanbanTask {
     id: string;
     title: string;
     owner: string;
     state: TaskState;
     cost?: string;
     betTag?: string;
     latestSessionOutcome?: SessionOutcome | null;
     latestSessionCost?: number | null;
     latestSessionTokensInput?: number | null;
     latestSessionTokensOutput?: number | null;
     latestSessionHarnessUrl?: string | null;
   }
   ```

3. In `TaskSheet`, below the existing task summary div, add a session metadata section:

```tsx
{task.latestSessionOutcome && (
  <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-lo)] text-xs font-mono text-[var(--text-lo)]">
    <StatusChip status={sessionOutcomeToStatus(task.latestSessionOutcome)} />
    {task.latestSessionCost != null && (
      <>
        <span aria-hidden>|</span>
        <span>${(task.latestSessionCost / 100).toFixed(2)}</span>
      </>
    )}
    {(task.latestSessionTokensInput != null || task.latestSessionTokensOutput != null) && (
      <>
        <span aria-hidden>|</span>
        <span>
          {formatTokens(task.latestSessionTokensInput ?? 0)} in / {formatTokens(task.latestSessionTokensOutput ?? 0)} out
        </span>
      </>
    )}
    {task.latestSessionHarnessUrl && isValidHarnessUrl(task.latestSessionHarnessUrl) && (
      <>
        <span aria-hidden>|</span>
        <a
          href={task.latestSessionHarnessUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--primary)] hover:underline"
          aria-label="Open session in harness (opens in new tab)"
        >
          Open in harness
        </a>
      </>
    )}
  </div>
)}
```

4. `formatTokens` helper (co-located in TaskSheet or shared util):

```ts
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
```

### 6.3 WorkBet.tsx — data mapping

The `GET /api/bets/:id` response now includes task rows with `latestSessionOutcome`, `latestSessionCost`, etc. The `useBet` hook casts the response to `BetDetail`. The data flows through to `sortedTasks` and into the table rows and `TaskSheet`.

The data mapping from API response to `BetDetail.tasks` array elements needs to account for the `owner` field. Currently `BetDetail.tasks[].owner` is a string, but the API returns `ownerAgentId` (a UUID). This is an existing mismatch that L19 does not introduce -- the `useBet` hook just casts the API response to `BetDetail`. The builder should verify this works and document any needed transformation.

---

## 7. Hardcoded Data Inventory (L6)

The L6 inventory (`plans/reviews/hardcoded-data-inventory.md`) does not have session-specific rows to close. The AC says "all hardcoded session data is replaced; matching inventory rows from L6 are closed." Since there are no hardcoded session fixtures in the runtime code (verified by grep), this AC is satisfied trivially -- there is no hardcoded session data to replace.

The builder should verify this by grepping for `MOCK_SESSION`, `FALLBACK_SESSION`, or any hardcoded session cost/outcome/harness data in `packages/web/src/` (excluding test and story files).

---

## 8. Test Plan

### 8.1 Vitest unit tests

**File:** `packages/design-system/src/__tests__/status-mapping.test.ts` (extend existing)

- `sessionOutcomeToStatus("completed")` returns `"done"`
- `sessionOutcomeToStatus("crashed")` returns `"error"`
- `sessionOutcomeToStatus("stopped")` returns `"paused"`

**File:** `packages/web/src/__tests__/WorkBet.session.test.tsx` (new)

- Given a `BetDetail` with a task that has `latestSessionOutcome: "completed"` and a valid `latestSessionHarnessUrl`, the outcome chip is rendered and the jump-out link is present.
- Given a `BetDetail` with a task that has `latestSessionOutcome: null`, no outcome chip and no jump-out link are rendered.
- Given a task with `latestSessionHarnessUrl` that is malformed (no http/https prefix), the jump-out link is not rendered.
- Given a task with `latestSessionOutcome: "crashed"`, the outcome chip shows the `error` status.

**File:** `packages/web/src/shell/__tests__/TaskSheet.session.test.tsx` (new)

- Given a KanbanTask with session metadata, the session section is rendered with outcome chip, cost, tokens, and jump-out link.
- Given a KanbanTask without session metadata, the session section is not rendered.
- Given a KanbanTask with a malformed harness URL, the jump-out link is not rendered but the outcome chip is.

### 8.2 Playwright E2E

**File:** `packages/web/e2e/work-bet-session.spec.ts` (new)

- Seed a bet with tasks, seed a session with outcome, cost, tokens, and harness URL for one task.
- Navigate to `/work/bet/:betId`.
- Assert the outcome chip is visible in the task table row.
- Assert the "Open in harness" link is visible.
- Click the jump-out link -- assert `window.open` was called with the correct URL (or intercept navigation and verify the href).
- Assert a task without a session has no outcome chip and no jump-out link.

---

## 9. File List (Ordered Tasks)

### Phase 1: Schema + Types

1. `packages/db/src/schema.ts` -- add `harnessUrl`, `tokensInput`, `tokensOutput` to sessions table
2. `packages/db/drizzle/0010_add_session_harness_fields.sql` -- migration
3. `packages/shared/src/types.ts` or `events.ts` -- verify `SessionOutcome` is exported from barrel
4. `packages/design-system/src/status-mapping.ts` -- add `SESSION_OUTCOME_MAP` and `sessionOutcomeToStatus`
5. `packages/design-system/src/index.ts` -- export new mapping

### Phase 2: API

6. `packages/server/src/routes/sessions-routes.ts` -- accept new fields in create/update schemas
7. `packages/server/src/routes/bets.ts` -- enrich `GET /bets/:id` with latest session per task

### Phase 3: Frontend Types + Rendering

8. `packages/web/src/types/bet.ts` -- extend `BetDetail.tasks` with session fields
9. `packages/web/src/shell/Kanban.tsx` -- extend `KanbanTask` with session fields
10. `packages/web/src/pages/WorkBet.tsx` -- add outcome column, session column, jump-out link
11. `packages/web/src/shell/TaskSheet.tsx` -- add session metadata section with outcome, cost, tokens, jump-out

### Phase 4: Tests

12. `packages/design-system/src/__tests__/status-mapping.test.ts` -- extend with session outcome tests
13. `packages/web/src/__tests__/WorkBet.session.test.tsx` -- new test file
14. `packages/web/src/shell/__tests__/TaskSheet.session.test.tsx` -- new test file
15. `packages/web/e2e/work-bet-session.spec.ts` -- new Playwright E2E

### Phase 5: Verification

16. `bun run db:generate` -- verify migration meta is consistent
17. `bun run check` -- zero type errors
18. `bun run lint` -- zero lint errors
19. `bun run test` -- all green

---

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Correlated subqueries slow at scale | Low -- index exists, volume bounded | sessions_task_id_idx covers the lookup; bets have < 50 tasks |
| BetDetail type mismatch with API | Medium -- existing issue with `owner` vs `ownerAgentId` | Builder verifies and documents; may need a transformation layer in useBet |
| Harness URL injection (XSS) | Low -- URL is rendered as `href` on `<a>`, not as `innerHTML` | React escapes attributes; `rel="noopener noreferrer"` prevents opener access; `isValidHarnessUrl` rejects non-http(s) protocols |
| New table columns break existing session creation | Low -- all new columns are nullable | Existing callers that don't send harnessUrl/tokens will insert nulls |

---

## 11. Self-Critique

**Strengths:** Minimal API surface change (no new endpoints), leverages existing patterns (correlated subqueries from L18, StatusChip mapping from I4), respects component budget.

**Weaknesses:** Five correlated subqueries in the bet-detail endpoint could be collapsed into a single subquery returning all five values, which would be slightly more efficient. Left as-is for clarity -- the builder can optimize if profiling shows it matters. The `KanbanTask` interface is accumulating optional fields; a future refactor should consider splitting it into a base Kanban shape and an extended detail shape. Not L19's problem.

**Score: 7.5/10.** Straightforward, bounded, no architectural risk. The main complexity is in the SQL enrichment, which follows an established pattern in the codebase.
