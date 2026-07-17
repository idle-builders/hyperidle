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
import { eq } from "drizzle-orm";
import { decryptCredentialValue } from "./credential-encryption.js";

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
 * Maps credential names to environment variable names.
 * Used by EnvCredentialResolver for local mode.
 *
 * @lore AH1 §3: openai_compatible_api_key is included here for completeness
 * (no env var convention exists for it, but the map must be exhaustive over
 * CredentialName). In practice EnvCredentialResolver is eval-only; production
 * uses DbCredentialResolver exclusively (server-factory.ts AH1 §3).
 */
const ENV_VAR_MAP: Record<CredentialName, string> = {
	anthropic_api_key: "ANTHROPIC_API_KEY",
	openrouter_api_key: "OPENROUTER_API_KEY",
	shared_backend_key: "HYPERIDLE_API_KEY",
	openai_compatible_api_key: "OPENAI_COMPATIBLE_API_KEY",
};

/**
 * Reads from process.env — the default resolver for local mode.
 * In local mode, the desktop main process sets the env vars from safeStorage
 * before booting the server.
 *
 * @lore AH1 §3: RETAINED FOR EVAL-ONLY USE. The eval CI lane reads its LLM key
 * from a CI-secret env var and has no DB. Production server wiring uses
 * DbCredentialResolver exclusively — see server-factory.ts. No production code
 * path instantiates EnvCredentialResolver after AH1.
 */
export class EnvCredentialResolver implements CredentialResolver {
	async resolve(name: CredentialName): Promise<string | null> {
		const envVar = ENV_VAR_MAP[name];
		const value = process.env[envVar];
		return value !== undefined && value !== "" ? value : null;
	}
}

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
