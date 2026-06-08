# AC1 Architecture Plan -- Structured Outcome Fields

## Required reading

- `plans/AC1/concept.md` -- concept doc (locked)
- `plans/AC1/design/approved.md` -- approved design (locked)
- `packages/db/src/schema.ts` -- existing schema
- `packages/shared/src/types.ts` -- existing types (BetStatus, TaskState, SessionOutcome, MUTABLE_BET_FIELDS)
- `packages/shared/src/events.ts` -- existing events (SessionOutcome type, SessionEndedEvent)
- `packages/server/src/routes/bets.ts` -- existing bet routes + PATCH discriminated union pattern
- `packages/server/src/routes/tasks.ts` -- existing task routes
- `packages/server/src/routes/sessions-routes.ts` -- existing session routes (updateSessionSchema)
- `packages/web/src/pages/WorkBet.tsx` -- existing bet detail page
- `packages/web/src/pages/WorkTask.tsx` -- existing task detail page
- `packages/web/src/pages/WorkPortfolio.tsx` -- existing portfolio page
- `packages/web/src/types/bet.ts` -- BetDetail type
- `packages/web/src/hooks/useBets.ts` -- BetListItem type
- `packages/web/src/hooks/useTaskSessions.ts` -- TaskSession type
- `packages/design-system/src/BetCard.tsx` -- BetCard props

---

## Plan reconciliation (spec vs reality)

| Spec assumption | Reality | Resolution |
|---|---|---|
| `bets` table has outcome fields | No outcome columns exist | Add via migration 0026 |
| `tasks` table has outcome fields | No outcome columns exist | Add via migration 0026 |
| `sessions` table has effectiveness_score | No such column | Add via migration 0026 |
| `sessions.outcome` exists as disposition | Yes: `text("outcome")` nullable, values `completed/crashed/stopped` | Untouched. New column is `effectiveness_score`, not `outcome` |
| PATCH /bets/:id supports outcome fields | No -- current discriminated union has done_condition, hypothesis, cost_appetite, description, at_risk | Extend discriminated union with `outcome_verdict` and `outcome_summary` branches |
| PATCH /tasks/:id supports outcome fields | No -- current schema has title, description, doneCondition, ownerAgentId | Extend updateTaskSchema with `outcomeVerdict` field |
| PATCH /sessions/:id supports effectiveness | No -- current schema has state, outcome, notes | Extend updateSessionSchema with `effectivenessScore` field |
| GET /bets returns outcome_verdict | No -- returns full rows but no outcome columns yet | Columns auto-included once added to schema (select(*) pattern) |
| GET /bets/:id returns outcome for tasks | No | Task outcome columns auto-included in the betTasks select |
| BetCard has verdict prop | No | Add optional `outcomeVerdict` prop |
| BetListItem has outcomeVerdict | No | Add optional field |
| BetDetail has outcome fields | No | Add fields |
| TaskSession has effectivenessScore | No | Add optional field |
| No `GET /tasks/:id/sessions` endpoint exists as a dedicated route | Correct -- the frontend hook `useTaskSessions` calls `/api/tasks/:taskId/sessions` but sessions are mounted at `/api/sessions` with `?task_id=` filter | The task sessions hook uses `/api/tasks/:id/sessions` which doesn't exist as a route. It likely 404s or is handled by a catch-all. Need to verify: the frontend may actually use the sessions list filter. |

Let me verify the task sessions endpoint situation.

The `useTaskSessions` hook fetches `/api/tasks/${taskId}/sessions`. But the tasks router has no `/tasks/:id/sessions` sub-route. The sessions router is mounted at `/api/sessions` and supports `?task_id=` filter. This means either:
1. There's a proxy/catch-all I missed, or
2. The hook is currently broken/unused in production

Since WorkTask.tsx uses `useTaskSessions(taskId)`, the data must come from somewhere. Looking at the task detail page: `const { data: sessionsData } = useTaskSessions(taskId)` -- if this 404s, it returns empty sessions, which the page handles gracefully with "No sessions yet." For AC1, the effectiveness score display on sessions is read-only and tolerates missing data. No new endpoint needed for this.

---

## Phase 0 -- Interrogation

