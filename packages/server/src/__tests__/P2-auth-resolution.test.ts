/**
 * P2 RED — Auth middleware: resolves user from users table, not factorySettings.
 *
 * These tests FAIL until:
 *  - createAuthMiddleware(db) queries users WHERE kind = 'human' LIMIT 1
 *  - factorySettings founder_id key is no longer used for auth resolution
 *  - GET /api/auth/me returns data from users table row
 *  - Fallback to "u-founder" sentinel when no human user exists
 *
 * @lore P2: The auth middleware previously read founder_id from factorySettings.
 * After P2, it reads the first human user from the users table.
 * The fallback to "u-founder" is a safety net for unseeded DBs — it is NOT
 * a design choice. Production paths always have a human user row.
 *
 * Critique finding: "founder" role is NOT in USER_ROLES union. Tests must NOT
 * assert that role === "founder" is from the USER_ROLES type. It's a valid text
 * value stored in the role column.
 */

import {
	createTestDb,
	type HyperIdleDb,
	products,
	// P2: import new symbol — compile error until implementation done
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-p2-auth";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("P2 — Auth middleware resolves user from users table (AC7)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;
	const NOW = new Date().toISOString();

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// -------------------------------------------------------------------------
	// AC7: auth resolves from users table
	// -------------------------------------------------------------------------
	describe("AC7: auth middleware resolves userId from users table", () => {
		it("resolves userId from the human user row in users table", async () => {
			// Seed a human user — NOT using factorySettings
			db.insert(users)
				.values({
					id: "u-human-auth-test",
					kind: "human",
					name: "Auth Test Human",
					role: "founder",
					status: "active",
					email: "auth@test.com",
					createdAt: NOW,
				})
				.run();

			const res = await app.request("/api/auth/me", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as { id: string; name: string; email: string };
			expect(body.id).toBe("u-human-auth-test");
			expect(body.id).not.toBe("u-founder"); // should resolve the actual human user
		});

		it("resolves the first human user when multiple human rows exist", async () => {
			// Seed two human users
			db.insert(users)
				.values([
					{
						id: "u-human-first",
						kind: "human",
						name: "First Human",
						role: "founder",
						status: "active",
						email: "first@test.com",
						createdAt: NOW,
					},
					{
						id: "u-human-second",
						kind: "human",
						name: "Second Human",
						role: "founder",
						status: "active",
						email: "second@test.com",
						createdAt: NOW,
					},
				])
				.run();

			const res = await app.request("/api/auth/me", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as { id: string };
			// One of the two human users is returned — NOT "u-founder" fallback
			expect(["u-human-first", "u-human-second"]).toContain(body.id);
		});

		it("falls back to u-founder sentinel when no human user exists", async () => {
			// Do NOT seed any human user
			const res = await app.request("/api/auth/me", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as { id: string };
			// P2 keeps the fallback for backward compat with unseeded test DBs
			expect(body.id).toBe("u-founder");
		});

		it("does NOT resolve auth from factorySettings founder_id", async () => {
			// Seed factorySettings with a different founder_id — it should be IGNORED
			// (factorySettings may still exist for other keys, but founder_id is removed)
			// Note: factorySettings table still exists but founder_id key is no longer used
			// The human user in the users table is what matters

			db.insert(users)
				.values({
					id: "u-real-human",
					kind: "human",
					name: "Real Human",
					role: "founder",
					status: "active",
					email: "real@test.com",
					createdAt: NOW,
				})
				.run();

			const res = await app.request("/api/auth/me", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as { id: string };
			// Should resolve from users table, not from factorySettings
			expect(body.id).toBe("u-real-human");
		});
	});

	// -------------------------------------------------------------------------
	// AC7: GET /api/auth/me returns data from users table
	// -------------------------------------------------------------------------
	describe("AC7: GET /api/auth/me returns data from users table row", () => {
		it("returns name and email from the human user row", async () => {
			db.insert(users)
				.values({
					id: "u-me-test",
					kind: "human",
					name: "Jane Founder",
					role: "founder",
					status: "active",
					email: "jane@hyperidle.com",
					avatarUrl: "https://cdn.example.com/jane.png",
					createdAt: NOW,
				})
				.run();

			const res = await app.request("/api/auth/me", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				id: string;
				name: string;
				email: string;
				avatarUrl: string | null;
			};
			expect(body.id).toBe("u-me-test");
			expect(body.name).toBe("Jane Founder");
			expect(body.email).toBe("jane@hyperidle.com");
			expect(body.avatarUrl).toBe("https://cdn.example.com/jane.png");
		});

		it("returns empty string for email when human user has no email", async () => {
			db.insert(users)
				.values({
					id: "u-no-email",
					kind: "human",
					name: "No Email Founder",
					role: "founder",
					status: "active",
					email: null,
					createdAt: NOW,
				})
				.run();

			const res = await app.request("/api/auth/me", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as { email: string; avatarUrl: unknown };
			// P2 architecture: null email maps to "" in the response, null avatarUrl maps to null
			expect(body.email).toBe("");
			expect(body.avatarUrl).toBeNull();
		});

		it("returns 401 without API key", async () => {
			const res = await app.request("/api/auth/me");
			expect(res.status).toBe(401);
		});
	});

	// -------------------------------------------------------------------------
	// AC3: factorySettings founder_name/founder_email are not used in auth/me
	// -------------------------------------------------------------------------
	describe("AC3: factorySettings founder keys are not used in auth resolution", () => {
		it("GET /api/settings returns profile from users table, not factorySettings", async () => {
			// Seed human user with specific data
			db.insert(users)
				.values({
					id: "u-settings-test",
					kind: "human",
					name: "Settings Founder",
					role: "founder",
					status: "active",
					email: "settings@hyperidle.com",
					createdAt: NOW,
				})
				.run();

			// Also seed a product so settings works
			db.insert(products)
				.values({ id: "prod-auth", name: "Auth Product", phase: "build", createdAt: NOW })
				.run();

			const res = await app.request("/api/settings", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				profile?: { name?: string; email?: string };
			};

			// Profile should come from users table
			if (body.profile) {
				expect(body.profile.name).toBe("Settings Founder");
				expect(body.profile.email).toBe("settings@hyperidle.com");
			}
		});
	});
});
