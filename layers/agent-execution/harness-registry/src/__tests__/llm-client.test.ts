/**
 * X6: Tests for callLlm() — AC-3, AC-5, AC-6.
 *
 * Uses vi.fn() to mock global fetch so no real network calls are made.
 * Tests cover:
 *   - AC-3: provider routing (Anthropic, OpenAI-compatible, OpenRouter)
 *   - AC-5: Anthropic tool_use request/response format
 *   - AC-6: OpenAI function_calling request/response format
 *   - Timeout handling (critique WARNING-2)
 *   - Retry for transient HTTP errors (critique WARNING-3)
 *   - Immediate failure for permanent HTTP errors
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callLlm } from "../llm-client.js";
import type { LlmMessage, LlmToolDef } from "../llm-types.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ANTHROPIC_MODEL = {
	provider: "anthropic" as const,
	model: "claude-sonnet-4-20250514",
	apiKey: "sk-ant-test-key",
	baseUrl: "https://api.anthropic.com",
};

const OPENAI_MODEL = {
	provider: "openai-compatible" as const,
	model: "gpt-4-turbo",
	apiKey: "sk-openai-test-key",
	baseUrl: "https://api.openai.com",
};

const OPENROUTER_MODEL = {
	provider: "openrouter" as const,
	model: "anthropic/claude-sonnet-4",
	apiKey: "sk-or-test-key",
	baseUrl: "https://openrouter.ai/api",
};

const SIMPLE_MESSAGES: readonly LlmMessage[] = [{ role: "user", content: "Hello" }];

const TOOL_DEFS: readonly LlmToolDef[] = [
	{
		name: "get_weather",
		description: "Get weather for a city",
		inputSchema: {
			type: "object",
			properties: { city: { type: "string" } },
			required: ["city"],
		},
	},
];

/** Build a minimal Anthropic API response with a text block. */
function makeAnthropicTextResponse(text = "Hello, world!") {
	return {
		stop_reason: "end_turn",
		content: [{ type: "text", text }],
		usage: { input_tokens: 100, output_tokens: 50 },
	};
}

/** Build an Anthropic API response with a tool_use block. */
function makeAnthropicToolResponse() {
	return {
		stop_reason: "tool_use",
		content: [
			{
				type: "tool_use",
				id: "tool-abc-123",
				name: "get_weather",
				input: { city: "London" },
			},
		],
		usage: { input_tokens: 150, output_tokens: 30 },
	};
}

/** Build a minimal OpenAI API response with a text message. */
function makeOpenAiTextResponse(text = "Hello, world!") {
	return {
		choices: [
			{
				finish_reason: "stop",
				message: {
					role: "assistant",
					content: text,
					tool_calls: null,
				},
			},
		],
		usage: { prompt_tokens: 100, completion_tokens: 50 },
	};
}

/** Build an OpenAI API response with tool_calls. */
function makeOpenAiToolResponse() {
	return {
		choices: [
			{
				finish_reason: "tool_calls",
				message: {
					role: "assistant",
					content: null,
					tool_calls: [
						{
							id: "call-xyz-456",
							type: "function",
							function: {
								name: "get_weather",
								// JSON string — must be parsed by callLlm
								arguments: JSON.stringify({ city: "Paris" }),
							},
						},
					],
				},
			},
		],
		usage: { prompt_tokens: 150, completion_tokens: 20 },
	};
}

/** Create a mock fetch Response. */
function mockFetchResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 200 ? "OK" : "Error",
		json: async () => body,
		text: async () => JSON.stringify(body),
	} as Response;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
	vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
	vi.unstubAllGlobals();
});

// ── AC-3: Anthropic provider routing ─────────────────────────────────────────

