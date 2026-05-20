# O1 Architecture: Types and Events Split

## Required reading

- `plans/O1/concept.md` -- concept-locking output (locked)
- `plans/kernel-seperation/architecture.md` section 2 -- type split + event split
- `plans/kernel-seperation/architecture-critique-5.md` -- codebase reality check
- `docs/architecture/event-bus-guarantees.md` -- per-stream ordering contract
- `packages/shared/src/types.ts` -- current type definitions
- `packages/shared/src/propagation.ts` -- propagation types to move
- `packages/shared/src/events.ts` -- current event definitions
- `packages/shared/src/index.ts` -- barrel file re-exports
- `packages/fabric/src/index.ts` -- fabric barrel file

---

## Plan reconciliation: spec vs codebase

| Spec assumption | Codebase reality | Resolution |
|---|---|---|
| "NotificationEvent (never emitted)" | **Emitted** by `policy-engine.ts` line 172 and `dependency-watcher.ts` line 85 | Move to `StrategyEvent` instead of deleting. See AC deviation note below. |
| "BetShippedEvent (redundant)" | **Actively used** by `builtin-routines.ts` (subscribes to `bet_shipped`, line 271), observability `dispatcher.ts` (handles `bet_shipped` case, line 404), `builtin-routines.test.ts` (3 refs), `event-bus.test.ts` (2 refs) | Delete the type. Migrate `builtin-routines.ts` to subscribe to `bet_state_changed` with `toState === "shipped"` filter. Remove redundant `bet_shipped` case from observability dispatcher (it already handles `bet_state_changed`). |
| "BetCommittedEvent (redundant)" | Only defined in `events.ts` and re-exported in `index.ts`. No service or test usage beyond definition. | Clean delete. |
| "ResponseRecordedEvent (zombie)" | Used in `ws-broadcaster.test.ts` lines 1, 58. No production emission. | Delete type. Update test. |
| `SessionEndedEvent.costDelta` | Used in `session-lifecycle.ts` (computes + emits), `sessions-routes.ts` (emits 0), `session-provisioning.ts`, observability dispatcher/langfuse/console adapters, `shared/observability/events.ts` (ObservabilityEvent), 15+ test files | Remove field from interface. Remove from all emitters, consumers, and observability event type. |
| `fabric/src/types.ts` exists | Does NOT exist -- file must be created | Create file. |
| `AutonomyLevel` in `shared/types.ts` | Exists at line 135 as `type AutonomyLevel = 1 \| 2 \| 3 \| 4` (numeric). Also separately defined in `api-contract/src/settings.ts` as `type AutonomyLevel = "manual" \| "supervised" \| "autonomous"` (string). These are two different types with the same name. | Move only the numeric `AutonomyLevel` from shared to fabric. The api-contract `AutonomyLevel` is a different concept (UI-facing string enum) and stays where it is. |
| `KnowledgeStatus` type name after move | 7-state `KnowledgeStatus` moves to fabric. New `KernelKnowledgeStatus` added to shared. Both types coexist with different names. | No collision. `KnowledgeStatus` keeps its name in fabric; consumers that need fabric's type import from `@hyperidle/fabric`. |
| `KNOWLEDGE_STATUSES` const after move | 7-state array moves to fabric. Shared gets `KERNEL_KNOWLEDGE_STATUSES`. | No collision. Different names. |

### AC deviation: NotificationEvent

The AC says "Deleted: NotificationEvent (never emitted)." The codebase shows it IS emitted by `policy-engine.ts` and `dependency-watcher.ts`. Deleting the type would break both services and require either unsafe casts or behavior changes, which are out of O1 scope ("no behavior changes").

**Resolution:** Move `NotificationEvent` to the `StrategyEvent` union instead of deleting. This achieves the AC's intent (separating strategy concerns from kernel events) without breaking services. The concept doc already identifies notifications as "strategy policy decisions." The type stays in `events.ts` (both KernelEvent and StrategyEvent live there) but is classified as strategy.

---

## Task 1: Create `packages/fabric/src/types.ts` with strategy types

### Types to move from `packages/shared/src/types.ts`

| Type/Const | Current location (line) | Action |
|---|---|---|
| `KnowledgeLayer` | types.ts:36 | Move to fabric/types.ts |
| `KNOWLEDGE_LAYERS` | types.ts:38 | Move to fabric/types.ts |
| `KNOWLEDGE_STATUSES` (7-state) | types.ts:54-62 | Move to fabric/types.ts |
| `KnowledgeStatus` | types.ts:64 | Move to fabric/types.ts |
| `KnowledgeFormat` | types.ts:66 | **Keep in shared** -- format is kernel (title, body, format are kernel fields) |
| `KnowledgeKind` | types.ts:68-77 | Move to fabric/types.ts |
| `KNOWLEDGE_SCOPES` | types.ts:85 | Move to fabric/types.ts |
| `KnowledgeScope` | types.ts:86 | Move to fabric/types.ts |
| `KNOWLEDGE_TOPIC_HEALTHS` | types.ts:93 | Move to fabric/types.ts |
| `KnowledgeTopicHealth` | types.ts:94 | Move to fabric/types.ts |
| `RiskTier` | types.ts:133 | Move to fabric/types.ts |
| `AutonomyLevel` | types.ts:135 | Move to fabric/types.ts |
| `KnowledgeAccessorKind` | types.ts:145 | Move to fabric/types.ts |
| `KnowledgeRelevanceSignals` | types.ts:153-157 | Move to fabric/types.ts |
| `KNOWLEDGE_SORT_OPTIONS` | types.ts:165 | Move to fabric/types.ts |
| `KnowledgeSortOption` | types.ts:166 | Move to fabric/types.ts |

### Types to move from `packages/shared/src/propagation.ts`

| Type/Const | Current location (line) | Action |
|---|---|---|
| `PropagationLevel` | propagation.ts:8 | Move to fabric/types.ts |
| `PropagationStatus` | propagation.ts:10 | Move to fabric/types.ts |
| `PropagationResult` | propagation.ts:12-21 | Move to fabric/types.ts |

