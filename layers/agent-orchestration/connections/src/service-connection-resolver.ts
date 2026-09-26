/**
 * ResolveHeldToken: per-user plaintext resolver for held connections.
 *
 * The ONLY path that returns a decrypted token value. Wired exclusively to
 * sandbox injection — never to a route response or logger.
 *
 * @lore AN1: Concept hard-rule 1 — this is the ONLY plaintext path.
 * It is the AN2 seam: AN2 injects into the sandbox; AN1 ships + unit-tests it.
 *
 * @lore AN1: Per-user isolation enforced at the query level via AND(id, userId).
 * Cross-user lookup → null (never throws, never leaks existence — concept hard-rule 3).
 *
 * @lore AU44 batch2: ServiceConnectionResolver class deleted; replaced by a plain
 * async function that receives `decrypt` as a parameter (no more importing
 * @hyperidle/credential-access from this layer). The decrypt function is threaded
 * from AgentOrchestrationBootOptions → boot → connections route/provisioner.
 */

import { type HyperIdleDb, serviceConnections } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";

/**
 * Resolve the plaintext token for a held token connection.
 *
 * Returns the decrypted token for the OWNING USER only.
 * Returns null for:
 *   - cross-user / non-existent connection (never leaks existence)
 *   - mcp connections (no stored token)
 *   - missing server secret (decrypt returns null)
 *   - decryption failure (tampered / wrong key)
 *
 * Never throws.
 */
export async function resolveHeldToken(
	db: HyperIdleDb,
	userId: string,
	connectionId: string,
	decrypt: (ciphertext: string) => string | null,
): Promise<string | null> {
	try {
		const [row] = await db
			.select()
			.from(serviceConnections)
			.where(and(eq(serviceConnections.id, connectionId), eq(serviceConnections.userId, userId)))
			.limit(1);

		if (!row) return null;
		// mcp connections have no stored token
		if (row.authSource !== "token" || !row.encryptedToken) return null;

		// decrypt returns null if no root secret or decryption fails
		return decrypt(row.encryptedToken);
	} catch {
		// Never throw — always return null on any error
		return null;
	}
}