**Q1: Should bet outcome be a dedicated POST endpoint or extend the existing PATCH?**
My read: Dedicated `POST /api/bets/:id/outcome` endpoint. Reason: the existing PATCH `/api/bets/:id` is a discriminated union on `field` for individual field updates with revision log tracking. An outcome is a multi-field write (verdict + summary) that happens as one atomic operation. Fitting it into the existing single-field PATCH pattern would require either two sequential PATCHes (verdict then summary -- race condition risk) or a new discriminated union variant that accepts multiple values (breaks the pattern). A dedicated endpoint is cleaner.

**Q2: Task outcome and session effectiveness -- separate endpoints or extend existing PATCH?**
My read: Extend existing PATCH for both. Task outcome is a single field (`outcomeVerdict`). Session effectiveness is a single field (`effectivenessScore`). Both fit the existing PATCH pattern cleanly.

**Q3: Should the verdict filter on portfolio be server-side or client-side?**
My read: Client-side. The existing team and status filters are client-side. The portfolio fetches all bets via `GET /api/bets` and filters in the `filteredBets` memo. Adding a client-side verdict filter is consistent. At expected volumes (<10,000 bets per spec constraint), this is fine.

---

## Types and schemas

### 1. Shared types (`packages/shared/src/types.ts`)

```typescript
// Closed enums -- adding values requires concept-doc update (plans/AC1/concept.md)
export const BET_OUTCOME_VERDICTS = [
  'validated', 'refuted', 'partial', 'inconclusive'
] as const;
export type BetOutcomeVerdict = (typeof BET_OUTCOME_VERDICTS)[number];

export const TASK_OUTCOME_VERDICTS = [
  'met', 'met_with_rework', 'partially_met', 'not_met'
] as const;
export type TaskOutcomeVerdict = (typeof TASK_OUTCOME_VERDICTS)[number];
```

Export from `packages/shared/src/index.ts`.

### 2. DB schema (`packages/db/src/schema.ts`)

Add columns to existing tables:

**bets table:**
```typescript
outcomeVerdict: text("outcome_verdict"),          // BetOutcomeVerdict | null
outcomeSummary: text("outcome_summary"),           // free text | null
outcomeRecordedAt: text("outcome_recorded_at"),    // ISO 8601 | null
outcomeRecordedBy: text("outcome_recorded_by"),    // user ID | null
```

**tasks table:**
```typescript
outcomeVerdict: text("outcome_verdict"),           // TaskOutcomeVerdict | null
outcomeRecordedAt: text("outcome_recorded_at"),    // ISO 8601 | null
outcomeRecordedBy: text("outcome_recorded_by"),    // user ID | null
```

**sessions table:**
```typescript
effectivenessScore: text("effectiveness_score"),    // stringified float 0-1 | null
effectivenessRecordedAt: text("effectiveness_recorded_at"), // ISO 8601 | null
effectivenessRecordedBy: text("effectiveness_recorded_by"), // user ID | null
```

Note: `effectivenessScore` is stored as `text` not `real` because the existing schema uses `text` for all non-integer values (timestamps are text, not datetime). The API layer parses/validates the 0-1 range.

No indexes needed on outcome columns -- they are low-selectivity fields used for client-side filtering, not server-side queries.

### 3. Migration (`packages/db/drizzle/0026_AC1_outcome_fields.sql`)

```sql
ALTER TABLE bets ADD COLUMN outcome_verdict TEXT;
ALTER TABLE bets ADD COLUMN outcome_summary TEXT;
ALTER TABLE bets ADD COLUMN outcome_recorded_at TEXT;
ALTER TABLE bets ADD COLUMN outcome_recorded_by TEXT;

ALTER TABLE tasks ADD COLUMN outcome_verdict TEXT;
ALTER TABLE tasks ADD COLUMN outcome_recorded_at TEXT;
ALTER TABLE tasks ADD COLUMN outcome_recorded_by TEXT;

ALTER TABLE sessions ADD COLUMN effectiveness_score TEXT;
ALTER TABLE sessions ADD COLUMN effectiveness_recorded_at TEXT;
ALTER TABLE sessions ADD COLUMN effectiveness_recorded_by TEXT;
```

All nullable. No backfill. No NOT NULL constraints. Existing rows get null automatically.

