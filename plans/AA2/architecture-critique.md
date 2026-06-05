# Architecture Critique: AA2 — Routine Management & Session Adaptation

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:9 AC:8 DM:8 N:9 MD:8 FMC:7 S:8 V:8

---

## Dimension Scores

### 1. Spec Alignment (9/10)

Every acceptance criterion maps to at least one task and verification method:

- **AC-1 (Create routine):** Task 5 (API), Task 9 (Frontend), integration + component tests. Complete.
- **AC-2 (Pause, resume, delete):** Task 5 (PATCH state, DELETE route), Task 10 (Frontend delete + confirmation), Task 8 (teams filter). Complete.
- **AC-3 (Routine sessions reuse provisioning):** Task 3 (context + prompt), Task 6 (provisionSession extension). Complete.
- **AC-4 (Clean session starts with last run summary):** Task 3 (buildRoutineSessionContextData reads last_run_summary), Task 6 (session completion hook writes last_run_summary). Complete.
- **AC-5 (Coalescing):** Task 4 (shouldCoalesce helper), Task 5 (trigger endpoint), Task 7 (scheduler). Complete.
- **AC-6 (Session outcomes recorded):** Task 6 (session completion hook), Task 7 (routine_runs outcome tracking). Complete.

No scope creep detected. Task 11 (seed data) is a legitimate dependency -- existing seed/test fixtures must be updated for new columns. Task 8 (teams-routes filter) is a direct consequence of soft-delete (AC-2).

The plan correctly reconciles 14 spec-vs-reality gaps (Section "Plan reconciliation") with resolutions for each.

### 2. Layer Integrity (9/10)

Layer boundaries are clean:

- **packages/db:** Schema only (Task 1). No business logic.
- **packages/shared:** Types and constants only (Task 2). No imports from server or fabric.
- **packages/fabric:** Context assembly + coalescing helper + scheduler adaptation (Tasks 3, 4, 7). Fabric reads DB but does not import from server.
- **packages/server:** Route handlers + provisioning extension + lifecycle hooks (Tasks 5, 6, 8). Server imports from fabric, not the reverse.
- **packages/web:** Frontend components (Tasks 9, 10). Communicates via API only.

One item to verify: the plan places `shouldCoalesce` in `packages/fabric/src/services/routine-scheduler.ts` and has it called from `packages/server/src/routes/routines-routes.ts`. This is correct -- fabric exports the function, server consumes it. The layer direction (server -> fabric) is downward.

The plan also calls for `buildRoutineSessionContextData` in `packages/fabric/src/session-context.ts`, consumed by `packages/server/src/services/session-provisioning.ts`. Same correct downward dependency.

### 3. API Contracts (8/10)

**POST /api/routines** is well-specified: Zod schema with field types, min/max lengths, optional/required markers. Response shape (201 with routine row JSON) and error shapes (400/404 with specific conditions) are documented.

**DELETE /api/routines/:id** has explicit code showing the response shape `{ deleted: true, deletedAt: string }`.

**PATCH extension** for costCapPerRunMinor is documented with Zod type.

**POST /trigger coalescing** response is documented: `{ routineId, fired: false, reason: "coalesced" }` with 200 status.

**WARNING:** The POST /api/routines response says "Return the created routine row with 201" but does not specify whether this is the raw DB row or a RoutineInfo wire type. The GET /:id endpoint returns a RoutineDetail (which wraps RoutineInfo + runs). The POST should return a consistent shape. The builder will need to decide: return the raw row (simpler, inconsistent with GET) or return RoutineInfo (consistent, requires agent name resolution). The plan should specify this.

**GET /api/routines** currently returns raw `allRoutines` rows (line 58-59 of routines-routes.ts). The plan's Task 5 adds soft-delete filtering but does not specify whether the response shape should be updated to include the new fields (costCapPerRunMinor, lastRunSummary, createdAt). This is implicit but should be explicit.

### 4. Data Model Alignment (8/10)

The migration (Section 1) is thorough:

