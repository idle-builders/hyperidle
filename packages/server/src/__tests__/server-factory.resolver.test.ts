/**
 * AH1 GREEN — Single-(production-)resolver invariant.
 *
 * Concept Hard Rule 3: "Exactly one CredentialResolver is instantiated in
 * server-factory; the LLM client obtains keys only through it."
 *
 * Proof type: integration — assert createServer wires DbCredentialResolver
 * (exposed via ServerHandle.credentialResolver), NOT EnvCredentialResolver.
 *
 * The first test (instanceof) is the core invariant: it FAILS if someone
 * reverts the wiring to EnvCredentialResolver. No indirection, no spy —
 * the runtime type is the assertion.
 *
 * The second and third tests confirm the two resolvers behave differently
 * given the same DB state (key in DB only, env cleared), so any future
 * regression in resolution logic is caught independently of the wiring test.
 *
 * @lore AH1 §3: The single-production-resolver invariant is enforced here, NOT
 * by an ESLint guard. EnvCredentialResolver is retained for the eval-only lane
 * (packages/eval) — banning its construction repo-wide would break eval.
 * The instanceof test is the correctly-scoped guard.
 * @lore AH1 §3: credentialResolver is exposed on ServerHandle so the invariant
 * test can assert `instanceof DbCredentialResolver` directly without relying on
 * indirect observable effects (spy calls, endpoint behavior). This is the real
 * check — it FAILS against the old EnvCredentialResolver wiring.
 */

import * as os from "node:os";
import * as path from "node:path";
import { serverCredentials } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "@hyperidle/agent-layer";
import { DisabledSandboxAdapter } from "@hyperidle/agent-layer";
import { createServer } from "../server-factory.js";
import { encryptCredentialValue } from "@hyperidle/core-app";
import { DbCredentialResolver, EnvCredentialResolver } from "@hyperidle/core-app";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-ah1-resolver-invariant";
const TEST_SERVER_SECRET = "ah1-resolver-invariant-secret-32x!!";
const TEST_PLAINTEXT_KEY = "sk-ant-resolver-invariant-test-key";

describe("AH1 — single-(production-)resolver invariant", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", TEST_SERVER_SECRET);
		// Make sure process.env does NOT have the anthropic key so EnvCredentialResolver would return null.
		vi.stubEnv("ANTHROPIC_API_KEY", "");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	test("EnvCredentialResolver returns null for anthropic_api_key (env is clear)", async ({
		db,
	}) => {
		// Sanity check: with ANTHROPIC_API_KEY="" in env, EnvCredentialResolver returns null.
		// After AH1, the production wiring uses DbCredentialResolver — if a key is in DB,
		// resolveModelTier returns it. If it used EnvCredentialResolver, it would get null.
		const envResolver = new EnvCredentialResolver();
		const result = await envResolver.resolve("anthropic_api_key");
		// With ANTHROPIC_API_KEY="" env cleared, env resolver returns null.
		expect(result).toBeNull();
		void db; // fixture
	}, 15_000);

	test("DbCredentialResolver resolves key from DB even when env is clear", async ({ db }) => {
		// Store a key in the DB via direct insert (bypassing HTTP route).
		const encryptedValue = encryptCredentialValue(TEST_PLAINTEXT_KEY, TEST_SERVER_SECRET);
		await db.insert(serverCredentials).values({
			name: "anthropic_api_key",
			encryptedValue,
			validationState: "present_untested",
			lastValidatedAt: null,
			updatedAt: new Date().toISOString(),
		});

		// DbCredentialResolver reads from the DB — should resolve the key.
		const dbResolver = new DbCredentialResolver(db, TEST_SERVER_SECRET);
		const resolved = await dbResolver.resolve("anthropic_api_key");
		expect(resolved).toBe(TEST_PLAINTEXT_KEY);

		// Cleanup.
		await db.delete(serverCredentials).where(eq(serverCredentials.name, "anthropic_api_key"));
	}, 15_000);

	test("createServer wires DbCredentialResolver (instanceof) — fails against EnvCredentialResolver wiring", async ({
		db,
	}) => {
		// THE CORE INVARIANT TEST.
		// This test is GREEN because createServer wires DbCredentialResolver.
		// If someone reverts the wiring to EnvCredentialResolver, this FAILS with:
		//   expected EnvCredentialResolver instance to be instanceof DbCredentialResolver
		//
		// No spy, no indirection — the runtime type of the wired resolver is asserted directly.
		// ServerHandle.credentialResolver exposes the wired resolver for this check.

		const handle = await createServer(0, {
			db,
			adapterPool: new AdapterPool(),
			workspaceAdapter: new DisabledSandboxAdapter(),
			sandboxBasePath: path.join(os.tmpdir(), "ah1-resolver-invariant"),
		});

		try {
			// Core invariant: the production resolver MUST be DbCredentialResolver.
			// This assertion FAILS if server-factory.ts wires EnvCredentialResolver instead.
			expect(handle.credentialResolver).toBeInstanceOf(DbCredentialResolver);

			// Negative assertion: NOT an EnvCredentialResolver.
			expect(handle.credentialResolver).not.toBeInstanceOf(EnvCredentialResolver);
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

		const encryptedValue = encryptCredentialValue(TEST_PLAINTEXT_KEY, TEST_SERVER_SECRET);
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
			workspaceAdapter: new DisabledSandboxAdapter(),
			sandboxBasePath: path.join(os.tmpdir(), "ah1-resolver-functional"),
		});

		try {
			// The wired resolver must find the key in DB (env is clear).
			const resolved = await handle.credentialResolver.resolve("anthropic_api_key");
			expect(resolved).toBe(TEST_PLAINTEXT_KEY);
		} finally {
			handle.dispose();
			await db.delete(serverCredentials).where(eq(serverCredentials.name, "anthropic_api_key"));
		}
	}, 20_000);
});
