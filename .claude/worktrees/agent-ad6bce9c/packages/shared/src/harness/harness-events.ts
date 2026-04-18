/** Harness-level events streamed from agent sessions (D1). */

export interface TokenUsageEvent {
	readonly type: "token_usage";
	readonly inputTokens: number;
	readonly outputTokens: number;
}

export interface ToolCallEvent {
	readonly type: "tool_call";
	readonly toolName: string;
	readonly args: Record<string, unknown>;
}

export interface CompletionEvent {
	readonly type: "completion";
	readonly text: string;
}

export interface ErrorEvent {
	readonly type: "error";
	readonly message: string;
	readonly code: string;
}

export interface CostUpdateEvent {
	readonly type: "cost_update";
	readonly totalCost: number;
	readonly deltaCost: number;
}

export interface PreCompactionEvent {
	readonly type: "pre_compaction";
	readonly contextTokens: number;
	readonly maxTokens: number;
}

export type HarnessEvent =
	| TokenUsageEvent
	| ToolCallEvent
	| CompletionEvent
	| ErrorEvent
	| CostUpdateEvent
	| PreCompactionEvent;

export type HarnessEventType = HarnessEvent["type"];