### New types to add to `packages/shared/src/types.ts`

```typescript
export const KERNEL_KNOWLEDGE_STATUSES = ["draft", "active", "archived"] as const;
export type KernelKnowledgeStatus = (typeof KERNEL_KNOWLEDGE_STATUSES)[number];

export const KERNEL_AGENT_ROLES = ["builder", "growth", "product_manager"] as const;
export const FABRIC_AGENT_ROLES = ["practice_facilitator", "chief_of_staff", "brand_voice"] as const;
export const AGENT_ROLES = [...KERNEL_AGENT_ROLES, ...FABRIC_AGENT_ROLES] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];
```

The existing `AgentRole` type (lines 123-129) is replaced by the derived type from `AGENT_ROLES`. The existing `AgentStatus`, `ModelTier`, `TriggerType`, `SessionState`, `KnowledgeFormat` stay in shared.

### New file: `packages/fabric/src/types.ts`

```typescript
/**
 * Strategy types — fabric's knowledge taxonomy, scoring, and propagation types.
 *
 * @lore O1: these types were moved from @hyperidle/shared as part of the
 * kernel/strategy separation. Kernel code imports from @hyperidle/shared;
 * strategy/UI code that needs these imports from @hyperidle/fabric.
 */

// --- Knowledge taxonomy (fabric's classification system) ---

export type KnowledgeLayer = "L0" | "L1" | "L2" | "L3" | "L4";
export const KNOWLEDGE_LAYERS: readonly KnowledgeLayer[] = ["L0", "L1", "L2", "L3", "L4"] as const;

export const KNOWLEDGE_STATUSES = [
  "captured", "provisional", "validated", "active", "stale", "archived", "needs_human",
] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export type KnowledgeKind =
  | "pattern" | "anti_pattern" | "brief" | "principle"
  | "decision" | "failure" | "reflection" | "focus";

export const KNOWLEDGE_SCOPES = ["practice", "product", "factory"] as const;
export type KnowledgeScope = (typeof KNOWLEDGE_SCOPES)[number];

export const KNOWLEDGE_TOPIC_HEALTHS = ["fresh", "some_stale", "mostly_stale"] as const;
export type KnowledgeTopicHealth = (typeof KNOWLEDGE_TOPIC_HEALTHS)[number];

export type KnowledgeAccessorKind = "human" | "agent";

export interface KnowledgeRelevanceSignals {
  recency: string | null;
  accessCount30d: number | null;
  citationCount: number | null;
}

export const KNOWLEDGE_SORT_OPTIONS = ["relevance", "recency", "frequency"] as const;
export type KnowledgeSortOption = (typeof KNOWLEDGE_SORT_OPTIONS)[number];

// --- Strategy-specific types ---

export type RiskTier = "low" | "medium" | "high";
export type AutonomyLevel = 1 | 2 | 3 | 4;

// --- Lifecycle propagation types ---

export type PropagationLevel = "session" | "task" | "bet" | "product" | "portfolio";
export type PropagationStatus = "applied" | "skipped" | "failed" | "pending_retry";

export interface PropagationResult {
  sourceLevel: PropagationLevel;
  sourceId: string;
  targetLevel: PropagationLevel;
  targetId: string;
  targetTransition: string | null;
  status: PropagationStatus;
  failureReason?: string;
}
```

### Update `packages/fabric/src/index.ts`

Add re-exports for all moved types:

```typescript
// --- Strategy types (O1: moved from @hyperidle/shared) ---
export type {
  KnowledgeAccessorKind,
  KnowledgeKind,
  KnowledgeLayer,
  KnowledgeRelevanceSignals,
  KnowledgeScope,
  KnowledgeSortOption,
  KnowledgeStatus,
  KnowledgeTopicHealth,
  PropagationLevel,
  PropagationResult,
  PropagationStatus,
  RiskTier,
  AutonomyLevel,
} from "./types.js";
export {
  KNOWLEDGE_LAYERS,
  KNOWLEDGE_SCOPES,
  KNOWLEDGE_SORT_OPTIONS,
  KNOWLEDGE_STATUSES,
  KNOWLEDGE_TOPIC_HEALTHS,
} from "./types.js";
```

### Update `packages/shared/src/index.ts`

Remove all moved type re-exports. Add new type exports:
- Remove from `"./types.js"` exports: `AutonomyLevel`, `KnowledgeAccessorKind`, `KnowledgeKind`, `KnowledgeLayer`, `KnowledgeRelevanceSignals`, `KnowledgeScope`, `KnowledgeSortOption`, `KnowledgeStatus`, `KnowledgeTopicHealth`, `RiskTier`, `KNOWLEDGE_LAYERS`, `KNOWLEDGE_SCOPES`, `KNOWLEDGE_SORT_OPTIONS`, `KNOWLEDGE_STATUSES`, `KNOWLEDGE_TOPIC_HEALTHS`
- Remove entire `"./propagation.js"` re-export block (lines 108-112)
- Add: `KERNEL_KNOWLEDGE_STATUSES`, `KernelKnowledgeStatus`, `KERNEL_AGENT_ROLES`, `FABRIC_AGENT_ROLES`, `AGENT_ROLES`

### Delete `packages/shared/src/propagation.ts`

File becomes empty after moving all three types. Delete it.

### Update `packages/shared/src/events.ts`

`events.ts` imports `PropagationLevel` from `./propagation.js`. After propagation.ts is deleted, the propagation events (`PropagationAppliedEvent`, `PropagationFailedEvent`) need to import `PropagationLevel` from `@hyperidle/fabric`. But wait -- `packages/shared` cannot import from `@hyperidle/fabric` (boundary rule).

