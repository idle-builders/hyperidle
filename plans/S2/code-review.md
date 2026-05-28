# S2 Code Review

**Reviewer:** Phase 4 (code against architecture plan)
**Branch:** `feat/S2-remote-execution`
**Diff:** 32 files changed, +4418 / -61
**Review round:** 2 (re-review after fixes)

---

## Verification Gates

- **TypeScript:** `npm run check` -- 0 errors
- **Lint:** `npm run lint` -- 0 errors (exit code 1 is pre-existing script issue on main)
- **Tests:** `npm run test` -- 5060 passed, 0 failed, 7 skipped

---

## Phase 2 Warnings -- Status

1. **`ServerRegisteredMessage` missing from union** -- ADDRESSED. `ServerRegisteredMessage` added to `ServerToWorkerMessage` union in `worker-protocol.ts:71-78`. Includes `@lore` comment documenting the gap.

2. **`streamEvents` return type mismatch** -- ADDRESSED. Both `RemoteHarnessAdapter.streamEvents` (line 81) and `IsolatedHarnessAdapter.streamEvents` (line 132) declare `AsyncIterable<HarnessEvent>`, matching the `HarnessAdapter` interface. Implementations use `AsyncGenerator` internally (which satisfies `AsyncIterable`).

3. **Test files referencing `harness`/`harnessAdapter` need updating** -- ADDRESSED. `session-provisioning.test.ts`, `R1-wire-agent-execution.test.ts`, and `session-provisioning.integration.test.ts` all updated to use `adapterPool` via `makePool()` helper wrapper. All pass.

---

## Round 1 Findings -- Fix Verification

### S2-F01 (MUST-FIX): Routes not wired -- FIXED

**What was wrong:** `createWorkersRoutes` and `registerWorkerWsRoute` were never called in production code. Both routes were dead code.

**Fix verification:**
- `app.ts:37` imports `createWorkersRoutes` from `./routes/workers.js`
- `app.ts:107-117` adds `registerWorkerWebSocket` optional hook to `AppOptions`, following the same pattern as `registerWebSocket` (placed before auth middleware)
- `app.ts:264-266` invokes `registerWorkerWebSocket(api)` before auth middleware, same position as user WS route
- `app.ts:338-342` mounts `createWorkersRoutes(options.adapterPool)` at `/workers` when `adapterPool` is provided
- `server-factory.ts:138-141` passes `registerWorkerWebSocket` hook calling `registerWorkerWsRoute(apiRouter, adapterPool, upgradeWebSocket)`
- The worker WS route is registered before auth middleware so workers authenticate via `HYPERIDLE_WORKER_TOKEN` query param without needing a user API key

**Verdict:** FIXED. Both routes are now wired in production. AC2 and AC5 are no longer dead code.

### S2-F07 (MUST-FIX): Remote adapter message routing disconnected -- FIXED

**What was wrong:** `WorkerConnectionManager.onMessage` only handled `register` messages. Post-registration runtime messages (event, session_result, error) were silently dropped, so `streamEvents()` on a remote adapter would hang forever.

**Fix verification:**
- `remote-harness-adapter.ts:193-195` adds `dispatchMessage(data: string)` public method that delegates to `handleMessage(data)`. Clean API surface -- the WS route layer can forward messages without reaching into the adapter's session map.
- `worker-ws.ts:67-68` adds `private adapter: RemoteHarnessAdapter | null = null` field to `WorkerConnectionManager`
- `worker-ws.ts:103-110` stores the adapter reference after creating it during registration
- `worker-ws.ts:120-125` routes non-register messages to `this.adapter.dispatchMessage(JSON.stringify(msg))` when the adapter is set. The re-serialization passes Zod-validated data to the adapter's parser.
- `worker-ws.ts:134` nullifies `this.adapter` on close
- Test `worker-ws.test.ts:239-330` adds 3 regression tests: event routing after registration, malformed message handling, and close cleanup

