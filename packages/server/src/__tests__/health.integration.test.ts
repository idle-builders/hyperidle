import type { HealthResponse } from "@hyperidle/shared";
import { describe, expect, test } from "../test-fixtures.js";

describe("GET /health", () => {
	test("returns status ok with a timestamp", async ({ app }) => {
		const res = await app.request("/health");
		expect(res.status).toBe(200);

		const body: HealthResponse = await res.json();
		expect(body.status).toBe("ok");
		expect(typeof body.timestamp).toBe("string");
		expect(body.timestamp.length).toBeGreaterThan(0);
	});

	test("returns a valid ISO timestamp", async ({ app }) => {
		const res = await app.request("/health");
		const body: HealthResponse = await res.json();

		const parsed = new Date(body.timestamp);
		expect(parsed.toISOString()).toBe(body.timestamp);
	});

	test("returns 404 for unknown routes", async ({ app }) => {
		const res = await app.request("/nonexistent");
		expect(res.status).toBe(404);
	});
});
