import type { HealthResponse } from "@hyperidle/domain-model";
import { users } from "@hyperidle/db";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

describe("health", () => {
	test("GET /health returns status ok with a valid ISO timestamp", async ({ app }) => {
		const res = await app.request("/health");
		expect(res.status).toBe(200);

		const body: HealthResponse = await res.json();
		expect(body.status).toBe("ok");
		expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
	});

	test("GET /api/health returns status ok, unauthenticated", async ({ requestWithoutAuth }) => {
		const res = await requestWithoutAuth("/api/health");
		expect(res.status).toBe(200);
		const body: HealthResponse = await res.json();
		expect(body.status).toBe("ok");
	});

	test("GET /api/health/auth refuses a request with no API key", async ({ requestWithoutAuth }) => {
		const res = await requestWithoutAuth("/api/health/auth");
		expect(res.status).toBe(401);
	});

	test("GET /api/health/auth returns the resolved userId with a valid API key", async ({
		app,
		db,
	}) => {
		await db.insert(users).values({
			id: "u-health-auth",
			kind: "human",
			name: "Health Test User",
			role: "founder",
			status: "active",
			createdAt: new Date().toISOString(),
		});

		const res = await app.request("/api/health/auth");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string; userId: string };
		expect(body.status).toBe("ok");
		expect(body.userId).toBe("u-health-auth");
	});

	test("returns 404 for an unknown route", async ({ app }) => {
		const res = await app.request("/nonexistent");
		expect(res.status).toBe(404);
	});
});
