# AA2 Concept — Routine Management & Session Adaptation

## Required reading for downstream agents

Downstream agents (`/architecture`, `/pipeline`) must read these files:

- `docs/process-layer/recurring-routines.md` -- canonical routine concept
- `docs/process-layer/tasks-and-sessions.md` -- session lifecycle, context assembly
- `docs/process-layer/canonical-shapes.md` -- Money shape for cost cap per run
- `plans/AA1/architecture.md` -- AA1 schema, API, and design decisions that AA2 extends
- `packages/db/src/schema.ts` lines 200-310 -- routines + routineRuns + sessions.routineId
- `packages/shared/src/routine.ts` -- RoutineState, RoutineRunOutcome, wire types
- `packages/server/src/routes/routines-routes.ts` -- existing CRUD + trigger routes
- `packages/server/src/services/session-provisioning.ts` -- 11-phase provisioning orchestrator
- `packages/fabric/src/session-context.ts` -- buildSessionContextData (task-oriented)
- `packages/fabric/src/prompt-composition.ts` -- composePrompt (task-oriented context template)
- `packages/fabric/src/services/routine-scheduler.ts` -- scheduler, cron parsing, checkAndFireRoutine
- `packages/web/src/pages/WorkRoutine.tsx` -- existing detail page (AA1)
- `packages/web/src/pages/work/BetCreateDialog.tsx` -- CRUD dialog pattern reference
- `packages/design-system/DESIGN.md` -- component inventory and Hearth tokens
- `packages/design-system/AESTHETICS.md` -- AQ rules

---

## Noun classification

| Noun | Classification | Rationale |
|---|---|---|
| **Routine** | Stable | Defined in `docs/process-layer/recurring-routines.md`, schema locked in AA1. AA2 adds columns (deleted_at, last_run_summary, cost_cap_per_run_minor) but does not change what a routine IS. |
| **Routine Session** | Reshaped | Sessions exist (`tasks-and-sessions.md` S6.2) but only with task+bet context assembly. AA2 introduces a second context template for routine-sourced sessions. The provisioning path is shared; the context assembly diverges. |
| **Routine Run** | Stable | `routine_runs` table from AA1. AA2 adds `running` outcome and links runs to sessions, but the concept is unchanged. |
| **Last Run Summary** | New | A single-slot text artifact on the routine row, not yet in schema or docs. The continuity bridge between routine sessions. |
| **Coalescing** | New (mechanism) | Not a domain primitive but a named behavior with a contract. Skips a scheduled beat when the prior session is active. |
| **Cost Cap per Run** | Stable extension | Same Money shape from `canonical-shapes.md`. New column on routines, same concept as existing cost caps. |

Only **Routine Session** (reshaped) and **Last Run Summary** (new) require concept work. **Coalescing** needs a behavioral contract but not a full concept probe.

---

## Routine Session (reshaped)

### Definition

A Routine Session is a Session (same `sessions` table row, same 11-phase lifecycle) whose context is assembled from a Routine rather than from a Task+Bet hierarchy. It is distinguished by `sessions.routineId IS NOT NULL`.

### Essential properties

- **routineId FK is NOT NULL.** This is the discriminator. Task sessions have routineId = NULL.
- **Context comes from the routine.** The prompt includes: routine name + description (purpose), last run summary (continuity), agent identity (soul prompt), team knowledge (materialization). It does NOT include task title, task description, bet description, bet appetite, or bet done condition.
- **Starts clean.** No leftover context from previous runs. No "session notes from prior sessions" carryover. The ONLY continuity inputs are: (1) last_run_summary column on the routine, (2) knowledge items materialized from the fabric.
- **Same provisioning orchestrator.** The 11-phase lifecycle in `session-provisioning.ts` runs unchanged. The adaptation point is Phase 6 (materialization) and Phase 8.5 (prompt composition), where a routine-specific context builder is called instead of `buildSessionContextData`.
- **Bounded.** Starts, runs, ends. Same session state machine (active -> completed/crashed). Not a daemon.

### What it is NOT

1. **Not a new session type or table.** There is no `routine_sessions` table, no `session_type` enum column. The discriminator is the existing nullable `routineId` FK. Adding a type column would fork every session query in the codebase. Rejected.

2. **Not a continuation of the previous routine session.** The spec is explicit: "Each routine session starts clean -- no leftover context from previous runs." Carrying over context window state, agent memory snapshots, or tool state from the last run is rejected. The only bridge is `last_run_summary` and knowledge items.

