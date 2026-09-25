/** Harness-level events streamed from agent sessions (D1). */

import type { ModelTier } from "@hyperidle/domain-model";

export interface TokenUsageEvent {
	readonly type: "token_usage";
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cachedInputTokens?: number;
	readonly cacheCreationInputTokens?: number;
	readonly reasoningOutputTokens?: number;
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

/**
 * `cost_update` (harness-adapter $-cost self-report) was removed —
 * founder ruling: "very few harness can actually report cost"; keep only
 * token usage (`token_usage`), tracked by every supported harness.
 */
export type HarnessEvent = TokenUsageEvent | ToolCallEvent | CompletionEvent | ErrorEvent;

export type HarnessEventType = HarnessEvent["type"];
