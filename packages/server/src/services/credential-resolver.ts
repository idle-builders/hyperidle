/**
 * CredentialResolver interface and implementations.
 *
 * @lore P3: Decision 4 — inject a resolver into the harness adapter rather
 * than mutating process.env. In local mode, desktop sets env vars before
 * server boot (existing pattern). In shared mode, the DbCredentialResolver
 * reads from the encrypted server_credentials table.
 */

import { type HyperIdleDb, serverCredentials } from "@hyperidle/db";
import type { CredentialName } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { decryptCredentialValue } from "./credential-encryption.js";

/** Resolves a credential value by name. */
export interface CredentialResolver {
	resolve(name: CredentialName): Promise<string | null>;
}

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
 * Decrypts using the server secret (HYPERIDLE_CREDENTIAL_KEY or HYPERIDLE_API_KEY).
 *
 * @lore AH1 §3: This is the ONLY production credential resolver. server-factory.ts
 * wires this with getServerSecret() (nullable). When the secret is null, every
 * resolve() call returns null → MissingCredentialError downstream. This is correct:
 * a missing secret means agents cannot run, but the server still boots.
 */
export class DbCredentialResolver implements CredentialResolver {
	constructor(
		private readonly db: HyperIdleDb,
		private readonly serverSecret: string | null,
	) {}

	async resolve(name: CredentialName): Promise<string | null> {
		if (!this.serverSecret) return null; // No secret → cannot decrypt
		const [row] = await this.db
			.select()
			.from(serverCredentials)
			.where(eq(serverCredentials.name, name))
			.limit(1);

		if (!row) return null;
		return decryptCredentialValue(row.encryptedValue, this.serverSecret);
	}
}
