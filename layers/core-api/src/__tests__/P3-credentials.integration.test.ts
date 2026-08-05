/**
 * P3 RED — Server credential CRUD endpoints (AC-9)
 *
 * AC coverage:
 *  - GET /api/credentials returns all catalog entries with "absent" state
 *  - PUT /api/credentials/anthropic_api_key with value returns 200 + status (not value)
 *  - GET /api/credentials after PUT shows "present_untested" for anthropic_api_key
 *  - PUT /api/credentials/unknown_key returns 400 (not in catalog)
 *  - DELETE /api/credentials/anthropic_api_key returns 204
 *  - GET /api/credentials after DELETE shows "absent" for anthropic_api_key
 *  - POST /api/credentials/anthropic_api_key/validate returns validation result
 *  - No response body contains the raw credential value
 *  - All endpoints require auth (401 without API key)
 */

import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-p3-credentials";
const CREDENTIAL_VALUE = "sk-ant-api03-test-1234-abcd";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("P3 AC-9 — Credential CRUD endpoints", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "test-credential-encryption-key");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("GET /api/credentials", () => {
		test("returns 200 with all catalog entries in absent state", async ({ app }) => {
			const res = await app.request("/api/credentials", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Array<{
				name: string;
				state: string;
				lastValidatedAt: string | null;
			}>;
			expect(Array.isArray(body)).toBe(true);
			// AH1: openai_compatible_api_key promoted from server_config blob to catalog (4th entry)
			expect(body).toHaveLength(4);

			const names = body.map((e) => e.name);
			expect(names).toContain("anthropic_api_key");
			expect(names).toContain("openrouter_api_key");
			expect(names).toContain("shared_backend_key");
			expect(names).toContain("openai_compatible_api_key");

			for (const entry of body) {
				expect(entry.state).toBe("absent");
				expect(entry.lastValidatedAt).toBeNull();
			}
		});

		test("returns 401 without API key", async ({ app }) => {
			const res = await app.request("/api/credentials");
			expect(res.status).toBe(401);
		});

		test("response does not include a value or encryptedValue field", async ({ app }) => {
			const res = await app.request("/api/credentials", { headers: authHeaders() });
			const body = (await res.json()) as Array<Record<string, unknown>>;

			for (const entry of body) {
				expect(entry).not.toHaveProperty("value");
				expect(entry).not.toHaveProperty("encryptedValue");
				expect(entry).not.toHaveProperty("encrypted_value");
			}
		});
	});

	describe("PUT /api/credentials/:name", () => {
		test("returns 200 with status response when setting a valid catalog credential", async ({
			app,
		}) => {
			const res = await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: CREDENTIAL_VALUE }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as { name: string; state: string };
			expect(body.name).toBe("anthropic_api_key");
			expect(body.state).toBe("present_untested");
		});

		test("returns 400 when credential name is not in the catalog", async ({ app }) => {
			const res = await app.request("/api/credentials/unknown_arbitrary_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: "some-value" }),
			});
			expect(res.status).toBe(400);
		});

		test("response does not contain the raw credential value", async ({ app }) => {
			const res = await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: CREDENTIAL_VALUE }),
			});
			const responseText = await res.text();
			expect(responseText).not.toContain(CREDENTIAL_VALUE);
		});

		test("returns 400 when body is missing value field", async ({ app }) => {
			const res = await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ wrong_field: "value" }),
			});
			expect(res.status).toBe(400);
		});

		test("returns 401 without API key", async ({ app }) => {
			const res = await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				body: JSON.stringify({ value: CREDENTIAL_VALUE }),
			});
			expect(res.status).toBe(401);
		});
	});

	describe("GET /api/credentials after PUT", () => {
		test("shows present_untested state after setting a credential", async ({ app }) => {
			// Set the credential
			await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: CREDENTIAL_VALUE }),
			});

			// Re-fetch all credentials
			const res = await app.request("/api/credentials", { headers: authHeaders() });
			const body = (await res.json()) as Array<{ name: string; state: string }>;

			const anthropicEntry = body.find((e) => e.name === "anthropic_api_key");
			expect(anthropicEntry?.state).toBe("present_untested");

			// Others remain absent
			const openrouterEntry = body.find((e) => e.name === "openrouter_api_key");
			expect(openrouterEntry?.state).toBe("absent");
		});
	});

	describe("DELETE /api/credentials/:name", () => {
		test("returns 204 on successful deletion", async ({ app }) => {
			// First set the credential
			await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: CREDENTIAL_VALUE }),
			});

			// Then delete it
			const res = await app.request("/api/credentials/anthropic_api_key", {
				method: "DELETE",
				headers: authHeaders(),
			});
			expect(res.status).toBe(204);
		});

		test("subsequent GET shows absent after DELETE", async ({ app }) => {
			// Set then delete
			await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: CREDENTIAL_VALUE }),
			});
			await app.request("/api/credentials/anthropic_api_key", {
				method: "DELETE",
				headers: authHeaders(),
			});

			// Verify absent
			const res = await app.request("/api/credentials", { headers: authHeaders() });
			const body = (await res.json()) as Array<{ name: string; state: string }>;
			const entry = body.find((e) => e.name === "anthropic_api_key");
			expect(entry?.state).toBe("absent");
		});

		test("returns 400 for non-catalog credential name", async ({ app }) => {
			const res = await app.request("/api/credentials/not_a_real_key", {
				method: "DELETE",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});

		test("returns 401 without API key", async ({ app }) => {
			const res = await app.request("/api/credentials/anthropic_api_key", {
				method: "DELETE",
			});
			expect(res.status).toBe(401);
		});
	});

	describe("POST /api/credentials/:name/validate", () => {
		test("returns a validation result for a known credential", async ({ app }) => {
			// Set the credential first
			await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: CREDENTIAL_VALUE }),
			});

			const res = await app.request("/api/credentials/anthropic_api_key/validate", {
				method: "POST",
				headers: authHeaders(),
			});
			// Should return 200 with a validation result (actual validity depends on external call mock)
			expect([200, 422]).toContain(res.status);

			const body = (await res.json()) as { valid: boolean; error?: string };
			expect(typeof body.valid).toBe("boolean");
		});

		test("returns 400 for non-catalog credential name", async ({ app }) => {
			const res = await app.request("/api/credentials/unknown_key/validate", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});

		test("returns 401 without API key", async ({ app }) => {
			const res = await app.request("/api/credentials/anthropic_api_key/validate", {
				method: "POST",
			});
			expect(res.status).toBe(401);
		});

		test("validation response does not contain the raw credential value", async ({ app }) => {
			await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: CREDENTIAL_VALUE }),
			});

			const res = await app.request("/api/credentials/anthropic_api_key/validate", {
				method: "POST",
				headers: authHeaders(),
			});
			const responseText = await res.text();
			expect(responseText).not.toContain(CREDENTIAL_VALUE);
		});
	});

	describe("Security: credential values never in responses", () => {
		test("full GET/PUT/DELETE cycle: no response contains raw value", async ({ app }) => {
			const secretValue = "sk-ant-super-secret-value-do-not-leak";

			// PUT
			const putRes = await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: secretValue }),
			});
			expect(await putRes.text()).not.toContain(secretValue);

			// GET list
			const getRes = await app.request("/api/credentials", { headers: authHeaders() });
			expect(await getRes.text()).not.toContain(secretValue);

			// DELETE
			const delRes = await app.request("/api/credentials/anthropic_api_key", {
				method: "DELETE",
				headers: authHeaders(),
			});
			expect(delRes.status).toBe(204);
		});
	});
});
