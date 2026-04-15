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

export interface SessionEndedEvent {
	type: "session_ended";
	streamId: string;
	sessionId: string;
	agentId: string;
	taskId: string;
	timestamp: number;
}

export interface CostCapWarningEvent {
	type: "cost_cap_warning";
	streamId: string;
	level: "warning" | "critical";
	entityId: string;
	spend: number;
	cap: number;
	timestamp: number;
}

export interface CostCapBreachedEvent {
	type: "cost_cap_breached";
	streamId: string;
	level: "hard" | "soft";
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
	| NotificationEvent;

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
