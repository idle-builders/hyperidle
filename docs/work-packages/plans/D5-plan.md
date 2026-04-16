# D5 — Session Provisioning (End-to-End) — Plan

**Story.** Wire every earlier building block (cost cap, workspace spawn, knowledge materialize, file watcher, agent start, event streaming, cost tracking, cleanup) into a single `provisionSession` orchestrator so an agent task actually runs a session from submit to cleanup. Owns crash recovery and sub-agent cost aggregation.

**Effort.** L (~4 days).

**Depends on (all merged on main).** D1 (HarnessAdapter types + MockHarnessAdapter), D2 (ClaudeAgentSdkAdapter), D3 (Local/DockerWorkspaceAdapter), D4 (skill tool registry), B2 (`materialize`), B4 (`startWatcher`, `processWriteback`), C3 (`session-lifecycle`), C7 (`checkCostCap`, `recordCostAndCheck`).

---

## 1. Context — What we are building

`createSession` in C3 already performs workspace mkdir + `materialize` + `startWatcher` + `session_started` emission, but:
- It does NOT consult the cost cap (C7).
- It does NOT invoke a `HarnessAdapter.startSession` or `WorkspaceAdapter.spawn` — it just does `fs.mkdirSync`. The workspace path is owned by the service, not by a `WorkspaceAdapter`.
- It does NOT transition the task to `in_progress`.
- It does NOT consume the harness event stream, so no cost/token updates are recorded.
- It does NOT drive `endSession` / `crashSession`. The caller has to manually coordinate.
- `session_ended` event payload is missing `cost_delta` and `outcome` (spec requires both).
- Sub-agent cost aggregation has no plumbing.

D5 adds a thin orchestrator `provisionSession` that owns the full lifecycle: pre-flight cost check → task transition → workspace spawn (via adapter) → materialize → watcher start → harness start → event consumption loop → normal/crash termination → writeback flush → workspace destroy → `session_ended` with full payload. It registers the tool registry (D4) against the harness adapter so skill tools actually fire.

It also resolves the `NOOP_WATCHER` workaround in `handoff-to.ts` (retro): the real watcher lives in the orchestrator's `SessionContext`, so `handoff_to` can be handed a real context rather than synthesising one.

---

## 2. Acceptance Criteria → Verification Strategy

| # | Criterion | Verification |
|---|---|---|
| AC1 | End-to-end mock: provision → workspace, materialize, watcher running → agent writes file → SQLite writeback → session ends → workspace cleaned | **Integration test** `session-provisioning.test.ts` using `MockHarnessAdapter` (extended to synthesize `tool_call` for writing into `work/session-notes.md`) and `LocalWorkspaceAdapter`. Asserts: (a) `knowledge_items` row created by writeback, (b) `sessions.state = 'done'`, (c) `fs.existsSync(workspacePath) === false` after provision returns. |
| AC2 | Claude integration test: real session → agent runs → session completes | **Integration test** `session-provisioning.integration.test.ts` gated on `process.env.ANTHROPIC_API_KEY` (skip otherwise). Uses `ClaudeAgentSdkAdapter` + `LocalWorkspaceAdapter`. Asserts session outcome `completed` and cost > 0. |
| AC3 | Crash recovery: agent process dies → session `crashed`, pre-crash knowledge preserved | **Unit test** injects a mock harness whose `streamEvents` yields one `tool_call` that writes a knowledge file, then throws. Assert: (a) `sessions.state = 'crashed'`, (b) `sessions.outcome = 'crashed'`, (c) workspace NOT destroyed (so writeback has run at least once), (d) the knowledge_items row from the pre-crash write is present. |
| AC4 | Cost cap rejection: `agents.costCap = 0` → `CostCapExceededError` | **Unit test** seeds an agent with `costCap: 0` and a prior session with `cost > 0`. Calls `provisionSession`; expects `rejects.toBeInstanceOf(CostCapExceededError)` and no `sessions` row inserted. Also assert the task is NOT transitioned. |
| AC5 | Concurrent sessions: `maxConcurrentSessions: 3` → provision 3, all independent | **Integration test** creates an agent with `maxConcurrentSessions: 3` plus 3 tasks. Provisions all 3 in parallel via `Promise.all`. Assert each returns a distinct `sessionId`, each has a distinct `workspacePath`, no path collision, no cross-contamination of writebacks (each session writes a marker and only that marker shows up in its own `knowledge_items.sessionId` column). |
| AC6 | Task state moves to `in_progress` on session start | **Unit test** seeds a task in `accepted`. Provisions a session using a mock harness whose stream blocks. Assert `tasks.state = 'in_progress'` **before** `streamEvents` is consumed (i.e. transition happens in the pre-flight phase). Assert a `task_state_changed` event fired. |
| AC7 | Sub-agent cost aggregation: agent spawns 2 sub-agents → session cost = main + sub1 + sub2 | **Unit test** uses a mock harness that emits sequenced `cost_update` events: main=`$0.01`, sub1=`$0.02`, sub2=`$0.03`. After provision completes, assert `sessions.cost` is the sum (converted to cents). Assert all 3 `cost_update` deltas flowed through `recordCostAndCheck`. |
| AC8 | `session_ended` event payload = `{ sessionId, cost_delta, outcome, taskId }`; E2 creates review items | **Unit test** subscribes to `session_ended`. Asserts all 4 fields present. Plus: register `registerSessionReviewCreator` (existing E2) against the same bus with a `medium` risk task, run provision, assert a `review` item row is created. Requires adding `costDelta` and `outcome` to `SessionEndedEvent` shape in `@hyperidle/shared/events.ts` (and its emitters). |

