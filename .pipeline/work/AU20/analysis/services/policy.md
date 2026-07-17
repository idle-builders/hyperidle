# policy — service-as-product audit (AU20)

**Layer:** core-api · **Owned tables:** none · **Current public exports:** 32 · **Target:** ~8

## 1. Existence / consolidation verdict — STANDALONE

`policy` earns its own boundary as a product: it is the **human-in-the-loop routing / trust
layer** — the cross-cutting decision logic that, when agent work is produced or entity state
changes, decides whether and how to involve a human, and how to route/hand off work between
participants. It owns zero tables and sits *above* the domain services (`work`, `conversation`,
`users`, `org`, `notifications`), reaching into all of them. That logic belongs to no single
domain service; folding it into any one of them would drag the others in as dependencies. This is
a genuine core-api decision/orchestration product, not table-ownership packaging.

Its four capabilities are one coherent product — "route agent work to humans":
- **policy-engine** (`registerPolicyEngine`) — on `item_created`, computes an agent's trust signal
  and routes the item: push to a human, queue, or auto-resolve.
- **approval-rate** (`computeApprovalRate`) — the rolling trust metric that gates the above (and is
  surfaced on the agent profile as a track record).
- **handoff-protocol** (`buildHandoff`) — the tool-invoked action that hands a task from an agent
  to another agent/role/human, transactionally.
- **lifecycle-propagation** (`registerLifecyclePropagation`) — on lifecycle events, cascades
  bet/task/session state and notifies humans.

**Candidate-cluster hypothesis (neighbors: `[]`) — CONFIRMED.** `policy` belongs to none of the
proposed clusters (durable-agent-queue / session-runtime / harness-execution-platform /
dispatch-and-tool-bodies). It is not a queue owner, not a session-runtime stage, not on the
zero-DB execution boundary. No sibling to fold into; no sibling to absorb.

**The "1 consumer / 1 method (handoff)" red flag is a MEASUREMENT ARTIFACT, not a boundary
problem.** The data package counts only cross-service *method calls* and therefore misses policy's
two other real intake paths, which I verified in source:
- `registerPolicyEngine` + `registerLifecyclePropagation` are **boot-wired event subscribers**,
  registered in `packages/core-api/src/server-factory.ts:325-326`. Their "consumers" are the
  EventBus (`item_created`, lifecycle events), not a method caller.
- `computeApprovalRate` **is** externally consumed — by `routes/agent-profile.ts:318` via
  `services/policy-bindings.ts:47,77` (agent track-record display). The census undercounts it.

So the steer's first horn is the correct read: policy is a real cross-cutting engine, and **~26 of
its 32 exports are internal DI-plumbing leak**, not product surface.

## 2. The deliberate target public API (~8 exports, down from 32)

