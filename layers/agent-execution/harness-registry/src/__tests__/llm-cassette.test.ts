/**
 * AH6 A1 — Cassette keying / replay unit tests.
 *
 * Tests the cassette module that does NOT exist yet — these are the RED tests.
 * They import from `../llm-cassette.js` which will be created in the green phase.
 *
 * Covers (per architecture §1 / task A1):
 *   - Prompt-hash canonical keying: same logical turn → same key
 *   - tool_use id / tool_result toolUseId normalization → same key despite random ids
 *   - timestamp normalization in text content → same key
 *   - model.model differences → different keys (model id is part of hash)
 *   - :nitro / routing-suffix strip on model.model → same key as un-suffixed model
 *   - apiKey / baseUrl / provider excluded from hash → different keys/baseUrls still same hash
 *   - replayLlm: returns recorded LlmResponse without network call
 *   - replayLlm: missing cassette key → throws CassetteMissError
 *   - replayLlm: waits ≥ LLM_REPLAY_DELAY_MS before returning (observable delay)
 *
 * @lore AH6: Cassette keying excludes apiKey/baseUrl/provider so the no-key
 * offline replay lane matches keys recorded with a real key. Model id IS included
 * (a model swap is a meaningful cassette change). :nitro routing suffix stripped
 * before hashing so routing-policy changes don't invalidate cassettes.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	buildCassetteKey,
	type CassetteEntry,
	CassetteMissError,
	readUsageAccumulator,
	recordLlm,
	replayLlm,
	resetUsageAccumulator,
} from "../__testing__/llm-cassette.js";
import type { CallLlmOptions } from "../llm-client.js";
import type { LlmMessage, LlmResponse, LlmToolDef } from "../llm-types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MODEL_A = {
	provider: "openrouter" as const,
	model: "deepseek/deepseek-v4-flash",
	apiKey: "sk-or-real-key",
	baseUrl: "https://openrouter.ai/api",
};

const MODEL_A_NITRO = {
	...MODEL_A,
	model: "deepseek/deepseek-v4-flash:nitro", // routing suffix appended
};

const MODEL_B = {
	provider: "openrouter" as const,
	model: "google/gemma-4-26b-a4b-it", // different model
	apiKey: "sk-or-real-key",
	baseUrl: "https://openrouter.ai/api",
};

const MODEL_DIFFERENT_KEY = {
	provider: "openrouter" as const,
	model: "deepseek/deepseek-v4-flash",
	apiKey: "sk-or-different-key", // apiKey differs — should NOT affect hash
	baseUrl: "https://openrouter.ai/api",
};

const SIMPLE_MESSAGES: readonly LlmMessage[] = [{ role: "user", content: "What is 1 + 1?" }];

const MESSAGES_WITH_TOOL_USE: readonly LlmMessage[] = [
	{ role: "user", content: "Create a bet about shipping AH6" },
	{
		role: "assistant",
		content: [
			{
				type: "tool_use",
				id: "tu_abc123random", // random id — must be normalized
				name: "create_bet",
				input: { title: "Ship AH6" },
			},
		],
	},
	{
		role: "user",
		content: [
			{
				type: "tool_result",
				toolUseId: "tu_abc123random", // same random id in tool_result
				content: "Bet created: bet-xyz",
				isError: false,
			},
		],
	},
];

const MESSAGES_WITH_TOOL_USE_DIFFERENT_IDS: readonly LlmMessage[] = [
	{ role: "user", content: "Create a bet about shipping AH6" },
	{
		role: "assistant",
		content: [
			{
				type: "tool_use",
				id: "tu_zzz999different", // different random id — same logical content
				name: "create_bet",
				input: { title: "Ship AH6" },
			},
		],
	},
	{
		role: "user",
		content: [
			{
				type: "tool_result",
				toolUseId: "tu_zzz999different",
				content: "Bet created: bet-xyz",
				isError: false,
			},
		],
	},
];

const MESSAGES_WITH_TIMESTAMP: readonly LlmMessage[] = [
	{
		role: "user",
		content: "The current time is 2026-06-21T12:34:56.789Z. What should I do today?",
	},
];

const MESSAGES_WITH_DIFFERENT_TIMESTAMP: readonly LlmMessage[] = [
	{
		role: "user",
		content: "The current time is 2026-06-21T18:00:00.000Z. What should I do today?",
	},
];

const TOOL_DEFS: readonly LlmToolDef[] = [
	{
		name: "create_bet",
		description: "Create a draft bet",
		inputSchema: {
			type: "object",
			properties: { title: { type: "string" } },
			required: ["title"],
		},
	},
];

const SAMPLE_RESPONSE: LlmResponse = {
	stopReason: "end_turn",
	content: [{ type: "text", text: "The answer is 2." }],
	usage: { inputTokens: 10, outputTokens: 5 },
};

const TOOL_RESPONSE: LlmResponse = {
	stopReason: "tool_use",
	content: [
		{ type: "tool_use", id: "tu_response1", name: "create_bet", input: { title: "Ship AH6" } },
	],
	usage: { inputTokens: 50, outputTokens: 20 },
};

function makeOptions(
	model: typeof MODEL_A,
	messages: readonly LlmMessage[] = SIMPLE_MESSAGES,
	tools?: readonly LlmToolDef[],
): CallLlmOptions {
	return { model, messages, tools };
}

// ---------------------------------------------------------------------------
// Suite A: Prompt-hash keying
// ---------------------------------------------------------------------------

describe("AH6 cassette: buildCassetteKey", () => {
	test("returns a 64-char hex string (SHA-256)", () => {
		const key = buildCassetteKey(makeOptions(MODEL_A));
		expect(typeof key).toBe("string");
		expect(key).toHaveLength(64);
		expect(/^[0-9a-f]{64}$/.test(key)).toBe(true);
	});

	test("same model + messages → same key (deterministic)", () => {
		const key1 = buildCassetteKey(makeOptions(MODEL_A));
		const key2 = buildCassetteKey(makeOptions(MODEL_A));
		expect(key1).toBe(key2);
	});

	test("different model ids → different keys", () => {
		const key1 = buildCassetteKey(makeOptions(MODEL_A));
		const key2 = buildCassetteKey(makeOptions(MODEL_B));
		expect(key1).not.toBe(key2);
	});

	test(":nitro routing suffix stripped → same key as un-suffixed model", () => {
		const keyPlain = buildCassetteKey(makeOptions(MODEL_A));
		const keyNitro = buildCassetteKey(makeOptions(MODEL_A_NITRO));
		expect(keyPlain).toBe(keyNitro);
	});

	test("apiKey excluded from hash — different keys same logical model → same hash", () => {
		const key1 = buildCassetteKey(makeOptions(MODEL_A));
		const key2 = buildCassetteKey(makeOptions(MODEL_DIFFERENT_KEY));
		expect(key1).toBe(key2);
	});

	test("tool_use ids normalized → messages with different tool_use ids hash to same key", () => {
		const key1 = buildCassetteKey(makeOptions(MODEL_A, MESSAGES_WITH_TOOL_USE, TOOL_DEFS));
		const key2 = buildCassetteKey(
			makeOptions(MODEL_A, MESSAGES_WITH_TOOL_USE_DIFFERENT_IDS, TOOL_DEFS),
		);
		expect(key1).toBe(key2);
	});

	test("ISO-8601 timestamps normalized in text content → same key despite different timestamps", () => {
		const key1 = buildCassetteKey(makeOptions(MODEL_A, MESSAGES_WITH_TIMESTAMP));
		const key2 = buildCassetteKey(makeOptions(MODEL_A, MESSAGES_WITH_DIFFERENT_TIMESTAMP));
		expect(key1).toBe(key2);
	});

	test("tool order is normalized (sorted) → different tool order → same key", () => {
		const toolsAB: readonly LlmToolDef[] = [
			{
				name: "alpha_tool",
				description: "Alpha",
				inputSchema: { type: "object", properties: {} },
			},
			{
				name: "beta_tool",
				description: "Beta",
				inputSchema: { type: "object", properties: {} },
			},
		];
		const toolsBA: readonly LlmToolDef[] = [toolsAB[1]!, toolsAB[0]!];
		const key1 = buildCassetteKey(makeOptions(MODEL_A, SIMPLE_MESSAGES, toolsAB));
		const key2 = buildCassetteKey(makeOptions(MODEL_A, SIMPLE_MESSAGES, toolsBA));
		expect(key1).toBe(key2);
	});

	test("different messages → different keys", () => {
		const key1 = buildCassetteKey(makeOptions(MODEL_A, SIMPLE_MESSAGES));
		const key2 = buildCassetteKey(
			makeOptions(MODEL_A, [{ role: "user", content: "A completely different question" }]),
		);
		expect(key1).not.toBe(key2);
	});

	test("maxTokens included in hash — different values → different keys", () => {
		const key1 = buildCassetteKey({ ...makeOptions(MODEL_A), maxTokens: 100 });
		const key2 = buildCassetteKey({ ...makeOptions(MODEL_A), maxTokens: 200 });
		expect(key1).not.toBe(key2);
	});

	test("system prompt included in hash — different system → different keys", () => {
		const key1 = buildCassetteKey({ ...makeOptions(MODEL_A), system: "Be helpful." });
		const key2 = buildCassetteKey({ ...makeOptions(MODEL_A), system: "Be adversarial." });
		expect(key1).not.toBe(key2);
	});
});

// ---------------------------------------------------------------------------
// Suite B: replayLlm behavior
// ---------------------------------------------------------------------------

describe("AH6 cassette: replayLlm", () => {
	beforeEach(() => {
		// Stub env so replayLlm can read LLM_REPLAY_DELAY_MS
		vi.stubEnv("LLM_CASSETTE_MODE", "replay");
		vi.stubEnv("LLM_CASSETTE_DIR", "/tmp/ah6-cassette-test");
		vi.stubEnv("LLM_CASSETTE_SCENARIO", "test-scenario");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("replayLlm returns the recorded LlmResponse for a matching key", async () => {
		const options = makeOptions(MODEL_A);
		const key = buildCassetteKey(options);
		const entries: CassetteEntry[] = [{ key, request: options, response: SAMPLE_RESPONSE }];

		const result = await replayLlm(options, entries);
		expect(result).toEqual(SAMPLE_RESPONSE);
	});

	test("replayLlm makes no network call (fetch is not called)", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const options = makeOptions(MODEL_A);
		const key = buildCassetteKey(options);
		const entries: CassetteEntry[] = [{ key, request: options, response: SAMPLE_RESPONSE }];

		await replayLlm(options, entries);
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});

	test("replayLlm on missing key throws CassetteMissError", async () => {
		const options = makeOptions(MODEL_A);
		const entries: CassetteEntry[] = []; // empty cassette

		await expect(replayLlm(options, entries)).rejects.toThrow(CassetteMissError);
	});

	test("CassetteMissError is an Error subclass with the missing key info", async () => {
		const options = makeOptions(MODEL_A);
		const entries: CassetteEntry[] = [];

		let caught: unknown;
		try {
			await replayLlm(options, entries);
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(CassetteMissError);
		expect(caught).toBeInstanceOf(Error);
		const missingKey = buildCassetteKey(options);
		expect((caught as CassetteMissError).missingKey).toBe(missingKey);
	});

	test("replayLlm waits at least LLM_REPLAY_DELAY_MS before returning", async () => {
		vi.stubEnv("LLM_REPLAY_DELAY_MS", "50"); // small delay for test speed

		const options = makeOptions(MODEL_A);
		const key = buildCassetteKey(options);
		const entries: CassetteEntry[] = [{ key, request: options, response: SAMPLE_RESPONSE }];

		const start = Date.now();
		await replayLlm(options, entries);
		const elapsed = Date.now() - start;

		// Must wait at least the configured delay (with some slack for timer imprecision)
		expect(elapsed).toBeGreaterThanOrEqual(45);
	}, 5000);

	test("replayLlm returns correct response for tool-call cassette entry", async () => {
		const options = makeOptions(MODEL_A, MESSAGES_WITH_TOOL_USE, TOOL_DEFS);
		const key = buildCassetteKey(options);
		const entries: CassetteEntry[] = [{ key, request: options, response: TOOL_RESPONSE }];

		const result = await replayLlm(options, entries);
		expect(result).toEqual(TOOL_RESPONSE);
		expect(result.stopReason).toBe("tool_use");
	});

	test("replayLlm finds entry by normalized key (tool_use ids differ but normalize to same key)", async () => {
		// Record with one set of random ids
		const optionsRecord = makeOptions(MODEL_A, MESSAGES_WITH_TOOL_USE, TOOL_DEFS);
		const key = buildCassetteKey(optionsRecord);
		const entries: CassetteEntry[] = [{ key, request: optionsRecord, response: SAMPLE_RESPONSE }];

		// Replay with different random ids in the same positions
		const optionsReplay = makeOptions(MODEL_A, MESSAGES_WITH_TOOL_USE_DIFFERENT_IDS, TOOL_DEFS);

		const result = await replayLlm(optionsReplay, entries);
		expect(result).toEqual(SAMPLE_RESPONSE);
	});

	test("replayLlm with :nitro model finds entry recorded without :nitro suffix", async () => {
		// Entry recorded with plain model id
		const optionsPlain = makeOptions(MODEL_A);
		const key = buildCassetteKey(optionsPlain);
		const entries: CassetteEntry[] = [{ key, request: optionsPlain, response: SAMPLE_RESPONSE }];

		// Replay request with :nitro suffix
		const optionsNitro = makeOptions(MODEL_A_NITRO);
		const result = await replayLlm(optionsNitro, entries);
		expect(result).toEqual(SAMPLE_RESPONSE);
	});
});

// ---------------------------------------------------------------------------
// Suite C: CassetteMissError class
// ---------------------------------------------------------------------------

describe("AH6: CassetteMissError", () => {
	test("has name CassetteMissError", () => {
		const err = new CassetteMissError("abc123", "/path/to/cassette.json");
		expect(err.name).toBe("CassetteMissError");
	});

	test("exposes missingKey and cassettePath", () => {
		const err = new CassetteMissError("abc123", "/path/to/cassette.json");
		expect(err.missingKey).toBe("abc123");
		expect(err.cassettePath).toBe("/path/to/cassette.json");
	});

	test("is an Error subclass", () => {
		expect(new CassetteMissError("k", "p")).toBeInstanceOf(Error);
	});
});

// ---------------------------------------------------------------------------
// Suite D: recordLlm token-usage accumulation (CRITICAL-2)
//
// @lore AU21 (harness-telemetry narrowing): This suite used to assert on an
// ESTIMATED $-cost accumulator (totalCostUsd via a hardcoded rate table).
// Founder ruling narrowed harness telemetry to token usage only — "very few
// harness can actually report cost". These tests now prove token usage is
// tracked and that no $ figure is computed anywhere in the accumulator.
// ---------------------------------------------------------------------------

describe("AH6 cassette: recordLlm token-usage accumulation (CRITICAL-2)", () => {
	let tmpDir: string;

	beforeEach(() => {
		resetUsageAccumulator();
		vi.stubEnv("LLM_CASSETTE_MODE", "record");
		vi.stubEnv("AH6_MAX_TOKENS", "100000"); // large cap so tests don't abort
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ah6-usage-test-"));
		vi.stubEnv("LLM_CASSETTE_DIR", tmpDir);
		vi.stubEnv("LLM_CASSETTE_SCENARIO", "test");
		vi.stubEnv("AH6_COST_REPORT_PATH", path.join(tmpDir, "ah6-cost.json"));
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		resetUsageAccumulator();
		// Clean up temp dir
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	test("recordLlm accumulates token usage after a call with non-zero usage", async () => {
		const options = makeOptions(MODEL_A);
		const stubbedResponse: LlmResponse = {
			stopReason: "end_turn",
			content: [{ type: "text", text: "2" }],
			usage: { inputTokens: 100, outputTokens: 50 },
		};

		await recordLlm(options, async () => stubbedResponse);

		const acc = readUsageAccumulator();
		expect(acc.totalInputTokens).toBe(100);
		expect(acc.totalOutputTokens).toBe(50);
		// No $ figure anywhere on the accumulator.
		expect(acc).not.toHaveProperty("totalCostUsd");
	});

	test("recordLlm accumulates token usage across multiple calls", async () => {
		const options = makeOptions(MODEL_A);
		const stubbedResponse: LlmResponse = {
			stopReason: "end_turn",
			content: [{ type: "text", text: "2" }],
			usage: { inputTokens: 100, outputTokens: 50 },
		};

		await recordLlm(options, async () => stubbedResponse);
		await recordLlm(makeOptions(MODEL_B), async () => stubbedResponse);

		const acc = readUsageAccumulator();
		expect(acc.totalInputTokens).toBe(200);
		expect(acc.totalOutputTokens).toBe(100);
	});

	test("recordLlm captures the model id (routing suffix stripped)", async () => {
		const options = makeOptions(MODEL_A_NITRO);
		const stubbedResponse: LlmResponse = {
			stopReason: "end_turn",
			content: [{ type: "text", text: "x" }],
			usage: { inputTokens: 10, outputTokens: 5 },
		};

		await recordLlm(options, async () => stubbedResponse);

		const acc = readUsageAccumulator();
		// model id should have :nitro stripped
		expect(acc.model).toBe("deepseek/deepseek-v4-flash");
	});

	test("recordLlm returns the response from callLlmDirect unchanged", async () => {
		const options = makeOptions(MODEL_A);
		const stubbedResponse: LlmResponse = {
			stopReason: "end_turn",
			content: [{ type: "text", text: "hello" }],
			usage: { inputTokens: 5, outputTokens: 3 },
		};

		const result = await recordLlm(options, async () => stubbedResponse);
		expect(result).toEqual(stubbedResponse);
	});

	test("recordLlm apiKey is redacted in the stored cassette entry", async () => {
		const options = makeOptions(MODEL_A); // MODEL_A has apiKey: "sk-or-real-key"
		const stubbedResponse: LlmResponse = {
			stopReason: "end_turn",
			content: [{ type: "text", text: "x" }],
			usage: { inputTokens: 5, outputTokens: 3 },
		};

		await recordLlm(options, async () => stubbedResponse);

		// The cassette is only written at process exit (flush) — confirm the original
		// options.model.apiKey hasn't leaked into the accumulator's model field.
		expect(options.model.apiKey).toBe("sk-or-real-key"); // fixture has a real-looking key
		const acc = readUsageAccumulator();
		// Accumulator model field is the stripped model id — no key material
		expect(acc.model).not.toContain("sk-or");
	});

	test("recordLlm aborts the process when accumulated tokens exceed AH6_MAX_TOKENS", async () => {
		vi.stubEnv("AH6_MAX_TOKENS", "10");
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(((): never => {
			throw new Error("process.exit called");
		}) as never);

		const options = makeOptions(MODEL_A);
		const stubbedResponse: LlmResponse = {
			stopReason: "end_turn",
			content: [{ type: "text", text: "2" }],
			usage: { inputTokens: 100, outputTokens: 50 },
		};

		await expect(recordLlm(options, async () => stubbedResponse)).rejects.toThrow(
			"process.exit called",
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
		exitSpy.mockRestore();
	});
});
