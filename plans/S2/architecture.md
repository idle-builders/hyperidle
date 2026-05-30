# S2 — Remote Execution via HarnessAdapter: Architecture

**Status:** Plan
**Concept:** `plans/S2/concept.md` (verified, no new primitives)
**Parent concept:** `plans/shared-server/concept.md` (locked)

---

## Required reading

The builder must read before implementing:

- `plans/S2/concept.md` -- concept verification, noun classification, worker_token gap
- `plans/work-packages/TRACK-S.md` -- S2 acceptance criteria (lines 62-117)
- `packages/shared/src/harness/harness-adapter.ts` -- HarnessAdapter interface (unchanged)
- `packages/shared/src/harness/harness-events.ts` -- HarnessEvent discriminated union
- `packages/shared/src/harness/mock-harness-adapter.ts` -- reference for test patterns
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` -- reference implementation
- `packages/server/src/services/session-provisioning.ts` -- 11-phase orchestration
- `packages/server/src/services/session-lifecycle.ts` -- createSession, endSession, crashSession
- `packages/server/src/routes/ws.ts` -- user WebSocket pattern (auth, upgrade, lifecycle)
- `packages/server/src/services/ws-broadcaster.ts` -- WsClient interface pattern
- `packages/server/src/server-factory.ts` -- where adapters are instantiated
- `packages/server/src/app.ts` -- AppOptions, dependency injection
- `packages/server/src/routes/sessions-routes.ts` -- session creation route, SessionRouteDeps
- `packages/server/src/middleware/auth.ts` -- auth middleware pattern
- `packages/shared/src/credential.ts` -- CREDENTIAL_NAMES catalog
- `packages/server/src/validate-env.ts` -- startup env validation

---

## Plan reconciliation (spec vs reality)

| Spec assumption | Reality | Resolution |
|---|---|---|
| `ProvisionSessionDeps.harness` is a single `HarnessAdapter` | Confirmed: `session-provisioning.ts:123` | Replace with `AdapterPool` or pool-aware selector |
| `HarnessAdapter` interface unchanged | Confirmed: 4 methods, no changes needed | N/A |
| `worker_token` added to P3 credential catalog | `CREDENTIAL_NAMES` is closed set of 3 | Use env var `HYPERIDLE_WORKER_TOKEN` (see concept doc gap analysis) |
| Worker WebSocket at `/api/ws/worker` | No worker WS route exists | New route file needed |
| `GET /api/workers` admin endpoint | No workers route exists | New route file needed |
| `AppOptions.harnessAdapter` is single adapter | Confirmed: `app.ts:118` | Change to `adapterPool: AdapterPool` |
| `SessionRouteDeps.harnessAdapter` is single adapter | Confirmed: `sessions-routes.ts:47` | Change to use pool selection |
| Server self-registers local adapter | `server-factory.ts:111` creates one `ClaudeAgentSdkAdapter` | Wrap in pool registration |
| Process isolation via child process | `ClaudeAgentSdkAdapter` runs SDK in-process | New `IsolatedHarnessAdapter` wrapper |
| `HYPERIDLE_SESSION_MAX_MEMORY_MB` / `HYPERIDLE_SESSION_MAX_DURATION_MS` env vars | Do not exist | Add to `validate-env.ts` (optional) |
| `HarnessCapabilities` has model providers | Currently: `{ preCompactionTrigger: boolean, subAgents: boolean }` | Extend with `modelProviders: readonly string[]` |

---

## Design decisions

### Decision 1: AdapterPool as a new service, not a composite HarnessAdapter

**Why not a composite adapter?** A composite `HarnessAdapter` that internally selects from pool members would need to know capacity and model providers -- information not in the `HarnessAdapter` interface. Adding it would change the interface (violating the S2 constraint "HarnessAdapter interface unchanged"). Instead, the pool is a separate service that selects an adapter and returns it.

**Shape:** `AdapterPool` is a class that:
- Maintains a `Map<string, AdapterEntry>` of registered adapters
- Exposes `select(requirements: AdapterRequirements): HarnessAdapter | null`
- Exposes `register(id: string, adapter: HarnessAdapter, meta: AdapterMeta): void`
- Exposes `unregister(id: string): void`
- Exposes `list(): readonly AdapterInfo[]` (for admin endpoint)

### Decision 2: worker_token as env var, not credential catalog

`HYPERIDLE_WORKER_TOKEN` is an env var validated on worker WebSocket upgrade. Rationale: it is server-side infrastructure auth (like `HYPERIDLE_API_KEY`), not an external service API key. The credential catalog stays at 3 entries. Workers present this token as a query parameter on the WebSocket upgrade URL: `/api/ws/worker?token=<worker_token>`.

### Decision 3: IsolatedHarnessAdapter for process isolation

A new `IsolatedHarnessAdapter` wraps a harness adapter execution in a `child_process.fork()`. The server-factory in VPS/cloud mode wraps the local `ClaudeAgentSdkAdapter` in `IsolatedHarnessAdapter`. Desktop mode uses `ClaudeAgentSdkAdapter` directly (no isolation overhead for single-user).

**Why fork, not spawn?** `fork()` creates a Node.js child process with an IPC channel. The child runs a worker script that instantiates `ClaudeAgentSdkAdapter`, starts the session, and streams events back over IPC. This gives us:
- Memory isolation (OS-level process boundary)
- Duration limits (timer-based kill)
- Env allowlist (child gets only allowed vars)
- Clean kill on timeout (SIGKILL)

**Scope reduction:** Process isolation is the most complex AC and has the highest risk of scope creep. For the initial implementation, I recommend a phased approach:
- **Phase 1 (this workpackage):** `IsolatedHarnessAdapter` uses `child_process.fork()` with a worker script. Memory limit via `--max-old-space-size`. Duration limit via `setTimeout` + `process.kill`. Env allowlist inherits from existing `ALLOWED_ENV_KEYS`.
- **Deferred:** Container isolation (Docker), cgroup limits, seccomp profiles.

### Decision 4: HarnessCapabilities extension

`HarnessCapabilities` in `packages/shared/src/harness/harness-adapter.ts` gains one new field:

```typescript
export interface HarnessCapabilities {
  readonly preCompactionTrigger: boolean;
  readonly subAgents: boolean;
  readonly modelProviders: readonly string[];  // NEW: e.g. ["anthropic"]
}
```

This is additive (new optional-ish field). Existing implementations return `modelProviders: ["anthropic"]`. The pool uses this for capability matching.

**Note:** The S2 constraint says "HarnessAdapter interface unchanged. No new methods, no new event types." Adding a field to `HarnessCapabilities` (a return type, not the interface itself) is within bounds -- no new methods, no new event types. The interface's four methods remain unchanged.

### Decision 5: Worker WebSocket is a raw WebSocket connection, not Hono

The worker WebSocket connection is raw: workers are external processes, not browser clients. The server uses the same `@hono/node-server` + `ws.WebSocketServer` infrastructure but registers on a separate path. Auth is a constant-time comparison of the query-param token against `HYPERIDLE_WORKER_TOKEN`.

---

## Type signatures

### Wire protocol types (new file: `packages/shared/src/harness/worker-protocol.ts`)

```typescript
/** Messages FROM worker TO server. */
export interface WorkerRegisterMessage {
  readonly type: "register";
  readonly id: string;
  readonly name: string;
  readonly modelProviders: readonly string[];
  readonly maxConcurrent: number;
}

