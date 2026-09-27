/**
 * `selectSmokeModel`'s gate/rank/fallback logic, against the captured real OpenRouter response
 * fixture (no live key) — any OpenRouter API shape change (pricing format, throughput/latency
 * structure) reddens this suite immediately, not just the live lane. This file is in
 * protectedTests — the gates encoded here must not be weakened (e.g. loosening the uptime floor
 * to make CI pass).
 */

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ModelEndpoints, OpenRouterModel } from "../openrouter-catalog.js";
import { narrowModelEndpoints, narrowModels } from "../openrouter-catalog.js";
import type { SmokeModelPolicy } from "../policy.js";
import { DEFAULT_SMOKE_POLICY } from "../policy.js";
import type { SelectionInput } from "../select-smoke-model.js";
import { selectSmokeModel } from "../select-smoke-model.js";

const require = createRequire(import.meta.url);
const fixtureData = require("./fixtures/openrouter-endpoints.captured.json") as {
	models: unknown[];
	endpointsByModel: Record<string, { id?: unknown; endpoints?: unknown[] }>;
};

// ---------------------------------------------------------------------------
// Helpers: build typed inputs from fixture
// ---------------------------------------------------------------------------

function buildModels(ids?: string[]): readonly OpenRouterModel[] {
	const all = fixtureData.models as unknown[];
	const narrowed = narrowModels(all);
	if (!ids) return narrowed;
	return narrowed.filter((m) => ids.includes(m.id));
}

function buildEndpointsMap(ids?: string[]): ReadonlyMap<string, ModelEndpoints> {
	const map = new Map<string, ModelEndpoints>();
	for (const [modelId, rawData] of Object.entries(fixtureData.endpointsByModel)) {
		if (ids && !ids.includes(modelId)) continue;
		const narrowed = narrowModelEndpoints(
			modelId,
			rawData as { id?: unknown; endpoints?: unknown[] },
		);
		map.set(modelId, narrowed);
	}
	return map;
}

