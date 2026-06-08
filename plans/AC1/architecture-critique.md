# AC1 Architecture Critique -- Structured Outcome Fields

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:9 AC:8 DM:8 N:9 MD:9 FMC:7 S:9 V:8

---

## Dimension Scores

### 1. Spec Alignment (9/10)

Every AC maps to at least one plan task:
- AC-1 (bet verdict) -> Task 3 (POST endpoint) + Task 9 (UI)
- AC-2 (task verdict) -> Task 4 (PATCH extension) + Task 10 (UI)
- AC-3 (session effectiveness) -> Task 5 (PATCH extension) + Task 10 (UI)
- AC-4 (null defaults) -> Task 2 (migration, all nullable)
- AC-5 (visible on bet detail) -> Task 9 (WorkBet)
- AC-6 (visible on task detail) -> Task 10 (WorkTask)
- AC-7 (visible in portfolio) -> Task 11 (WorkPortfolio)
- AC-8 (filterable) -> Task 11 (verdict filter pills)

The plan also adds AC-9 through AC-13 (validation, audit trail, type exports) which are forced dependencies of the above -- not scope creep. No invented requirements.

The plan's design alignment with `approved.md` is strong. The inline edit form, neutral badge style, meta-strip cell, session effectiveness display, and filter pills all match the approved design contracts.

### 2. Layer Integrity (9/10)

Layer boundaries are clean:
- Shared types in `packages/shared` (consumed by both server and web)
- Schema and migration in `packages/db`
- API routes in `packages/server`
- Frontend types, hooks, and pages in `packages/web`
- BetCard prop in `packages/design-system`

No cross-layer violations. The frontend communicates with the server only through API endpoints. The server owns the DB queries. Shared types serve as the contract layer.

### 3. API Contracts (8/10)

**POST /api/bets/:id/outcome** is well-specified:
- Request body: `{ verdict: BetOutcomeVerdict, summary?: string }` with Zod schema
- Response: 200 with updated bet row
- Error cases: 404 (bet not found), 400 (invalid verdict, non-completed/killed status)
- Zod schema with `.max(2000)` on summary

**PATCH /api/tasks/:id** extension:
- Request body: `{ outcomeVerdict: TaskOutcomeVerdict }`
- Integrated into existing PATCH handler
- 404/400 error cases

**PATCH /api/sessions/:id** extension:
- Request body gains `effectivenessScore?: number` with `.min(0).max(1)`
- Integrated into existing updateSessionSchema

**WARNING W-1:** The plan specifies extending `updateSessionSchema` to add `effectivenessScore` as an optional field alongside the existing `state`, `outcome`, `notes` fields. However, the existing `updateSessionSchema` has `state: z.enum(["done", "crashed"])` -- it is NOT optional. The current PATCH handler assumes `body.state` is always present and uses it to derive the SessionOutcome event emission (line 287: `body.state === "crashed" ? "crashed" : "completed"`). If the schema is extended to make all fields optional so `effectivenessScore` can be sent alone (without state), the handler will break on `body.state` being undefined.

