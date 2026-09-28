/**
 * The model providers HyperIdle knows by name.
 * "anthropic" = direct Anthropic Messages API
 * "openrouter" = OpenRouter (OpenAI-compatible with extensions)
 * "openai-compatible" = any OpenAI-compatible endpoint (Together, Groq, etc.)
 *
 * @lore: ModelProvider — closed union (3 values); adding a provider requires a code change because each has different request/response normalization needs
 */
export const MODEL_PROVIDERS = ["anthropic", "openrouter", "openai-compatible"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];
