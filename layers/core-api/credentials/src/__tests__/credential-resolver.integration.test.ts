/**
 * P3 RED — Credential resolver interface and implementations (AC-15)
 *
 * AC coverage (DbCredentialResolver only; EnvCredentialResolver relocated to tools/eval):
 *  - DbCredentialResolver.resolve("anthropic_api_key") reads and decrypts from DB
 *  - DbCredentialResolver.resolve for absent credential returns null
 *  - DbCredentialResolver decrypts with the correct server secret (env-based, no-arg API)
 *
 * @lore AU20 Am4: DbCredentialResolver no longer takes serverSecret; it reads
 * HYPERIDLE_CREDENTIAL_KEY from env via decryptCredentialValue. Tests stub the env
 * variable in beforeEach to supply the secret.
 * @lore AU20 R-connections: EnvCredentialResolver moved to tools/eval (eval-only fixture).
 * Its behavior tests follow it there.
 */

import { encryptCredentialValue } from "@hyperidle/credential-access";
import type { HyperIdleDb } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { DbCredentialResolver } from "../credential-resolver.js";

const SERVER_SECRET = "test-server-secret-resolver-au20";
const WRONG_SECRET = "wrong-server-secret-resolver-au20";

/**
 * @lore AU38: `server_credentials.name` is a production-fixed catalog PK
 * (anthropic_api_key | openrouter_api_key | shared_backend_key) — it cannot
 * be scoped per test. In a populated world the row for a catalog name may
 * already exist (other files write the same names), so arrange per test:
 * upsert to own the value, delete to own the absence. Mirrors production's
 * upsert / absent-only write semantics (credential-store.ts, server-config.ts).
 */
async function upsertCredential(
	db: HyperIdleDb,
	name: string,
	encryptedValue: string,
	validationState: string,
): Promise<void> {
	const now = new Date().toISOString();
	await db.execute(
		`INSERT INTO server_credentials (name, encrypted_value, validation_state, updated_at)
		 VALUES ('${name}', '${encryptedValue}', '${validationState}', '${now}')
		 ON CONFLICT (name) DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value,
		 validation_state = EXCLUDED.validation_state, updated_at = EXCLUDED.updated_at`,
	);
}

async function deleteCredentialRow(db: HyperIdleDb, name: string): Promise<void> {
	await db.execute(`DELETE FROM server_credentials WHERE name = '${name}'`);
}

describe("CredentialResolver interface", () => {
	describe("DbCredentialResolver", () => {
		// Stub HYPERIDLE_CREDENTIAL_KEY so encryptCredentialValue and DbCredentialResolver
		// both use the same secret (no-arg cipher-owns-key model, AU20 Am4).
		beforeEach(() => {
			vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", SERVER_SECRET);
		});

		afterEach(() => {
			vi.unstubAllEnvs();
		});

		test("resolves a stored credential by decrypting from DB", async ({ db }) => {
			const original = "sk-ant-api03-test-key";
			// env stubbed in beforeEach → encryptCredentialValue uses SERVER_SECRET
			const encrypted = encryptCredentialValue(original);

			// Upsert so a row another test left for the same catalog name cannot
			// collide (AU38 P10 — fixed-name PK, idempotent re-apply).
			await upsertCredential(db, "anthropic_api_key", encrypted, "present_untested");

			// DbCredentialResolver reads HYPERIDLE_CREDENTIAL_KEY from env (same secret)
			const resolver = new DbCredentialResolver(db);
			const result = await resolver.resolve("anthropic_api_key");
			expect(result).toBe(original);
		});

		test("returns null for an absent credential", async ({ db }) => {
			// Arrange the absence on the test's own catalog name — in a populated
			// world another test may have written anthropic_api_key already.
			await deleteCredentialRow(db, "anthropic_api_key");
			const resolver = new DbCredentialResolver(db);
			const result = await resolver.resolve("anthropic_api_key");
			expect(result).toBeNull();
		});

		test("returns null when decryption fails (wrong secret in env)", async ({ db }) => {
			// Encrypt with SERVER_SECRET (current env), store in DB
			const encrypted = encryptCredentialValue("my-key");

			await upsertCredential(db, "anthropic_api_key", encrypted, "present_untested");

			// Now switch env to WRONG_SECRET — resolver will try to decrypt with wrong key → null
			vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", WRONG_SECRET);
			const resolver = new DbCredentialResolver(db);
			const result = await resolver.resolve("anthropic_api_key");
			expect(result).toBeNull();
		});

		test("resolves openrouter_api_key separately from anthropic_api_key", async ({ db }) => {
			// Both encrypted with current env (SERVER_SECRET from beforeEach)
			await upsertCredential(db, "anthropic_api_key", encryptCredentialValue("ant-key"), "valid");
			await upsertCredential(db, "openrouter_api_key", encryptCredentialValue("or-key"), "valid");
			// The shared_backend_key absence is arranged, not assumed.
			await deleteCredentialRow(db, "shared_backend_key");

			const resolver = new DbCredentialResolver(db);
			expect(await resolver.resolve("anthropic_api_key")).toBe("ant-key");
			expect(await resolver.resolve("openrouter_api_key")).toBe("or-key");
			expect(await resolver.resolve("shared_backend_key")).toBeNull();
		});
	});
});
