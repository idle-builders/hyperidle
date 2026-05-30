# S4 -- Desktop-as-Worker: Architecture

**Status:** Plan
**Concept:** `plans/shared-server/concept.md` (locked, covers Desktop-as-Worker)
**Design:** No novel UI -- routine Settings toggle + status section. Skipped.

---

## Required reading

The builder must read before implementing:

- `plans/work-packages/TRACK-S.md` -- S4 acceptance criteria
- `plans/S2/architecture.md` -- the infrastructure S4 builds on (pool, worker WS, protocol)
- `packages/shared/src/harness/harness-adapter.ts` -- HarnessAdapter, SessionConfig, SessionResult
- `packages/shared/src/harness/harness-events.ts` -- HarnessEvent discriminated union
- `packages/shared/src/harness/worker-protocol.ts` -- Worker/Server message types
- `packages/server/src/harness/remote-harness-adapter.ts` -- server-side worker adapter (RemoteHarnessAdapter)
- `packages/server/src/harness/adapter-pool.ts` -- AdapterPool, AdapterMeta, AdapterInfo
- `packages/server/src/routes/worker-ws.ts` -- WorkerConnectionManager, token auth, WS lifecycle
- `packages/server/src/routes/workers.ts` -- GET /api/workers
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` -- local execution adapter, AdapterOptions
- `packages/desktop/src/main.ts` -- bootSharedMode(), bootLocalMode(), lifecycle
- `packages/desktop/src/client-config.ts` -- ClientConfig, loadClientConfig, saveClientConfig
- `packages/desktop/src/safe-credentials.ts` -- SafeCredentialsManager, credential IPC handlers
- `packages/desktop/src/preload.ts` -- contextBridge API
- `packages/web/src/window.d.ts` -- HyperIdleElectronBridge type
- `packages/web/src/settings/settings-types.ts` -- SettingsSectionId, SETTINGS_SECTIONS
- `packages/web/src/settings/SettingsBackend.tsx` -- current backend settings section
- `packages/server/src/routes/auth.ts` -- POST /api/auth/ws-token pattern

---

## Plan reconciliation (spec vs reality)

| Spec assumption | Reality | Resolution |
|---|---|---|
| Desktop connects to `/api/ws/worker` | Route exists at `GET /ws/worker?token=<HYPERIDLE_WORKER_TOKEN>` (worker-ws.ts:165) | Desktop connects to this existing endpoint -- no new route needed |
| Server shows desktop in `GET /api/workers` | Route exists, returns `pool.list()` (workers.ts:30) | No change needed -- desktop registers via WorkerRegisterMessage, pool.register() adds it, list() returns it |
| Worker protocol messages (register, dispatch, event, session_result, stop) | All types exist in `worker-protocol.ts` | No new protocol messages needed |
| RemoteHarnessAdapter wraps worker WS | Exists, fully functional (remote-harness-adapter.ts) | No changes needed |
| WorkerConnectionManager handles registration | Exists, registers adapter in pool on "register" message (worker-ws.ts:103-116) | No changes needed |
| Desktop needs worker token to connect WS | Worker WS auth checks `HYPERIDLE_WORKER_TOKEN` env var only | Server needs new authenticated endpoint to hand out worker token (Decision 1) |
| ClientConfig stores `workerEnabled` and `workerMaxConcurrent` | ClientConfig has: backendMode, serverUrl, lastView, windowState | Extend ClientConfigSchema with `workerEnabled`, `workerMaxConcurrent`, `workerDeviceId` |
| `ClaudeAgentSdkAdapter` runs on desktop using safeStorage key | Adapter exists in `packages/server` with credentialResolver support | Desktop instantiates from `@hyperidle/server` import -- need to verify package boundary. Actually, the adapter is in `packages/server` -- desktop should NOT import from server. Decision 2 addresses this. |
| `window.__HYPERIDLE__` has worker IPC methods | Bridge exposes: credentials, shell, onOpenSettings | Extend with `worker` namespace for toggle/status/pause IPC |
| Settings has a "Worker" section | Settings sections: profile, orgchart, credentials, notifications, appearance, products, backend | Add "worker" section to SETTINGS_SECTIONS |
| `before-quit` handler does graceful worker shutdown | Shared mode before-quit: `getBeforeQuitHandler(null, logRotator)` | Add worker client shutdown to the quit handler |

---

## Design decisions

### Decision 1: Worker token acquisition via authenticated endpoint

**Problem:** The desktop in shared mode needs the `HYPERIDLE_WORKER_TOKEN` value to connect the worker WebSocket. The desktop authenticates to the server via Bearer token (S1 LoginSession). The worker WS uses a separate static token (`HYPERIDLE_WORKER_TOKEN` env var). The desktop does not have access to server env vars.

**Option A: New credential catalog entry.** Add `worker_token` to `CREDENTIAL_NAMES`. Desktop stores it in safeStorage, admin provides it during setup.
- Trade-off: Bloats the catalog (4 entries). Manual setup step. Token sync problem if server rotates it.
- Reject: Credential catalog is for external service API keys, not internal infrastructure auth.

**Option B: Reuse `shared_backend_key` as worker token.** Server checks the worker WS `?token=` param against both `HYPERIDLE_WORKER_TOKEN` and `HYPERIDLE_API_KEY`.
- Trade-off: Conflates two distinct auth concerns. Worker auth should be revocable independently.
- Reject: Principle of least privilege violation -- admin key doubles as worker key.

**Option C: Authenticated endpoint returns worker token.** New `POST /api/auth/worker-token` (behind auth middleware) returns `{ token: string }` containing the `HYPERIDLE_WORKER_TOKEN`. Authenticated users who want to register as workers call this first, then use the token for the WS connection.
- Trade-off: One extra HTTP request on worker enable. Token rotates when server restarts (env var change).
- This matches the existing `POST /api/auth/ws-token` pattern exactly.

**Decision: Option C.** Consistent with the ws-token pattern. No catalog changes. Desktop uses its `shared_backend_key` (stored in safeStorage) as `X-API-Key` to authenticate to the endpoint and obtain the worker token dynamically. The server auth middleware in shared mode accepts X-API-Key as a fallback (see `credential-resolver.ts`: `shared_backend_key` maps to `HYPERIDLE_API_KEY`).

**Server-side guard:** Only return the worker token if `HYPERIDLE_WORKER_TOKEN` is set. If not configured on the server, return 404 with a clear message ("Worker registration is not enabled on this server"). This prevents desktops from trying to register as workers on servers that don't support it.

### Decision 2: ClaudeAgentSdkAdapter on the desktop -- package boundary

**Problem:** `ClaudeAgentSdkAdapter` lives in `packages/server/src/harness/claude-agent-sdk-adapter.ts`. The desktop needs to instantiate it for local session execution.

**Options considered and rejected:**
- **Move to shared:** Rejected -- adapter imports `@anthropic-ai/claude-agent-sdk` (heavy dep). Shared is lightweight.
- **New `packages/harness` package:** Rejected -- new package for one class is over-engineering.
- **Desktop reimplements the adapter:** Rejected -- duplication of session lifecycle logic.

**Decision: Import from `@hyperidle/server` via a new sub-path export.** The desktop already depends on `@hyperidle/server` (`packages/desktop/package.json` has `"@hyperidle/server": "*"`, used by `boot-server.ts` for local mode). The dependency exists. The adapter's constructor takes `{ apiKeyEnvVar?, queryFn?, credentialResolver? }`. Desktop passes a custom `credentialResolver` that reads from safeStorage. No new class needed. No duplication.

The sub-path export `"./harness"` exposes `ClaudeAgentSdkAdapter` and the `CredentialResolver` type (Task 0).

### Decision 3: Device ID for worker registration

**Problem:** `WorkerRegisterMessage.id` requires a stable string identity. This ID is the pool key -- it must be unique per device and stable across restarts.

**Option A: UUID generated on first enable, persisted in config.json.**
- Pro: Guaranteed unique. Stable across hostname changes.
- Con: Lost if config.json is deleted (new UUID = orphan pool entry until timeout).

**Option B: `os.hostname()`.** 
- Reject: Not unique across multiple desktops with default hostnames.

**Option C: `os.hostname() + crypto.randomUUID()` on first enable, persisted.**
- Pro: Human-readable prefix (hostname) + uniqueness guarantee.
- Con: Slightly more complex than pure UUID.

**Decision: Option A.** Pure UUID, persisted as `workerDeviceId` in `config.json`. The `name` field in the registration message uses `os.hostname()` for human-readable display. The `id` field is the UUID for pool keying. If config.json is wiped, a new UUID is generated -- the old pool entry is cleaned up when the old WS connection is detected as closed (which it already was, since config was wiped).

### Decision 4: CredentialResolver for desktop worker adapter

**Problem:** The `ClaudeAgentSdkAdapter` on the desktop needs the Anthropic API key from safeStorage. The adapter supports a `credentialResolver` option.

**Approach:** Create a `SafeStorageCredentialResolver` in `packages/desktop/src/safe-credential-resolver.ts` that implements the `CredentialResolver` interface by reading from the encrypted credentials store. This is the same pattern as `EnvCredentialResolver` on the server, but backed by safeStorage instead of env vars.

The resolver reads the credential file synchronously (same pattern as `readAnthropicKeyFromStore` in main.ts) and returns the decrypted value. Since `CredentialResolver.resolve()` is async, this works naturally.

### Decision 5: Settings UI -- separate section vs subsection of Backend

**Problem:** The spec says "Settings -> Worker section". Should this be a new top-level settings section or a subsection within SettingsBackend?

**Option A: New top-level section.** Add "worker" to `SettingsSectionId`. New `SettingsWorker.tsx`.
- Pro: Clean separation. Workers are a distinct concern from backend mode.
- Con: Only visible in shared-mode Electron. One more item in the settings nav that's conditionally hidden.

**Option B: Subsection of SettingsBackend.** Add worker toggle and status below the backend mode info.
- Pro: Workers are conceptually part of the backend configuration. Less nav clutter.
- Con: SettingsBackend gets complex. Mixing two concerns.

**Decision: Option A.** The worker section is conditionally visible (only in shared-mode Electron). The settings nav already has 7 sections; adding an 8th that's conditionally rendered is standard. The section renders nothing (or a notice) when not in shared-mode Electron.

### Decision 6: Pause semantics

**Problem:** The spec calls for a "Pause" button that stops accepting new work while finishing current sessions. This is different from disabling the worker (which disconnects).

**Approach:** The worker client tracks a `paused` boolean. When paused:
- No new dispatch messages are accepted (worker sends an error response for any dispatch received while paused).
- Active sessions continue to completion.
- The WS connection stays open. The worker remains registered in the pool.

**Server-side impact:** The server's `AdapterPool` doesn't know about pause state -- it will still select the paused worker if it has capacity. Two options:
1. Worker tells server it's paused via a new protocol message.
2. Worker rejects dispatch and server retries with another adapter.

Option 1 is cleaner. Add a `WorkerPauseMessage` to the protocol: `{ type: "pause" }` and `{ type: "resume" }`. When the server receives "pause", it marks the adapter as at-capacity (set currentLoad = maxConcurrent) so `select()` won't pick it. On "resume", restore the actual load.

**Revised approach -- simpler:** Instead of a new protocol message, the worker can send a new `register` message with `maxConcurrent: 0` to pause (pool won't select adapters at capacity), and re-register with the actual value to resume. But re-registering would replace the pool entry, which is fine since `pool.register()` replaces existing entries.

**Even simpler:** Add a `paused` field to `AdapterMeta` and update the pool's `select()` to skip paused adapters. The pause/resume protocol messages set this flag. This is 3 lines of code in the pool.

**Final decision:** Add `WorkerPauseMessage` (`{ type: "pause" }`) and `WorkerResumeMessage` (`{ type: "resume" }`) to the worker protocol. Server sets a `paused` flag on the pool entry. Pool `select()` skips paused entries. This is the cleanest separation of concerns.

---

## Acceptance criteria with verification

### AC-1: Worker toggle persists in config.json
**Criterion:** Settings -> Worker section has a toggle "Register this device as a worker." Default off. State persists in config.json.
**Verification:** Unit test: `saveClientConfig(path, { workerEnabled: true })` -> `loadClientConfig(path).workerEnabled === true`. Default: `loadClientConfig(newPath).workerEnabled === false`.

### AC-2: Worker WebSocket connection on enable
**Criterion:** When enabled, desktop connects a WebSocket to `/api/ws/worker?token=<token>`, obtains token via `POST /api/auth/worker-token`, sends `WorkerRegisterMessage`.
**Verification:** Unit test for `DesktopWorkerClient`: mock WS + mock HTTP -> assert register message sent with correct id, name, modelProviders, maxConcurrent. Assert `POST /api/auth/worker-token` called first.

### AC-3: Worker WebSocket disconnect on disable
**Criterion:** When disabled, worker WebSocket closed, server removes the adapter via pool.unregister().
**Verification:** Unit test: call `client.disconnect()` -> assert WS.close() called. Server-side already tested in S2 (WorkerConnectionManager.onClose removes from pool).

### AC-4: Capability detection from safeStorage
**Criterion:** `modelProviders` detected from safeStorage (anthropic_api_key present -> ["anthropic"]). `maxConcurrent` configurable, default 1.
**Verification:** Unit test: mock credentials store with anthropic_api_key -> `detectCapabilities()` returns `{ modelProviders: ["anthropic"], maxConcurrent: 1 }`. Without key -> `{ modelProviders: [], maxConcurrent: 1 }`.

### AC-5: Session dispatch and execution
**Criterion:** Desktop receives `{ type: "dispatch", sessionId, config }`, runs session using local ClaudeAgentSdkAdapter with its own API key, streams events back, sends result.
**Verification:** Unit test for `DesktopWorkerClient.handleDispatch()`: mock SDK adapter -> assert startSession called with config, events streamed as `WorkerEventMessage`, result sent as `WorkerSessionResultMessage`.

### AC-6: Worker status UI
**Criterion:** When enabled, Settings shows: connection status (connected/disconnected/connecting), active sessions / max, Pause button.
**Verification:** Playwright E2E: enable worker toggle -> assert status badge shows "Connected", session count shows "0 / 1". Unit test for SettingsWorker component: render with mock bridge data, assert elements present.

### AC-7: Pause/resume
**Criterion:** Pause button stops accepting new work while finishing current sessions. Resume re-accepts.
**Verification:** Unit test: `client.pause()` -> assert "pause" message sent via WS. `client.resume()` -> assert "resume" message sent. Server pool test: paused adapter is skipped by `select()`.

### AC-8: Graceful shutdown
**Criterion:** On app quit or toggle off: finish active sessions (up to 60s), then disconnect. Sessions not completed in time are stopped via `stopSession()`.
**Verification:** Unit test: `client.shutdown()` with mock active session -> assert waits for session completion. With mock session exceeding 60s -> assert `stopSession()` called, then WS closed.

### AC-9: Worker token endpoint
**Criterion:** `POST /api/auth/worker-token` returns the worker token to authenticated users. Returns 404 if `HYPERIDLE_WORKER_TOKEN` is not configured.
**Verification:** Integration test: `POST /api/auth/worker-token` with valid Bearer token -> 200 `{ token: <value> }`. Without `HYPERIDLE_WORKER_TOKEN` env var -> 404.

### AC-10: Server shows desktop in workers list
**Criterion:** After worker registers, `GET /api/workers` shows the desktop with its capabilities.
**Verification:** Already covered by existing S2 tests (pool.register + pool.list). Additional E2E validation: enable worker -> call workers API -> assert entry with desktop's hostname.

### AC-11: Two workers dispatch to less-loaded
**Criterion:** With server local adapter + desktop worker, dispatch goes to the less-loaded one.
**Verification:** Already covered by S2 AdapterPool.select() tests (least-loaded selection). No new test needed.

---

## Type signatures and schemas

### ClientConfig extension (packages/desktop/src/client-config.ts)

```typescript
// Add to ClientConfigSchema
const ClientConfigSchema = z.object({
  backendMode: BackendModeSchema.nullable().default(null),
  serverUrl: z.string().url().nullable().default(null),
  lastView: z.string().nullable().default(null),
  windowState: WindowStateSchema.optional(),
  // S4: Worker registration
  workerEnabled: z.boolean().default(false),
  workerMaxConcurrent: z.number().int().min(1).max(8).default(1),
  workerDeviceId: z.string().nullable().default(null), // UUID, generated on first enable
});