describe("callLlm — Anthropic provider (AC-3, AC-5)", () => {
	it("calls POST {baseUrl}/v1/messages for Anthropic provider", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeAnthropicTextResponse()));

		await callLlm({
			model: ANTHROPIC_MODEL,
			messages: SIMPLE_MESSAGES,
		});

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.anthropic.com/v1/messages");
	});

	it("sets Authorization header with Bearer token for Anthropic", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeAnthropicTextResponse()));

		await callLlm({
			model: ANTHROPIC_MODEL,
			messages: SIMPLE_MESSAGES,
		});

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const headers = init.headers as Record<string, string>;
		// Anthropic uses x-api-key header, not Authorization
		const hasAuth =
			headers["x-api-key"] === ANTHROPIC_MODEL.apiKey ||
			headers.Authorization === `Bearer ${ANTHROPIC_MODEL.apiKey}`;
		expect(hasAuth).toBe(true);
	});

	it("includes model and max_tokens in request body for Anthropic", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeAnthropicTextResponse()));

		await callLlm({
			model: ANTHROPIC_MODEL,
			messages: SIMPLE_MESSAGES,
			maxTokens: 4096,
		});

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.model).toBe("claude-sonnet-4-20250514");
		expect(body.max_tokens).toBe(4096);
	});

	it("sends system prompt in request body when provided (Anthropic)", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeAnthropicTextResponse()));

		await callLlm({
			model: ANTHROPIC_MODEL,
			messages: SIMPLE_MESSAGES,
			system: "You are a helpful assistant.",
		});

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.system).toBe("You are a helpful assistant.");
	});

	it("normalizes Anthropic text response to LlmResponse", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(
			mockFetchResponse(makeAnthropicTextResponse("Analysis complete.")),
		);

		const result = await callLlm({
			model: ANTHROPIC_MODEL,
			messages: SIMPLE_MESSAGES,
		});

		expect(result.stopReason).toBe("end_turn");
		expect(result.content).toHaveLength(1);
		expect(result.content[0]?.type).toBe("text");
		if (result.content[0]?.type === "text") {
			expect(result.content[0].text).toBe("Analysis complete.");
		}
		expect(result.usage.inputTokens).toBe(100);
		expect(result.usage.outputTokens).toBe(50);
	});
});

// ── AC-5: Anthropic tool_use format ──────────────────────────────────────────

describe("callLlm — Anthropic tool_use format (AC-5)", () => {
	it("sends tools with input_schema format in Anthropic request body", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeAnthropicToolResponse()));

		await callLlm({
			model: ANTHROPIC_MODEL,
			messages: SIMPLE_MESSAGES,
			tools: TOOL_DEFS,
		});

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.tools).toBeDefined();
		expect(body.tools).toHaveLength(1);
		// Anthropic format uses input_schema (snake_case)
		expect(body.tools[0].input_schema).toBeDefined();
		expect(body.tools[0].input_schema.type).toBe("object");
		expect(body.tools[0].name).toBe("get_weather");
	});

	it("normalizes Anthropic tool_use response to LlmToolUseBlock", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeAnthropicToolResponse()));

		const result = await callLlm({
			model: ANTHROPIC_MODEL,
			messages: SIMPLE_MESSAGES,
			tools: TOOL_DEFS,
		});

		expect(result.stopReason).toBe("tool_use");
		expect(result.content).toHaveLength(1);
		const block = result.content[0];
		expect(block?.type).toBe("tool_use");
		if (block?.type === "tool_use") {
			expect(block.id).toBe("tool-abc-123");
			expect(block.name).toBe("get_weather");
			expect(block.input).toEqual({ city: "London" });
		}
	});

	it("preserves tool_use input as parsed object (not string) for Anthropic", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeAnthropicToolResponse()));

		const result = await callLlm({
			model: ANTHROPIC_MODEL,
			messages: SIMPLE_MESSAGES,
			tools: TOOL_DEFS,
		});

		const block = result.content[0];
		if (block?.type === "tool_use") {
			// input must be a parsed object, not a JSON string
			expect(typeof block.input).toBe("object");
			expect(block.input.city).toBe("London");
		}
	});
});

// ── AC-3 & AC-6: OpenAI-compatible provider routing ──────────────────────────

describe("callLlm — OpenAI-compatible provider (AC-3, AC-6)", () => {
	it("calls POST {baseUrl}/v1/chat/completions for openai-compatible provider", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeOpenAiTextResponse()));

		await callLlm({
			model: OPENAI_MODEL,
			messages: SIMPLE_MESSAGES,
		});

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.openai.com/v1/chat/completions");
	});

	it("sets Authorization Bearer header for OpenAI-compatible provider", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeOpenAiTextResponse()));

		await callLlm({
			model: OPENAI_MODEL,
			messages: SIMPLE_MESSAGES,
		});

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const headers = init.headers as Record<string, string>;
		expect(headers.Authorization).toBe(`Bearer ${OPENAI_MODEL.apiKey}`);
	});

	it("normalizes OpenAI stop → end_turn in LlmResponse", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeOpenAiTextResponse("Task done.")));

		const result = await callLlm({
			model: OPENAI_MODEL,
			messages: SIMPLE_MESSAGES,
		});

		expect(result.stopReason).toBe("end_turn");
		expect(result.content[0]?.type).toBe("text");
		if (result.content[0]?.type === "text") {
			expect(result.content[0].text).toBe("Task done.");
		}
		expect(result.usage.inputTokens).toBe(100);
		expect(result.usage.outputTokens).toBe(50);
	});
});

// ── AC-6: OpenAI function_calling format ─────────────────────────────────────