Additional invariants (not in the numbered AC but required):
- Every path through `provisionSession` either returns a `SessionResult` or throws a taxonomy error; it never leaves a half-provisioned workspace behind.
- Handoff (D4 `handoff_to`) stops the real watcher, not a noop — resolves retro item.

---

## 3. File Structure

**New files**
- `packages/server/src/services/session-provisioning.ts` — orchestrator (primary deliverable).
- `packages/server/src/services/session-provisioning-errors.ts` — `CostCapExceededError` extension helpers if needed; otherwise re-use the one in `@hyperidle/shared/errors`.
- `packages/server/src/__tests__/session-provisioning.test.ts` — mock adapter integration tests (AC1, AC3, AC4, AC5, AC6, AC7, AC8).
- `packages/server/src/__tests__/session-provisioning.integration.test.ts` — real Claude SDK test (AC2, skipped without API key).

**Modified files**
- `packages/shared/src/events.ts` — extend `SessionEndedEvent` with `costDelta: number` and `outcome: "completed" | "crashed" | "stopped"`.
- `packages/server/src/services/session-lifecycle.ts` — update `endSession` / `crashSession` signatures to accept `outcome` and compute `costDelta` from previous session cost; emit the richer event.
- `packages/server/src/__tests__/session-lifecycle.test.ts` — adapt to new event shape.
- `packages/server/src/services/session-review-creator.ts` — use new event fields (no behavioural change required, but read `outcome` from event rather than DB).
- `packages/server/src/skill-tools/handoff-to.ts` — delete `NOOP_WATCHER`; receive the real `FileWatcher` through an extended `ToolContext`.
- `packages/server/src/skill-tools/tool-registry.ts` — add `watcher: FileWatcher` to `ToolContext`.
- Any other tools that instantiate a `ToolContext` (tests): update.

**No schema/DDL changes.** `sessions.outcome` column already exists — we just start populating it on the happy path too.

---

## 4. Design — `provisionSession`

### 4.1 Type signatures (sketch, no implementation)

```ts
// packages/server/src/services/session-provisioning.ts

export interface ProvisionSessionParams {
  readonly taskId: string;
  readonly agentId: string;
  readonly productId: string;
  readonly workspaceBasePath: string;
  readonly factoryCap?: number;
  readonly factorySpend?: number;
  readonly reviewThreadId?: string;
}

export interface ProvisionSessionDeps {
  readonly db: HyperIdleDb;
  readonly eventBus: EventBus;
  readonly harness: HarnessAdapter;
  readonly workspace: WorkspaceAdapter;
  readonly now?: () => Date;       // for deterministic tests
}

export interface ProvisionSessionResult {
  readonly sessionId: string;
  readonly outcome: "completed" | "crashed" | "stopped";
  readonly totalCostCents: number;
  readonly taskId: string;
}

export async function provisionSession(
  deps: ProvisionSessionDeps,
  params: ProvisionSessionParams,
): Promise<ProvisionSessionResult>;
```

