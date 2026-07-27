# run-orchestration — Service-as-Product Audit (AU20, rev. 2)

**Layer:** agent-orchestration (infra / platform product) · **Owned tables:** none · **Current public exports:** 36

> Rev. 2 addresses the adversarial review: two of the original five target interfaces were built on
> non-existent consumers. `listAgentRuns` (dead reads) is **dropped — flagged for deletion**, and
> `classifyAdmissionFailure` is **internalized**. Honest post-merge public surface is **~6**, not 10. The
> consolidate verdict and the two strong collapses (`runAgentSession`, `startAgentRuntime`) stand.

---

## 1. Existence / Consolidation Verdict

**Verdict: CONSOLIDATE** — fold `run-orchestration` + `session-lifecycle` (+ `context-assembly`) into one **`session-runtime`** service.

### What the service actually is
`run-orchestration` is the run-execution engine of the agent platform: it turns a *claimed* session
request into a live, tracked agent run. Concretely it (a) drives the per-request pipeline
claim → reserve-session → admit → run → terminalize (`consumeAgentSessionRequest` / `runClaimedRequest`),
(b) boots the whole drain + recovery + reap machinery (`bootAgentLayer`), and (c) hosts the remote-worker
WS ingress (`registerWorkerWsRoute`). It owns **zero tables** and composes four neighbours through DI
ports: `session-requests` (queue), `session-lifecycle` (session process mgmt + the single terminal writer),
`harness-registry` (execution seam), `dispatch` (assistant path).

### The demand signal contradicts the "36-export product" story
- **Only one *service* consumer:** `dispatch`, and it requests exactly **one** capability —
  `executeAgentRunRequest` — plus it *provides* an `onHarnessStarted` callback into deps. Everything
  else on the 36-export surface is consumed by the **server composition root** (boot wiring) or is
  **defined-but-never-called** binding scaffolding (see below), neither of which is a peer-service demand.
- So the true inter-service product is a **single method**. The other 35 exports are: ~8 boot/wiring
  functions for the app shell, **2 dead lifecycle-read functions**, **1 internal-only failure-classify
  helper**, ~4 leaked internal pipeline steps, and **17 DI port/mirror types** — over half the surface is
  Mechanism-C plumbing or dead code, not product API.

### Two exports were dead code wearing a product costume (review correction)
The rev. 1 design preserved `getAgentRunLifecycle` / `listAgentRunLifecycleBySource` as a "parameterized
read-model" and `classifyAdmissionFailure` as an "HTTP admission" helper. Both consumers are **fictional** —
verified repo-wide:
- **`getAgentRunLifecycle` + `listAgentRunLifecycleBySource`** — their core-api binding wrappers exist
  (`run-orchestration-bindings.ts:242` / `:249`) but are **never imported** anywhere. The claimed "HTTP
  run-status routes" consumer does not exist; only comments (`agent-session-requests.ts:29`,
  `run-orchestration-bindings.ts:3`) and no route reference them. They are **knip-blind dead code** (hidden
  behind the bindings indirection — knip sees the binding as "used" but nothing uses the binding). MVP
  calibration (ETHOS §1): dead code is **deleted**, not renamed into a nicer interface. → **DELETE.**
- **`classifyAdmissionFailure` (+ `AgentAdmissionFailureCode`)** — sole real call site is
  `agent-layer-boot.ts:106`, **inside** the internal drain loop; `classifyAdmissionFailure` is defined and
  consumed within the same module. The explicit-session-start route does not import it (only a test reaches
  it via a `boot` import). It is an **internal** of the run loop, not a product export. → **INTERNALIZE.**

### Challenging AU19's "single-writer custody" boundary claim
AU19 justifies the separate boundary as *"the single-writer custody boundary for run admission/execution."*
The code does not bear this out:
- The custody **table** (`agentSessionRequests`) is owned by **`session-requests`** (`claimNext` /
  `markRunning` / `releaseClaim` / `renewLease`). `run-orchestration` is a *consumer* of it.
- The **single terminal writer** (`transitionAgentRunLifecycle`) lives in **`session-lifecycle`** and is
  reached here only through a DI port.

