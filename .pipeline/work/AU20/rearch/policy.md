# policy — service-as-product re-architecture (AU20, both lenses)

**Layer:** core-api · **Owned tables:** 0 · **Substrate:** internal-logic
**Now:** 8 methods / 26 types · **Target:** 3 methods / 6 types

---

## 1. INSIDE-OUT — substrate, floor, owned capabilities

### Substrate = INTERNAL-LOGIC (an owned policy/decision engine)

`policy` owns **no DB tables** and adapts **no external system**. It reads/writes
other services' tables only through injected function refs (`work`, `conversation`,
`users`, `org`, `notifications`, `session-requests`), and its two direct `@hyperidle/db`
touches (`propagationLog`, `sessions`) are `UNOWNED_SHARED_TABLES` — not owned.
It is therefore **substrate kind (c): pure internal logic** — an owned set of
trust/routing/cascade **decision algorithms** that sit *above* the domain services.

### The owned algorithm and its coherent op-set (the FLOOR)

Policy is one coherent product — **"decide whether/how to involve a human in agent
work, and route work between participants."** Its owned logic has three genuinely
distinct operations, and only three:

| # | Owned algorithm | Nature | Coherent op |
|---|---|---|---|
| 1 | **Reactive routing + cascade engine** — on `item_created` compute the source agent's trust signal and route (push / queue / auto_resolve, gated by risk + silence); on lifecycle events cascade session→task→bet state and notify; drain failed propagations on a heartbeat. All event-driven, all one wiring. | reactive subscriber(s) + interval | `registerPolicy` |
| 2 | **Transactional handoff** — atomically hand a task from an agent to another agent / role / human (session end, ownership transfer, review/escalation item, audit, dispatch request), single `db.transaction`, post-commit emits. | on-demand action | `handoff` |
| 3 | **Trust metric** — the rolling approval-rate over an agent's verdict history within a window. | pure query | `computeApprovalRate` |

**Floor = 3 coherent operations.** The routing engine, the lifecycle cascade, and the
retry drain are NOT three ops — they are one reactive behavior with one boot wiring and
one disposer (`registerPolicy`). Splitting them (`registerPolicyEngine` +
`registerLifecyclePropagation` + a public `retryFailedPropagations`) is fragmentation,
not capability.

### Genuine owned capabilities beyond the floor: **none**

Every candidate extra collapses:
- Routing decision (`determineAction`/push-queue-auto_resolve) — internal to the reactive
  engine; no consumer imperatively routes an item. Not a public op.
- Lifecycle cascade + retry drain — internal to `registerPolicy`. Not public ops.
- Task-transition validation (`VALID_TRANSITIONS`/`InvalidTransitionError`) — **not owned**;
  a duplicate mirror of `work`'s state machine already re-exported from `@hyperidle/shared`.

Target = floor + 0 = **3 methods**.

---

## 2. OUTSIDE-IN — the real consumer demand

From `service-data-23.json` + source verification of the two census-missed event/boot paths:

| Consumer | Requests | Kind |
|---|---|---|
| `tool-handlers` | `handoff` | on-demand method call (the only counted edge) |
| `routes/agent-profile` (via `policy-bindings`) | `computeApprovalRate` | method call — **undercounted** by the census (agent track-record display) |
| composition root (`server-factory`) | `registerPolicy` | boot wiring; policy's reactive engine consumes the **EventBus** (`item_created`, lifecycle events), not a method caller |

Demand is exactly the floor: one action (`handoff`), one query (`computeApprovalRate`),
one boot registration (`registerPolicy`). No demand for any per-behavior or per-edge method.

---

## 3. THE COHERENT PRODUCT API (fused)

Three general, parameterized interfaces + one injection contract.

### `registerPolicy(db, eventBus, deps: PolicyDeps, options?) => Disposer`
**Lens: both.** Inside-out capability #1 (the whole reactive engine) + boot demand.
One call wires trust-routing (`item_created`), lifecycle cascade (session/task/bet
events), and the retry-drain interval; returns one disposer that tears all of it down.
New routing/cascade rules are added *inside* the subscription — never a new
`register*` export. New outbound edge → a new structural field on `PolicyDeps`, zero new
exports. `options.nowFn` keeps it deterministically testable.

### `handoff(deps: PolicyDeps)(db, eventBus, params: HandoffParams) => Promise<HandoffResult>`
**Lens: both.** Inside-out capability #2 (owned transactional handoff) + `tool-handlers`
demand. Factory-curried so the composition root binds `deps` once. General over target
kind via `HandoffParams` (`toAgent` | `toRole` | `toHuman`) — a new handoff target is a
param value, never a `handoffToX` verb. (Same `PolicyDeps` the register call takes —
`handoff` internally `Pick`s the members it needs; no separate `HandoffDeps` bundle.)