The plan must either:
(a) Make the PATCH for effectiveness score require `state` to be present too (awkward -- you'd have to know the session state to set its effectiveness), or
(b) Create a separate PATCH schema variant for effectiveness-only updates that doesn't trigger the session-end event, or
(c) Add a new dedicated endpoint (e.g., `POST /api/sessions/:id/effectiveness`)

This is the plan's most significant gap.

**WARNING W-2:** The plan says "No state restriction" for task outcome PATCH, but the existing `updateTaskSchema` is a flat object (not a discriminated union like bets). Adding `outcomeVerdict` as a new optional field means a caller could send `{ title: "new title", outcomeVerdict: "met" }` in a single request and both would be applied. The plan should specify whether this is intentional (seems fine) or whether outcome writes should be isolated (separate validation branch). The current flat-object approach is simpler and acceptable.

### 4. Data Model Alignment (8/10)

Schema additions are well-specified:
- 4 new columns on `bets` (outcomeVerdict, outcomeSummary, outcomeRecordedAt, outcomeRecordedBy)
- 3 new columns on `tasks` (outcomeVerdict, outcomeRecordedAt, outcomeRecordedBy)
- 3 new columns on `sessions` (effectivenessScore, effectivenessRecordedAt, effectivenessRecordedBy)
- All `text` type, all nullable, no NOT NULL constraints
- No indexes (justified: low-selectivity, client-side filtering)

Migration numbered 0026, matching the next available slot (existing migrations go up to 0025).

**SUGGESTION S-1:** The plan stores `effectivenessScore` as `text` rather than `real`, citing "the existing schema uses `text` for all non-integer values." This is accurate (timestamps are text, not datetime). However, this means the API layer must parse string-to-float on read and float-to-string on write. The plan mentions this ("The API layer parses/validates the 0-1 range") but does not show the parse/format code. The builder should use `parseFloat()` on read and `.toString()` on write, with `Number.isNaN()` guard.

The concept doc's field list (Phase 2, Probe 2) matches the plan's schema additions field-for-field. Cardinality (0:1 inline) is correctly implemented as nullable columns. The existing `sessions.outcome` column is untouched -- the new column is `effectiveness_score`, a different name for a different concept. Collision resolved exactly as the concept doc specified.

### 5. Naming (9/10)

Names are honest and consistent:
- `BetOutcomeVerdict` / `TaskOutcomeVerdict` -- qualified names per concept doc vocabulary collision resolution
- `BET_OUTCOME_VERDICTS` / `TASK_OUTCOME_VERDICTS` -- runtime const tuples per existing patterns (`BET_STATUSES`, `TASK_STATES`)
- `effectivenessScore` -- distinct from `sessions.outcome` (disposition), matches concept doc naming
- `outcomeRecordedAt` / `outcomeRecordedBy` -- parallel naming for all three entities
- `betOutcomeSchema` -- Zod schema naming follows existing patterns (`createBetSchema`, `updateBetSchema`)

No name shadowing. No generic names. No collision with existing closed vocabularies.

The `TASK_VERDICT_LABEL` mapping (met -> "Met", met_with_rework -> "Rework", partially_met -> "Partial", not_met -> "Not met") is defined in the plan and matches the approved design.

### 6. Module Depth (9/10)

The public surface is minimal:
- Two new type exports from `@hyperidle/shared` (BetOutcomeVerdict, TaskOutcomeVerdict + their const tuples)
- One new endpoint (POST /bets/:id/outcome)
- Two extended endpoints (PATCH tasks, PATCH sessions)
- One new optional prop on BetCard
- Three page modifications (no new components)

No wrappers, no helpers, no abstractions. The plan resists the temptation to create an "OutcomeBadge" component -- the badge is inline JSX using existing class patterns. This is correct: a component with one call site does not earn its keep.

### 7. Failure-Mode Coverage (7/10)

**Covered well:**
- Enum injection: Zod `z.enum()` at boundary -> 400
- Score range: Zod `.min(0).max(1)` -> 400
- Bet status gate: 400 for non-completed/killed bets
- Task not found: 404
- Session not found: 404
- Summary length: `.max(2000)`
- XSS: React rendering (no dangerouslySetInnerHTML)
- Rate limiting: existing middleware applies
- Auth: existing auth middleware applies
- Concurrent edits: last-write-wins with revision log (acceptable for AC1)

**WARNING W-3:** The security table says "Existing rate-limit middleware applies to all API routes. No new action needed." This should be verified. The plan should confirm that the existing rate limiter covers POST endpoints specifically, not just general middleware.

**WARNING W-4:** The plan does not specify error handling for the revision log JSON parse. The existing `bets.ts` code (line 182-184) does `JSON.parse(bet.revisionLog)` with a type cast. If `revisionLog` contains malformed JSON, this will throw and crash the handler. The plan should specify that the builder wraps the parse in a try-catch with fallback to empty array, matching the existing pattern in the `bets.ts` code (which already does this correctly, but the plan should be explicit).

**WARNING W-5 (session PATCH conflict, elevated from W-1):** The plan's approach to extending `updateSessionSchema` creates a state-transition hazard. The existing PATCH handler unconditionally reads `body.state` to emit a `session_ended` event. Adding `effectivenessScore` to the same schema without restructuring the handler logic means either (a) effectiveness-only PATCHes trigger a spurious session_ended event, or (b) the handler must branch on "is state present?" The plan does not address this branching logic.

### 8. Simplicity / Over-Engineering Risk (9/10)

The plan is admirably restrained:
- No separate `outcomes` table (inline fields instead -- concept doc decision)
- No outcome state machine (null -> populated, overridable with audit)
- No new components (composition from existing patterns)
- No server-side filtering for portfolio (client-side, matching existing pattern)
- No role-based restrictions on outcome writes (deferred to AC3/AC5)
- No backfill migration (null is the default, always)
- No indexes on outcome columns (justified by volume and filtering pattern)

Design-it-twice for the bet outcome endpoint is genuine, not theatre. Option A (dedicated POST) and Option B (extend PATCH discriminated union) are both viable. The rejection of B is well-reasoned: the multi-field write (verdict + summary) does not fit the single-field PATCH pattern, and forcing it would break the discriminated union's string/object split.

No feature flags, no abstract base classes, no plugin points, no premature generics. One implementation per thing.

### 9. Verifiability (8/10)

AC verification table (AC-1 through AC-13) maps each criterion to a specific test type:
- AC-1/2/3: integration tests with specific request/response assertions
- AC-4: migration test + schema test
- AC-5/6/7: component tests
- AC-8: component test with filter interaction
- AC-9/10/11: integration tests for error paths
- AC-12: integration test for revision log
- AC-13: `npm run check` passes

Test file paths are specified per task (e.g., `packages/server/src/__tests__/AC1-bet-outcome.test.ts`). Test scenarios are enumerated (happy path, error path, boundary value, revision log).

**SUGGESTION S-2:** The `protectedTests` block is empty, which is correct (no existing tests are affected). However, the plan should note that the new tests themselves become protected after implementation -- they define the outcome field contracts. Future workpackages (AC3 evaluator agent, AC5 verification gates) should not modify these test assertions without updating the AC1 contracts.

**SUGGESTION S-3:** The plan specifies "Component test" for UI ACs (AC-5 through AC-8) but does not specify whether these are Vitest component tests with JSDOM or Playwright E2E tests. The existing codebase has component tests in `packages/web/src/pages/__tests__/` using Vitest + Testing Library. The plan's test file paths (`packages/web/src/pages/__tests__/WorkBet.outcome.test.tsx`) follow this pattern, which is correct. This is a minor clarity item.

---

## CRITICAL

(None)

## WARNING

- **W-1** [plan, "PATCH /api/sessions/:id -- extend"] The existing `updateSessionSchema` requires `state: z.enum(["done", "crashed"])` (non-optional). The plan proposes adding `effectivenessScore` as an optional field, but the existing PATCH handler unconditionally reads `body.state` to emit a `session_ended` event (sessions-routes.ts line 287). Sending `{ effectivenessScore: 0.85 }` without `state` will fail Zod validation because `state` is required. The plan must restructure the session PATCH approach: either (a) make `state` optional with conditional event emission, (b) use a discriminated union on the presence of `state` vs `effectivenessScore`, or (c) create a dedicated endpoint for effectiveness score writes.

- **W-2** [plan, "GET /api/bets/:id -- existing (minor update)"] The plan says "The new task outcome columns must be added to that select" for `betTasks`. The existing `betTasks` select (bets.ts lines 441-465) uses explicit column selection -- it names every column individually. The plan correctly identifies this but does not specify which task columns to add. It should list: `outcomeVerdict: tasks.outcomeVerdict` (and optionally `outcomeRecordedAt` for the metadata line). The `outcomeRecordedBy` column is not needed in the list view.

- **W-3** [plan, "Security and abuse cases"] The "Existing rate-limit middleware applies" assertion should be verified against the actual middleware configuration. If the existing rate limiter is a global middleware on the Hono app, it covers the new POST endpoint automatically. If it is selectively applied per-route, the new POST /bets/:id/outcome needs explicit inclusion.

## SUGGESTION

- **S-1** [plan, "DB schema"] `effectivenessScore` stored as `text` requires float-to-string serialization at the API boundary. The builder should add a `@lore` comment explaining this pattern and include the parse/format logic explicitly in the PATCH handler (e.g., `effectivenessScore: body.effectivenessScore.toString()` on write, `parseFloat(row.effectivenessScore)` on read). This prevents a future developer from expecting a numeric type from the column.

- **S-2** [plan, "Task 6"] The plan lists outcomeRecordedAt for the betTasks select but does not mention how it will be displayed in the task row. The approved design shows only the verdict badge on task rows (no metadata line). The plan should clarify that `outcomeRecordedAt` is fetched but not rendered in the task list -- it may be useful for future features but is not required by AC1.

- **S-3** [plan, "Ordered task list"] Task 1 (shared types) and Task 2 (schema migration) are listed as sequential (Task 2 depends on Task 1). In practice, the migration SQL and the schema.ts columns do not import the shared types -- the enum values are plain text in the DB. These two tasks could be parallelized by the builder. This is a minor optimization suggestion.

- **S-4** [plan, "Risks and ambiguities", item 1] The plan correctly identifies that `useTaskSessions` fetches `/api/tasks/:id/sessions` which does not exist as a route. This is a pre-existing bug, not AC1's responsibility. However, the plan should note that if this endpoint is fixed before or during AC1, the effectiveness score will appear automatically (the sessions select returns all columns). No action needed in AC1 scope.

## What's Working Well

- **Design-it-twice is genuine.** The bet outcome endpoint decision (dedicated POST vs extending PATCH discriminated union) is a real trade-off with a well-reasoned selection. The rejection of Option B is not straw-manned -- it identifies the specific technical problem (multi-field write not fitting the single-field PATCH pattern) and names the consequence (breaking the string/object split in the discriminated union value type).

- **Plan reconciliation table is thorough.** The spec-vs-reality table (13 rows) systematically audits every assumption against the actual codebase. The task sessions endpoint investigation is honest about uncertainty ("may not exist as a route") rather than assuming it works.

---

## Verdict

Score 8/10 -- the plan advances. The single substantive issue is **W-1** (session PATCH schema conflict). The builder must address the `state` field non-optionality before implementing Task 5. The recommended fix is to make `state` optional in `updateSessionSchema` and add a conditional branch in the handler: emit `session_ended` event only when `state` is present. This is a 10-line change in the handler that preserves backward compatibility (existing callers always send `state`; new callers can send `effectivenessScore` alone).

W-2 and W-3 are execution details the builder can resolve during implementation. The suggestions are polish items.