So "single-writer custody" is a *discipline spread across three services*, straddling boundaries via ports —
which *weakens* the invariant. Merging the loop (`run-orchestration`) with the terminal writer + session
process management (`session-lifecycle`) puts the entire custody-transition path inside **one** boundary,
which *strengthens* the single-writer claim rather than relying on it as a reason to stay split.

### Cluster hypothesis evaluation (`session-runtime`)
The landscape hypothesis holds. `context-assembly` → `session-lifecycle` → `run-orchestration` → `dispatch`
is a linear pipeline where each of the first three has exactly **one** downstream consumer — the
composition-seam-as-boundary anti-pattern. These were carved as migration increments (`ports.ts` `@lore`:
"INTERIM forward-reference", "not-yet-migrated bulk"), not as products with independent consumers. One
`session-runtime` service with internal stages `assemble → admit → provision → run → terminate` loses no
capability and deletes the internal DI port sets between the merged members (§5). Genuinely-separate
neighbours remain ports: `session-requests` (durable-queue product, real second consumer
`trigger-resolution`), `harness-registry` (agent-execution platform, earned untrusted-worker seam),
`dispatch` (bidirectional caller). `context-assembly` folds in as the front stage.

---

## 2. The Deliberate Target Public API

Design from the *real demand* (execute a run · boot the runtime · accept a remote worker), not from the 36
carved exports. The rev. 1 read + classify interfaces are gone: they served no consumer.

| # | Interface | Shape | Subsumes (current exports) |
|---|-----------|-------|----------------------------|
| 1 | `runAgentSession` | `runAgentSession(deps, request, options) → RunResult` | `executeAgentRunRequest`, `consumeAgentSessionRequest`, `admitOnlyWithRequestLease`, `reserveOrAdoptSession`, `ConsumeAgentSessionRequestOptions`→`RunAgentSessionOptions` |
| 2 | `startAgentRuntime` | `startAgentRuntime(deps) → RuntimeHandle { dispose() }` | `bootAgentLayer`, `AgentLayerBootDeps`, `drainAgentSessionRequests`, `markRunningAgentSessionRequestsForShutdown`, `recoverRunningAgentSessionRequests`, `AGENT_LAYER_REAP_INTERVAL_MS` |
| 3 | `registerWorkerWsRoute` | `registerWorkerWsRoute(app, deps)` | `registerWorkerWsRoute`, `WorkerConnectionManager` (→ internal; test via route) |

