# session-requests → **durable-agent-queue** — Product Re-Architecture (AU20)

**Layer:** agent-orchestration
**Merge anchor:** `durable-agent-queue` = `session-requests` + `trigger-resolution` + `lifecycle-projection`.
**Now:** 64 methods / 44 types (concatenated sum of the 3 folded parts).
**Target:** **16 methods / 8 types** — one coherent queue API over 5 owned tables.

---

## 0. Substrate

**Substrate = OWNED DB TABLES (5).** This is not an adapter over an external system and not free-floating logic — it owns 5 SQL tables and every operation is a durable read/write/transition over them. One small in-memory overlay (`sessionRunRegistry`, live run handles) is internal-logic, but it is a minor capability, not the substrate.

Owned tables:
| Table | Role in the queue |
|---|---|
| `agentWorkIntents` | **Ingress** — producers drop "an agent should run" facts here. |
| `agentSessionRequests` | **Core row** — the durable request + its lifecycle (queued → claimed → running → terminal). |
| `explicitSessionStarts` | **Ingress variant** — human/API "start a session now" admission records. |
| `triggerResolutionHistory` | **Admission ledger** — the decision "did this event warrant a request", recorded either way (idempotency). |
| `agentLifecycleInbox` | **Egress outbox** — terminal facts written for projection back to owning primitives (work/routine/explicit-start), then reaped. |

**Floor = ~5 × 5 tables = ~25 plain-CRUD operations.** That is the sanity anchor. The product lands BELOW it (16) because reads and lifecycle-writes collapse into parameterized interfaces, and only genuine queue capabilities (claim/lease, drain, reap) are added back.

---

## 1. INSIDE-OUT (anchor)

### Floor (naive CRUD, per table)
5 tables × {create, get, list, update, delete} ≈ 25 ops. But this substrate is a **durable work queue**, so the coherent CRUD collapses hard:

- **Reads** across all 5 tables → `findSessionRequest(query)` + `listSessionRequests(filter)`. (25's ~10 read ops → 2.)
- **Lifecycle updates** on `agentSessionRequests` + `explicitSessionStarts` (markRunning, terminalize, requestTermination, admit, fail, project) → one CAS-guarded `transitionSessionRequest(spec)`. (~7 update verbs → 1.)
- **Deletes** are not user deletes — they are TTL retention sweeps → `reapExpired`.

### Genuine owned capabilities beyond raw CRUD (why a queue ≠ 5 CRUD bags)
1. **Lease-based claiming** — `agentWorkIntents` and `agentSessionRequests` are worked concurrently; the queue owns lease acquisition/renewal/release with expiry. `claim / renew / release`. (Not expressible as plain update — it's compare-and-claim + lease token.)
2. **Intent drain** — the worker loop that atomically claims an intent, resolves authoritative input (fan-out to ~8 sibling services), resolves the trigger decision (writing `triggerResolutionHistory`), and creates the request. `drainIntents`. This is where `trigger-resolution` folds in — `resolveAndCreate` becomes an internal call, deleting the `session-requests ⇄ trigger-resolution` cycle.
3. **Lifecycle projection drain** — drain `agentLifecycleInbox`, project each terminal fact to its owning primitive, delete projected rows. `drainLifecycleProjections` (+ in-process scheduler bootstrap). This is where `lifecycle-projection` folds in, deleting the `session-requests ⇄ lifecycle-projection` cycle.
4. **In-memory run registry** — live run handles + abort signals (`sessionRunRegistry`). Internal-logic overlay, already the composable shape; kept.

---

## 2. OUTSIDE-IN (real demand)

From `consumers[]`:
- **Producers (`policy`, `work`, `dispatch`, `review`)** request exactly one thing: `record` an intent → the **ingress** (`enqueueWorkIntent`).
- **`run-orchestration` (the primary worker, 15+ methods)**: `find*`, `list*`, `claim*` / `release` / `renew` / `markRunning`, `drain`/`reap` intents, explicit-start `admit`/`fail`, plus termination `requestTermination` / `transitionAgentRunLifecycle` / `crashSession`. That is the whole **worker + lifecycle** surface — and it maps 1:1 onto `find/list/claim/transition/drain/reap`, never a method per verb.
- **`policy` `abort`** → the in-memory `sessionRunRegistry.abort`.

Every real demand is a value/filter/spec on a general interface — no consumer needs a bespoke method.

---

## 3. THE COHERENT PRODUCT API (fuses both lenses)

| # | Interface | Shape | Lens | From |
|---|---|---|---|---|
| 1 | `enqueueWorkIntent` | `(tx, intent: WorkIntentInput) → void` | both | `agentWorkIntents` ingress; subsumes the 4 producer `record` ports + `recordAgentWorkIntent` |
| 2 | `createSessionRequest` | `(exec, input: CreateSessionRequestInput)` — kind-tagged direct \| triggered \| explicit-start | inside | `agentSessionRequests`/`explicitSessionStarts` create + folded `createTriggeredAgentSessionRequest` |
| 3 | `findSessionRequest` | `(exec, q: FindQuery{by:'id'\|'idempotencyKey'\|'sessionId'\|'terminationReason'\|'explicitStart'\|'intentSource'\|'claimActive'})` | both | collapses 8 `find*`/`is*` reads across 4 tables |
| 4 | `listSessionRequests` | `(exec, {source?} \| {status:'running'})` | both | `listAgentSessionRequestsBySource`, `listRunningAgentSessionRequests` |
| 5 | `claimSessionRequest` | `(exec, {next}\|{id}, opts) → claim` | both | unifies request-claim + intent-claim: `claimNext*`, `claimById`, `claimAgentWorkIntent` |
| 6 | `renewClaim` | `(exec, token)` | inside | `renewAgentSessionRequestLease` + `renewAgentWorkIntentLease` |
| 7 | `releaseClaim` | `(exec, token)` | inside | `releaseRequestClaim` |
| 8 | `transitionSessionRequest` (+ `…InTx` overload) | `(exec, spec: SessionRequestTransition, deps?)` — discriminated `{to:'running'}` / `{to:terminal, precondition}` / `{to:'termination-requested'}` / `{target:'explicitStart', to:'admitted'\|'failed'}` | both | ONE state-machine writer; subsumes markRunning, terminalize(InTx), requestTermination, explicit-start admit/fail/project |
| 9 | `drainIntents` | `(deps) → void` | inside | worker loop; folds `resolveAuthoritativeInput` + trigger `resolveAndCreate` + `recordSessionForResolutionHistory` |
| 10 | `drainLifecycleProjections` | `(deps) → void` | inside | folds inbox insert/list/delete + projectors |
| 11 | `startLifecycleProjectionDrain` | `(deps) → stop` | inside | in-process scheduler bootstrap (genuine capability) |
| 12 | `reapExpired` | `(deps) → void` | inside | TTL sweep of terminal intents + projected inbox rows |
| 13–16 | `sessionRunRegistry` | object `{register, deregister, has, abort}` | both | in-memory live-run handles + abort (policy demand) |

Supporting exports (values/types, not methods): `AGENT_WORK_INTENT_KINDS`, `AGENT_WORK_INTENT_FAILURE_CODES` (closed vocab); types `WorkIntentInput`, `CreateSessionRequestInput`, `FindQuery`, `SessionRequestTransition`, `ClaimOptions`, `AgentLifecycleFact`, `AgentSessionRequest` (row), `DurableAgentQueueDeps`.

---

## 4. TARGET NUMBERS

- **targetMethods = 16** = floor-collapse (5) [enqueue, create, find, list, transition] + genuine queue capabilities (11) [claim, renew, release, drainIntents, drainLifecycleProjections, startProjectionDrain, reapExpired, + 4 registry ops]. Every one traces to an owned table or a genuine queue capability; none is per-caller.
- **targetTypes = 8**: `WorkIntentInput`, `CreateSessionRequestInput`, `FindQuery`, `SessionRequestTransition` (the discriminated union — arms are not separately counted), `ClaimOptions`, `AgentLifecycleFact`, `AgentSessionRequest` (row), `DurableAgentQueueDeps`.
- **vs floor 25:** below the naive CRUD floor despite 5 tables + a merge — reads (10→2) and lifecycle writes (7→1) parameterize, only real queue mechanics add back.

### DELETED (not internalized)
- **8 `find*`/`is*` functions** → deleted, replaced by `findSessionRequest(query)`.
- **7 lifecycle verbs** (markRunning, terminalize, terminalizeInTx, requestTermination, markExplicitStartAdmitted/Failed, projectExplicitStartTerminalState) → deleted, replaced by `transitionSessionRequest(spec)`.
- **4 producer `record` ports + `recordAgentWorkIntent`** → deleted → `enqueueWorkIntent`.
- **~21 exported `SessionRequests*Reader/Writer` DI port types** → deleted → one `DurableAgentQueueDeps`.
- **trigger-resolution public exports** (`resolveTriggerForSessionRequest`, `createTriggeredAgentSessionRequest`, `recordSessionForResolutionHistory`, 5 `TriggerResolution*` port types) → **internal** to `drainIntents`; barrel exports removed; the `⇄ trigger-resolution` cycle deleted.
- **lifecycle-projection public exports** (`insertLifecycleInboxFactIfAbsent`, `listProjectedLifecycleInboxBefore`, `deleteLifecycleInboxByRequestIds`, `drainAgentLifecycleInbox`, `AGENT_LIFECYCLE_PROJECTORS`, source-kind/state consts) → **internal** to `drainLifecycleProjections`; the `⇄ lifecycle-projection` cycle deleted.
- **Internal constants/types** (`AGENT_WORK_RETENTION_DAYS/BATCH_SIZE`, `AgentWorkIntentDb`, `MarkRequestRunningDeps`, worker option mini-bundles) → private.

---

## 5. UNIFIED ANCHOR — ONE product, not the sum

The three folded parts are **one durable-agent-queue** split only by table ownership:
- `triggerResolutionHistory` is the queue's **admission ledger** — the drain step "should this event become a request, record the decision, create if so." `trigger-resolution` was a separate service ONLY because it owned that one table; its sole caller was this service's drain, and it called back — a cycle that existed purely because of the table split. Folded in, it is an internal step of `drainIntents`.
- `agentLifecycleInbox` is the queue's **terminal-fact outbox** — this service is already its only writer; `lifecycle-projection` drained+projected it; this service's reaper deleted it. One mechanism, three fragments. Folded in, projection is an internal step of `drainLifecycleProjections`.

So the API is **ingress → worker → egress** over 5 tables behind one barrel: `enqueue` (in), `create/find/list/claim/transition/drainIntents` (work), `drainLifecycleProjections/reapExpired` (out), `sessionRunRegistry` (live overlay). **Not** the concatenated 108/64 methods of the parts — 16 coherent operations, and both former cross-service cycles vanish.

### Completeness (not lossy)
Every current real feature stays deliverable: producers still submit work (`enqueueWorkIntent`); the worker still claims/leases/runs/terminates (`claim/renew/release/transition`); triggered + explicit + direct starts all create (`createSessionRequest` kind-tagged); every lookup run-orchestration needs is a `FindQuery.by`/`list` filter; terminal facts still project to work/routine/explicit-start (`drainLifecycleProjections`); retention still sweeps (`reapExpired`); abort still works (`sessionRunRegistry.abort`). Adding a new producer, lookup dimension, or terminal disposition is a new value/discriminant — **zero new methods**.