**Verdict:** FIXED. Runtime messages now flow from WS handler through manager to adapter to session queues. The test at line 239 proves the full path: register worker, start session, send event message via manager, consume from `streamEvents()`, complete session -- all passing.

### S2-F05 (SHOULD-FIX): No Zod validation -- FIXED

**What was wrong:** Worker WebSocket messages were parsed with `JSON.parse` + `as` casts, with no runtime shape validation. Malformed messages could propagate bad data into session routing.

**Fix verification:**
- `worker-ws.ts:26-57` defines 5 Zod schemas: `WorkerRegisterSchema`, `WorkerEventSchema`, `WorkerSessionResultSchema`, `WorkerErrorSchema`, and `WorkerToServerMessageSchema` (discriminated union)
- `worker-ws.ts:96-99` uses `WorkerToServerMessageSchema.safeParse(raw)` -- invalid messages return early, no throw
- All `as` casts removed from `WorkerConnectionManager.onMessage` -- the Zod-parsed `msg` is typed via discriminated union
- `WorkerRegisterSchema` validates non-empty `id`, non-empty `name`, positive integer `maxConcurrent`
- `WorkerEventSchema` and `WorkerSessionResultSchema` use `z.unknown()` for `event`/`result` fields -- this is correct because the adapter's `handleMessage` operates on these values downstream. Deep validation of `HarnessEvent` and `SessionResult` shapes would be ideal but is acceptable as deferred work since these values are consumed by the adapter's own code, not stored or forwarded externally.
- Test at line 299 verifies malformed messages are silently dropped without throwing

**Verdict:** FIXED. The trust boundary at the WS route now has Zod validation. Remaining `as` casts in `remote-harness-adapter.ts:handleMessage` operate on Zod-validated, re-serialized JSON and are acceptable.

### S2-F03 (SHOULD-FIX): maxMemoryMb not wired -- FIXED

**What was wrong:** `IsolationConfig.maxMemoryMb` was accepted but never passed to `fork()` as `--max-old-space-size`.

**Fix verification:**
- `isolated-harness-adapter.ts:81-84` now passes `execArgv: ['--max-old-space-size=${this.config.maxMemoryMb}']` to `fork()`
- `@lore` comment at line 77-79 documents the fix rationale
- Test at `isolated-harness-adapter.test.ts:106-148` ("passes --max-old-space-size to fork execArgv") verifies: creates adapter with `maxMemoryMb: 768`, starts a session, inspects `forkMock.mock.calls[0][2].execArgv` and asserts `--max-old-space-size=768` is present

**Verdict:** FIXED. Memory limit is now enforced via V8 flag.

### S2-F04 (SHOULD-FIX): SIGTERM instead of SIGKILL -- FIXED

**What was wrong:** Timeout used SIGTERM (catchable) instead of SIGKILL (unconditional). `stopSession` had no kill escalation.

**Fix verification:**
- `isolated-harness-adapter.ts:226` -- timeout handler now sends `SIGKILL` instead of `SIGTERM`
- `isolated-harness-adapter.ts:195-200` -- `stopSession` now starts a 5-second escalation timer that sends `SIGKILL` if the child hasn't exited
- `isolated-harness-adapter.ts:203-204` -- escalation timer is cleared when the session result arrives normally
- Test at line 264 verifies timeout sends SIGKILL: `expect(killMock!).toHaveBeenCalledWith("SIGKILL")`
- Test at line 270 ("escalates to SIGKILL after 5s if child does not exit") verifies: fake timers, advance 4999ms -- no SIGKILL yet, advance 1ms more -- SIGKILL sent

**Verdict:** FIXED. Timeout uses unconditional SIGKILL, stopSession escalates from IPC stop to SIGKILL after 5 seconds.

---

## Remaining Observations (non-blocking, carried from Round 1)

