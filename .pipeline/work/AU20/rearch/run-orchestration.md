# session-runtime (run-orchestration) — Service-as-Product Re-Architecture (AU20)

**Layer:** agent-orchestration · **Owned tables:** 0 · **Substrate:** PURE INTERNAL LOGIC (owned algorithm)
**Merge anchor:** session-runtime = run-orchestration + session-lifecycle + context-assembly + capture-writeback (all four already folded into this package; barrel `@lore AU20 B2a/b/c`).
**Now:** 56 methods / 118 types (public surface). **Target:** 6 methods / 8 types.

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

### Genuine owned capability beyond the floor (+2)
- **SessionActivityBuffer** — the in-memory ring buffer of live tool-call activity per running session, read by the sessions route for the "watch a running agent" live feed. It is a genuinely-owned observation capability, not part of the terminal state machine. Public methods: `record` + `snapshot` → **+2**.

Everything else the four members expose (context assembly, provisioning, writeback processing, the reapers, recovery sweeps, the terminal-CAS writer) is an **internal stage** of one of the four floor ops — not an independent product entry point.

**Inside-out target = floor (4) + 2 owned = 6 methods.**

---

## 2. OUTSIDE-IN — the real consumer demand

From the demand data + live call-site audit (route/server-factory, not test/binding scaffolding):

- **`dispatch` (only peer-service consumer):** requests exactly **one** capability — `executeAgentRunRequest` (execute a claimed run) — and *provides* an `onHarnessStarted` callback. → **run**.
- **Composition root (`server-factory.ts`):** calls `bootAgentLayer` once (live, `:898`) to stand up the agent layer; wires `registerCaptureWriteback`, the reapers, and `registerWorkerWsRoute`. → all **start**.
- **`session-lifecycle-bindings` (composition root):** exposes `requestAgentTermination` / `transitionAgentRunLifecycle` / `endSession` / `crashSession` for the handoff-protocol, cost-cap, and stop paths; `startSessionProvision` (explicit HTTP session start) and `provisionSession` (dispatcher path). → **transition** + **run**.
- **`app.ts` / `sessions-routes.ts`:** construct + read a `SessionActivityBuffer` for the live activity feed. → **observe**.
- **`getAgentRunLifecycle` / `listAgentRunLifecycleBySource`:** re-exported through bindings but **never called by any route, server-factory, or app** — knip-blind dead code (verified: zero live call sites). → **DELETE**.

The real demand is a **handful of entry points**, not 56. Over half the current surface is `context-assembly`/`capture-writeback` internal stages, provisioning sub-steps, DI mirror types, and dead reads — never a peer-service demand.

---

## 3. THE COHERENT PRODUCT API (fused)

Four entry points. Parameterized by intent/spec — never a method per source-kind or per caller.

| # | Interface | Shape | Lens | Comes from |
|---|-----------|-------|------|------------|
| 1 | **runSession** | `runSession(deps, request, options) → RunResult` | both | floor `run` + the `dispatch` demand. `request.sourceKind` (task/routine/assistant/explicit-start) + `options` (`detachAfterAdmission`, `modelTier`, `sessionWorkflow`, `conversational`, `enforceResolvedModelGuard`) select behavior — no per-source method. Subsumes the whole claim→assemble→provision→run→terminalize pipeline. |
| 2 | **transitionRun** | `transitionRun(deps, spec) → RunTransition` | both | floor `transition` + the handoff/cost-cap/stop/shutdown demand. `spec` is a discriminated union over the terminal targets: `{target:"request", requestId, intent:"request-termination"|"terminalize", reason?, state?, sessionId?/claimToken?}` or `{target:"session", context, disposition:"end"|"crash", outcome?}`. One general transition covers every terminal path through the single writer. |
| 3 | **startRuntime** | `startRuntime(deps) → RuntimeHandle { dispose() }` | both | floor `start`+`dispose` + the boot demand. Owns the full background resource: initial recovery sweep (orphaned-run adopt-or-RUNTIME_LOST + durable-termination replay + terminal-intent reap), the 1s drain loop, the sandbox + routine-session reapers, the capture-writeback subscriber, and the remote-worker WS ingress. `dispose()` runs graceful shutdown. |
| 4 | **SessionActivityBuffer** | `class { record(entry); snapshot(sessionId) }` | outside-in | genuine owned capability — the live-activity feed for a running session. |

**Public types (8):** `RunResult`, `RunOptions`, `RunTransitionSpec`, `RuntimeDeps`, `RuntimeHandle`, `RuntimePorts` (one consolidated DI-ports type), `SessionActivityEntry`, `AgentTerminationReason` (the reason enum, load-bearing across transition callers).

