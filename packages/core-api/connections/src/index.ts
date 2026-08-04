/**
 * Barrel for @hyperidle/connections (core-api Layer, SQL-owning Service).
 *
 * ~11 exports — two symmetric store surfaces (credential + connection),
 * a secret vault whose key never leaves this service, resolver strategies.
 *
 * Typed functions only. This barrel MUST NOT re-export the raw
 * `serverCredentials`/`serviceConnections` pgTable objects — that would let a
 * consumer obtain the table transitively and defeat Table ACL (Mechanism A).
 * Consumers get typed functions; the tables stay private to this Service.
 *
 * @lore AU20 Am4: collapsed from 34 to 18 exports.
 * Internalized: getServerSecret, requireServerSecret, deriveKey,
 *   held-row query, CLI carrier map, MCP entry shape,
 *   ServerCredentialWriteValues, SetCredentialValueInput.
 * Collapsed: 9 credential-row accessors → readCredentials/writeCredential/deleteCredential;
 *   7 service-connection accessors → listConnections/insertConnection/updateConnection/deleteConnection;
 *   5 encryption exports → encryptCredentialValue/decryptCredentialValue (no secret param);
 *   DbCredentialResolver/ServiceConnectionResolver constructors simplified (no serverSecret arg).
 *
 * @lore AU19 Increment 1h: original move of connection-provisioning.ts,
 * credential-encryption.ts, credential-resolver.ts,
 * service-connection-projection.ts, service-connection-resolver.ts from
 * packages/server/src/services/ (behavior-preserving move).
 *
 * @lore AU21 §9 Increment 8 (Decision F2, historical): `applyProvisioningPlan`/
 * `buildProvisioningPlan`/`ProvisioningPlan` relocated OUT of this barrel
 * entirely — the session-launch-time provisioning OPERATION lives in
 * `@hyperidle/run-orchestration` (`connection-provisioning.ts`). F2 originally
 * had it read the held-connection RECORD through `CoreApiPort.connections.
 * listHeldConnectionsForProvisioning()` — a live seam call at provisioning
 * time.
 *
 * @lore AU21 §9 Increment 12 follow-up part 2 (F2 gap closure): that seam
 * call is GONE — the SAME class of gap `resolveInjectedFilesystemsForAgent`
 * already closed for filesystems. `resolveInjectedConnectionsForAgent`
 * (below) is the new shared helper every per-kind emit-time resolver calls to
 * BAKE the held-connection record onto the request at emit time instead. The
 * `GET /connections/provisioning` route and `CoreApiPort.connections` are
 * both deleted (zero remaining callers). This Service keeps ONLY the record
 * CRUD (`listConnections`/`insertConnection`/`updateConnection`/
 * `deleteConnection`) + the decrypt primitives + this new bake helper —
 * never the provisioning operation itself.
 */

// -- A. (was the cipher) --
// @lore AU26 E1 (J1): `encryptCredentialValue`/`decryptCredentialValue` are GONE
// from this barrel. The AES-256-GCM cipher is a primitive, not a Service member:
// it reads no table, holds no db handle, and both applications need it. It now
// lives at `@hyperidle/shared/crypto` and every caller imports it from there —
// deliberately NOT re-exported here, so this Service does not become a second,
// competing source of truth for it.
// -- B. CredentialResolver family (2) — resolver interface + DB implementation --
// @lore AU20 R-connections: EnvCredentialResolver relocated to packages/eval (eval-only
// fixture, AH1 §3). Production barrel exports only DbCredentialResolver.
export {
	type CredentialResolver,
	DbCredentialResolver,
} from "./credential-resolver.js";

// -- D. CredentialStore (4) — server_credentials read/write/delete + patch type --
export {
	type CredentialWrite,
	deleteCredential,
	readCredentials,
	writeCredential,
} from "./credential-store.js";
// -- H. Emit-time bake helper (1) — AU21 Increment 12 follow-up part 2 --
export {
	type InjectedConnectionForAgent,
	type InjectedConnectionsForAgent,
	resolveInjectedConnectionsForAgent,
} from "./resolve-injected-connections-for-agent.js";
// -- G. In-memory projection (1) — inherited connections from harness descriptors --
export { projectInheritedConnections } from "./service-connection-projection.js";
// -- C. ServiceConnectionResolver (1) — sole decrypted-held-token path --
export { ServiceConnectionResolver } from "./service-connection-resolver.js";
// -- E. ConnectionStore (4) — service_connections list/insert/update/delete --
export {
	deleteConnection,
	insertConnection,
	listConnections,
	updateConnection,
} from "./service-connection-store.js";
