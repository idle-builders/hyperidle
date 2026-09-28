/**
 * Sole plaintext resolver for held connections. Wired exclusively to sandbox injection.
 * @lore: per-user isolation — query enforces AND(id, userId); cross-user lookup returns null (never throws, never leaks existence)
 * @lore: decrypt injected as param — threaded from boot options so this package never imports credential-access
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
		if (row.authSource !== "token" || !row.encryptedToken) return null;

		return decrypt(row.encryptedToken);
	} catch {
		return null;
	}
}
