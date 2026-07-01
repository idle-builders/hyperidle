# Track S: Shared Server & Multi-User Collaboration

Enable multiple humans to connect to a shared HyperIdle server, authenticate as distinct users, collaborate in real time, and distribute agent execution across connected nodes via the existing HarnessAdapter interface.

**Concept:** `plans/shared-server/concept.md`

**Constraint:** Local desktop mode remains fully functional — no login screen, no worker protocol, same behavior as today. Shared server features are additive. `npm run dev` works at every merge boundary.

**Dependencies (complete):** P2 (unified users table + org chart), P3 (backend mode + credentials + AppConfig).

---

### S1 — Per-User Authentication

**Workpackage.** As a human connecting to a shared HyperIdle server, I want to authenticate with my own credentials so that my messages, actions, and reviews are attributed to me — not to a shared anonymous identity.

**Depends on.** P2, P3.

**Complexity.** L

**Acceptance criteria.**

_LoginSession model:_
- A `login_sessions` table: `id` (UUID PK), `userId` (FK to users), `tokenHash` (SHA-256, unique), `expiresAt`, `createdAt`, `revokedAt` (nullable).
- Tokens are 256-bit random, returned plaintext once at creation, stored only as SHA-256 hash.
- Constant-time hash comparison. Default TTL: 30 days.

_Invite codes:_
- An `invite_codes` table: `code` (unique random), `createdBy` (FK), `claimedBy` (nullable FK), `role`, `expiresAt`, `createdAt`.
- `POST /api/auth/invite` — admin-only, creates invite. Returns code.
- `POST /api/auth/claim` — public. Accepts `{ code, name, email? }`. Creates user (kind=human), creates LoginSession, returns `{ token, user }`. Returns 410 if claimed/expired.
- 7-day default expiry.

_Auth middleware:_
- In shared mode: checks `Authorization: Bearer <token>` → LoginSession lookup → `userId`. Falls back to `X-API-Key` → admin key → first human user.
- In local mode: unchanged (API key only).
- `c.set("userId")` reflects the correct user in all modes.

_Endpoints:_
- `POST /api/auth/logout` — revokes current LoginSession.
- `GET /api/auth/me` — returns authenticated user (now works with per-user identity).
- `POST /api/auth/ws-token` — binds LoginSession's userId to the WebSocket upgrade token.

**Validation scenarios.**
- Admin creates invite → new user claims it → bearer token works → messages carry the user's identity.
- Expired token → 401 `SESSION_EXPIRED`. Revoked token → 401 `SESSION_REVOKED`.
- Local desktop mode → auth unchanged, no LoginSession involved.
- Two users post to the same thread → each message has the correct `authorId`.

**Contracts / constraints.**
- Plaintext tokens never stored, never logged, never in GET responses.
- `HYPERIDLE_API_KEY` remains as server admin key.
- LoginSessions are append-only (no updates, only revocation).
- No OAuth, no SSO, no passwords in this WP.

**Out of scope.** Login UI (S3). Password auth. Rate limiting on auth endpoints.

**Effort.** L (~3d)

---

### S2 — Remote Execution via HarnessAdapter

**Workpackage.** As a shared server, I want agent sessions to run on connected worker nodes — so that execution is distributed across all available compute without changing how sessions are started or tracked.

**Depends on.** P3 (credentials), D5 (session provisioning), C3 (session lifecycle).

**Complexity.** L

**Acceptance criteria.**

_RemoteHarnessAdapter:_
- A `RemoteHarnessAdapter` class implements `HarnessAdapter`. It delegates `startSession`, `streamEvents`, and `stopSession` to a connected worker over WebSocket.
- The adapter serializes `SessionConfig` and sends it as a dispatch message. The worker runs its own local `ClaudeAgentSdkAdapter` and streams `HarnessEvent`s back. The adapter deserializes them and yields them through `streamEvents` — callers cannot distinguish remote from local execution.

_Worker connection protocol:_
- Workers connect via `/api/ws/worker` (separate from user WebSocket at `/api/ws`).
- Auth: `worker_token` credential (added to P3 catalog). Validated on WebSocket upgrade.
- On connection, worker sends: `{ type: "register", id, name, modelProviders: string[], maxConcurrent: number }`.
- Server creates a `RemoteHarnessAdapter` instance backed by this connection.
- On WebSocket close: adapter is removed, any running sessions are marked `crashed`.
- Liveness via WebSocket protocol ping/pong — no application-level heartbeat.

