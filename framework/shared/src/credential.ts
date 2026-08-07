/**
 * Credential catalog — shared types for desktop and server packages.
 *
 * @lore P3: The fixed credential catalog lives in @hyperidle/shared so both
 * the desktop (safeStorage) and server (encrypted DB table) can reference the
 * same three canonical credential names. The catalog is intentionally not
 * user-extensible — HyperIdle knows exactly which credentials it needs.
 */

/** The fixed set of credential names. Not user-extensible. */
export const CREDENTIAL_NAMES = [
	"anthropic_api_key",
	"openrouter_api_key",
	"shared_backend_key",
	"openai_compatible_api_key", // AH1: promoted from server_config blob
] as const;

export type CredentialName = (typeof CREDENTIAL_NAMES)[number];

/** Validation state for a credential. */
export const CREDENTIAL_STATES = ["absent", "present_untested", "valid", "invalid"] as const;

export type CredentialState = (typeof CREDENTIAL_STATES)[number];

/** Metadata about each credential in the catalog. */
export interface CredentialCatalogEntry {
	name: CredentialName;
	label: string;
	description: string;
	required: boolean;
	testable: boolean;
}

export const CREDENTIAL_CATALOG: readonly CredentialCatalogEntry[] = [
	{
		name: "anthropic_api_key",
		label: "Anthropic API Key",
		description: "Required for AI agents to run. Starts with 'sk-ant-'.",
		required: false, // System works without it, agents are just inert
		testable: true,
	},
	{
		name: "openrouter_api_key",
		label: "OpenRouter API Key",
		description: "Alternative model provider. Optional.",
		required: false,
		testable: true,
	},
	{
		name: "shared_backend_key",
		label: "Shared Backend API Key",
		description: "Authenticates this client to a shared HyperIdle server.",
		required: false, // Only required when backendMode = "shared"
		testable: true, // Test via health check to remote server
	},
	{
		name: "openai_compatible_api_key",
		label: "OpenAI-compatible API Key",
		description: "API key for any OpenAI-compatible provider (Together, Groq, etc.).",
		required: false,
		testable: true,
	},
] as const;

/** Check if a string is a valid credential name. */
export function isCredentialName(name: string): name is CredentialName {
	return (CREDENTIAL_NAMES as readonly string[]).includes(name);
}

/**
 * Resolves a credential value by name.
 *
 * @lore AU19 Increment 4: reclassified from `layers/core-api/connections/src/
 * credential-resolver.ts` to `@hyperidle/shared` — `harness-registry`'s
 * `cli-harness-adapter.ts` (agent-execution) accepts an injected
 * `CredentialResolver` (never mutating `process.env` directly, P3 Decision 4)
 * but Mechanism B forbids an execution Service depending on `@hyperidle/connections`
 * (a core-api domain Service), even for a type-only reference. `connections`
 * stays the sole owner of the concrete `EnvCredentialResolver`/
 * `DbCredentialResolver` implementations and re-exports this interface
 * unchanged — same cross-boundary-type-lives-in-shared idiom as `HttpError`/
 * `CassetteMissError` (Increment 3h).
 */
export interface CredentialResolver {
	resolve(name: CredentialName): Promise<string | null>;
}
