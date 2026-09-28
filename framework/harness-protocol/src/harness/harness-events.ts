/** Harness-level events streamed from agent sessions. */

import type { ModelTier } from "@hyperidle/domain-model";

export interface TokenUsageEvent {
	readonly type: "token_usage";
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cachedInputTokens?: number;
	readonly cacheCreationInputTokens?: number;
	readonly reasoningOutputTokens?: number;
	/** Optional tier identifying which model tier produced these tokens. */
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

// @lore: cost_update is absent from HarnessEvent — "very few harnesses can report cost"; token_usage is the one signal every harness tracks
export type HarnessEvent = TokenUsageEvent | ToolCallEvent | CompletionEvent | ErrorEvent;

export type HarnessEventType = HarnessEvent["type"];
