# Architecture Critique: S4

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:7 AC:8 DM:9 N:9 MD:8 FMC:7 S:8 V:8

---

## Dimension Scores

### 1. Spec Alignment (9/10)

Every acceptance criterion from TRACK-S.md S4 maps to at least one plan task:

| AC | Plan Task |
|---|---|
| Worker toggle persists | Task 5 (ClientConfig), Task 11 (UI) |
| WS connect on enable | Task 7 (DesktopWorkerClient), Task 4 (worker-token endpoint) |
| WS disconnect on disable | Task 7 |
| Capability detection | Task 7 (detectCapabilities in connect flow) |
| Session dispatch/execution | Task 7 (handleDispatch) |
| Worker status UI | Task 11 (SettingsWorker) |
| Pause/resume | Task 1 (protocol), Task 2 (pool), Task 3 (WS handler), Task 7 (client) |
| Graceful shutdown | Task 7 (disconnect with 60s timeout), Task 10 (before-quit) |
| Worker token endpoint | Task 4 |
| Server shows desktop in workers list | Covered by existing S2 infrastructure, confirmed |
| Two workers dispatch to less-loaded | Covered by existing S2 AdapterPool.select(), confirmed |

AC-9 and AC-10 are verified by the plan as either new tests or existing S2 coverage. No scope-creep tasks -- Task 0 (sub-path export) is a forced dependency for Decision 2, not scope creep.

Minor deduction: The spec says "Settings shows: current status, active sessions / max" but the plan's UI spec (lines 616-635) does not mention showing which sessions are active (e.g., session IDs or task names). The spec doesn't demand this level of detail, so this is a non-issue, but worth noting the plan correctly scoped down to a count.

### 2. Layer Integrity (7/10)

The three-layer constraint is mostly respected. The plan correctly keeps:
- Protocol types in `packages/shared` (shared layer)
- Pool/adapter logic in `packages/server` (Meta Layer)
- UI in `packages/web` (Human Interface)
- Desktop integration in `packages/desktop` (bridge between layers)

**Issue: Task 0 creates a barrel file that violates a codebase rule.** The TypeScript rules (`.claude/rules/typescript.md`) state: "No barrel files except `packages/*/src/index.ts`." Task 0 creates `packages/server/src/harness/index.ts` as a sub-module barrel. This is a **structural rule violation**, not a layer violation per se, but it concerns the module boundary structure.

**Mitigation available:** The sub-path export in `package.json` could point directly to `./src/harness/claude-agent-sdk-adapter.ts` (with `CredentialResolver` re-exported from within that file or imported separately), avoiding the barrel. Alternatively, the barrel rule could be acknowledged as a justified exception via a `@lore` comment. The plan should explicitly address this.

**Issue: `@hyperidle/server` is in `devDependencies` of `packages/desktop`.** The plan's Decision 2 (line 83) claims the desktop "depends on `@hyperidle/server`" and references `packages/desktop/package.json`. The actual `package.json` shows `@hyperidle/server` under `devDependencies`, not `dependencies`. In a monorepo with npm workspaces this distinction doesn't matter for resolution, but it is technically inaccurate documentation in the plan. If the desktop now imports from `@hyperidle/server/harness` at **runtime** (not just at build time for `boot-server.ts`), the package should arguably move to `dependencies`. This is a WARNING-level concern because the builder might not notice and the Electron build pipeline might behave differently with dev vs prod dependencies.

### 3. API Contracts (8/10)

**Worker token endpoint** is well-specified:
- Method: POST
- Path: `/api/auth/worker-token`
- Auth: behind existing auth middleware
- Success: 200 `{ token: string }`
- Failure: 404 `{ error: string, code: "NOT_FOUND" }` (when `HYPERIDLE_WORKER_TOKEN` unset)
- Failure: 401 (unauthorized, from middleware)

**Protocol additions** are well-specified:
- `WorkerPauseMessage { type: "pause" }` and `WorkerResumeMessage { type: "resume" }` with exact type shapes
- Discriminated union extension is correct

**IPC contracts** are specified with channel names and return types.

Minor gap: The worker-token endpoint response shape is given in code but the plan doesn't specify rate-limiting behavior beyond "inherits existing auth middleware rate limiting." The security table (line 646) dismisses the need but should confirm the auth middleware actually applies rate limiting. The auth middleware (`packages/server/src/middleware/auth.ts`) is listed in Required Reading but not read during plan reconciliation to confirm rate-limit behavior.

### 4. Data Model Alignment (9/10)

No database schema changes -- S4 is entirely runtime state (WebSocket connections, in-memory pool entries, file-based config). This is correct per the concept doc: "Worker status is derived, not managed" and "No table, no lifecycle."

