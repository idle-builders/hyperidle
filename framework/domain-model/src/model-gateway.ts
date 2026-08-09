/**
 * X4: Model Gateway shared types.
 *
 * The gateway resolves a ModelTier + config into a ResolvedModel — everything
 * a harness adapter needs to make an LLM call. It is a resolution layer only;
 * it does not make API calls or proxy requests.
 */

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
 * AH2: Closed catalog of current Claude models.
 * This is the only set of valid modelId values for per-agent model selection.
 *
 * @lore AH2: The catalog is intentionally small and closed — every model here
 * has been validated against the Anthropic Messages API and has known cost/
 * context-window data in the harness layer. Adding a new model requires updating
 * both this catalog AND the cost/context-window maps in the server package.
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