3. **Not exempt from cost tracking.** Routine sessions record cost via the same `cost_update` event path and `recordCostAndCheck` flow as task sessions. AA2 AC-6 requires outcomes (including cost) to be recorded. AA3 will add per-routine cost caps.

4. **Not a task session with extra metadata.** The context assembly is fundamentally different, not additive. A task session's context includes task+bet context; a routine session's context replaces that with routine purpose + last run summary. They are two context templates, not one template with optional fields.

### Composition

- **Attaches to:** one Routine (via routineId FK)
- **Carries:** a `taskId` FK pointing to a synthetic stub task (required by current schema constraints). This stub task exists solely to satisfy the NOT NULL FK; the routine session does not read task context from it.
- **Produces:** a Routine Run row (outcome recorded), and writes back `last_run_summary` to the routine on completion
- **Referenced by:** routine detail page run history, agent session history

### Lifecycle

Same as any session: `active` -> `completed` | `crashed`. No new states.

On completion, the routine session writes:
1. A `routine_runs` row with outcome, cost, duration
2. Updates `routines.last_run_summary` with agent-produced summary
3. Updates `routines.last_run_at` timestamp

### Authority

- **Created by:** The routine scheduler (`checkAndFireRoutine`) or manual trigger endpoint
- **Owned by:** The routine's ownerAgentId (or delegate if delegation_allowed)
- **Context assembled by:** A new `buildRoutineSessionContextData` function in `packages/fabric/src/session-context.ts`

### Contracts

- **Cardinality:** A routine session has exactly one routineId (NOT NULL). A routine has many sessions over time.
- **Provisioning path:** Same `provisionSession` function. The caller passes a `routineId` parameter. Internally, `provisionSession` detects `routineId` and calls `buildRoutineSessionContextData` instead of `buildSessionContextData`.
- **Mutability:** Once created with a routineId, the FK is immutable.
- **Context template closure:** The context assembly for routine sessions is a separate code path (`buildRoutineSessionContextData`), not a parameterization of the task context builder. This keeps the two paths independent and prevents accidental coupling.
- **Stub task:** A routine session's `taskId` points to a synthetic stub task. The provisioning orchestrator MUST NOT read task/bet context from this stub. The stub exists only for FK satisfaction.

---

## Last Run Summary (new)

### Definition

A single-slot text artifact stored as a column on the `routines` table, written by each completed routine session, and read by the next session's context assembly. It is the routine-session equivalent of task notes, scoped to a single routine.

### Essential properties

- **Plain text (markdown).** Written by the agent during session teardown.
- **Stored on the routine row.** Column: `last_run_summary TEXT` on the `routines` table. Not a separate entity, not in `routine_runs`, not in knowledge items.
- **Single-slot overwrite.** Each successful run overwrites the previous summary. Only the most recent summary persists. This is intentional: the summary is a latest-state bridge, not a history log.
- **Read-only input to the next run.** The context assembly reads it and includes it in the prompt. The agent reads it as "here's what happened last time."
- **Optional.** A routine that has never run, or whose last run crashed, has `last_run_summary = NULL`. The context assembly handles this gracefully (omits the section from the prompt).

### What it is NOT

1. **Not a history of all summaries.** That is what `routine_runs` is for. Storing every summary would create unbounded growth on a column read at every session start. Rejected.

2. **Not session notes.** Task sessions write notes to the task object (continuous, multi-session accumulation). Last run summary is routine-scoped, single-slot, overwritten each run. Different storage, different lifecycle, different purpose.

3. **Not a knowledge item.** Knowledge items are durable, versioned, multi-consumer, stored in `knowledge_items`. The last run summary is transient (overwritten), single-consumer (the next routine session), and routine-scoped. Wrong abstraction layer.

### Composition

- **Part of:** the Routine row
- **Written by:** the routine session's agent (via a tool call or session teardown hook)
- **Read by:** `buildRoutineSessionContextData` during the next routine session's context assembly

### Lifecycle

1. Routine created -> `last_run_summary = NULL`
2. First successful run completes -> agent writes summary -> `last_run_summary = "processed 5 items, no issues"`
3. Second run starts -> context includes "Last run: processed 5 items, no issues"
4. Second run completes -> overwrites with new summary
5. If a run crashes -> `last_run_summary` is NOT cleared (the last *successful* summary persists)