### 4.2 Control flow (11 phases)

```
┌─ PRE-FLIGHT ─────────────────────────────────────────────────────┐
│ 1. Load agent row; derive teamId, role, modelTier, soulPromptPath │
│ 2. checkCostCap(agent, team, factory) — throw CostCapExceededError│
│ 3. transitionTask(taskId, 'in_progress')                          │
└────────────────────────────────────────────────────────────────────┘
┌─ SETUP ──────────────────────────────────────────────────────────┐
│ 4. workspace.spawn(workspaceBasePath) -> WorkspaceHandle          │
│ 5. createSession(...) from C3 — but pass the handle.path so C3    │
│    reuses the adapter-owned path (do NOT duplicate mkdir).        │
│    NOTE: C3 currently mkdirs. We adjust it to accept an optional  │
│    preCreatedPath OR we inline its logic here. See trade-off §5.  │
│ 6. materialize(...) + startWatcher(...) happen inside createSession│
│ 7. Build ToolContext with { db, eventBus, agentId, sessionId,     │
│    taskId, workspacePath, watcher }; buildToolRegistry(ctx)       │
└────────────────────────────────────────────────────────────────────┘
┌─ RUN ────────────────────────────────────────────────────────────┐
│ 8. harness.startSession({ workspacePath, soulPromptPath,          │
│    modelTier, tools: registry.toClaudeToolSpecs() })              │
│ 9. for await (event of harness.streamEvents(handle)):             │
│      - token_usage:    aggregate; optional DB flush each N        │
│      - cost_update:    recordCostAndCheck(delta); accumulate      │
│      - tool_call:      registry.invoke(name, args); emit result   │
│      - pre_compaction: log; no-op by default (D2 owns behaviour)  │
│      - error:          remember; break loop → crash path          │
│      - completion:     append to session notes (optional)         │
└────────────────────────────────────────────────────────────────────┘
┌─ TEARDOWN (try/finally-shaped) ──────────────────────────────────┐
│10. If completed: endSession(ctx, totalCost, 'completed')          │
│    If crashed:   crashSession(ctx, totalCost, 'crashed')          │
│    Both: watcher.stop() inside C3; endSession also workspace.destroy()│
│11. Return ProvisionSessionResult                                  │
└────────────────────────────────────────────────────────────────────┘
```

### 4.3 Sub-agent cost aggregation

The Claude Agent SDK reports `cost_update.totalCost` as the **session** cost — when sub-agents are invoked through the SDK, their cost is already rolled into the parent `result.total_cost_usd` (see `claude-agent-sdk-adapter.ts` line 147–150). We therefore do NOT sum `deltaCost` ourselves — we trust the SDK's running `totalCost` and persist the last observed value.

⚠️ UNVERIFIED: Confirm in SDK docs that `total_cost_usd` on the terminal `result` message is inclusive of sub-agent costs. If not, we will need to maintain our own accumulator using per-delta `deltaCost`. The test in AC7 will pin down the expected behaviour regardless.

Source to check: https://docs.claude.com/en/api/agent-sdk/overview (cost fields on `result` message).

### 4.4 Crash semantics

- Crash = `streamEvents` throws, or harness emits an `error` event. We classify both as `outcome: "crashed"`.
- `crashSession` (C3) already preserves the workspace on crash (line 200 comment). We rely on that.
- **Key invariant:** `watcher.stop()` inside `crashSession` performs a final flush — that is how pre-crash writes reach SQLite. We must NOT swallow errors in a way that prevents `stop()` from running. C3 wraps `stop()` in try/catch which is correct.

### 4.5 Concurrency (AC5)