describe("callLlm — OpenAI function_calling format (AC-6)", () => {
	it("sends tools with type:function format in OpenAI request body", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeOpenAiToolResponse()));

		await callLlm({
			model: OPENAI_MODEL,
			messages: SIMPLE_MESSAGES,
			tools: TOOL_DEFS,
		});

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.tools).toBeDefined();
		expect(body.tools).toHaveLength(1);
		// OpenAI format uses type:"function" wrapper
		expect(body.tools[0].type).toBe("function");
		expect(body.tools[0].function.name).toBe("get_weather");
		expect(body.tools[0].function.parameters).toBeDefined();
		// OpenAI uses 'parameters', not 'input_schema'
		expect(body.tools[0].input_schema).toBeUndefined();
	});

	it("normalizes OpenAI tool_calls finish_reason → stopReason:tool_use", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeOpenAiToolResponse()));

		const result = await callLlm({
			model: OPENAI_MODEL,
			messages: SIMPLE_MESSAGES,
			tools: TOOL_DEFS,
		});

		expect(result.stopReason).toBe("tool_use");
	});

	it("parses JSON string arguments from OpenAI tool_calls into objects", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeOpenAiToolResponse()));

		const result = await callLlm({
			model: OPENAI_MODEL,
			messages: SIMPLE_MESSAGES,
			tools: TOOL_DEFS,
		});

		const block = result.content[0];
		expect(block?.type).toBe("tool_use");
		if (block?.type === "tool_use") {
			expect(block.id).toBe("call-xyz-456");
			expect(block.name).toBe("get_weather");
			// JSON string must be parsed — input must be a plain object
			expect(typeof block.input).toBe("object");
			expect(block.input.city).toBe("Paris");
		}
	});
});

// ── OpenRouter routing ───────────────────────────────────────────────────────

/**
 * OpenRouter goes to its OWN native endpoint, not to Anthropic's.
 *
 * These tests used to pin the opposite, because OpenRouter and Anthropic shared
 * a single call path. Verified live 2026-08-25, that sharing was hiding a real
 * defect: OpenRouter's Anthropic-compatible `/v1/messages` silently ignores
 * unknown fields — it answers HTTP 200 to a body carrying
 * `totally_made_up_param` — so OpenRouter's own `reasoning_effort` was accepted
 * there and quietly discarded. Its native `/v1/chat/completions` validates
 * instead, rejecting a bad value with HTTP 400 that names the parameter.
 *
 * The real round-trip lives in `builtin-model-options.integration.test.ts`.
 */
describe("callLlm — OpenRouter provider", () => {
	it("calls OpenRouter's own /v1/chat/completions, not Anthropic's /v1/messages", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeOpenAiTextResponse()));

		await callLlm({
			model: OPENROUTER_MODEL,
			messages: SIMPLE_MESSAGES,
		});

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
	});

	it("still identifies HyperIdle to OpenRouter", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeOpenAiTextResponse()));

		await callLlm({
			model: OPENROUTER_MODEL,
			messages: SIMPLE_MESSAGES,
		});

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const headers = init.headers as Record<string, string>;
		// Attribution survived the move onto the OpenAI-shaped wire.
		expect(headers["X-OpenRouter-Title"]).toBe("HyperIdle");
	});

	it("carries a configured reasoning effort as OpenRouter's own parameter", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeOpenAiTextResponse()));

		await callLlm({
			model: OPENROUTER_MODEL,
			messages: SIMPLE_MESSAGES,
			modelOptions: { reasoning_effort: "high" },
		});

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string) as Record<string, unknown>;
		expect(body.reasoning_effort).toBe("high");
	});

	it("an agent with no options sends no reasoning parameter at all", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse(makeOpenAiTextResponse()));

		await callLlm({
			model: OPENROUTER_MODEL,
			messages: SIMPLE_MESSAGES,
		});

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string) as Record<string, unknown>;
		expect("reasoning_effort" in body).toBe(false);
	});

	it("reads OpenRouter responses in the OpenAI shape", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(
			mockFetchResponse(makeOpenAiTextResponse("OpenRouter response.")),
		);

		const result = await callLlm({
			model: OPENROUTER_MODEL,
			messages: SIMPLE_MESSAGES,
		});

		expect(result.content[0]?.type).toBe("text");
		if (result.content[0]?.type === "text") {
			expect(result.content[0].text).toBe("OpenRouter response.");
		}
	});
});

// ── Timeout (critique WARNING-2) ─────────────────────────────────────────────

