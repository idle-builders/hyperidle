import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

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

	// AL7 CRITICAL-2b: the stub fixture review (rev-1) is restored (plan §7: "keep the
	// stub data until the broader reviews-loader wiring lands"). rev-1 returns 200 with
	// the fixture payload. Real review loading is tested in AL7-reviews-loader.integration.test.ts.
	test("returns 200 with fixture data for rev-1 (stub path restored per plan §7)", async ({
		app,
	}) => {
		const res = await app.request("/api/reviews/rev-1", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		expect(body.id).toBe("review:AL3:fixture");
	});

	test("returns 404 for an unknown review id", async ({ app }) => {
		const res = await app.request("/api/reviews/does-not-exist", {
			method: "GET",
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);
	});

	test("returns 401 without an API key", async ({ requestWithoutAuth }) => {
		const res = await requestWithoutAuth("/api/reviews/rev-1", { method: "GET" });
		expect(res.status).toBe(401);
	});
});