export interface WorkerEventMessage {
  readonly type: "event";
  readonly sessionId: string;
  readonly event: HarnessEvent;
}

export interface WorkerSessionResultMessage {
  readonly type: "session_result";
  readonly sessionId: string;
  readonly result: SessionResult;
}

export interface WorkerErrorMessage {
  readonly type: "error";
  readonly sessionId: string;
  readonly message: string;
}

export type WorkerToServerMessage =
  | WorkerRegisterMessage
  | WorkerEventMessage
  | WorkerSessionResultMessage
  | WorkerErrorMessage;

/** Messages FROM server TO worker. */
export interface ServerDispatchMessage {
  readonly type: "dispatch";
  readonly sessionId: string;
  readonly config: SessionConfig;
}

export interface ServerStopMessage {
  readonly type: "stop";
  readonly sessionId: string;
}

export type ServerToWorkerMessage =
  | ServerDispatchMessage
  | ServerStopMessage;
```

### AdapterPool types (new file: `packages/server/src/harness/adapter-pool.ts`)

```typescript
export interface AdapterMeta {
  readonly name: string;
  readonly kind: "local" | "remote";
  readonly modelProviders: readonly string[];
  readonly maxConcurrent: number;
}

export interface AdapterEntry {
  readonly adapter: HarnessAdapter;
  readonly meta: AdapterMeta;
  activeSessions: number;
}

export interface AdapterInfo {
  readonly id: string;
  readonly name: string;
  readonly kind: "local" | "remote";
  readonly modelProviders: readonly string[];
  readonly currentLoad: number;
  readonly maxConcurrent: number;
  readonly connectedSince: string;
}

