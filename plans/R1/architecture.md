# R1 Architecture Plan -- Wire Agent Execution

## Required reading

- `packages/server/src/app.ts` -- `createApp`, `AppOptions`, DI pattern
- `packages/server/src/server-factory.ts` -- `createServer`, production wiring
- `packages/server/src/routes/sessions-routes.ts` -- current POST handler (bare DB insert)
- `packages/server/src/services/session-provisioning.ts` -- `provisionSession`, `ProvisionSessionDeps`, `ProvisionSessionParams`
- `packages/server/src/services/session-lifecycle.ts` -- `createSession`, `endSession`, `crashSession`, `SessionContext`
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` -- `ClaudeAgentSdkAdapter`, `AdapterOptions`
- `packages/server/src/harness/local-workspace-adapter.ts` -- `LocalWorkspaceAdapter`
- `packages/server/src/harness/workspace-adapter.ts` -- `WorkspaceAdapter` interface
- `packages/server/src/services/credential-resolver.ts` -- `CredentialResolver`, `EnvCredentialResolver`, `DbCredentialResolver`
- `packages/shared/src/harness/harness-adapter.ts` -- `HarnessAdapter`, `SessionConfig`, `SessionHandle`
- `packages/shared/src/errors.ts` -- `MissingCredentialError`

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| "Cost and token usage persisted to the session record" | O2: cost/token columns stripped from sessions table. Cost is tracked via `recordCostAndCheck` in users/teams/bets (strategy layer). `provisionSession` already calls this during Phase 10 cost_update events. | AC satisfied by existing orchestrator behavior. Cost flows through strategy layer, not session columns. No schema change needed. |
| "POST /api/sessions calls provisionSession()" | Current POST handler does a bare `db.insert(sessions)` (sessions-routes.ts L72-98). | Replace POST handler body with `provisionSession()` call. |
| "Adapters instantiated during server startup in createApp()" | `createApp` currently has no adapter references. Adapters are only constructed in tests. | Add adapter fields to `AppOptions`, construct in `createServer`, pass to `createSessionRoutes`. |
| "ANTHROPIC_API_KEY resolved from credential store" | `ClaudeAgentSdkAdapter` already supports `CredentialResolver` injection (constructor option). `EnvCredentialResolver` reads from `process.env`. `DbCredentialResolver` reads from encrypted DB. | In dev mode: construct `EnvCredentialResolver`, inject into adapter. In shared mode: construct `DbCredentialResolver`. Decision point is `process.env.NODE_ENV === 'production'`. |
| "LocalWorkspaceAdapter only in desktop/dev mode" | `LocalWorkspaceAdapter` constructor throws in `NODE_ENV=production`. | No additional gating needed -- the constructor guard is sufficient. In production, `DockerWorkspaceAdapter` would be used (out of scope for R1). |
| "provisionSession needs workspaceBasePath" | No env var or config for this exists. Tests use `os.tmpdir()`. | Resolve from `HYPERIDLE_WORKSPACES_DIR` env var, fallback to `path.join(os.tmpdir(), 'hyperidle-workspaces')`. |
| "provisionSession needs productId" | `ProvisionSessionParams` requires `productId`. The POST body schema has `agentId`, `taskId`, `modelTier` but NOT `productId`. Tasks table has `productId` column. | Look up the task row to derive `productId` before calling `provisionSession`. |
| "Sessions table has all needed columns" | Sessions table: `id, taskId, agentId, modelTier, startedAt, endedAt, state, workspaceSnapshot, outcome, notes`. No cost columns (O2). | Sufficient. No migration needed. |

## Key design decisions

### D1: Adapter lifecycle -- singleton

Both `ClaudeAgentSdkAdapter` and `LocalWorkspaceAdapter` maintain internal `Map`s of active sessions/workspaces. They are stateful but designed for concurrent use (keyed by session/workspace ID). Creating them per-request would lose the ability to track active sessions for cleanup.

**Decision:** Singleton per server process. Instantiated once in `createServer`, passed through `AppOptions` to `createApp`, then to `createSessionRoutes`.

**Cost of being wrong:** If we went per-session, we would lose the adapter's internal tracking map (can't call `destroy` on a workspace created by a different adapter instance). The existing test patterns all create adapters once and reuse them across sessions.

### D2: Credential resolution -- EnvCredentialResolver in dev, DbCredentialResolver in shared

`ClaudeAgentSdkAdapter` already accepts an optional `credentialResolver` in its constructor. When present, it uses `resolver.resolve("anthropic_api_key")` instead of reading `process.env.ANTHROPIC_API_KEY`.

**Decision:** In `createServer`:
- Always inject `EnvCredentialResolver`. This covers both local/desktop mode (where the desktop main process sets env vars from safeStorage before server boot) and dev mode (where the developer sets `ANTHROPIC_API_KEY` in their shell).
- `DbCredentialResolver` path is deferred -- it requires shared mode detection which is out of scope for R1 (R1 targets desktop/dev only).

**Rationale:** The spec says "Electron safeStorage in desktop mode, process.env in dev mode." Both of these resolve through `process.env` -- the desktop main process sets env vars from safeStorage before booting the server. `EnvCredentialResolver` covers both.

### D3: workspaceBasePath resolution

`provisionSession` requires `workspaceBasePath` -- the parent directory under which workspace subdirectories are created.

**Decision:** Resolve from `HYPERIDLE_WORKSPACES_DIR` env var, fallback to `path.join(os.tmpdir(), 'hyperidle-workspaces')`. Computed once at server start, passed through to the route handler.

### D4: POST route becomes async (fire-and-forget vs await)

`provisionSession` is async and runs the entire 11-phase orchestrator. It can take seconds to minutes.

**Decision:** The POST route awaits `provisionSession` and returns the result. This is the simplest correct approach. The caller (UI or CLI) gets the session outcome in the response. If the session takes too long, the HTTP connection stays open -- this is acceptable for dev/desktop mode where there's one user and one server. A queue-based approach (return 202, poll for result) is out of scope for R1.

**Risk:** Long-running HTTP requests. Mitigated by: (a) desktop mode has no proxy timeouts, (b) the caller is the HyperIdle UI which can handle long responses, (c) a future workpackage can add queue-based dispatch.

### D5: POST response shape change

Current POST returns the session DB row (201). After wiring, it returns `ProvisionSessionResult` with `{ sessionId, outcome, totalCostCents, taskId }`.

**Decision:** Return the full session row (re-queried after provisioning completes) plus the outcome. This preserves the existing response shape (callers expect a session object) while adding outcome information. Status code changes from 201 to 200 for completed sessions, since the session lifecycle is complete by the time we respond.

## Acceptance criteria with verification

### AC1: Adapter instantiation in createApp/createServer
**Criterion:** `ClaudeAgentSdkAdapter` and `LocalWorkspaceAdapter` are instantiated during server startup.
**Verification:** Integration test that calls `createServer(0)`, verifies the server starts without error, and hits POST /api/sessions (adapter existence is proven by the route not crashing with "no adapter").

### AC2: POST /api/sessions calls provisionSession
**Criterion:** POST /api/sessions invokes `provisionSession()` instead of bare DB insert.
**Verification:** Integration test creates required domain data (product, team, bet, agent, task in `accepted` state), POSTs to /api/sessions with a mock harness, asserts: (a) session row exists with state=done, (b) task transitioned to in_progress, (c) session_started and session_ended events emitted.

### AC3: End-to-end session execution
**Criterion:** Agent session runs end-to-end: provisions workspace, materializes knowledge, executes via harness, streams events, ends cleanly.
**Verification:** Covered by existing `session-provisioning.test.ts` AC1 test. No new test needed -- the existing test already proves this works when adapters are provided. The R1 test proves the route wiring calls into this orchestrator.

### AC4: State transitions
**Criterion:** Session state transitions correctly: active -> done (success) or active -> crashed (error).
**Verification:** Covered by existing tests (AC1, AC3 in session-provisioning.test.ts). R1 route-level test verifies the POST response includes the correct final state.

### AC5: Cost and token tracking
**Criterion:** Cost and token usage from the harness adapter flow through the strategy layer.
**Verification:** Covered by existing session-provisioning.test.ts AC7 and C7 integration tests. `provisionSession` already calls `recordCostAndCheck` during Phase 10. No new test needed for the wiring workpackage -- cost tracking is not route-level, it is orchestrator-level.

### AC6: Credential resolution
**Criterion:** ANTHROPIC_API_KEY is resolved from process.env (covering both dev mode and desktop mode where safeStorage sets env vars).
**Verification:** (a) Test: POST /api/sessions with `ANTHROPIC_API_KEY` unset returns 500 with `MissingCredentialError` message (not an unhandled crash). (b) Test: POST /api/sessions with `ANTHROPIC_API_KEY` set (and mock harness) succeeds.

**AMENDED (critique CRITICAL-1):** `MissingCredentialError` from `harness.startSession()` is caught by provisionSession's bare catch (L315) and converted to `crashed=true` — it never propagates to the route. Fix: add an early credential pre-flight check in the route handler BEFORE calling `provisionSession`. Use `credentialResolver.resolve("anthropic_api_key")` — if null, return 500 with `MissingCredentialError` immediately. This avoids entering the 11-phase orchestrator at all when credentials are missing.

### AC7: Missing credential error handling
**Criterion:** When no API key is configured, POST /api/sessions fails with a clear error.
**Verification:** Integration test: unset ANTHROPIC_API_KEY, POST to /api/sessions, assert 500 with error about missing credential. No session row should be created (the pre-flight rejects before provisionSession is called).

## Ordered task list

### Task 1: Extend AppOptions with adapter fields

**File:** `packages/server/src/app.ts`

**Changes:**
- Add to `AppOptions` interface:
  ```typescript
  /** Harness adapter for agent sessions. When provided, POST /api/sessions
   * calls provisionSession() instead of a bare DB insert. */
  harnessAdapter?: HarnessAdapter;
  /** Workspace adapter for agent sessions. Required when harnessAdapter is set. */
  workspaceAdapter?: WorkspaceAdapter;
  /** Base directory for workspace creation. */
  workspaceBasePath?: string;
  /** Credential resolver for API key pre-flight check. */
  credentialResolver?: CredentialResolver;
  ```
- Update `createSessionRoutes` call at L287 to pass the new deps:
  ```typescript
  api.route("/sessions", createSessionRoutes(options.db, eventBus, activityBuffer, {
    harnessAdapter: options.harnessAdapter,
    workspaceAdapter: options.workspaceAdapter,
    workspaceBasePath: options.workspaceBasePath,
    credentialResolver: options.credentialResolver,
  }));
  ```
- Add imports for `HarnessAdapter` from `@hyperidle/shared`, `WorkspaceAdapter` from `../harness/workspace-adapter.js`.

**Test:** `npm run check` passes (type-only change, backward-compatible -- all fields optional).

**Dependencies:** None.

### Task 2: Update createSessionRoutes to call provisionSession

**File:** `packages/server/src/routes/sessions-routes.ts`

**Changes:**
- Update `createSessionRoutes` signature to accept adapter deps:
  ```typescript
  interface SessionRouteDeps {
    readonly harnessAdapter?: HarnessAdapter;
    readonly workspaceAdapter?: WorkspaceAdapter;
    readonly workspaceBasePath?: string;
    readonly credentialResolver?: CredentialResolver;
  }

  export function createSessionRoutes(
    db: HyperIdleDb,
    eventBus: EventBus,
    activityBuffer?: SessionActivityBuffer,
    deps?: SessionRouteDeps,
  ): Hono
  ```
- Replace the POST handler body (L72-98). New logic:
  1. Parse body (same `createSessionSchema` -- agentId, taskId, modelTier).
  2. If `deps?.harnessAdapter` and `deps?.workspaceAdapter` are present:
     a. **Credential pre-flight (CRITICAL-1 fix):** Call `deps.credentialResolver?.resolve("anthropic_api_key")`. If null, return 500 with `{ error: "Missing ANTHROPIC_API_KEY credential", code: "MISSING_CREDENTIAL" }` immediately. This prevents entering the 11-phase orchestrator when credentials are missing.
     b. Look up task row to get `productId`.
     c. Build `ProvisionSessionDeps` from injected adapters.
     d. Build `ProvisionSessionParams` from body + task lookup.
     e. Call `await provisionSession(provisionDeps, params)`.
     f. Query the completed session row and return it.
     g. Catch `CostCapExceededError` -> 422 with cap info.
     h. Catch `ConcurrencyLimitError` -> 429 with limit info.
     i. Catch other errors -> 500 with generic message.
  3. If adapters are NOT present (test/kernel-only mode): fall back to bare DB insert (existing behavior).

- Add `productId` to `createSessionSchema` as optional. When omitted, look up from task row. When provided, use directly.

**Test:** See AC2, AC6, AC7 tests.

**Dependencies:** Task 1.

### Task 3: Wire adapters in createServer

**File:** `packages/server/src/server-factory.ts`

**Changes:**
- Import `ClaudeAgentSdkAdapter`, `LocalWorkspaceAdapter`, `EnvCredentialResolver`.
- Before the `createApp` call, instantiate:
  ```typescript
  const credentialResolver = new EnvCredentialResolver();
  const harnessAdapter = new ClaudeAgentSdkAdapter({ credentialResolver });
  const workspaceAdapter = new LocalWorkspaceAdapter();
  const workspaceBasePath = process.env.HYPERIDLE_WORKSPACES_DIR
    ?? path.join(os.tmpdir(), 'hyperidle-workspaces');
  ```
- Pass to `createApp`:
  ```typescript
  const app = createApp({
    db,
    eventBus,
    strategyBootstrap: bootstrapFabric,
    harnessAdapter,
    workspaceAdapter,
    workspaceBasePath,
    registerWebSocket: (apiRouter, tokenStore) => { ... },
  });
  ```

- **Guard:** `LocalWorkspaceAdapter` constructor already throws in `NODE_ENV=production`. No additional check needed.

**Test:** Existing `server-factory.integration.test.ts` should still pass (it tests server startup). New test: start server with `ANTHROPIC_API_KEY` unset, POST to sessions, verify clear error.

**Dependencies:** Task 1.

### Task 4: Write R1-specific integration tests

**File:** `packages/server/src/__tests__/R1-wire-agent-execution.test.ts`

**Tests to write:**

1. **POST /api/sessions calls provisionSession and returns completed session** (AC2, AC3, AC4)
   - Seed: product, team, bet, agent, task (state=accepted), knowledge item.
   - Create app with `harnessAdapter` (ScriptedHarnessAdapter from session-provisioning.test.ts pattern), `workspaceAdapter` (LocalWorkspaceAdapter), `workspaceBasePath` (tmpdir).
   - POST /api/sessions with { agentId, taskId, modelTier: "workhorse" }.
   - Assert: 200, response body has sessionId, state=done, outcome=completed.
   - Assert: task state transitioned to in_progress.
   - Assert: session_started and session_ended events emitted.

2. **POST /api/sessions with missing credential returns clear error** (AC6, AC7)
   - Create app with `credentialResolver` that returns null for "anthropic_api_key" (or use `EnvCredentialResolver` with `ANTHROPIC_API_KEY` unset).
   - POST /api/sessions.
   - Assert: 500, response body has `code: "MISSING_CREDENTIAL"`, error about missing API key.
   - Assert: no session row created (pre-flight rejects before provisionSession is called).

3. **POST /api/sessions with crashed harness returns crashed session** (AC4)
   - Use ScriptedHarnessAdapter with `throwAfter: 1`.
   - POST /api/sessions.
   - Assert: 200, response body has state=crashed, outcome=crashed.
   - Assert: workspace preserved (not deleted).

4. **POST /api/sessions without adapters falls back to bare insert** (backward compat)
   - Create app WITHOUT harnessAdapter/workspaceAdapter.
   - POST /api/sessions.
   - Assert: 201, bare session row created (existing behavior).

5. **POST /api/sessions with CostCapExceededError returns 422** (error handling)
   - Seed agent with costCap=0.
   - POST /api/sessions.
   - Assert: 422, error about cost cap.

6. **POST /api/sessions with ConcurrencyLimitError returns 429** (error handling)
   - Seed agent with maxConcurrentSessions=0.
   - POST /api/sessions.
   - Assert: 429, error about concurrency limit.

**Dependencies:** Tasks 1, 2.

### Task 5: Verify existing tests still pass

**Action:** Run `npm run verify` (check + lint + test). All existing tests must pass unchanged.

**Dependencies:** Tasks 1, 2, 3, 4.

## Type signatures

### AppOptions additions (app.ts)

```typescript
interface AppOptions {
  // ... existing fields ...
  /** Harness adapter for agent sessions. Enables provisionSession in POST /api/sessions. */
  harnessAdapter?: HarnessAdapter;
  /** Workspace adapter for agent sessions. Required when harnessAdapter is set. */
  workspaceAdapter?: WorkspaceAdapter;
  /** Base directory for agent workspace creation. Default: os.tmpdir()/hyperidle-workspaces. */
  workspaceBasePath?: string;
}
```

### SessionRouteDeps (sessions-routes.ts)

```typescript
interface SessionRouteDeps {
  readonly harnessAdapter?: HarnessAdapter;
  readonly workspaceAdapter?: WorkspaceAdapter;
  readonly workspaceBasePath?: string;
  readonly credentialResolver?: CredentialResolver;
}
```

### Updated createSessionRoutes signature

```typescript
export function createSessionRoutes(
  db: HyperIdleDb,
  eventBus: EventBus,
  activityBuffer?: SessionActivityBuffer,
  deps?: SessionRouteDeps,
): Hono
```

## Error handling in POST route

| Error type | HTTP status | Response shape |
|---|---|---|
| Missing credential (pre-flight) | 500 | `{ error: "Missing ANTHROPIC_API_KEY credential", code: "MISSING_CREDENTIAL" }` |
| `CostCapExceededError` | 422 | `{ error: "...", code: "COST_CAP_EXCEEDED" }` |
| `ConcurrencyLimitError` | 429 | `{ error: "...", code: "CONCURRENCY_LIMIT" }` |
| Task not found | 404 | `{ error: "Task not found", code: "NOT_FOUND" }` |
| Other errors | 500 | `{ error: "Session provisioning failed", code: "INTERNAL_ERROR" }` |

## Security and abuse cases

| Concern | Applicable? | Resolution |
|---|---|---|
| Rate limiting on POST /api/sessions | Yes | Already covered by the global rate limiter in createApp (60 req/min). Session creation is expensive (spawns a Claude API call), so the global limiter is sufficient. No dedicated limiter needed. |
| Input trust boundary | Yes | `agentId` and `taskId` are validated against the DB (provisionSession Phase 1 looks up the agent, Phase 3 checks task). Invalid IDs cause a clear error, not a crash. |
| Secret handling | Yes | `ANTHROPIC_API_KEY` resolved through `CredentialResolver`, never logged. The adapter already sanitizes env vars (ALLOWED_ENV_KEYS allowlist). |
| Path traversal | Yes | Already handled by `validateSoulPromptPath` in provisionSession (Phase 1). workspaceBasePath is operator-controlled (env var), not user input. |
| SSRF | N/A | No outbound URLs from user input. The Claude API call goes to api.anthropic.com (hardcoded in the SDK). |
| Long-running request DoS | Yes, but mitigated | Rate limiter caps concurrent requests. Each session is a single HTTP connection. In dev/desktop mode with one user, this is acceptable. |

## Protected tests

These test files must not have their assertions modified:

```
protectedTests:
  - packages/server/src/__tests__/session-provisioning.test.ts
  - packages/server/src/__tests__/session-provisioning.integration.test.ts
  - packages/server/src/__tests__/sessions.test.ts
  - packages/server/src/__tests__/session-lifecycle.test.ts
  - packages/server/src/__tests__/server-factory.integration.test.ts
  - packages/server/src/harness/__tests__/claude-agent-sdk-adapter.test.ts
  - packages/server/src/harness/__tests__/local-workspace-adapter.security.test.ts
  - packages/server/src/harness/__tests__/workspace-adapter.test.ts
  - packages/server/src/services/__tests__/credential-resolver.test.ts