- 5 new columns on `routines`: deletedAt, lastRunSummary, costCapPerRunMinor, createdAt, stubTaskId -- all with correct types, nullability, and FK constraints.
- 2 new columns on `routine_runs`: sessionId, summary -- correct FK reference to sessions.id.
- 2 indexes: routines_deleted_at_idx, routine_runs_session_id_idx.
- Backfill for createdAt with epoch timestamp.
- Stub task backfill delegated to application seed (correct -- requires team/bet context).

Drizzle schema changes (Section 2) match the SQL migration 1:1.

**WARNING:** The migration creates `routines.stub_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL`. However, the `tasks` table requires `betId NOT NULL` (line 155 of schema.ts: `.notNull().references(() => bets.id)`). Creating a stub task requires a bet. The plan's Task 5 step 6 says "Create stub task: insert a task row with title 'Routine: {name}', state 'accepted', teamId, ownerAgentId" but does not specify which betId to use. The concept doc says "synthetic stub task exists solely to satisfy the NOT NULL FK." This needs a resolution: either (a) create a synthetic "routine operations" bet per team, or (b) use an existing bet. The plan is silent on this.

The `RoutineRunOutcome` extension from 3 to 5 values ("running", "timeout" added) is correctly specified with the full union type.

### 5. Naming (9/10)

Names are descriptive and honest:

- `shouldCoalesce` -- boolean return, clear intent. Not `checkCoalescing` or `handleOverlap`.
- `buildRoutineSessionContextData` -- parallel to `buildSessionContextData`, clearly scoped to routine sessions.
- `composeRoutinePrompt` -- parallel to `composePrompt`.
- `buildRoutineTaskSection` -- accurately describes what it builds (the "## Routine" section that replaces "## Task").
- `lastRunSummary` -- exact match with concept doc vocabulary.
- `stubTaskId` -- matches concept vocabulary for "Stub Task."
- `costCapPerRunMinor` -- follows existing `costActualMinor` / `costCapMinor` naming convention.
- `deletedAt` -- standard soft-delete naming.

No naming conflicts with existing primitives. No generic names.

### 6. Module Depth (8/10)

The plan achieves good depth-to-surface ratio:

- **shouldCoalesce:** One function, one query, one boolean return. Used by two callers (scheduler + trigger endpoint). Correct extraction -- shared behavior, not premature abstraction.
- **buildRoutineSessionContextData:** One function parallel to existing `buildSessionContextData`. Same interface shape, different data source. Deep enough (3 DB queries, structured return) without being over-general.
- **provisionSession extension:** Single `if (params.routineId)` branch swapping one function call. Minimal surface area increase on an already-complex function.

**Minor concern:** `composeRoutinePrompt` is described as "follows the same structure as `composePrompt` but substitutes the task section for the routine section." This sounds like code duplication. Could a single `composePrompt` accept either `SessionContextData | RoutineSessionContextData` with a discriminator? The plan's Decision 1 (Option A) argues for branching inside provisionSession but doesn't address whether the two compose functions share code. If `composeRoutinePrompt` duplicates 80% of `composePrompt` (persona section, tools section, workspace section, token budget enforcement), that's a shallow-module smell. The plan should note whether the routine version calls shared helpers or is a copy-paste.

### 7. Failure-Mode Coverage (7/10)

**Present:**
- Cron validation via `parseCron` with specific error handling (400 on invalid cron).
- Soft-delete guard on PATCH (returns 404 for deleted routines).
- Zod validation on all input boundaries (name max 200, description max 2000, costCapPerRunMinor >= 0).
- Security & abuse cases block (Section 10) addresses 8 vectors with applicable/N/A classifications.
- Coalescing crash safety documented ("no in-memory locks, no distributed locks").
- Protected tests list (Section 11) with risk assessment for each.

**Gaps:**

1. **[Section 5.5] Session completion hook failure.** What happens if the `endSession` hook fails to update `routine_runs` or `routines.last_run_summary`? The plan says this runs inside `endSession`/`crashSession` but does not specify error handling. If the routine_runs UPDATE fails, the session still ends -- but the run history has a stale "running" outcome. Is this acceptable? Should there be a retry or an error-state fallback?