export interface AdapterRequirements {
  readonly modelProviders?: readonly string[];
}

export class AdapterPool {
  private readonly adapters = new Map<string, AdapterEntry>();

  register(id: string, adapter: HarnessAdapter, meta: AdapterMeta): void;
  unregister(id: string): void;

  /**
   * Select the least-loaded adapter matching requirements.
   * Returns null if all adapters are at capacity or none match.
   */
  select(requirements?: AdapterRequirements): AdapterEntry | null;

  /** Release a session slot on the given adapter. */
  release(id: string): void;

  /** List all adapters (for admin endpoint). */
  list(): readonly AdapterInfo[];

  get size(): number;
}
```

### RemoteHarnessAdapter (new file: `packages/server/src/harness/remote-harness-adapter.ts`)

```typescript
export class RemoteHarnessAdapter implements HarnessAdapter {
  constructor(
    private readonly ws: WebSocket,
    private readonly workerMeta: WorkerRegisterMessage,
  );

  async startSession(config: SessionConfig): Promise<SessionHandle>;
  async *streamEvents(handle: SessionHandle): AsyncGenerator<HarnessEvent>;
  async stopSession(handle: SessionHandle): Promise<SessionResult>;
  getCapabilities(): HarnessCapabilities;
}
```

Internally:
- `startSession` sends a `ServerDispatchMessage` and waits for acknowledgment.
- `streamEvents` creates an `AsyncGenerator` that reads from an internal event queue populated by WebSocket messages. Uses a promise-based queue pattern (resolve/reject linked list).
- `stopSession` sends a `ServerStopMessage` and waits for a `WorkerSessionResultMessage`.
- `getCapabilities` returns capabilities derived from the worker's registration message.

### IsolatedHarnessAdapter (new file: `packages/server/src/harness/isolated-harness-adapter.ts`)

```typescript
export interface IsolationConfig {
  readonly maxMemoryMb: number;   // default 2048
  readonly maxDurationMs: number; // default 3600000 (1 hour)
  readonly envAllowlist: readonly string[];
}

export class IsolatedHarnessAdapter implements HarnessAdapter {
  constructor(
    private readonly credentialResolver: CredentialResolver,
    private readonly isolationConfig: IsolationConfig,
  );