// Update ClientConfig type
export type ClientConfig = {
  backendMode: "local" | "shared" | null;
  serverUrl: string | null;
  lastView: string | null;
  windowState: WindowState;
  workerEnabled: boolean;
  workerMaxConcurrent: number;
  workerDeviceId: string | null;
};
```

### Worker protocol additions (packages/shared/src/harness/worker-protocol.ts)

```typescript
// Add to WorkerToServerMessage union:
export interface WorkerPauseMessage {
  readonly type: "pause";
}

export interface WorkerResumeMessage {
  readonly type: "resume";
}

export type WorkerToServerMessage =
  | WorkerRegisterMessage
  | WorkerEventMessage
  | WorkerSessionResultMessage
  | WorkerErrorMessage
  | WorkerPauseMessage
  | WorkerResumeMessage;
```

### AdapterPool pause support (packages/server/src/harness/adapter-pool.ts)

```typescript
// Extend PoolEntry:
interface PoolEntry {
  readonly adapter: HarnessAdapter;
  readonly meta: AdapterMeta;
  currentLoad: number;
  paused: boolean; // S4: skip in select() when true
  readonly connectedSince: string;
}

// Extend AdapterInfo:
export interface AdapterInfo {
  readonly id: string;
  readonly name: string;
  readonly kind: "local" | "remote";
  readonly modelProviders: readonly string[];
  readonly currentLoad: number;
  readonly maxConcurrent: number;
  readonly connectedSince: string;
  readonly paused: boolean; // S4
}