**Resolution:** The `PropagationAppliedEvent` and `PropagationFailedEvent` use `PropagationLevel` only for their `sourceLevel` and `targetLevel` fields. Since these are strategy events, their type definition uses a strategy type. Two options:
1. Inline the type as `string` in the event interfaces (losing type safety)
2. Keep `PropagationLevel` as a string literal union in events.ts directly (duplicating the type)
3. Move the propagation event interfaces to fabric

Option 2 is pragmatic: define the string literal type inline in events.ts. Since `PropagationLevel` is just `"session" | "task" | "bet" | "product" | "portfolio"`, it's small enough to inline:

```typescript
/** Inline type for strategy event fields. Canonical definition in @hyperidle/fabric. */
type PropagationLevelLiteral = "session" | "task" | "bet" | "product" | "portfolio";
```

This avoids a cross-package import while keeping type safety. The canonical definition lives in fabric; this is a local alias for the event interface. Add a `@lore` comment explaining why.

### Verification

- `grep -rn "KnowledgeScope\|KnowledgeLayer\|KNOWLEDGE_LAYERS\|RiskTier\|AutonomyLevel\|PropagationLevel\|PropagationStatus\|PropagationResult\|KnowledgeKind\|KNOWLEDGE_SCOPES\|KNOWLEDGE_STATUSES\|KNOWLEDGE_SORT_OPTIONS\|KnowledgeTopicHealth\|KNOWLEDGE_TOPIC_HEALTHS\|KnowledgeRelevanceSignals\|KnowledgeAccessorKind" packages/shared/src/` returns zero hits
- `bun run check` passes

---

## Task 2: Update all imports across packages

### Import update map

Every file below currently imports one or more strategy types from `@hyperidle/shared` and must be changed to import from `@hyperidle/fabric`.

#### `packages/fabric/src/` (internal -- change from `@hyperidle/shared` to local `./types.js`)

| File | Current import | New import |
|---|---|---|
| `conflict-resolution.ts:2` | `KnowledgeKind, KnowledgeStatus` from `@hyperidle/shared` | from `./types.js` |
| `layers.ts:1` | `KNOWLEDGE_LAYERS, KnowledgeLayer` from `@hyperidle/shared` | from `./types.js` |
| `knowledge-repository.ts:9-11` | `KnowledgeKind, KnowledgeLayer, KnowledgeStatus` from `@hyperidle/shared` | from `./types.js`. Note: `KnowledgeFormat` is also imported from `@hyperidle/shared` in this file -- that import stays (KnowledgeFormat is a kernel type). |

#### `packages/server/src/` (change to `@hyperidle/fabric`)

| File | Current import | New import |
|---|---|---|
| `services/practice-meeting.ts:3` | `KnowledgeKind, KnowledgeUpdatedEvent` from `@hyperidle/shared` | `KnowledgeKind` from `@hyperidle/fabric`, `KnowledgeUpdatedEvent` stays from `@hyperidle/shared` |
| `services/lifecycle-propagation.ts:41-43` | `PropagationLevel`, `PropagationAppliedEvent`, `PropagationFailedEvent` from `@hyperidle/shared` | Split import: `PropagationLevel` from `@hyperidle/fabric`; `PropagationAppliedEvent` and `PropagationFailedEvent` stay from `@hyperidle/shared` (event types remain in shared) |
| `skill-tools/write-memory.ts:3` | `KNOWLEDGE_LAYERS, KNOWLEDGE_STATUSES, KnowledgeLayer` from `@hyperidle/shared` | from `@hyperidle/fabric` |
| `skill-tools/promote-knowledge.ts:3` | `KNOWLEDGE_STATUSES, KnowledgeStatus` from `@hyperidle/shared` | from `@hyperidle/fabric` |
| `routes/knowledge.ts:7-8` | `KnowledgeLayer, KNOWLEDGE_LAYERS` from `@hyperidle/shared` | from `@hyperidle/fabric` |
| `skill-tools/query-practice.ts:6` | Defines its own local `const KNOWLEDGE_LAYERS = [...]` instead of importing | Change local definition to `import { KNOWLEDGE_LAYERS } from "@hyperidle/fabric"`. Remove local `const`. |
| `skill-tools/route-item.ts:42-64` | Uses `riskTier` string literals inline -- no type import needed | No change |

#### `packages/web/src/` (change to `@hyperidle/fabric`)

| File | Current import | New import |
|---|---|---|
| `layouts/AppShell.tsx:7` | `KNOWLEDGE_SCOPES, KnowledgeScope` from `@hyperidle/shared` | from `@hyperidle/fabric` |
| `hooks/useGlobalSearch.ts:1-2` | `KnowledgeKind, KnowledgeLayer, KnowledgeStatus, BET_STATUSES, KNOWLEDGE_STATUSES` from `@hyperidle/shared` | `KnowledgeKind, KnowledgeLayer, KnowledgeStatus, KNOWLEDGE_STATUSES` from `@hyperidle/fabric`; `BET_STATUSES` stays from `@hyperidle/shared` |
| `pages/KnowledgeDetail.tsx:37` | `KnowledgeScope, KnowledgeStatus` from `@hyperidle/shared` | from `@hyperidle/fabric` |
| `pages/KnowledgeList.tsx:15-16` | `KnowledgeScope, KnowledgeSortOption, KNOWLEDGE_SORT_OPTIONS` from `@hyperidle/shared` | from `@hyperidle/fabric` |
| `components/KnowledgeTopicGroup.tsx:9` | `KnowledgeTopicHealth` from `@hyperidle/shared` | from `@hyperidle/fabric` |
| `fixtures/knowledge-data.ts:15-20` | `KnowledgeKind, KnowledgeLayer, KnowledgeScope, KnowledgeStatus, KnowledgeTopicHealth` from `@hyperidle/shared` | from `@hyperidle/fabric` |
| `__tests__/status-mapping.test.ts:10-11` | `KNOWLEDGE_STATUSES, KnowledgeStatus` from `@hyperidle/shared` | from `@hyperidle/fabric` |

#### `packages/design-system/src/` (change to `@hyperidle/fabric`)