  async startSession(config: SessionConfig): Promise<SessionHandle>;
  async *streamEvents(handle: SessionHandle): AsyncGenerator<HarnessEvent>;
  async stopSession(handle: SessionHandle): Promise<SessionResult>;
  getCapabilities(): HarnessCapabilities;
}
```

Internally:
- `startSession` calls `child_process.fork()` with a worker script (`isolated-session-worker.ts`), passing `SessionConfig` via IPC. The child process instantiates `ClaudeAgentSdkAdapter` and runs the session. V8 `--max-old-space-size` flag enforces memory limit.
- `streamEvents` reads `HarnessEvent` messages from the IPC channel, yielded as an async generator.
- `stopSession` sends a stop signal via IPC. If the child doesn't exit within 5s, `SIGKILL`.
- A `setTimeout` enforces `maxDurationMs`. On timeout, the child is killed and the session result is `{ outcome: "crashed" }`.

### Worker script (new file: `packages/server/src/harness/isolated-session-worker.ts`)

```typescript
// Runs in a child process. Receives SessionConfig via IPC.
// Instantiates ClaudeAgentSdkAdapter, runs the session, streams events back via IPC.
// Exits when the session completes or when killed.
```

### Worker WebSocket route (new file: `packages/server/src/routes/worker-ws.ts`)

```typescript
export function registerWorkerWsRoute(
  apiApp: Hono,
  adapterPool: AdapterPool,
  upgradeWebSocket: UpgradeWebSocket,
): () => void;
```

### Workers admin route (new file: `packages/server/src/routes/workers.ts`)

```typescript
export function createWorkersRoutes(adapterPool: AdapterPool): Hono;
// GET / -- returns AdapterInfo[] from pool.list()
```

---

## Endpoint shapes

### `GET /api/workers` (admin-only)

**Auth:** `X-API-Key` (existing admin key auth).

**Response 200:**
```json
[
  {
    "id": "local",
    "name": "server",
    "kind": "local",
    "modelProviders": ["anthropic"],
    "currentLoad": 1,
    "maxConcurrent": 4,
    "connectedSince": "2026-05-29T10:00:00.000Z"
  },
  {
    "id": "worker-abc123",
    "name": "tg-macbook",
    "kind": "remote",
    "modelProviders": ["anthropic"],
    "currentLoad": 0,
    "maxConcurrent": 2,
    "connectedSince": "2026-05-29T10:05:00.000Z"
  }
]
```

### `WS /api/ws/worker?token=<worker_token>` (worker connection)

**Auth:** Query param `token` compared against `HYPERIDLE_WORKER_TOKEN` env var using constant-time comparison.

**Connection lifecycle:**
1. Worker connects, auth validated on upgrade.
2. Worker sends `WorkerRegisterMessage`.
3. Server creates `RemoteHarnessAdapter`, registers in pool.
4. Server sends `{ type: "registered" }` ack.
5. Server may send `ServerDispatchMessage` / `ServerStopMessage`.
6. Worker sends `WorkerEventMessage` / `WorkerSessionResultMessage`.
7. On WebSocket close: unregister adapter, crash any running sessions.

---

## File plan

### New files

| File | Purpose |
|---|---|
| `packages/shared/src/harness/worker-protocol.ts` | Wire protocol type definitions |
| `packages/server/src/harness/adapter-pool.ts` | AdapterPool class |
| `packages/server/src/harness/remote-harness-adapter.ts` | RemoteHarnessAdapter class |
| `packages/server/src/harness/isolated-harness-adapter.ts` | IsolatedHarnessAdapter class |
| `packages/server/src/harness/isolated-session-worker.ts` | Child process worker script |
| `packages/server/src/routes/worker-ws.ts` | Worker WebSocket route |
| `packages/server/src/routes/workers.ts` | Workers admin endpoint |
| `packages/shared/src/harness/worker-protocol.test.ts` | Protocol type tests |
| `packages/server/src/harness/__tests__/adapter-pool.test.ts` | Pool unit tests |
| `packages/server/src/harness/__tests__/remote-harness-adapter.test.ts` | Remote adapter tests |
| `packages/server/src/harness/__tests__/isolated-harness-adapter.test.ts` | Isolated adapter tests |
| `packages/server/src/routes/__tests__/worker-ws.test.ts` | Worker WS route tests |
| `packages/server/src/routes/__tests__/workers.test.ts` | Workers admin endpoint tests |
| `packages/server/src/__tests__/adapter-pool-integration.test.ts` | Integration test: pool + provisioning |

### Modified files

| File | Change |
|---|---|
| `packages/shared/src/harness/harness-adapter.ts` | Add `modelProviders` to `HarnessCapabilities` |
| `packages/shared/src/harness/index.ts` | Export worker-protocol types |
| `packages/server/src/harness/claude-agent-sdk-adapter.ts` | Return `modelProviders: ["anthropic"]` in `getCapabilities()` |
| `packages/shared/src/harness/mock-harness-adapter.ts` | Return `modelProviders: ["anthropic"]` in `getCapabilities()` |
| `packages/server/src/services/session-provisioning.ts` | Change `harness: HarnessAdapter` to `adapterPool: AdapterPool` in `ProvisionSessionDeps`, add pool selection + release logic |
| `packages/server/src/routes/sessions-routes.ts` | Change `SessionRouteDeps.harnessAdapter` to accept pool |
| `packages/server/src/app.ts` | Change `AppOptions.harnessAdapter` to `adapterPool: AdapterPool`, register worker WS route, register workers admin route |
| `packages/server/src/server-factory.ts` | Create `AdapterPool`, register local adapter, pass pool to `createApp` |
| `packages/server/src/validate-env.ts` | Add optional `HYPERIDLE_WORKER_TOKEN`, `HYPERIDLE_SESSION_MAX_MEMORY_MB`, `HYPERIDLE_SESSION_MAX_DURATION_MS` |

---

## Acceptance criteria with verification

### AC1: RemoteHarnessAdapter implements HarnessAdapter

**Criteria:** A `RemoteHarnessAdapter` class implements `HarnessAdapter`. It delegates `startSession`, `streamEvents`, and `stopSession` to a connected worker over WebSocket. The adapter serializes `SessionConfig` and sends it as a dispatch message. The worker runs its own local adapter and streams `HarnessEvent`s back. Callers cannot distinguish remote from local execution.

**Verification:**
- Unit test: construct `RemoteHarnessAdapter` with a mock WebSocket. Call `startSession` -> assert `ServerDispatchMessage` sent. Call `streamEvents` -> inject `WorkerEventMessage`s on the mock -> assert matching `HarnessEvent` values yielded. Call `stopSession` -> inject `WorkerSessionResultMessage` -> assert matching `SessionResult` returned.
- Type check: `RemoteHarnessAdapter` satisfies `HarnessAdapter` at compile time (`npm run check`).
- Integration test: connect a mock worker WS client, dispatch a session, stream events back, verify the provisioning flow completes with correct outcome.

### AC2: Worker connection protocol

**Criteria:** Workers connect via `/api/ws/worker` (separate from user WebSocket). Auth via `worker_token` validated on WebSocket upgrade. Worker sends `{ type: "register", id, name, modelProviders, maxConcurrent }`. Server creates a `RemoteHarnessAdapter` backed by this connection. On WebSocket close: adapter removed, running sessions marked `crashed`. Liveness via WebSocket ping/pong.

**Verification:**
- Unit test: `registerWorkerWsRoute` accepts a WebSocket connection with valid token -> registers adapter in pool. Invalid token -> connection rejected (401 before upgrade).
- Unit test: worker disconnects -> adapter unregistered from pool.
- Unit test: worker disconnects with active session -> session receives error event, marked `crashed`.
- Integration test: connect two mock workers, verify both appear in pool. Disconnect one, verify it's removed and the other remains.

### AC3: Adapter pool with selection logic

**Criteria:** Session provisioning gains a pool of adapters: one local (always present), zero or more remote. Pick adapter with matching `modelProviders` and available capacity (`running < maxConcurrent`). Prefer least loaded. When all at capacity: fail with retriable error, task stays in current state.

**Verification:**
- Unit test: pool with 2 adapters, both available -> `select()` returns the one with fewer active sessions.
- Unit test: pool with 2 adapters, one at capacity -> `select()` returns the other.
- Unit test: pool with 2 adapters, both at capacity -> `select()` returns null.
- Unit test: pool with 2 adapters, one matching modelProviders requirement, one not -> `select()` returns the matching one.
- Unit test: `register` -> `list()` shows new entry. `unregister` -> `list()` omits it.
- Integration test: `provisionSession` with pool -> adapter selected, session runs, adapter slot released on completion.
- Integration test: all adapters at capacity -> `provisionSession` throws, task state unchanged.

### AC4: Server self-registration

**Criteria:** Server wraps its local `ClaudeAgentSdkAdapter` (or `IsolatedHarnessAdapter` in server mode) and registers it in the pool. Local desktop mode: pool has exactly one adapter.

**Verification:**
- Unit test: `server-factory.ts` creates pool, registers local adapter. `pool.list()` shows one entry with `kind: "local"`.
- Integration test: `GET /api/workers` returns array with at least one entry where `kind === "local"`.

### AC5: Admin visibility endpoint

**Criteria:** `GET /api/workers` lists connected workers: id, name, kind, modelProviders, currentLoad, maxConcurrent, connectedSince. Requires admin key.

**Verification:**
- Integration test: `GET /api/workers` with admin key -> 200, response shape matches `AdapterInfo[]`.
- Integration test: `GET /api/workers` without auth -> 401.
- Integration test: register two workers (one local, one mock remote) -> response contains both.

### AC6: Process isolation for server-side sessions

**Criteria:** Each session on the server's local adapter runs in a child process. Child inherits only `PATH`, `HOME`, `LANG`, and the resolved API key. Configurable limits: `HYPERIDLE_SESSION_MAX_MEMORY_MB` (default 2048), `HYPERIDLE_SESSION_MAX_DURATION_MS` (default 3600000). Exceeded = session `crashed`.

**Verification:**
- Unit test: `IsolatedHarnessAdapter.startSession` forks a child process. Verify child's env contains only allowlisted keys (spy on `child_process.fork` args).
- Unit test: mock child process that exceeds duration -> adapter returns `{ outcome: "crashed" }`.
- Unit test: mock child process that sends events -> adapter yields them as `HarnessEvent`.
- Unit test: `stopSession` sends stop signal to child, child exits -> returns `SessionResult`.
- Integration test: run a real (mock SDK) session through `IsolatedHarnessAdapter` -> events stream correctly, session completes.

### AC7: HarnessAdapter interface unchanged

**Criteria:** No new methods, no new event types on `HarnessAdapter`.

**Verification:**
- Static assertion: `HarnessAdapter` interface has exactly 4 methods: `startSession`, `streamEvents`, `stopSession`, `getCapabilities`. `npm run check` passes.
- `HarnessEvent` union has exactly 6 variants (unchanged): `token_usage`, `tool_call`, `completion`, `error`, `cost_update`, `pre_compaction`.

### AC8: Backward compatibility

**Criteria:** Local desktop mode behavior is identical to today. Pool has exactly one adapter. No login, no worker protocol.

**Verification:**
- Existing test suite passes without modification (protected tests -- see below).
- Integration test: session provisioning with pool containing only the local adapter -> same flow as current single-adapter path.

---

## Ordered task list

### Task 1: Wire protocol types
**Files:** `packages/shared/src/harness/worker-protocol.ts`, `packages/shared/src/harness/index.ts`
**Test:** `packages/shared/src/harness/__tests__/worker-protocol.test.ts` -- type narrowing tests for discriminated unions
**Dependencies:** None
**AC:** Foundation for AC1, AC2

### Task 2: Extend HarnessCapabilities
**Files:** `packages/shared/src/harness/harness-adapter.ts`, `packages/server/src/harness/claude-agent-sdk-adapter.ts`, `packages/shared/src/harness/mock-harness-adapter.ts`
**Test:** Existing tests pass; `npm run check` passes
**Dependencies:** None
**AC:** AC7 (additive change, interface methods unchanged)

### Task 3: AdapterPool
**Files:** `packages/server/src/harness/adapter-pool.ts`
**Test:** `packages/server/src/harness/__tests__/adapter-pool.test.ts`
**Dependencies:** Task 2 (needs `HarnessCapabilities.modelProviders`)
**AC:** AC3

### Task 4: RemoteHarnessAdapter
**Files:** `packages/server/src/harness/remote-harness-adapter.ts`
**Test:** `packages/server/src/harness/__tests__/remote-harness-adapter.test.ts`
**Dependencies:** Task 1 (wire protocol types), Task 2 (capabilities)
**AC:** AC1

### Task 5: Worker WebSocket route
**Files:** `packages/server/src/routes/worker-ws.ts`
**Test:** `packages/server/src/routes/__tests__/worker-ws.test.ts`
**Dependencies:** Task 3 (pool), Task 4 (remote adapter)
**AC:** AC2

### Task 6: Workers admin route
**Files:** `packages/server/src/routes/workers.ts`
**Test:** `packages/server/src/routes/__tests__/workers.test.ts`
**Dependencies:** Task 3 (pool)
**AC:** AC5

### Task 7: IsolatedHarnessAdapter + worker script
**Files:** `packages/server/src/harness/isolated-harness-adapter.ts`, `packages/server/src/harness/isolated-session-worker.ts`
**Test:** `packages/server/src/harness/__tests__/isolated-harness-adapter.test.ts`
**Dependencies:** Task 2 (capabilities)
**AC:** AC6

### Task 8: Session provisioning integration
**Files:** `packages/server/src/services/session-provisioning.ts`, `packages/server/src/routes/sessions-routes.ts`
**Test:** `packages/server/src/__tests__/adapter-pool-integration.test.ts`
**Dependencies:** Task 3 (pool)
**AC:** AC3 (selection in provisioning), AC8 (backward compat)

### Task 9: Server factory wiring
**Files:** `packages/server/src/server-factory.ts`, `packages/server/src/app.ts`, `packages/server/src/validate-env.ts`
**Test:** Existing integration tests pass; new assertions for pool presence
**Dependencies:** Task 3, Task 5, Task 6, Task 7, Task 8
**AC:** AC4 (self-registration), AC8 (backward compat)

### Task 10: End-to-end integration test
**Files:** `packages/server/src/__tests__/remote-worker-e2e.integration.test.ts`
**Test:** Full flow: server starts -> local adapter registered -> mock remote worker connects -> session dispatched -> events stream -> session completes
**Dependencies:** Task 9
**AC:** All ACs

---

## Design-it-twice: AdapterPool selection algorithm

### Option A: Simple least-loaded with filter

```typescript
select(requirements?: AdapterRequirements): AdapterEntry | null {
  let best: { id: string; entry: AdapterEntry } | null = null;
  for (const [id, entry] of this.adapters) {
    if (entry.activeSessions >= entry.meta.maxConcurrent) continue;
    if (requirements?.modelProviders) {
      const has = requirements.modelProviders.every(
        p => entry.meta.modelProviders.includes(p)
      );
      if (!has) continue;
    }
    if (!best || entry.activeSessions < best.entry.activeSessions) {
      best = { id, entry };
    }
  }
  if (best) {
    best.entry.activeSessions++;
    return best.entry;
  }
  return null;
}
```

**Trade-off:** O(n) scan over adapters on every session start. For N < 100, this is microseconds. No data structure overhead.
**Risk:** Starvation of high-capacity adapters when a low-capacity adapter is always "least loaded" (e.g., max=1 at 0 vs max=10 at 1). But absolute count is the right metric here -- we want to use the least busy machine, not the one with the most spare capacity.

### Option B: Weighted selection by spare capacity ratio

```typescript
// Score = (maxConcurrent - activeSessions) / maxConcurrent
// Pick highest score (most spare capacity proportionally)
```

**Trade-off:** More balanced distribution across heterogeneous workers. But adds complexity with no clear benefit for teams of 2-10 with 1-3 workers.
**Risk:** Over-engineering for the expected scale.

### Decision: Option A.

Rationale: At the expected scale (1-3 workers, teams of 2-10), the difference is negligible. Option A is simpler, easier to test, easier to reason about. If load imbalance becomes observable, switching to weighted selection is a one-function change.

---

## Design-it-twice: RemoteHarnessAdapter event streaming

### Option A: Promise-based async queue

`streamEvents` creates a linked list of pending promises. WebSocket `onmessage` resolves them. The generator awaits each promise in sequence. On close/error, rejects the current pending promise.

```typescript
async *streamEvents(handle: SessionHandle): AsyncGenerator<HarnessEvent> {
  while (true) {
    const event = await this.eventQueues.get(handle.sessionId)!.dequeue();
    if (event === SENTINEL_DONE) return;
    yield event;
  }
}
```

**Trade-off:** Simple, no external dependencies. Well-understood pattern. But the queue can grow unbounded if the consumer is slow.
**Risk:** Backpressure. If `provisionSession` is slow to consume (e.g., tool registry invoke is blocking), events queue up in memory.

### Option B: Node.js Readable stream + async iteration

Use `stream.Readable` in object mode, push events from WebSocket handler, iterate with `for await`.

**Trade-off:** Built-in backpressure via highWaterMark. But adds stream API complexity and error handling surface.
**Risk:** Over-engineering. The stream API is more complex for no gain at expected scale.

### Decision: Option A with bounded queue.

Add a `maxQueueSize` (default 1000). If exceeded, drop oldest events and yield an error event. In practice, events arrive at ~1-10/sec; a 1000-item queue covers 100-1000s of backpressure. If this is ever hit, the real problem is downstream processing speed, not the queue.

---

## Security and abuse cases

| Concern | Status | Resolution |
|---|---|---|
| **Rate limiting on POST** | N/A | No new POST endpoints. `POST /api/sessions` already exists. |
| **Worker token auth** | Applicable | Constant-time comparison of `token` query param against `HYPERIDLE_WORKER_TOKEN`. Uses existing `constantTimeStringEqual` from `middleware/timing-safe.ts`. Rejected connections WARN-logged with source IP (never log the token). |
| **Input trust boundary (worker messages)** | Applicable | All `WorkerToServerMessage` fields are validated with Zod schemas before processing. Malformed JSON -> close connection. Unknown message types -> ignore. SessionId in worker messages must match a dispatched session -> reject otherwise. |
| **Secret handling** | Applicable | `HYPERIDLE_WORKER_TOKEN` treated like `HYPERIDLE_API_KEY`: never logged, never in responses, constant-time comparison. Worker credential resolution happens server-side; credentials never sent to remote workers. |
| **Path traversal** | N/A | `SessionConfig.workspacePath` is server-generated (not worker-provided). Worker receives `SessionConfig` from server. |
| **SSRF** | N/A | No outbound URLs. Workers connect inbound to the server. |
| **Env variable leakage to child process** | Applicable | `IsolatedHarnessAdapter` uses explicit allowlist (`PATH`, `HOME`, `LANG`, resolved API key). Inherits from existing `ALLOWED_ENV_KEYS` pattern in `claude-agent-sdk-adapter.ts`. |
| **Worker impersonation** | Applicable | Worker `id` in registration message is used as the pool key. If two workers send the same `id`, the second replaces the first. Resolution: server assigns the pool ID (UUID), ignores worker-provided `id` for keying. Worker `id` is metadata only. |
| **Denial of service via worker** | Applicable | A malicious worker could: (a) register then never execute sessions -> timeout catches this via `maxDurationMs`; (b) stream garbage events -> Zod validation rejects malformed events; (c) consume capacity without executing -> same as (a). |
| **Session hijacking via sessionId** | Applicable | Worker can only send events for sessions that were dispatched to it. Server tracks which sessions were dispatched to which worker. Events for unknown sessionIds are dropped. |

---

## Protected tests

Tests whose assertions must not change (existing behavior preserved):

```
protectedTests:
  - packages/server/src/harness/__tests__/claude-agent-sdk-adapter.test.ts
  - packages/server/src/harness/__tests__/claude-agent-sdk-adapter.security.test.ts
  - packages/server/src/harness/__tests__/workspace-adapter.test.ts
  - packages/server/src/services/__tests__/credential-resolver.test.ts
  - packages/server/src/__tests__/node-ws-e2e.integration.test.ts
