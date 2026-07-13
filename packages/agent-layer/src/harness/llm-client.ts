/**
 * X6: callLlm() — single LLM API call with Anthropic and OpenAI-compatible format support.
 */

import type { ResolvedModel } from "@hyperidle/shared";
import type {
	LlmMessage,
	LlmResponse,
	LlmTextBlock,
	LlmToolDef,
	LlmToolUseBlock,
} from "./llm-types.js";

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

// HTTP status codes that are transient and warrant retry
const TRANSIENT_STATUS_CODES = new Set([429, 502, 503]);

// HTTP status codes that are permanent failures — no retry
const PERMANENT_FAILURE_CODES = new Set([400, 401, 403, 404]);

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_TOKENS = 16_384;

// ── Internal OpenAI format types ──────────────────────────────────────────────

interface OpenAiFunctionTool {
	readonly type: "function";
	readonly function: {
		readonly name: string;
		readonly description: string;
		readonly parameters: {
			readonly type: "object";
			readonly properties: Record<string, unknown>;
			readonly required?: readonly string[];
		};
	};
}

interface AnthropicTool {
	readonly name: string;
	readonly description: string;
	// biome-ignore lint/style/useNamingConvention: Anthropic API wire format uses snake_case
	readonly input_schema: {
		readonly type: "object";
		readonly properties: Record<string, unknown>;
		readonly required?: readonly string[];
	};
}

// ── Format converters ─────────────────────────────────────────────────────────

function toolDefToAnthropicTool(def: LlmToolDef): AnthropicTool {
	return {
		name: def.name,
		description: def.description,
		input_schema: {
			type: "object",
			properties: def.inputSchema.properties,
			...(def.inputSchema.required ? { required: def.inputSchema.required } : {}),
		},
	};
}

function toolDefToOpenAiTool(def: LlmToolDef): OpenAiFunctionTool {
	return {
		type: "function",
		function: {
			name: def.name,
			description: def.description,
			parameters: {
				type: "object",
				properties: def.inputSchema.properties,
				...(def.inputSchema.required ? { required: def.inputSchema.required } : {}),
			},
		},
	};
}

/**
 * Convert internal LlmMessage[] to the format Anthropic expects.
 * Tool results from our internal format (LlmToolResultBlock in user messages)
 * map directly to Anthropic's tool_result content blocks.
 */
function toAnthropicMessages(messages: readonly LlmMessage[]): unknown[] {
	return messages.map((msg) => {
		if (typeof msg.content === "string") {
			return { role: msg.role, content: msg.content };
		}
		// Map content blocks — Anthropic uses snake_case tool_use ids
		const content = msg.content.map((block) => {
			if (block.type === "tool_result") {
				return {
					type: "tool_result",
					tool_use_id: block.toolUseId,
					content: block.content,
					is_error: block.isError,
				};
			}
			return block;
		});
		return { role: msg.role, content };
	});
}

/**
 * Convert internal LlmMessage[] to OpenAI Chat Completions format.
 * - system messages → role: "system"
 * - tool_result blocks → role: "tool" messages with tool_call_id
 * - tool_use blocks in assistant messages → tool_calls array
 */
function toOpenAiMessages(messages: readonly LlmMessage[]): unknown[] {
	const result: unknown[] = [];

	for (const msg of messages) {
		if (typeof msg.content === "string") {
			result.push({ role: msg.role, content: msg.content });
			continue;
		}

		// Check if this is a user message containing only tool_result blocks
		const allToolResults = msg.content.every((b) => b.type === "tool_result");
		if (msg.role === "user" && allToolResults) {
			// Each tool_result becomes a separate "tool" role message
			for (const block of msg.content) {
				if (block.type === "tool_result") {
					result.push({
						role: "tool",
						tool_call_id: block.toolUseId,
						content: block.content,
					});
				}
			}
			continue;
		}

		// Check if this is an assistant message with tool_use blocks
		const toolUseBlocks = msg.content.filter((b): b is LlmToolUseBlock => b.type === "tool_use");
		const textBlocks = msg.content.filter((b): b is LlmTextBlock => b.type === "text");

		if (msg.role === "assistant" && toolUseBlocks.length > 0) {
			result.push({
				role: "assistant",
				content: textBlocks.length > 0 ? textBlocks.map((b) => b.text).join("\n") : null,
				tool_calls: toolUseBlocks.map((b) => ({
					id: b.id,
					type: "function",
					function: {
						name: b.name,
						arguments: JSON.stringify(b.input),
					},
				})),
			});
			continue;
		}

		// Regular user or assistant message with text blocks
		const text = msg.content
			.filter((b): b is LlmTextBlock => b.type === "text")
			.map((b) => b.text)
			.join("\n");
		result.push({ role: msg.role, content: text });
	}

	return result;
}

