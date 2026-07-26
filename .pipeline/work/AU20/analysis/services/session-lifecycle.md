# session-lifecycle — Service-as-Product Audit (AU20, rev. after review)

Layer: agent-orchestration · Current public exports: 29 · Owned tables: 0

## 1. Existence / Consolidation Verdict — **CONSOLIDATE** into `run-orchestration` (merged product: `session-runtime`)

### The product spine (this alone carries the verdict)
`session-lifecycle` and `run-orchestration` are the **two halves of one product: "execute an agent session request, end-to-end."**
- `run-orchestration` is the **custody front** — it drains the claimed-request queue, owns the single-writer consumption of a request, runs the worker WS route, and boots the agent layer.
- `session-lifecycle` is the **execution engine** — given an admitted request it provisions the sandbox (mount filesystems, resolve connections/MCP, assemble context, write harness config), runs the harness process, terminates it, and projects the terminal outcome.

There is no product seam between "take custody of a run request" and "actually run it." They are one arc — *admit → provision → run → terminate → project* — split across two packages by the **AU19 migration increment** (`@lore AU19 Increment 3i`: a behaviour-preserving *move* out of `packages/server/src/services/`), not by any difference in product purpose. Custody with nothing to execute, and execution with no custody, are each half a product. The merged `session-runtime` is the whole one.

This is the load-bearing reason. The earlier draft leaned on "zero tables," "exactly one consumer," and "merging deletes the port-mirror seam." **Those are dropped as justification** — they are tidiness signals the frame explicitly rejects, and (below) the single-consumer claim was factually wrong. The verdict rests on product purpose: one run flow, two packages.

### Correcting the "single consumer" error
The data package's `consumers` field captured only `run-orchestration`'s 4 port requests. That was an undercount. `session-lifecycle` has **multiple direct consumers** (verified in source, via the `session-lifecycle-bindings` composition shim, not through `run-orchestration`):
- **eval** — `provision-harness.ts:348` calls `provisionSession` directly (`@lore X7`: bypasses the Hono server / request queue to provision+run an ad-hoc eval scenario).
- **core-api `sessions-routes.ts`** (stop endpoint) — `:190`/`:219` `requestAgentTermination`, `:230` `transitionAgentRunLifecycle`.
- **core-api `policy/handoff-protocol.ts`** — `requestAgentTermination` (against-grain handoff edge).
- **core-api `server-factory.ts`** (composition root) — `:414` `startSandboxReaper`, `:369`/`:420` `reapStaleRoutineSessions`.

So the service is **not** a private appendage of `run-orchestration`. Consolidation is still right (one run product), but the merged `session-runtime` must keep a **real public API for these external occasions** — it does not collapse to an internal-only surface.

### Cluster hypothesis (`session-runtime` = run-orchestration + session-lifecycle [+ context-assembly])
- **run-orchestration + session-lifecycle: STRONG merge (high confidence)** on the product-purpose grounds above — custody-front and execution-engine of one run flow.
- **context-assembly: WEAKER, secondary.** A genuinely different concern (assembling the knowledge/prompt bundle, not managing a process). At MVP tier it *could* fold as an internal `assemble` stage, but that is the context-assembly planner's call and is **not required** for this verdict.

**Verdict: consolidate `session-lifecycle` into `run-orchestration` → `session-runtime`**, the single "execute an agent session request end-to-end" service of the agent-orchestration layer.

## 2. Deliberate Target Public API of merged `session-runtime` — **~5 exports (honest), down from 29**

Most of session-lifecycle's 29 exports are the concrete `HarnessPort` implementation (`admitSession`/`runSession`/`startSessionProvision`/`mountFilesystemsForAgent`/`captureMountedFilesystems` + their param/result/context types) — one implementor, one composer, both inside the merged package. They become **internal stages** of the run entries, not public surface. What survives as public API are the genuinely distinct external occasions:

### I1 — `executeAgentRunRequest(request) → RunOutcome`  *(queue-drain entry; run-orchestration's own)*
The single "run a claimed request" entry. Internally sequences admit → provision → run → terminate → project. Subsumes `admitSession`/`runSession`/`startSessionProvision`/`mountFilesystemsForAgent`/`captureMountedFilesystems` + their types as internal steps.

### I2 — `transitionRunLifecycle(runId, toState, reason?) → void`  *(the 5→1 collapse — the real win)*
The **one** CAS-guarded terminal writer, parameterized by target state + a shared reason vocabulary — the `transition(from,to)` north-star. It already exists as `transitionAgentRunLifecycle`; the per-intent siblings collapse into it:
- `requestAgentTermination(reason)` → a thin parameterized call (`transitionRunLifecycle(runId, terminalOf(reason), reason)`) — the variant `sessions-routes`, `policy`, and `run-orchestration` all call.
- `endSession`/`crashSession` → internal callers passing `completed`/`failed`.
- `recoverRequestedTerminations` → an internal boot replay of stored reasons through I2.
- `TERMINATION_REASONS`/`TERMINATION_DISPOSITIONS`/`AgentTerminationReason` → the `reason`/`toState` **parameter domain** (a shared vocabulary), not three exports.