_Adapter selection in session provisioning:_
- Session provisioning (D5) gains a pool of adapters: one local (always present), zero or more remote.
- When starting a session: pick an adapter with matching `modelProviders` and available capacity (`running < maxConcurrent`). Prefer least loaded. Fall back to local.
- When all adapters are at capacity: session start fails with a retriable error. The task stays in its current lifecycle state for re-trigger.
- No persistent queue. The task/routine scheduler handles retry.

_Server self-registration:_
- On VPS/cloud profiles, the server wraps its local `ClaudeAgentSdkAdapter` as an adapter in the pool with capabilities from the credential resolver. Local mode does the same — the pool has exactly one adapter.

_Admin visibility:_
- `GET /api/workers` — lists connected workers: id, name, kind, modelProviders, currentLoad, maxConcurrent, connectedSince. Requires admin key.

_Process isolation (server-side):_
- Each session on the server's local adapter runs in a child process with a dedicated temp workspace, cleaned on session end.
- Child process inherits only `PATH`, `HOME`, `LANG`, and the resolved API key. No server secrets.
- Configurable limits: `HYPERIDLE_SESSION_MAX_MEMORY_MB` (default 2048), `HYPERIDLE_SESSION_MAX_DURATION_MS` (default 3600000). Exceeded = session `crashed`.

**Validation scenarios.**
- One server worker, session request → executes on server, events stream to UI via WebSocket, indistinguishable from current behavior.
- Server worker + one remote worker connected → session dispatches to the less-loaded one.
- Remote worker disconnects mid-session → session marked `crashed`, task eligible for retry.
- No matching capabilities → session fails, task not stuck.
- Local desktop mode → pool has one local adapter, behavior identical to today.
- Session on server exceeds memory limit → process killed, session `crashed`, other sessions unaffected.

**Contracts / constraints.**
- `HarnessAdapter` interface unchanged. No new methods, no new event types.
- Worker WebSocket is separate from user WebSocket. Different endpoint, different auth.
- Adapter pool is in-memory. Server restart = workers reconnect and re-register.
- No queue persistence. Tasks re-trigger via their existing lifecycle.
- Process isolation applies to server-side execution only. Desktop workers manage their own resources.
**Out of scope.** Desktop-as-worker (S4). Container/Docker isolation (later hardening). Cloud worker auto-provisioning (E2B). Worker affinity. Priority routing.

**Effort.** L (~4d)

---

### S3 — Shared Mode UX: Login, Presence & Setup

**Workpackage.** As a user on a shared server, I want a login screen, presence indicators showing who's online, and a setup flow that actually saves my choices — so that multi-user feels real, not bolted on.

**Depends on.** S1 (per-user auth), P4 (setup flow).

**Complexity.** L

**Acceptance criteria.**

_Login screen:_
- Desktop in shared mode with no stored token → login screen (not main UI).
- Login accepts an invite code (first time) or validates a stored token (returning user).
- On successful claim: token stored in Electron safeStorage (`login_session_token`). App transitions to main UI.
- On boot: if stored token exists, `GET /api/auth/me` validates it. Valid → main UI. Invalid/expired → login screen.
- Token auto-refresh: at 80% of TTL, silent refresh via `POST /api/auth/login { token }`.
- "Sign out" in user menu: revokes token, clears storage, returns to login screen.

_Web client login:_
- Same login flow. Token stored in `localStorage`. `apiFetch` injects `Authorization: Bearer <token>` instead of `X-API-Key`.

_Presence:_
- WsBroadcaster tracks which user identities have active connections.
- `user_connected` / `user_disconnected` events on EventBus.
- `GET /api/presence` returns currently connected user IDs.
- Thread headers show avatars of other users viewing the same thread (derived from topic subscriptions).
- Rail shows presence dots next to online users.
- No "typing", no "away", no custom status. Binary: connected or not.

_Setup flow wiring:_
- Selecting "shared" in SetupFlow actually saves `backendMode: "shared"` + `serverUrl` to `config.json` via IPC bridge.
- "Test Connection" button hits the remote server's health endpoint.
- After successful connection test + app restart, login screen appears.
- Settings → Backend Mode section is enabled (no longer "coming soon"). Shows current connection, option to switch with restart warning.