describe("callLlm — timeout (critique WARNING-2)", () => {
	it("rejects with a timeout error when fetch hangs beyond timeoutMs", async () => {
		const fetchMock = vi.mocked(fetch);
		// Mock fetch that never resolves (simulates a hung connection)
		fetchMock.mockImplementation(
			() =>
				new Promise<Response>(() => {
					/* never resolves */
				}),
		);

		// Use a very short timeout so the test doesn't actually wait
		await expect(
			callLlm({
				model: ANTHROPIC_MODEL,
				messages: SIMPLE_MESSAGES,
				timeoutMs: 50, // 50ms timeout
			}),
		).rejects.toThrow();
	}, 5000);

	it("composes caller cancellation with timeout and aborts the active fetch", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockImplementation(
			() =>
				new Promise<Response>(() => {
					/* cancellation owns settlement */
				}),
		);
		const controller = new AbortController();
		const result = callLlm({
			model: ANTHROPIC_MODEL,
			messages: SIMPLE_MESSAGES,
			timeoutMs: 10_000,
			signal: controller.signal,
		});
		controller.abort();

		await expect(result).rejects.toMatchObject({ name: "AbortError" });
		const requestSignal = fetchMock.mock.calls[0]?.[1]?.signal;
		expect(requestSignal?.aborted).toBe(true);
	});
});

// ── Retry for transient errors (critique WARNING-3) ───────────────────────────

describe("callLlm — retry for transient HTTP errors (critique WARNING-3)", () => {
	it("cancels retry backoff and never starts another request", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(mockFetchResponse({ error: "rate limited" }, 429));
		const controller = new AbortController();
		const result = callLlm({
			model: ANTHROPIC_MODEL,
			messages: SIMPLE_MESSAGES,
			signal: controller.signal,
		});
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		controller.abort();

		await expect(result).rejects.toMatchObject({ name: "AbortError" });
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("retries on HTTP 429 (rate limit) and eventually succeeds", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock
			.mockResolvedValueOnce(mockFetchResponse({ error: "rate limited" }, 429))
			.mockResolvedValueOnce(mockFetchResponse({ error: "rate limited" }, 429))
			.mockResolvedValueOnce(mockFetchResponse(makeAnthropicTextResponse()));

		const result = await callLlm({
			model: ANTHROPIC_MODEL,
			messages: SIMPLE_MESSAGES,
		});

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(result.stopReason).toBe("end_turn");
	}, 30000);

	it("retries on HTTP 503 (service unavailable) and eventually succeeds", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock
			.mockResolvedValueOnce(mockFetchResponse({ error: "unavailable" }, 503))
			.mockResolvedValueOnce(mockFetchResponse(makeAnthropicTextResponse()));

		const result = await callLlm({
			model: ANTHROPIC_MODEL,
			messages: SIMPLE_MESSAGES,
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.stopReason).toBe("end_turn");
	}, 30000);

	it("retries on HTTP 502 (bad gateway) and eventually succeeds", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock
			.mockResolvedValueOnce(mockFetchResponse({ error: "bad gateway" }, 502))
			.mockResolvedValueOnce(mockFetchResponse(makeAnthropicTextResponse()));

		const result = await callLlm({
			model: ANTHROPIC_MODEL,
			messages: SIMPLE_MESSAGES,
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.stopReason).toBe("end_turn");
	}, 30000);

	it("fails immediately on HTTP 401 (unauthorized) — no retry", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse({ error: "unauthorized" }, 401));

		await expect(
			callLlm({
				model: ANTHROPIC_MODEL,
				messages: SIMPLE_MESSAGES,
			}),
		).rejects.toThrow();

		// Must only have been called once — no retries for 401
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("fails immediately on HTTP 403 (forbidden) — no retry", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse({ error: "forbidden" }, 403));

		await expect(
			callLlm({
				model: ANTHROPIC_MODEL,
				messages: SIMPLE_MESSAGES,
			}),
		).rejects.toThrow();

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("fails immediately on HTTP 400 (bad request) — no retry", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValueOnce(mockFetchResponse({ error: "bad request" }, 400));

		await expect(
			callLlm({
				model: ANTHROPIC_MODEL,
				messages: SIMPLE_MESSAGES,
			}),
		).rejects.toThrow();

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("fails after max retries exhausted for 429", async () => {
		const fetchMock = vi.mocked(fetch);
		// Return 429 more times than the max retry count (3)
		fetchMock
			.mockResolvedValueOnce(mockFetchResponse({ error: "rate limit" }, 429))
			.mockResolvedValueOnce(mockFetchResponse({ error: "rate limit" }, 429))
			.mockResolvedValueOnce(mockFetchResponse({ error: "rate limit" }, 429))
			.mockResolvedValueOnce(mockFetchResponse({ error: "rate limit" }, 429));

		await expect(
			callLlm({
				model: ANTHROPIC_MODEL,
				messages: SIMPLE_MESSAGES,
			}),
		).rejects.toThrow();
	}, 30000);
});

// ── Network errors ────────────────────────────────────────────────────────────

describe("callLlm — network errors", () => {
	it("throws when fetch rejects (network failure)", async () => {
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockRejectedValueOnce(new TypeError("Network error"));

		await expect(
			callLlm({
				model: ANTHROPIC_MODEL,
				messages: SIMPLE_MESSAGES,
			}),
		).rejects.toThrow();
	});
});
