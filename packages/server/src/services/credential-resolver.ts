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
 */
const ENV_VAR_MAP: Record<CredentialName, string> = {
	anthropic_api_key: "ANTHROPIC_API_KEY",
	openrouter_api_key: "OPENROUTER_API_KEY",
	shared_backend_key: "HYPERIDLE_API_KEY",
};

/**
 * Reads from process.env — the default resolver for local mode.
 * In local mode, the desktop main process sets the env vars from safeStorage
 * before booting the server.
 */
export class EnvCredentialResolver implements CredentialResolver {
	async resolve(name: CredentialName): Promise<string | null> {
		const envVar = ENV_VAR_MAP[name];
		const value = process.env[envVar];
		return value !== undefined && value !== "" ? value : null;
	}
}

/**
 * Reads from the encrypted server_credentials table — used in shared mode.
 * Decrypts using the server secret (HYPERIDLE_CREDENTIAL_KEY or HYPERIDLE_API_KEY).
 */
export class DbCredentialResolver implements CredentialResolver {
	constructor(
		private readonly db: HyperIdleDb,
		private readonly serverSecret: string,
	) {}

	async resolve(name: CredentialName): Promise<string | null> {
		const [row] = await this.db
			.select()
			.from(serverCredentials)
			.where(eq(serverCredentials.name, name))
			.limit(1);

		if (!row) return null;
		return decryptCredentialValue(row.encryptedValue, this.serverSecret);
	}
}
