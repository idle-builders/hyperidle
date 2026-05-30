import type { HostKind, MessageType } from "./thread.js";
import type { BetStatus, TaskState } from "./types.js";

// --- Event type discriminants ---

export interface TaskStateChangedEvent {
	type: "task_state_changed";
	streamId: string;
	taskId: string;
	fromState: TaskState;
	toState: TaskState;
	timestamp: number;
}

export interface BetStateChangedEvent {
	type: "bet_state_changed";
	streamId: string;
	betId: string;
	fromState: BetStatus;
	toState: BetStatus;
	timestamp: number;
}

export interface ItemCreatedEvent {
	type: "item_created";
	streamId: string;
	itemId: string;
	conversationId: string;
	kind: string;
	timestamp: number;
}

export interface SessionStartedEvent {
	type: "session_started";
	streamId: string;
	sessionId: string;
	agentId: string;
	taskId: string;
	timestamp: number;
}

export type SessionOutcome = "completed" | "crashed" | "stopped";

export interface SessionEndedEvent {
	type: "session_ended";
	streamId: string;
	sessionId: string;
	agentId: string;
	taskId: string;
	timestamp: number;
	/** Final disposition of the session. */
	outcome: SessionOutcome;
}

export interface CostCapWarningEvent {
	type: "cost_cap_warning";
	streamId: string;
	level: "warning" | "critical";
	capLevel: "agent" | "team" | "factory";
	entityId: string;
	spend: number;
	cap: number;
	timestamp: number;
}

export interface CostCapBreachedEvent {
	type: "cost_cap_breached";
	streamId: string;
	level: "hard" | "soft";
	capLevel: "agent" | "team" | "factory";
	entityId: string;
	spend: number;
	cap: number;
	timestamp: number;
}

export interface NotificationEvent {
	type: "notification";
	streamId: string;
	targetId: string;
	message: string;
	timestamp: number;
}

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
	action: string; // intentionally loose -- see @lore above
	timestamp: number;
}

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

export interface RoutineFiredEvent {
	type: "routine_fired";
	streamId: string;
	routineId: string;
	agentId: string;
	timestamp: number;
}

export interface DependencyMetEvent {
	type: "dependency_met";
	streamId: string;
	taskId: string;
	dependencyId: string;
	timestamp: number;
}

export interface BetRevisedEvent {
	type: "bet_revised";
	streamId: string;
	betId: string;
	field: string;
	timestamp: number;
}

/**
 * Emitted by `session-provisioning` each time the harness yields a
 * `tool_call` event. Observability subscribes to this; the provisioning
 * layer also invokes the tool registry. Separate from the harness-level
 * `ToolCallEvent` to keep the pub/sub domain decoupled from the adapter
 * stream semantics.
 *
 * `argsSummary` is the already-scrubbed, length-bounded preview produced
 * by `summarizeToolArgs` — never the raw args object.
 */
export interface ToolCallRecordedEvent {
	type: "tool_call_recorded";
	streamId: string;
	sessionId: string;
	toolName: string;
	argsSummary: string;
	timestamp: number;
}

// L1a — Thread primitive events (plan §6.3). `streamId` = `threadId` so
// per-thread events arrive in order.
export interface ThreadCreatedEvent {
	type: "thread_created";
	streamId: string;
	threadId: string;
	hostKind: HostKind;
	hostId: string;
	initiatorId: string;
	timestamp: number;
}

export interface ThreadMessageAppendedEvent {
	type: "thread_message_appended";
	streamId: string;
	threadId: string;
	messageId: string;
	messageType: MessageType;
	senderId: string;
	timestamp: number;
}

export interface ThreadResolvedEvent {
	type: "thread_resolved";
	streamId: string;
	threadId: string;
	resolvedByMessageId: string;
	timestamp: number;
}

export interface ThreadReopenedEvent {
	type: "thread_reopened";
	streamId: string;
	threadId: string;
	reopenedByMessageId: string;
	timestamp: number;
}

export interface ThreadArchivedEvent {
	type: "thread_archived";
	streamId: string;
	threadId: string;
	timestamp: number;
}

/**
 * R6: Emitted by the create_artifact skill tool after a new artifact row is
 * inserted into the kernel artifacts table.
 *
 * @lore R6: producingTaskId is carried as `taskId` (not producingTaskId) to
 * keep the event shape consistent with other task-scoped events where the
 * field is called `taskId`. The WsBroadcaster forwards this to the "work"
 * topic so the UI can invalidate artifact galleries.
 */
export interface ArtifactCreatedEvent {
	type: "artifact_created";
	streamId: string;
	artifactId: string;
	taskId: string;
	kind: string;
	timestamp: number;
}

/**
 * @lore O1: PropagationLevel moved to @hyperidle/fabric. This inline literal
 * union avoids importing from fabric in shared (boundary rule: kernel never
 * imports from strategy). The canonical definition is in @hyperidle/fabric.
 *
 * @lore U1: "product" renamed to "team" in propagation levels. The propagation
 * hierarchy is: session -> task -> bet -> team -> portfolio.
 * Note: "product" scope kind in knowledge_items is UNCHANGED (different taxonomy).
 */
type PropagationLevelLiteral = "session" | "task" | "bet" | "team" | "portfolio";

/** L20: Emitted when lifecycle propagation successfully applies a transition. */
export interface PropagationAppliedEvent {
	type: "propagation_applied";
	/** streamId = targetId so per-entity streams receive the event. */
	streamId: string;
	sourceLevel: PropagationLevelLiteral;
	sourceId: string;
	targetLevel: PropagationLevelLiteral;
	targetId: string;
	targetTransition: string;
	timestamp: number;
}

/** L20: Emitted when lifecycle propagation fails after exhausting retries. */
export interface PropagationFailedEvent {
	type: "propagation_failed";
	/** streamId = targetId so per-entity streams receive the event. */
	streamId: string;
	sourceLevel: PropagationLevelLiteral;
	sourceId: string;
	targetLevel: PropagationLevelLiteral;
	targetId: string;
	failureReason: string;
	attempts: number;
	timestamp: number;
}

/**
 * Kernel events: entity lifecycle facts. When a kernel entity changes state,
 * these events announce what happened.
 *
 * @lore O1: To add a kernel event: (1) define the interface with type literal
 * discriminant, streamId, and timestamp, (2) add it to this union, (3) emit
 * from the route/service after the DB write. The EventBus is generic — no
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
	| KnowledgeAccessedEvent
	| ArtifactCreatedEvent;

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

/** All valid event type strings. */
export type EventType = DomainEvent["type"];

/** Wildcard subscription type. */
export type WildcardType = "*";

/** Extract the event interface for a given event type string. */
export type EventByType<T extends EventType> = Extract<DomainEvent, { type: T }>;

/** Handler function for a specific event type. */
export type EventHandler<T extends EventType> = (event: EventByType<T>) => void;

/** Handler function for wildcard subscriptions. */
export type WildcardHandler = (event: DomainEvent) => void;

/** Redis adapter interface (implementation deferred). */
export interface EventBusAdapter {
	publish(event: DomainEvent): Promise<void>;
	subscribe(type: EventType | WildcardType, handler: (event: DomainEvent) => void): Promise<void>;
	unsubscribe(type: EventType | WildcardType, handler: (event: DomainEvent) => void): Promise<void>;
}