// New methods on AdapterPool:
pause(id: string): void;  // sets paused = true
resume(id: string): void; // sets paused = false

// select() adds: if (entry.paused) continue;
```

### Worker token endpoint (packages/server/src/routes/auth.ts)

```typescript
// Inside createAuthRoutes(), after ws-token:
// POST /worker-token -- returns HYPERIDLE_WORKER_TOKEN to authenticated users
router.post("/worker-token", (c) => {
  const workerToken = process.env.HYPERIDLE_WORKER_TOKEN;
  if (!workerToken) {
    return c.json({
      error: "Worker registration is not enabled on this server",
      code: "NOT_FOUND",
    }, 404);
  }
  return c.json({ token: workerToken });
});
```

### IPC channels (packages/desktop/src/preload.ts)

```typescript
// New IPC channels:
"worker:enable"   // (maxConcurrent: number) => Promise<void>
"worker:disable"  // () => Promise<void>
"worker:pause"    // () => Promise<void>
"worker:resume"   // () => Promise<void>
"worker:status"   // () => Promise<WorkerStatus>

// WorkerStatus shape:
interface WorkerStatus {
  enabled: boolean;
  connected: boolean;
  paused: boolean;
  activeSessions: number;
  maxConcurrent: number;
  deviceId: string | null;
  modelProviders: string[];
}
```

### Preload bridge extension (packages/web/src/window.d.ts)

```typescript
interface HyperIdleElectronBridge {
  // ... existing fields ...
  worker: {
    enable(maxConcurrent: number): Promise<void>;
    disable(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    status(): Promise<WorkerStatus>;
    onStatusChange(callback: (status: WorkerStatus) => void): () => void;
  };
}

interface WorkerStatus {
  enabled: boolean;
  connected: boolean;
  paused: boolean;
  activeSessions: number;
  maxConcurrent: number;
  deviceId: string | null;
  modelProviders: string[];
}
```

### SafeStorageCredentialResolver (packages/desktop/src/safe-credential-resolver.ts)

```typescript
import type { CredentialResolver } from "@hyperidle/server/harness";
import type { CredentialName } from "@hyperidle/shared";

export class SafeStorageCredentialResolver implements CredentialResolver {
  constructor(private readonly credentialsPath: string);
  
