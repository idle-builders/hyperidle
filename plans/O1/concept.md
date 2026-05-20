# O1 Concept: Types and Events Split

## Required reading for downstream skills

- `plans/kernel-seperation/concept.md` -- kernel vs strategy definition (ground truth)
- `plans/kernel-seperation/architecture.md` section 2 -- type split + event split
- `plans/kernel-seperation/architecture-critique-5.md` -- warnings on event deletion test impact
- `docs/architecture/event-bus-guarantees.md` -- per-stream ordering, at-least-once delivery
- `docs/knowledge-architecture/canonical-shapes.md` -- KnowledgeMetadata schema (will need update after O1)

---

## Nouns introduced or reshaped by O1

### KernelEvent (new union type)

**Definition.** A discriminated union of domain events that represent entity lifecycle facts in the kernel -- the slow-changing foundation of the system.

**Essential properties.** Every KernelEvent:
- Has a `type` string literal discriminant
- Has a `streamId` for per-stream ordering
- Has a `timestamp` for causal ordering
- Describes a state change or lifecycle transition of a kernel entity (task, bet, session, thread, item, knowledge item, dependency)
- Is emitted by kernel code (routes, kernel services) after the database write that made the change durable

**What it is not.**
- Not a strategy reaction. Events emitted by automation services (cost cap warnings, propagation results, routine triggers, tool call recordings) are StrategyEvents. The test: "did a kernel entity change state?" If yes, KernelEvent. If the event describes an automation's response to a state change, StrategyEvent.
- Not a notification. `NotificationEvent` (being deleted) was a dispatch mechanism -- "tell someone about this." Notifications are strategy policy decisions, not domain facts.
- Not an observability event. `ToolCallRecordedEvent` records harness-level tool invocations for tracing. It's strategy/observability infrastructure, not an entity lifecycle fact.

**Composition.** KernelEvent composes with StrategyEvent to form `DomainEvent = KernelEvent | StrategyEvent`. The EventBus operates on DomainEvent -- one bus, two partitions. Subscribers can listen to specific event types or wildcard. The bus semantics are unchanged.

**Authority.** Kernel routes and kernel services emit KernelEvents. No strategy code emits KernelEvents. Strategy code subscribes to KernelEvents.

**Contracts.**
- Closure: closed. Adding a new KernelEvent variant requires defining the interface, adding it to the union, and emitting from the route. A `@lore` comment documents this process.
- Exhaustiveness: a `switch(event.type)` over `KernelEvent` must compile without a `default` case -- the TypeScript compiler enforces completeness.

**Members (16):**
- TaskStateChangedEvent, BetStateChangedEvent, BetRevisedEvent
- SessionStartedEvent, SessionEndedEvent
- ThreadCreatedEvent, ThreadMessageAppendedEvent, ThreadResolvedEvent, ThreadReopenedEvent, ThreadArchivedEvent
- ItemCreatedEvent, DependencyMetEvent
- KnowledgeCreatedEvent (new), KnowledgeUpdatedEvent (tightened), KnowledgeArchivedEvent (new), KnowledgeAccessedEvent (new)

---

### StrategyEvent (new union type)

**Definition.** A discriminated union of domain events that represent automation reactions and strategy-layer observations.

**Essential properties.** Every StrategyEvent:
- Has the same structural contract as KernelEvent (`type`, `streamId`, `timestamp`)
- Describes something a strategy service observed, computed, or decided -- not a kernel entity state change
- Is emitted by strategy services (fabric bootstrap subscribers, observability dispatchers)

**What it is not.**
- Not a kernel fact. If a kernel entity changed state, the event belongs in KernelEvent.
- Not required for kernel operation. The kernel functions without strategy events. Strategy events exist for strategy-to-strategy communication and observability.

**Members (6):**
- CostCapWarningEvent, CostCapBreachedEvent (cost monitoring -- strategy policy)
- PropagationAppliedEvent, PropagationFailedEvent (lifecycle propagation results -- strategy automation)
- RoutineFiredEvent (routine execution -- strategy scheduling)
- ToolCallRecordedEvent (session observability -- strategy/harness metadata)

**Boundary rationale for specific classifications:**
- `RoutineFiredEvent` is strategy despite routines being kernel entities. The *firing* of a routine is a scheduling decision made by the strategy layer. The routine definition is kernel; the trigger execution is strategy.
- `ToolCallRecordedEvent` is strategy because it captures harness-level tool invocations for observability. The session itself is kernel; the tool-call recording is strategy instrumentation.

---

### KernelKnowledgeStatus (new 3-state enum)

**Definition.** The kernel-level lifecycle status of a knowledge item: `draft | active | archived`. Represents the minimal lifecycle the kernel needs to manage knowledge items without fabric's scoring and promotion pipeline.

**Essential properties.**
- Three values only: `draft`, `active`, `archived`
- Stored as the `KERNEL_KNOWLEDGE_STATUSES` constant array, deriving the `KernelKnowledgeStatus` type
- Follows the established pattern: `const X = [...] as const; type X = (typeof X)[number];`