### `computeApprovalRate(db, agentId, opts?: { windowDays?; limit? }) => Promise<ApprovalRateResult>`
**Lens: both.** Inside-out capability #3 (owned trust metric) + `agent-profile` demand.
Parameterized by agent + window — one query serves every trust read (the engine's
internal gate *and* the profile's track-record display). A different trust threshold is a
caller decision, not a new method. (`windowDays`/`limit` become an options bag so the
engine and the route share one signature.)

### Injection contract: `PolicyDeps` (1 type)
The single aggregate DI type. Its members are structural function-ref groups
(`work`, `conversation`, `users`, `org`, `notifications`, `silence`, `sessionRequests`).
`registerPolicy` and `handoff` each `Pick` internally what they use. A new outbound edge
= a new member, **not** a new exported port interface.

---

## 4. TARGET NUMBERS

**targetMethods = 3** (floor 3 + 0 justified extras).
**targetTypes = 6:** `PolicyDeps`, `HandoffParams`, `HandoffResult`, `HandoffMetadata`,
`PolicySessionContext`, `ApprovalRateResult`. (`HandoffMetadata`/`PolicySessionContext`
are load-bearing field types a caller must construct a `HandoffParams`; `ApprovalRateResult`
is the query return; `PolicyDeps` the DI contract.)

### DELETED (not internalized) to reach the target
- **`task-transitions.ts` in full** (`VALID_TRANSITIONS`, `InvalidTransitionError`) — a
  duplicate mirror of `work`'s state machine; `@hyperidle/shared` already exports
  `InvalidTransitionError` (lifecycle-propagation already imports it). Delete the file;
  both call sites use the shared table. Removes drift risk + 2 types.
- **3 of the 4 per-behavior deps bundles** — `PolicyEngineDeps`, `ApprovalRateDeps`,
  `HandoffDeps`, `LifecyclePropagationDeps` collapse to the ONE `PolicyDeps`. The
  register-time re-bundling in `register-policy.ts` (rebuilding `engineDeps`/`lifecycleDeps`)
  is deleted; entry points `Pick` from `PolicyDeps` directly.
- **~14 named `Policy*` port interfaces + satellite types** (`PolicyWorkStore`,
  `PolicyConversationStore`, `PolicyUserDirectory`, `PolicyOrgTeamReader`,
  `PolicySilenceChecker`, `PolicyNotificationQueue`, `PolicySessionRunRegistry`,
  `PolicyAgentWorkIntentRecorder`, `NewMessagePayload`, `PolicyMessageListOpts`,
  `PolicyVerdictMessageRow`, `PolicySilenceItem`, `PolicyNewNotificationRow`,
  `PolicyAgentWorkIntent{Input,Kind,Record}`) — the per-edge fragmentation. They survive
  only as anonymous structural members of `PolicyDeps`; the named-interface-per-edge
  sprawl (the thing that made the code not shrink last pass) is deleted, taking 26 → 6 types.

### INTERNAL (already, kept internal — not surface)
- `retryFailedPropagations` — driven by the interval inside `registerPolicy`.
- `determineAction` / `evaluateItem` / cascade handlers — internal engine steps.

---

## 5. Both-sides proof — lean AND complete

**Lean:** 3 methods = the exact floor of the owned logic; every method traces to an owned
algorithm AND a real consumer. Nothing above the floor.

**Complete — every current user feature still deliverable:**
- Human-in-the-loop routing of agent output (push/queue/auto_resolve) → inside
  `registerPolicy`'s `item_created` subscription. ✓
- Agent track-record / trust display on the profile → `computeApprovalRate`. ✓
- Trust-gated auto-resolution + cold-start oversight → engine uses `computeApprovalRate` +
  fixed thresholds internally. ✓
- Bet/task/session lifecycle cascade + human notification → inside `registerPolicy`'s
  lifecycle subscriptions + retry drain. ✓
- Tool-invoked task handoff to agent / role / human, transactionally, with escalation +
  review-item creation + dispatch request → `handoff` (all three target kinds are
  `HandoffParams` fields). ✓
- Silence-mode suppression → `deps.silence` member consulted inside the engine. ✓

No capability removed; only fragmentation (per-behavior register funcs, per-edge port
interfaces, the duplicated transition mirror) removed.