  /** Reads the named credential from the encrypted credentials.json via safeStorage. */
  async resolve(name: CredentialName): Promise<string | null>;
}
```

### DesktopWorkerClient (packages/desktop/src/desktop-worker-client.ts)

```typescript
interface DesktopWorkerClientOptions {
  serverUrl: string;
  credentialsPath: string;
  authKey: string;            // shared_backend_key value, used as X-API-Key for worker-token endpoint
  deviceId: string;
  machineName: string;
  modelProviders: string[];
  maxConcurrent: number;
}

export class DesktopWorkerClient {
  constructor(options: DesktopWorkerClientOptions);

  connect(): Promise<void>;     // GET worker-token, then WS connect + register
  disconnect(): Promise<void>;  // graceful shutdown (wait up to 60s)
  pause(): void;                // send pause message
  resume(): void;               // send resume message
  getStatus(): WorkerStatus;    // current status snapshot

  // Event subscription for UI updates
  onStatusChange(callback: (status: WorkerStatus) => void): () => void;
}
```

### SettingsWorker component (packages/web/src/settings/SettingsWorker.tsx)

```typescript
export function SettingsWorker(): JSX.Element;
// Renders:
// - Non-electron: "Worker mode requires the desktop app."
// - Local mode electron: "Worker mode is only available in shared backend mode."
// - Shared mode electron: toggle, maxConcurrent input, status, pause button
```

---

## WorkerConnectionManager pause/resume handling

The existing `WorkerConnectionManager.onMessage()` in `worker-ws.ts` needs to handle `pause` and `resume` messages after registration. When it receives `{ type: "pause" }`, it calls `pool.pause(workerId)`. When it receives `{ type: "resume" }`, it calls `pool.resume(workerId)`.

```typescript
// In WorkerConnectionManager.onMessage(), after the registration block:
} else if (this.adapter !== null) {
  if (msg.type === "pause" && this.workerId) {
    this.pool.pause(this.workerId);
  } else if (msg.type === "resume" && this.workerId) {
    this.pool.resume(this.workerId);
  } else {
    this.adapter.dispatchMessage(JSON.stringify(msg));
  }
}
```

---

## File-by-file change list

### packages/shared/src/harness/worker-protocol.ts
**What:** Add `WorkerPauseMessage` and `WorkerResumeMessage` to the protocol.
**Why:** Pause/resume support requires protocol extension.
**Size:** ~10 lines.

### packages/shared/src/harness/index.ts
**What:** Export new message types.
**Size:** 2 lines.

### packages/server/src/harness/adapter-pool.ts
**What:** Add `paused` field to PoolEntry. Add `pause(id)` and `resume(id)` methods. Update `select()` to skip paused entries. Update `list()` to include `paused` in AdapterInfo. Update `register()` to initialize `paused: false`.
**Size:** ~20 lines.

### packages/server/src/routes/worker-ws.ts
**What:** Add Zod schemas for pause/resume. Update `WorkerToServerMessageSchema` discriminated union. Handle pause/resume in `WorkerConnectionManager.onMessage()`.
**Size:** ~15 lines.

### packages/server/src/routes/auth.ts
**What:** Add `POST /worker-token` endpoint. Returns `HYPERIDLE_WORKER_TOKEN` env var to authenticated users. Returns 404 if not configured.
**Size:** ~15 lines.

### packages/desktop/src/client-config.ts
**What:** Add `workerEnabled`, `workerMaxConcurrent`, `workerDeviceId` to `ClientConfigSchema` and `ClientConfig` type. Update `DEFAULTS`.
**Size:** ~10 lines.

### packages/desktop/src/safe-credential-resolver.ts (NEW)
**What:** `SafeStorageCredentialResolver` implementing `CredentialResolver`. Reads from encrypted credentials.json via safeStorage decryption.
**Size:** ~30 lines.

### packages/desktop/src/desktop-worker-client.ts (NEW)
**What:** `DesktopWorkerClient` class. Manages: obtaining worker token via HTTP, WebSocket connection lifecycle, registration, dispatch handling (instantiate `ClaudeAgentSdkAdapter` per session), event streaming back to server, pause/resume, graceful shutdown with 60s timeout.
**Size:** ~200 lines.

### packages/desktop/src/preload.ts
**What:** Add `worker` namespace to contextBridge. IPC channels: `worker:enable`, `worker:disable`, `worker:pause`, `worker:resume`, `worker:status`. Add `worker:status-changed` event listener for push updates.
**Size:** ~20 lines.

### packages/desktop/src/main.ts
**What:** In `bootSharedMode()`:
1. Create `DesktopWorkerClient` instance if `workerEnabled` in config.
2. Register worker IPC handlers (`worker:enable`, `worker:disable`, `worker:pause`, `worker:resume`, `worker:status`).
3. On `worker:enable`: generate `workerDeviceId` if null, save config, create client, connect.
4. On `worker:disable`: call `client.disconnect()`, save config, null out client.
5. Update `before-quit` handler to include worker client shutdown.
6. Push status changes to renderer via `mainWindow.webContents.send("worker:status-changed", status)`.
**Size:** ~80 lines.

### packages/web/src/window.d.ts
**What:** Add `worker` property to `HyperIdleElectronBridge`. Add `WorkerStatus` interface.
**Size:** ~20 lines.

### packages/web/src/settings/settings-types.ts
**What:** Add `"worker"` to `SettingsSectionId` union. Add entry to `SETTINGS_SECTIONS` array.
**Size:** 2 lines.

### packages/web/src/settings/SettingsWorker.tsx (NEW)
**What:** Worker settings section. Shows:
- Non-electron: "Worker mode requires the desktop app."
- Local-mode electron: "Worker mode is only available in shared backend mode."
- Shared-mode electron: toggle (calls bridge.worker.enable/disable), maxConcurrent input (1-8), connection status badge, active sessions count, Pause/Resume button.
Uses `useEffect` to subscribe to status changes via `bridge.worker.onStatusChange()` and polls initial status via `bridge.worker.status()`.
**Size:** ~120 lines.

### packages/web/src/layouts/AppShell.tsx
**What:** Import `SettingsWorker`. Add `{activeSettingsSection === "worker" && <SettingsWorker />}` to the settings switch block.
**Size:** 2 lines.

---

## Ordered task list

### Task 0: Server harness sub-path export
**Files:**
- `packages/server/src/harness/index.ts` (NEW barrel file)
- `packages/server/package.json` (add `"./harness"` export)
**What:** Create `packages/server/src/harness/index.ts` that re-exports `ClaudeAgentSdkAdapter` from `./claude-agent-sdk-adapter.js` and `CredentialResolver` type from `../services/credential-resolver.js`. Add `"./harness": "./src/harness/index.ts"` to the `exports` field in `packages/server/package.json`.
**Test:** Verified by typecheck -- `import { ClaudeAgentSdkAdapter } from "@hyperidle/server/harness"` compiles in the desktop package.
**Dependencies:** None.

### Task 1: Protocol extension (pause/resume messages)
**Files:** `packages/shared/src/harness/worker-protocol.ts`, `packages/shared/src/harness/index.ts`
**Test:** `packages/shared/src/harness/__tests__/worker-protocol.test.ts` -- type-level tests confirming the union includes pause/resume. (Or: verified by typecheck since downstream code will use the types.)
**Dependencies:** None.

### Task 2: AdapterPool pause support
**Files:** `packages/server/src/harness/adapter-pool.ts`
**Test:** `packages/server/src/harness/__tests__/adapter-pool.test.ts` -- new tests:
- `pool.pause(id)` -> `select()` skips the paused adapter even if it has capacity.
- `pool.resume(id)` -> `select()` considers it again.
- `pool.list()` includes `paused: true/false` in AdapterInfo.
- `pool.pause(unknownId)` -> no-op.
**Dependencies:** Task 1.

### Task 3: WorkerConnectionManager pause/resume handling
**Files:** `packages/server/src/routes/worker-ws.ts`
**Test:** `packages/server/src/routes/__tests__/worker-ws.test.ts` -- new tests:
- Worker sends `{ type: "pause" }` after registration -> `pool.pause(workerId)` called.
- Worker sends `{ type: "resume" }` after registration -> `pool.resume(workerId)` called.
- Worker sends `{ type: "pause" }` before registration -> ignored.
**Dependencies:** Task 2.

### Task 4: Worker token endpoint
**Files:** `packages/server/src/routes/auth.ts`
**Test:** `packages/server/src/routes/__tests__/auth-worker-token.test.ts` -- new test file:
- `POST /api/auth/worker-token` with valid auth + `HYPERIDLE_WORKER_TOKEN` set -> 200 `{ token }`.
- `POST /api/auth/worker-token` with valid auth + `HYPERIDLE_WORKER_TOKEN` unset -> 404.
- `POST /api/auth/worker-token` without auth -> 401.
**Dependencies:** None (independent of Tasks 1-3).

### Task 5: ClientConfig extension
**Files:** `packages/desktop/src/client-config.ts`
**Test:** `packages/desktop/src/__tests__/client-config.test.ts` -- extend existing tests:
- Default values: `workerEnabled: false`, `workerMaxConcurrent: 1`, `workerDeviceId: null`.
- Round-trip: save `{ workerEnabled: true, workerMaxConcurrent: 4 }` -> load -> assert values.
- Migration: old config without worker fields loads with defaults (backward compat).
**Dependencies:** None.

### Task 6: SafeStorageCredentialResolver
**Files:** `packages/desktop/src/safe-credential-resolver.ts` (new)
**Test:** `packages/desktop/src/__tests__/safe-credential-resolver.test.ts` -- new test file:
- With `anthropic_api_key` in store -> `resolve("anthropic_api_key")` returns decrypted value.
- Without key -> `resolve("anthropic_api_key")` returns null.
- With encryption unavailable -> returns null.
**Dependencies:** None.

### Task 7: DesktopWorkerClient
**Files:** `packages/desktop/src/desktop-worker-client.ts` (new)
**Test:** `packages/desktop/src/__tests__/desktop-worker-client.test.ts` -- new test file:
- `connect()`: mock fetch for worker-token -> mock WebSocket -> assert register message sent with correct fields.
- `disconnect()` with no active sessions: assert WS.close() called immediately.
- `disconnect()` with active session completing within 60s: assert waits, then closes.
- `disconnect()` with active session exceeding 60s: assert stopSession() called, then closes.
- `handleDispatch()`: mock SDK -> assert session started, events streamed, result sent.
- `pause()`: assert pause message sent.
- `resume()`: assert resume message sent.
- `getStatus()`: assert correct snapshot.
- `onStatusChange()`: assert callback fired on state transitions.

**Implementation notes:**
- Constructor takes `DesktopWorkerClientOptions`.
- `connect()`: (1) POST to `{serverUrl}/api/auth/worker-token` with `X-API-Key: {authKey}` header -> get worker token. (2) Open WebSocket to `{serverUrl}/api/ws/worker?token={workerToken}`. (3) On open, send register message. (4) On "registered" ack, set connected = true. (5) On message, dispatch to session handler.
- `handleDispatch(msg)`: Use the shared `ClaudeAgentSdkAdapter` instance (created once in constructor with `SafeStorageCredentialResolver`). Call `startSession(msg.config)`. Iterate `streamEvents()`, send each as `WorkerEventMessage`. On completion, send `WorkerSessionResultMessage`. Track in `activeSessions` map.
- `handleStop(msg)`: Call `stopSession()` on the session handle. Send result.
- `disconnect()`: Set `accepting = false`. Wait for active sessions (Promise.all with 60s timeout). If timeout, stop each remaining session. Close WS.
- WebSocket reconnection: NOT in scope for S4. If the WS drops, status changes to "disconnected". User must toggle off and on to reconnect.

**Dependencies:** Task 5, Task 6.

### Task 8: Preload bridge extension
**Files:** `packages/desktop/src/preload.ts`
**Test:** Verified by typecheck (window.d.ts type matches preload implementation). Playwright E2E tests in Task 11 exercise the bridge end-to-end.
**Dependencies:** None (but paired with Task 9 for type consistency).

### Task 9: Window type declaration
**Files:** `packages/web/src/window.d.ts`
**Test:** Verified by typecheck (`npm run check`).
**Dependencies:** None.

### Task 10: Worker IPC handlers in main.ts
**Files:** `packages/desktop/src/main.ts`
**Test:** `packages/desktop/src/__tests__/main-worker.test.ts` -- new test file:
- `worker:enable(maxConcurrent)` IPC: assert config saved with `workerEnabled: true`, client created and connected.
- `worker:disable` IPC: assert client disconnected, config saved with `workerEnabled: false`.
- `worker:pause` IPC: assert client.pause() called.
- `worker:resume` IPC: assert client.resume() called.
- `worker:status` IPC: assert returns current status from client (or default status when no client).
- Before-quit with active worker: assert client.disconnect() called before quit completes.
- Boot with `workerEnabled: true` in config: assert client auto-created and connected.

**Implementation notes:**
- IPC handlers registered in `bootSharedMode()` after window creation.
- `worker:enable(maxConcurrent)`: generate `workerDeviceId` (UUID) if null, save config, detect capabilities from credentials store, read `shared_backend_key` from safeStorage for auth, create `DesktopWorkerClient`, call `connect()`, subscribe to status changes and forward to renderer via `mainWindow.webContents.send("worker:status-changed", status)`.
- `worker:disable()`: call `client.disconnect()`, save config `{ workerEnabled: false }`, null the client reference.
- `worker:status()`: if client exists return `client.getStatus()`, else return `{ enabled: config.workerEnabled, connected: false, paused: false, activeSessions: 0, maxConcurrent: config.workerMaxConcurrent, deviceId: config.workerDeviceId, modelProviders: [] }`.
- Before-quit: if client exists, call `client.disconnect()` and await (with 60s timeout).
- Auto-start on boot: after window creation in `bootSharedMode()`, if `config.workerEnabled && config.workerDeviceId`, read `shared_backend_key` from credentials store and auto-start the worker client. If `shared_backend_key` is missing, skip auto-start (worker will show as "disconnected" until credentials are provided and worker re-enabled).

**Dependencies:** Task 7, Task 8.

### Task 11: Settings UI (SettingsWorker + settings-types + AppShell)
**Files:**
- `packages/web/src/settings/settings-types.ts` (add "worker")
- `packages/web/src/settings/SettingsWorker.tsx` (new)
- `packages/web/src/layouts/AppShell.tsx` (add conditional render)
**Test:**
- `packages/web/src/settings/__tests__/SettingsWorker.test.tsx` -- component tests:
  - Without bridge: renders "requires desktop app" message.
  - With bridge, local mode: renders "requires shared mode" message.
  - With bridge, shared mode, worker disabled: renders toggle (off), no status.
  - With bridge, shared mode, worker enabled: renders toggle (on), status badge, session count, pause button.
  - Toggle on: calls bridge.worker.enable(maxConcurrent).
  - Toggle off: calls bridge.worker.disable().
  - Pause click: calls bridge.worker.pause().
  - Resume click: calls bridge.worker.resume().
  - Status change: re-renders with updated status.
- Playwright E2E: navigate to Settings -> Worker section, verify elements visible (in Electron test environment or with mocked bridge).

**UI specification:**
```
[Worker section]

