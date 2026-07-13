/**
 * AH1 RED — Deterministic resolver harness: key reaches the runtime.
 *
 * AC4: The credential the user set is readable by the resolver the agent runtime
 * actually uses, such that a provisioned session resolves a real key end-to-end
 * (provably, not by inspection).
 *
 * Proof type: Integration — deterministic harness (no real LLM).
 * The plan specifies this as the spec-sanctioned alternative to AH5's live-model lane,
 * since AH5 is unbuilt. Drives the PRODUCTION resolveModelTier/makeResolveModel seam
 * after a real PUT /api/credentials/:name. No mock on the resolver, credential store,
 * or LLM path.
 *
 * @lore AH1 §4 S-RES: This harness is the "deterministic resolver harness" the spec
 * sanctions for AC4. It proves the stored key resolves without a real LLM call.
 * When AH5 lands, the same PUT-then-resolve seam is what the live lane drives.
 */

import {
	DbCredentialResolver,
	readServerConfig,
	resolveModelTier,
	updateServerConfig,
} from "@hyperidle/core-app";
import { serverCredentials } from "@hyperidle/db";
import { MissingCredentialError } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-ah1-runtime-path";
const TEST_SERVER_SECRET = "ah1-runtime-path-secret-32chars!!";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

describe("AH1 AC4 — key reaches the runtime resolver (deterministic harness)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", TEST_SERVER_SECRET);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("anthropic provider path", () => {
		test("key stored via PUT resolves through DbCredentialResolver without MissingCredentialError", async ({
			app,
			db,
		}) => {
			const storedPlaintext = "sk-ant-resolver-test-key-anthropic";

			// Step 1: Store the key via the HTTP write path (same path onboarding uses).
			const putRes = await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: storedPlaintext }),
			});
			expect(putRes.status).toBe(200);

			// Step 2: Verify the key is in the DB (sanity — row exists).
			const [row] = await db
				.select()
				.from(serverCredentials)
				.where(eq(serverCredentials.name, "anthropic_api_key"));
			expect(row).toBeDefined();

			// Step 3: Construct DbCredentialResolver with the same secret — this is the
			// PRODUCTION wiring AH1 §3 mandates. No mock of the resolver.
			const resolver = new DbCredentialResolver(db, TEST_SERVER_SECRET);

			// Step 4: Call resolveModelTier — the same function makeResolveModel wraps in
			// server-factory. Use the default workhorse tier (anthropic provider).
			const cfg = await readServerConfig(db);

			// Fails today: EnvCredentialResolver is wired in production, reads process.env.
			// DbCredentialResolver is never used in production (server-factory.ts:200).
			// resolveModelTier with DbCredentialResolver reads the DB — returns the key.
			const resolved = await resolveModelTier("workhorse", cfg.modelGateway, resolver);

			// The resolved model must carry the stored plaintext key.
			expect(resolved.apiKey).toBe(storedPlaintext);
			expect(resolved.provider).toBe("anthropic");
		});

		test("resolveModelTier throws MissingCredentialError when no key stored (not null-silent)", async ({
			db,
		}) => {
			// No key stored — resolver returns null → MissingCredentialError.
			const resolver = new DbCredentialResolver(db, TEST_SERVER_SECRET);
			const cfg = await readServerConfig(db);

			// Must throw MissingCredentialError, never return undefined or swallow.
			await expect(resolveModelTier("workhorse", cfg.modelGateway, resolver)).rejects.toThrow(
				MissingCredentialError,
			);
		});
	});

	describe("openai-compatible provider path", () => {
		test("key stored via PUT resolves through DbCredentialResolver for openai-compatible tier", async ({
			app,
			db,
		}) => {
			const storedPlaintext = "sk-compat-test-key-xyz";
			const baseUrl = "https://api.together.xyz";

			// Step 1: Configure an openai-compatible tier in server_config.
			// Fails today: apiKey is in the tier config blob, not server_credentials.
			// After AH1, baseUrl stays in server_config, key goes to server_credentials.
			await updateServerConfig(db, {
				modelGateway: {
					fast: {
						provider: "openai-compatible",
						model: "llama-3.1-70b-instruct",
						baseUrl,
					},
				},
			});

			// Step 2: Store the openai_compatible_api_key credential via PUT.
			// Fails today: name not in catalog → 400.
			const putRes = await app.request("/api/credentials/openai_compatible_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: storedPlaintext }),
			});
			// Fails today: 400 (unknown credential name).
			expect(putRes.status).toBe(200);

			// Step 3: Construct the PRODUCTION resolver.
			const resolver = new DbCredentialResolver(db, TEST_SERVER_SECRET);

			// Step 4: Resolve the openai-compatible tier.
			const cfg = await readServerConfig(db);

			// Fails today: resolveModelTier reads tier.apiKey from the config blob,
			// not from the resolver. After AH1, it reads from resolver.
			const resolved = await resolveModelTier("fast", cfg.modelGateway, resolver);

			expect(resolved.apiKey).toBe(storedPlaintext);
			expect(resolved.provider).toBe("openai-compatible");
			expect(resolved.baseUrl).toBe(baseUrl);
		});

		test("resolveModelTier throws MissingCredentialError for openai-compatible when no key stored", async ({
			db,
		}) => {
			// Configure the tier but do NOT store the credential.
			await updateServerConfig(db, {
				modelGateway: {
					fast: {
						provider: "openai-compatible",
						model: "llama-3.1-70b-instruct",
						baseUrl: "https://api.together.xyz",
					},
				},
			});

			const resolver = new DbCredentialResolver(db, TEST_SERVER_SECRET);
			const cfg = await readServerConfig(db);

			// Fails today: the current path reads tier.apiKey (absent after §2) and
			// the old resolver path returns null silently or reads from wrong store.
			await expect(resolveModelTier("fast", cfg.modelGateway, resolver)).rejects.toThrow(
				MissingCredentialError,
			);
		});
	});
});