Concurrent provisioning is safe by construction because:
- `createSession` in C3 already checks `maxConcurrentSessions`.
- Each call gets a distinct `workspaceId` from the adapter (`nextId++` + timestamp in `LocalWorkspaceAdapter`).
- `sessions.id = crypto.randomUUID()`.
- SQLite better-sqlite3 is synchronous — no write-interleaving.

The test proves independence by writing distinct marker files per session and asserting `knowledge_items` rows carry distinct `sessionId`.

### 4.6 Event payload extension

Current `SessionEndedEvent`:
```ts
{ type, streamId, sessionId, agentId, taskId, timestamp }
```
New:
```ts
{ type, streamId, sessionId, agentId, taskId, timestamp,
  costDelta: number,          // cents (final cost - prev recorded cost for session)
  outcome: "completed" | "crashed" | "stopped" }
```
`registerSessionReviewCreator` will read `event.outcome` instead of `session.outcome` (small refactor).

---

## 5. Trade-offs

- **Reuse `createSession` vs inline.** Reuse keeps the DRY win from C3 (concurrency check, materialize, watcher, `session_started` emission all live there). We add an overload that accepts an optional pre-spawned workspace path so the `WorkspaceAdapter` owns the path. Cost: slightly awkward optional parameter. Alternative: inline C3 into the orchestrator and delete `createSession`. Rejected — C3 has its own tests and is already used elsewhere indirectly. **Chosen: reuse, with minor signature widening.**
- **Where does the harness adapter come from?** Inject via `ProvisionSessionDeps`, not constructed inside. Keeps it testable with `MockHarnessAdapter` and allows swap to Claude/Goose later.
- **Cost unit mismatch.** C3 stores cost in cents (integer), Claude SDK reports USD float. We multiply by 100 and round. Document in the orchestrator. Emit a note if the conversion loses precision.
- **`ToolContext` grows.** Adding `watcher: FileWatcher` to `ToolContext` touches every tool file. Alternative: decouple handoff from watcher entirely. Rejected — the watcher is a legitimate resource a tool might need (e.g. future `flush_knowledge` tool), and removing the NOOP is explicitly called out in the retro.

---

## 6. Ordered Task List

Sequenced so tests are in place before each batch of implementation. TDD red→green.

1. **Extend `SessionEndedEvent`.** Add `costDelta: number` and `outcome: "completed" | "crashed" | "stopped"` to `packages/shared/src/events.ts`. Update the type. Red phase: existing tests that construct the event will fail typecheck.
2. **Update C3 emitters.** `endSession` and `crashSession` compute `costDelta` (argument `costInCents - previous persisted cost`) and pass outcome. Update `session-lifecycle.test.ts` to assert the new fields.
3. **Teach C3 to accept a pre-spawned workspace path (optional).** Add optional `workspacePath?: string` to `CreateSessionParams`; if provided, skip the mkdir. Test: new branch covered by a small unit test.
4. **Update `ToolContext` to carry `watcher`.** Extend `ToolContext` in `tool-registry.ts`. Update every tool file's invocation site that builds a context (mostly tests). Remove `NOOP_WATCHER` from `handoff-to.ts` — use `ctx.watcher` instead. Verify handoff tests still pass.
5. **Write failing orchestrator tests (red).** Create `session-provisioning.test.ts` with AC1, AC3, AC4, AC5, AC6, AC7, AC8 test cases. All expected to fail because `provisionSession` does not exist.
6. **Write failing integration test.** `session-provisioning.integration.test.ts` gated on `ANTHROPIC_API_KEY` env. Skipped otherwise (AC2).
7. **Implement `provisionSession` — pre-flight phase.** Agent load, cost cap check (throws `CostCapExceededError`), task transition to `in_progress`. Make AC4 and AC6 green.
8. **Implement `provisionSession` — setup phase.** Workspace adapter spawn, `createSession`, tool registry build. Confirm AC5 concurrency independence.
9. **Implement `provisionSession` — run phase.** Event stream consumer: tool dispatch, cost aggregation via `recordCostAndCheck`, error detection. Make AC7 green.
10. **Implement `provisionSession` — teardown phase.** Normal vs crash branches, compute `costDelta`, call `endSession`/`crashSession`, workspace destroy on normal path. Make AC1, AC3, AC8 green.
11. **Wire E2 subscriber test.** In AC8's test, register `registerSessionReviewCreator` before `provisionSession` and assert review item row is created for a `medium` risk task.
12. **Run integration test with real API key locally** (AC2). Opt-in via CI env flag.
13. **Run `bun run check`, `bun run lint`, `bun run test`.** Zero type/lint/test errors.
14. **Doc pass.** Add a docstring to `provisionSession` with the 11-phase flow and a pointer to `docs/ARCHITECTURE.md`.