---

## 4. TARGET NUMBERS & what is deleted vs internalized

- **targetMethods = 6** = floor 4 (`runSession`, `transitionRun`, `startRuntime`, `RuntimeHandle.dispose`) + 2 owned (`SessionActivityBuffer.record` / `.snapshot`). Down from **56**.
- **targetTypes = 8** (§3). Down from **118**.

**DELETED (capability removed — zero live consumers):**
- `getAgentRunLifecycle`, `listAgentRunLifecycleBySource` + `AgentRunLifecycle` / `AgentRunLifecycleState` + their `run-orchestration-bindings` wrappers. Dead. If a run-status surface is ever built, it starts from a real consumer as a single `listAgentSessionRequests(filter)` on **`session-requests`** (the table's owner) — not here.

**INTERNALIZED (behavior kept, de-exported — this is the merge win, not deletion):**
- **context-assembly → 0 public methods.** All 11 `ContextAssemblyOps` methods (`assembleAgentContext`, `assemblePrompt`, `buildSessionContextData`, `writeSandboxAgentsMd`, `composeAssistantPrompt`, …) + ~15 `ContextAssembly*`/`Manifest`/`Prompt*` types become the internal *assemble* stage of `runSession`.
- **capture-writeback → 0 public methods.** `processWriteback`, `readManifest`, `writeManifest`, `isKnowledgePath`, `isSessionNotesPath`, `registerCaptureWriteback` + ~10 `CaptureWriteback*` types become the internal writeback subscriber wired inside `startRuntime`.
- **provisioning steps** (`admitSession`, `runSession`(prov), `provisionSession`, `startSessionProvision`, `mountFilesystemsForAgent`, `captureMountedFilesystems`, `reserveOrAdoptSession`, `admitOnlyWithRequestLease`, `consumeAgentSessionRequest`, `executeAgentRunRequest`) → private inside `runSession`.
- **boot/recovery/reap** (`drainAgentSessionRequests`, `recoverRunningAgentSessionRequests`, `recoverRequestedTerminations`, `markRunningAgentSessionRequestsForShutdown`, `startSandboxReaper`, `reapSandboxesOnce`, `reapStaleRoutineSessions`, `registerWorkerWsRoute`, `WorkerConnectionManager`, `AGENT_LAYER_REAP_INTERVAL_MS`, `SANDBOX_REAPER_INTERVAL_MS`) → private phases inside `startRuntime`.
- **terminal writer + teardown** (`transitionAgentRunLifecycle`, `requestAgentTermination`, `endSession`, `crashSession`, `TERMINATION_REASONS`/`DISPOSITIONS`) → collapse behind `transitionRun`.
- **`classifyAdmissionFailure` + `AgentAdmissionFailureCode`** → private helper in the drain loop (sole call site `agent-layer-boot.ts:106`).
- **17 DI port/mirror types + ~40 Provision*/SessionContext*/Deps types** → one internal `RuntimePorts` + internal wiring; the 8 `session-lifecycle`-facing ports evaporate (now intra-package direct calls).

**No capability lost.** Every real feature still reachable — see §5.

---

## 5. LEAN *AND* COMPLETE — every real feature survives

| Real user feature | Delivered through |
|---|---|
| Run a task / routine / assistant / explicit-start | `runSession` (`request.sourceKind` + `options`) |
| Explicit HTTP session start (guarded, detached) | `runSession` with `{detachAfterAdmission, enforceResolvedModelGuard}` |
| User stops / hands off / crashes a run; cost-cap; shutdown | `transitionRun(spec)` (discriminated over request/session targets) |
| Boot the agent layer on server start | `startRuntime` |
| Graceful shutdown of in-flight runs | `RuntimeHandle.dispose()` |
| Recover orphaned runs after a crash | initial sweep inside `startRuntime` |
| Reap stale sandboxes / routine sessions | reaper phases inside `startRuntime` |
| Remote worker connects over WS | worker ingress inside `startRuntime` |
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

The current 56 is the sum (ContextAssemblyOps 11 + provisioning 6 + lifecycle 6 + boot 6 + reapers 4 + writeback 6 + activity 2 + dead reads 2 + …). The product is **6**: `runSession` · `transitionRun` · `startRuntime`/`dispose` · `SessionActivityBuffer`. Scaling test holds — a new run source adds a `sourceKind` value, a new background concern adds a private phase inside `startRuntime`, a new terminal cause adds a `reason` to `transitionRun`'s spec: **zero new public methods**.
