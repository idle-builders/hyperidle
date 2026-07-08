/**
 * Observability event types (H3).
 *
 * These are the events the observability adapter records. They are
 * distinct from `DomainEvent` (see `../events.ts`): a `DomainEvent` is
 * an internal bus message; an `ObservabilityEvent` is a telemetry record
 * shipped to the configured adapter (Console, etc.) with a correlating `traceId`.
 *
 * Shape is a discriminated union on `kind` so narrowing works in the
 * adapter's switch statement and the union is safely extendable.
 */

import type { SessionOutcome } from "../events.js";

type ObservabilityEventKind =
	| "session_started"
	| "session_ended"
	| "tool_call"
	| "cost_incurred"
	| "task_state_changed"
	| "bet_state_changed"
	| "knowledge_write";

interface ObservabilityEventBase {
	/** Correlates all events within a session. UUID v4. */
	readonly traceId: string;
	/** Session id when the event originates from a session, otherwise null. */
	readonly sessionId: string | null;
	/** ISO 8601 timestamp. */
	readonly ts: string;
	readonly kind: ObservabilityEventKind;
}

interface SessionStartedObservabilityEvent extends ObservabilityEventBase {
	readonly kind: "session_started";
	readonly agentId: string;
	readonly taskId: string | null;
}

interface SessionEndedObservabilityEvent extends ObservabilityEventBase {
	readonly kind: "session_ended";
	readonly agentId: string;
	readonly taskId: string | null;
	readonly outcome: SessionOutcome;
}

interface ToolCallObservabilityEvent extends ObservabilityEventBase {
	readonly kind: "tool_call";
	readonly toolName: string;
	/** Bounded preview of args, secrets scrubbed. Never the raw object. */
	readonly argsSummary: string;
}

type CostLevel = "warning" | "critical" | "hard" | "soft";
type CostCapLevel = "agent" | "team" | "factory";

interface CostIncurredObservabilityEvent extends ObservabilityEventBase {
	readonly kind: "cost_incurred";
	readonly level: CostLevel;
	readonly capLevel: CostCapLevel;
	readonly entityId: string;
	readonly spend: number;
	readonly cap: number;
}

interface TaskStateChangedObservabilityEvent extends ObservabilityEventBase {
	readonly kind: "task_state_changed";
	readonly taskId: string;
	readonly fromState: string;
	readonly toState: string;
}

interface BetStateChangedObservabilityEvent extends ObservabilityEventBase {
	readonly kind: "bet_state_changed";
	readonly betId: string;
	readonly fromState: string;
	readonly toState: string;
}

interface KnowledgeWriteObservabilityEvent extends ObservabilityEventBase {
	readonly kind: "knowledge_write";
	readonly itemId: string;
	readonly action: string;
}

export type ObservabilityEvent =
	| SessionStartedObservabilityEvent
	| SessionEndedObservabilityEvent
	| ToolCallObservabilityEvent
	| CostIncurredObservabilityEvent
	| TaskStateChangedObservabilityEvent
	| BetStateChangedObservabilityEvent
	| KnowledgeWriteObservabilityEvent;
