/** Harness-level events streamed from agent sessions (D1). */

import type { CurrencyCode, ModelTier } from "../types/money.js";

export interface TokenUsageEvent {
	readonly type: "token_usage";
	readonly inputTokens: number;
	readonly outputTokens: number;
	/** L17: optional tier identifying which model tier produced these tokens. */
	readonly tier?: ModelTier;
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
	/** L17: optional currency code for the cost values. */
	readonly currency?: CurrencyCode;
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