**What it is not.**
- Not a replacement for `KnowledgeStatus`. The 7-state `KnowledgeStatus` (`captured | provisional | validated | active | stale | archived | needs_human`) continues to exist in `packages/fabric/src/types.ts`. It represents fabric's promotion pipeline.
- Not a subset type of `KnowledgeStatus`. The values `draft` is new (not in the 7-state set -- `captured` and `provisional` are different from `draft`). These are conceptually distinct types even though they share `active` and `archived` values.
- Not used in O1 for schema changes. O1 defines the type; O2 applies it to the `knowledgeItems` table.

**Vocabulary collision.** `KnowledgeStatus` (7-state, fabric) and `KernelKnowledgeStatus` (3-state, kernel) are deliberately distinct names. After O1:
- `KnowledgeStatus` is imported from `@hyperidle/fabric` -- fabric's promotion pipeline status
- `KernelKnowledgeStatus` is imported from `@hyperidle/shared` -- kernel's minimal lifecycle

**Contracts.**
- Closure: closed. Adding a fourth kernel status requires a concept-level decision about what the kernel lifecycle means.
- The canonical shapes doc (`docs/knowledge-architecture/canonical-shapes.md`) currently shows the 7-state status. This doc should be updated when O2 applies the schema change -- not in O1 (O1 is types only, no schema).

---

### Agent Role Split (reshaped concept)

**Definition.** The existing `AgentRole` union is decomposed into two named constant arrays (`KERNEL_AGENT_ROLES`, `FABRIC_AGENT_ROLES`) that compose back into the full `AGENT_ROLES` array and `AgentRole` type.

**Essential properties.**
- `KERNEL_AGENT_ROLES = ["builder", "growth", "product_manager"] as const` -- roles that exist in any strategy
- `FABRIC_AGENT_ROLES = ["practice_facilitator", "chief_of_staff", "brand_voice"] as const` -- roles specific to the fabric strategy
- `AGENT_ROLES = [...KERNEL_AGENT_ROLES, ...FABRIC_AGENT_ROLES] as const` -- full union
- `AgentRole = (typeof AGENT_ROLES)[number]` -- derived type, unchanged from current usage

**What it is not.**
- Not a package boundary split. Both arrays live in `packages/shared/src/types.ts`. Fabric roles are vocabulary, not logic -- putting them in the fabric package would force kernel to import from fabric (violating the boundary rule).
- Not a functional split. No runtime behavior changes based on which array a role belongs to. This is documentation-level classification for developer understanding.
- Not a DB migration. The `agents.role` column is unchanged. The role values are the same strings.

**Contracts.**
- Closure: closed per array, open for the union. Adding a kernel role means updating `KERNEL_AGENT_ROLES`; adding a fabric role means updating `FABRIC_AGENT_ROLES`. Both require a shared package change.

---

### Knowledge Lifecycle Events (3 new kernel events)

**Definition.** Three new KernelEvent variants covering the knowledge CRUD lifecycle gap: creation, archival, and access.

#### KnowledgeCreatedEvent

**Essential properties.**
- `type: "knowledge_created"`
- `streamId: string` (the knowledge item ID for per-entity ordering)
- `itemId: string`
- `timestamp: number`

**Authority.** Emitted by the knowledge creation route after the DB insert. Not emitted in O1 (no route changes) -- the event interface is defined for O2 to wire up.

#### KnowledgeArchivedEvent

**Essential properties.**
- `type: "knowledge_archived"`
- `streamId: string`, `itemId: string`, `timestamp: number`

**Authority.** Emitted by the knowledge archive route. Same timing as above.

#### KnowledgeAccessedEvent

**Essential properties.**
- `type: "knowledge_accessed"`
- `streamId: string`, `itemId: string`
- `accessorKind: "human" | "agent"` -- distinguishes human reads from agent reads
- `accessorId: string` -- who accessed it
- `timestamp: number`

**Why accessorKind and accessorId.** L22 established that frequency signals (30-day access counts) must distinguish human reads from automated crawls. Without this distinction, agent materialization sweeps would pollute the relevance signal. The `KnowledgeAccessorKind` type already exists for this purpose.

**What these events are not.**
- Not prescriptive. `KnowledgeCreatedEvent` says "item was created." It does not trigger scoring, classification, or routing. Strategy subscribes and decides.
- Not emitted by O1. O1 defines the interfaces and adds them to the KernelEvent union. O2 wires emission into routes.

---

### KnowledgeUpdatedEvent (tightened, reshaped)

**Current state.** `action: string` -- accepts any string.

**After O1.** `action: "edit" | "promote" | "flag" | "merge" | "split"` -- closed union of the five mutation verbs.

**Rationale.** The five verbs are the complete set of mutations the knowledge routes support. A string-typed action is a lie -- it claims any value is valid when only five are. Tightening catches invalid emissions at compile time.

---

### SessionEndedEvent.costDelta (removed field, reshaped)

**Current state.** `costDelta: number` -- hard-coded to `0` in `sessions-routes.ts`.

**After O1.** Field removed from the interface. Session cost tracking is being deleted as part of the kernel/strategy separation (cost is strategy concern). The field was already meaningless (always 0).