Non-electron:
  "Worker mode requires the desktop app."

Local-mode electron:
  "Worker mode is only available in shared backend mode."

Shared-mode electron, disabled:
  [toggle off] Register this device as a worker
  Max concurrent sessions: [input: 1]  (range: 1-8)

Shared-mode electron, enabled:
  [toggle on] Register this device as a worker
  Max concurrent sessions: [input: N]  (range: 1-8)

  Status: [badge: Connected | Disconnected | Connecting]
  Active sessions: 0 / N
  [btn: Pause]  (or [btn: Resume] when paused)
```

**Dependencies:** Task 9 (for window.d.ts types).

---

## Security and abuse cases

| Concern | Applicable? | Resolution |
|---|---|---|
| **Rate-limit on POST /api/auth/worker-token** | Yes | Inherits existing auth middleware rate limiting. No additional rate-limit needed -- the endpoint is behind auth and returns a static value. |
| **Worker token exposure** | Yes | The worker token is returned only to authenticated users (behind auth middleware). It is never logged, never included in error messages. The response is `{ token }` only -- no additional metadata that could be used for reconnaissance. |
| **Input-trust boundary for dispatch messages** | Yes | Desktop receives `SessionConfig` from server. The config contains `workspacePath` -- but the desktop controls its own filesystem. The `ClaudeAgentSdkAdapter` sandbox (ALLOWED_ENV_KEYS) prevents credential leakage. The workspace path should be validated to prevent path traversal -- but the adapter already creates a fresh workspace directory. |
| **WS connection hijacking** | N/A | Worker WS uses token auth (constant-time comparison). Same security as S2. |
| **Paused worker receiving dispatch** | Low risk | If a race condition causes a dispatch to arrive at a paused worker, the worker should reject it gracefully (send error message, don't crash). The server retries with another adapter. |
| **Desktop API key isolation** | Yes | Desktop uses its OWN safeStorage credentials. The `ClaudeAgentSdkAdapter` sandbox ensures only `PATH`, `HOME`, `LANG`, and `ANTHROPIC_API_KEY` are in the agent env. Server credentials never reach the desktop. |
| **SSRF via serverUrl** | N/A | `serverUrl` is user-configured in config.json. The desktop connects to it -- this is intended behavior, not SSRF. |
| **Secret handling** | Yes | `SafeStorageCredentialResolver` reads encrypted credentials.json and decrypts via Electron safeStorage. Decrypted values are held in memory only during session execution. Worker token is held in memory for the WS connection lifetime. |
| **maxConcurrent abuse** | Low risk | Clamped to 1-8 in Zod schema. Server-side AdapterPool enforces capacity via `currentLoad >= maxConcurrent`. |

---

## Protected tests

```
protectedTests:
  - packages/server/src/routes/__tests__/worker-ws.test.ts
  - packages/server/src/routes/__tests__/workers.test.ts
  - packages/server/src/harness/__tests__/adapter-pool.test.ts
  - packages/desktop/src/__tests__/client-config.test.ts