// ── Response parsers ──────────────────────────────────────────────────────────

interface AnthropicResponseBody {
	// biome-ignore lint/style/useNamingConvention: Anthropic API wire format
	stop_reason: string;
	content: Array<{
		type: string;
		text?: string;
		id?: string;
		name?: string;
		input?: Record<string, unknown>;
	}>;
	usage: {
		// biome-ignore lint/style/useNamingConvention: Anthropic API wire format
		input_tokens: number;
		// biome-ignore lint/style/useNamingConvention: Anthropic API wire format
		output_tokens: number;
		// biome-ignore lint/style/useNamingConvention: Anthropic API wire format
		cache_read_input_tokens?: number;
		// biome-ignore lint/style/useNamingConvention: Anthropic API wire format
		cache_creation_input_tokens?: number;
	};
}

function parseAnthropicResponse(body: AnthropicResponseBody): LlmResponse {
	const stopReason = (() => {
		switch (body.stop_reason) {
			case "end_turn":
				return "end_turn" as const;
			case "tool_use":
				return "tool_use" as const;
			case "max_tokens":
				return "max_tokens" as const;
			default:
				return "end_turn" as const;
		}
	})();

	const content = body.content
		.map((block): LlmTextBlock | LlmToolUseBlock | null => {
			if (block.type === "text" && block.text !== undefined) {
				return { type: "text", text: block.text };
			}
			if (
				block.type === "tool_use" &&
				block.id !== undefined &&
				block.name !== undefined &&
				block.input !== undefined
			) {
				return {
					type: "tool_use",
					id: block.id,
					name: block.name,
					input: block.input,
				};
			}
			return null;
		})
		.filter((b): b is LlmTextBlock | LlmToolUseBlock => b !== null);

	return {
		stopReason,
		content,
		usage: {
			inputTokens: body.usage.input_tokens,
			outputTokens: body.usage.output_tokens,
			...(body.usage.cache_read_input_tokens !== undefined
				? { cacheReadInputTokens: body.usage.cache_read_input_tokens }
				: {}),
			...(body.usage.cache_creation_input_tokens !== undefined
				? { cacheCreationInputTokens: body.usage.cache_creation_input_tokens }
				: {}),
		},
	};
}

interface OpenAiResponseBody {
	choices: Array<{
		// biome-ignore lint/style/useNamingConvention: OpenAI API wire format
		finish_reason: string;
		message: {
			role: string;
			content: string | null;
			// biome-ignore lint/style/useNamingConvention: OpenAI API wire format
			tool_calls?: Array<{
				id: string;
				type: string;
				function: {
					name: string;
					arguments: string;
				};
			}> | null;
		};
	}>;
	usage: {
		// biome-ignore lint/style/useNamingConvention: OpenAI API wire format
		prompt_tokens: number;
		// biome-ignore lint/style/useNamingConvention: OpenAI API wire format
		completion_tokens: number;
	};
}

function parseOpenAiResponse(body: OpenAiResponseBody): LlmResponse {
	const choice = body.choices[0];
	if (!choice) {
		throw new Error("OpenAI response has no choices");
	}

	const stopReason = (() => {
		switch (choice.finish_reason) {
			case "tool_calls":
			case "function_call":
				return "tool_use" as const;
			case "stop":
				return "end_turn" as const;
			case "length":
				return "max_tokens" as const;
			default:
				return "end_turn" as const;
		}
	})();

	const content: Array<LlmTextBlock | LlmToolUseBlock> = [];

	if (choice.message.content) {
		content.push({ type: "text", text: choice.message.content });
	}

	if (choice.message.tool_calls) {
		for (const toolCall of choice.message.tool_calls) {
			let input: Record<string, unknown>;
			try {
				input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
			} catch {
				input = {};
			}
			content.push({
				type: "tool_use",
				id: toolCall.id,
				name: toolCall.function.name,
				input,
			});
		}
	}

	return {
		stopReason,
		content,
		usage: {
			inputTokens: body.usage.prompt_tokens,
			outputTokens: body.usage.completion_tokens,
		},
	};
}

