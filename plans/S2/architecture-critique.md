# Architecture Critique: S2

ARCHITECTURE-SCORE: 9/10  rounds=1  score-line: SA:9 LI:10 AC:8 DM:10 N:9 MD:8 FMC:8 S:8 V:8

---

## Dimension Scores

| # | Dimension | Score | Notes |
|---|-----------|-------|-------|
| 1 | Spec Alignment | 9 | Every AC maps to a task. No scope creep. Minor: "fall back to local" language from spec not reconciled. |
| 2 | Layer Integrity | 10 | All new code in server + shared. No cross-layer violations. Wire protocol types in shared for S4 reuse. |
| 3 | API Contracts | 8 | GET /api/workers fully specified. WS protocol is a closed union. Gap: `{ type: "registered" }` ack not in ServerToWorkerMessage. |
| 4 | Data Model Alignment | 10 | No schema changes. HarnessCapabilities additive field. Clean. |
| 5 | Naming | 9 | Names honest and descriptive. Good differentiation (Entry/Info/Meta/Requirements). No vocabulary conflicts. |
| 6 | Module Depth | 8 | AdapterPool, RemoteHarnessAdapter, IsolatedHarnessAdapter all deep. select()+release() two-call pattern is workable but lease would be deeper. |
| 7 | Failure-Mode Coverage | 8 | 9 security concerns addressed. Protected tests listed. Gaps: WS message size, IPC serialization format. |
| 8 | Simplicity | 8 | Design-it-twice genuine on both decisions. No over-engineering. IsolatedHarnessAdapter scoped correctly. |
| 9 | Verifiability | 8 | Every AC has concrete verification. Gaps: session-provisioning tests missing from protected/modified lists. |

---

## CRITICAL

None.

## WARNING

- [plan, Type signatures, ServerToWorkerMessage] The `{ type: "registered" }` ack message (connection lifecycle step 4) is not in the `ServerToWorkerMessage` union type. The union has `dispatch` and `stop` only. The builder will either need to add a `ServerRegisteredMessage` variant to the union or remove the ack from the protocol. Without this, the wire protocol types are incomplete and the worker cannot distinguish a successful registration from silence.

- [plan, Type signatures, RemoteHarnessAdapter] `streamEvents` is declared as returning `AsyncGenerator<HarnessEvent>` but the `HarnessAdapter` interface defines it as `AsyncIterable<HarnessEvent>`. The `RemoteHarnessAdapter` type signature must use `AsyncIterable<HarnessEvent>` to match the interface. The implementation can internally use `AsyncGenerator` (which satisfies `AsyncIterable`), but the declared return type in the plan's signature block should match the interface contract to avoid builder confusion.

- [plan, Protected tests] `session-provisioning.test.ts` and `session-provisioning.integration.test.ts` are not in the protected tests list but will be heavily impacted by the `harness` -> `adapterPool` rename. The plan should either add them to protected tests (if their behavioral assertions must not change) or add them to the Modified files table (if they need updating). Currently they exist in neither list. The same applies to `R1-wire-agent-execution.test.ts` which references `harnessAdapter` 8+ times.

## SUGGESTION

- [plan, Security] Consider adding a max WebSocket message size for the worker connection. A malicious or buggy worker could send multi-megabyte JSON payloads. A 1 MiB cap (matching `HYPERIDLE_MAX_BODY_BYTES` for HTTP) would bound memory pressure from a single message.

- [plan, Module Depth] The `select()` + `release(id)` two-call pattern requires callers to track the adapter ID for later release. A `PoolLease` return type bundling `{ adapter, release: () => void }` would make the release impossible to forget and eliminate the ID-tracking burden from `provisionSession`. Optional -- the current design works.

- [plan, Failure-Mode Coverage] The IPC channel between `IsolatedHarnessAdapter` and `isolated-session-worker.ts` should specify serialization format. Node.js IPC uses structured clone by default. If `HarnessEvent` objects contain only plain data (they do currently), this is safe, but the plan should state the assumption explicitly so future event type additions don't silently break serialization.

- [plan, Spec Alignment] The spec says "Fall back to local" for adapter selection. The plan's pool treats local and remote uniformly (correct) but does not document that "fall back to local" is satisfied by the local adapter being in the pool and selected when it's the least loaded available option. A one-line reconciliation note would prevent the builder from adding an explicit fallback path.

## What's Working Well

- **Plan reconciliation table** is precise and honest. Every spec assumption is checked against reality with specific line numbers. The `worker_token` gap from the concept doc is resolved cleanly (env var, not credential catalog) with clear rationale.

- **Design-it-twice** is genuine on both decisions. The rejected alternatives are real options with real trade-offs, not straw men. The selection rationale ties to scale expectations (teams of 2-10, 1-3 workers) rather than abstract preferences.

---

## Files Examined

- `plans/S2/architecture.md` -- the plan under critique
- `plans/S2/concept.md` -- concept verification
- `plans/work-packages/TRACK-S.md` -- S2 spec (lines 62-117)
- `plans/shared-server/concept.md` -- parent concept (locked)
- `packages/shared/src/harness/harness-adapter.ts` -- HarnessAdapter interface (4 methods, `streamEvents` returns `AsyncIterable`)
- `packages/shared/src/harness/harness-events.ts` -- HarnessEvent union (6 variants)
- `packages/shared/src/harness/mock-harness-adapter.ts` -- mock implementation
- `packages/shared/src/harness/index.ts` -- barrel exports
- `packages/shared/src/credential.ts` -- CREDENTIAL_NAMES (3 entries, closed)
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` -- reference implementation
- `packages/server/src/services/session-provisioning.ts` -- 11-phase orchestration, `ProvisionSessionDeps.harness`
- `packages/server/src/services/session-lifecycle.ts` -- SessionContext (with traceId), createSession, endSession, crashSession
- `packages/server/src/routes/ws.ts` -- user WebSocket pattern
- `packages/server/src/routes/sessions-routes.ts` -- SessionRouteDeps.harnessAdapter
- `packages/server/src/services/ws-broadcaster.ts` -- WsClient interface, WsBroadcaster
- `packages/server/src/app.ts` -- AppOptions.harnessAdapter (line 118)
- `packages/server/src/server-factory.ts` -- createServer, ClaudeAgentSdkAdapter instantiation (line 111)
- `packages/server/src/validate-env.ts` -- minimal (HYPERIDLE_API_KEY only)
- `packages/server/src/middleware/auth.ts` -- createAuthMiddleware, constantTimeStringEqual import
- `packages/server/src/middleware/timing-safe.ts` -- constantTimeStringEqual implementation
- `packages/server/src/__tests__/integration-helpers.ts` -- no harnessAdapter references
- `packages/server/src/__tests__/server-factory.integration.test.ts` -- subprocess-based integration tests
- `packages/server/src/__tests__/session-provisioning.test.ts` -- 18+ ProvisionSessionDeps constructions with `harness` field
- `packages/server/src/__tests__/R1-wire-agent-execution.test.ts` -- 8+ harnessAdapter references
