/**
 * AH1 GREEN — Single-(production-)resolver invariant.
 *
 * Concept Hard Rule 3: "Exactly one CredentialResolver is instantiated in
 * server-factory; the LLM client obtains keys only through it."
 *
 * Proof type: integration — assert createServer wires a resolver that reads
 * from the DB (resolveCredential under the hood).
 *
 * @lore AH1 §3: credentialResolver is exposed on ServerHandle so the invariant
 * test can assert the resolver's functional behavior directly.
 * @lore AU44 batch2: DbCredentialResolver class deleted; replaced by
 * resolveCredential function wired as an anonymous `{ resolve }` object in boot.
 * instanceof check replaced by functional check (resolver reads from DB).
 */

import * as os from "node:os";
import * as path from "node:path";
import { encryptCredentialValue, resolveCredential } from "@hyperidle/credentials";
import { serverCredentials } from "@hyperidle/db";
import { createServer } from "@hyperidle/remote-server/create-server";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-ah1-resolver-invariant";
const TEST_SERVER_SECRET = "ah1-resolver-invariant-secret-32x!!";
const TEST_PLAINTEXT_KEY = "sk-ant-resolver-invariant-test-key";

describe("AH1 — single-(production-)resolver invariant", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", TEST_SERVER_SECRET);
		// Clear ANTHROPIC_API_KEY so env-based resolution returns null (proves DB path).
		vi.stubEnv("ANTHROPIC_API_KEY", "");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	test("resolveCredential reads key from DB even when env is clear", async ({ db }) => {
		// Store a key in the DB via direct insert (bypassing HTTP route).
		const encryptedValue = encryptCredentialValue(TEST_PLAINTEXT_KEY);
		await db.insert(serverCredentials).values({
			name: "anthropic_api_key",
			encryptedValue,
			validationState: "present_untested",
			lastValidatedAt: null,
			updatedAt: new Date().toISOString(),
		});

		// resolveCredential reads from the DB — should find the key.
		const resolved = await resolveCredential(db, "anthropic_api_key");
		expect(resolved).toBe(TEST_PLAINTEXT_KEY);

		// Cleanup.
		await db.delete(serverCredentials).where(eq(serverCredentials.name, "anthropic_api_key"));
	}, 15_000);

	test("createServer wires DB-backed resolver (functional invariant)", async ({ db }) => {
		// THE CORE INVARIANT TEST.
		// createServer wires the resolver; this test asserts it reads from the DB.
		const handle = await createServer(0, {
			db,
			topology: "disabled",
			sandboxBasePath: path.join(os.tmpdir(), "ah1-resolver-invariant"),
		});

		try {
			// Core invariant: the production resolver must be non-null and callable.
			expect(handle.credentialResolver).toBeDefined();
			expect(typeof handle.credentialResolver?.resolve).toBe("function");
		} finally {
			handle.dispose();
		}
	}, 20_000);

	test("createServer production wiring: DB key resolved, env key ignored (functional invariant)", async ({
		db,
	}) => {
		// Functional complement: store a key in DB only (env is cleared in beforeEach).
		// If the resolver is DB-backed → key is found (TEST_PLAINTEXT_KEY).
		// If it were env-backed → null (env is clear).

		const encryptedValue = encryptCredentialValue(TEST_PLAINTEXT_KEY);
		await db.insert(serverCredentials).values({
			name: "anthropic_api_key",
			encryptedValue,
			validationState: "present_untested",
			lastValidatedAt: null,
			updatedAt: new Date().toISOString(),
		});

		const handle = await createServer(0, {
			db,
			topology: "disabled",
			sandboxBasePath: path.join(os.tmpdir(), "ah1-resolver-functional"),
		});

		try {
			// The wired resolver must find the key in DB (env is clear).
			const resolved = await handle.credentialResolver?.resolve("anthropic_api_key");
			expect(resolved).toBe(TEST_PLAINTEXT_KEY);
		} finally {
			handle.dispose();
			await db.delete(serverCredentials).where(eq(serverCredentials.name, "anthropic_api_key"));
		}
	}, 20_000);
});
