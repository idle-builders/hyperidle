/**
 * AH2 RED — resolveAgentModel integration tests
 *
 * AC5: Global tier table no longer per-agent mechanism; resolveAgentModel wins
 * AC7: Resolver respects per-agent model before system default
 * AC2c: Per-agent openai-compatible rejected at boundary (ARCH-3)
 *
 * These tests FAIL until:
 *  - packages/server/src/services/model-gateway.ts adds resolveAgentModel()
 *  - packages/server/src/services/model-gateway.ts refactors resolveProvider()
 */

import { type CredentialResolver, resolveModel } from "@hyperidle/credentials";
import { BUILT_IN_GATEWAY_CONFIG, MissingCredentialError } from "@hyperidle/domain-model";
import { describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

function makeResolver(entries: Record<string, string | null>): CredentialResolver {
	return {
		resolve: vi.fn(async (name: string) => entries[name] ?? null),
	};
}

describe("AH2 AC5/AC7: resolveAgentModel — per-agent model wins", () => {
	test("when agent has modelId + modelProvider, returns per-agent model (not tier)", async ({}) => {
		const resolver = makeResolver({ anthropic_api_key: "ant-key-ah2" });
		const agent = { modelId: "claude-opus-4-8", modelProvider: "anthropic" as const };

		const result = await resolveModel(
			{ kind: "agent", ...agent, tierFallback: "workhorse" },
			BUILT_IN_GATEWAY_CONFIG,
			resolver,
		);

		// Per-agent model wins — must return claude-opus-4-8, not the workhorse tier model
		expect(result.model).toBe("claude-opus-4-8");
		expect(result.provider).toBe("anthropic");
		expect(result.apiKey).toBe("ant-key-ah2");
		expect(result.baseUrl).toBe("https://api.anthropic.com");
	});

	test("per-agent model overrides tier even when tier specifies a different model", async ({}) => {
		const resolver = makeResolver({ anthropic_api_key: "ant-key-2" });
		// agent uses haiku, but the workhorse tier config maps to sonnet
		const agent = { modelId: "claude-haiku-4-5", modelProvider: "anthropic" as const };

		const result = await resolveModel(
			{ kind: "agent", ...agent, tierFallback: "workhorse" },
			BUILT_IN_GATEWAY_CONFIG,
			resolver,
		);

		expect(result.model).toBe("claude-haiku-4-5");
		expect(result.provider).toBe("anthropic");
	});

	test("when agent has null modelId, falls back to tier gateway", async ({}) => {
		const resolver = makeResolver({ anthropic_api_key: "ant-key-3" });
		const agent = { modelId: null, modelProvider: null };

		const result = await resolveModel(
			{ kind: "agent", ...agent, tierFallback: "workhorse" },
			BUILT_IN_GATEWAY_CONFIG,
			resolver,
		);

		// Should return the tier's model (now claude-sonnet-4-6 after AH2 re-key)
		expect(result.provider).toBe("anthropic");
		expect(result.model).toBe("claude-sonnet-4-6");
	});

	test("when agent has null modelId only, falls back to tier gateway", async ({}) => {
		const resolver = makeResolver({ anthropic_api_key: "ant-key-4" });
		const agent = { modelId: null, modelProvider: "anthropic" as const };

		const result = await resolveModel(
			{ kind: "agent", ...agent, tierFallback: "fast" },
			BUILT_IN_GATEWAY_CONFIG,
			resolver,
		);

		// Falls back to tier (fast) model
		expect(result.provider).toBe("anthropic");
		expect(result.model).toBe("claude-haiku-4-5");
	});

	test("throws MissingCredentialError when per-agent anthropic model has no key", async ({}) => {
		const resolver = makeResolver({ anthropic_api_key: null });
		const agent = { modelId: "claude-sonnet-4-6", modelProvider: "anthropic" as const };

		await expect(
			resolveModel(
				{ kind: "agent", ...agent, tierFallback: "workhorse" },
				BUILT_IN_GATEWAY_CONFIG,
				resolver,
			),
		).rejects.toThrow(MissingCredentialError);
	});

	test("per-agent openrouter model resolves with openrouter key", async ({}) => {
		const resolver = makeResolver({ openrouter_api_key: "or-key-ah2" });
		const agent = { modelId: "anthropic/claude-sonnet-4", modelProvider: "openrouter" as const };

		const result = await resolveModel(
			{ kind: "agent", ...agent, tierFallback: "workhorse" },
			BUILT_IN_GATEWAY_CONFIG,
			resolver,
		);

		expect(result.provider).toBe("openrouter");
		expect(result.model).toBe("anthropic/claude-sonnet-4");
		expect(result.apiKey).toBe("or-key-ah2");
		expect(result.baseUrl).toBe("https://openrouter.ai/api");
	});

	test("per-agent openrouter model throws MissingCredentialError when key absent", async ({}) => {
		const resolver = makeResolver({ openrouter_api_key: null });
		const agent = { modelId: "anthropic/claude-sonnet-4", modelProvider: "openrouter" as const };

		await expect(
			resolveModel(
				{ kind: "agent", ...agent, tierFallback: "workhorse" },
				BUILT_IN_GATEWAY_CONFIG,
				resolver,
			),
		).rejects.toThrow(MissingCredentialError);
	});
});

describe("AH2 AC2c: resolveAgentModel — openai-compatible per-agent rejected (ARCH-3)", () => {
	test("per-agent openai-compatible provider throws UnsupportedAgentProviderError", async ({}) => {
		const resolver = makeResolver({});
		const agent = { modelId: "some-model", modelProvider: "openai-compatible" as const };

		// resolveProvider throws defensively — per-agent openai-compatible is unsupported
		await expect(
			resolveModel(
				{ kind: "agent", ...agent, tierFallback: "workhorse" },
				BUILT_IN_GATEWAY_CONFIG,
				resolver,
			),
		).rejects.toThrow(/unsupported|openai-compatible|not supported/i);
	});
});

describe("AH2 AC4: BUILT_IN_GATEWAY_CONFIG uses current catalog ids", () => {
	test("reasoning tier uses claude-opus-4-8", ({}) => {
		expect(BUILT_IN_GATEWAY_CONFIG.reasoning.model).toBe("claude-opus-4-8");
	});

	test("workhorse tier uses claude-sonnet-4-6", ({}) => {
		expect(BUILT_IN_GATEWAY_CONFIG.workhorse.model).toBe("claude-sonnet-4-6");
	});

	test("fast tier uses claude-haiku-4-5", ({}) => {
		expect(BUILT_IN_GATEWAY_CONFIG.fast.model).toBe("claude-haiku-4-5");
	});

	test("reasoning tier provider is anthropic", ({}) => {
		expect(BUILT_IN_GATEWAY_CONFIG.reasoning.provider).toBe("anthropic");
	});
});
