/**
 * Barrel for `@hyperidle/connections` — the agent-orchestration Layer's
 * SQL-owning `service_connections` Service.
 *
 * Typed functions only. This barrel MUST NOT re-export the raw
 * `serviceConnections` pgTable object — that would let a consumer obtain the
 * table transitively and defeat Table ACL (Mechanism A). This package is the
 * sole importer of that table, and `tools/governance/table-owners.json` names it the
 * owner. It does NOT own `server_credentials` — that table belongs to
 * `@hyperidle/credentials`.
 *
 * @lore AU26 E2 (AU21 Decision J2/J3): this package is the destination half of
 * the connections relocation. `service_connections` is agent-session-
 * provisioning domain, not core domain.
 *
 * @lore AU44 batch2: ServiceConnectionResolver class deleted; replaced by
 * resolveHeldToken function (no class overhead, decrypt injected as param).
 * projectInheritedConnections deleted; logic folded into InheritedReach.list().
 * listHeldConnectionsForProvisioning deleted; callers use listConnections directly.
 */

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
// -- resolveConnectionToken (BA5 §2.4) — resolves AS THE CONNECTION'S OWNER, no caller userId --
export { resolveConnectionToken, resolveHeldToken } from "./service-connection-resolver.js";
// -- ConnectionStore (3) — service_connections list/insert/delete --
export { deleteConnection, insertConnection, listConnections } from "./service-connection-store.js";
