import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-reviews";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

describe("GET /api/reviews/:reviewId", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AL7: the fixture review (rev-1) was removed; reviews route now queries real DB.
	// rev-1 is not a real message ID → 404. Real review loading is tested in AL7-reviews-loader.integration.test.ts.
	test("returns 404 for the old fixture review id (rev-1 no longer hardcoded)", async ({ app }) => {
		const res = await app.request("/api/reviews/rev-1", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(404);
	});

	test("returns 404 for an unknown review id", async ({ app }) => {
		const res = await app.request("/api/reviews/does-not-exist", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
	});

	test("returns 401 without an API key", async ({ app }) => {
		const res = await app.request("/api/reviews/rev-1", { method: "GET" });
		expect(res.status).toBe(401);
	});
});