| File | Current import | New import |
|---|---|---|
| `status-mapping.ts:1` | `KnowledgeStatus` from `@hyperidle/shared` | from `@hyperidle/fabric` |
| `KnowledgeRow.tsx:1` | `KnowledgeKind, KnowledgeLayer, KnowledgeStatus` from `@hyperidle/shared` | from `@hyperidle/fabric` |

#### `packages/shared/src/__tests__/` (update or move tests)

| File | Current import | New import |
|---|---|---|
| `types.test.ts:5-6` | `KNOWLEDGE_STATUSES, KnowledgeStatus` from `../types.js` | Move KNOWLEDGE_STATUSES tests to `packages/fabric/src/__tests__/types.test.ts`. Keep TASK_STATES and BET_STATUSES tests in shared. |

#### `packages/server/src/__tests__/` (strategy type references)

| File | Issue | Resolution |
|---|---|---|
| `session-provisioning.test.ts:168` | Uses `"low" \| "medium" \| "high"` string literal inline, no `RiskTier` import | No change needed |

### Package dependency check

`packages/web` and `packages/design-system` currently depend on `@hyperidle/shared`. After O1, they also need to depend on `@hyperidle/fabric` for strategy type imports.

Check `package.json` for each:

```
packages/web/package.json       -- needs @hyperidle/fabric dependency
packages/design-system/package.json -- needs @hyperidle/fabric dependency
packages/server/package.json    -- already has @hyperidle/fabric dependency (via session-lifecycle.ts)
```

### Verification

- `bun run check` passes
- All imports resolve

---

## Task 3: Event split -- KernelEvent and StrategyEvent unions

### Changes to `packages/shared/src/events.ts`

**Delete 3 event interfaces:**
- `BetShippedEvent` (lines 25-30) -- redundant with `BetStateChangedEvent`
- `BetCommittedEvent` (lines 127-134) -- redundant with `BetStateChangedEvent`
- `ResponseRecordedEvent` (lines 95-102) -- zombie, references dropped table

**Move `NotificationEvent` to StrategyEvent** (not deleted -- see AC deviation above).

**Remove `costDelta` from `SessionEndedEvent`:**
```typescript
// Before:
export interface SessionEndedEvent {
  type: "session_ended";
  streamId: string;
  sessionId: string;
  agentId: string;
  taskId: string;
  timestamp: number;
  costDelta: number;       // DELETE this line
  outcome: SessionOutcome;
}

// After:
export interface SessionEndedEvent {
  type: "session_ended";
  streamId: string;
  sessionId: string;
  agentId: string;
  taskId: string;
  timestamp: number;
  outcome: SessionOutcome;
}
```

**Keep `KnowledgeUpdatedEvent.action` as `string` (no tightening):**

```typescript
/**
 * @lore O1: action stays as `string` because the codebase emits 11+ distinct
 * action values across 4 files, including a dynamic `practice_meeting_turn_N`
 * pattern in practice-meeting.ts that makes a closed union impossible.
 *
 * Actual values emitted today:
 *   knowledge.ts routes:      "created", "updated", "merged", "split", "archived", "flagged"
 *   attention-service.ts:     "attention_recomputed"
 *   promotion-pipeline.ts:    "contradiction_flagged", "auto_promoted", "marked_stale"
 *   practice-meeting.ts:      `practice_meeting_turn_${turnNumber}` (dynamic, unbounded)
 *
 * Tightening requires either (a) making the dynamic pattern use a fixed action
 * with turnNumber as a separate field, or (b) a branded string with a
 * `practice_meeting_turn_` prefix type. Both are behavior changes, out of O1 scope.
 * Filed as follow-up.
 */
export interface KnowledgeUpdatedEvent {
  type: "knowledge_updated";
  streamId: string;
  itemId: string;
  action: string;           // intentionally loose -- see @lore above
  timestamp: number;
}
```

**Add 3 new event interfaces:**
```typescript
export interface KnowledgeCreatedEvent {
  type: "knowledge_created";
  streamId: string;
  itemId: string;
  timestamp: number;
}

export interface KnowledgeArchivedEvent {
  type: "knowledge_archived";
  streamId: string;
  itemId: string;
  timestamp: number;
}

export interface KnowledgeAccessedEvent {
  type: "knowledge_accessed";
  streamId: string;
  itemId: string;
  accessorKind: "human" | "agent";
  accessorId: string;
  timestamp: number;
}
```

**EventType cascade note:** Deleting events from `DomainEvent` automatically narrows the `EventType`, `EventByType`, and `EventHandler` utility types (they are derived from `DomainEvent["type"]`). No separate update needed for these utility types. However, the `routine-scheduler.ts` line 405 does `const eventType = config.eventType as EventType` -- routines stored in the DB may still contain `"bet_shipped"` as a trigger event string. The `as` cast is already unsafe by design (DB strings are not validated against the TS union). The seed fixture change (see Task 5) updates the canonical seed data. Existing DB rows with `"bet_shipped"` in `triggerConfig` will need a data migration -- this is noted as a follow-up since O1 does not modify the schema or DB data.

**Add `PropagationLevelLiteral` inline type:**
```typescript
/**
 * @lore O1: PropagationLevel moved to @hyperidle/fabric. This inline literal
 * union avoids importing from fabric in shared (boundary rule: kernel never
 * imports from strategy). The canonical definition is in @hyperidle/fabric.
 */
type PropagationLevelLiteral = "session" | "task" | "bet" | "product" | "portfolio";
```

Update `PropagationAppliedEvent` and `PropagationFailedEvent` to use `PropagationLevelLiteral` instead of importing `PropagationLevel`.

