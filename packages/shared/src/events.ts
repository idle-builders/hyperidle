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

export interface BetShippedEvent {
	type: "bet_shipped";
	streamId: string;
	betId: string;
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
	/** Cost (in cents) attributed to this session since last recorded value. */
	costDelta: number;
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

export interface ResponseRecordedEvent {
	type: "response_recorded";
	streamId: string;
	responseId: string;
	itemId: string;
	decision: string;
	/** Set when `decision === "request-changes"`. Capped client-side at 140 chars. */
	summary?: string;
	/** Set when `decision === "request-changes"`. `lineIndex` indexes the flattened hunk lines. */
	inlineComments?: Array<{ lineIndex: number; body: string }>;
	timestamp: number;
}

export interface KnowledgeUpdatedEvent {
	type: "knowledge_updated";
	streamId: string;
	itemId: string;
	action: string;
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

export interface BetCommittedEvent {
	type: "bet_committed";
	streamId: string;
	betId: string;
	teamId: string;
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

/** Discriminated union of all domain events. */
export type DomainEvent =
	| TaskStateChangedEvent
	| BetStateChangedEvent
	| BetShippedEvent
	| ItemCreatedEvent
	| SessionStartedEvent
	| SessionEndedEvent
	| CostCapWarningEvent
	| CostCapBreachedEvent
	| NotificationEvent
	| ResponseRecordedEvent
	| KnowledgeUpdatedEvent
	| RoutineFiredEvent
	| DependencyMetEvent
	| BetCommittedEvent
	| BetRevisedEvent
	| ToolCallRecordedEvent
	| ThreadCreatedEvent
	| ThreadMessageAppendedEvent
	| ThreadResolvedEvent
	| ThreadReopenedEvent
	| ThreadArchivedEvent;

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
