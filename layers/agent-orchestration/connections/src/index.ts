/**
 * Barrel for `@hyperidle/connections` — the agent-orchestration Layer's
 * SQL-owning `service_connections` Service.
 *
 * Typed functions only. This barrel MUST NOT re-export the raw
 * `serviceConnections` pgTable object — that would let a consumer obtain the
 * table transitively and defeat Table ACL (Mechanism A). This package is the
 * sole importer of that table, and `tools/governance/table-owners.json` names it the
 * owner.
 *
 * @lore AU26 E2 (AU21 Decision J2/J3): this package is the destination half of
 * the connections relocation. `service_connections` is agent-session-
 * provisioning domain, not core domain.
 *
 * @lore AU44 batch2: ServiceConnectionResolver class deleted; replaced by
 * resolveHeldToken function (no class overhead, decrypt injected as param).
 * projectInheritedConnections deleted; logic folded into InheritedReach.list().
 * listHeldConnectionsForProvisioning deleted; callers use listConnections directly.
 *
 * @lore token-cipher: `server_credentials` and the package that owned it
 * (`@hyperidle/credentials`) are deleted — the shared-backend key now lives
 * only in the desktop keychain. The AES-256-GCM cipher that package also held
 * encrypts CONNECTION tokens too, and this is its only production consumer
 * left, so it moved here verbatim rather than going with the rest of the
 * deleted package.
 */

// -- Cipher (2) — AES-256-GCM encrypt/decrypt for connection tokens --
export { decryptCredentialValue, encryptCredentialValue } from "./token-cipher.js";
// -- Connection vocabulary (AU44-b8): InheritedConnectionFact moved from domain-model --
// @lore AU44-b8: HeldAuthSource/HELD_AUTH_SOURCES survivor in domain-model (service→service crossing).
export type { InheritedConnectionFact } from "./types.js";

// -- Provisioning read — callers use listConnections({ userId, authSource }) directly --
// (listHeldConnectionsForProvisioning deleted; @lore AU44 batch2)

// -- Inherited reach (AU36 D1) — the domain's own probe + cache --
export {
	createInheritedReach,
	type InheritedProbeDeps,
	type InheritedReach,
} from "./inherited-reach.js";
// -- resolveHeldToken (1) — sole decrypted-held-token path (replaces ServiceConnectionResolver) --
export { resolveHeldToken } from "./service-connection-resolver.js";
// -- ConnectionStore (4) — service_connections list/insert/update/delete --
export {
	deleteConnection,
	insertConnection,
	listConnections,
	updateConnection,
} from "./service-connection-store.js";