1. **S2-F02 (LOW):** `validate-env.ts` not updated for optional S2 env vars (`HYPERIDLE_WORKER_TOKEN`, `HYPERIDLE_SESSION_MAX_MEMORY_MB`, `HYPERIDLE_SESSION_MAX_DURATION_MS`). Minor plan deviation. Env vars are read inline from `process.env` where needed.

2. **S2-F06 (OBSERVATION):** Session dispatch tracking is naturally correct via per-adapter `activeSessions` maps. No cross-worker session hijacking possible.

3. **Latent shared-mode issue:** `createLocalAdapterPool` does not pass `credentialResolver` to `ClaudeAgentSdkAdapter`. Harmless for current local-mode deployment where both paths read `process.env.ANTHROPIC_API_KEY`. Will need addressing when shared-mode credentials come from the encrypted DB (P3).

4. **Remaining `as` casts:** 7 `as` casts remain across internal message handlers (`remote-harness-adapter.ts:207,215,218,221`, `isolated-harness-adapter.ts:242,245,249`). These all operate on trusted data (Zod-validated for remote adapter, IPC from self-forked child for isolated adapter). The `ws as never` cast in `worker-ws.ts:110` bridges Hono's WSContext to the adapter's WsLike interface -- acceptable since `dispatchMessage` is now the actual message path.

5. **Zod schemas use `z.unknown()` for `event` and `result` fields** in `WorkerEventSchema` and `WorkerSessionResultSchema`. This validates structure but not deep shape of `HarnessEvent`/`SessionResult`. Acceptable for now -- these are consumed by adapter code, not stored or forwarded. Could be tightened later.

---

## AC Completeness Audit (Round 2)

| AC | Description | Implemented | Tested | Verdict |
|----|-------------|-------------|--------|---------|
| AC1 | RemoteHarnessAdapter implements HarnessAdapter | Yes -- class exists, compiles, delegates over WS, `dispatchMessage` routes runtime msgs | Yes -- `remote-harness-adapter.test.ts` (8 tests) | PASS |
| AC2 | Worker connection protocol | Yes -- route wired in `server-factory.ts` via hook, auth via token, register/ack, runtime message routing via `dispatchMessage`, Zod validation | Yes -- `worker-ws.test.ts` (8 tests including F07 regression guards) | PASS |
| AC3 | Adapter pool & selection | Yes -- least-loaded, capacity filter, modelProviders filter, release | Yes -- `adapter-pool.test.ts` (15 tests), `adapter-pool-integration.test.ts` (4 tests) | PASS |
| AC4 | Server self-registration | Yes -- `createLocalAdapterPool()` registers local adapter, pool passed via `AppOptions` | Yes -- integration test verifies pool has 1 local entry | PASS |
| AC5 | Admin visibility | Yes -- `createWorkersRoutes` mounted at `/api/workers` in `app.ts`, guarded by `adapterPool` presence | Yes -- `workers.test.ts` (7 tests) | PASS |
| AC6 | Process isolation | Yes -- fork with env allowlist, `--max-old-space-size` memory limit, SIGKILL on timeout, 5s SIGKILL escalation on stopSession | Yes -- `isolated-harness-adapter.test.ts` (7 tests including F03/F04 regression) | PASS |
| AC7 | HarnessAdapter interface unchanged | Yes -- still 4 methods, `modelProviders` additive to capabilities | Yes -- `harness-capabilities.test.ts` (6 tests) | PASS |
| AC8 | Backward compatibility | Yes -- single-adapter pool works identically, existing test suite passes | Yes -- 5060 tests pass, integration test confirms single-adapter path | PASS |

---

## Verdict: DONE

All 5 findings from Round 1 are verified fixed. All 8 acceptance criteria pass with both implementation and tests. Verification gates are green (0 type errors, 0 lint errors, 5060 tests passing). The observations carried forward are non-blocking -- S2-F02 is a minor plan deviation, the shared-mode credential path is a future concern (P3), and the remaining `as` casts operate on trusted data boundaries.

Ready for `/ship`.
