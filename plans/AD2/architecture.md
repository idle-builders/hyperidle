# AD2 — Task-to-Session Dispatcher: Architecture Plan

## Required Reading

- `packages/server/src/services/session-provisioning.ts` — the 11-phase orchestrator this dispatcher calls
- `packages/server/src/services/task-state-machine.ts` — valid transitions, event emission
- `packages/server/src/services/dependency-watcher.ts` — existing event-driven pattern for task unblocking
- `packages/server/src/services/session-lifecycle.ts` — session create/end/crash lifecycle
- `packages/server/src/harness/adapter-pool.ts` — adapter selection and concurrency
- `packages/fabric/src/services/routine-scheduler.ts` — existing scheduling pattern (polling + event)
- `packages/fabric/src/bootstrap.ts` — strategy-layer wiring pattern
- `packages/shared/src/events.ts` — domain event types
- `docs/process-layer/tasks-and-sessions.md` — task lifecycle semantics
- `docs/process-layer/wip-and-cost-limits.md` — cost cap hierarchy

---

## Phase 0 — Interrogation (Resolved)

### Q1: Event-driven vs polling — which is primary?

**Answer: Event-driven with a startup sweep.**

Evidence: The trigger for dispatch is a state change — task transitions to `accepted` with `ownerAgentId` set, or handoff assigns a new agent. Both emit `task_state_changed`. Polling would add latency and DB load for no benefit when the signal is already an event. A one-time sweep at startup catches tasks that became dispatchable while the server was down (idempotency).

The routine-scheduler uses polling because cron/heartbeat triggers are time-based. Task dispatch is event-based — different mechanism, same strategy-layer home.

### Q2: Queue data structure — in-memory or BullMQ?

**Answer: In-memory FIFO queue (array).**

Evidence: The spec says "FIFO is fine for v1", "No priority", and the system is single-process (laptop profile). BullMQ adds Redis as a dependency — violates "boring technology" when the expected queue depth is < 50 tasks. The queue is not durable across restarts, but the startup sweep re-populates it from DB state, so durability is provided by the source-of-truth (tasks table), not the queue.

Trade-off: BullMQ gives distributed scheduling for VPS/cloud. But the queue is just a dispatch buffer — the real state lives in the DB. For v1, in-memory is correct. Migration path: replace the in-memory array with a BullMQ-backed queue behind the same interface if distributed mode is needed later.

### Q3: What constitutes a "dispatchable" task?

**Answer:** A task is dispatchable when ALL of:
1. `state === "accepted"` (ready for work, not proposed/hold/in_progress/etc.)
2. `ownerAgentId IS NOT NULL` (an agent is assigned)
3. No active session exists for this task (idempotency guard)

The dispatcher does NOT transition tasks from `proposed` to `accepted`. That is the team lead's / decomposition agent's responsibility. The dispatcher only acts on tasks that are already `accepted`.

### Q4: Where does the dispatcher live — server or fabric?

**Answer: `@hyperidle/fabric` (strategy layer).**

Evidence: The dispatcher is a strategy-layer automation — it reacts to events and triggers provisioning. It follows the same pattern as `lifecycle-propagation`, `session-review-creator`, `builtin-routines`, and `notification-dispatcher` — all registered via `bootstrapFabric()`. The dispatcher needs `ProvisionSessionDeps` (adapterPool, workspace, etc.) which are created in `server-factory.ts` and passed through `bootstrapFabric`'s context.

This means `bootstrapFabric` needs to accept optional provisioning deps. When absent (kernel-only tests), the dispatcher is not registered.

### Q5: Non-code workspace — what changes?

**Answer: Nothing changes at the workspace level.** `LocalWorkspaceAdapter.spawn()` creates an empty directory. It does not assume git. The "non-code workspace" concern is about what gets *materialized* into it (no repo path, no git tools), which is already handled by the materialize step (it reads from `knowledge_items` based on agent role, not from a git repo). The harness selection via `users.harnessType` already routes to the appropriate adapter (builtin for non-code, claude-code for code). No new workspace type needed.