Keeps the "once a reason is stored, its disposition wins" invariant in exactly one place.

### I3 — `provisionSession(...)`  *(direct-run entry — a genuinely distinct occasion, NOT reducible to I1)*
Provision + run **without** the request-custody queue. `executeAgentRunRequest` is defined over a *claimed request*; `provisionSession` is defined over an ad-hoc scenario with **no** request row (`@lore X7`, consumed directly by eval). Two legitimately different entry shapes — a general "run a queued request" and a general "provision+run this session spec directly" — not a method carved for one caller. Absorbs `ProvisionSessionDeps/Params/Result`, `SessionContext`, `BeforeHarnessStartContext`, `BeforeTeardownContext`, `IngestionHandle`, `EMITTED_ROOTS_MCP_JSON` as its parameter/result types.

### I4 + I5 — `startSandboxReaper(...)` + `reapStaleRoutineSessions(...)`  *(retention/janitor jobs — a distinct concern)*
Two background reclaimers wired by the **core-api composition root** on **independent cadences** (`server-factory.ts:414`/`420`), reclaiming different resources (sandbox dirs on disk vs. stale routine-session rows in the DB). They are **not** a stage of any single run's execution: `core-api/retention/retention-reaper.ts` explicitly "Mirrors `startSandboxReaper`," and `run-orchestration.bootAgentLayer` wires a *different* reaper (`reapTerminalAgentWorkIntents`, session-requests-owned). Because they run on their own schedule and are wired by the composition root, they stay public. (`SANDBOX_REAPER_INTERVAL_MS`/`SandboxReaperOptions`/`ReapStaleRoutineSessionsOpts` demote to config params.) *Architectural note: these two arguably belong in a `retention` service rather than `session-runtime` — a follow-up worth flagging, out of this verdict's scope.*

**Target public export count: ~5** — `executeAgentRunRequest`, `transitionRunLifecycle`, `provisionSession`, `startSandboxReaper`, `reapStaleRoutineSessions` — down from 29. (session-lifecycle contributes 4 of these; `executeAgentRunRequest` is run-orchestration's.)

## 3. Inside Lens
- **Files stay split by stage as internal modules.** admission / provisioning / lifecycle-transition become internal to `session-runtime`; adding a provisioning step or termination reason is a local edit, not a new export + a new mirror type in a consumer's `ports.ts`.
- **The port-mirror tax between the two halves disappears.** Today every session-lifecycle signature change forces a parallel edit to `run-orchestration/ports.ts`'s `RunOrchestration*` mirrors + composition-root bindings. Post-merge the internal boundary is a direct call. (An inside-lens *maintenance* win, not the reason to merge.)
- **The `HarnessPort` cross-process seam to agent-execution is preserved** as the merged service's *outbound* DI — it never required session-lifecycle to be its own package.
- **The retention jobs stay wired by the composition root**, keeping their cadence/config out of the run path — reinforcing they are a separate concern that could later migrate to `retention`.

## 4. Scaling Argument (sub-linear)
Add dozens of services and hundreds of calls:
- **A new way to run a session** (remote-worker, new sandbox provider) composes *inside* `executeAgentRunRequest`/`provisionSession` as another internal provisioning strategy — **no new public method**.
- **A new termination cause** (e.g. `policy_violation`) is a new entry in the `reason` vocabulary consumed by `transitionRunLifecycle` — **no new method**; the method-per-intent world would add `requestPolicyTermination`/`endForPolicy`.
- **A new consumer that must stop a run** calls the existing `transitionRunLifecycle(runId, "cancelled", reason)` — composes the general transition rather than getting a bespoke `stopXForY`.
Contrast the current shape, which already grew `requestAgentTermination` + `transitionAgentRunLifecycle` + `endSession` + `crashSession` + `recoverRequestedTerminations` — five exports for one state machine. That method-per-occasion growth is exactly what I2 removes. New use-cases compose from 5 general interfaces; the API grows sub-linearly.

## 5. Key Collapses
- **29 → ~5 public exports.** The `HarnessPort` implementation family (5 fns + ~9 types) becomes internal to `executeAgentRunRequest`/`provisionSession`; the transition family collapses 5→1.
- **5-into-1 transition collapse:** `requestAgentTermination` + `transitionAgentRunLifecycle` + `endSession` + `crashSession` + `recoverRequestedTerminations` → one parameterized `transitionRunLifecycle`.
- **Vocabulary, not exports:** `TERMINATION_REASONS`/`TERMINATION_DISPOSITIONS`/`AgentTerminationReason` demote to a shared reason/state param domain; the three reaper option/constant types demote to config params.
- **Deletes the run-orchestration↔session-lifecycle port mirror** (`ports.ts` `RunOrchestration*` types + composition-root bindings) — an inside-lens maintenance win from the merge.
- **Preserved as genuinely-distinct public occasions (NOT collapsed):** `provisionSession` (direct-run / queue-bypass, X7) and the two retention reapers (composition-root-wired, independent cadence) — real external demand, not per-caller methods.
