# session-requests — Service-as-Product Audit (AU20)

**Layer:** agent-orchestration (infrastructure / platform product)
**Current public exports:** 65
**Verdict:** CONSOLIDATE — absorb `trigger-resolution` + `lifecycle-projection` into one `durable-agent-queue` service.
**Target public exports:** ~20 (net, for the merged service — eliminating ~88 across all three).

---

## 1. Existence / Consolidation Verdict

### What the product actually is
This is the **durable agent-work queue** — the platform mechanism that makes "an agent needs to run" crash-safe. Its customers are OTHER agent-orchestration services, not end users, so it is a **platform/framework product**. Named consumers + real demand (from the data):

- **Producers submit work** — `policy`, `review`, `work`, `dispatch` all request exactly one thing: `record` an intent. That is the queue's *ingress*.
- **run-orchestration is the primary customer** (15 methods): claim / release / renew / markRunning / find / list on requests, `drain` + `reap` the intent queue, and explicit-start admit/fail. That is the queue's *worker-facing surface*.
- **session-lifecycle** drives terminal transitions (`terminalizeInTx`, `findTerminationReasonInTx`, `requestTermination`, `listRunning`) and the in-memory run registry (register/deregister/has/abort).
- **trigger-resolution** asks only `findByIdempotencyKey` + `create` — it is not an external customer, it is an internal admission step (see below).

So the queue **earns a boundary as a product**. What does NOT earn a boundary is splitting it into three services by table.

### The cluster is one product split by table ownership
The candidate-cluster hypothesis is correct. Evaluating each satellite explicitly:

- **`trigger-resolution` (9 exp, 1 consumer = session-requests, and depends BACK on it).** Its sole caller is this service's `drainAgentWorkIntents` (`triggerResolver.resolveAndCreate`), and it calls back into this service for `findByIdempotencyKey`/`create`. That bidirectional cycle exists *only* because `triggerResolutionHistory` is a separate table. Trigger resolution IS the queue's admission decision ("does this event warrant a request, record the decision either way, create it if so"). Folding it in makes `resolveAndCreate` an ordinary internal call and **deletes the `SessionRequestsTriggerResolver` + `SessionRequestsTriggerHistoryWriter` ports and the whole cycle**. → **CONSOLIDATE.**

- **`lifecycle-projection` (14 exp, 0 external consumers, boot-wired drain).** session-requests is *already* the single terminal writer INTO `agentLifecycleInbox` (`terminalizeAgentSessionRequestInTx → insertIfAbsent`) and its OWN reaper deletes projected rows (`reapTerminalAgentWorkIntents`). The inbox is the queue's **terminal-fact outbox**: the queue writes it, lifecycle-projection drains+projects it, the queue reaps it. One mechanism, three ownership fragments. Folding it in **deletes `SessionRequestsLifecycleInboxWriter`/`Reaper` (forward-reference ports), the `session-requests → lifecycle-projection` edge, AND `lifecycle-projection → session-requests` (`projectTerminalState`)**. → **CONSOLIDATE.**

The "why a separate Service" claim in the AU19 catalog for all three is identical — *"one of the few agent-orchestration services that genuinely owns a SQL table."* That is table-ownership-as-boundary, exactly the anti-pattern the frame rejects. Owning a table is not a product. **One durable-agent-queue product owns all five tables** (`agentWorkIntents`, `agentSessionRequests`, `explicitSessionStarts`, `triggerResolutionHistory`, `agentLifecycleInbox`) and exposes one coherent surface. No capability is lost; two dependency cycles vanish.

---

## 2. The Deliberate Target Public API