---

## Plan Reconciliation (Spec vs Reality)

| Spec assumption | Reality | Resolution |
|---|---|---|
| `provisionSession()` takes standard deps | Confirmed: `ProvisionSessionDeps` = {db, eventBus, adapterPool, workspace, mcpBridgeRegistry, mcpBaseUrl} | Use as-is |
| Task has `ownerAgentId` | Confirmed: `tasks.ownerAgentId` nullable FK to users.id | Filter on NOT NULL |
| `task_state_changed` event emits on transition | Confirmed: `transitionTask()` emits it with fromState/toState | Subscribe to it |
| `ConcurrencyLimitError` thrown by provisionSession | Confirmed: thrown in Phase 3 when active sessions >= maxConcurrentSessions | Catch and re-queue |
| `CostCapExceededError` thrown by provisionSession | Confirmed: thrown in Phase 2 via `checkCostCap()` | Catch and re-queue |
| No existing dispatcher queue table | Confirmed: grep found nothing | Queue is in-memory; DB state is the source of truth |
| `bootstrapFabric` registers strategy handlers | Confirmed: returns disposers array | Add dispatcher registration to bootstrap |
| `sessions-routes.ts` resolves model tier with `resolveModelTier()` | Confirmed: uses CredentialResolver | Dispatcher needs same credential resolution |
| Handoff assigns new ownerAgentId | Confirmed: `handoff()` does `UPDATE tasks SET ownerAgentId = params.toAgent` but does NOT emit a separate event for ownership change — it emits `task_state_changed` only for toHuman (blocked) path | **Gap:** For toAgent handoff, no event fires that indicates a new agent took ownership. The task stays in_progress. Solution: dispatch on `session_ended` when the task has a new ownerAgentId different from the session's agentId. |

### Critical Gap: Handoff-to-Agent Dispatch Trigger

When agent A hands off to agent B (`toAgent`), the handoff protocol:
1. Ends agent A's session (state="done")
2. Sets `tasks.ownerAgentId = agentB`
3. Does NOT change task state (stays `in_progress`)
4. Does NOT emit `task_state_changed` (only for toHuman path)

But the spec says "When an agent creates a subtask via handoff with `ownerAgentId`, the receiving agent's session is automatically provisioned."

**Resolution:** The dispatcher subscribes to `session_ended` as a secondary trigger. On session_ended, it checks: does the task still need work (state=in_progress) AND does ownerAgentId differ from the session's agentId? If yes, the ownership was transferred — dispatch a new session for the new owner.

Additionally, when a task is newly created via the `create_task` skill tool (state=proposed, ownerAgentId set), it cannot be dispatched until a team lead accepts it (proposed -> accepted). The dispatcher only reacts to `accepted` state.

Wait — re-reading the handoff: after handoff toAgent, the task is in `in_progress` state with a new owner. `provisionSession` Phase 3 calls `transitionTask(taskId, "in_progress")` which would fail because in_progress -> in_progress is not a valid transition. 

**Fix:** The dispatcher must only dispatch tasks in `accepted` state. For handoff-to-agent, we need the task to cycle back to `accepted` first. Looking at the state machine: `in_progress -> blocked -> in_progress` or we need a new path. But actually: `in_progress` does NOT have a transition to `accepted`. The valid out-transitions from in_progress are: review, blocked, killed.

**Revised resolution:** The handoff-to-agent case already ends the session and keeps the task in `in_progress`. The new agent needs a fresh session for a task that's already `in_progress`. `provisionSession` Phase 3 calls `transitionTask(taskId, "in_progress")` which would be `in_progress -> in_progress` — invalid.

Looking more carefully at `provisionSession`: it unconditionally calls `transitionTask(db, eventBus, params.taskId, "in_progress")`. For a handoff-re-dispatch, the task is ALREADY in_progress.

**Fix needed in provisionSession:** Make the transition conditional — only call `transitionTask` if the task is NOT already in `in_progress`. This is a small surgical change:

```typescript
// Phase 3: only transition if not already in_progress
const [taskRow] = await db.select().from(tasks).where(eq(tasks.id, params.taskId)).limit(1);
if (taskRow && taskRow.state !== "in_progress") {
  await transitionTask(db, eventBus, params.taskId, "in_progress");
}
```

This is safe because the only caller that passes an already-in_progress task is the dispatcher's handoff-re-dispatch path. The session routes always start from `accepted`.

---

## Design-It-Twice: Dispatcher Trigger Strategy

### Option A: Pure event-driven (subscribe to task_state_changed + session_ended)

The dispatcher subscribes to:
1. `task_state_changed` where `toState === "accepted"` — checks if task has ownerAgentId, enqueues
2. `session_ended` — checks if task's new owner differs from ended session's agent (handoff re-dispatch)

On startup: sweep tasks table for state=accepted AND ownerAgentId IS NOT NULL AND no active session.

**Trade-off:** Reactive, low latency (~0ms from event to dispatch attempt). But if an event is missed (bug in emitter, race condition), the task is stranded until restart.

### Option B: Polling + event-driven hybrid (like routine-scheduler)

Poll every N seconds for dispatchable tasks. Also subscribe to events for immediate dispatch.

**Trade-off:** Redundant work on every poll tick. Adds DB load. But self-healing — missed events get caught on next poll.

### Decision: Option A (pure event-driven) with a startup sweep.

Rationale: Events are reliable (synchronous in-process EventBus, no network). The startup sweep handles the "server was down" case. Polling adds complexity and load for a failure mode that doesn't exist in a single-process architecture. If we move to distributed (Redis pub/sub), the queue becomes durable (BullMQ), and missed events aren't a concern.

---

## Design-It-Twice: Queue Drain Strategy

### Option A: Immediate drain (process queue on every enqueue + on session_ended)

Every time a task is enqueued or a session ends (freeing capacity), attempt to drain the queue. Process items head-first. If ConcurrencyLimitError or CostCapExceededError, stop draining (the agent/team/factory is at capacity).

**Trade-off:** Minimal latency. But under high load, every session_ended triggers a queue scan which could be O(n) with many queued tasks.

### Option B: Periodic drain (batch process every 1s via setInterval)

Decouple enqueue from drain. A timer fires every second and processes up to N items.

**Trade-off:** Adds 0-1000ms latency. But predictable CPU usage and no thundering herd after a burst of session_ended events.

### Decision: Option A (immediate drain) with a drain-in-progress guard.

Rationale: Expected queue depth is < 50. O(n) scan of 50 items is negligible. The guard prevents re-entrant drains (if drainQueue is already running, skip). Latency matters — the founder shaped a bet, agents should start immediately, not in 1 second.

---

## Architecture

### New Files

| File | Package | Purpose |
|------|---------|---------|
| `packages/fabric/src/services/task-dispatcher.ts` | fabric | Core dispatcher service: queue, event subscriptions, drain logic |
| `packages/server/src/__tests__/AD2-task-dispatcher.test.ts` | server | Integration tests (needs DB + EventBus + adapter pool) |
| `packages/server/src/routes/dispatch-queue-routes.ts` | server | GET /api/dispatch-queue (observability AC6) |

### Modified Files

| File | Change |
|------|--------|
| `packages/fabric/src/bootstrap.ts` | Register task dispatcher; accept provisioning deps |
| `packages/fabric/src/index.ts` | Export `registerTaskDispatcher` |
| `packages/server/src/server-factory.ts` | Pass provisioning deps to bootstrapFabric |
| `packages/server/src/app.ts` | Accept dispatch deps in AppOptions; mount dispatch-queue route |
| `packages/server/src/services/session-provisioning.ts` | Make Phase 3 transition conditional (skip if already in_progress) |
| `packages/shared/src/events.ts` | No change needed — existing events suffice |

---

## Type Signatures

### TaskDispatcher (fabric)

