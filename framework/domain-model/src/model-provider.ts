/**
 * The model providers HyperIdle knows by name.
 * "anthropic" = direct Anthropic Messages API
 * "openrouter" = OpenRouter (OpenAI-compatible with extensions)
 * "openai-compatible" = any OpenAI-compatible endpoint (Together, Groq, etc.)
 *
 */
export const MODEL_PROVIDERS = ["anthropic", "openrouter", "openai-compatible"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];