**Define KernelEvent and StrategyEvent unions:**
```typescript
/**
 * Kernel events: entity lifecycle facts. When a kernel entity changes state,
 * these events announce what happened.
 *
 * @lore O1: To add a kernel event: (1) define the interface with type literal
 * discriminant, streamId, and timestamp, (2) add it to this union, (3) emit
 * from the route/service after the DB write. The EventBus is generic -- no
 * bus changes needed. A switch(event.type) over KernelEvent must compile
 * without a default case.
 */
export type KernelEvent =
  | TaskStateChangedEvent
  | BetStateChangedEvent
  | BetRevisedEvent
  | SessionStartedEvent
  | SessionEndedEvent
  | ThreadCreatedEvent
  | ThreadMessageAppendedEvent
  | ThreadResolvedEvent
  | ThreadReopenedEvent
  | ThreadArchivedEvent
  | ItemCreatedEvent
  | DependencyMetEvent
  | KnowledgeCreatedEvent
  | KnowledgeUpdatedEvent
  | KnowledgeArchivedEvent
  | KnowledgeAccessedEvent;

/** Strategy events: automation reactions and strategy-layer observations. */
export type StrategyEvent =
  | CostCapWarningEvent
  | CostCapBreachedEvent
  | NotificationEvent
  | PropagationAppliedEvent
  | PropagationFailedEvent
  | RoutineFiredEvent
  | ToolCallRecordedEvent;

/** Discriminated union of all domain events. */
export type DomainEvent = KernelEvent | StrategyEvent;
```

### Update `packages/shared/src/index.ts` event re-exports

Remove re-exports of deleted events:
- `BetCommittedEvent`
- `BetShippedEvent`
- `ResponseRecordedEvent`

Add new re-exports:
- `KernelEvent`
- `StrategyEvent`
- `KnowledgeCreatedEvent`
- `KnowledgeArchivedEvent`
- `KnowledgeAccessedEvent`