```typescript
// packages/fabric/src/services/task-dispatcher.ts

export interface TaskDispatcherDeps {
  readonly db: HyperIdleDb;
  readonly eventBus: EventBus;
  readonly adapterPool: AdapterPool;
  readonly workspace: WorkspaceAdapter;
  readonly workspaceBasePath: string;
  readonly credentialResolver?: CredentialResolver;
  readonly mcpBridgeRegistry?: McpBridgeRegistry;
  readonly mcpBaseUrl?: string;
}

export interface DispatchQueueEntry {
  readonly taskId: string;
  readonly agentId: string;
  readonly teamId: string;
  readonly enqueuedAt: number; // Date.now()
}

export interface DispatchQueueSnapshot {
  readonly entries: readonly DispatchQueueEntry[];
  readonly draining: boolean;
}

/**
 * Register the task dispatcher. Returns a disposer that unsubscribes
 * from events and stops the dispatcher.
 *
 * Subscribes to:
 * - task_state_changed (toState=accepted) — enqueue if ownerAgentId set
 * - session_ended — re-dispatch for handoff cases + free capacity drain
 *
 * On registration: performs initial sweep of dispatchable tasks.
 */
export function registerTaskDispatcher(deps: TaskDispatcherDeps): () => void;

/**
 * Get a snapshot of the current dispatch queue for observability.
 * Called by the route handler.
 */
export function getDispatchQueueSnapshot(): DispatchQueueSnapshot;
```

### Bootstrap Extension

```typescript
// packages/fabric/src/bootstrap.ts — updated signature

export function bootstrapFabric(ctx: {
  readonly db: HyperIdleDb;
  readonly eventBus: EventBus;
  readonly readAlertPreferences?: () => Promise<AlertPreferences>;
  // AD2: provisioning deps for task dispatcher. When absent, dispatcher
  // is not registered (kernel-only tests, no adapter pool).
  readonly dispatcherDeps?: Omit<TaskDispatcherDeps, "db" | "eventBus">;
}): Array<() => void>;
```

### Dispatch Queue Route

```typescript
// packages/server/src/routes/dispatch-queue-routes.ts

// GET /api/dispatch-queue
// Response: { entries: DispatchQueueEntry[], draining: boolean }
// Auth: requires X-API-Key (founder-level)
export function createDispatchQueueRoutes(): Hono;
```

### Session Provisioning Change

```typescript
// packages/server/src/services/session-provisioning.ts
// Phase 3 modification:

// Before (current):
await transitionTask(db, eventBus, params.taskId, "in_progress");

// After (AD2):
const [taskForTransition] = await db
  .select({ state: tasks.state })
  .from(tasks)
  .where(eq(tasks.id, params.taskId))
  .limit(1);
if (taskForTransition && taskForTransition.state !== "in_progress") {
  await transitionTask(db, eventBus, params.taskId, "in_progress");
}
```

---

## Acceptance Criteria with Verification

### AC1: Auto-provisioning on task acceptance

**Criterion:** When a task transitions to `accepted` with `ownerAgentId` set, a session is automatically provisioned.

**Verification:** Integration test that:
1. Creates a task (state=proposed, ownerAgentId=agentA)
2. Transitions task to `accepted`
3. Asserts: session row exists with taskId=task.id, agentId=agentA, state=active (or done if fast harness)
4. Asserts: task state = in_progress

### AC2: Auto-provisioning on handoff

**Criterion:** When a handoff assigns a new agent, the receiving agent's session is automatically provisioned.

**Verification:** Integration test that:
1. Creates a task in_progress with agentA owning it, active session for agentA
2. Calls handoff(toAgent=agentB) — ends session, reassigns ownerAgentId
3. Asserts: session_ended event fires
4. Asserts: new session row exists with agentId=agentB for the same task
5. Asserts: task state remains in_progress (not double-transitioned)

### AC3: Cost cap queuing

**Criterion:** When cost cap is exceeded, task queues rather than fails.

**Verification:** Integration test that:
1. Sets up agent with cost cap exceeded (costCapMinor < current spend)
2. Transitions a task to accepted with that agent
3. Asserts: task is enqueued (getDispatchQueueSnapshot shows entry)
4. Asserts: no session is created
5. Asserts: task remains in `accepted` state (not stranded in in_progress)

