/**
 * AN1 — ServiceConnectionResolver.
 *
 * Server-side resolver for the open per-(user × service) connection set.
 * Returns the plaintext token for a stored token connection (decrypted), or
 * null for: absent row, deleted row, cross-user access, missing server secret.
 *
 * @lore AN1: PARALLEL to CredentialResolver (which reads serverCredentials —
 * the closed catalog). This resolver reads serviceConnections — the open set.
 * Same encryption primitive (decryptCredentialValue), distinct interface and
 * table. The contract: the broker (AN2) calls resolve(userId, connectionId);
 * if null, the broker has no credential and refuses the tool call.
 *
 * @lore AN1: Per-user isolation is enforced by scoping the query on BOTH id AND
 * userId. A cross-user lookup returns null (same as absent), never leaks
 * the token or signals existence to the attacker.
 */

import { type HyperIdleDb, serviceConnections } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import { decryptCredentialValue } from "./credential-encryption.js";

/**
 * Resolve a service connection's token server-side.
 *
 * Consumed by AN2's broker to attach a credential at brokered-call time.
 * AN1 proves the resolver-null seam (test 3); AN2 proves the agent-refused end.
 */
export class ServiceConnectionResolver {
	constructor(
		private readonly db: HyperIdleDb,
		private readonly serverSecret: string | null,
	) {}

	/**
	 * Resolve the plaintext token for a token-source connection.
	 *
	 * Returns:
	 *   - plaintext token string: row found, authSource="token", decryption succeeded
	 *   - null: row absent, wrong userId (cross-user), missing server secret, or
	 *           authSource is not "token" (mcp-oauth has no stored token in AN1)
	 *
	 * @lore AN1: null means "no credential available" — the broker refuses the call.
	 * Never throws; errors return null so callers have a clean seam.
	 */
	async resolve(userId: string, connectionId: string): Promise<string | null> {
		if (!this.serverSecret) return null; // No secret → cannot decrypt

		const [row] = await this.db
			.select()
			.from(serviceConnections)
			.where(and(eq(serviceConnections.id, connectionId), eq(serviceConnections.userId, userId)))
			.limit(1);

		if (!row) return null;
		if (!row.encryptedToken) return null; // mcp-oauth: service holds the token

		return decryptCredentialValue(row.encryptedToken, this.serverSecret);
	}
}
