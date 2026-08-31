/**
 * Barrel for `@hyperidle/credentials` (core-api Layer, SQL-owning Service).
 *
 * The LLM-key catalog, and nothing else: `server_credentials` read/write/delete
 * plus the one production resolver that decrypts a key by name.
 *
 * Typed functions only. This barrel MUST NOT re-export the raw
 * `serverCredentials` pgTable object — that would let a consumer obtain the
 * table transitively and defeat Table ACL (Mechanism A).
 *
 * @lore AU26 E2 (AU21 Decision J2): this package used to be
 * `layers/core-api/connections` / `@hyperidle/connections` and held BOTH
 * catalogs. `service_connections` left for `layers/agent-orchestration/connections`.
 * `server_credentials` stayed, on J2's consumer-locus argument: its key is
 * resolved on core's OWN call path (model resolution).
 *
 * @lore AU20 Am4: collapsed from 34 to 18 exports. Internalized: getServerSecret,
 * requireServerSecret, deriveKey, held-row query, CLI carrier map, MCP entry shape,
 * ServerCredentialWriteValues, SetCredentialValueInput.
 *
 * @lore AU44 batch2: DbCredentialResolver replaced by resolveCredential (function).
 * updatedAt dropped from CredentialWrite (stamped internally). credential-encryption
 * and resolve-model moved HERE from framework/credential-access (dissolved).
 * migrateCredentialsToStore deleted from settings; seedAnthropicKeyFromEnv lives here.
 */

// -- Cipher (2) — AES-256-GCM encrypt/decrypt (moved from @hyperidle/credential-access) --
export { decryptCredentialValue, encryptCredentialValue } from "./credential-encryption.js";
// -- CredentialResolver (1) — port interface (moved from @hyperidle/credential-access) --
export type { CredentialResolver } from "./credential-resolver.js";
// -- CredentialStore (5) — server_credentials read/write/delete/resolve + seed --
export {
	type CredentialWrite,
	deleteCredential,
	readCredentials,
	resolveCredential,
	writeCredential,
} from "./credential-store.js";
// @lore A `resolveModel` was exported here — the model gateway's answer to
// "which provider, which model, which key". No harness makes a provider call any
// more, so the resolution and the gateway behind it are gone.