**Impact.** Consumers of `SessionEndedEvent` that read `costDelta`: `session-lifecycle.ts`, `session-review-creator`, observability dispatcher, langfuse adapter, and ~15 test files. All must be updated.

---

## Events being deleted

| Event | Reason | Test impact |
|---|---|---|
| `BetShippedEvent` | Redundant -- `BetStateChangedEvent` with `toState === "shipped"` carries the same information | `builtin-routines.test.ts` (3 refs), `builtin-routines.ts` service, observability `dispatcher.ts`, `event-bus.test.ts` |
| `BetCommittedEvent` | Redundant -- `BetStateChangedEvent` with `toState === "committed"` | Only defined, no service/test usage beyond events.ts and index.ts |
| `ResponseRecordedEvent` | Zombie -- references the dropped `responses` table (replaced by verdict-typed messages in L1a) | `ws-broadcaster.test.ts` (1 test case) |
| `NotificationEvent` | Never emitted as a domain event -- policy engine writes to notification queue directly | `policy-engine.test.ts` (13 typed refs), `task-state-machine.test.ts` (1 ref), `dependency-watcher.test.ts` (3 refs), `event-bus.test.ts` (2 refs), `policy-engine.ts` service |

---

## Vocabulary table

| Term | Definition | Aliases not to use |
|---|---|---|
| **KernelEvent** | Union of entity lifecycle fact events | CoreEvent, BaseEvent, SystemEvent |
| **StrategyEvent** | Union of automation/strategy reaction events | FabricEvent, PluginEvent, ExtensionEvent |
| **KernelKnowledgeStatus** | 3-state kernel lifecycle for knowledge items | KernelStatus, SimpleKnowledgeStatus, BasicStatus |
| **KnowledgeStatus** (fabric) | 7-state promotion pipeline status (moved to fabric) | FabricKnowledgeStatus, FullKnowledgeStatus |
| **KERNEL_AGENT_ROLES** | Const array of roles that exist in any strategy | CoreRoles, BaseRoles |
| **FABRIC_AGENT_ROLES** | Const array of roles specific to fabric strategy | StrategyRoles, ExtensionRoles |
| **AGENT_ROLES** | Composed union of all agent roles | AllRoles |

---

## Contracts summary

1. **KernelEvent closure:** closed union. Adding a variant requires: (1) define interface, (2) add to union, (3) emit from route. `@lore` comment documents this.
2. **StrategyEvent closure:** closed union. Same process, but emission comes from strategy services.
3. **DomainEvent composition:** `DomainEvent = KernelEvent | StrategyEvent`. Always. No event exists outside this union.
4. **KernelKnowledgeStatus closure:** closed 3-state enum. Adding a status is a concept-level decision.
5. **KnowledgeUpdatedEvent.action closure:** closed 5-value union. Adding a mutation verb requires updating this type.
6. **Agent role split identity:** both arrays live in shared. The full `AgentRole` type is unchanged. Runtime behavior is unchanged.
7. **Event bus contract unchanged:** per-stream ordering, at-least-once delivery. The bus operates on `DomainEvent` (the composed union). No bus API changes.
8. **Boundary rule:** kernel code never imports from `@hyperidle/fabric`. Both `KERNEL_AGENT_ROLES` and `FABRIC_AGENT_ROLES` live in shared to respect this.

---

## Self-critique

**Is the rejection list substantive?** Yes -- each rejection distinguishes a specific adjacent concept with a concrete reason. "Not a notification" is distinct from "not an observability event" is distinct from "not a strategy reaction."

**Vocabulary collision check.** `grep` confirmed no existing usage of `KernelEvent`, `StrategyEvent`, `KernelKnowledgeStatus`, `KERNEL_KNOWLEDGE_STATUSES`, `KERNEL_AGENT_ROLES`, or `FABRIC_AGENT_ROLES` in the codebase. Clean namespace.

**Are the contracts complete?** Yes for O1 scope. Cardinality (1:1 event-to-union membership), closure (all unions closed), mutability (events are immutable once emitted -- established by event-bus-guarantees.md), identity (type discriminant is the identity).

**Does the canonical shapes doc need updating?** `docs/knowledge-architecture/canonical-shapes.md` shows the 7-state status. This should be updated in O2 when the schema changes, not O1. O1 only defines the types; the canonical shape reflects the stored schema.

**Critical concern: costDelta removal scope.** Removing `costDelta` from `SessionEndedEvent` has a large blast radius (session-lifecycle.ts, observability dispatcher, langfuse adapter, 15+ test files). However, O1's AC explicitly calls for this removal, and the field is already hard-coded to 0. The architecture plan must enumerate every consumer.

**Critical concern: BetShippedEvent deletion scope.** `BetShippedEvent` is actively used by `builtin-routines.ts` (subscribes to `bet_shipped` event type) and the observability dispatcher. Deleting the event type means these services must switch to subscribing to `bet_state_changed` and filtering for `toState === "shipped"`. This is behavior change, not just type cleanup. The architecture plan must specify the migration path for `builtin-routines.ts` and `observability/dispatcher.ts`.