### 4. API endpoints

#### POST /api/bets/:id/outcome

New dedicated endpoint for recording/updating bet outcomes.

**Request body:**
```typescript
const betOutcomeSchema = z.object({
  verdict: z.enum(BET_OUTCOME_VERDICTS),
  summary: z.string().max(2000).optional(),
});
```

**Behavior:**
1. Load bet by id (404 if not found)
2. Validate bet status is `completed` or `killed` (400 if not -- you can only evaluate outcomes of finished bets)
3. Write `outcomeVerdict`, `outcomeSummary`, `outcomeRecordedAt` (now), `outcomeRecordedBy` (from auth context)
4. If previous outcome existed, append to `revisionLog` with old values
5. Return updated bet row

**Response:** 200 with the updated bet (same shape as GET /bets/:id detail but without tasks)

#### PATCH /api/tasks/:id -- extend

Add a new branch to `updateTaskSchema`:

```typescript
const updateTaskOutcomeSchema = z.object({
  outcomeVerdict: z.enum(TASK_OUTCOME_VERDICTS),
});
```

Extend the existing PATCH handler to handle `outcomeVerdict`:
- Validate task exists (404 if not)
- No state restriction -- outcome can be set on tasks in any state (the spec says "set during review" but does not mandate a state gate)
- Write `outcomeVerdict`, `outcomeRecordedAt` (now), `outcomeRecordedBy` (from auth context)
- Append to `auditTrail` JSON with old/new values
- Return updated task row

#### PATCH /api/sessions/:id -- extend

Add `effectivenessScore` to `updateSessionSchema`:

```typescript
const updateSessionSchema = z.object({
  state: z.enum(["done", "crashed"]).optional(),
  outcome: z.string().optional(),
  notes: z.string().optional(),
  effectivenessScore: z.number().min(0).max(1).optional(),
});
```

