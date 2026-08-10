/**
 * X6: callLlm() — single LLM API call with Anthropic and OpenAI-compatible format support.
 */

import { HttpError, type ResolvedModel } from "@hyperidle/domain-model";
import type {
	LlmMessage,
	LlmResponse,
	LlmTextBlock,
	LlmToolDef,
	LlmToolUseBlock,
} from "./llm-types.js";

/**
 * Explicit type-predicate wrapper around `instanceof HttpError`.
 *
 * @lore AU19 Increment 4: a plain `error instanceof HttpError` check here
 * (unchanged from the pre-migration `packages/server/src/harness/llm-client.ts`)
 * fails to narrow `error.status` under this package's standalone
 * `tsc --noEmit -p <pkg>/tsconfig.json` invocation (the exact command
 * `tools/repo-gates/src/typecheck-gate.ts` runs) — confirmed to be a pre-existing,
 * repo-wide artifact of cross-package-reference type resolution (reproduces
 * identically in `core-api/knowledge` and `agent-orchestration/dispatch`,
 * both otherwise-clean packages, with a trivial `instanceof HttpError`
 * scratch reproduction), not something this migration introduced. An
 * explicit type-predicate function sidesteps the automatic-narrowing gap
 * without a cast. Zero behavior change — same runtime `instanceof` check.
 */
function isHttpError(e: Error): e is HttpError {
	return e instanceof HttpError;
}

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
	/** Cancels the active request and any pending retry backoff. */
	readonly signal?: AbortSignal;
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
	callerSignal?: AbortSignal,
): Promise<Response> {
	// Use Promise.race to enforce timeout — this works even when fetch is mocked
	// and doesn't respect AbortSignal. AbortSignal is still passed for real network
	// calls where the browser/Node.js can cancel the connection early.
	//
	// @lore X6: We use Promise.race + setTimeout instead of AbortSignal.timeout() alone
	// because mocked fetch implementations (used in tests) do not check the signal.
	// Promise.race guarantees the timeout fires regardless of the fetch implementation.
	const controller = new AbortController();
	const fetchPromise = fetch(url, { ...init, signal: controller.signal });
	let rejectCancellation: (error: Error) => void = () => undefined;
	const cancellationPromise = new Promise<never>((_, reject) => {
		rejectCancellation = reject;
	});
	const abortFromCaller = () => {
		const error = abortError(callerSignal?.reason);
		controller.abort(error);
		rejectCancellation(error);
	};
	if (callerSignal?.aborted) abortFromCaller();
	else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
	const timeoutId = setTimeout(() => {
		const error = new Error(`LLM call timed out after ${timeoutMs}ms`);
		controller.abort(error);
		rejectCancellation(error);
	}, timeoutMs);

	try {
		return await Promise.race([fetchPromise, cancellationPromise]);
	} finally {
		clearTimeout(timeoutId);
		callerSignal?.removeEventListener("abort", abortFromCaller);
	}
}

