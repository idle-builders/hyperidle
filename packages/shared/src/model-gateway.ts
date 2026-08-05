/**
 * X4: Model Gateway shared types.
 *
 * The gateway resolves a ModelTier + config into a ResolvedModel — everything
 * a harness adapter needs to make an LLM call. It is a resolution layer only;
 * it does not make API calls or proxy requests.
 */

import type { CredentialResolver } from "./credential.js";
import { MissingCredentialError } from "./errors.js";
import type { ModelTier } from "./types.js";

/**
 * X4: The set of supported model provider kinds.
 * "anthropic"       = direct Anthropic Messages API
 * "openrouter"      = OpenRouter (OpenAI-compatible with extensions)
 * "openai-compatible" = any OpenAI-compatible endpoint (Together, Groq, etc.)
 *
 * @lore X4: ModelProvider is a closed union (3 values). Adding a new provider
 * kind requires a code change — intentional because each provider has different
 * request/response normalization needs. "Adding a provider" is never just a
 * config change.
 */
export const MODEL_PROVIDERS = ["anthropic", "openrouter", "openai-compatible"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

/**
 * X4: Per-tier gateway configuration as stored in serverConfig.
 * Each tier maps to one provider + model + optional base URL.
 *
 * @lore AH1 §2: apiKey was removed from ModelTierConfig. It now lives exclusively
 * in the server_credentials table as openai_compatible_api_key (for openai-compatible
 * providers) or anthropic_api_key / openrouter_api_key (for others). baseUrl (non-secret)
 * remains here. resolveModelTier reads the key via the credential resolver, not this config.
 * @lore X4 A-TYPE-1: Original note superseded by AH1. The "apiKey in ModelTierConfig"
 * approach was the X4 A-SEC-3 known gap — AH1 closes it.
 */
export interface ModelTierConfig {
	readonly provider: ModelProvider;
	readonly model: string;
	/** Only used for "openai-compatible" provider. Ignored for anthropic/openrouter. */
	readonly baseUrl?: string;
}

/**
 * X4: Full gateway configuration — one entry per tier.
 * Stored in serverConfig.config JSON under the "modelGateway" key.
 */
export type ModelGatewayConfig = Record<ModelTier, ModelTierConfig>;

/**
 * X4: Resolved model info returned by the gateway.
 * Includes everything a harness adapter needs to make an LLM call.
 */
export interface ResolvedModel {
	readonly provider: ModelProvider;
	readonly model: string;
	readonly apiKey: string;
	readonly baseUrl: string;
}

/**
 * AH2: A single entry in the closed model catalog.
 * All models are Anthropic models for now; the catalog is the source of truth
 * for valid modelId values on agent records.
 */
export interface ModelCatalogEntry {
	readonly id: string;
	readonly label: string;
	readonly provider: ModelProvider;
	readonly contextWindow: number;
}

/**
 * AH2: Closed catalog of current models.
 * This is the only set of valid modelId values for per-agent model selection.
 *
 * @lore AH2: The catalog is intentionally small and closed — every model here
 * has known provider/cost/context-window data in the harness layer. Adding a
 * new model requires updating both this catalog AND the context-window map in
 * the harness-registry package.
 */
export const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
	{ id: "claude-opus-4-8", label: "Opus 4.8", provider: "anthropic", contextWindow: 1_000_000 },
	{
		id: "claude-sonnet-4-6",
		label: "Sonnet 4.6",
		provider: "anthropic",
		contextWindow: 1_000_000,
	},
	{ id: "claude-haiku-4-5", label: "Haiku 4.5", provider: "anthropic", contextWindow: 200_000 },
	{ id: "claude-fable-5", label: "Fable 5", provider: "anthropic", contextWindow: 1_000_000 },
	{
		id: "qwen/qwen3.8-max",
		label: "Qwen3.8 Max",
		provider: "openrouter",
		contextWindow: 1_000_000,
	},
] as const;

/** AH2: Default modelId for per-agent model selection. */
export const DEFAULT_AGENT_MODEL_ID = "claude-sonnet-4-6";

/** AH2: Default provider for per-agent model selection. */
export const DEFAULT_AGENT_MODEL_PROVIDER: ModelProvider = "anthropic";

/** AH2: Default harnessType for per-agent harness selection. */
export const DEFAULT_AGENT_HARNESS = "builtin";

/**
 * X4: Built-in gateway configuration — matches the old MODEL_TIER_MAP values exactly.
 * Zero behavior change when no gateway config is stored in serverConfig.
 *
 * @lore X4 A-TEST-2: This constant is intentionally kept in sync with the
 * deleted model-tier-map.ts. `AH2-resolve-agent-model.integration.test.ts`
 * asserts exact model IDs to catch drift. If you change a model ID here,
 * update the test comment explaining why.
 *
 * @lore X4 naming: Named BUILT_IN_GATEWAY_CONFIG (not DEFAULT_GATEWAY_CONFIG)
 * because the ESLint mock-data-policy flags DEFAULT_* symbols in the
 * `/services/` path fragment as potentially mock data. This is not mock data
 * — it is the genuine production fallback. Callers may import and re-alias
 * if desired.
 *
 * @lore AH2: Re-keyed to current catalog IDs (see {@link MODEL_CATALOG}).
 *
 * @lore AU19 Increment 1f: moved here from `packages/server/src/services/
 * model-gateway.ts` (the not-yet-migrated `model-gateway` Service). It is
 * pure data with no domain/DB reference, composed entirely from this file's
 * own `ModelGatewayConfig` type — the same "static config data → shared"
 * rationale §5 already applies to `config/builtin-tool-catalog.ts`. Moving it
 * dissolves the `settings → model-gateway` census edge (§10.2) instead of
 * threading a `ModelGatewayDefaults` DI parameter through
 * `readServerConfig`/`updateServerConfig`'s ~40 production + ~120 test call
 * sites for one constant. `model-gateway.ts`'s own domain logic
 * (`resolveModelTier`/`resolveAgentModel`) is untouched and stays in
 * `packages/server` until the `model-gateway` Service migrates (Increment 2);
 * it re-exports this constant for its existing consumers
 * (`agent-work-assistant.ts` and its own tests) so behavior is unchanged.
 */
export const BUILT_IN_GATEWAY_CONFIG: ModelGatewayConfig = {
	reasoning: { provider: "anthropic", model: "claude-opus-4-8" },
	workhorse: { provider: "anthropic", model: "claude-sonnet-4-6" },
	fast: { provider: "anthropic", model: "claude-haiku-4-5" },
} as const;

/** AH2: Returns true if `id` is a valid catalog model ID. */
export function isCatalogModel(id: string): boolean {
	return MODEL_CATALOG.some((m) => m.id === id);
}

/** AH2: Returns the catalog entry for `id`, or undefined if not found. */
export function catalogEntry(id: string): ModelCatalogEntry | undefined {
	return MODEL_CATALOG.find((m) => m.id === id);
}

/**
 * AU21 Increment 14b (Decision L2): `resolveModel` + `UnsupportedAgentProviderError`
 * + `ModelRequest` moved here from the now-dissolved `@hyperidle/model-gateway`
 * core-api package. `resolveModel` is a pure, stateless function — it owns zero
 * tables and its one dependency (`CredentialResolver`) is injected by the caller
 * (the composition root binds a real `DbCredentialResolver` reading
 * `server_credentials`; `resolveModel` itself never touches the DB). Living in
 * `@hyperidle/shared` (a leaf every layer already depends on) means both
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