The current barrel conflates two things: the **product contract** (a few verbs) and the
**Mechanism-C DI plumbing** (≈20 locally-mirrored port interfaces of *other* services' functions).
The plumbing is an INSIDE-lens implementation detail (how policy receives its dependencies) and
must not be public product surface.

**Verbs (3):**

| Interface | Shape | Subsumes | Why a shared capability |
|---|---|---|---|
| `registerPolicy` | `(db, eventBus, deps: PolicyDeps) => () => void` | `registerPolicyEngine`, `registerLifecyclePropagation`, `retryFailedPropagations` | One boot registration wiring *all* of policy's event-driven behavior (trust routing + lifecycle cascade + its internal retry drain). The composition root calls it once and gets one disposer. |
| `buildHandoff` | `(deps) => (db, eventBus, params: HandoffParams) => Promise<HandoffResult>` | `buildHandoff` | The one on-demand action; tool-handlers' sole request. Factory-curried so the composition root binds deps once. |
| `computeApprovalRate` | `(db, agentId, windowDays, limit) => Promise<ApprovalRateResult>` | `computeApprovalRate` | The trust-metric query; consumed by the agent-profile route. Parameterized by agent + window — one query serves every trust read. |

**Cross-boundary types (5):** `PolicyDeps` (the single aggregate injection contract),
`HandoffParams`, `HandoffResult`, `HandoffMetadata`, `PolicySessionContext`, `ApprovalRateResult`.
(≈6 types; trim to the minimum tool-handlers/agent-profile must name — target ~8 exports total.)

**Collapsed to INTERNAL (removed from barrel):**
- `retryFailedPropagations` — no external caller; driven by the interval *inside*
  `registerLifecyclePropagation` (`lifecycle-propagation.ts:800`). Pure leak.
- `InvalidTransitionError`, `VALID_TRANSITIONS` (task-transitions) — a **local mirror of `work`'s
  task-state-machine**, used only by lifecycle-propagation. Internal; and a duplication smell (see
  INSIDE).
- The ≈18 `Policy*` port interfaces (`PolicyWorkStore`, `PolicyConversationStore`,
  `PolicyUserDirectory`, `PolicyOrgTeamReader`, `PolicySilenceChecker`, `PolicyNotificationQueue`,
  `PolicySessionRunRegistry`, `PolicyAgentWorkIntentRecorder`, …) plus their satellite types
  (`NewMessagePayload`, `PolicyMessageListOpts`, `PolicyVerdictMessageRow`, `PolicySilenceItem`,
  `PolicyNewNotificationRow`, `PolicyAgentWorkIntent{Input,Kind,Record}`) and the three separate
  deps bundles (`PolicyEngineDeps`, `ApprovalRateDeps`, `LifecyclePropagationDeps`) — **fold into
  one exported `PolicyDeps`** whose entry points `Pick` what they need internally. Structural
  typing means the composition root satisfies `PolicyDeps` by passing plain function refs; it never
  needs the sub-interfaces named in the barrel.

## 3. INSIDE lens — staying clean/evolvable

- **One injection contract, not one-per-edge.** Today every outbound edge mints a named local port
  interface *and re-exports it*. Keep the port shapes as internal `ports.ts` types feeding a single
  public `PolicyDeps`; a new outbound edge becomes a new structural member of that one type, not a
  new barrel export.
- **One registration composition root.** The two `register*` subscribers unify under
  `registerPolicy`, so wiring order, disposer collection, and the retry interval live in one place.
- **Kill the task-transitions mirror.** `VALID_TRANSITIONS`/`InvalidTransitionError` duplicate
  `work`'s state machine (barrel admits "local mirror"). Import the shared transition table from
  `@hyperidle/shared` instead of re-declaring it, so behavior can't drift from `work`.
- Handoff's transactional atomicity (single `db.transaction`, post-commit emit) is already clean —
  keep it.

## 4. Scaling argument — sub-linear

**Current API fails the scaling test.** Mechanism-C mints (and re-exports) a mirror interface per
outbound edge, and the barrel grows a `register*` per event-driven behavior. Add dozens of services
and hundreds of calls → the barrel grows a port export per new edge and a verb per new cascade rule
= linear.

**Target API scales sub-linearly:**
- New outbound edge (policy starts reading a new service) → a new field on `PolicyDeps`, **zero new
  exports**.
- New event the engine must react to (new routing/cascade rule) → handled *inside* `registerPolicy`'s
  subscription, **no new `register*` export** (parameterized-behavior beats
  `registerPolicyEngine` + `registerLifecyclePropagation` + future `registerXPropagation`).
- New trust-gated consumer → composes the existing `computeApprovalRate(agentId, window)` query;
  a different trust threshold is a caller decision, not a new method (`computeApprovalRate(filter)`
  beats `computeHighTrustAgents` + `computeAgentTrustForProfile` + …).
- New handoff target kind (role/human/team) → already a `HandoffParams` field
  (`toAgent`/`toRole`/`toHuman`), not a new `handoffToX` verb.

## 5. Key collapses

- **32 → ~8 exports.** ≈20 DI-port interfaces + 3 deps bundles → **one `PolicyDeps`** injection type.
- **3 register/retry functions → 1 `registerPolicy`** (retry drain goes internal).
- **`computeApprovalRate` reclassified** from "undetected internal" to a real, kept public query
  (agent-profile track record) — parameterized by agent+window, absorbs future trust reads.
- **`task-transitions` (2 exports) removed** from surface; flagged to source from `@hyperidle/shared`
  rather than mirror `work`.
