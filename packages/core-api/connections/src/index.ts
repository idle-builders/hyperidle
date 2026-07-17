/**
 * Barrel for @hyperidle/connections (core-api Layer, SQL-owning Service).
 *
 * ~18 exports — two symmetric store surfaces (credential + connection),
 * a secret vault whose key never leaves this service, resolver strategies,
 * and the provisioning plan seam.
 *
 * Typed functions only. This barrel MUST NOT re-export the raw
 * `serverCredentials`/`serviceConnections` pgTable objects — that would let a
 * consumer obtain the table transitively and defeat Table ACL (Mechanism A).
 * Consumers get typed functions; the tables stay private to this Service.
 *
 * @lore AU20 Am4: collapsed from 34 to 18 exports.
 * Internalized: getServerSecret, requireServerSecret, deriveKey,
 *   listActiveHeld, SERVICE_CLI_ENV, ResolvedMcpServer,
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
 */

// -- F. Provisioning (4) — build + apply plan + resolve owner + plan type --
export {
	applyProvisioningPlan,
	buildProvisioningPlan,
	type ProvisioningPlan,
	resolveOwningHumanUserId,
} from "./connection-provisioning.js";
// -- A. Cipher (2) — encrypt/decrypt; cipher owns the key (no secret param) --
export { decryptCredentialValue, encryptCredentialValue } from "./credential-encryption.js";
// -- B. CredentialResolver family (3) — resolver interface + implementations --
export {
	type CredentialResolver,
	DbCredentialResolver,
	EnvCredentialResolver,
} from "./credential-resolver.js";

// -- D. CredentialStore (4) — server_credentials read/write/delete + patch type --
export {
	type CredentialWrite,
	deleteCredential,
	readCredentials,
	writeCredential,
} from "./credential-store.js";
// -- H. DI port (1) — plumbing type for composition root --
export type { ConnectionsUserReader } from "./ports.js";
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
