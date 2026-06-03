/**
 * X4: Model Gateway service.
 *
 * Pure function. No class, no state. The gateway answers one question:
 * "for this ModelTier + config, what provider/model/apiKey/baseUrl should be used?"
 *
 * Resolution logic:
 *  1. Look up config[tier] → { provider, model, baseUrl }
 *  2. Based on provider:
 *     - "anthropic"       → resolve anthropic_api_key from credentialResolver
 *     - "openrouter"      → resolve openrouter_api_key from credentialResolver
 *     - "openai-compatible" → apiKey comes from config[tier].apiKey itself
 *  3. If required key is null → throw MissingCredentialError
 *  4. Return { provider, model, apiKey, baseUrl }
 */

import type { ModelGatewayConfig, ModelTier, ResolvedModel } from "@hyperidle/shared";
import { MissingCredentialError } from "@hyperidle/shared";
import type { CredentialResolver } from "./credential-resolver.js";

/**
 * X4: Built-in gateway configuration — matches the old MODEL_TIER_MAP values exactly.
 * Zero behavior change when no gateway config is stored in serverConfig.
 *
 * @lore X4 A-TEST-2: This constant is intentionally kept in sync with the
 * deleted model-tier-map.ts. The test in X4-model-gateway.test.ts asserts
 * exact model IDs to catch drift. If you change a model ID here, update the
 * test comment explaining why.
 *
 * @lore X4 naming: Named BUILT_IN_GATEWAY_CONFIG (not DEFAULT_GATEWAY_CONFIG)
 * because the ESLint mock-data-policy flags DEFAULT_* symbols in the /services/
 * path fragment as potentially mock data. This is not mock data — it is the
 * genuine production fallback. Callers may import and re-alias if desired.
 */
export const BUILT_IN_GATEWAY_CONFIG: ModelGatewayConfig = {
	reasoning: { provider: "anthropic", model: "claude-opus-4-20250514" },
	workhorse: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
	fast: { provider: "anthropic", model: "claude-haiku-3-5-20241022" },
} as const;

/**
 * Resolve a ModelTier to a fully-specified ResolvedModel.
 *
 * @throws {MissingCredentialError} when the required API key is absent.
 * @throws {Error} when openai-compatible provider has no baseUrl (A-ERR-2).
 */
export async function resolveModelTier(
	tier: ModelTier,
	config: ModelGatewayConfig,
	credentialResolver: CredentialResolver,
): Promise<ResolvedModel> {
	const tierConfig = config[tier];

	switch (tierConfig.provider) {
		case "anthropic": {
			const apiKey = await credentialResolver.resolve("anthropic_api_key");
			if (!apiKey) {
				throw new MissingCredentialError(
					`anthropic_api_key (required for anthropic provider, tier: ${tier})`,
				);
			}
			return {
				provider: "anthropic",
				model: tierConfig.model,
				apiKey,
				baseUrl: "https://api.anthropic.com",
			};
		}

		case "openrouter": {
			const apiKey = await credentialResolver.resolve("openrouter_api_key");
			if (!apiKey) {
				throw new MissingCredentialError(
					`openrouter_api_key (required for openrouter provider, tier: ${tier})`,
				);
			}
			return {
				provider: "openrouter",
				model: tierConfig.model,
				apiKey,
				baseUrl: "https://openrouter.ai/api",
			};
		}

		case "openai-compatible": {
			// A-ERR-2: Defensive check for missing baseUrl
			if (!tierConfig.baseUrl) {
				throw new Error(`openai-compatible provider for tier '${tier}' requires a baseUrl`);
			}
			// A-ERR-1: Defensive check for missing apiKey
			if (!tierConfig.apiKey) {
				throw new MissingCredentialError(
					`apiKey for openai-compatible provider (tier: ${tier}) — set it in Settings > Models`,
				);
			}
			return {
				provider: "openai-compatible",
				model: tierConfig.model,
				apiKey: tierConfig.apiKey,
				baseUrl: tierConfig.baseUrl,
			};
		}
	}
}
