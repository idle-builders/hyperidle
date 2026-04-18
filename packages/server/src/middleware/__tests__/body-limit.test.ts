/**
 * I2 — R4: oversized request bodies must return 413 with a JSON
 * ApiErrorResponse whose code is PAYLOAD_TOO_LARGE.
 *
 * The default Hono `bodyLimit` throws an HTTPException(413) with a text
 * response. I2 wires a custom `onError` so the response is the project's
 * canonical JSON error shape.
 *
 * Red phase: today the test app has no body-limit middleware mounted.
 * Hono does not bound request size by default, so a 2KB POST returns
 * whatever the route handler returns (here: a normal 4xx/5xx, not a 413
 * with the canonical error envelope).
 */

import { type HyperIdleDb, createTestDb } from "@hyperidle/db";
import { API_ERROR_CODES, EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-body-limit";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("I2 R4 — body-limit middleware returns 413 + JSON ApiErrorResponse", () => {
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		// Set the limit very small so the test's payload is unambiguously
		// over budget. The middleware reads HYPERIDLE_MAX_BODY_BYTES.
		vi.stubEnv("HYPERIDLE_MAX_BODY_BYTES", "1024");
		db = createTestDb();
		app = createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("rejects a POST whose body exceeds the configured limit with 413", async () => {
		// 2KB of payload — well above the 1024-byte limit set above.
		const huge = "x".repeat(2048);
		const body = JSON.stringify({ pitch: huge });

		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body,
		});

		expect(res.status).toBe(413);
		const json = (await res.json()) as { code?: string; error?: string };
		expect(json.code).toBe(API_ERROR_CODES.PAYLOAD_TOO_LARGE);
		expect(typeof json.error).toBe("string");
	});

	it("does NOT 413 a request that fits within the limit", async () => {
		const small = JSON.stringify({ pitch: "tiny" });

		const res = await app.request("/api/bets", {
			method: "POST",
			headers: authHeaders(),
			body: small,
		});
		// Whatever the route does (likely 400 because we omitted required
		// fields), it must NOT be 413.
		expect(res.status).not.toBe(413);
	});
});