When `effectivenessScore` is present in the body:
- Write `effectiveness_score` (as string), `effectiveness_recorded_at` (now), `effectiveness_recorded_by` (from auth context, falling back to session's agentId)
- No state restriction

#### GET /api/bets -- existing (no change needed)

The existing `select().from(bets)` already returns all columns. Once the migration adds the new columns, they appear automatically in the response. The `BetListItem` frontend type must be updated to accept the new field.

#### GET /api/bets/:id -- existing (minor update)

The existing detail endpoint uses explicit column select for tasks (`betTasks`). The new task outcome columns must be added to that select.

### 5. Frontend types

#### BetDetail (`packages/web/src/types/bet.ts`)

Add to the interface:
```typescript
outcomeVerdict: BetOutcomeVerdict | null;
outcomeSummary: string | null;
outcomeRecordedAt: string | null;
outcomeRecordedBy: string | null;
```

Add to the `tasks` array item:
```typescript
outcomeVerdict?: TaskOutcomeVerdict | null;
```

#### BetListItem (`packages/web/src/hooks/useBets.ts`)

Add:
```typescript
outcomeVerdict?: BetOutcomeVerdict | null;
```

#### TaskSession (`packages/web/src/hooks/useTaskSessions.ts`)

Add:
```typescript
effectivenessScore?: number | null;
```

#### BetCard (`packages/design-system/src/BetCard.tsx`)

Add optional prop:
```typescript
outcomeVerdict?: string;
```

Render as a neutral badge (surface-container bg, text-secondary text) after the status badge when not null.

### 6. Frontend pages

#### WorkBet.tsx -- Outcome section

New section after stat cards row, before Pitch section. Contains:
- Section header "Outcome" (same pattern as Tasks/Artifacts/Discussion)
- Not-evaluated state: "Not evaluated" text + "Record outcome" ghost button
- Populated state: verdict badge + metadata line + summary text + "Edit outcome" ghost button
- Editing state: inline form with select + textarea + Cancel/Save buttons
- State managed with `useState<'view' | 'editing'>` and local form state
- Save handler: `POST /api/bets/:id/outcome` via apiFetch, then refresh bet data

#### WorkBet.tsx -- Task rows

Add optional outcome badge before state badge on each task row. Only rendered when `task.outcomeVerdict` is not null. Badge uses neutral style.

Verdict label mapping (as a const object):
```typescript
const TASK_VERDICT_LABEL: Record<TaskOutcomeVerdict, string> = {
  met: "Met",
  met_with_rework: "Rework",
  partially_met: "Partial",
  not_met: "Not met",
};
```

#### WorkTask.tsx -- Meta-strip outcome cell

New cell at the end of the bordered metadata cell grid. Shows:
- Label: "Outcome" (11px semibold uppercase)
- Value: verdict label (13px font-500 text-primary) or "--" when null (13px text-tertiary)

#### WorkTask.tsx -- Session effectiveness

Add effectiveness score to each session row, between cost and status. Displayed as a 2-decimal number in mono font when not null. Hidden when null.

#### WorkPortfolio.tsx -- Verdict filter

New set of pill-shaped filter buttons after team pills. Multi-select (toggle on/off). Filter options: Validated, Refuted, Partial, Inconclusive, Not evaluated.

State: `useState<Set<string>>` for selected verdict filters. Integrated into existing `filteredBets` memo.

---

## Acceptance criteria with verification

| # | Criterion | Verification method |
|---|---|---|
| AC-1 | Bet outcome verdict (validated/refuted/partial/inconclusive) can be recorded as a structured field | Integration test: POST /api/bets/:id/outcome with `{ verdict: "validated", summary: "..." }` returns 200 with outcomeVerdict set |
| AC-2 | Task outcome verdict (met/met_with_rework/partially_met/not_met) can be recorded | Integration test: PATCH /api/tasks/:id with `{ outcomeVerdict: "met_with_rework" }` returns 200 with outcomeVerdict set |
| AC-3 | Session effectiveness score (0-1) can be recorded | Integration test: PATCH /api/sessions/:id with `{ effectivenessScore: 0.85 }` returns 200 with effectiveness_score set |
| AC-4 | All outcome fields default to null (not evaluated) | Migration test: after migration, existing rows have null outcome columns. Schema test: new rows inserted without outcome values have null fields |
| AC-5 | Outcome data visible on bet detail | E2E or component test: WorkBet page renders outcome section with verdict badge when populated, shows "Not evaluated" when null |
| AC-6 | Outcome data visible on task detail | Component test: WorkTask page renders outcome cell in meta-strip |
| AC-7 | Outcome data visible in portfolio | Component test: WorkPortfolio BetCard shows verdict badge |
| AC-8 | Portfolio filterable by verdict | Component test: selecting "refuted" filter shows only refuted bets |
| AC-9 | Bet outcome PATCH rejected for non-completed/killed bets | Integration test: POST /api/bets/:id/outcome on draft/active bet returns 400 |
| AC-10 | Invalid verdict values rejected at API boundary | Integration test: POST with `{ verdict: "wrong" }` returns 400 (Zod validation) |
| AC-11 | Effectiveness score range enforced | Integration test: PATCH with `{ effectivenessScore: 1.5 }` returns 400 |
| AC-12 | Outcome revision tracked in audit trail | Integration test: set outcome, set different outcome, verify revisionLog has both entries |
| AC-13 | Types export correctly from @hyperidle/shared | `npm run check` passes with zero errors; `BetOutcomeVerdict` and `TaskOutcomeVerdict` importable |

---

## Ordered task list

### Task 1: Shared types (no dependencies)
**Files:** `packages/shared/src/types.ts`, `packages/shared/src/index.ts`
**Action:** Add `BET_OUTCOME_VERDICTS`, `BetOutcomeVerdict`, `TASK_OUTCOME_VERDICTS`, `TaskOutcomeVerdict` consts and types. Export from index.
**Test:** `npm run check` passes. Import test in `packages/shared/src/__tests__/`.

### Task 2: Schema migration (depends on Task 1)
**Files:** `packages/db/src/schema.ts`, `packages/db/drizzle/0026_AC1_outcome_fields.sql`
**Action:**
1. Add columns to `bets`, `tasks`, `sessions` tables in schema.ts
2. Create migration SQL with ALTER TABLE ADD COLUMN statements
3. Update inferred types (Bet, Task, Session already auto-infer from table definition)
**Test:** Migration test: run migration on empty DB + seeded DB, verify columns exist with null defaults. Schema test in `packages/db/src/__tests__/schema.test.ts`: insert row, verify outcome columns readable as null.

### Task 3: Bet outcome API endpoint (depends on Task 2)
**Files:** `packages/server/src/routes/bets.ts`
**Action:**
1. Add `betOutcomeSchema` (Zod)
2. Add `POST /:id/outcome` route handler
3. Validate bet exists, status is completed/killed
4. Write outcome fields + revision log
5. Return updated bet
**Test:** Integration test in `packages/server/src/__tests__/AC1-bet-outcome.test.ts`:
- POST outcome on completed bet -- 200 + fields set
- POST outcome on active bet -- 400
- POST with invalid verdict -- 400
- POST outcome twice -- revision log has both entries
- POST with no summary (optional) -- 200

### Task 4: Task outcome PATCH extension (depends on Task 2)
**Files:** `packages/server/src/routes/tasks.ts`
**Action:**
1. Extend `updateTaskSchema` with `outcomeVerdict` field
2. Handle in PATCH handler: write outcomeVerdict + outcomeRecordedAt + outcomeRecordedBy + audit trail
**Test:** Integration test in `packages/server/src/__tests__/AC1-task-outcome.test.ts`:
- PATCH with outcomeVerdict -- 200 + field set
- PATCH with invalid verdict -- 400
- PATCH with outcomeVerdict updates audit trail

### Task 5: Session effectiveness PATCH extension (depends on Task 2)
**Files:** `packages/server/src/routes/sessions-routes.ts`
**Action:**
1. Add `effectivenessScore` to `updateSessionSchema`
2. Handle in PATCH handler: write effectiveness_score + recorded_at + recorded_by
**Test:** Integration test in `packages/server/src/__tests__/AC1-session-effectiveness.test.ts`:
- PATCH with effectivenessScore 0.85 -- 200 + field set
- PATCH with effectivenessScore 1.5 -- 400 (out of range)
- PATCH with effectivenessScore 0 -- 200 (boundary value)

### Task 6: Bet detail API update (depends on Task 2)
**Files:** `packages/server/src/routes/bets.ts`
**Action:** Add task outcome columns to the `betTasks` select in `GET /:id` handler:
```typescript
outcomeVerdict: tasks.outcomeVerdict,
outcomeRecordedAt: tasks.outcomeRecordedAt,
```
Bet-level outcome columns are auto-included by the `select().from(bets)` pattern.
**Test:** Verify via existing GET /bets/:id test extension: response includes outcomeVerdict (null for unseeded data, populated after POST outcome).

### Task 7: Frontend types update (depends on Task 2)
**Files:**
- `packages/web/src/types/bet.ts` -- add outcome fields to BetDetail
- `packages/web/src/hooks/useBets.ts` -- add outcomeVerdict to BetListItem
- `packages/web/src/hooks/useTaskSessions.ts` -- add effectivenessScore to TaskSession
**Test:** `npm run check` passes.

### Task 8: BetCard verdict prop (depends on Task 7)
**Files:** `packages/design-system/src/BetCard.tsx`, `packages/design-system/src/BetCard.stories.tsx`
**Action:** Add optional `outcomeVerdict?: string` prop. Render neutral badge after status badge when not null.
**Test:** Story showing BetCard with verdict. Visual verification.

### Task 9: WorkBet outcome section (depends on Tasks 3, 7)
**Files:** `packages/web/src/pages/WorkBet.tsx`
**Action:**
1. Add outcome section between stat cards and pitch
2. Implement view/editing states
3. Save handler via `POST /api/bets/:id/outcome`
4. Task rows: add verdict badge before state badge
**Test:** Component test in `packages/web/src/pages/__tests__/WorkBet.outcome.test.tsx`:
- Renders "Not evaluated" when outcomeVerdict is null
- Renders verdict badge when populated
- Shows inline form on "Record outcome" click
- Task row shows verdict badge when set

### Task 10: WorkTask outcome display (depends on Tasks 4, 5, 7)
**Files:** `packages/web/src/pages/WorkTask.tsx`
**Action:**
1. Add Outcome cell to meta-strip
2. Add effectiveness score to session rows
**Test:** Component test in `packages/web/src/pages/__tests__/WorkTask.outcome.test.tsx`:
- Meta-strip shows Outcome cell with "--" when null
- Meta-strip shows verdict label when populated
- Session row shows effectiveness score when set

### Task 11: WorkPortfolio verdict filter (depends on Tasks 7, 8)
**Files:** `packages/web/src/pages/WorkPortfolio.tsx`
**Action:**
1. Add verdict filter pills after team pills
2. Add verdict filter state (Set<string>)
3. Integrate into filteredBets memo
4. Pass outcomeVerdict to BetCard
**Test:** Component test in `packages/web/src/pages/__tests__/WorkPortfolio.outcome.test.tsx`:
- Verdict filter pills render when bets exist
- Clicking "Refuted" shows only refuted bets
- "Not evaluated" filter shows bets with null verdict
- Multiple verdict filters can be active simultaneously

---

## Security and abuse cases

| Concern | Applicable? | Mitigation |
|---|---|---|
| Rate-limit on POST/PATCH | Yes | Existing rate-limit middleware applies to all API routes. No new action needed. |
| Input trust boundary (agent-authored fields) | Yes -- `outcomeSummary` is free text | Zod `.max(2000)` length limit on summary. Standard XSS protection via React rendering (no `dangerouslySetInnerHTML`). No HTML rendering of summary. |
| Secret handling | N/A | No new credentials or secrets. |
| Path traversal | N/A | No path inputs. |
| SSRF | N/A | No outbound URLs. |
| Authorization | Partial | Existing auth middleware applies. AC1 does not add role-based restrictions on who can set outcomes (concept doc: "any user with write access"). Fine for AC1; AC3/AC5 may add restrictions. |
| Verdict enum injection | Yes | Zod `z.enum()` validation at API boundary rejects unknown values with 400. |
| Effectiveness score range | Yes | Zod `z.number().min(0).max(1)` enforces range at API boundary. |

---

## Protected tests

```
protectedTests: []
```

No existing tests are affected. All new tests are additive. No existing test assertions change.

---

## Migrations

No existing symbols are renamed, removed, or moved. All changes are additive:
- New columns on existing tables (nullable, no NOT NULL)
- New API endpoint (POST /bets/:id/outcome)
- New optional fields on existing Zod schemas
- New optional props on existing React components

No call-site migrations needed.

---

## Risks and ambiguities

1. **Task sessions endpoint**: The `useTaskSessions` hook fetches `/api/tasks/:id/sessions` which may not exist as a route. The effectiveness score display on session rows depends on this data being available. If the endpoint 404s, sessions render with "No sessions yet" -- acceptable degradation. The effectiveness score feature is still complete because the PATCH endpoint to set it works, and the data will display once the sessions endpoint is fixed (out of AC1 scope).

2. **Bet outcome on killed bets**: The spec says the founder can record outcomes. Killed bets should also support outcome recording (hypothesis may still be evaluated even on killed work). The API validates `status in ['completed', 'killed']`.

3. **Concurrent outcome edits**: Two users could set the outcome simultaneously. Last-write-wins with revision log. Acceptable for AC1 volume (single founder use case).

---

## Design-it-twice: Bet outcome endpoint

### Option A: Dedicated POST /bets/:id/outcome
- **Shape:** New route handler, separate Zod schema, multi-field atomic write
- **Trade-off:** Another endpoint to maintain; but clean separation from single-field PATCH pattern
- **Why chosen:** The outcome is a multi-field write (verdict + summary) that's semantically different from a single-field PATCH update. The revision log entry for an outcome change should capture both fields together, not as two separate edits.

### Option B: Extend PATCH discriminated union with an "outcome" branch
- **Shape:** Add `field: "outcome"` branch to updateBetSchema with `value: { verdict, summary }`
- **Trade-off:** Reuses existing PATCH pattern; but the value shape breaks the string/object split (existing branches are either string values or WireMoney objects, not nested objects)
- **Why rejected:** Awkward discriminated union. The existing pattern has `field` as the discriminator with `value` typed per field. An outcome is two fields (verdict + summary) which doesn't fit the pattern. Forcing it would require a new shape for `value` that's neither string nor WireMoney.

Decision: **Option A**.
