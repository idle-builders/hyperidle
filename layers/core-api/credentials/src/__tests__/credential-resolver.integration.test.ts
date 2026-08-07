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

import { test } from "@hyperidle/db/test-fixtures";
import { encryptCredentialValue } from "@hyperidle/shared/crypto";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { DbCredentialResolver } from "../credential-resolver.js";

const SERVER_SECRET = "test-server-secret-resolver-au20";
const WRONG_SECRET = "wrong-server-secret-resolver-au20";

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
			const now = new Date().toISOString();

			// Insert encrypted credential into server_credentials table
			await db.execute(
				`INSERT INTO server_credentials (name, encrypted_value, validation_state, updated_at)
				 VALUES ('anthropic_api_key', '${encrypted}', 'present_untested', '${now}')`,
			);

			// DbCredentialResolver reads HYPERIDLE_CREDENTIAL_KEY from env (same secret)
			const resolver = new DbCredentialResolver(db);
			const result = await resolver.resolve("anthropic_api_key");
			expect(result).toBe(original);
		});

		test("returns null for an absent credential", async ({ db }) => {
			const resolver = new DbCredentialResolver(db);
			const result = await resolver.resolve("anthropic_api_key");
			expect(result).toBeNull();
		});

		test("returns null when decryption fails (wrong secret in env)", async ({ db }) => {
			// Encrypt with SERVER_SECRET (current env), store in DB
			const encrypted = encryptCredentialValue("my-key");
			const now = new Date().toISOString();

			await db.execute(
				`INSERT INTO server_credentials (name, encrypted_value, validation_state, updated_at)
				 VALUES ('anthropic_api_key', '${encrypted}', 'present_untested', '${now}')`,
			);

			// Now switch env to WRONG_SECRET — resolver will try to decrypt with wrong key → null
			vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", WRONG_SECRET);
			const resolver = new DbCredentialResolver(db);
			const result = await resolver.resolve("anthropic_api_key");
			expect(result).toBeNull();
		});

		test("resolves openrouter_api_key separately from anthropic_api_key", async ({ db }) => {
			const now = new Date().toISOString();

			// Both encrypted with current env (SERVER_SECRET from beforeEach)
			await db.execute(
				`INSERT INTO server_credentials (name, encrypted_value, validation_state, updated_at)
				 VALUES ('anthropic_api_key', '${encryptCredentialValue("ant-key")}', 'valid', '${now}')`,
			);
			await db.execute(
				`INSERT INTO server_credentials (name, encrypted_value, validation_state, updated_at)
				 VALUES ('openrouter_api_key', '${encryptCredentialValue("or-key")}', 'valid', '${now}')`,
			);

			const resolver = new DbCredentialResolver(db);
			expect(await resolver.resolve("anthropic_api_key")).toBe("ant-key");
			expect(await resolver.resolve("openrouter_api_key")).toBe("or-key");
			expect(await resolver.resolve("shared_backend_key")).toBeNull();
		});
	});
});
