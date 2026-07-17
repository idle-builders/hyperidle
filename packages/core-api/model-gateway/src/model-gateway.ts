/**
 * X4: Model Gateway service.
 *
 * Pure function. No class, no state. The gateway answers one question:
 * "for this ModelRequest + config, what provider/model/apiKey/baseUrl should be used?"
 *
 * Resolution logic:
 *  1. Discriminate on ModelRequest.kind ("tier" | "agent").
 *  2. Look up config[tier] → { provider, model, baseUrl }
 *  3. Based on provider:
 *     - "anthropic"       → resolve anthropic_api_key from credentialResolver
 *     - "openrouter"      → resolve openrouter_api_key from credentialResolver
 *     - "openai-compatible" → resolve openai_compatible_api_key from credentialResolver
 *  4. If required key is null → throw MissingCredentialError
 *  5. Return { provider, model, apiKey, baseUrl }
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
 *
 * @lore AU20 Increment Ab1: `resolveModelTier` + `resolveAgentModel` collapsed
 * into `resolveModel(request: ModelRequest, ...)`. The two were already one
 * operation with a discriminated input — `resolveAgentModel` delegated to
 * `resolveModelTier` on the null-modelId path. `AgentModelParams` folded into
 * the agent branch of `ModelRequest`. `BUILT_IN_GATEWAY_CONFIG` re-export
 * dropped — consumers import it directly from `@hyperidle/shared`. Surface:
 * 6 → 4 exports.
 */

import type {
	ModelGatewayConfig,
	ModelProvider,
	ModelTier,
	ResolvedModel,
} from "@hyperidle/shared";
import { MissingCredentialError } from "@hyperidle/shared";
import type { ModelGatewayCredentialResolver } from "./ports.js";

/**
 * AH2: Error thrown when a per-agent model uses an unsupported provider.
 * Only "anthropic" and "openrouter" are supported for per-agent model selection.
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
 * A model resolution request — discriminated by kind.
 *
 * - `{ kind: "tier"; tier }` — resolve a concrete ModelTier (e.g. "workhorse").
 * - `{ kind: "agent"; modelId; modelProvider; tierFallback }` — resolve a
 *   per-agent model, falling back to the tier when modelId is null. This is
 *   the collapsed form of the former `AgentModelParams` + `tierFallback` pair.
 */
export type ModelRequest =
	| { readonly kind: "tier"; readonly tier: ModelTier }
	| {
			readonly kind: "agent";
			readonly modelId: string | null;
			readonly modelProvider: string | null;
			readonly tierFallback: string;
	  };

/**
 * AH2: Shared provider resolution logic — extracts the provider-specific
 * credential/baseUrl lookup so it can be reused by both the tier path and the
 * agent path without duplicating the switch.
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
 * Internal: resolve a ModelTier to a fully-specified ResolvedModel.
 *
 * @throws {MissingCredentialError} when the required API key is absent.
 * @throws {Error} when openai-compatible provider has no baseUrl (A-ERR-2).
 */
async function resolveModelTier(
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
 * Resolve a model request to a fully-specified `ResolvedModel`.
 *
 * Accepts a discriminated `ModelRequest`:
 *  - `{ kind: "tier", tier }` — resolves the named tier from config.
 *  - `{ kind: "agent", modelId, modelProvider, tierFallback }` — uses the
 *    per-agent model when `modelId` is set; falls back to the tier when null.
 *    "openai-compatible" is rejected on the agent path (throws
 *    `UnsupportedAgentProviderError`).
 *
 * This is the single entry point that replaces `resolveModelTier` +
 * `resolveAgentModel`. The two were already one operation with a discriminated
 * input — `resolveAgentModel` already delegated to `resolveModelTier` on the
 * null-modelId path.
 *
 * @throws {UnsupportedAgentProviderError} when agent.modelProvider is "openai-compatible".
 * @throws {MissingCredentialError} when the required API key is absent.
 * @throws {Error} when openai-compatible tier has no baseUrl (A-ERR-2).
 */
export async function resolveModel(
	request: ModelRequest,
	config: ModelGatewayConfig,
	credentialResolver: ModelGatewayCredentialResolver,
): Promise<ResolvedModel> {
	if (request.kind === "tier") {
		return resolveModelTier(request.tier, config, credentialResolver);
	}

	// kind === "agent"
	if (request.modelId) {
		// Per-agent path: anthropic + openrouter supported; openai-compatible rejected
		const provider = (request.modelProvider ?? "anthropic") as ModelProvider;
		return resolveProvider(provider, request.modelId, credentialResolver, {
			agentPath: true,
			context: `agent model: ${request.modelId}`,
		});
	}

	// Tier fallback
	const tier = (request.tierFallback ?? "workhorse") as ModelTier;
	return resolveModelTier(tier, config, credentialResolver);
}
