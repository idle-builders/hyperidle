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
 * @lore X4 A-TYPE-1: apiKey is included here (as optional) even though it is
 * a storage concern rather than a pure domain concern. The alternative was a
 * separate StoredModelTierConfig type, but that would require two parallel type
 * trees and make the code harder to follow. apiKey is only populated for
 * "openai-compatible" providers — the GET endpoint always strips it and returns
 * hasApiKey: boolean instead (A-SEC-2).
 */
export interface ModelTierConfig {
	readonly provider: ModelProvider;
	readonly model: string;
	/** Only used for "openai-compatible" provider. Ignored for anthropic/openrouter. */
	readonly baseUrl?: string;
	/**
	 * API key for "openai-compatible" providers only.
	 * Stored in serverConfig JSON — NOT in the encrypted credential catalog.
	 *
	 * @lore X4 A-SEC-3: openai-compatible API keys are stored as plain JSON in
	 * serverConfig (server_config.config TEXT column), not in the encrypted
	 * server_credentials table. In local mode, the SQLite file has filesystem-
	 * level protection. In shared mode, anyone with DB access can read this key.
	 * This is a known gap for v1 — a follow-up should add dynamic credential
	 * catalog entries or encrypt the serverConfig blob.
	 */
	readonly apiKey?: string;
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
