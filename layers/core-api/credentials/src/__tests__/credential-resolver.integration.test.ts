/**
 * Credential resolver tests — resolveCredential function (replaces DbCredentialResolver).
 *
 * AC coverage:
 *  - resolveCredential reads and decrypts from DB
 *  - resolveCredential returns null for absent credential
 *  - resolveCredential returns null when decryption fails (wrong secret in env)
 *
 * @lore AU44 batch2: DbCredentialResolver class deleted; resolveCredential function
 * (same semantics, no class overhead) replaces it. Tests updated accordingly.
 */

import { encryptCredentialValue, resolveCredential } from "@hyperidle/credentials";
import { test } from "@hyperidle/db/test-fixtures";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";

const SERVER_SECRET = "test-server-secret-resolver-au20";
const WRONG_SECRET = "wrong-server-secret-resolver-au20";

describe("resolveCredential", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", SERVER_SECRET);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("resolves a stored credential by decrypting from DB", async ({ db }) => {
		const original = "sk-ant-api03-test-key";
		const encrypted = encryptCredentialValue(original);
		const now = new Date().toISOString();

		await db.execute(
			`INSERT INTO server_credentials (name, encrypted_value, validation_state, updated_at)
			 VALUES ('anthropic_api_key', '${encrypted}', 'present_untested', '${now}')`,
		);

		const result = await resolveCredential(db, "anthropic_api_key");
		expect(result).toBe(original);
	});

	test("returns null for an absent credential", async ({ db }) => {
		const result = await resolveCredential(db, "anthropic_api_key");
		expect(result).toBeNull();
	});

	test("returns null when decryption fails (wrong secret in env)", async ({ db }) => {
		const encrypted = encryptCredentialValue("my-key");
		const now = new Date().toISOString();

		await db.execute(
			`INSERT INTO server_credentials (name, encrypted_value, validation_state, updated_at)
			 VALUES ('anthropic_api_key', '${encrypted}', 'present_untested', '${now}')`,
		);

		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", WRONG_SECRET);
		const result = await resolveCredential(db, "anthropic_api_key");
		expect(result).toBeNull();
	});

	test("resolves openrouter_api_key separately from anthropic_api_key", async ({ db }) => {
		const now = new Date().toISOString();

		await db.execute(
			`INSERT INTO server_credentials (name, encrypted_value, validation_state, updated_at)
			 VALUES ('anthropic_api_key', '${encryptCredentialValue("ant-key")}', 'valid', '${now}')`,
		);
		await db.execute(
			`INSERT INTO server_credentials (name, encrypted_value, validation_state, updated_at)
			 VALUES ('openrouter_api_key', '${encryptCredentialValue("or-key")}', 'valid', '${now}')`,
		);

		expect(await resolveCredential(db, "anthropic_api_key")).toBe("ant-key");
		expect(await resolveCredential(db, "openrouter_api_key")).toBe("or-key");
		expect(await resolveCredential(db, "shared_backend_key")).toBeNull();
	});
});
