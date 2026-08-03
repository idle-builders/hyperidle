/** Harness-level events streamed from agent sessions (D1). */

import type { ModelTier } from "../types/money.js";

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

/**
 * @lore AK4: toolCalls is additive-optional — populated only by runChatTurn's
 * bounded tool-use loop. drainStreamEvents in assistant-turn.ts reads this to
 * attach tool call summaries to the persisted plain reply payload. The task
 * planning/execute/reflect loop never sets this field (zero blast radius).
 */
export interface CapturedToolCall {
	readonly name: string;
	readonly input: Record<string, unknown>;
	readonly output: string; // JSON-stringified tool result data or error message
	readonly status: "ok" | "error";
}

export interface CompletionEvent {
	readonly type: "completion";
	readonly text: string;
	/** AK4: tool calls captured during the conversational tool-use loop. */
	readonly toolCalls?: readonly CapturedToolCall[];
}

export interface ErrorEvent {
	readonly type: "error";
	readonly message: string;
	readonly code: string;
}

export interface PreCompactionEvent {
	readonly type: "pre_compaction";
	readonly contextTokens: number;
	readonly maxTokens: number;
}

/**
 * AU21: `cost_update` (harness-adapter $-cost self-report) was removed —
 * founder ruling: "very few harness can actually report cost"; keep only
 * token usage (`token_usage`), tracked by every supported harness.
 */
export type HarnessEvent =
	| TokenUsageEvent
	| ToolCallEvent
	| CompletionEvent
	| ErrorEvent
	| PreCompactionEvent;

export type HarnessEventType = HarnessEvent["type"];
