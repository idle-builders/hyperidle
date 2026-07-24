# session-runtime (run-orchestration) — Service-as-Product Re-Architecture (AU20)

**Layer:** agent-orchestration · **Owned tables:** 0 · **Substrate:** PURE INTERNAL LOGIC (owned algorithm)
**Merge anchor:** session-runtime = run-orchestration + session-lifecycle + context-assembly + capture-writeback (all four already folded into this package; barrel `@lore AU20 B2a/b/c`).
**Now:** 56 methods / 112 types = 168 (implementation-site census). **Corrected target:** 9 methods / 8 types = 17.

**Planner escalation ruling:** the former `4m` target counted only the product barrel, but the census deliberately counts declarations in every implementation module. TypeScript has no package-private cross-module symbol: a four-declaration implementation therefore requires concatenating roughly 6,500 retained lines into the four public files, or retaining private-stage files by merely stripping/evading their exports. Both contradict this rewrite: the first recreates the merge-anchor monolith, and the second is forbidden metric gaming. The honest target counts four public product declarations plus five newly written, cohesive internal component seams (§3). It does not preserve any legacy per-caller function or type mirror.

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

### Genuine owned capability beyond the floor (+1 public declaration)
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
- **Context assembly endpoint / R7:** requests the assembled session context directly without admitting or executing a harness. This is a genuine preview/inspection mode of the same run pipeline, delivered by `runSession({ mode: "assemble", ... })`; it does not justify exporting the context component or restoring its per-step façade.
- **`session.ts` / `@hyperidle/eval`:** run task-free or independently seeded one-shot sessions without a pre-existing durable `AgentSessionRequest`; eval waits for the complete harness result. They migrate to `runSession({ mode: "one-shot", completion: "await", ... })`. Explicit-start paths use `completion: "admit"` where the caller must return after custody/admission. Neither path imports an internal factory nor boots a runtime per call.
- **`getAgentRunLifecycle` / `listAgentRunLifecycleBySource`:** re-exported through bindings but **never called by any route, server-factory, or app** — knip-blind dead code (verified: zero live call sites). → **DELETE**.

The real demand is a **handful of entry points**, not 56. Over half the current surface is `context-assembly`/`capture-writeback` internal stages, provisioning sub-steps, DI mirror types, and dead reads — never a peer-service demand.

---

## 3. THE COHERENT PRODUCT API (fused)

Four public entry points, backed by five cohesive internal module seams. Parameterized by intent/spec — never a method per source-kind or per caller.

| # | Interface | Shape | Lens | Comes from |
|---|-----------|-------|------|------------|
| 1 | **runSession** | `runSession(deps, spec: RunOptions) → RunResult` | both | floor `run` + dispatch, direct assembly, and one-shot demand. `RunOptions` is a discriminated operation spec: `mode:"durable"` carries an existing request and preserves claim/lease custody; `mode:"one-shot"` carries direct session input and `completion:"admit"|"await"`; `mode:"assemble"` carries context input and stops after assembly. Source kind, model/workflow/conversational options, and resolved-model guard remain fields on the applicable variants—never separate methods. The durable variant drives claim→assemble→provision→run→terminalize; one-shot drives assemble→provision→run without inventing a durable request; assemble returns the exact internal assembly product without admission. Overload signatures may narrow each variant/result, but all overloads share this one implementation declaration and census name. |
| 2 | **transitionRun** | `transitionRun(deps, spec) → RunTransitionResult` | both | floor `transition` + the handoff/cost-cap/stop/shutdown demand. `spec` is a discriminated union over the terminal targets: `{target:"request", requestId, intent:"request-termination"|"terminalize", reason?, state?, sessionId?/claimToken?}` or `{target:"session", context, disposition:"end"|"crash", outcome?}`. One general transition covers every terminal path through the single writer. |
| 3 | **startRuntime** | `startRuntime(deps) → RuntimeHandle { registerWorkerWebSocket(...); dispose() }` | both | floor `start`+`dispose` + the boot demand. Owns the full background resource: initial recovery sweep (orphaned-run adopt-or-RUNTIME_LOST + durable-termination replay + terminal-intent reap), the 1s drain loop, the sandbox + routine-session reapers, the capture-writeback subscriber, and remote-worker ingress. The worker router exists only inside `createApp`'s registration callback, after runtime boot begins, so the handle exposes the registration affordance used by that callback; hiding `registerWorkerWsRoute` without preserving this timing is lossy. `dispose()` gracefully shuts down all successfully-started resources and is idempotent. |
| 4 | **SessionActivityBuffer** | `class { start(); stop(); getActivity(sessionId) }` | outside-in | genuine EventBus-backed live-activity feed; bounded FIFO, defensive snapshots, delayed eviction, and timer/subscription cleanup are part of the contract. |