_Credential management:_
- Settings shows credential states from `GET /api/credentials`.
- Admin users can add/test/remove credentials via the existing PUT/POST/DELETE endpoints.

**Validation scenarios.**
- Fresh desktop in shared mode → login screen → enter invite code → main UI → subsequent restarts skip login.
- Expired token on boot → login screen with "Session expired" message.
- Two users in the same thread → each sees the other's avatar in the thread header.
- "Sign out" → login screen. Stored token cleared.
- SetupFlow "shared" → enter URL → test connection → restart → login screen appears.
- Local mode → no login screen, no presence UI, no changes.

**Contracts / constraints.**
- Token storage: Electron safeStorage (desktop), localStorage (web).
- Login screen is the sole entry point for shared mode. No unauthenticated access.
- Presence is derived, not stored. No persistence across server restarts.
- Presence is informational, never authoritative.

**Out of scope.** Password-based login. Admin user management dashboard. Mobile login.

**Effort.** L (~4d)

---

### S4 — Desktop-as-Worker

**Workpackage.** As a user running the desktop app connected to a shared server, I want to optionally register my machine as a worker — so that agent sessions can run on my laptop, using my local API keys and compute, coordinated by the shared server.

**Depends on.** S1 (per-user auth), S2 (remote execution protocol).

**Complexity.** M

**Acceptance criteria.**

_Worker opt-in:_
- Settings → Worker section: toggle "Register this device as a worker." Default off.
- When enabled: desktop connects a second WebSocket to `/api/ws/worker`, registers with its capabilities.
- When disabled: worker WebSocket closed, server removes the adapter. No sessions dispatched.
- Toggle state persists in `config.json`.

_Capability detection:_
- `modelProviders`: detected from safeStorage (e.g., `anthropic_api_key` present → `["anthropic"]`).
- `maxConcurrent`: configurable in Settings, default 1.
- Registration message: `{ type: "register", id: <device-id>, name: <machine-name>, modelProviders, maxConcurrent }`.

_Session execution:_
- Desktop receives dispatch: `{ type: "dispatch", sessionId, config }`.
- Runs session using its local `ClaudeAgentSdkAdapter` with its own API key from safeStorage.
- Streams events back: `{ type: "event", sessionId, event }`.
- Completion: `{ type: "session_result", sessionId, result }`.

_Worker status UI:_
- When enabled, Settings shows: current status, active sessions / max, a "Pause" button to stop accepting new work while finishing current sessions.

_Graceful shutdown:_
- On app quit or toggle off: finish active sessions (up to 60s), then disconnect. Sessions not completed in time are stopped via `stopSession()`.

**Validation scenarios.**
- Worker enabled → `GET /api/workers` on server shows the desktop.
- Session dispatched to desktop → executes using local Anthropic key → server UI shows events in real time.
- Worker toggled off → server removes adapter → no new sessions dispatched, active ones finish.
- App quit with running session → session completes or is stopped, server marks adapter gone.
- Two workers (server + desktop) → dispatch to less-loaded one.

**Contracts / constraints.**
- Desktop uses its OWN credentials (safeStorage), not the server's. Teams pool API quota.
- Worker WebSocket is separate from user WebSocket.
- Worker toggle is per-device, stored in client config.
- Desktop must be in shared mode to be a worker.
- Opt-in only. No defaults, no prompts to enable.

**Out of scope.** Auto-discovery beyond credential detection. GPU/hardware reporting. Worker performance metrics.

**Effort.** M (~3d)

---

## Dependency graph

```
P2,P3 ─── S1 (Auth) ──┬── S3 (Login, Presence, Setup UX)
                       │
P3,D5,C3 ─ S2 (Remote Execution) ──── S4 (Desktop-as-Worker)
```

S1 and S2 have no dependency on each other — they run in parallel.
S3 needs S1 (auth model for login). S4 needs S2 (worker protocol to register).
Total: ~14 days across two parallel lanes.

**Cross-track dependencies:**
- S1 → Q1 (Human Initiative DMs need per-user identity)
- S2 → R1 (Wire Agent Execution benefits from adapter pool)
