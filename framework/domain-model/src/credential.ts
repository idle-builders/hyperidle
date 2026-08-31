/**
 * Credential catalog — shared types for desktop and server packages.
 *
 * @lore P3: The fixed credential catalog lives in @hyperidle/domain-model so both
 * the desktop (safeStorage) and server (encrypted DB table) can reference the
 * same canonical credential names. The catalog is intentionally not
 * user-extensible — HyperIdle knows exactly which credentials it needs.
 *
 * @lore There were four. Three were model-provider keys — anthropic, openrouter,
 * openai-compatible — held so the built-in harness could call a provider API,
 * and later so a stored key could be injected into a harness subprocess. Neither
 * happens any more: a harness is what a person brings, and it authenticates with
 * its own login. HyperIdle stores no model credential, so the catalog is down to
 * the one secret that is genuinely ours to hold — the key a remote worker
 * presents to reach this server. `CREDENTIAL_BY_PROVIDER` and
 * `credentialNameForProvider` went with the three.
 */

/** The fixed set of credential names. Not user-extensible. */
export const CREDENTIAL_NAMES = ["shared_backend_key"] as const;

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
		name: "shared_backend_key",
		label: "Shared Backend API Key",
		description: "Authenticates this client to a shared HyperIdle server.",
		required: false, // Only required when backendMode = "shared"
		testable: true, // Test via health check to remote server
	},
] as const;

/** Check if a string is a valid credential name. */
export function isCredentialName(name: string): name is CredentialName {
	return (CREDENTIAL_NAMES as readonly string[]).includes(name);
}
