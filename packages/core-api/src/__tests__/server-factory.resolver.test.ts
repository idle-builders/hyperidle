/**
 * AH1 GREEN — Single-(production-)resolver invariant.
 *
 * Concept Hard Rule 3: "Exactly one CredentialResolver is instantiated in
 * server-factory; the LLM client obtains keys only through it."
 *
 * Proof type: integration — assert createServer wires DbCredentialResolver
 * (exposed via ServerHandle.credentialResolver).
 *
 * The instanceof test is the core invariant: it FAILS if someone reverts
 * the wiring to any other resolver. No indirection, no spy — the runtime
 * type is the assertion.
 *
 * @lore AH1 §3: The single-production-resolver invariant is enforced here
 * by instanceof DbCredentialResolver. EnvCredentialResolver has been
 * relocated to packages/eval (AU20 R-connections) — the negative assertion
 * is no longer needed because the positive instanceof assertion already
 * catches any wrong-resolver regression.
 * @lore AH1 §3: credentialResolver is exposed on ServerHandle so the invariant
 * test can assert `instanceof DbCredentialResolver` directly without relying on
 * indirect observable effects (spy calls, endpoint behavior).
 */

import * as os from "node:os";
import * as path from "node:path";
import { DbCredentialResolver } from "@hyperidle/credentials";
import { serverCredentials } from "@hyperidle/db";
import { AdapterPool, createSandboxAdapter } from "@hyperidle/harness-registry";
import { encryptCredentialValue } from "@hyperidle/shared/crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { createServer } from "../server-factory.js";
import { test } from "../test-fixtures.js";

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

	test("DbCredentialResolver resolves key from DB even when env is clear", async ({ db }) => {
		// Store a key in the DB via direct insert (bypassing HTTP route).
		const encryptedValue = encryptCredentialValue(TEST_PLAINTEXT_KEY);
		await db.insert(serverCredentials).values({
			name: "anthropic_api_key",
			encryptedValue,
			validationState: "present_untested",
			lastValidatedAt: null,
			updatedAt: new Date().toISOString(),
		});

		// DbCredentialResolver reads from the DB — should resolve the key.
		const dbResolver = new DbCredentialResolver(db);
		const resolved = await dbResolver.resolve("anthropic_api_key");
		expect(resolved).toBe(TEST_PLAINTEXT_KEY);

		// Cleanup.
		await db.delete(serverCredentials).where(eq(serverCredentials.name, "anthropic_api_key"));
	}, 15_000);

	test("createServer wires DbCredentialResolver (instanceof)", async ({ db }) => {
		// THE CORE INVARIANT TEST.
		// This test is GREEN because createServer wires DbCredentialResolver.
		// No spy, no indirection — the runtime type of the wired resolver is asserted directly.
		// ServerHandle.credentialResolver exposes the wired resolver for this check.

		const handle = await createServer(0, {
			db,
			adapterPool: new AdapterPool(),
			workspaceAdapter: createSandboxAdapter("disabled"),
			sandboxBasePath: path.join(os.tmpdir(), "ah1-resolver-invariant"),
		});

		try {
			// Core invariant: the production resolver MUST be DbCredentialResolver.
			expect(handle.credentialResolver).toBeInstanceOf(DbCredentialResolver);
		} finally {
			handle.dispose();
		}
	}, 20_000);

	test("createServer production wiring: DB key resolved, env key ignored (functional invariant)", async ({
		db,
	}) => {
		// Functional complement to the instanceof test.
		// Store a key in DB only (env is cleared in beforeEach).
		// Boot createServer with the DB. Resolve anthropic_api_key via handle.credentialResolver.
		// If DbCredentialResolver is wired → key is found (TEST_PLAINTEXT_KEY).
		// If EnvCredentialResolver is wired → null (env is clear).

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
			adapterPool: new AdapterPool(),
			workspaceAdapter: createSandboxAdapter("disabled"),
			sandboxBasePath: path.join(os.tmpdir(), "ah1-resolver-functional"),
		});

		try {
			// The wired DbCredentialResolver must find the key in DB (env is clear).
			const resolved = await handle.credentialResolver.resolve("anthropic_api_key");
			expect(resolved).toBe(TEST_PLAINTEXT_KEY);
		} finally {
			handle.dispose();
			await db.delete(serverCredentials).where(eq(serverCredentials.name, "anthropic_api_key"));
		}
	}, 20_000);
});
