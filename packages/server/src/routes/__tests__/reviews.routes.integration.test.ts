import { describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

function authHeaders(): Record<string, string> {
	vi.stubEnv("HYPERIDLE_API_KEY", "test-key-reviews");
	return { "X-API-Key": "test-key-reviews" };
}

describe("GET /api/reviews/:reviewId", () => {
	test("returns the fixture review subject for a valid review id", async ({ app }) => {
		const res = await app.request("/api/reviews/rev-1", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string; title: string; artifacts: unknown[] };
		expect(body.id).toBe("review:AL3:fixture");
		expect(body.title).toBe("Fix expired-promo checkout — silent success → typed 422");
		expect(body.artifacts.length).toBeGreaterThan(0);
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
