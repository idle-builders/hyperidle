/**
 * AD2 — Route integration test for GET /api/dispatch-queue.
 */

import { createTestDb, type HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-dispatch-queue";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

describe("GET /api/dispatch-queue", () => {
	let handle: Awaited<ReturnType<typeof createTestDb>>;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		const eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
	}, 30_000);

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle.close();
	});

	it("returns a snapshot with entries array and draining boolean", async () => {
		const res = await app.request("/api/dispatch-queue", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.entries)).toBe(true);
		expect(typeof body.draining).toBe("boolean");
	});

	it("rejects unauthenticated requests", async () => {
		const res = await app.request("/api/dispatch-queue", {
			headers: { "X-API-Key": "wrong-key" },
		});
		expect(res.status).toBe(401);
	});
});
