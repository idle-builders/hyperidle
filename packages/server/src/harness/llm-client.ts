/**
 * X6: callLlm() — single LLM API call with Anthropic and OpenAI-compatible format support.
 */

import type { ResolvedModel } from "@hyperidle/shared";
import type { LlmMessage, LlmResponse, LlmToolDef } from "./llm-types.js";

export interface CallLlmOptions {
	readonly model: ResolvedModel;
	readonly messages: readonly LlmMessage[];
	readonly tools?: readonly LlmToolDef[];
	readonly maxTokens?: number;
	readonly system?: string;
	/**
	 * X6 (critique WARNING-2): Per-call timeout in milliseconds.
	 * A hung provider connection would block the session loop indefinitely.
	 * Default: 120000ms (2 minutes).
	 *
	 * @lore X6: Total session wall-clock time is bounded by maxIterations * timeout.
	 */
	readonly timeoutMs?: number;
}

/**
 * Make a single LLM API call. Switches on model.provider to choose wire format:
 * - "anthropic" → Anthropic Messages API (POST /v1/messages)
 * - "openrouter" → Anthropic Messages API via OpenRouter (POST /api/v1/messages)
 *   with X-OpenRouter-Title header
 * - "openai-compatible" → OpenAI Chat Completions (POST /v1/chat/completions)
 *
 * Returns a normalized LlmResponse regardless of provider.
 *
 * Retries with exponential backoff for transient HTTP errors (429, 502, 503),
 * max 3 retries, base delay 1000ms.
 * Immediate failure for permanent errors (400, 401, 403, 404).
 *
 * @lore X6 (critique WARNING-3): A single 429/503 from the LLM provider should
 * not crash the entire session. Transient errors get retry-with-backoff; permanent
 * errors (auth failures, bad requests) fail immediately.
 */
export async function callLlm(_options: CallLlmOptions): Promise<LlmResponse> {
	throw new Error("not implemented");
}