2. **[Section 5.4] Race condition in shouldCoalesce.** The plan correctly identifies crash safety ("DB-level check only, no in-memory locks") but does not address the TOCTOU window: between `shouldCoalesce` returning false and the new session INSERT, another scheduler tick could also pass the check and fire. In practice this is unlikely (poll interval >> query time) and the worst case is a double-fire (not a data corruption), but the plan should acknowledge it. The concept doc says "session creation is a single INSERT" as the safety argument, but two INSERTs can both succeed.

3. **[Section 4.1] POST /api/routines -- no rate limiting rationale is weak.** The plan says "A user creating routines at high frequency is not a realistic attack vector in a single-tenant desktop app. No additional rate limiting needed." This is acceptable for the current deployment model but should note that shared-mode (VPS/cloud) deployments would need rate limiting. The security section should say "desktop-only: no rate limiting; revisit for shared mode."

4. **[Section 4.5] Coalesced trigger returns 200 -- semantic correctness.** The plan returns 200 for a coalesced manual trigger. A 409 Conflict was rejected (correct -- it's not a conflict, it's a skip). But 200 with `fired: false` means the caller must inspect the body to know the trigger didn't fire. Should this be 202 Accepted or is 200 with explicit body semantically correct? Either works, but the choice should be deliberate.

### 8. Simplicity / Over-Engineering Risk (8/10)

The plan is appropriately restrained:

- Three design-it-twice decisions, each with genuine trade-offs (not straw-manned alternatives).
- Decision 1 (branch inside provisionSession): Option B (caller-provided context) is a real alternative with a genuine downside (breaks encapsulation). Decision is well-reasoned.
- Decision 2 (coalescing in scheduler): Option B (middleware) is genuinely different. Decision to extract a shared helper is pragmatic.
- Decision 3 (stub task at creation vs session time): Option B (find-or-create at session time) is the current fragile behavior. Decision to replace it is correct.

No premature abstractions. No feature flags. No "future-proof" patterns. The `SCHEDULE_PRESETS` constant in shared is appropriate -- it's used by both frontend and (potentially) validation.

The `active` boolean deprecation handling is practical: AA2 continues the sync pattern rather than attempting a risky removal mid-workpackage.

### 9. Verifiability (8/10)

Every AC has concrete verification methods:

- AC-1: 4 integration tests + 4 component test assertions, all with specific test file paths.
- AC-2: 7 integration tests + 3 component test assertions.
- AC-3: 2 unit tests + 1 integration test with specific assertion patterns.
- AC-4: 2 unit tests + 1 integration test + 1 schema test.
- AC-5: 1 unit test + 2 integration tests with specific assertions.
- AC-6: 3 integration tests + 1 type test.

Protected tests (Section 11) are populated with 7 test files and risk assessments explaining why existing assertions are preserved.

Test ordering follows red-green: Tasks 1-2 (schema + types) -> Task 3 tests (context) -> Task 4 tests (coalescing) -> Task 5 tests (API) -> Tasks 6-7 tests (provisioning + scheduler) -> Tasks 9-10 tests (frontend).

**Minor gap:** AC-4 includes a "Schema test: `routines.last_run_summary` column exists and is writable." This is a static property, not a runtime behavior. Per CLAUDE.md rules: "If an AC describes a static property, enforce it with the type system or a lint rule, not a test." The column's existence is already enforced by Drizzle schema + migration. This test is unnecessary but harmless.

---

## Findings

### CRITICAL

1. **[Plan Section 4.1, step 6] Stub task requires a betId, but the plan does not specify which bet to use.** The `tasks` table has `betId TEXT NOT NULL REFERENCES bets(id)`. Creating a stub task requires a valid betId. The plan says "insert a task row with title 'Routine: {name}', state 'accepted', teamId, ownerAgentId" but omits betId. Options: (a) create a synthetic "Routine Operations" bet per team at routine creation time, (b) require the caller to pass a betId, (c) find an existing bet for the team. The plan must specify the resolution because it affects the API contract (does POST /api/routines need a betId field?), the schema (does routines need a betId?), and the stub task lifecycle.