**Public types (8):** `RunResult`, `RunOptions`, `RunTransitionSpec`, `RunTransitionResult`, `RuntimeDeps`, `RuntimeHandle`, `RuntimePorts` (one consolidated DI-ports type), `AgentTerminationReason` (the reason enum, load-bearing across transition callers). `AgentSessionRequest`, activity entries, Hono, and harness types are imported canonical types, not local mirrors.

`RunOptions` and `RunResult` are the public discriminated unions for all three run modes; direct assembly and one-shot execution add no type declarations. `RunResult` distinguishes `{ mode:"assembled", context }`, `{ mode:"admitted", sessionId }`, and `{ mode:"completed", ...harnessOutcome }`. `completion:"admit"` is valid only for executable modes and must retain background terminalization; `mode:"assemble"` never claims, admits, creates a session, starts a harness, or boots background machinery.

**Internal implementation declarations (5, census-visible but absent from the product barrel):**

| Declaration | Owns | Replaces |
|---|---|---|
| `createContextAssembler` | source-specific context, context assembly, AGENTS.md, session-context loading | context-assembly service/ops plus prompt/context helper exports |
| `createProvisioner` | admission, mounts, MCP/tool setup, harness event loop, teardown/capture | admit/run/provision/startSessionProvision and provisioning hook/type sprawl |
| `createWritebackProcessor` | manifest diff, knowledge conflict handling, notes, EventBus subscription/disposal | raw manifest/path/writeback functions and subscriber façade |
| `createWorkerIngress` | authenticated WS route, connection replacement/pause/resume/unregister, disposal | WorkerConnectionManager + registerWorkerWsRoute split surface |
| `createRuntimeReapers` | sandbox and routine reaping under one start/dispose resource | two reaper modules, interval constants, and one-shot/start variants |

These are fresh component factories with cohesive returned operations, not renamed legacy functions or barrels hiding old declarations. They are constructed through `RuntimeDeps` at the composition root and reused; callers never import a factory or invoke `startRuntime` merely to perform one operation. Queue draining/recovery stays private in the `startRuntime` implementation file; terminal/session teardown stays private in `transitionRun`; durable request custody and one-shot orchestration stay private in `runSession`. Cross-module shapes use the eight public contracts or canonical imported types—no new exported mirror types.

---

## 4. TARGET NUMBERS & what is deleted vs internalized

- **targetMethods = 9** = four public implementation declarations (`runSession`, `transitionRun`, `startRuntime`, `SessionActivityBuffer`) + the five necessary modular component declarations above. The census counts every exported implementation declaration even when absent from the product barrel; it does **not** count returned-object, handle, or class members separately. Down from **56** without concatenating the service or gaming visibility.
- **targetTypes = 8** (§3). Down from **112**.

