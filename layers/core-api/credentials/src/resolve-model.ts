/**
 * Everything that needs a live secret to answer: the port that resolves a credential's value, and
 * the model resolution that cannot produce a `ResolvedModel` without one.
 *
 * @lore AU34: `resolveModel` and its two private helpers left the model-gateway module rather than
 * staying beside the catalog. Every one of them takes a `CredentialResolver`, and leaving them
 * behind would make the universal package import the narrow one — inverting the audience order the
 * split exists to establish. The catalog, the config and the request shape stay where the whole
 * system can name them; the resolution moves to the audience that holds secrets.
 */

import type {
	CredentialName,
	ModelGatewayConfig,
	ModelProvider,
	ModelRequest,
	ModelTier,
	ResolvedModel,
} from "@hyperidle/domain-model";
import { MissingCredentialError } from "@hyperidle/domain-model";

/**
 * Resolves a credential value by name.
 *
 * @lore AU19 Increment 4: reclassified from `layers/core-api/connections/src/
 * credential-resolver.ts` — `harness-registry`'s `cli-harness-adapter.ts`
 * (agent-execution) accepts an injected `CredentialResolver` (never mutating
 * `process.env` directly, P3 Decision 4) but Mechanism B forbids an execution
 * Service depending on `@hyperidle/connections` (a core-api domain Service),
 * even for a type-only reference. `connections` stays the sole owner of the
 * concrete `EnvCredentialResolver`/`DbCredentialResolver` implementations.
 *
 * @lore AU34: it is a PORT — it fetches a secret on the caller's behalf, and the
 * two ends are different packages: one implements it, another receives it. A port
 * in a universal package advertises that capability to the whole repo, so it left
 * the credential catalog and lives here, with the resolution that cannot produce a
 * ResolvedModel without it.
 */
export interface CredentialResolver {
	resolve(name: CredentialName): Promise<string | null>;
}

/**
 * AU21 Increment 14b (Decision L2): `resolveModel` + `Error`
 * + `ModelRequest` moved here from the now-dissolved `@hyperidle/model-gateway`
 * core-api package. `resolveModel` is a pure, stateless function — it owns zero
 * tables and its one dependency (`CredentialResolver`) is injected by the caller
 * (the composition root binds a real `DbCredentialResolver` reading
 * `server_credentials`; `resolveModel` itself never touches the DB). Living in
 * `@hyperidle/credential-access` (a leaf its audience already depends on) means both
 * `dispatch` and `run-orchestration` import it directly with no cross-layer
 * edge — the same shape `BUILT_IN_GATEWAY_CONFIG` already had. See
 * `.pipeline/work/AU21/architecture.md` Decision L2.
 *
 * @lore X4: Pure function. No class, no state. The gateway answers one question:
 * "for this ModelRequest + config, what provider/model/apiKey/baseUrl should be
 * used?"
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
 */

/**
 * AH2: Shared provider resolution logic — extracts the provider-specific
 * credential/baseUrl lookup so it can be reused by both the tier path and the
 * agent path without duplicating the switch.
 *
 * @throws {MissingCredentialError} when the required API key is absent.
 * @throws {Error} when openai-compatible provider has no baseUrl.
 * @throws {Error} when called from the per-agent
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
				throw new Error(
					"Per-agent model provider 'openai-compatible' is not supported. " +
						"Only 'anthropic' models are available for per-agent selection.",
				);
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
 * Resolve a model request to a fully-specified `ResolvedModel`.
 *
 * Accepts a discriminated `ModelRequest`:
 *  - `{ kind: "tier", tier }` — resolves the named tier from config.
 *  - `{ kind: "agent", modelId, modelProvider, tierFallback }` — uses the
 *    per-agent model when `modelId` is set; falls back to the tier when null.
 *    "openai-compatible" is rejected on the agent path (throws
 *    `Error`).
 *
 * This is the single entry point that replaces `resolveModelTier` +
 * `resolveAgentModel`. The two were already one operation with a discriminated
 * input — `resolveAgentModel` already delegated to `resolveModelTier` on the
 * null-modelId path.
 *
 * @throws {Error} when agent.modelProvider is "openai-compatible".
 * @throws {MissingCredentialError} when the required API key is absent.
 * @throws {Error} when openai-compatible tier has no baseUrl (A-ERR-2).
 */
export async function resolveModel(
	request: ModelRequest,
	config: ModelGatewayConfig,
	credentialResolver: CredentialResolver,
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
