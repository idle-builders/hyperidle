/**
 * X6: Wire-format-agnostic message representation used inside the built-in harness.
 * Both Anthropic and OpenAI-compatible formats are normalized to this shape.
 */

type LlmRole = "system" | "user" | "assistant";

/** A text content block. */
interface LlmTextBlock {
	readonly type: "text";
	readonly text: string;
}

/** A tool-use request from the assistant. */
interface LlmToolUseBlock {
	readonly type: "tool_use";
	readonly id: string;
	readonly name: string;
	readonly input: Record<string, unknown>;
}

/** A tool result from the user (response to a tool_use). */
interface LlmToolResultBlock {
	readonly type: "tool_result";
	readonly toolUseId: string;
	readonly content: string;
	readonly isError: boolean;
}

export type LlmContentBlock = LlmTextBlock | LlmToolUseBlock | LlmToolResultBlock;

export interface LlmMessage {
	readonly role: LlmRole;
	readonly content: readonly LlmContentBlock[] | string;
}

/** Normalized response from any LLM provider. */
export interface LlmResponse {
	readonly stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop";
	readonly content: readonly (LlmTextBlock | LlmToolUseBlock)[];
	readonly usage: {
		readonly inputTokens: number;
		readonly outputTokens: number;
		readonly cacheReadInputTokens?: number;
		readonly cacheCreationInputTokens?: number;
	};
}

/** Tool definition in the internal format (derived from ClaudeToolSpec). */
interface LlmToolDef {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: {
		readonly type: "object";
		readonly properties: Record<string, unknown>;
		readonly required?: readonly string[];
	};
}

export type { LlmRole, LlmTextBlock, LlmToolDef, LlmToolResultBlock, LlmToolUseBlock };
