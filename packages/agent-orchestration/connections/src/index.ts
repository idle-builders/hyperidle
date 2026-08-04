/**
 * Barrel for `@hyperidle/connections` — the agent-orchestration Layer's
 * SQL-owning `service_connections` Service.
 *
 * Typed functions and classes only. This barrel MUST NOT re-export the raw
 * `serviceConnections` pgTable object — that would let a consumer obtain the
 * table transitively and defeat Table ACL (Mechanism A). This package is the
 * sole importer of that table; `scripts/table-ownership-guard.ts`'s
 * `TABLE_OWNER` names it.
 *
 * @lore AU26 E2 (AU21 Decision J2/J3): this package is the destination half of
 * the connections relocation. `service_connections` is agent-session-
 * provisioning domain, not core domain (AU21 Decision J1) — core-api only ever
 * let a human administer the record, it never operationally consumed it. The
 * source half, `packages/core-api/connections`, is renamed to
 * `@hyperidle/credentials` in the same commit and keeps ONLY the LLM-key
 * catalog (`server_credentials`), which genuinely stays core-side on J2's
 * consumer-locus argument.
 *
 * The four modules here moved VERBATIM out of the old core package — no
 * behaviour change in E2, only a change of ACL-holder. E3 then moves the
 * provisioning read in-layer and deletes AU21 K1's bake-at-emit mechanism.
 *
 * Mechanism C: this Service depends on `@hyperidle/db` + `@hyperidle/shared`
 * only. It never imports another Service, in either Layer — which is why the
 * AES-GCM cipher it decrypts held tokens with lives at
 * `@hyperidle/shared/crypto` (AU26 E1 / AU21 J1), not in a core Service.
 */

// -- Emit-time bake helper (1) — AU21 K1; deleted by AU26 E3 --
export {
	type InjectedConnectionForAgent,
	type InjectedConnectionsForAgent,
	resolveInjectedConnectionsForAgent,
} from "./resolve-injected-connections-for-agent.js";
// -- In-memory projection (1) — inherited connections from harness descriptors --
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