```

## Migrations

No database migrations required. No schema changes.

The `sessions-routes.ts` `createSessionRoutes` function signature changes (adds optional 4th parameter). All call sites:
- `packages/server/src/app.ts` L287 -- update to pass deps.
- No other direct callers (tests use `createTestApp` which goes through `createApp`).

## Risks

1. **Existing sessions.test.ts tests create apps without adapters.** The fallback path (bare DB insert when no adapters) ensures these tests continue to work unchanged. This is explicitly tested in Task 4 test 4.

2. **Long HTTP request timeout.** In dev mode with a real Claude API call, `provisionSession` may take 30-120 seconds. The HTTP connection stays open. This is acceptable for desktop/dev but would need a queue in production. Documented as out of scope.

3. **`LocalWorkspaceAdapter` + `NODE_ENV=production` guard.** If someone accidentally sets `NODE_ENV=production` in dev, the adapter constructor throws at server startup. This is the correct behavior (fail fast) but may surprise developers. Documented in the workspace adapter's `@lore` comment.

## File change summary

| File | Change type | Description |
|---|---|---|
| `packages/server/src/app.ts` | Modify | Add adapter fields to `AppOptions`, pass to `createSessionRoutes` |
| `packages/server/src/routes/sessions-routes.ts` | Modify | Accept adapter deps, replace POST handler with `provisionSession` call |
| `packages/server/src/server-factory.ts` | Modify | Instantiate adapters and credential resolver, pass to `createApp` |
| `packages/server/src/__tests__/R1-wire-agent-execution.test.ts` | Create | Integration tests for the wiring |