The 65 exports are ~44 functions/values + ~21 DI port **types**. The port types are INSIDE wiring (they describe this service's *dependencies* for the composition root), not a product surface — most collapse into a single deps bundle, and the trigger/lifecycle-inbox ports disappear on merge. The functions collapse from method-per-caller into a parameterized set.

Target interfaces (the whole product surface):

| # | Interface | Shape | Subsumes |
|---|---|---|---|
| 1 | `enqueueWorkIntent` | `(tx, intent) → void` | `recordAgentWorkIntent` + the 4 consumer `record` ports (policy/review/work/dispatch) |
| 2 | `createSessionRequest` | `(exec, input)` — kind-tagged (direct / triggered / explicit-start) | `createAgentSessionRequest`, `createExplicitSessionStart`, absorbed `createTriggeredAgentSessionRequest` |
| 3 | `findSessionRequest` | `(exec, {by: 'id'\|'idempotencyKey'\|'sessionId'\|'terminationReason'\|'explicitStart'\|'intentSource'})` | `findAgentSessionRequestById/ByIdempotencyKey/BySessionId`, `findAgentSessionRequestTerminationReasonInTx`, `isAgentSessionRequestClaimActive`, `findExplicitSessionStartById/ByRequesterAndIdempotencyKey`, `findAgentWorkIntentByKindAndSource`, `findAgentWorkIntentSourceByRequestId` |
| 4 | `listSessionRequests` | `(exec, {source?} \| {status:'running'})` | `listAgentSessionRequestsBySource`, `listRunningAgentSessionRequests` |
| 5 | `claimSessionRequest` | `(exec, {next} \| {id}, opts)` + `.renew(token)` + `.release(token)` | `claimNextAgentSessionRequest`, `claimAgentSessionRequestById`, `renewAgentSessionRequestLease`, `releaseRequestClaim`, `claimAgentWorkIntent`, `renewAgentWorkIntentLease` |
| 6 | `transitionSessionRequest` (+ `…InTx`) | `(exec, transition, deps)` — `transition` discriminated: `{to:'running',sessionId}` / `{to:terminal, precondition:'running'\|'claimed'}` / `{to:'termination-requested',reason}` / `{target:'explicitStart', to:'admitted'\|'failed'}` | `markRequestRunning`, `terminalizeAgentSessionRequest(InTx)`, `requestAgentSessionTermination`, `markExplicitSessionStartAdmitted/Failed`, absorbed `projectExplicitSessionStartTerminalState` |
| 7 | `drainIntents` | `(deps)` — claim → resolve authoritative input → resolve trigger → create request | `drainAgentWorkIntents`, `resolveAuthoritativeInput`, absorbed `resolveTriggerForSessionRequest`/`createTriggeredAgentSessionRequest`/`recordSessionForResolutionHistory` |
| 8 | `drainLifecycleProjections` (+ `startProjectionDrain`) | `(deps)` — drain inbox, project each fact to its owner | absorbed `drainAgentLifecycleInbox`, `startAgentLifecycleProjectionDrain`, `AGENT_LIFECYCLE_PROJECTORS`, `insertLifecycleInboxFactIfAbsent`, `listProjected…`, `deleteLifecycleInboxByRequestIds` |
| 9 | `reapExpired` | `(deps)` — TTL-sweep terminal intents + projected inbox rows | `reapTerminalAgentWorkIntents` + absorbed inbox reaping |
| 10 | `sessionRunRegistry` | object `{register, deregister, has, abort}` (entry carries `signalAbort`) | kept as-is — already the composable shape (policy/session-lifecycle abort demand) |

Plus minimal supporting exports: `AGENT_WORK_INTENT_KINDS`, `AGENT_WORK_INTENT_FAILURE_CODES` (genuinely-shared closed vocab), 2-3 input types (`WorkIntentInput`, `SessionRequestTransition`, `CreateSessionRequestInput`), and **one** `DurableAgentQueueDeps` bundle replacing the ~21 individual `SessionRequests*Reader/Writer` port types. Internal-only today's exports (`AGENT_WORK_RETENTION_DAYS/BATCH_SIZE`, `AgentWorkIntentDb`, `MarkRequestRunningDeps`, etc.) become private.

**Target: ~20 exports** (10 interfaces + ~2 constants + ~3 input types + ~1 deps bundle + a couple genuinely-shared row types), down from 65 — and it *removes* the 9 + 14 exports of the two absorbed services.

---

## 3. Inside Lens (clean & evolvable)

- **One state machine, one writer.** The terminal writer is already a single CAS-guarded function with a discriminated `precondition` input (AU9 R1). Generalizing markRunning + terminalize + requestTermination + explicit-start marks into `transitionSessionRequest` extends that discipline: every state change is one auditable place. New states (e.g. `paused`) add a discriminant arm, not a new exported function.
- **Ingress / worker / egress stay internally separated** (intent table → request table → inbox outbox) but behind one barrel, so the two dependency cycles that the table split forced disappear — trigger resolution and inbox projection become internal collaborators, not cross-service ports.
- **Dependencies collapse to one injected bundle.** `resolveAuthoritativeInput` fans out to ~8 services by intent-kind; that fan-out is an INSIDE concern wired once by `packages/server`. Exposing 21 named port interfaces leaked that plumbing into the product surface. One `DurableAgentQueueDeps` keeps wiring honest without inflating the API.

---

## 4. Scaling Argument (sub-linear)

Apply the test: *add dozens more producers and hundreds more calls — how many new methods?*

- **A new work source** (say a future `alerts` service that needs agent work) calls `enqueueWorkIntent(tx, {kind, sourceKind, sourceId, ...})` — a new *value* of the intent shape, **zero new methods**. Contrast the method-per-caller path where each of policy/review/work/dispatch already got its own `*AgentWorkIntentRecorder` port; that pattern would demand `recordAlertIntent` next.
- **A new lookup dimension** ("find by requesterId") is a new `by:` discriminant on `findSessionRequest`, not `findAgentSessionRequestByRequester`. The current 8 `find*`/`is*` functions are exactly the `listActiveByTeam + listPinnedByHost` sprawl the north-star warns against.
- **A new terminal disposition** is a discriminant arm on `transitionSessionRequest`, not `markRequestSuspended`.
- **A new projected owner** (some future primitive that reacts to terminal facts) adds a projector to the internal registry consumed by `drainLifecycleProjections` — the public surface is unchanged.

So new use-cases **compose from `enqueue / create / find(query) / list(filter) / claim / transition(to)`** rather than growing the API. The current API fails the test (a method already exists per caller and per lookup); the target passes it.

---

## 5. Key Collapses

1. **Three services → one.** Absorb `trigger-resolution` (9 exp) and `lifecycle-projection` (14 exp); delete two dependency cycles (`session-requests ⇄ trigger-resolution`, `session-requests ⇄ lifecycle-projection`) and ~5 forward-reference/cross-service port type sets.
2. **8 `find*`/`is*` functions → `findSessionRequest(query)`** — one parameterized lookup.
3. **markRunning + terminalize(InTx) + requestTermination + explicit-start admit/fail/project → `transitionSessionRequest(transition)`** — one state-machine writer (extends the existing single-terminal-writer pattern to the whole lifecycle).
4. **4 consumer `record` ports + `recordAgentWorkIntent` → `enqueueWorkIntent`** — one ingress.
5. **~21 exported `SessionRequests*Reader/Writer` DI port types → one `DurableAgentQueueDeps`** — stop leaking internal fan-out wiring into the product surface.
6. **Explicit-session-start mini-lifecycle folds into the request lifecycle** (create/find/transition parameterized by target) instead of a parallel 7-function set.
