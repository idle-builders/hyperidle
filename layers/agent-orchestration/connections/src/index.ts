/**
 * Barrel for `@hyperidle/connections` — the agent-orchestration Layer's `service_connections` Service.
 * Must NOT re-export the raw pgTable object (defeats Table ACL).
 */

// -- Cipher (2) — AES-256-GCM encrypt/decrypt for connection tokens --
export { decryptCredentialValue, encryptCredentialValue } from "./token-cipher.js";
// -- Connection vocabulary: InheritedConnectionFact --
export type { InheritedConnectionFact } from "./types.js";

// -- Provisioning read — callers use listConnections({ userId, authSource }) directly --

// -- Inherited reach — the domain's own probe + cache --
export {
	createInheritedReach,
	type InheritedProbeDeps,
	type InheritedReach,
} from "./inherited-reach.js";
// -- resolveHeldToken — sole decrypted-held-token path --
export { resolveHeldToken } from "./service-connection-resolver.js";
// -- ConnectionStore (4) — service_connections list/insert/update/delete --
export {
	deleteConnection,
	insertConnection,
	listConnections,
	listWithholds,
	setWithhold,
	updateConnection,
} from "./service-connection-store.js";
