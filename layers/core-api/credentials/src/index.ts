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
 * catalogs. `service_connections` — its CRUD, its held-token resolver, its
 * inherited projection — left for `layers/agent-orchestration/connections`,
 * because core never operationally consumed a Connection; it only let a human
 * administer one. `server_credentials` stayed, on J2's consumer-locus
 * argument: its key is resolved on core's OWN call path (model resolution), so
 * moving it would invert a clean edge to fix nothing. The package is now named
 * for what it actually holds.
 *
 * @lore AU20 Am4: collapsed from 34 to 18 exports (the pre-split count).
 * Internalized: getServerSecret, requireServerSecret, deriveKey,
 *   held-row query, CLI carrier map, MCP entry shape,
 *   ServerCredentialWriteValues, SetCredentialValueInput.
 * Collapsed: 9 credential-row accessors → readCredentials/writeCredential/deleteCredential;
 *   5 encryption exports → encryptCredentialValue/decryptCredentialValue (no secret param);
 *   DbCredentialResolver constructor simplified (no serverSecret arg).
 *
 * @lore AU26 E1 (AU21 J1): `encryptCredentialValue`/`decryptCredentialValue`
 * are NOT here. The AES-256-GCM cipher is a primitive, not a Service member: it
 * reads no table, holds no db handle, and both Layers need it. It lives at
 * `@hyperidle/credential-access` and every caller imports it from there —
 * deliberately NOT re-exported here, so this Service does not become a second,
 * competing source of truth for it.
 */

// -- CredentialResolver family (1) — the DB implementation --
// @lore AU20 R-connections: EnvCredentialResolver relocated to tools/eval (eval-only
// fixture, AH1 §3). Production barrel exports only DbCredentialResolver.
// @lore AU34: the `CredentialResolver` interface itself is no longer republished here. This service
// implements the port; it does not own it, and republishing it handed a narrow-audience name to
// anyone who could name this service. Its two production readers name the declaring package.
export { DbCredentialResolver } from "./credential-resolver.js";

// -- CredentialStore (4) — server_credentials read/write/delete + patch type --
export {
	type CredentialWrite,
	deleteCredential,
	readCredentials,
	writeCredential,
} from "./credential-store.js";