### WARNING

1. **[Plan Section 5.2] composeRoutinePrompt duplication risk.** The plan describes `composeRoutinePrompt` as "follows the same structure as `composePrompt`" but does not specify whether shared logic (persona section, tools section, workspace section, token budget enforcement) is extracted into reusable helpers or duplicated. If duplicated, changes to the prompt template in one path silently diverge from the other. Recommendation: extract `buildPersonaSection`, `buildToolsSection`, and `buildWorkspaceSection` as shared helpers, then compose them differently in the two top-level functions.

2. **[Plan Section 5.5] No error handling for session completion hook.** The post-session hook updating routine_runs and routines.last_run_summary runs inside endSession/crashSession. If the routine-specific updates fail, what happens? The session-lifecycle functions currently have no try/catch around their internal steps (they let errors propagate). If the routine_runs UPDATE throws, `endSession` fails, and the session row remains in "active" state. The plan should specify whether the routine hook should be wrapped in a try/catch to isolate its failure from the session lifecycle.

3. **[Plan Section 4.1] POST /api/routines response shape unspecified.** The plan says "Return the created routine row with 201" but does not specify whether this is the raw DB row or a RoutineInfo wire type. GET /:id returns RoutineDetail (RoutineInfo + runs). The POST response should be specified as either the raw row (simpler, for immediate dialog close) or RoutineInfo (consistent with GET).

### SUGGESTION

1. **[Plan Section 13, item 3] Last run summary write timing is an ambiguity that needs a decision.** The plan identifies this correctly as a risk but does not resolve it. The plan's alternative ("read session notes from the workspace at session end and write to routines.last_run_summary in the endSession hook") is the simpler approach. Recommend the plan commit to this approach rather than leaving it ambiguous for the builder.

2. **[Pre-existing] routine-scheduler.ts `createRoutineSession` inserts `cost: 0`.** Line 234 of `packages/fabric/src/services/routine-scheduler.ts` inserts a `cost` column that was stripped from the sessions table in O2. This is a pre-existing bug that will surface when Task 7 modifies this function. The builder should fix it during Task 7 (remove the `cost: 0` field from the INSERT), but the plan should note it in the reconciliation table.

3. **[Plan Section 9] Task dependency graph shows Task 2 parallel to Task 1, but the critical path lists Task 1 -> Task 2.** Task 2 (shared types) has "Dependencies: None" and can run parallel with Task 1. The critical path should be Task 1 -> Task 3 -> Task 6 -> Task 7 (schema -> context -> provisioning -> scheduler). Task 2 is on a parallel track. The dependency graph text says "can run parallel" but the critical path lists Task 2 as serial. Minor inconsistency.

4. **[Plan Section 5.4] TOCTOU window in coalescing.** Between `shouldCoalesce` returning false and the session INSERT completing, another scheduler tick could also pass the check. The concept doc says "no double-fire risk because session creation is a single INSERT" but two INSERTs can both succeed. This is low-risk (poll interval >> query time, and worst case is a harmless duplicate session) but should be acknowledged.

### What's Working Well

1. **Design-it-twice decisions are genuine.** All three decisions present real alternatives with substantive trade-offs. Decision 3 (stub task at creation vs session time) correctly identifies the fragility of the current approach (finding an arbitrary task) and replaces it with a clean, deterministic solution. The rejections cite specific architectural reasons, not hand-waving.

2. **Plan reconciliation table is thorough.** 14 spec-vs-reality gaps identified and resolved before any code is written. This table prevents the builder from discovering mismatches during implementation. The format (assumption / reality / resolution) is clear and actionable.

---

## Verdict

Score 8/10 -- advances to implementation. One CRITICAL finding (stub task betId) must be resolved in the plan before Task 5 can proceed. The builder should address it by specifying the bet resolution strategy (most likely: create a synthetic "Routine Operations" bet per team, or make tasks.betId nullable for stub tasks -- but the latter is a schema change with broad impact). The three warnings are addressable during implementation without plan changes.