// ── Main callLlmDirect implementation ─────────────────────────────────────────

async function fetchWithTimeout(
	url: string,
	init: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	// Use Promise.race to enforce timeout — this works even when fetch is mocked
	// and doesn't respect AbortSignal. AbortSignal is still passed for real network
	// calls where the browser/Node.js can cancel the connection early.
	//
	// @lore X6: We use Promise.race + setTimeout instead of AbortSignal.timeout() alone
	// because mocked fetch implementations (used in tests) do not check the signal.
	// Promise.race guarantees the timeout fires regardless of the fetch implementation.
	const controller = new AbortController();
	const abortTimeoutId = setTimeout(() => controller.abort(), timeoutMs);
	let rejectTimeoutId: ReturnType<typeof setTimeout>;

	const fetchPromise = fetch(url, { ...init, signal: controller.signal });
	const timeoutPromise = new Promise<never>((_, reject) => {
		rejectTimeoutId = setTimeout(() => {
			reject(new Error(`LLM call timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});

	try {
		const result = await Promise.race([fetchPromise, timeoutPromise]);
		clearTimeout(abortTimeoutId);
		// biome-ignore lint/style/noNonNullAssertion: rejectTimeoutId is always assigned before Promise.race resolves
		clearTimeout(rejectTimeoutId!);
		return result;
	} catch (err) {
		clearTimeout(abortTimeoutId);
		// biome-ignore lint/style/noNonNullAssertion: rejectTimeoutId is always assigned before Promise.race settles
		clearTimeout(rejectTimeoutId!);
		throw err;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
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
 *
 * @lore AH6 B1: This is the raw network implementation (renamed from callLlm).
 * The exported callLlm below dispatches through it via the env-gated cassette
 * interceptor. All 6 adapter call sites import callLlm (the dispatcher) and
 * are unaffected by this rename.
 */
export async function callLlmDirect(options: CallLlmOptions): Promise<LlmResponse> {
	const { model, messages, tools, system, maxTokens = DEFAULT_MAX_TOKENS } = options;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			const response = await callLlmOnce(model, messages, tools, system, maxTokens, timeoutMs);
			return response;
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));

			// Check if it's an HTTP error with a status code
			if (error instanceof HttpError) {
				// Permanent errors — no retry
				if (PERMANENT_FAILURE_CODES.has(error.status)) {
					throw error;
				}

				// Transient errors — retry with backoff
				if (TRANSIENT_STATUS_CODES.has(error.status) && attempt < MAX_RETRIES) {
					lastError = error;
					const delayMs = BASE_DELAY_MS * 2 ** attempt;
					await sleep(delayMs);
					continue;
				}

				// Max retries exhausted for transient errors
				throw error;
			}

			// Non-HTTP errors (network failures, timeouts) — throw immediately
			throw error;
		}
	}

	throw lastError ?? new Error("callLlm: max retries exhausted");
}

/**
 * POLISH-060 B2: Exported so assistant-turn.ts can map specific HTTP error
 * codes (401/403 → auth notice, 400 → config notice) rather than treating
 * all LLM HTTP errors as "usually temporary".
 *
 * @lore POLISH-060 B2: HttpError was previously private. 401/403 from the LLM
 * endpoint means a bad/missing key — permanently broken, not transient. A
 * passthrough to the generic "usually temporary" copy sent users into a futile
 * retry loop. 400 means wrong model id or bad request config — also deterministic.
 */
export class HttpError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "HttpError";
	}
}

function callLlmOnce(
	model: ResolvedModel,
	messages: readonly LlmMessage[],
	tools: readonly LlmToolDef[] | undefined,
	system: string | undefined,
	maxTokens: number,
	timeoutMs: number,
): Promise<LlmResponse> {
	if (model.provider === "openai-compatible") {
		return callOpenAi(model, messages, tools, system, maxTokens, timeoutMs);
	}
	// Both "anthropic" and "openrouter" use Anthropic Messages API format
	return callAnthropic(model, messages, tools, system, maxTokens, timeoutMs);
}

async function callAnthropic(
	model: ResolvedModel,
	messages: readonly LlmMessage[],
	tools: readonly LlmToolDef[] | undefined,
	system: string | undefined,
	maxTokens: number,
	timeoutMs: number,
): Promise<LlmResponse> {
	const url = `${model.baseUrl}/v1/messages`;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"x-api-key": model.apiKey,
		"anthropic-version": "2023-06-01",
	};

	if (model.provider === "openrouter") {
		headers["X-OpenRouter-Title"] = "HyperIdle";
		// OpenRouter also accepts Authorization: Bearer
		headers.Authorization = `Bearer ${model.apiKey}`;
		delete headers["x-api-key"];
	}

	const anthropicMessages = toAnthropicMessages(messages);

	const body: Record<string, unknown> = {
		model: model.model,
		messages: anthropicMessages,
		max_tokens: maxTokens,
	};

	if (system) {
		body.system = system;
	}

	if (tools && tools.length > 0) {
		body.tools = tools.map(toolDefToAnthropicTool);
	}

	const response = await fetchWithTimeout(
		url,
		{
			method: "POST",
			headers,
			body: JSON.stringify(body),
		},
		timeoutMs,
	);

	if (!response.ok) {
		const text = await response.text();
		throw new HttpError(response.status, `Anthropic API error ${response.status}: ${text}`);
	}

	const responseBody = (await response.json()) as AnthropicResponseBody;
	return parseAnthropicResponse(responseBody);
}

async function callOpenAi(
	model: ResolvedModel,
	messages: readonly LlmMessage[],
	tools: readonly LlmToolDef[] | undefined,
	system: string | undefined,
	maxTokens: number,
	timeoutMs: number,
): Promise<LlmResponse> {
	const url = `${model.baseUrl}/v1/chat/completions`;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		// biome-ignore lint/style/useNamingConvention: HTTP Authorization header (PascalCase is the HTTP spec)
		Authorization: `Bearer ${model.apiKey}`,
	};

	const openAiMessages: unknown[] = [];
	if (system) {
		openAiMessages.push({ role: "system", content: system });
	}
	openAiMessages.push(...toOpenAiMessages(messages));

	const body: Record<string, unknown> = {
		model: model.model,
		messages: openAiMessages,
		max_tokens: maxTokens,
	};

	if (tools && tools.length > 0) {
		body.tools = tools.map(toolDefToOpenAiTool);
	}

	const response = await fetchWithTimeout(
		url,
		{
			method: "POST",
			headers,
			body: JSON.stringify(body),
		},
		timeoutMs,
	);

	if (!response.ok) {
		const text = await response.text();
		throw new HttpError(response.status, `OpenAI API error ${response.status}: ${text}`);
	}

	const responseBody = (await response.json()) as OpenAiResponseBody;
	return parseOpenAiResponse(responseBody);
}

// ── AH6 B1: env-gated cassette dispatcher ─────────────────────────────────────

/**
 * AH6 B1: env-gated dispatcher for LLM_CASSETTE_MODE.
 *
 * Transparent to all 6 adapter call sites — they import and call callLlm as before.
 * Production (LLM_CASSETTE_MODE unset): zero overhead, routes directly to callLlmDirect.
 * Replay (LLM_CASSETTE_MODE=replay): reads cassette from LLM_CASSETTE_DIR/scenario.json,
 *   returns the recorded response — no network call, no API key needed.
 * Record (LLM_CASSETTE_MODE=record): calls callLlmDirect + persists to cassette file.
 *
 * @lore AH6 B1: Interception at the definition module (not the adapter) means
 * all 6 adapter call sites + harness-discovery.ts are covered transparently.
 * Production behavior is unchanged when LLM_CASSETTE_MODE is unset.
 */
export async function callLlm(options: CallLlmOptions): Promise<LlmResponse> {
	const mode = process.env.LLM_CASSETTE_MODE;
	if (mode === "replay") {
		const { replayLlm, loadCassetteEntries } = await import("./llm-cassette.js");
		const entries = loadCassetteEntries();
		return replayLlm(options, entries);
	}
	if (mode === "record") {
		const { recordLlm } = await import("./llm-cassette.js");
		return recordLlm(options, callLlmDirect);
	}
	return callLlmDirect(options);
}
