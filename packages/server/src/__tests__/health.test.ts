import type { HealthResponse } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../test-utils.js";

describe("GET /health", () => {
	const app = createTestApp();

	it("returns status ok with a timestamp", async () => {
		const res = await app.request("/health");
		expect(res.status).toBe(200);

		const body: HealthResponse = await res.json();
		expect(body.status).toBe("ok");
		expect(typeof body.timestamp).toBe("string");
		expect(body.timestamp.length).toBeGreaterThan(0);
	});

	it("returns a valid ISO timestamp", async () => {
		const res = await app.request("/health");
		const body: HealthResponse = await res.json();

		const parsed = new Date(body.timestamp);
		expect(parsed.toISOString()).toBe(body.timestamp);
	});

	it("returns 404 for unknown routes", async () => {
		const res = await app.request("/nonexistent");
		expect(res.status).toBe(404);
	});
});