function buildInput(overrides: Partial<SelectionInput> = {}): SelectionInput {
	return {
		models: buildModels(),
		endpointsByModel: buildEndpointsMap(),
		policy: DEFAULT_SMOKE_POLICY,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Gate — per-provider tools gate (not model-level)
// ---------------------------------------------------------------------------

describe("selectSmokeModel — per-provider tools gate", () => {
	it("disqualifies a model whose only endpoint lacks tools support (openai/gpt-oss-20b)", () => {
		// gpt-oss-20b has model-level supported_parameters without "tools" and
		// its only endpoint also lacks "tools". Must be disqualified.
		const input = buildInput({
			models: buildModels(["openai/gpt-oss-20b"]),
			endpointsByModel: buildEndpointsMap(["openai/gpt-oss-20b"]),
		});
		const result = selectSmokeModel(input);
		expect(result.ranked).toHaveLength(0);
	});

	it("qualifies a model with 2+ endpoints that support tools and pass the uptime floor", () => {
		// qwen3-235b-a22b: 2 endpoints with tools support, uptime >= 0.99, price $0.40/1M.
		// Use a 2025-01-01 cutoff policy since qwen3 was created in May 2025.
		const policy: SmokeModelPolicy = {
			...DEFAULT_SMOKE_POLICY,
			minCreatedUnixSec: 1_735_689_600, // 2025-01-01
			maxCompletionPricePerMillion: 0.5,
		};
		const input = buildInput({
			models: buildModels(["qwen/qwen3-235b-a22b"]),
			endpointsByModel: buildEndpointsMap(["qwen/qwen3-235b-a22b"]),
			policy,
		});
		const result = selectSmokeModel(input);
		expect(result.ranked).toHaveLength(1);
		const first = result.ranked[0];
		expect(first).toBeDefined();
		expect(first!.id).toBe("qwen/qwen3-235b-a22b");
	});
});

// ---------------------------------------------------------------------------
// Gate — generation cutoff (2026-01-01 = unix 1767225600)
// ---------------------------------------------------------------------------

describe("selectSmokeModel — generation gate", () => {
	it("disqualifies a 2024-created model even if under price ceiling (meta-llama/llama-3.3-70b-instruct)", () => {
		// llama-3.3-70b-instruct: created 1733443200 = 2024-12-06. Must be disqualified.
		const input = buildInput({
			models: buildModels(["meta-llama/llama-3.3-70b-instruct"]),
			endpointsByModel: buildEndpointsMap(["meta-llama/llama-3.3-70b-instruct"]),
		});
		const result = selectSmokeModel(input);
		expect(result.ranked).toHaveLength(0);
	});

	it("qualifies a recently-created model that passes other gates", () => {
		// qwen3-235b-a22b: created 1747094400 = 2025-05-13, completion $0.40/1M (under ceiling).
		// Has 2 qualifying endpoints. Use a 2025-01-01 cutoff to test the "passes" branch.
		const policy2025: SmokeModelPolicy = {
			...DEFAULT_SMOKE_POLICY,
			minCreatedUnixSec: 1_735_689_600, // 2025-01-01
			maxCompletionPricePerMillion: 0.5, // qwen3 at $0.40 is under ceiling
		};
		const input = buildInput({
			models: buildModels(["qwen/qwen3-235b-a22b"]),
			endpointsByModel: buildEndpointsMap(["qwen/qwen3-235b-a22b"]),
			policy: policy2025,
		});
		const result = selectSmokeModel(input);
		expect(result.ranked).toHaveLength(1);
	});

	it("disqualifies when created is below cutoff", () => {
		// llama-3.3: created 1733443200 < any reasonable 2025 cutoff
		const strictPolicy: SmokeModelPolicy = {
			...DEFAULT_SMOKE_POLICY,
			minCreatedUnixSec: 1_735_689_600, // 2025-01-01
		};
		const input = buildInput({
			models: buildModels(["meta-llama/llama-3.3-70b-instruct"]),
			endpointsByModel: buildEndpointsMap(["meta-llama/llama-3.3-70b-instruct"]),
			policy: strictPolicy,
		});
		const result = selectSmokeModel(input);
		expect(result.ranked).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Gate — price ceiling
// ---------------------------------------------------------------------------

describe("selectSmokeModel — price ceiling gate", () => {
	it("disqualifies a model above the completion price ceiling (openai/gpt-4.5-preview at $15/1M)", () => {
		// gpt-4.5-preview: completion = "0.00001500" = $15/1M. Ceiling is $0.50.
		const input = buildInput({
			models: buildModels(["openai/gpt-4.5-preview"]),
			endpointsByModel: buildEndpointsMap(["openai/gpt-4.5-preview"]),
			policy: { ...DEFAULT_SMOKE_POLICY, minCreatedUnixSec: 1_735_689_600 },
		});
		const result = selectSmokeModel(input);
		expect(result.ranked).toHaveLength(0);
	});

	it("qualifies a model under the price ceiling", () => {
		// gemini-2.5-flash: completion = "0.00000060" = $0.60/1M — over the $0.50 ceiling!
		// Use qwen3 instead: "0.00000040" = $0.40/1M — under ceiling.
		const policy: SmokeModelPolicy = {
			...DEFAULT_SMOKE_POLICY,
			minCreatedUnixSec: 1_735_689_600, // 2025-01-01 — qwen3 created 2025-05-13
			maxCompletionPricePerMillion: 0.5,
		};
		const input = buildInput({
			models: buildModels(["qwen/qwen3-235b-a22b"]),
			endpointsByModel: buildEndpointsMap(["qwen/qwen3-235b-a22b"]),
			policy,
		});
		const result = selectSmokeModel(input);
		expect(result.ranked).toHaveLength(1);
		const top = result.ranked[0];
		expect(top).toBeDefined();
		expect(top!.completionPricePerMillion).toBeLessThanOrEqual(0.5);
	});
});

// ---------------------------------------------------------------------------
// Gate — redundancy (≥2 providers above uptime floor)
// ---------------------------------------------------------------------------

describe("selectSmokeModel — redundancy gate", () => {
	it("disqualifies a model with only one qualifying provider (openai/gpt-4.5-preview single provider)", () => {
		// gpt-4.5-preview has only 1 endpoint. Even if it had tools, it fails redundancy.
		// But price also fails, so let's use a custom model with 1 endpoint.
		// We'll use a policy that allows gpt-4.5-preview price but still check redundancy.
		// Actually: gpt-4.5-preview has 1 endpoint, so toolProviderCount will be ≤1.
		const policy: SmokeModelPolicy = {
			...DEFAULT_SMOKE_POLICY,
			minCreatedUnixSec: 1_735_689_600,
			maxCompletionPricePerMillion: 20, // allow any price
		};
		const input = buildInput({
			models: buildModels(["openai/gpt-4.5-preview"]),
			endpointsByModel: buildEndpointsMap(["openai/gpt-4.5-preview"]),
			policy,
		});
		const result = selectSmokeModel(input);
		// gpt-4.5-preview has only 1 endpoint → fails redundancy gate
		expect(result.ranked).toHaveLength(0);
	});

	it("qualifies when exactly 2 providers meet the uptime floor (qwen3 has 2)", () => {
		// qwen3-235b-a22b: 2 endpoints, both tools-capable, uptime >= 0.99, price $0.40/1M.
		const policy: SmokeModelPolicy = {
			...DEFAULT_SMOKE_POLICY,
			minCreatedUnixSec: 1_735_689_600,
			maxCompletionPricePerMillion: 0.5,
			minToolProviders: 2,
		};
		const input = buildInput({
			models: buildModels(["qwen/qwen3-235b-a22b"]),
			endpointsByModel: buildEndpointsMap(["qwen/qwen3-235b-a22b"]),
			policy,
		});
		const result = selectSmokeModel(input);
		expect(result.ranked).toHaveLength(1);
		const topQwen = result.ranked[0];
		expect(topQwen).toBeDefined();
		expect(topQwen!.toolProviderCount).toBeGreaterThanOrEqual(2);
	});
});

// ---------------------------------------------------------------------------
// Gate — :free exclusion
// ---------------------------------------------------------------------------

describe("selectSmokeModel — :free exclusion", () => {
	it("drops :free variants before any other gate", () => {
		const input = buildInput({
			models: buildModels(["anthropic/claude-3-haiku:free"]),
			endpointsByModel: buildEndpointsMap(),
		});
		const result = selectSmokeModel(input);
		expect(result.ranked).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Ranking — throughput desc → latency asc → price asc
// ---------------------------------------------------------------------------

describe("selectSmokeModel — ranking", () => {
	it("ranks by price asc (Fix 3: cheaper model wins over higher-throughput expensive model)", () => {
		// Fix 3 regression: before the fix, ranker was throughput-first which picked
		// expensive large models (e.g. nvidia/nemotron-3-super-120b at $X) over cheap
		// alternatives. After Fix 3, price-asc is the PRIMARY key.
		//
		// Fixture models with 2025-01-01 cutoff and $1.0/1M ceiling:
		//   qwen ($0.40, throughput 35.2)   ← should WIN (cheapest)
		//   grok ($0.50, throughput 65)
		//   gemini ($0.60, throughput 78.5)  ← would win under old throughput-first
		const policy: SmokeModelPolicy = {
			...DEFAULT_SMOKE_POLICY,
			minCreatedUnixSec: 1_735_689_600, // 2025-01-01
			maxCompletionPricePerMillion: 1.0,
		};
		const ids = [
			"google/gemini-2.5-flash-preview-05-20",
			"qwen/qwen3-235b-a22b",
			"x-ai/grok-3-mini",
		];
		const input = buildInput({
			models: buildModels(ids),
			endpointsByModel: buildEndpointsMap(ids),
			policy,
		});
		const result = selectSmokeModel(input);
		expect(result.ranked.length).toBeGreaterThan(1);
		// PRIMARY key: price asc — cheapest must be first
		const first = result.ranked[0];
		expect(first).toBeDefined();
		for (const other of result.ranked.slice(1)) {
			expect(first!.completionPricePerMillion).toBeLessThanOrEqual(other.completionPricePerMillion);
		}
		// Specifically: qwen ($0.40) wins over gemini ($0.60) despite gemini having higher throughput
		expect(first!.id).toBe("qwen/qwen3-235b-a22b");
	});

	it("breaks price tie by throughput desc", () => {
		// Two models with equal price — throughput is the secondary key.
		const models: OpenRouterModel[] = [
			{
				id: "slow-cheap",
				created: 1_767_225_600,
				pricing: { prompt: "0.00000010", completion: "0.00000020" }, // $0.20/1M
				supported_parameters: ["tools"],
				context_length: 128000,
			},
			{
				id: "fast-cheap",
				created: 1_767_225_600,
				pricing: { prompt: "0.00000010", completion: "0.00000020" }, // $0.20/1M — same price
				supported_parameters: ["tools"],
				context_length: 128000,
			},
		];
		const makeEndpoints = (
			id: string,
			throughput: number,
			latency: number,
		): [string, ModelEndpoints] => [
			id,
			{
				id,
				endpoints: [
					{
						provider_name: "P1",
						supported_parameters: ["tools"],
						pricing: { prompt: "0.00000010", completion: "0.00000020" },
						uptime_last_30m: 0.999,
						throughput_last_30m: { p50: throughput },
						latency_last_30m: { p50: latency },
						status: "active",
					},
					{
						provider_name: "P2",
						supported_parameters: ["tools"],
						pricing: { prompt: "0.00000010", completion: "0.00000020" },
						uptime_last_30m: 0.999,
						throughput_last_30m: { p50: throughput },
						latency_last_30m: { p50: latency },
						status: "active",
					},
				],
			},
		];
		const endpointsMap = new Map<string, ModelEndpoints>([
			makeEndpoints("slow-cheap", 20.0, 0.5),
			makeEndpoints("fast-cheap", 80.0, 0.5), // same price, higher throughput — wins
		]);
		const input: SelectionInput = {
			models,
			endpointsByModel: endpointsMap,
			policy: DEFAULT_SMOKE_POLICY,
		};
		const result = selectSmokeModel(input);
		expect(result.ranked).toHaveLength(2);
		const top = result.ranked[0];
		expect(top).toBeDefined();
		expect(top!.id).toBe("fast-cheap"); // higher throughput wins price tie
	});

	it("breaks throughput tie by latency asc", () => {
		// Create synthetic tie by adjusting endpoint data
		// We use two models from fixture with same throughput but different latency
		// We test the tiebreak by building custom inputs
		const models: OpenRouterModel[] = [
			{
				id: "modelA",
				created: 1_767_225_600,
				pricing: { prompt: "0.00000010", completion: "0.00000020" },
				supported_parameters: ["tools"],
				context_length: 128000,
			},
			{
				id: "modelB",
				created: 1_767_225_600,
				pricing: { prompt: "0.00000010", completion: "0.00000020" },
				supported_parameters: ["tools"],
				context_length: 128000,
			},
		];
		const makeEndpoints = (
			id: string,
			throughput: number,
			latency: number,
		): [string, ModelEndpoints] => [
			id,
			{
				id,
				endpoints: [
					{
						provider_name: "P1",
						supported_parameters: ["tools"],
						pricing: { prompt: "0.00000010", completion: "0.00000020" },
						uptime_last_30m: 0.999,
						throughput_last_30m: { p50: throughput },
						latency_last_30m: { p50: latency },
						status: "active",
					},
					{
						provider_name: "P2",
						supported_parameters: ["tools"],
						pricing: { prompt: "0.00000010", completion: "0.00000020" },
						uptime_last_30m: 0.999,
						throughput_last_30m: { p50: throughput },
						latency_last_30m: { p50: latency },
						status: "active",
					},
				],
			},
		];
		const endpointsMap = new Map<string, ModelEndpoints>([
			makeEndpoints("modelA", 50.0, 0.8), // higher latency
			makeEndpoints("modelB", 50.0, 0.3), // lower latency — wins
		]);
		const input: SelectionInput = {
			models,
			endpointsByModel: endpointsMap,
			policy: DEFAULT_SMOKE_POLICY,
		};
		const result = selectSmokeModel(input);
		expect(result.ranked).toHaveLength(2);
		const ranked0 = result.ranked[0];
		expect(ranked0).toBeDefined();
		expect(ranked0!.id).toBe("modelB"); // lower latency wins
	});

	it("breaks equal throughput+latency tie by price asc", () => {
		const models: OpenRouterModel[] = [
			{
				id: "cheap",
				created: 1_767_225_600,
				pricing: { prompt: "0.00000010", completion: "0.00000010" }, // $0.10/1M
				supported_parameters: ["tools"],
			},
			{
				id: "expensive",
				created: 1_767_225_600,
				pricing: { prompt: "0.00000010", completion: "0.00000030" }, // $0.30/1M
				supported_parameters: ["tools"],
			},
		];
		const makeEps = (id: string): [string, ModelEndpoints] => [
			id,
			{
				id,
				endpoints: [
					{
						provider_name: "P1",
						supported_parameters: ["tools"],
						pricing: { prompt: "0.00000010", completion: "0.00000010" },
						uptime_last_30m: 0.999,
						throughput_last_30m: { p50: 50.0 },
						latency_last_30m: { p50: 0.4 },
						status: "active",
					},
					{
						provider_name: "P2",
						supported_parameters: ["tools"],
						pricing: { prompt: "0.00000010", completion: "0.00000010" },
						uptime_last_30m: 0.999,
						throughput_last_30m: { p50: 50.0 },
						latency_last_30m: { p50: 0.4 },
						status: "active",
					},
				],
			},
		];
		const input: SelectionInput = {
			models,
			endpointsByModel: new Map([makeEps("cheap"), makeEps("expensive")]),
			policy: DEFAULT_SMOKE_POLICY,
		};
		const result = selectSmokeModel(input);
		expect(result.ranked).toHaveLength(2);
		const ranked0b = result.ranked[0];
		expect(ranked0b).toBeDefined();
		expect(ranked0b!.id).toBe("cheap");
	});
});

// ---------------------------------------------------------------------------
// :nitro routing on winner
// ---------------------------------------------------------------------------

describe("selectSmokeModel — :nitro routing", () => {
	it("sets routedId to <id>:nitro for every candidate", () => {
		const policy: SmokeModelPolicy = {
			...DEFAULT_SMOKE_POLICY,
			minCreatedUnixSec: 1_735_689_600,
			maxCompletionPricePerMillion: 1.0,
		};
		const ids = ["deepseek/deepseek-chat-v3-0324", "google/gemini-2.5-flash-preview-05-20"];
		const input = buildInput({
			models: buildModels(ids),
			endpointsByModel: buildEndpointsMap(ids),
			policy,
		});
		const result = selectSmokeModel(input);
		expect(result.ranked.length).toBeGreaterThan(0);
		for (const candidate of result.ranked) {
			expect(candidate.routedId).toBe(`${candidate.id}:nitro`);
		}
	});
});

// ---------------------------------------------------------------------------
// Fallback — delisted top choice → next candidate
// ---------------------------------------------------------------------------

describe("selectSmokeModel — delisting fallback", () => {
	it("when ranked[0] model is removed from input, ranked[0] becomes the previous ranked[1]", () => {
		const policy: SmokeModelPolicy = {
			...DEFAULT_SMOKE_POLICY,
			minCreatedUnixSec: 1_735_689_600,
			maxCompletionPricePerMillion: 1.0,
		};
		const ids = [
			"deepseek/deepseek-chat-v3-0324",
			"google/gemini-2.5-flash-preview-05-20",
			"qwen/qwen3-235b-a22b",
		];

		// Full run
		const fullInput = buildInput({
			models: buildModels(ids),
			endpointsByModel: buildEndpointsMap(ids),
			policy,
		});
		const fullResult = selectSmokeModel(fullInput);
		expect(fullResult.ranked.length).toBeGreaterThan(1);

		const winnerCandidate = fullResult.ranked[0];
		const runnerUpCandidate = fullResult.ranked[1];
		expect(winnerCandidate).toBeDefined();
		expect(runnerUpCandidate).toBeDefined();
		const winner = winnerCandidate!.id;
		const runnerUp = runnerUpCandidate!.id;

		// Remove winner
		const remainingIds = ids.filter((id) => id !== winner);
		const fallbackInput = buildInput({
			models: buildModels(remainingIds),
			endpointsByModel: buildEndpointsMap(remainingIds),
			policy,
		});
		const fallbackResult = selectSmokeModel(fallbackInput);

		expect(fallbackResult.ranked.length).toBeGreaterThan(0);
		// The runner-up from the full run must now be ranked[0]
		const fallbackTop = fallbackResult.ranked[0];
		expect(fallbackTop).toBeDefined();
		expect(fallbackTop!.id).toBe(runnerUp);
	});
});

// ---------------------------------------------------------------------------
// Fixture shape validation — detects OpenRouter API shape drift
// ---------------------------------------------------------------------------
