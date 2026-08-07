/**
 * CredentialResolver interface and implementations.
 *
 * @lore P3: Decision 4 — inject a resolver into the harness adapter rather
 * than mutating process.env. In local mode, desktop sets env vars before
 * server boot (existing pattern). In shared mode, the DbCredentialResolver
 * reads from the encrypted server_credentials table.
 *
 * @lore AU20 Am4: DbCredentialResolver constructor no longer takes serverSecret.
 * The cipher (decryptCredentialValue) owns the key lookup; the resolver just
 * provides the DB read. Callers at the composition root construct
 * new DbCredentialResolver(db) and the decrypt step reads from env internally.
 */

import { type HyperIdleDb, serverCredentials } from "@hyperidle/db";
import type { CredentialName, CredentialResolver } from "@hyperidle/shared";
import { decryptCredentialValue } from "@hyperidle/shared/crypto";
// @lore AU20 R-connections: EnvCredentialResolver relocated to tools/eval (eval-only fixture).
// Production vault exports only DbCredentialResolver.
import { eq } from "drizzle-orm";

/**
 * Resolves a credential value by name.
 *
 * @lore AU19 Increment 4: reclassified to `@hyperidle/shared` (re-exported
 * here unchanged) — `harness-registry` (agent-execution) needs the interface
 * type to accept an injected resolver, and Mechanism B forbids it depending
 * on `@hyperidle/connections`. This Service stays the sole owner of the
 * concrete `EnvCredentialResolver`/`DbCredentialResolver` implementations.
 */
export type { CredentialResolver } from "@hyperidle/shared";

/**
 * Reads from the encrypted server_credentials table.
 * Decrypts using the server secret sourced from the cipher (env vars).
 *
 * @lore AH1 §3: This is the ONLY production credential resolver. server-factory.ts
 * wires this as new DbCredentialResolver(db). When no root secret is set,
 * decryptCredentialValue returns null → resolve() returns null →
 * MissingCredentialError downstream. Boot remains non-fatal.
 *
 * @lore AU20 Am4: Constructor no longer accepts serverSecret — the cipher
 * (encryptCredentialValue / decryptCredentialValue) owns the key. This removes
 * the need for callers to import getServerSecret from @hyperidle/connections.
 */
export class DbCredentialResolver implements CredentialResolver {
	constructor(private readonly db: HyperIdleDb) {}

	async resolve(name: CredentialName): Promise<string | null> {
		const [row] = await this.db
			.select()
			.from(serverCredentials)
			.where(eq(serverCredentials.name, name))
			.limit(1);

		if (!row) return null;
		// decryptCredentialValue returns null when no root secret is set —
		// graceful degradation posture (boot non-fatal).
		return decryptCredentialValue(row.encryptedValue);
	}
}
