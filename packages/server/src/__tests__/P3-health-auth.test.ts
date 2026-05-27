/**
 * P3 RED — Health check for shared mode (AC-6)
 *
 * AC coverage:
 *  - GET /api/health/auth with valid API key returns 200 with { status: "ok", userId: "..." }
 *  - GET /api/health/auth without API key returns 401
 *  - GET /api/health (existing) still returns 200 without auth
 *  - GET /api/health/auth response includes a timestamp
 */

import { createTestDb, type HyperIdleDb, users ,
	type TestDbHandle
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-p3-health-auth";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, ...extra };
}

describe("P3 AC-6 — Health check for shared mode", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;
	const NOW = new Date().toISOString();

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	describe("GET /api/health (existing, unauthenticated)", () => {
		it("still returns 200 without auth", async () => {
			const res = await app.request("/api/health");
			expect(res.status).toBe(200);
		});

		it("still returns { status: 'ok', timestamp: '...' }", async () => {
			const res = await app.request("/api/health");
			const body = (await res.json()) as { status: string; timestamp: string };
			expect(body.status).toBe("ok");
			expect(typeof body.timestamp).toBe("string");
		});
	});

	describe("GET /api/health/auth", () => {
		it("returns 401 without API key", async () => {
			const res = await app.request("/api/health/auth");
			expect(res.status).toBe(401);
		});

		it("returns 200 with valid API key", async () => {
			// Seed a human user so auth resolves properly
			await db.insert(users)
				.values({
					id: "u-health-test",
					kind: "human",
					name: "Health Test User",
					role: "founder",
					status: "active",
					email: "health@test.com",
					createdAt: NOW,
				})

			const res = await app.request("/api/health/auth", { headers: authHeaders() });
			expect(res.status).toBe(200);
		});

		it("response includes status: 'ok'", async () => {
			await db.insert(users)
				.values({
					id: "u-health-status",
					kind: "human",
					name: "Health Status User",
					role: "founder",
					status: "active",
					email: "health-status@test.com",
					createdAt: NOW,
				})

			const res = await app.request("/api/health/auth", { headers: authHeaders() });
			const body = (await res.json()) as { status: string; timestamp: string; userId: string };
			expect(body.status).toBe("ok");
		});

		it("response includes a timestamp string", async () => {
			await db.insert(users)
				.values({
					id: "u-health-ts",
					kind: "human",
					name: "Timestamp User",
					role: "founder",
					status: "active",
					email: "ts@test.com",
					createdAt: NOW,
				})

			const res = await app.request("/api/health/auth", { headers: authHeaders() });
			const body = (await res.json()) as { timestamp: string };
			expect(typeof body.timestamp).toBe("string");
			expect(body.timestamp.length).toBeGreaterThan(0);
		});

		it("response includes a userId field", async () => {
			await db.insert(users)
				.values({
					id: "u-health-userid",
					kind: "human",
					name: "User ID Test",
					role: "founder",
					status: "active",
					email: "userid@test.com",
					createdAt: NOW,
				})

			const res = await app.request("/api/health/auth", { headers: authHeaders() });
			const body = (await res.json()) as { userId: string };
			expect(typeof body.userId).toBe("string");
			expect(body.userId.length).toBeGreaterThan(0);
		});

		it("returns userId that matches the seeded human user", async () => {
			await db.insert(users)
				.values({
					id: "u-expected-id",
					kind: "human",
					name: "Expected User",
					role: "founder",
					status: "active",
					email: "expected@test.com",
					createdAt: NOW,
				})

			const res = await app.request("/api/health/auth", { headers: authHeaders() });
			const body = (await res.json()) as { userId: string };
			expect(body.userId).toBe("u-expected-id");
		});

		it("returns 401 with wrong API key", async () => {
			const res = await app.request("/api/health/auth", {
				headers: { "X-API-Key": "wrong-key" },
			});
			expect(res.status).toBe(401);
		});
	});
});
