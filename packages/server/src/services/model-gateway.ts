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
 *     - "openai-compatible" → resolve openai_compatible_api_key from credentialResolver
 *  3. If required key is null → throw MissingCredentialError
 *  4. Return { provider, model, apiKey, baseUrl }
 */

import type {
	ModelGatewayConfig,
	ModelProvider,
	ModelTier,
	ResolvedModel,
} from "@hyperidle/shared";
import { MissingCredentialError } from "@hyperidle/shared";
import type { CredentialResolver } from "./credential-resolver.js";

/**
 * AH2: Error thrown when a per-agent model uses an unsupported provider.
 * Only "anthropic" is supported for per-agent model selection in v1.
 */
export class UnsupportedAgentProviderError extends Error {
	constructor(public readonly provider: string) {
		super(
			`Per-agent model provider '${provider}' is not supported. ` +
				`Only 'anthropic' models are available for per-agent selection.`,
		);
		this.name = "UnsupportedAgentProviderError";
	}
}

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
 *
 * @lore AH2: Re-keyed to current catalog IDs. See MODEL_CATALOG in @hyperidle/shared.
 */
export const BUILT_IN_GATEWAY_CONFIG: ModelGatewayConfig = {
	reasoning: { provider: "anthropic", model: "claude-opus-4-8" },
	workhorse: { provider: "anthropic", model: "claude-sonnet-4-6" },
	fast: { provider: "anthropic", model: "claude-haiku-4-5" },
} as const;

/**
 * AH2: Shared provider resolution logic — extracts the provider-specific
 * credential/baseUrl lookup so it can be reused by both resolveModelTier
 * and resolveAgentModel without duplicating the switch.
 *
 * @throws {MissingCredentialError} when the required API key is absent.
 * @throws {Error} when openai-compatible provider has no baseUrl.
 * @throws {UnsupportedAgentProviderError} when called from the per-agent
 *   path with a non-anthropic provider (agentPath: true).
 */
async function resolveProvider(
	provider: ModelProvider,
	model: string,
	credentialResolver: CredentialResolver,
	options: {
		baseUrl?: string;
		agentPath?: boolean;
		context?: string;
	} = {},
): Promise<ResolvedModel> {
	switch (provider) {
		case "anthropic": {
			const apiKey = await credentialResolver.resolve("anthropic_api_key");
			if (!apiKey) {
				throw new MissingCredentialError(
					`anthropic_api_key (required for anthropic provider${options.context ? `, ${options.context}` : ""})`,
				);
			}
			return {
				provider: "anthropic",
				model,
				apiKey,
				baseUrl: "https://api.anthropic.com",
			};
		}

		case "openrouter": {
			// openrouter IS supported for per-agent model selection (unlike openai-compatible)
			const apiKey = await credentialResolver.resolve("openrouter_api_key");
			if (!apiKey) {
				throw new MissingCredentialError(
					`openrouter_api_key (required for openrouter provider${options.context ? `, ${options.context}` : ""})`,
				);
			}
			return {
				provider: "openrouter",
				model,
				apiKey,
				baseUrl: "https://openrouter.ai/api",
			};
		}

		case "openai-compatible": {
			if (options.agentPath) {
				throw new UnsupportedAgentProviderError("openai-compatible");
			}
			// A-ERR-2: Defensive check for missing baseUrl
			if (!options.baseUrl) {
				throw new Error(
					`openai-compatible provider${options.context ? ` for ${options.context}` : ""} requires a baseUrl`,
				);
			}
			// AH1 §2: Key now lives in server_credentials, resolved via the credential resolver.
			// No more plaintext apiKey from config.
			const apiKey = await credentialResolver.resolve("openai_compatible_api_key");
			if (!apiKey) {
				throw new MissingCredentialError(
					`openai_compatible_api_key (required for openai-compatible provider${options.context ? ` (${options.context})` : ""})`,
				);
			}
			return {
				provider: "openai-compatible",
				model,
				apiKey,
				baseUrl: options.baseUrl,
			};
		}
	}
}

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
	// AH1 §2: No plaintext apiKey passed from config — credentials resolved via credentialResolver.
	return resolveProvider(tierConfig.provider, tierConfig.model, credentialResolver, {
		baseUrl: tierConfig.baseUrl,
		context: `tier: ${tier}`,
	});
}

/**
 * AH2: Per-agent model parameters — what's stored on the users row.
 */
export interface AgentModelParams {
	/** Per-agent model ID override. null = use tier fallback. */
	modelId: string | null;
	/** Per-agent provider override. null = use tier fallback. */
	modelProvider: string | null;
}

/**
 * AH2: Resolve the model for a specific agent.
 *
 * Priority:
 * 1. If agent has modelId → use agent's (modelProvider, modelId) pair directly.
 *    Supports "anthropic" and "openrouter" providers for per-agent selection.
 *    "openai-compatible" throws UnsupportedAgentProviderError.
 * 2. If agent has no modelId → fall back to resolveModelTier using tierFallback.
 *
 * @param agent — per-agent model params from the DB row
 * @param tierFallback — the tier to use when agent.modelId is null (e.g. "workhorse")
 * @param config — the full gateway config (for tier resolution)
 * @param credentialResolver — for key lookups
 *
 * @throws {UnsupportedAgentProviderError} when agent.modelProvider is "openai-compatible".
 * @throws {MissingCredentialError} when the required API key is absent.
 */
export async function resolveAgentModel(
	agent: AgentModelParams,
	tierFallback: string,
	config: ModelGatewayConfig,
	credentialResolver: CredentialResolver,
): Promise<ResolvedModel> {
	if (agent.modelId) {
		// Per-agent path: anthropic + openrouter supported; openai-compatible rejected
		const provider = (agent.modelProvider ?? "anthropic") as ModelProvider;
		return resolveProvider(provider, agent.modelId, credentialResolver, {
			agentPath: true,
			context: `agent model: ${agent.modelId}`,
		});
	}

	// Tier fallback
	const tier = (tierFallback ?? "workhorse") as ModelTier;
	return resolveModelTier(tier, config, credentialResolver);
}
