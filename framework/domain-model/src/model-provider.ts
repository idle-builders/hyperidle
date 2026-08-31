/**
 * The model providers HyperIdle knows by name.
 *
 * @lore This file was `model-gateway.ts`, and it carried a whole resolution
 * layer: a per-tier config (`ModelTierConfig`/`ModelGatewayConfig`), the
 * `ResolvedModel` a harness adapter needed to make an LLM call, a
 * `BUILT_IN_GATEWAY_CONFIG` default, and a four-entry `MODEL_CATALOG` with its
 * `catalogEntry`/`isCatalogModel` lookups and `DEFAULT_AGENT_MODEL_ID`.
 *
 * All of it served the built-in harness, which made provider API calls itself.
 * Every harness now authenticates with its own login and runs the model its
 * agent named, and each reports its own model list — so there is no gateway to
 * configure, no credential to resolve, and no catalogue to keep current.
 *
 * What survives is the closed set of provider names, which an agent's
 * `model_provider` and an adapter's `modelProviders` still speak.
 */

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