function abortError(reason?: unknown): Error {
	return reason instanceof Error
		? reason
		: new DOMException("The operation was aborted", "AbortError");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) return Promise.reject(abortError(signal.reason));
	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			signal?.removeEventListener("abort", abort);
			resolve();
		}, ms);
		const abort = () => {
			clearTimeout(timeoutId);
			reject(abortError(signal?.reason));
		};
		signal?.addEventListener("abort", abort, { once: true });
	});
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
async function callLlmDirect(options: CallLlmOptions): Promise<LlmResponse> {
	const { model, messages, tools, system, maxTokens = DEFAULT_MAX_TOKENS } = options;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		if (options.signal?.aborted) throw abortError(options.signal.reason);
		try {
			const response = await callLlmOnce(
				model,
				messages,
				tools,
				system,
				maxTokens,
				timeoutMs,
				options.signal,
			);
			return response;
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			if (options.signal?.aborted) throw abortError(options.signal.reason);

			// Check if it's an HTTP error with a status code
			if (isHttpError(error)) {
				// Permanent errors — no retry
				if (PERMANENT_FAILURE_CODES.has(error.status)) {
					throw error;
				}

				// Transient errors — retry with backoff
				if (TRANSIENT_STATUS_CODES.has(error.status) && attempt < MAX_RETRIES) {
					lastError = error;
					const delayMs = BASE_DELAY_MS * 2 ** attempt;
					await sleep(delayMs, options.signal);
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
 * POLISH-060 B2: `HttpError` moved to `@hyperidle/domain-model` (AU19 Increment
 * 3h) — `dispatch`'s `mapErrorToNotice` needs `instanceof HttpError` across
 * the agent-orchestration → agent-execution seam, and Mechanism C forbids a
 * Service importing another Service's class. Re-exported here unchanged so
 * this file's own `throw new HttpError(...)` call sites need no edit.
 */
export { HttpError };

function callLlmOnce(
	model: ResolvedModel,
	messages: readonly LlmMessage[],
	tools: readonly LlmToolDef[] | undefined,
	system: string | undefined,
	maxTokens: number,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<LlmResponse> {
	if (model.provider === "openai-compatible") {
		return callOpenAi(model, messages, tools, system, maxTokens, timeoutMs, signal);
	}
	// Both "anthropic" and "openrouter" use Anthropic Messages API format
	return callAnthropic(model, messages, tools, system, maxTokens, timeoutMs, signal);
}

async function callAnthropic(
	model: ResolvedModel,
	messages: readonly LlmMessage[],
	tools: readonly LlmToolDef[] | undefined,
	system: string | undefined,
	maxTokens: number,
	timeoutMs: number,
	signal?: AbortSignal,
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
		signal,
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
	signal?: AbortSignal,
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
		signal,
	);

	if (!response.ok) {
		const text = await response.text();
		throw new HttpError(response.status, `OpenAI API error ${response.status}: ${text}`);
	}

	const responseBody = (await response.json()) as OpenAiResponseBody;
	return parseOpenAiResponse(responseBody);
}

// ── LLM interception seam ─────────────────────────────────────────────────────

/**
 * An installed interceptor wraps every `callLlm`. It receives the direct caller so it
 * can pass through, replay from a cassette, or record.
 */
export type LlmInterceptor = (
	options: CallLlmOptions,
	direct: (options: CallLlmOptions) => Promise<LlmResponse>,
) => Promise<LlmResponse>;

let installedInterceptor: LlmInterceptor | null = null;

/**
 * Install (or clear, with `null`) the process-wide LLM interceptor.
 *
 * @lore AU28: AH6 B1 originally put the cassette knowledge INSIDE `callLlm` — it read
 * `LLM_CASSETTE_MODE` itself and dynamically imported `./llm-cassette.js` in the replay
 * and record arms. That is production code importing a development module, which the
 * production/development split forbids in that direction. Inverted: the cassette module
 * now installs itself and the e2e lane's server entry point does the installing
 * (`layers/core-ui/__scripts__/ah6-test-server.ts`). Behaviour is unchanged when nothing
 * is installed — `callLlm` routes straight to `callLlmDirect`, zero overhead.
 */
export function setLlmInterceptor(interceptor: LlmInterceptor | null): void {
	installedInterceptor = interceptor;
}

/**
 * The single LLM entry point. Transparent to all adapter call sites.
 *
 * @lore AU28: `LLM_CASSETTE_MODE` is set but no interceptor installed is a HARD ERROR,
 * not a silent passthrough. Under the old env-gated design, a lane that set the mode was
 * guaranteed interception; under the seam it is not, and a silent fallthrough would make
 * a "replay" run quietly hit the network with a fake API key. Failing loudly is the whole
 * point of moving the decision out of this module.
 */
export async function callLlm(options: CallLlmOptions): Promise<LlmResponse> {
	if (installedInterceptor !== null) return installedInterceptor(options, callLlmDirect);
	const mode = process.env.LLM_CASSETTE_MODE;
	if (mode === "replay" || mode === "record") {
		throw new Error(
			`LLM_CASSETTE_MODE=${mode} is set but no LLM interceptor is installed. ` +
				`The lane entry point must call installCassetteInterceptor() from ` +
				`@hyperidle/harness-registry/testing before any LLM call.`,
		);
	}
	return callLlmDirect(options);
}

/**
 * LLM wire-type re-exports for the ./llm-client subpath.
 *
 * @lore AU20 Ag4a: Llm* types removed from the product barrel (./). Tests and
 * eval consumers that need them (e.g. af7 session-isolation, provision-harness)
 * import via "@hyperidle/harness-registry/llm-client" which already exists as a
 * subpath. Centralised here so types travel with the functions they describe.
 */
export type {
	LlmContentBlock,
	LlmMessage,
	LlmResponse,
	LlmRole,
	LlmTextBlock,
	LlmToolDef,
	LlmToolResultBlock,
	LlmToolUseBlock,
} from "./llm-types.js";
