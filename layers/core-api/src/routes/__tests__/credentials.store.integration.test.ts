/**
 * AH1 RED — Credential store: ciphertext in DB, no plaintext in server_config blob.
 *
 * AC2: No API key is ever stored in plaintext in the database or in any config row;
 * the openai-compatible key is stored in the same encrypted credential store as the others.
 *
 * Proof type: integration (real DB via fixtures, real routes + direct DB read-back).
 *
 * @lore AH1 §6: vi.stubEnv sets a real root secret for these tests so PUT can
 * encrypt. afterEach → vi.unstubAllEnvs() so the crypto secret does not leak
 * to siblings.
 *
 * @lore AH1 §2: The openai-compatible key must live in server_credentials (not
 * server_config blob). After AH1 implementation, ModelTierConfig has no apiKey field.
 *
 * @lore AU38 P10: `server_credentials.name` is a production-fixed catalog PK —
 * it cannot be scoped per test. Writes here go through the route's own upsert
 * (writeCredential), so a row another file left under the same name is
 * absorbed, not collided with; the one absence assert below arranges its
 * absence via DELETE first, and the catalog-count assert reads the fixed
 * CREDENTIAL_CATALOG, never table rows (credentials.ts GET handler).
 */

import { decryptCredentialValue } from "@hyperidle/credential-access";
import { serverConfig, serverCredentials } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-ah1-store";
// Must be a strong secret so HKDF works correctly.
const TEST_SERVER_SECRET = "ah1-test-root-secret-32chars-long!!";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

describe("AH1 AC2 — credential store: ciphertext in DB, no plaintext in blob", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", TEST_SERVER_SECRET);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("anthropic_api_key — stored as ciphertext", () => {
		test("PUT stores ciphertext, not plaintext, in server_credentials", async ({ app, db }) => {
			const plaintext = "sk-ant-my-real-key-12345";

			const res = await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: plaintext }),
			});
			expect(res.status).toBe(200);

			// Direct DB read-back.
			const [row] = await db
				.select()
				.from(serverCredentials)
				.where(eq(serverCredentials.name, "anthropic_api_key"));

			// The row must exist.
			expect(row).toBeDefined();
			// The stored value must NOT equal the plaintext.
			expect(row?.encryptedValue).not.toBe(plaintext);
			// It must decrypt back to the plaintext.
			const decrypted = decryptCredentialValue(row!.encryptedValue);
			expect(decrypted).toBe(plaintext);
		});

		test("GET /api/credentials never includes plaintext value in response", async ({ app }) => {
			const plaintext = "sk-ant-never-in-response";
			await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: plaintext }),
			});

			const res = await app.request("/api/credentials", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = await res.text();
			expect(body).not.toContain(plaintext);
		});
	});

	describe("openai_compatible_api_key — in server_credentials, not server_config blob", () => {
		test("PUT openai_compatible_api_key stores ciphertext in server_credentials", async ({
			app,
			db,
		}) => {
			const plaintext = "sk-openai-compat-key-xyz";

			// PUT to the new catalog slot (fails today: name not in catalog → 400).
			const res = await app.request("/api/credentials/openai_compatible_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: plaintext }),
			});
			// Fails today: 400 (unknown credential name — openai_compatible_api_key not in catalog).
			expect(res.status).toBe(200);

			// Direct DB read-back: row in server_credentials.
			const [row] = await db
				.select()
				.from(serverCredentials)
				.where(eq(serverCredentials.name, "openai_compatible_api_key"));

			expect(row).toBeDefined();
			expect(row?.encryptedValue).not.toBe(plaintext);

			const decrypted = decryptCredentialValue(row!.encryptedValue);
			expect(decrypted).toBe(plaintext);
		});

		test("server_config blob does NOT contain an apiKey field in any tier after write", async ({
			app,
			db,
		}) => {
			// Write a model gateway config with an openai-compatible tier.
			// (Route path may be /api/settings/model-gateway or /api/server-config — check existing routes.)
			await app.request("/api/server-config", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					modelGateway: {
						workhorse: {
							provider: "openai-compatible",
							model: "llama-3.1-70b",
							baseUrl: "https://api.together.xyz",
						},
					},
				}),
			});

			// After AH1, the server_config blob must have NO apiKey field in any tier.
			// Fails today: the blob carries apiKey (ciphertext) in the openai-compatible tier.
			const [configRow] = await db
				.select()
				.from(serverConfig)
				.where(eq(serverConfig.id, "default"));

			if (configRow) {
				const parsed = JSON.parse(configRow.config) as Record<string, unknown>;
				const gateway = parsed.modelGateway as Record<string, Record<string, unknown>> | undefined;
				if (gateway) {
					for (const [tierName, tier] of Object.entries(gateway)) {
						// After AH1, no tier should carry an apiKey field in the blob.
						expect(tier, `tier ${tierName} must not have apiKey in blob`).not.toHaveProperty(
							"apiKey",
						);
					}
				}
			}
		});
	});

	describe("GET /api/credentials catalog — returns 4 entries after AH1", () => {
		test("returns exactly 4 credential entries", async ({ app }) => {
			const res = await app.request("/api/credentials", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<{ name: string }>;
			// Fails today: catalog has 3 entries.
			// AU38 P10: the response maps the fixed CREDENTIAL_CATALOG (one entry
			// per catalog name, present or not), so the count is world-independent.
			expect(body).toHaveLength(4);
		});

		test("catalog includes openai_compatible_api_key entry", async ({ app }) => {
			// AU38 P4/P10: "absent" is arranged on this catalog name, not assumed —
			// an earlier test (this file or another) may have written the row.
			const del = await app.request("/api/credentials/openai_compatible_api_key", {
				method: "DELETE",
				headers: authHeaders(),
			});
			expect([204, 404]).toContain(del.status);

			const res = await app.request("/api/credentials", {
				method: "GET",
				headers: authHeaders(),
			});
			const body = (await res.json()) as Array<{ name: string; state: string }>;
			const entry = body.find((e) => e.name === "openai_compatible_api_key");
			// Fails today: entry absent.
			expect(entry).toBeDefined();
			expect(entry?.state).toBe("absent");
		});
	});
});