### AC4: Concurrency limit queuing

**Criterion:** When agent is at maxConcurrentSessions, task queues.

**Verification:** Integration test that:
1. Creates agent with maxConcurrentSessions=1
2. Creates an active session for that agent
3. Transitions a new task to accepted with that agent
4. Asserts: task is enqueued (queue snapshot shows entry)
5. Simulates first session ending (emit session_ended)
6. Asserts: queued task is now dispatched (new session created)

### AC5: Non-code workspace dispatch

**Criterion:** Non-coding tasks dispatch with workspace that doesn't assume git.

**Verification:** Integration test that:
1. Creates a "marketing" agent (harnessType=null or "builtin", role="brand_voice")
2. Creates a task, transitions to accepted
3. Asserts: session provisioned via builtin adapter (not claude-code)
4. Asserts: workspace created as empty directory (no .git)
5. Asserts: no git-specific tools in session config

### AC6: Observability (queue visibility)

**Criterion:** Founder can see queued tasks waiting for capacity.

**Verification:** Integration test that:
1. Queues 2 tasks (agent at concurrency limit)
2. GET /api/dispatch-queue
3. Asserts: response contains 2 entries with taskId, agentId, teamId, enqueuedAt
4. Asserts: `draining: false` (or true if drain is in progress)

### AC-idempotency: Restart doesn't duplicate sessions

**Criterion:** Restarting the dispatcher doesn't create duplicate sessions.

**Verification:** Integration test that:
1. Creates a task in state=accepted with ownerAgentId and an active session already exists
2. Triggers startup sweep (or re-registers dispatcher)
3. Asserts: no new session created (existing active session blocks re-dispatch)

---

## Ordered Task List

### Task 1: Conditional transition in provisionSession (prerequisite)

**File:** `packages/server/src/services/session-provisioning.ts`
**What:** Add a task state check before `transitionTask` in Phase 3. If task is already `in_progress`, skip the transition.
**Test:** `packages/server/src/__tests__/AD2-task-dispatcher.test.ts` — test that provisionSession succeeds for an already-in_progress task without InvalidTransitionError.
**Risk:** Must not break existing callers. The sessions-routes.ts caller always starts from `accepted`, so the check is harmless there.

### Task 2: Core dispatcher service

**File:** `packages/fabric/src/services/task-dispatcher.ts`
**What:** Implement the dispatcher:
- In-memory FIFO queue (array of `DispatchQueueEntry`)
- `registerTaskDispatcher(deps)` function that:
  - Subscribes to `task_state_changed` (enqueue on toState=accepted + ownerAgentId)
  - Subscribes to `session_ended` (drain queue for freed capacity + re-dispatch for handoff)
  - Performs initial sweep on registration
  - Returns disposer
- `enqueue(entry)` — adds to queue, triggers drain
- `drainQueue()` — processes head of queue:
  - For each entry: resolve model tier, call provisionSession
  - On ConcurrencyLimitError: leave in queue, stop draining for this agent
  - On CostCapExceededError: leave in queue, stop draining entirely
  - On success: remove from queue
  - On other error: remove from queue (log error, don't retry — task reverts to accepted via provisionSession's revert logic)
- `getDispatchQueueSnapshot()` — returns current state
- Drain-in-progress guard (no re-entrant drains)
- Idempotency: before enqueue, check no active session exists for taskId

**Dependencies:** Task 1

### Task 3: Bootstrap wiring

**Files:**
- `packages/fabric/src/bootstrap.ts` — accept `dispatcherDeps`, call `registerTaskDispatcher`
- `packages/fabric/src/index.ts` — export `registerTaskDispatcher` and `getDispatchQueueSnapshot`
- `packages/server/src/server-factory.ts` — pass provisioning deps to bootstrapFabric context
- `packages/server/src/app.ts` — pass dispatcherDeps through AppOptions to strategyBootstrap

**What:** Wire the dispatcher into the application lifecycle so it starts on server boot and stops on server shutdown.

