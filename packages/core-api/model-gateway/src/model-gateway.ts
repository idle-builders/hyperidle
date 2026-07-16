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
 *
 * @lore AU19 Increment 2e: moved here from `packages/server/src/services/
 * model-gateway.ts` (behavior-preserving move). `model-gateway` owns ZERO
 * tables — its config lives on `server_config.modelGateway`, owned by
 * `settings` and passed in as a plain parameter (never read directly by this
 * Service, so no DI port needed for that edge — `settings → model-gateway`
 * dissolved entirely back in Increment 1f, see `@hyperidle/settings`'
 * `ports.ts`). The one real outbound edge (`model-gateway → connections`,
 * §10.2 line 368) is now the locally-declared `ModelGatewayCredentialResolver`
 * port (`ports.ts`) instead of importing `CredentialResolver` straight from
 * `@hyperidle/connections`.
 */

import type {
	ModelGatewayConfig,
	ModelProvider,
	ModelTier,
	ResolvedModel,
} from "@hyperidle/shared";
import { BUILT_IN_GATEWAY_CONFIG, MissingCredentialError } from "@hyperidle/shared";
import type { ModelGatewayCredentialResolver } from "./ports.js";

/**
 * @lore AU19 Increment 1f: `BUILT_IN_GATEWAY_CONFIG` moved to
 * `@hyperidle/shared` (pure static data — see the constant's own `@lore` at
 * its new home for the full rationale) and re-exported here so this file's
 * existing consumers (`agent-work-assistant.ts`, this file's own tests) are
 * unchanged — zero behavior change.
 */
export { BUILT_IN_GATEWAY_CONFIG };

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
	credentialResolver: ModelGatewayCredentialResolver,
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
	credentialResolver: ModelGatewayCredentialResolver,
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
	credentialResolver: ModelGatewayCredentialResolver,
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