ClientConfig extension is well-specified with Zod types, defaults, and backward compatibility:
- `workerEnabled: z.boolean().default(false)` -- correct
- `workerMaxConcurrent: z.number().int().min(1).max(8).default(1)` -- correct
- `workerDeviceId: z.string().nullable().default(null)` -- correct

AdapterPool extension adds `paused: boolean` to `PoolEntry` and `AdapterInfo` -- additive, non-breaking. Migration note: "No existing symbols are renamed, removed, or moved" -- verified correct.

### 5. Naming (9/10)

Names are honest and descriptive:
- `DesktopWorkerClient` -- exactly what it is
- `SafeStorageCredentialResolver` -- describes mechanism and interface
- `WorkerPauseMessage` / `WorkerResumeMessage` -- consistent with existing `Worker*Message` pattern
- `workerDeviceId` -- clear purpose
- `workerEnabled`, `workerMaxConcurrent` -- self-documenting config fields

No naming conflicts with existing primitives (Bet/Task/Session/Thread/Block/Artifact). "Worker" is correctly used per the concept doc's vocabulary.

The `WorkerStatus` interface name (line 306) is fine -- it's scoped to the IPC bridge and doesn't conflict with anything.

### 6. Module Depth (8/10)

The `DesktopWorkerClient` class has a clean, deep interface: 5 methods (`connect`, `disconnect`, `pause`, `resume`, `getStatus`) plus 1 event subscription (`onStatusChange`). This hides significant complexity: HTTP token acquisition, WebSocket lifecycle, session dispatch, event streaming, graceful shutdown with timeout. Good depth.

The IPC layer is appropriately thin -- it's a pass-through from renderer to main process.

The `SafeStorageCredentialResolver` is a shallow module (one method implementing one interface), but this is forced by the `CredentialResolver` contract -- it's the right shape.

Minor concern: `AdapterPool` gains two new methods (`pause`, `resume`) that are tightly coupled to the pause protocol. These could have been a single `setPaused(id, paused)` method, but two methods is equally valid and arguably more readable. Not a real issue.

### 7. Failure-Mode Coverage (7/10)

**Covered well:**
- Worker token endpoint: 404 when `HYPERIDLE_WORKER_TOKEN` not configured, 401 when unauthenticated
- Graceful shutdown: 60s timeout, then `stopSession()` for remaining sessions
- Paused worker receiving dispatch: plan addresses the race condition (line 649)
- API key isolation: safeStorage credentials, sandboxed env
- maxConcurrent abuse: Zod schema clamps 1-8
- Config migration: old configs without worker fields load with defaults

**Gaps:**

1. **WebSocket reconnection explicitly out of scope** (line 561), but the plan doesn't specify what happens to the UI when the connection drops. The `WorkerStatus` has `connected: boolean`, but the plan doesn't describe how the drop is detected (WS `onclose`/`onerror`) or how the status change propagates. The `DesktopWorkerClient` class should specify its WS event handlers.

