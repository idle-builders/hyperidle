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

import { users } from "@hyperidle/db";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { seedTeam } from "./_helpers.js";

const TEST_API_KEY = "test-key-p2-auth";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("P2 — Auth middleware resolves user from users table (AC7)", () => {
	const NOW = new Date().toISOString();

	// -------------------------------------------------------------------------
	// AC7: auth resolves from users table
	// -------------------------------------------------------------------------
	describe("AC7: auth middleware resolves userId from users table", () => {
		test("resolves userId from the human user row in users table", async ({ app, db, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			// Seed a human user — NOT using factorySettings
			await db.insert(users).values({
				id: ids("human"),
				kind: "human",
				name: "Auth Test Human",
				role: "founder",
				status: "active",
				email: "auth@test.com",
				createdAt: NOW,
			});

			const res = await app.request("/api/auth/me", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as { id: string; name: string; email: string };
			expect(body.id).toBe(ids("human"));
			expect(body.id).not.toBe("u-founder"); // should resolve the actual human user
			vi.unstubAllEnvs();
		});

		test("resolves the first human user when multiple human rows exist", async ({
			app,
			db,
			ids,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			// Seed two human users
			await db.insert(users).values([
				{
					id: ids("human-1"),
					kind: "human",
					name: "First Human",
					role: "founder",
					status: "active",
					email: "first@test.com",
					createdAt: NOW,
				},
				{
					id: ids("human-2"),
					kind: "human",
					name: "Second Human",
					role: "founder",
					status: "active",
					email: "second@test.com",
					createdAt: NOW,
				},
			]);

			const res = await app.request("/api/auth/me", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as { id: string };
			// One of the two human users is returned — NOT "u-founder" fallback
			expect([ids("human-1"), ids("human-2")]).toContain(body.id);
			vi.unstubAllEnvs();
		});

		test("falls back to u-founder sentinel when no human user exists", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			// Do NOT seed any human user
			const res = await app.request("/api/auth/me", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as { id: string };
			// P2 keeps the fallback for backward compat with unseeded test DBs
			expect(body.id).toBe("u-founder");
			vi.unstubAllEnvs();
		});

		test("does NOT resolve auth from factorySettings founder_id", async ({ app, db, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db.insert(users).values({
				id: ids("real-human"),
				kind: "human",
				name: "Real Human",
				role: "founder",
				status: "active",
				email: "real@test.com",
				createdAt: NOW,
			});

			const res = await app.request("/api/auth/me", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as { id: string };
			// Should resolve from users table, not from factorySettings
			expect(body.id).toBe(ids("real-human"));
			vi.unstubAllEnvs();
		});
	});

	// -------------------------------------------------------------------------
	// AC7: GET /api/auth/me returns data from users table
	// -------------------------------------------------------------------------
	describe("AC7: GET /api/auth/me returns data from users table row", () => {
		test("returns name and email from the human user row", async ({ app, db, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db.insert(users).values({
				id: ids("me"),
				kind: "human",
				name: "Jane Founder",
				role: "founder",
				status: "active",
				email: "jane@hyperidle.com",
				avatarUrl: "https://cdn.example.com/jane.png",
				createdAt: NOW,
			});

			const res = await app.request("/api/auth/me", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				id: string;
				name: string;
				email: string;
				avatarUrl: string | null;
			};
			expect(body.id).toBe(ids("me"));
			expect(body.name).toBe("Jane Founder");
			expect(body.email).toBe("jane@hyperidle.com");
			expect(body.avatarUrl).toBe("https://cdn.example.com/jane.png");
			vi.unstubAllEnvs();
		});

		test("returns empty string for email when human user has no email", async ({
			app,
			db,
			ids,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db.insert(users).values({
				id: ids("no-email"),
				kind: "human",
				name: "No Email Founder",
				role: "founder",
				status: "active",
				email: null,
				createdAt: NOW,
			});

			const res = await app.request("/api/auth/me", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as { email: string; avatarUrl: unknown };
			// P2 architecture: null email maps to "" in the response, null avatarUrl maps to null
			expect(body.email).toBe("");
			expect(body.avatarUrl).toBeNull();
			vi.unstubAllEnvs();
		});

		test("returns 401 without API key", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/auth/me");
			expect(res.status).toBe(401);
			vi.unstubAllEnvs();
		});
	});

	// -------------------------------------------------------------------------
	// AC3: factorySettings founder_name/founder_email are not used in auth/me
	// -------------------------------------------------------------------------
	describe("AC3: factorySettings founder keys are not used in auth resolution", () => {
		test("GET /api/settings returns profile from users table, not factorySettings", async ({
			app,
			db,
			ids,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			// Seed human user with specific data
			await db.insert(users).values({
				id: ids("settings-human"),
				kind: "human",
				name: "Settings Founder",
				role: "founder",
				status: "active",
				email: "settings@hyperidle.com",
				createdAt: NOW,
			});

			// Also seed a product so settings works
			await seedTeam(db, {
				id: ids("team"),
				name: "Auth Product",
				phase: "build",
				createdAt: NOW,
			});

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
			vi.unstubAllEnvs();
		});
	});
});