**Retained public types (product-facing, justified):** `AgentRuntimeDeps` (#2), `RunAgentSessionOptions`
(#1), plus at most the `AgentRunLifecycle` / `AgentRunLifecycleState` state enum **only if** a live surface
still reads run state after the merge (currently none does — candidates for demotion to internal alongside
the deleted reads). `AgentAdmissionFailureCode` is **not** public (internal to the drain loop).

**Target public export count: ~6** (3 functions + ~3 shared types), down from 36.

### Where the other 30 go
- **17 DI port/mirror types → OUT of the public barrel.** Mechanism-C wiring consumed **only** by the
  composition-root binding file. Under the `session-runtime` merge the **8 `session-lifecycle`-facing** ones
  evaporate (direct internal calls); if worker-ws relocates to the harness-execution platform the **4
  harness-facing** ones go with it — leaving ~4-5 genuine cross-service DI types as internal wiring.
- **2 dead read functions** (`getAgentRunLifecycle`, `listAgentRunLifecycleBySource`) + their unused core-api
  binding wrappers → **DELETED** (zero live callers).
- **1 internal helper** (`classifyAdmissionFailure`) + `AgentAdmissionFailureCode` → **private** to the run
  loop.
- **4 internal pipeline steps** (`consumeAgentSessionRequest`, `admitOnlyWithRequestLease`,
  `reserveOrAdoptSession`, `ConsumeAgentSessionRequestOptions`) → private inside `runAgentSession`;
  `executeAgentRunRequest` today literally just forwards to `consumeAgentSessionRequest`
  (`agent-run-boundary.ts:81`).
- **5 boot knobs** collapse behind `startAgentRuntime`'s handle (recover / drain-loop / reap / graceful
  shutdown are internal phases).

---

## 3. Inside Lens — staying clean & evolvable

- **One entrypoint per occasion, internals free to move.** `runAgentSession` fronting the
  claim→reserve→admit→run→terminalize pipeline means the (delicate, `@lore AU9`-heavy) single-terminal-writer
  reconciliation can be refactored without touching any caller — today `admitOnlyWithRequestLease` /
  `reserveOrAdoptSession` being public freezes internal steps as contract.
- **Runtime as an owned resource.** `startAgentRuntime → { dispose() }` gives the lifecycle one owner: boot
  builds the recovery sweep + timers; dispose does the graceful shutdown sweep. `classifyAdmissionFailure`
  lives *inside* this loop as a private helper — new admission-error handling is an internal change, not a
  public-surface change. New background phases (e.g. lease-renewal sweep) are added inside the handle.
- **DI types stop being product surface.** Moving the 17 mirror types to an internal module means the barrel
  reflects *product capability*; Mechanism-C churn never re-inflates the census.
- **Consolidation removes a whole DI layer.** Merging with `session-lifecycle` turns 8 port-mirror
  round-trips into direct calls — fewer types to keep in sync, one place for custody logic.
- **Delete-don't-preserve discipline.** The dead reads are removed, not carried as "a read-model for later."
  If a run-status surface is ever actually built, it starts from a real consumer and lands as a single
  `listAgentRuns(db, filter)` — a *parameterized* interface, never a `listXByY` pair. That is a future build
  with a real demand signal, not present surface area.

---

## 4. Scaling Argument (sub-linear)

Apply the test: *add dozens more run sources and callers — do we grow methods?*

- **Execution:** a new run *source* (today: task, routine, assistant, explicit-start) does **not** add an
  `executeXRequest` method — it flows through the one `runAgentSession` with its `sourceKind` on the request.
  The assistant path already special-cases *inside* the loop, not via a second public method.
- **Boot:** a new background maintenance concern is a phase inside `startAgentRuntime`, invisible to callers.
- **Reads (hypothetical future):** *if* a run-status surface is ever built for a real consumer, it is a
  **new filter** into a single `listAgentRuns(db, filter)`, not a `listRunningByTeam` / `listFailedSince`
  method-per-query. It is not built now — no consumer exists — so it costs zero present exports.

Contrast the current trajectory: it carried `getAgentRunLifecycle` **and** `listAgentRunLifecycleBySource`
(method-per-query, and *dead*) plus a 17-strong DI-type set that grows one structural mirror **per neighbour
method touched** — the linear-growth failure mode. The 3-interface surface above absorbs new run sources and
maintenance phases with **zero** new exports — sub-linear by construction.

---

## 5. Key Collapses

1. **17 DI port/mirror types → ~0 public.** The single biggest reduction. 8 evaporate on merge with
   `session-lifecycle`; 4 leave with worker-ws to the harness platform; ~5 demote to internal
   composition-root wiring. Over half the export count was Mechanism-C scaffolding, never product API.
2. **6 boot/recovery/shutdown functions → 1 `startAgentRuntime` + handle.** `bootAgentLayer`,
   `drainAgentSessionRequests`, `recoverRunningAgentSessionRequests`, `markRunningAgentSessionRequestsForShutdown`,
   `AGENT_LAYER_REAP_INTERVAL_MS`, `AgentLayerBootDeps` collapse to one lifecycle owner.
3. **5 execution exports → 1 `runAgentSession`.** `executeAgentRunRequest` (+ its forwarded
   `consumeAgentSessionRequest`) and the leaked internal steps `admitOnlyWithRequestLease` /
   `reserveOrAdoptSession` / `ConsumeAgentSessionRequestOptions` become one entrypoint with private internals.
4. **2 dead read functions DELETED.** `getAgentRunLifecycle` + `listAgentRunLifecycleBySource` (+ unused
   core-api bindings) have zero live callers — removed, not preserved.
5. **`classifyAdmissionFailure` (+ `AgentAdmissionFailureCode`) internalized.** Sole call site is the drain
   loop (`agent-layer-boot.ts:106`) — a private helper, not a product export.
6. **`WorkerConnectionManager` de-exported.** Test-only public class becomes internal; `registerWorkerWsRoute`
   is the one ingress export (ideally relocates to the harness-execution platform with its 4 harness ports).

**Net: 36 → ~6 public product exports**, and the service dissolves its standalone boundary into
`session-runtime`.