```

These existing test files must not have their assertions weakened. New tests are added to them; existing assertions stay.

---

## Migrations

### Symbol migrations (renames/moves)

None. S4 adds new code and extends existing types. No existing symbols are renamed, removed, or moved.

### Type-level additions (backward compatible)

| File | Change | Affected downstream |
|---|---|---|
| `ClientConfig` type | Add 3 optional fields with defaults | All callers of `loadClientConfig` continue to work (Zod defaults) |
| `AdapterInfo` type | Add `paused: boolean` | GET /api/workers response gains a field (additive, non-breaking) |
| `WorkerToServerMessage` union | Add 2 members | Server WS handler already validates via Zod discriminated union -- new types handled explicitly |
| `HyperIdleElectronBridge` | Add `worker` property | Optional (`worker?:`) so existing code without it continues to work |
| `SettingsSectionId` | Add `"worker"` | Union widening -- existing code handles unknown sections gracefully |

---

## Risks and ambiguities

### Risk 1: ClaudeAgentSdkAdapter import from desktop (RESOLVED)
The desktop package imports `ClaudeAgentSdkAdapter` from `@hyperidle/server`. Verified: `packages/desktop/package.json` has `"@hyperidle/server": "*"` as a dependency. The server depends on `@anthropic-ai/claude-agent-sdk: ^0.2.109`, which is available transitively. The SDK runs in Node.js -- Electron's main process is a Node.js process, so this works.

**Problem:** `ClaudeAgentSdkAdapter` is not exported from the server package's sub-path exports. Current exports: `.`, `./server-factory`, `./test-utils`, `./skill-tools`, `./schemas`.

**Resolution:** Add a new sub-path export `"./harness"` to `packages/server/package.json` pointing to a new `src/harness/index.ts` barrel that exports `ClaudeAgentSdkAdapter` and `CredentialResolver`. This is Task 0 in the ordered task list.

### Risk 2: CredentialResolver interface import (RESOLVED)
`CredentialResolver` is defined in `packages/server/src/services/credential-resolver.ts`. Its `resolve()` method takes `CredentialName` (the union type from `@hyperidle/shared`). The desktop's `SafeStorageCredentialResolver` must implement this exact interface.

**Resolution:** Export `CredentialResolver` via the new `./harness` sub-path export. The desktop imports `import type { CredentialResolver } from "@hyperidle/server/harness"`.

**Note:** `CredentialResolver.resolve()` takes `CredentialName` (`"anthropic_api_key" | "openrouter_api_key" | "shared_backend_key"`), NOT arbitrary strings. The `SafeStorageCredentialResolver` must handle all three catalog names.

### Risk 3: Auth for worker-token endpoint (RESOLVED)
`bootSharedMode()` does not currently pass any auth credentials to the worker system. The renderer authenticates to the remote server via the claim flow (S1) but the main process handles the worker WS connection.

**Key insight:** The `shared_backend_key` credential maps to `HYPERIDLE_API_KEY` on the server (see `credential-resolver.ts` line 27). The server auth middleware in shared mode accepts `X-API-Key` as a fallback after Bearer tokens. So the desktop main process can authenticate to `POST /api/auth/worker-token` using its `shared_backend_key` from safeStorage as `X-API-Key`.

**Resolution:** The `DesktopWorkerClient` reads `shared_backend_key` from the credentials store (same `readAnthropicKeyFromStore` pattern but for `shared_backend_key`). It uses this as `X-API-Key` header when calling `POST /api/auth/worker-token`. No Bearer token from the renderer is needed. No IPC token passing complexity.

The IPC signature is simple: `worker:enable(maxConcurrent: number) => Promise<void>`.

**Auto-start on boot:** Since the main process has direct access to credentials, it CAN auto-start the worker on boot when `workerEnabled: true` in config. This is better UX -- the worker reconnects automatically after app restart without requiring user interaction. The main process calls `readCredentialFromStore(credentialsPath, "shared_backend_key")` to get the auth key.

### Risk 4: WebSocket in Electron main process
The desktop main process needs a WebSocket client (not server). Node.js `ws` package (already a dependency via `@hono/node-server`) provides `WebSocket` client. Electron's main process is a Node.js process, so `ws` works directly.

**Mitigation:** Use `import WebSocket from 'ws'` in `DesktopWorkerClient`. Verify `ws` is available in the desktop build.

### Risk 5: Concurrent session management
The desktop may run multiple sessions simultaneously (up to `maxConcurrent`). Each session needs its own `ClaudeAgentSdkAdapter` instance (or a shared one with multiple active sessions -- the existing adapter tracks sessions by ID in a Map). The existing adapter supports concurrent sessions via its internal `sessions` Map.

**Mitigation:** Use a single `ClaudeAgentSdkAdapter` instance for all sessions on the desktop worker. The adapter's `startSession()` / `streamEvents()` / `stopSession()` are session-keyed and concurrent-safe.

---

## Route checklist

| Route | File | Change |
|---|---|---|
| `POST /api/auth/worker-token` | `packages/server/src/routes/auth.ts` | New endpoint (Task 4) |
| `GET /ws/worker?token=` | `packages/server/src/routes/worker-ws.ts` | Handle pause/resume (Task 3) |
| `GET /api/workers` | `packages/server/src/routes/workers.ts` | No change (returns pool.list() which includes new `paused` field) |
