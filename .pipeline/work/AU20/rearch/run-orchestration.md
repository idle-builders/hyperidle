# session-runtime (run-orchestration) — Service-as-Product Re-Architecture (AU20)

**Layer:** agent-orchestration · **Owned tables:** 0 · **Substrate:** PURE INTERNAL LOGIC (owned algorithm)
**Merge anchor:** session-runtime = run-orchestration + session-lifecycle + context-assembly + capture-writeback (all four already folded into this package; barrel `@lore AU20 B2a/b/c`).
**Now:** 56 methods / 112 types = 168 (implementation-site census). **Target:** 4 methods / 8 types = 12.

This is the failure the frame names: the four members were physically concatenated (barrel just re-exports each satellite's whole surface) but never designed as ONE product. The public count is the arithmetic sum of the parts. We design it inside-out from the substrate, then prove every real feature survives the collapse.

---

## 1. INSIDE-OUT — substrate, floor, owned capability

### Substrate = internal-logic (c): the agent-run lifecycle state machine
session-runtime owns **zero tables** and adapts **no single external system** as its base — it composes several through injected DI ports (`session-requests` queue, `harness-registry` execution seam, `filesystems`, `dispatch`, `routine`/`users` readers). Its substrate is the **owned algorithm**: the per-request run lifecycle with a **single-terminal-writer custody invariant** (`@lore AU9`):

```
claim → assemble context → provision (admit) → run (harness) → observe → capture writeback → terminalize
                                                                                  ↑ single terminal writer (CAS)
```

Everything the service genuinely owns is *this state machine and the background machinery that keeps it healthy* (crash recovery, drain loop, sandbox/routine reapers, writeback ingestion, remote-worker ingress).

### The floor — coherent op set of the algorithm (4 ops)
An internal-logic service's floor is the minimal coherent operation set of its algorithm. For a run lifecycle machine that is:

| Floor op | What it is |
|---|---|
| **run** | drive one claimed request through the whole pipeline to a terminal outcome |
| **transition** | move a run to a terminal disposition (request-terminalize / termination-request / session end/crash) via the single terminal writer |
| **start** | boot the background machinery (recovery sweep + drain loop + reapers + writeback subscriber + worker ingress) as one owned resource |
| **dispose** | graceful shutdown of that resource (mark-running-for-shutdown + clear timers) |

**Floor = 4.**

### Genuine owned capability beyond the floor (+1 declaration)
- **SessionActivityBuffer** — the in-memory ring buffer of live tool-call activity per running session, read by the sessions route for the "watch a running agent" live feed. It is a genuinely-owned observation capability, not part of the terminal state machine. It preserves the real EventBus-backed contract: `start()` subscribes, `stop()` unsubscribes and clears eviction timers, and `getActivity(sessionId)` returns a defensive insertion-ordered snapshot. Tool calls are recorded automatically, buckets retain at most 100 entries, and a session-end schedules eviction after five minutes.

Everything else the four members expose (context assembly, provisioning, writeback processing, the reapers, recovery sweeps, the terminal-CAS writer) is an **internal stage** of one of the four floor ops — not an independent product entry point.

**Inside-out target = floor (4) + 2 owned = 6 methods.**

---

## 2. OUTSIDE-IN — the real consumer demand

From the demand data + live call-site audit (route/server-factory, not test/binding scaffolding):

- **`dispatch` (only peer-service consumer):** requests exactly **one** capability — `executeAgentRunRequest` (execute a claimed run) — and *provides* an `onHarnessStarted` callback. → **run**.
- **Composition root (`server-factory.ts`):** calls `bootAgentLayer` once (live, `:898`) to stand up the agent layer; wires `registerCaptureWriteback`, the reapers, and `registerWorkerWsRoute`. → all **start**.
- **`session-lifecycle-bindings` (composition root):** exposes `requestAgentTermination` / `transitionAgentRunLifecycle` / `endSession` / `crashSession` for the handoff-protocol, cost-cap, and stop paths; `startSessionProvision` (explicit HTTP session start) and `provisionSession` (dispatcher path). → **transition** + **run**.
- **`app.ts` / `sessions-routes.ts`:** construct, start, stop, and read a `SessionActivityBuffer` for the live activity feed. → **observe**.
- **`@hyperidle/eval`:** calls provisioning directly and waits for the complete harness result. It migrates to `runSession` with blocking semantics; it must not silently inherit the HTTP path's detached-after-admission behavior.
- **`getAgentRunLifecycle` / `listAgentRunLifecycleBySource`:** re-exported through bindings but **never called by any route, server-factory, or app** — knip-blind dead code (verified: zero live call sites). → **DELETE**.

The real demand is a **handful of entry points**, not 56. Over half the current surface is `context-assembly`/`capture-writeback` internal stages, provisioning sub-steps, DI mirror types, and dead reads — never a peer-service demand.

---

## 3. THE COHERENT PRODUCT API (fused)

Four entry points. Parameterized by intent/spec — never a method per source-kind or per caller.

| # | Interface | Shape | Lens | Comes from |
|---|-----------|-------|------|------------|
| 1 | **runSession** | `runSession(deps, request, options) → RunResult` | both | floor `run` + the `dispatch` demand. `request.sourceKind` (task/routine/assistant/explicit-start) + `options` (`detachAfterAdmission`, `modelTier`, `sessionWorkflow`, `conversational`, `enforceResolvedModelGuard`) select behavior — no per-source method. Subsumes the whole claim→assemble→provision→run→terminalize pipeline. |
| 2 | **transitionRun** | `transitionRun(deps, spec) → RunTransitionResult` | both | floor `transition` + the handoff/cost-cap/stop/shutdown demand. `spec` is a discriminated union over the terminal targets: `{target:"request", requestId, intent:"request-termination"|"terminalize", reason?, state?, sessionId?/claimToken?}` or `{target:"session", context, disposition:"end"|"crash", outcome?}`. One general transition covers every terminal path through the single writer. |
| 3 | **startRuntime** | `startRuntime(deps) → RuntimeHandle { registerWorkerWebSocket(...); dispose() }` | both | floor `start`+`dispose` + the boot demand. Owns the full background resource: initial recovery sweep (orphaned-run adopt-or-RUNTIME_LOST + durable-termination replay + terminal-intent reap), the 1s drain loop, the sandbox + routine-session reapers, the capture-writeback subscriber, and remote-worker ingress. The worker router exists only inside `createApp`'s registration callback, after runtime boot begins, so the handle exposes the registration affordance used by that callback; hiding `registerWorkerWsRoute` without preserving this timing is lossy. `dispose()` gracefully shuts down all successfully-started resources and is idempotent. |
| 4 | **SessionActivityBuffer** | `class { start(); stop(); getActivity(sessionId) }` | outside-in | genuine EventBus-backed live-activity feed; bounded FIFO, defensive snapshots, delayed eviction, and timer/subscription cleanup are part of the contract. |

**Public types (8):** `RunResult`, `RunOptions`, `RunTransitionSpec`, `RunTransitionResult`, `RuntimeDeps`, `RuntimeHandle`, `RuntimePorts` (one consolidated DI-ports type), `AgentTerminationReason` (the reason enum, load-bearing across transition callers). `AgentSessionRequest`, activity entries, Hono, and harness types are imported canonical types, not local mirrors.

---

## 4. TARGET NUMBERS & what is deleted vs internalized

- **targetMethods = 4** = four implementation-site declarations: `runSession`, `transitionRun`, `startRuntime`, and `SessionActivityBuffer`. The census counts exported function/const/class declarations; it does **not** count `RuntimeHandle.dispose()`, the worker-registration affordance, or class methods separately. Padding the service with two declarations to reach the old conceptual arithmetic is forbidden. Down from **56**.
- **targetTypes = 8** (§3). Down from **112**.

**DELETED (capability removed — zero live consumers):**
- `getAgentRunLifecycle`, `listAgentRunLifecycleBySource` + `AgentRunLifecycle` / `AgentRunLifecycleState` + their `run-orchestration-bindings` wrappers. Dead. If a run-status surface is ever built, it starts from a real consumer as a single `listAgentSessionRequests(filter)` on **`session-requests`** (the table's owner) — not here.

**INTERNALIZED (behavior kept, de-exported — this is the merge win, not deletion):**
- **context-assembly → 0 public methods.** All 11 `ContextAssemblyOps` methods (`assembleAgentContext`, `assemblePrompt`, `buildSessionContextData`, `writeSandboxAgentsMd`, `composeAssistantPrompt`, …) + ~15 `ContextAssembly*`/`Manifest`/`Prompt*` types become the internal *assemble* stage of `runSession`.
- **capture-writeback → 0 public methods.** `processWriteback`, `readManifest`, `writeManifest`, `isKnowledgePath`, `isSessionNotesPath`, `registerCaptureWriteback` + ~10 `CaptureWriteback*` types become the internal writeback subscriber wired inside `startRuntime`.
- **provisioning steps** (`admitSession`, `runSession`(prov), `provisionSession`, `startSessionProvision`, `mountFilesystemsForAgent`, `captureMountedFilesystems`, `reserveOrAdoptSession`, `admitOnlyWithRequestLease`, `consumeAgentSessionRequest`, `executeAgentRunRequest`) → private inside `runSession`.
- **boot/recovery/reap** (`drainAgentSessionRequests`, `recoverRunningAgentSessionRequests`, `recoverRequestedTerminations`, `markRunningAgentSessionRequestsForShutdown`, `startSandboxReaper`, `reapSandboxesOnce`, `reapStaleRoutineSessions`, `registerWorkerWsRoute`, `WorkerConnectionManager`, `AGENT_LAYER_REAP_INTERVAL_MS`, `SANDBOX_REAPER_INTERVAL_MS`) → private phases behind `startRuntime` and its handle. Worker-route registration remains callable at the composition-root moment when the router exists.
- **terminal writer + teardown** (`transitionAgentRunLifecycle`, `requestAgentTermination`, `endSession`, `crashSession`, `TERMINATION_REASONS`/`DISPOSITIONS`) → collapse behind `transitionRun`.
- **`classifyAdmissionFailure` + `AgentAdmissionFailureCode`** → private helper in the drain loop (sole call site `agent-layer-boot.ts:106`).
- **17 DI port/mirror types + ~40 Provision*/SessionContext*/Deps types** → one consolidated public `RuntimePorts` boundary + private internal wiring; the 8 `session-lifecycle`-facing mirrors evaporate (now intra-package direct calls).

**Physical deletion boundary:** internalization means retaining behavior in a newly composed private stage, not retaining the old public implementation with its `export` removed. Delete the per-caller declarations, compatibility bindings, duplicate port/type mirrors, dead helpers, and obsolete modules they made necessary. A barrel-only change, a rename, or a de-exported copy of the concatenated implementation fails this design even if the census drops.

**No capability lost.** Every real feature still reachable — see §5.

---

## 5. LEAN *AND* COMPLETE — every real feature survives

| Real user feature | Delivered through |
|---|---|
| Run a task / routine / assistant / explicit-start | `runSession` (`request.sourceKind` + `options`) |
| Run an eval and await its complete harness result | `runSession` with blocking/non-detached options |
| Explicit HTTP session start (guarded, detached) | `runSession` with `{detachAfterAdmission, enforceResolvedModelGuard}` |
| User stops / hands off / crashes a run; cost-cap; shutdown | `transitionRun(spec)` (discriminated over request/session targets) |
| Boot the agent layer on server start | `startRuntime` |
| Graceful shutdown of in-flight runs | `RuntimeHandle.dispose()` |
| Recover orphaned runs after a crash | initial sweep inside `startRuntime` |
| Reap stale sandboxes / routine sessions | reaper phases inside `startRuntime` |
| Remote worker connects over WS | worker registration affordance on the `RuntimeHandle`, backed by private ingress implementation |
| Agent writes knowledge to sandbox → ingested | writeback subscriber inside `startRuntime` |
| Assemble fabric context + AGENTS.md for a session | internal *assemble* stage of `runSession` |
| Live activity feed for a running session | `SessionActivityBuffer` |
| Read a run's status | **not this service** — `session-requests` owns `agentSessionRequests`; dead reads deleted |

Removing fragmentation, not capability.

---

## 6. UNIFIED ANCHOR — one product, not the sum

The four folded members map onto the **four floor ops of one algorithm**, so the merge is subtractive, not additive:

- **context-assembly** is the *assemble* phase of `run` → **0 public methods**.
- **capture-writeback** is the *capture* phase, wired as a subscriber inside `start` → **0 public methods**.
- **session-lifecycle** splits: its terminal writer + teardown become `transitionRun`; its recovery/reap sweeps become phases of `startRuntime`. Its 8 cross-package DI ports collapse to direct intra-package calls.
- **run-orchestration** is the `run` op itself + the drain loop inside `start`.

The current 56 is the sum (ContextAssemblyOps 11 + provisioning 6 + lifecycle 6 + boot 6 + reapers 4 + writeback 6 + activity 2 + dead reads 2 + …). The product is **4 implementation-site declarations**: `runSession` · `transitionRun` · `startRuntime` · `SessionActivityBuffer`. `dispose`, worker registration, and buffer operations are members of those coherent resources, not additional census declarations. Scaling test holds — a new run source adds a `sourceKind` value, a new background concern adds a private phase inside `startRuntime`, a new terminal cause adds a `reason` to `transitionRun`'s spec: **zero new public declarations**.

---

## 7. Correctness invariants the completeness contract must pin

1. **Custody before execution.** Admission requires the matching active claim; renew before admission and transition claimed→running with request id + claim token + active lease atomically. Concurrent reserve/adopt produces exactly one correlated session.
2. **Detached is not abandoned.** Detached HTTP execution returns only after admission/running custody. Its background failure still terminalizes durably. Eval uses blocking behavior and receives the complete result.
3. **One terminal writer.** The terminal transaction rereads the durable termination reason; that reason overrides a natural-completion guess. A stale token/session cannot terminalize. The successful request CAS precedes exactly one lifecycle publication/projection.
4. **Recovery.** Boot reconciles every running request: adopt an already-terminal correlated session; crash an active orphan or fail a missing runtime as `RUNTIME_LOST`; replay durable requested terminations without double execution.
5. **Shutdown and partial-start cleanup.** Shutdown persists its durable reason before cooperative abort. If any start phase fails, already-created timers, subscriptions, routes, and workers are rolled back. `dispose()` is idempotent and leaves no timer/subscription leak.
6. **All source behaviors survive.** Task, routine, assistant, explicit-start, model guard, prompt/context/AGENTS.md, filesystem mounts, MCP, cost/tool events, return enforcement, ingestion disposal, and terminal outcomes remain reachable through `runSession`.
7. **Writeback survives.** Manifest diffing, knowledge create/update conflict recording, session notes, subscriber error visibility, and disposer behavior remain intact.
8. **Worker ingress survives.** Token authentication, replacement, pause/resume, unregister, and route disposal remain testable through the runtime handle at the router-registration point.
9. **Activity survives.** EventBus subscription lifecycle, max-100 FIFO behavior, defensive snapshots, delayed eviction, and eviction-timer cleanup remain intact.
