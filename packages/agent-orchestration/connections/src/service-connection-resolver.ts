/**
 * AN1 — ServiceConnectionResolver: per-user plaintext resolver for held connections.
 *
 * The ONLY path that returns a decrypted token value. Wired exclusively to
 * sandbox injection (AN2) — never to a route response or logger.
 *
 * @lore AN1: Concept hard-rule 1 — the resolver is the ONLY plaintext path.
 * It is the AN2 seam: AN2 injects into the sandbox; AN1 ships + unit-tests it.
 *
 * @lore AN1: Reuses `decryptCredentialValue` from credential-encryption.ts verbatim.
 * No forked crypto — the infra key derivation (HKDF-SHA256 AES-256-GCM) is shared.
 *
 * @lore AN1: Per-user isolation enforced at the query level via AND(id, userId).
 * Cross-user lookup → null (never throws, never leaks existence — concept hard-rule 3).
 *
 * @lore AU20 Am4: Constructor no longer accepts serverSecret — decryptCredentialValue
 * reads the root secret from env internally. Callers construct new ServiceConnectionResolver(db).
 */

import { type HyperIdleDb, serviceConnections } from "@hyperidle/db";
import { decryptCredentialValue } from "@hyperidle/shared/crypto";
import { and, eq } from "drizzle-orm";

export class ServiceConnectionResolver {
	constructor(private readonly db: HyperIdleDb) {}

	/**
	 * Resolve the plaintext token for a held token connection.
	 *
	 * Returns the decrypted token for the OWNING USER only.
	 * Returns null for:
	 *   - cross-user / non-existent connection (AC5 — never leaks existence)
	 *   - mcp connections (no stored token)
	 *   - missing server secret (decryptCredentialValue returns null)
	 *   - decryption failure (tampered / wrong key)
	 *
	 * Never throws.
	 */
	async resolve(userId: string, connectionId: string): Promise<string | null> {
		try {
			const [row] = await this.db
				.select()
				.from(serviceConnections)
				.where(and(eq(serviceConnections.id, connectionId), eq(serviceConnections.userId, userId)))
				.limit(1);

			if (!row) return null;
			// mcp connections have no stored token
			if (row.authSource !== "token" || !row.encryptedToken) return null;

			// decryptCredentialValue returns null if no root secret or decryption fails
			return decryptCredentialValue(row.encryptedToken);
		} catch {
			// Never throw — always return null on any error
			return null;
		}
	}
}