### Authority

- **Written by:** The agent running the routine session, during session teardown
- **Stored on:** The routine row (single source of truth)
- **Read by:** The fabric's context assembly function

### Contracts

- **Cardinality:** One summary per routine (1:1 column, not 1:N).
- **Mutability:** Overwritten on each successful routine session end. NOT cleared on failure (last successful summary persists).
- **Identity:** Not independently addressable. Part of the routine row.
- **Hard rule:** The summary is written by the agent, not by the provisioning orchestrator. The orchestrator reads it at context assembly time but never writes it.

---

## Coalescing (mechanism contract)

### Definition

Coalescing is the behavior where a scheduled routine beat is skipped (not queued, not deferred) when the previous run's session is still active. A coalesced beat is recorded as a `routine_runs` row with outcome = `skipped`.

### Contract

- **Check mechanism:** Before firing a routine, the scheduler queries `sessions WHERE routineId = :routineId AND state = 'active'`. If count > 0, skip.
- **Recording:** A `routine_runs` row is inserted with `outcome = 'skipped'`. This makes coalesced beats visible in run history.
- **Crash safety:** DB-level check only. No in-memory locks, no distributed locks. If the scheduler process crashes between check and fire, the worst case is a missed beat (next scheduled beat fires normally). No double-fire risk because session creation is a single INSERT.
- **No queueing:** Coalesced beats are gone. If the work mattered, the next scheduled beat will handle it. This is the right semantics for recurring work (the next beat is coming anyway).
- **No retry:** A coalesced beat does not retry. The `skipped` outcome is final.

### What it is NOT

1. **Not debouncing.** Debouncing delays execution; coalescing skips it entirely.
2. **Not a mutex.** A mutex implies waiting for the lock to release. Coalescing is immediate: check, skip if busy, log, done.
3. **Not a queue.** The skipped beat is not stored for later execution. It is discarded with a record.

---

## Vocabulary table

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **Routine Session** | A session with routineId IS NOT NULL; context from routine, not task+bet | routine run session, cron session, scheduled session, background session |
| **Task Session** | A session with routineId IS NULL; context from task+bet+agent+team | normal session, regular session, standard session |
| **Last Run Summary** | Single-slot text on the routine row; written by each completed routine session, read by the next | run notes, routine memory, session carryover, execution summary, run log |
| **Coalescing** | Skipping a scheduled beat when the prior session is active | debouncing, deduplication, overlap prevention, beat suppression |
| **Stub Task** | Synthetic task row created to satisfy sessions.taskId FK for routine sessions | placeholder task, dummy task, virtual task |

---

## Self-critique

1. **Is the rejection list substantive?** Yes. Each rejection cites a specific reason grounded in the spec or architecture constraint. "Not a queue" for coalescing is backed by "the next beat is coming anyway." "Not session notes" for last run summary is backed by "different storage, different lifecycle."

2. **Does "Routine Session" collide with existing terms?** Checked: `tasks-and-sessions.md` uses "session" throughout but never qualifies it. The codebase uses `sessions` table without type distinction. Adding `routineId IS NOT NULL` as the discriminator is the minimal vocabulary addition. No collision with existing docs.

3. **Are the contracts complete?** Cardinality, closure, mutability, and identity are specified for both Routine Session and Last Run Summary. The coalescing contract specifies mechanism, crash safety, and no-queue semantics. The one gap: the stub task contract says "the provisioning orchestrator MUST NOT read task/bet context from this stub" -- this is a hard rule that architecture must enforce via code path branching, not just documentation.

4. **Is the rationale concrete?** The spec explicitly says "reuse the existing session provisioning infrastructure" (routine session), "continuity between runs comes from the last run summary" (last run summary), and "coalesced (skipped with a log entry)" (coalescing). All rationale traces back to spec text.

5. **Should `docs/process-layer/tasks-and-sessions.md` be updated?** Yes -- it should mention that sessions can be routine-sourced (routineId IS NOT NULL) with different context assembly. However, this is a doc update that should happen AFTER AA2 ships, not during concept locking. The concept doc here is the fixed input for architecture; the ground-truth doc update is a post-ship task.

---

## Concept status: LOCKED

The three concepts (Routine Session, Last Run Summary, Coalescing) are locked. Downstream skills (`/design`, `/architecture`) explore within these concepts. They do not reshape them.
