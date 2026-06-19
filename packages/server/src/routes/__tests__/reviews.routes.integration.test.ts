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

	test("returns the fixture review subject for a valid review id", async ({ app }) => {
		const res = await app.request("/api/reviews/rev-1", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string; title: string };
		expect(body.id).toBe("review:AL3:fixture");
		expect(body.title).toBe("Fix expired-promo checkout — silent success → typed 422");
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