---

## 7. Adversary Risks (5)

1. **Partial-provision leak on mid-pipeline failure.** If `materialize` throws after workspace spawn, the workspace directory and the session row are left dangling (C3's current behaviour). Mitigation: wrap phases 4–7 in a try/catch that, on failure, calls `workspace.destroy`, deletes the half-written session row, and reverts the task state to the pre-provision state (we captured it in step 3). A dedicated test injects a failing `materialize` and asserts no residue.
2. **Double cost cap check race.** Two `provisionSession` calls for the same agent both pass `checkCostCap` simultaneously (SQLite is synchronous but JS is cooperative — the check and insert aren't one transaction). Mitigation: run the cost check + `sessions` insert inside a single `db.transaction(...)`. Test: two interleaved provisions when cap is tight — exactly one should succeed. better-sqlite3 transactions are synchronous; verify Drizzle's transaction API for sqlite (https://orm.drizzle.team/docs/transactions).
3. **Watcher flush never runs on abnormal stream termination.** If `streamEvents` hangs and the host is interrupted (SIGTERM), the `finally`-equivalent won't run. Out of scope for D5 (process-level crash recovery is H-track), but we mark the workspace directory with a `provisioning.lock` file on spawn and clean it on normal end; boot-time recovery can reap stale locks later.
4. **`cost_update.totalCost` semantics ambiguity.** (See §4.3 ⚠️ UNVERIFIED.) If SDK reports parent-only rather than cumulative, AC7 fails. Resolution: add a mock-harness test that emits explicit sub-agent deltas and read the final persisted cost — whichever shape the real SDK uses, the orchestrator logic should match it. If misalignment surfaces in AC2 integration, switch to sum-of-deltas.
5. **Test isolation around `emittedEvents` module-level Set in `cost-cap.ts`.** Cross-test contamination if tests don't reset it. Mitigation: call `clearDeduplicationCache()` in `beforeEach` of new test files.

---

## 8. Open Questions

- **Q1. Who persists harness events to `session_events` table?** There is no such table today. D5 consumes events in-process but does not persist the raw stream. If future stories need replay, we need to add a table. Proceeding without it; flag if downstream story needs change.
- **Q2. How do we map `SessionResult.outcome` from `stopped` (harness aborted)?** The `HarnessAdapter.stopSession` returns outcome `"completed" | "crashed" | "stopped"`. Orchestrator currently only triggers stopSession on normal end — "stopped" path isn't reachable until an external cancellation API is introduced (E-track). Treat `stopped` as synonym for `completed` for AC8 for now.
- **Q3. Soul prompt path resolution.** `agents.soulPromptPath` is nullable. If null, what does the harness get? Proposing: orchestrator passes an empty string and lets the adapter decide. The Claude adapter today never reads `soulPromptPath`. Flag for D-track refinement.

---

## 9. Done Definition

- All 8 ACs verified by test (unit + integration + skipped-until-API-key). Test coverage of `session-provisioning.ts` is 100% line + branch.
- `NOOP_WATCHER` removed from `handoff-to.ts`.
- `SessionEndedEvent` carries `costDelta` and `outcome`; all subscribers updated.
- `bun run check` and `bun run lint` pass with zero errors; `bun run test` is green.
- No raw SQL introduced. No schema/DDL changes. All DB access via Drizzle.
- Architecture boundary respected: orchestrator lives in the Meta Layer (`packages/server/src/services/`) and depends only on `HarnessAdapter` / `WorkspaceAdapter` / `ToolRegistry` abstractions for the Agent Runtime.