**Dependencies:** Task 2

### Task 4: Dispatch queue route

**Files:**
- `packages/server/src/routes/dispatch-queue-routes.ts` — GET /api/dispatch-queue
- `packages/server/src/app.ts` — mount the route

**What:** Simple route that calls `getDispatchQueueSnapshot()` and returns it as JSON. Protected by auth middleware (already present on /api/*).

**Dependencies:** Task 3

### Task 5: Integration tests

**File:** `packages/server/src/__tests__/AD2-task-dispatcher.test.ts`
**What:** Full integration tests covering AC1-AC6 + idempotency.
**Dependencies:** Tasks 1-4

### Task 6: Credential resolution in dispatcher

**What:** The dispatcher needs to resolve model tier (same as sessions-routes.ts does). The `resolveModelTier()` function needs `CredentialResolver` which is passed through deps. Ensure the dispatcher calls `resolveModelTier` before `provisionSession` (matching sessions-routes.ts pattern).

**File:** Inside `packages/fabric/src/services/task-dispatcher.ts` drain logic.
**Dependencies:** Task 2 (concurrent with Task 2 implementation)

---

## Dispatcher Flow (Pseudocode)

```
ON task_state_changed(event):
  if event.toState !== "accepted": return
  task = db.select(tasks).where(id = event.taskId)
  if !task.ownerAgentId: return
  if hasActiveSession(task.id): return  // idempotency
  enqueue({ taskId: task.id, agentId: task.ownerAgentId, teamId: task.teamId })
  drainQueue()

ON session_ended(event):
  // Case 1: handoff re-dispatch
  task = db.select(tasks).where(id = event.taskId)
  if task.state === "in_progress" AND task.ownerAgentId !== event.agentId:
    if !hasActiveSession(task.id):
      enqueue({ taskId: task.id, agentId: task.ownerAgentId, teamId: task.teamId })
  // Case 2: capacity freed — try draining existing queue
  drainQueue()

STARTUP SWEEP:
  tasks = db.select(tasks).where(state = "accepted", ownerAgentId IS NOT NULL)
  for each task:
    if !hasActiveSession(task.id):
      enqueue({ taskId: task.id, agentId: task.ownerAgentId, teamId: task.teamId })
  drainQueue()

drainQueue():
  if draining: return  // guard
  draining = true
  while queue.length > 0:
    entry = queue[0]
    try:
      resolvedModel = resolveModelTier(agent.modelTierPreference ?? "workhorse", ...)
      provisionSession(deps, { taskId, agentId, productId: teamId, ... resolvedModel })
      queue.shift()  // success: remove from queue
    catch ConcurrencyLimitError:
      // This agent is full; skip entries for this agent, try next
      skipAgent(entry.agentId)
      continue
    catch CostCapExceededError:
      break  // factory/team/agent is over budget; stop draining
    catch other:
      queue.shift()  // unrecoverable: remove, task reverts to accepted
      log.error(...)
  draining = false
```

---

## Security & Abuse Cases

| Vector | Applicable? | Mitigation |
|--------|------------|------------|
| Rate-limit on POST/PATCH | N/A — dispatcher is internal, not exposed as a POST endpoint | No user-facing endpoint to rate-limit |
| Agent-authored field trust | **Yes** — ownerAgentId is set by agents (create_task, handoff). An agent could assign tasks to other agents | Mitigated by existing validation: ownerAgentId FK constraint + handoff's agent-existence check. Dispatcher trusts DB state, not raw input |
| Secret handling | **Yes** — credential resolution for model tier | Reuses existing `CredentialResolver` pattern (env-backed or encrypted DB). No new credential surface |
| Path traversal | N/A — workspace paths are generated by LocalWorkspaceAdapter.spawn(), not user-supplied | |
| SSRF | N/A — no outbound URLs constructed from user input | |
| Denial of service via queue flooding | **Low risk** — queue is bounded by task count in DB. An agent creating 1000 tasks would need 1000 DB rows first. Cost caps prevent runaway provisioning | Queue draining respects cost caps. Worst case: queue grows but nothing provisions |
| Double-dispatch race | **Yes** — two events could trigger dispatch for same task simultaneously | `hasActiveSession(taskId)` check + `provisionSession` Phase 3 concurrency check (select active sessions) provide double protection |

---

## Protected Tests

```
protectedTests: [
  "packages/server/src/__tests__/session-provisioning.test.ts",
  "packages/server/src/__tests__/X3-session-provisioning.test.ts",
  "packages/server/src/__tests__/X6-provisioning-integration.test.ts",
  "packages/server/src/__tests__/task-state-machine.test.ts",
  "packages/server/src/__tests__/handoff-protocol.test.ts",
  "packages/server/src/__tests__/cost-cap.test.ts",
  "packages/server/src/__tests__/routine-scheduler.test.ts"
]
```

These existing tests must continue passing without assertion changes. The only code change that touches them is Task 1 (conditional transition), which is additive — it makes provisionSession more permissive, not less.

---

## Risks and Mitigations

1. **Circular dependency: fabric imports from server.** The dispatcher needs `AdapterPool`, `WorkspaceAdapter`, `CredentialResolver` types which live in `@hyperidle/server`. Mitigation: these types are interfaces. Move the interface definitions to `@hyperidle/shared` or pass them as opaque deps (the dispatcher only calls methods, doesn't import implementation). Actually, looking at the code: `AdapterPool` is already imported in `session-provisioning.ts` from a relative `../harness/adapter-pool.js` path — it lives in server. `WorkspaceAdapter` is also in server. **Fix:** The dispatcher in fabric must not import from server. Instead, `bootstrapFabric` receives the concrete deps as arguments (already the pattern — fabric's existing handlers receive `db` and `eventBus` from the caller). The dispatcher function receives `ProvisionSessionDeps`-compatible deps without importing the concrete classes. Move `ProvisionSessionDeps` interface export to `@hyperidle/shared` or keep it in server and have the dispatcher define its own compatible interface.

   **Chosen approach:** The dispatcher defines its own `TaskDispatcherDeps` interface (shown above) that is structurally compatible with what `provisionSession` needs. The server-factory.ts constructs the concrete objects and passes them. No cross-package import of implementation types.

2. **Credential resolution lives in server.** The `resolveModelTier` function is in `@hyperidle/server`. The dispatcher (in fabric) cannot import it. **Fix:** Pass a `resolveModel` callback in `TaskDispatcherDeps`:
   ```typescript
   readonly resolveModel?: (modelTier: ModelTier) => Promise<ResolvedModel | undefined>;
   ```
   Server-factory.ts provides the implementation (closing over credentialResolver and serverConfig). When absent (tests), dispatcher passes `undefined` as resolvedModel to provisionSession (which works — it's optional).

3. **provisionSession is async and long-running.** Calling it from an event handler blocks subsequent event processing if done synchronously. **Fix:** Use `void provisionSession(...)` (fire-and-forget) with a `.catch()` for error logging, matching the pattern in `routine-scheduler.ts` (`checkAndFireRoutine(db, eventBus, routine).catch(...)`). The queue's drain-in-progress guard prevents thundering herd.

4. **session_ended for handoff re-dispatch timing.** After handoff sets ownerAgentId=agentB, the session_ended event fires. The dispatcher reads the task — but what if the DB write hasn't committed yet? **Mitigation:** In `handoff-protocol.ts`, the ownership update happens inside a transaction that commits BEFORE events are emitted (post-commit emission pattern, line 312). So by the time session_ended fires, ownerAgentId is already agentB in the DB. Safe.

---

## Migrations

No database migrations needed. The dispatcher uses existing tables (tasks, sessions, users) with existing columns. The dispatch queue is in-memory only.

No symbol renames. The only modification to existing code is:
- `session-provisioning.ts`: additive guard (conditional transition)
- `bootstrap.ts`: additive parameter + registration call
- `server-factory.ts`: pass additional context fields
- `app.ts`: pass dispatcherDeps through options

All are additive — no breaking changes to existing callers or test assertions.