2. **Worker token fetch failure** is not addressed. What happens if `POST /api/auth/worker-token` fails (network error, 500, 404 because server doesn't have worker support)? The plan says `connect()` calls POST first, then opens WS, but doesn't specify error handling for the POST failure. Should the client set status to "disconnected"? Should it surface the error message?

3. **`shared_backend_key` missing from safeStorage at enable time.** The plan addresses this for auto-start on boot (line 592: "If `shared_backend_key` is missing, skip auto-start") but doesn't specify what happens when the user clicks "Enable" and the key is missing. Should the UI show an error? Should `worker:enable` IPC return an error?

4. **Security table is present and covers STRIDE concerns** adequately for this workpackage's threat surface. The route checklist (line 730) is complete.

### 8. Simplicity / Over-Engineering Risk (8/10)

The plan makes appropriately simple choices:
- Decision 6 (Pause) evolved through 4 options and settled on the simplest: protocol messages + pool flag. Good.
- Decision 3 (Device ID) chose pure UUID over hostname-based schemes. Good.
- Decision 1 (Worker token via authenticated endpoint) reuses the existing `ws-token` pattern. Good.
- No auto-reconnect in scope -- correct deferral for an M-complexity workpackage.

The plan avoids over-engineering. No abstract base classes, no plugin points, no feature flags, no registries. The `DesktopWorkerClient` is a concrete class, not an interface with one implementation.

Decision 2's "design-it-twice" section (lines 77-83) is genuine -- the rejected options (move to shared, new package, duplication) are real alternatives with real trade-offs, not straw men.

Minor concern: The plan creates both a `SafeStorageCredentialResolver` class AND reads credentials directly in `bootSharedMode()` for the `shared_backend_key`. This is two code paths for reading safeStorage credentials. The resolver could be used for both, but the boot path needs the key before the resolver is constructed. This is an inherent sequencing issue, not over-engineering.

### 9. Verifiability (8/10)

Every AC has a concrete verification method with specific test assertions:
- AC-1: unit test with explicit assertion (`loadClientConfig(path).workerEnabled === true`)
- AC-2: unit test with mock WS + mock HTTP, assertion on register message content
- AC-5: unit test with mock SDK, assertions on event streaming and result sending
- AC-7: unit test + server pool test for paused adapter skipping
- AC-9: integration test with HTTP assertions (200 + 404 + 401)

Protected tests list (line 658) correctly identifies the 4 existing test files whose contracts must not drift.

Test file naming follows existing conventions. New test files are placed next to their source files.

Minor gap: AC-6 (Worker status UI) verification says "Playwright E2E: enable worker toggle -> assert status badge shows 'Connected'" but the plan notes this requires either an Electron test environment or a mocked bridge. The plan doesn't specify which approach the builder should use, and Playwright E2E against Electron is non-trivial. The component unit tests (`SettingsWorker.test.tsx`) are the reliable verification here; the E2E claim may be aspirational.

---

## CRITICAL

None.

## WARNING

- [plan Task 0, line 491] **Barrel file violates codebase rule.** `packages/server/src/harness/index.ts` is a new barrel file, but `.claude/rules/typescript.md` says "No barrel files except `packages/*/src/index.ts`." The plan should either (a) point the sub-path export directly at the adapter file and use a re-export within it for `CredentialResolver`, or (b) explicitly acknowledge this as a justified exception with rationale. The builder will otherwise face a contradiction between plan and rules.

- [plan Decision 2, line 83] **`@hyperidle/server` dependency classification is inaccurate.** The plan states it's in `dependencies` but it's actually in `devDependencies` of `packages/desktop/package.json`. Since S4 imports from `@hyperidle/server/harness` at **runtime** in the Electron main process (not just for build-time type checking), this package should be moved to `dependencies`. The builder should make this move as part of Task 0.

- [plan Task 11, line 597-613] **Conditional settings nav not addressed.** The plan says "worker section is conditionally visible (only in shared-mode Electron)" but the current `AppShell.tsx` renders `SETTINGS_SECTIONS.map()` without any filtering (line 631 of AppShell). The plan needs to specify how conditional visibility works: either add a `visible?: () => boolean` property to `SettingsSection`, filter the array in AppShell based on `window.__HYPERIDLE__?.platform === "electron"` and backend mode, or use a separate conditional rendering approach. Without this, the "worker" nav item would appear for all users including browser-only users.

## SUGGESTION

- [plan Task 7, line 556-561] **Specify error handling for `connect()` failure paths.** The implementation notes describe the happy path but not what happens when: (a) `POST /api/auth/worker-token` returns 404 (server doesn't support workers), (b) network error during POST, (c) WebSocket fails to connect. The builder needs guidance on whether to throw, set status to "disconnected", or surface an error message through `onStatusChange`. A one-sentence specification per failure path would suffice.

- [plan Task 10, line 588] **Specify behavior when `shared_backend_key` is missing at user-initiated enable.** The auto-start path handles this (line 592), but the `worker:enable` IPC handler should define what happens when the user clicks "Enable" but `shared_backend_key` isn't in safeStorage. Recommended: return an error via IPC that the UI can display.

- [plan Security table, line 646] **Verify auth middleware rate-limiting claim.** The table says "Inherits existing auth middleware rate limiting" but doesn't cite where in the auth middleware rate limiting actually exists. If the middleware doesn't rate-limit (many auth middlewares only authenticate, they don't rate-limit), this claim is false. The builder should verify and add rate limiting if absent.

- [plan Task 7, line 558] **Clarify single vs multiple adapter instances.** The implementation notes say "Use the shared ClaudeAgentSdkAdapter instance (created once in constructor)" but Risk 5 (line 722) says "Use a single ClaudeAgentSdkAdapter instance for all sessions." These agree, but the implementation note says "created once in constructor" while the class signature shows `credentialsPath` in options. The builder should understand the adapter is instantiated once with `SafeStorageCredentialResolver` and reused across concurrent sessions.

## What's Working Well

- **Plan reconciliation table** (lines 36-48) is excellent. Every spec assumption is checked against the actual codebase with file references and line numbers. This is how plans should ground themselves -- it prevents CC-007 (spec/codebase drift) entirely.

- **Decision design-it-twice quality.** All 6 design decisions show genuine alternatives with real trade-offs. Decision 6 (Pause semantics) is particularly good -- it evolves through 4 approaches with clear reasoning for why each intermediate option was rejected, landing on the simplest correct solution. This is what the rubric wants: not theatre, but actual design exploration that converges.

- **Ordered task list with explicit dependencies.** The DAG is correct: Tasks 0/1/4/5/6/8/9 are independent roots; Tasks 2->3 chain through protocol; Task 7 depends on 5+6; Task 10 depends on 7+8; Task 11 depends on 9. A builder can parallelize the independent roots without reading the whole plan.
