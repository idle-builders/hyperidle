/**
 * V1 — Route integration tests for credentials endpoints.
 *
 * GET    /api/credentials              — list catalog with states
 * PUT    /api/credentials/:name        — set credential (encrypt + store)
 * DELETE /api/credentials/:name        — remove credential
 * POST   /api/credentials/:name/validate — validate against external service
 */

import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-credentials";
// Must be 32+ chars for AES-256
const TEST_SERVER_SECRET = "a-test-secret-for-credentials-32x";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("credentials routes", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		// AH1: Fixed bug — was HYPERIDLE_SERVER_SECRET (wrong), correct var is HYPERIDLE_CREDENTIAL_KEY.
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", TEST_SERVER_SECRET);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	describe("GET /api/credentials", () => {
		test("returns 401 without auth", async ({ app }) => {
			const res = await app.request("/api/credentials", { method: "GET" });
			expect(res.status).toBe(401);
		});

		test("returns 200 with credential catalog showing absent states", async ({ app }) => {
			const res = await app.request("/api/credentials", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<{
				name: string;
				state: string;
				lastValidatedAt: string | null;
			}>;
			expect(Array.isArray(body)).toBe(true);
			expect(body.length).toBeGreaterThan(0);
			// All unset credentials should be "absent"
			for (const entry of body) {
				expect(entry.state).toBe("absent");
				expect(entry.lastValidatedAt).toBeNull();
			}
		});

		test("returns catalog with present_untested state after PUT", async ({ app }) => {
			await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: "sk-ant-test-key-here" }),
			});

			const res = await app.request("/api/credentials", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<{ name: string; state: string }>;
			const anthropicEntry = body.find((e) => e.name === "anthropic_api_key");
			expect(anthropicEntry?.state).toBe("present_untested");
		});
	});

	describe("PUT /api/credentials/:name", () => {
		test("returns 401 without auth", async ({ app }) => {
			const res = await app.request("/api/credentials/anthropic_api_key", { method: "PUT" });
			expect(res.status).toBe(401);
		});

		test("returns 200 with credential status on valid PUT", async ({ app }) => {
			const res = await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: "sk-ant-valid-key" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { name: string; state: string };
			expect(body.name).toBe("anthropic_api_key");
			expect(body.state).toBe("present_untested");
		});

		test("returns 400 for unknown credential name", async ({ app }) => {
			const res = await app.request("/api/credentials/unknown_credential_xyz", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: "some-value" }),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 on missing value field", async ({ app }) => {
			const res = await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(400);
		});

		test("encrypts the value (never returns plaintext)", async ({ app }) => {
			const res = await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: "my-secret-api-key" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			// Response must not contain the plaintext value
			expect(JSON.stringify(body)).not.toContain("my-secret-api-key");
		});

		test("upserts: overwrites existing credential", async ({ app }) => {
			// First PUT
			await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: "old-key" }),
			});

			// Second PUT with new value
			const res = await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: "new-key" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { state: string };
			expect(body.state).toBe("present_untested");
		});
	});

	describe("DELETE /api/credentials/:name", () => {
		test("returns 401 without auth", async ({ app }) => {
			const res = await app.request("/api/credentials/anthropic_api_key", { method: "DELETE" });
			expect(res.status).toBe(401);
		});

		test("returns 204 on successful delete", async ({ app }) => {
			// Set credential first
			await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: "some-key" }),
			});

			const res = await app.request("/api/credentials/anthropic_api_key", {
				method: "DELETE",
				headers: authHeaders(),
			});
			expect(res.status).toBe(204);
		});

		test("returns 400 for unknown credential name", async ({ app }) => {
			const res = await app.request("/api/credentials/unknown_credential_xyz", {
				method: "DELETE",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});

		test("returns 204 even when credential does not exist (idempotent)", async ({ app }) => {
			const res = await app.request("/api/credentials/anthropic_api_key", {
				method: "DELETE",
				headers: authHeaders(),
			});
			expect(res.status).toBe(204);
		});
	});

	describe("POST /api/credentials/:name/validate", () => {
		test("returns 401 without auth", async ({ app }) => {
			const res = await app.request("/api/credentials/anthropic_api_key/validate", {
				method: "POST",
			});
			expect(res.status).toBe(401);
		});

		test("returns 200 with valid:false when credential not set", async ({ app }) => {
			const res = await app.request("/api/credentials/anthropic_api_key/validate", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { valid: boolean };
			expect(body.valid).toBe(false);
		});

		test("returns 200 with validation result and updates DB state (mock external fetch)", async ({
			app,
		}) => {
			// @lore V1: validateLimiter is module-scoped in credentials.ts (shared bucket across tests).
			// This test combines "validate returns valid:true" + "state updated in DB" into a single
			// validate call to avoid exhausting the 3/hour bucket shared across all tests in this file.

			// Set credential first
			await app.request("/api/credentials/anthropic_api_key", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ value: "sk-ant-test-key" }),
			});

			// Mock external fetch to return success
			const fetchSpy = vi
				.spyOn(globalThis, "fetch")
				.mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 }));

			// Validate
			const validateRes = await app.request("/api/credentials/anthropic_api_key/validate", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(validateRes.status).toBe(200);
			const validateBody = (await validateRes.json()) as { valid: boolean };
			expect(validateBody.valid).toBe(true);
			expect(fetchSpy).toHaveBeenCalled();

			// Check list returns updated state
			const listRes = await app.request("/api/credentials", {
				method: "GET",
				headers: authHeaders(),
			});
			const listBody = (await listRes.json()) as Array<{
				name: string;
				state: string;
				lastValidatedAt: string | null;
			}>;
			const anthropicEntry = listBody.find((e) => e.name === "anthropic_api_key");
			expect(anthropicEntry?.state).toBe("valid");
			expect(anthropicEntry?.lastValidatedAt).not.toBeNull();
		});

		test("returns 400 for unknown credential name", async ({ app }) => {
			const res = await app.request("/api/credentials/unknown_credential_xyz/validate", {
				method: "POST",
				headers: authHeaders(),
			});
			expect(res.status).toBe(400);
		});
	});
});