```

These tests verify existing behavior that S2 must not break. The only allowed change to these files is adding `modelProviders` to `getCapabilities()` return values where `MockHarnessAdapter` is used.

---

## Migrations

### Symbol renames / moves

| Symbol | From | To | Affected files | Action |
|---|---|---|---|---|
| `ProvisionSessionDeps.harness` | `HarnessAdapter` | `adapterPool: AdapterPool` | `session-provisioning.ts`, `sessions-routes.ts` | Rename field, update all call sites |
| `AppOptions.harnessAdapter` | `HarnessAdapter \| undefined` | `adapterPool?: AdapterPool` | `app.ts`, `server-factory.ts`, integration test helpers | Rename field, update all call sites |
| `SessionRouteDeps.harnessAdapter` | `HarnessAdapter \| undefined` | `adapterPool?: AdapterPool` | `sessions-routes.ts` | Rename field |
| `HarnessCapabilities` | `{ preCompactionTrigger, subAgents }` | `+ modelProviders` | All HarnessAdapter implementations, all tests using `getCapabilities()` | Add field to all implementations |

Call site grep for `harnessAdapter`:
- `packages/server/src/app.ts` (line 118, 311)
- `packages/server/src/routes/sessions-routes.ts` (line 47, 107, 133)
- `packages/server/src/server-factory.ts` (line 111)
- `packages/server/src/__tests__/integration-helpers.ts` (likely)
- `packages/server/src/__tests__/server-factory.integration.test.ts` (likely)

---

## Risks and ambiguities

1. **IsolatedHarnessAdapter complexity.** Fork-based isolation is the highest-risk task. The child process must correctly instantiate the SDK, handle IPC serialization of `HarnessEvent` objects, and clean up on all exit paths. Mitigation: extensive unit tests with mock child processes, plus one real integration test.

2. **WebSocket upgrade in Hono.** The existing user WS route uses `@hono/node-server`'s `upgradeWebSocket`. The worker WS route needs the same pattern. Verified: `ws.ts` already demonstrates this pattern. The worker route can follow the same structure.

3. **AsyncGenerator lifetime management.** `RemoteHarnessAdapter.streamEvents` returns an `AsyncGenerator`. If the consumer stops reading (e.g., provisioning crashes), the generator must be cleaned up. The `return()` method on the generator should signal the internal queue to stop. This is a subtle edge case that needs a dedicated test.

4. **Clock skew on `connectedSince`.** The `connectedSince` timestamp is set by the server when the worker registers. No clock sync issue because it's server-local time.

5. **Backward compatibility of `ProvisionSessionDeps`.** Changing `harness` to `adapterPool` breaks all existing call sites. This is intentional and manageable -- the compiler catches every call site. But integration test helpers that construct `ProvisionSessionDeps` must be updated.

---

## Self-critique

1. **Is IsolatedHarnessAdapter in scope?** The S2 AC explicitly lists process isolation. It is in scope. But it is the most complex piece and could be split into a follow-up. The plan keeps it in scope but as the last implementation task (Task 7), so earlier tasks can be shipped independently if needed.

2. **Is the wire protocol over-specified?** No. The discriminated union types are the contract between server and worker. S4 (Desktop-as-Worker) will implement the worker side against these types. Under-specifying would force S4 to reverse-engineer the protocol.

3. **Is AdapterPool too simple?** For teams of 2-10 with 1-3 workers, yes, a Map with linear scan is sufficient. The architecture is correct at this scale. If scale changes, the pool is a single class with a clear interface -- easy to replace the internals.

4. **Does changing `ProvisionSessionDeps.harness` to `adapterPool` violate backward compatibility?** At the TypeScript level, yes -- it's a breaking change to the internal interface. At the behavior level, no -- local desktop mode still works identically (pool with one adapter). The compiler catches every call site. This is the right trade-off.

5. **Should `worker_token` be per-worker or shared?** The spec says "worker_token credential" (singular). My plan uses a single shared token. Per-worker tokens would require a registration/provisioning flow. For teams of 2-10, a single shared token is sufficient. Per-worker tokens can be added later if needed.
