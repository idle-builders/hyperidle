/**
 * AU21 Increment 14b (Decision L2) — `resolveModel` moved into
 * `@hyperidle/shared` unchanged (behavior-preserving).
 *
 * Proves the moved function still resolves tier + per-agent requests
 * identically to the deleted `@hyperidle/model-gateway` package: same
 * inputs, same resolved `{provider,model,apiKey,baseUrl}` output, same
 * thrown error types (`MissingCredentialError`/`UnsupportedAgentProviderError`).
 * `dispatch` and `run-orchestration` never call `resolveModel` directly —
 * they call it through a composition-root closure
 * (`dispatch-bindings.ts`/`server-factory.ts`'s `makeResolveModel`) — so this
 * is the direct-import proof that the underlying function they close over is
 * unchanged; `X4-model-gateway.integration.test.ts` and
 * `AH2-resolve-agent-model.integration.test.ts` (re-pointed to
 * `@hyperidle/shared`) prove the composition-root wiring end to end.
 */

import { describe, expect, it } from "vitest";
import type { CredentialResolver } from "../credential.js";
import { MissingCredentialError } from "../errors.js";
import {
	BUILT_IN_GATEWAY_CONFIG,
	resolveModel,
	UnsupportedAgentProviderError,
} from "../model-gateway.js";

function credentialResolverWith(keys: Record<string, string | null>): CredentialResolver {
	return {
		resolve: (name) => Promise.resolve(keys[name] ?? null),
	};
}

describe("resolveModel: tier + per-agent model resolution", () => {
	it("resolves a tier request against BUILT_IN_GATEWAY_CONFIG unchanged", async () => {
		const resolver = credentialResolverWith({ anthropic_api_key: "sk-test-anthropic" });
		const resolved = await resolveModel(
			{ kind: "tier", tier: "workhorse" },
			BUILT_IN_GATEWAY_CONFIG,
			resolver,
		);
		expect(resolved).toEqual({
			provider: "anthropic",
			model: "claude-sonnet-4-6",
			apiKey: "sk-test-anthropic",
			baseUrl: "https://api.anthropic.com",
		});
	});

	it("resolves a per-agent request with a concrete modelId, falling through to the agent path", async () => {
		const resolver = credentialResolverWith({ openrouter_api_key: "sk-test-openrouter" });
		const resolved = await resolveModel(
			{
				kind: "agent",
				modelId: "some/openrouter-model",
				modelProvider: "openrouter",
				tierFallback: "workhorse",
			},
			BUILT_IN_GATEWAY_CONFIG,
			resolver,
		);
		expect(resolved).toEqual({
			provider: "openrouter",
			model: "some/openrouter-model",
			apiKey: "sk-test-openrouter",
			baseUrl: "https://openrouter.ai/api",
		});
	});

	it("falls back to the tier when modelId is null (agent kind, no override)", async () => {
		const resolver = credentialResolverWith({ anthropic_api_key: "sk-test-anthropic" });
		const resolved = await resolveModel(
			{ kind: "agent", modelId: null, modelProvider: null, tierFallback: "fast" },
			BUILT_IN_GATEWAY_CONFIG,
			resolver,
		);
		expect(resolved).toEqual({
			provider: "anthropic",
			model: "claude-haiku-4-5",
			apiKey: "sk-test-anthropic",
			baseUrl: "https://api.anthropic.com",
		});
	});

	it("throws UnsupportedAgentProviderError for openai-compatible on the agent path", async () => {
		const resolver = credentialResolverWith({});
		await expect(
			resolveModel(
				{
					kind: "agent",
					modelId: "some-model",
					modelProvider: "openai-compatible",
					tierFallback: "workhorse",
				},
				BUILT_IN_GATEWAY_CONFIG,
				resolver,
			),
		).rejects.toBeInstanceOf(UnsupportedAgentProviderError);
	});

	it("throws MissingCredentialError when the required key is absent", async () => {
		const resolver = credentialResolverWith({});
		await expect(
			resolveModel({ kind: "tier", tier: "workhorse" }, BUILT_IN_GATEWAY_CONFIG, resolver),
		).rejects.toBeInstanceOf(MissingCredentialError);
	});
});