Keep `NotificationEvent` in re-exports (it's now a StrategyEvent, still exported).

### Verification

- `bun run check` passes
- Exhaustiveness: a `switch(event.type)` over `KernelEvent` compiles without `default`

---

## Task 4: Update services that use deleted events

### `bet-state-machine.ts` -- Remove `bet_shipped` emit (EMITTER)

**Current:** Lines 227-234 emit a separate `bet_shipped` event after every `bet_state_changed` where `toState === "shipped"`. Three `@lore` comments at lines 152-155 and 215 reference `bet_shipped`.

**Change:** Delete the `if (toState === "shipped") { eventBus.emit({ type: "bet_shipped", ... }) }` block (lines 227-234). Update the `@lore` comments at lines 152-155 and 215 to reference only `bet_state_changed` (remove mentions of `bet_shipped`). The `bet_state_changed` event already fires for all transitions including shipped, so no information is lost.

```typescript
// DELETE this block (lines 227-234):
if (toState === "shipped") {
  eventBus.emit({
    type: "bet_shipped",
    streamId: bet.productId,
    betId,
    timestamp: Date.now(),
  });
}
```

### `builtin-routines.ts` -- BetShippedEvent migration (CONSUMER)

**Current:** Subscribes to `"bet_shipped"` event at line 271, handler typed as `BetShippedEvent`. Also has `eventType: "bet_shipped"` in the builtin routine definition at line 118 and `@lore` comments referencing `bet_shipped` at lines 439 and 441.

**Change to:** Subscribe to `"bet_state_changed"`, filter for `toState === "shipped"`, extract `betId` from `BetStateChangedEvent`. Update routine definition `eventType` from `"bet_shipped"` to `"bet_state_changed"`. Update `@lore` comments.

```typescript
// Before:
import { ..., BetShippedEvent, ... } from "@hyperidle/shared";
const betShippedHandler = (event: BetShippedEvent): void => { ... event.betId ... };
unsubs.push(eventBus.on("bet_shipped", betShippedHandler));

// After:
import { ..., BetStateChangedEvent, ... } from "@hyperidle/shared";
const betShippedHandler = (event: BetStateChangedEvent): void => {
  if (event.toState !== "shipped") return;
  ... event.betId ...
};
unsubs.push(eventBus.on("bet_state_changed", betShippedHandler));
```

### `observability/dispatcher.ts` -- BetShippedEvent case removal

**Current:** Has a `case "bet_shipped":` that constructs an observability event with `fromState: "active", toState: "shipped"`. Also has a `case "bet_state_changed":` that handles all state transitions.

**Change:** Delete the `case "bet_shipped":` block entirely. The `case "bet_state_changed":` already handles `toState === "shipped"` transitions.

### `policy-engine.ts` -- NotificationEvent import

**Current:** `import type { EventBus, ItemCreatedEvent, NotificationEvent } from "@hyperidle/shared";`

**Change:** `NotificationEvent` stays in shared (moved to StrategyEvent but still exported). No import change needed -- only the union classification changes.

### `dependency-watcher.ts` -- notification emission

**Current:** Emits `{ type: "notification", ... }` as an untyped object (no import of `NotificationEvent`).

**Change:** No change needed -- the event type is still valid in the StrategyEvent union.

### `session-lifecycle.ts` -- costDelta removal

**Current:** Computes `costDelta` (lines 166, 229), includes it in emitted `session_ended` event (lines 191, 254).

**Change:** Remove `costDelta` computation and field from both `endSession` and `crashSession` emit calls. The `resolveCostBaseline` function becomes dead code -- delete it.

### `sessions-routes.ts` -- costDelta removal

**Current:** Emits `costDelta: 0` at line 136.

**Change:** Remove `costDelta: 0` from the emit.

### `session-provisioning.ts` -- costDelta removal

Check and remove `costDelta` from any `session_ended` emissions.

### `observability/dispatcher.ts` -- costDelta removal

**Current:** Reads `ev.costDelta` at line 358 when handling `session_ended`.

**Change:** Remove `costDelta` from the observability event construction.

### `observability/langfuse-adapter.ts` -- costDelta removal

**Current:** Reads `ev.costDelta` at line 136.

**Change:** Remove `costDelta` from langfuse event construction.

### `observability/console-adapter.ts` -- costDelta removal

**Current:** Sets `out.costDelta = ev.costDelta` at line 47.

**Change:** Remove `costDelta` from console output.

### `shared/observability/events.ts` -- costDelta removal

**Current:** `SessionEndedObservabilityEvent` has `readonly costDelta: number` at line 45.

**Change:** Remove the `costDelta` field.

---

## Task 5: Update all test files

### Tests referencing deleted events

| Test file | Issue | Resolution |
|---|---|---|
| `policy-engine.test.ts` | 13 typed refs to `NotificationEvent` (import + variable types) | Keep -- `NotificationEvent` moves to StrategyEvent, type still exported |
| `task-state-machine.test.ts` | 1 import of `NotificationEvent` | Keep -- same reason |
| `dependency-watcher.test.ts` | 3 typed refs to `NotificationEvent` | Keep -- same reason |
| `ws-broadcaster.test.ts` | Imports `ResponseRecordedEvent`, test creates event object of this type | Delete the `ResponseRecordedEvent` test case (lines 52-73). Replace with a `KnowledgeUpdatedEvent` or `BetStateChangedEvent` test to maintain broadcast coverage. |
| `event-bus.test.ts` | Imports `BetShippedEvent` (line 23), `NotificationEvent` (line 25). Uses `BetShippedEvent` in satisfies check (line 241), `on("bet_shipped", ...)` at lines 209 and 230, emits `type: "bet_shipped"` at line 237. | Replace all `BetShippedEvent` usage with `BetStateChangedEvent`. Change `on("bet_shipped", ...)` to `on("bet_state_changed", ...)`. Update event construction to use `bet_state_changed` shape with `toState: "shipped"`. Keep `NotificationEvent` usage (still exported). |
| `builtin-routines.test.ts` | 6 `bet_shipped` refs: line 124 (`eventType: "bet_shipped"` in routine config), lines 381/388 (fires on `bet_shipped`), lines 426/433 (dedupe test), line 658 (event emission) | Change `eventType` from `"bet_shipped"` to `"bet_state_changed"` in routine config. Replace all `bet_shipped` event constructions with `bet_state_changed` events having `toState: "shipped"`. Update test descriptions. |
| `bet-state-machine.test.ts` | 7 `bet_shipped` refs: line 130 (test description), line 137 (`on("bet_shipped", ...)`), line 146 (asserts `type: "bet_shipped"`), lines 478/480 (concurrency test description), line 505 (filter for `bet_shipped`), line 507 (assertion comment) | Remove tests that assert on separate `bet_shipped` emission. Replace with assertions that `bet_state_changed` fires with `toState: "shipped"`. The concurrency test (I1 adversary-M1) should assert that `bet_state_changed` fires exactly once, not that `bet_shipped` fires exactly once. |
| `routine-scheduler.test.ts` | 2 refs: line 250 (`triggerConfig: { eventType: "bet_shipped" }`), line 261 (`type: "bet_shipped"` event emission) | Change `eventType` to `"bet_state_changed"` in trigger config. Change emitted event from `bet_shipped` to `bet_state_changed` with appropriate shape. |
| `observability/dispatcher.test.ts` | 2 refs: lines 292-293 (`bus.emit<"bet_shipped">({ type: "bet_shipped", ... })`) | Remove the `bet_shipped` emit test case. The `bet_state_changed` case in the dispatcher already handles `toState === "shipped"`. |

### Seed data referencing `bet_shipped`

| File | Issue | Resolution |
|---|---|---|
| `packages/db/src/seed-fixtures.ts` | Line 65: `triggerConfig: { eventType: "bet_shipped" }` for `builtin:post-bet-retro` routine | Change to `{ eventType: "bet_state_changed" }`. The routine handler in `builtin-routines.ts` will filter for `toState === "shipped"`. |
| `packages/db/src/__tests__/seed.test.ts` | Line 209: asserts `triggerConfig: { eventType: "bet_shipped" }` | Change assertion to `{ eventType: "bet_state_changed" }` |

### Tests referencing `costDelta`

| Test file | # refs | Resolution |
|---|---|---|
| `cost-cap.session-end-paths.test.ts` | 1 | Remove `costDelta` from event construction |
| `lifecycle-propagation.test.ts` | 10 | Remove `costDelta` from all `session_ended` event constructions |
| `session-provisioning.test.ts` | 4 (including AC assertion) | Remove `costDelta` assertions and field from event construction. Update AC8 test to not assert on `costDelta`. |
| `observability/h3-review-fixes.test.ts` | 1 | Remove `costDelta` from event construction |
| `session-review-creator.test.ts` | 4 | Remove `costDelta` from event construction |
| `observability/console-adapter.test.ts` | 1 | Remove `costDelta` from event construction and assertion |
| `observability/dispatcher.test.ts` | 1 | Remove `costDelta` from event construction and assertion |

### Tests for moved types

| Test file | Issue | Resolution |
|---|---|---|
| `shared/src/__tests__/types.test.ts` | Tests `KNOWLEDGE_STATUSES` (7-state, 3 test cases lines 63-87) | Move these tests to `packages/fabric/src/__tests__/types.test.ts`. Add new test for `KERNEL_KNOWLEDGE_STATUSES` in shared. |
| `web/src/__tests__/status-mapping.test.ts` | Tests `KNOWLEDGE_STATUSES` exhaustiveness (lines 113-142) | Update import to `@hyperidle/fabric` |

### Verification

- `bun run test` passes (all test files green)
- No test files import deleted types

---

## Task 6: Add new tests for O1 additions

### `packages/shared/src/__tests__/types.test.ts` -- new tests

```typescript
describe("KERNEL_KNOWLEDGE_STATUSES", () => {
  it("has 3 kernel knowledge statuses", () => {
    expect(KERNEL_KNOWLEDGE_STATUSES).toHaveLength(3);
  });

  it("includes draft, active, archived", () => {
    expect(KERNEL_KNOWLEDGE_STATUSES).toContain("draft");
    expect(KERNEL_KNOWLEDGE_STATUSES).toContain("active");
    expect(KERNEL_KNOWLEDGE_STATUSES).toContain("archived");
  });
});

describe("Agent role split", () => {
  it("KERNEL_AGENT_ROLES has 3 roles", () => {
    expect(KERNEL_AGENT_ROLES).toHaveLength(3);
    expect(KERNEL_AGENT_ROLES).toContain("builder");
    expect(KERNEL_AGENT_ROLES).toContain("growth");
    expect(KERNEL_AGENT_ROLES).toContain("product_manager");
  });

  it("FABRIC_AGENT_ROLES has 3 roles", () => {
    expect(FABRIC_AGENT_ROLES).toHaveLength(3);
    expect(FABRIC_AGENT_ROLES).toContain("practice_facilitator");
    expect(FABRIC_AGENT_ROLES).toContain("chief_of_staff");
    expect(FABRIC_AGENT_ROLES).toContain("brand_voice");
  });

  it("AGENT_ROLES composes both arrays", () => {
    expect(AGENT_ROLES).toHaveLength(6);
    for (const role of KERNEL_AGENT_ROLES) {
      expect(AGENT_ROLES).toContain(role);
    }
    for (const role of FABRIC_AGENT_ROLES) {
      expect(AGENT_ROLES).toContain(role);
    }
  });
});
```

### `packages/shared/src/__tests__/events.test.ts` -- new tests

Test the event union exhaustiveness:

```typescript
describe("KernelEvent union", () => {
  it("covers all kernel event types without default", () => {
    // Compile-time exhaustiveness check: this function must
    // handle every KernelEvent variant.
    function assertExhaustive(event: KernelEvent): string {
      switch (event.type) {
        case "task_state_changed": return event.type;
        case "bet_state_changed": return event.type;
        case "bet_revised": return event.type;
        case "session_started": return event.type;
        case "session_ended": return event.type;
        case "thread_created": return event.type;
        case "thread_message_appended": return event.type;
        case "thread_resolved": return event.type;
        case "thread_reopened": return event.type;
        case "thread_archived": return event.type;
        case "item_created": return event.type;
        case "dependency_met": return event.type;
        case "knowledge_created": return event.type;
        case "knowledge_updated": return event.type;
        case "knowledge_archived": return event.type;
        case "knowledge_accessed": return event.type;
      }
    }
    // The test's value is purely compile-time: TypeScript exhaustiveness
    // checking ensures the switch covers every KernelEvent variant. If a
    // new variant is added to KernelEvent without a case here, tsc fails.
    // The runtime assertion below exercises the function with one real event
    // to verify the switch is reachable.
    const sampleEvent: KernelEvent = {
      type: "task_state_changed",
      streamId: "s-1",
      taskId: "t-1",
      fromState: "open",
      toState: "in_progress",
      timestamp: Date.now(),
    };
    expect(assertExhaustive(sampleEvent)).toBe("task_state_changed");
  });
});

describe("KnowledgeUpdatedEvent.action", () => {
  it("accepts any string action value (intentionally loose)", () => {
    // action is `string` -- see @lore in events.ts for why tightening
    // is deferred (dynamic practice_meeting_turn_N pattern).
    const actions = ["created", "updated", "merged", "split", "archived",
      "flagged", "attention_recomputed", "practice_meeting_turn_3"];
    for (const action of actions) {
      const event: KnowledgeUpdatedEvent = {
        type: "knowledge_updated",
        streamId: "ki-1",
        itemId: "ki-1",
        action,
        timestamp: Date.now(),
      };
      expect(event.action).toBe(action);
    }
  });
});
```

### Verification

- `bun run test` passes
- `bun run check` passes

---

## Ordered task list (implementation sequence)

**Atomicity constraint:** Tasks 1-5 must be applied as one logical change (single commit). Between Task 2 (remove from shared) and Task 4 (update imports), every consumer of moved types has broken imports. The builder must not run `bun run check` until Task 5 is complete.

| # | Task | Files modified | Depends on | Done when |
|---|---|---|---|---|
| 1 | Create `fabric/src/types.ts` with moved types | `packages/fabric/src/types.ts` (new), `packages/fabric/src/index.ts` | None | File exists with all strategy types |
| 2 | Remove moved types from shared | `packages/shared/src/types.ts`, `packages/shared/src/propagation.ts` (delete), `packages/shared/src/index.ts` | Task 1 | Grep returns zero hits for strategy types in `packages/shared/src/` |
| 3 | Add new kernel types to shared | `packages/shared/src/types.ts`, `packages/shared/src/index.ts` | Task 2 | `KERNEL_KNOWLEDGE_STATUSES`, `KERNEL_AGENT_ROLES`, `FABRIC_AGENT_ROLES`, `AGENT_ROLES` exist in shared |
| 4 | Update all package imports | All files listed in Task 2 import map (including `query-practice.ts`) | Tasks 1-3 | All imports resolve |
| 5 | Add package dependencies | `packages/web/package.json`, `packages/design-system/package.json` | Task 1 | `bun install` succeeds, `bun run check` passes |
| 6 | Event interface changes | `packages/shared/src/events.ts` | Tasks 1-3 | New events defined, deleted events removed, unions created, costDelta removed, action kept as `string` |
| 7 | Update event re-exports in index.ts | `packages/shared/src/index.ts` | Task 6 | New events exported, deleted events removed |
| 8 | Remove bet_shipped emit from bet-state-machine.ts | `packages/server/src/services/bet-state-machine.ts` | Task 6 | No `bet_shipped` emit block; `@lore` comments updated |
| 9 | Migrate builtin-routines.ts | `packages/server/src/services/builtin-routines.ts` | Task 6 | Subscribes to `bet_state_changed` instead of `bet_shipped`; routine definition uses `eventType: "bet_state_changed"` |
| 10 | Remove bet_shipped from observability | `packages/server/src/services/observability/dispatcher.ts` | Task 6 | No `bet_shipped` case in dispatcher |
| 11 | Remove costDelta from services | `session-lifecycle.ts`, `sessions-routes.ts`, `session-provisioning.ts`, observability dispatcher/langfuse/console adapters, `shared/observability/events.ts`. Delete `resolveCostBaseline` function (dead code after costDelta removal). | Task 6 | No `costDelta` references in services. Add `@lore` comment noting intentional observability data gap (costDelta was always 0). |
| 12 | Update seed data | `packages/db/src/seed-fixtures.ts` | Task 9 | `triggerConfig.eventType` changed from `"bet_shipped"` to `"bet_state_changed"` |
| 13 | Update test files | All test files listed in Task 5 (including `bet-state-machine.test.ts`, `routine-scheduler.test.ts`, `seed.test.ts`, `event-bus.test.ts`, `observability/dispatcher.test.ts`) | Tasks 6-12 | `bun run test` passes |
| 14 | Add new tests | `shared/__tests__/types.test.ts`, `shared/__tests__/events.test.ts` or inline | Tasks 3, 6 | New tests pass |
| 15 | Move KNOWLEDGE_STATUSES tests | Move from `shared/__tests__/types.test.ts` to `fabric/__tests__/types.test.ts` | Tasks 1-2 | Tests pass in new location |
| 16 | Final verification | None | All above | `bun run check && bun run test && bun dev` all pass |

---

## Security and abuse cases

| Concern | Applicable? | Resolution |
|---|---|---|
| Rate-limit on POST/PATCH | N/A | O1 adds no routes |
| Input-trust boundary | N/A | O1 adds no input surfaces |
| Secret-handling | N/A | No credentials involved |
| Path-traversal | N/A | No path inputs |
| SSRF | N/A | No outbound URLs |

O1 is pure type reorganization. No new attack surface.

---

## Protected tests

Tests whose behavior assertions must not change (only import paths and deleted-type references may change):

```
protectedTests:
  - packages/server/src/__tests__/policy-engine.test.ts
  - packages/server/src/__tests__/task-state-machine.test.ts
  - packages/server/src/__tests__/dependency-watcher.test.ts
  - packages/server/src/__tests__/lifecycle-propagation.test.ts
  - packages/server/src/__tests__/session-provisioning.test.ts
  - packages/server/src/__tests__/bet-state-machine.test.ts
```

These tests verify core kernel behavior. Their assertions must continue to pass. Only import paths and removed fields (`costDelta`) may change. For `bet-state-machine.test.ts`: the `bet_shipped` event assertions must be migrated to assert on `bet_state_changed` with `toState === "shipped"` instead, but the core state-transition logic and concurrency-guard behavior (I1 adversary-M1) must not change. The `ws-broadcaster.test.ts` test for `ResponseRecordedEvent` is NOT protected -- it references a zombie event and the test case should be replaced.

---

## Risks and ambiguities

1. **KnowledgeFormat -- kernel or fabric?** The architecture doc says "stay in shared" for `KnowledgeFormat`. The concept doc agrees: format (markdown | toon) is a kernel concern (how content is stored). This is settled.

2. **Circular dependency risk with PropagationLevel inline.** The inline `PropagationLevelLiteral` in events.ts duplicates the definition in fabric/types.ts. If the canonical set changes in fabric, events.ts must be updated. Mitigated by: the propagation level vocabulary is stable (5 values matching the 5-level entity hierarchy), and a `@lore` comment flags the duplication.

3. **`AutonomyLevel` name collision.** Two types named `AutonomyLevel` exist: numeric (shared/types.ts, `1|2|3|4`) and string (api-contract/settings.ts, `"manual"|"supervised"|"autonomous"`). Only the numeric one moves to fabric. The api-contract one is unchanged and unrelated. No collision because they're in different packages with different imports.

4. **`KnowledgeStatus` in `knowledgeItems.status` column.** The DB schema still uses the 7-state `KnowledgeStatus`. O1 does NOT change the schema -- that's O2. After O1, the schema file will need to import `KnowledgeStatus` from fabric instead of shared. But the schema file in `packages/db/src/schema.ts` does not currently import `KnowledgeStatus` -- it uses raw string literals. No change needed in O1.

5. **`packages/web` dependency on `@hyperidle/fabric`.** Currently `packages/web/package.json` may not list `@hyperidle/fabric` as a dependency. It needs to be added. Check at implementation time.

6. **`builtin-routines.ts` behavior preservation.** After migrating from `bet_shipped` to `bet_state_changed`, the handler receives ALL bet state changes, not just shipped. The filter `if (event.toState !== "shipped") return;` must be the FIRST line to preserve behavior. The test must verify that non-shipped transitions are ignored.

7. **`KnowledgeUpdatedEvent.action` tightening deferred.** The action field stays as `string` because the codebase emits 11+ distinct action values including a dynamic `practice_meeting_turn_${turnNumber}` pattern that makes a closed union impossible without a design decision (e.g., split turnNumber into a separate field). Filed as follow-up.

8. **`resolveCostBaseline` dead code after costDelta removal.** Both call sites (lines 166 and 229 of `session-lifecycle.ts`) are removed when costDelta is removed. The function has no other callers. It must be explicitly deleted in Task 11.

9. **costDelta removal is a silent observability data gap.** The `SessionEndedObservabilityEvent` loses its `costDelta` field, meaning Langfuse and console adapters no longer report session costs. The field was always 0 in practice, so this is intentional. Add a `@lore` comment noting the removal is deliberate.

10. **`knowledge-repository.ts` in fabric imports `KnowledgeFormat` from `@hyperidle/shared`.** This is correct and should continue to work -- `KnowledgeFormat` stays in shared (kernel concern). The builder should not repoint this import to fabric.

11. **Existing DB rows with `"bet_shipped"` in `triggerConfig`.** The seed fixture change updates the canonical seed data, but existing databases created before O1 will still have `"bet_shipped"` in their routine trigger configs. A data migration is out of O1 scope. The `routine-scheduler.ts` `as EventType` cast is already unsafe by design -- routines with stale event types will simply never fire (no matching event emitted).