**DELETED (capability removed — zero live consumers):**
- `getAgentRunLifecycle`, `listAgentRunLifecycleBySource` + `AgentRunLifecycle` / `AgentRunLifecycleState` + their `run-orchestration-bindings` wrappers. Dead. If a run-status surface is ever built, it starts from a real consumer as a single `listAgentSessionRequests(filter)` on **`session-requests`** (the table's owner) — not here.

**INTERNALIZED (behavior kept, de-exported — this is the merge win, not deletion):**
- **context-assembly → one internal component declaration.** All 11 `ContextAssemblyOps` methods (`assembleAgentContext`, `assemblePrompt`, `buildSessionContextData`, `writeSandboxAgentsMd`, `composeAssistantPrompt`, …) + ~15 `ContextAssembly*`/`Manifest`/`Prompt*` types are deleted and rewritten behind `createContextAssembler` as the internal *assemble* stage of `runSession`.
- **capture-writeback → one internal component declaration.** `processWriteback`, `readManifest`, `writeManifest`, `isKnowledgePath`, `isSessionNotesPath`, `registerCaptureWriteback` + ~10 `CaptureWriteback*` types are deleted and rewritten behind `createWritebackProcessor`, wired inside `startRuntime`.
- **provisioning steps** (`admitSession`, `runSession`(prov), `provisionSession`, `startSessionProvision`, `mountFilesystemsForAgent`, `captureMountedFilesystems`, `reserveOrAdoptSession`, `admitOnlyWithRequestLease`, `consumeAgentSessionRequest`, `executeAgentRunRequest`) → deleted and rewritten as `createProvisioner` plus private custody flow inside public `runSession`.
- **boot/recovery/reap** (`drainAgentSessionRequests`, `recoverRunningAgentSessionRequests`, `recoverRequestedTerminations`, `markRunningAgentSessionRequestsForShutdown`, `startSandboxReaper`, `reapSandboxesOnce`, `reapStaleRoutineSessions`, `registerWorkerWsRoute`, `WorkerConnectionManager`, `AGENT_LAYER_REAP_INTERVAL_MS`, `SANDBOX_REAPER_INTERVAL_MS`) → private phases behind `startRuntime`, `createRuntimeReapers`, and `createWorkerIngress`. Worker-route registration remains callable at the composition-root moment when the router exists.
- **terminal writer + teardown** (`transitionAgentRunLifecycle`, `requestAgentTermination`, `endSession`, `crashSession`, `TERMINATION_REASONS`/`DISPOSITIONS`) → collapse behind `transitionRun`.
- **`classifyAdmissionFailure` + `AgentAdmissionFailureCode`** → private helper in the drain loop (sole call site `agent-layer-boot.ts:106`).
- **17 DI port/mirror types + ~40 Provision*/SessionContext*/Deps types** → one consolidated public `RuntimePorts` boundary + private internal wiring; the 8 `session-lifecycle`-facing mirrors evaporate (now intra-package direct calls).

**Physical deletion boundary:** internalization means retaining behavior in one of the five newly composed components or a private stage beside its public operation—not retaining the old public implementation with its `export` removed. Delete the per-caller declarations, compatibility bindings, duplicate port/type mirrors, dead helpers, and obsolete modules they made necessary. The rewritten source should converge on the nine declarations named above; any additional legacy declaration is a target failure. A barrel-only change, a rename/file move, or a de-exported copy of the concatenated implementation fails even if the census drops.

**No capability lost.** Every real feature still reachable — see §5.

---

## 5. LEAN *AND* COMPLETE — every real feature survives

| Real user feature | Delivered through |
|---|---|
| Run a durable task / routine / assistant / explicit-start | `runSession({ mode:"durable", request, ... })` |
| Preview/inspect assembled context without execution | `runSession({ mode:"assemble", input })` |
| Run an eval or task-free one-shot and await its complete harness result | `runSession({ mode:"one-shot", completion:"await", input })` |
| Explicit HTTP session start (guarded, detached after admission) | `runSession({ mode:"durable"|"one-shot", completion:"admit", enforceResolvedModelGuard:true, ... })` |
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

The current 56 is the sum (ContextAssemblyOps 11 + provisioning 6 + lifecycle 6 + boot 6 + reapers 4 + writeback 6 + activity 2 + dead reads 2 + …). The product is **4 public declarations** backed by **5 internal component declarations**: `createContextAssembler` · `createProvisioner` · `createWritebackProcessor` · `createWorkerIngress` · `createRuntimeReapers`. `dispose`, worker registration, and component operations are members of coherent resources, not additional census declarations. Scaling test holds — a new run source adds a `sourceKind` value, a new background concern adds a private phase/member, a new terminal cause adds a `reason`: **zero new public declarations** and normally zero new implementation declarations.

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
10. **Operation modes do not bleed.** Direct assembly performs no claim/session/admission/harness/startup side effect. One-shot execution needs no durable request and preserves the former task-free provision result. Durable execution alone enforces request custody. `completion:"await"` blocks through teardown; `completion:"admit"` returns after admission while the owned background path still terminalizes.

## 8. Consumer migration ruling (planner escalation round 2)

- Delete the 741-line compatibility façade. Do not reproduce `assembleContext`, `admitSession`, `provisionSession`, `startSessionProvision`, or the old split `runSession` as core-api exports.
- Build the production `RuntimeDeps`/ports once at the composition root. Dispatch calls the durable `runSession` variant. The context endpoint/R7 calls the assemble variant. Session/eval callers call the one-shot variant with explicit completion semantics. Routes performing termination call `transitionRun`.
- `packages/core-api/src/session.ts` may remain a package subpath that re-exports canonical harness adapter types and the single public `runSession` operation; it must not define a provisioning wrapper or expose internal component operations.
- Tests migrate to the public operation variants or test a newly written component through its one cohesive factory. Old test imports do not justify compatibility declarations.
- Census target remains **9m/8t = 17**: this ruling adds modes/overloads to the existing `runSession` declaration and unions to the existing `RunOptions`/`RunResult` declarations. Overload declarations are name-deduplicated by the census. No new implementation or type declaration is authorized.

## 9. Physical-deletion ruling (planner escalation round 3)

The service is a **merge anchor**, so its honest destruction proof is not a generic
"delete another 1,500 lines" quota. The old source contains approximately 6.5k lines
of demanded runtime behavior; the rewritten product still has to perform that behavior.
The current provisioner alone contains roughly 1.8k behavior lines for admission,
custody/concurrency, model resolution, session reservation, context handoff, filesystem
mount/capture, MCP/tool setup, harness observation, return enforcement, cost accounting,
abort, terminalization, and teardown. Those capabilities are pinned by the completeness
contract and live consumers. `HarnessPort` begins **after** provisioning and abstracts
harness execution only. Moving provisioning into `harness-registry`, `core-api`, or a
shared utility would invert ownership rather than remove code. There is no existing
substrate component that provides the orchestration transaction.

**Adjudication: B — the ownership is correct; the fixed 1,500-line additional-deletion
expectation is wrong for this merge anchor.** Keep the exact surface target
**9m/8t = 17** and require an honestly net-negative complete increment. Acceptance is
based on physical removal of the old declarations/modules/facades, not on pretending
retained demanded behavior is removable. Count untracked replacement files when
reporting the diff. The final all-file diff must remain net-negative; no positive or
break-even result is accepted. A reviewer must not demand deletion of a pinned behavior
solely to enlarge the line delta.

### Exact safe-removal budget still required

Before final review, remove all of the following where present; these are undemanded
representation, not runtime capability:

- historical AU19 migration essays, duplicated section banners, and comments describing
  deleted filenames/interim ownership (retain only short current `@lore` where the reason
  remains surprising);
- private forwarding wrappers that only reshape arguments for `transitionRun`
  (`requestAgentTermination`, `endSession`, `crashSession`) by calling the coherent
  operation directly at their sole sites;
- alias-only names (`PortModelTier`, `PortResolvedModel`, `PortSessionOutcome`) and
  duplicate input/result mirrors where `Parameters<>`, `ReturnType<>`, canonical DB/shared
  types, or the already-defined operation spec express the same shape clearly;
- test-only compatibility branches and casts in production dependencies after every test
  has migrated to the new public operation or cohesive component factory;
- obsolete compatibility composition files and old per-caller modules already named in
  §4; none may survive as an unexported copy.

Do **not** delete or relocate admission/custody, cost/concurrency/model guards, session
reservation, context/prompt/AGENTS.md, filesystem/tool/MCP/connection setup, harness event
handling, return enforcement, writeback, abort/terminal teardown, recovery, worker ingress,
or reaping. These are the demanded owned algorithm. Concision refactors inside those paths
are welcome only when behavior remains pinned and the result is clearer; they are not an
architectural precondition measured by an invented line quota.
