/**
 * Barrel for `@hyperidle/connections` — the agent-orchestration Layer's
 * SQL-owning `service_connections` Service.
 *
 * Typed functions and classes only. This barrel MUST NOT re-export the raw
 * `serviceConnections` pgTable object — that would let a consumer obtain the
 * table transitively and defeat Table ACL (Mechanism A). This package is the
 * sole importer of that table, and `tools/governance/table-owners.json` names it the
 * owner. It does NOT own `server_credentials` — that table belongs to
 * `@hyperidle/credentials`, as the next paragraph's consumer-locus argument
 * already said and the registry now agrees.
 *
 * @lore AU26 E2 (AU21 Decision J2/J3): this package is the destination half of
 * the connections relocation. `service_connections` is agent-session-
 * provisioning domain, not core domain (AU21 Decision J1) — core-api only ever
 * let a human administer the record, it never operationally consumed it. The
 * source half, `layers/core-api/connections`, is renamed to
 * `@hyperidle/credentials` in the same commit and keeps ONLY the LLM-key
 * catalog (`server_credentials`), which genuinely stays core-side on J2's
 * consumer-locus argument.
 *
 * The store, the resolver and the projection moved VERBATIM out of the old core
 * package in E2 — a change of ACL-holder, not of behaviour.
 *
 * @lore AU26 E3: the provisioning read is now in-layer and AU21 K1's
 * bake-at-emit helper is DELETED. `listHeldConnectionsForProvisioning` is what
 * a spawn calls; nothing about connections rides an emitted intent any more, so
 * there is no snapshot left to go stale between emit and drain (AC1(c)).
 *
 * Mechanism C: this Service depends on `@hyperidle/db` + framework packages
 * only. It never imports another Service, in either Layer — which is why the
 * AES-GCM cipher it decrypts held tokens with lives at
 * `@hyperidle/credential-access` (AU26 E1 / AU21 J1), not in a core Service, and
 * why the spawn-time read resolves each row against the owner the row itself
 * carries rather than reading core-api's `users`.
 */

// -- Provisioning read (2) — the live, in-layer spawn-time read (AU26 E3) --
export { listHeldConnectionsForProvisioning } from "./held-connections-for-provisioning.js";
// -- Inherited reach (AU36 D1) — the domain's own probe + cache --
export {
	createInheritedReach,
	type InheritedProbeDeps,
	type InheritedReach,
} from "./inherited-reach.js";
// -- In-memory projection (1) — inherited connections from reach facts --
export { projectInheritedConnections } from "./service-connection-projection.js";
// -- ServiceConnectionResolver (1) — sole decrypted-held-token path --
export { ServiceConnectionResolver } from "./service-connection-resolver.js";
// -- ConnectionStore (4) — service_connections list/insert/update/delete --
export {
	deleteConnection,
	insertConnection,
	listConnections,
	updateConnection,
} from "./service-connection-store.js";
