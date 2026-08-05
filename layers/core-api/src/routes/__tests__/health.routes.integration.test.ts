/**
 * V1 — Route integration tests for health endpoints.
 *
 * GET /health        — public, no auth required
 * GET /api/health/auth — authenticated health check
 */

import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-health";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("health routes", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("GET /health", () => {
		test("returns 200 with status ok and timestamp (no auth required)", async ({ app }) => {
			const res = await app.request("/health", { method: "GET" });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string; timestamp: string };
			expect(body.status).toBe("ok");
			expect(typeof body.timestamp).toBe("string");
		});
	});

	describe("GET /api/health/auth", () => {
		test("returns 401 without auth", async ({ app }) => {
			const res = await app.request("/api/health/auth", { method: "GET" });
			expect(res.status).toBe(401);
		});

		test("returns 200 with status ok, timestamp, and userId when authenticated", async ({
			app,
		}) => {
			const res = await app.request("/api/health/auth", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string; timestamp: string; userId: unknown };
			expect(body.status).toBe("ok");
			expect(typeof body.timestamp).toBe("string");
			// userId may be undefined in local mode (no db-based user lookup)
			expect("userId" in body).toBe(true);
		});
	});
});
