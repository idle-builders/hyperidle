/**
 * AD2 — Route integration test for GET /api/dispatch-queue.
 */

import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../test-fixtures.js";

const TEST_API_KEY = "test-key-dispatch-queue";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

describe("GET /api/dispatch-queue", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns a snapshot with entries array and draining boolean", async ({ app }) => {
		const res = await app.request("/api/dispatch-queue", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.entries)).toBe(true);
		expect(typeof body.draining).toBe("boolean");
	});

	test("rejects unauthenticated requests", async ({ app }) => {
		const res = await app.request("/api/dispatch-queue", {
			headers: { "X-API-Key": "wrong-key" },
		});
		expect(res.status).toBe(401);
	});
});
