/**
 * Barrel for @hyperidle/connections (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw
 * `serverCredentials`/`serviceConnections` pgTable objects — that would let a
 * consumer obtain the table transitively and defeat Table ACL (Mechanism A).
 * Consumers get typed functions; the tables stay private to this Service.
 *
 * @lore AU19 Increment 1h: this is the real cut-over — `connection-provisioning.ts`,
 * `credential-encryption.ts`, `credential-resolver.ts`,
 * `service-connection-projection.ts`, `service-connection-resolver.ts` moved
 * here from `packages/server/src/services/` unchanged (behavior-preserving
 * move, aside from `connection-provisioning.ts`'s DI-port signature addition
 * documented in `ports.ts`). The one real outbound edge (`users`) became an
 * injected DI port (Mechanism C, see `ports.ts`).
 */

// -- connection provisioning (AN2 — spawn-time re-apply of held connections) --
export {
	applyProvisioningPlan,
	buildProvisioningPlan,
	listActiveHeld,
	type ProvisioningPlan,
	type ResolvedMcpServer,
	resolveOwningHumanUserId,
	SERVICE_CLI_ENV,
} from "./connection-provisioning.js";
// -- credential encryption (AES-256-GCM, HKDF key derivation) --
export {
	decryptCredentialValue,
	deriveKey,
	encryptCredentialValue,
	getServerSecret,
	requireServerSecret,
} from "./credential-encryption.js";
// -- credential resolver (CredentialResolver interface + implementations) --
export {
	type CredentialResolver,
	DbCredentialResolver,
	EnvCredentialResolver,
} from "./credential-resolver.js";
// -- credential store (server_credentials CRUD — closes the settings/notifications forward-refs) --
export {
	deleteCredentialByName,
	findCredentialByName,
	insertCredential,
	type ServerCredentialWriteValues,
	upsertCredential,
} from "./credential-store.js";
// -- DI ports (Mechanism C) --
export type { ConnectionsUserReader } from "./ports.js";
// -- service connection projection (AN1 — inherited connections, in-memory) --
export { projectInheritedConnections } from "./service-connection-projection.js";
// -- service connection resolver (AN1 — per-user plaintext token resolver) --
export { ServiceConnectionResolver } from "./service-connection-resolver.js";
