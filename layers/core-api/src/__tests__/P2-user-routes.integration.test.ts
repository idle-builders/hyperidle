/**
 * P2 RED — User routes: CRUD endpoints under /api/users.
 *
 * These tests FAIL until:
 *  - routes/users.ts exports createUserRoutes(db)
 *  - app.ts mounts createUserRoutes at /api/users
 *  - /api/agents route is removed or returns 404
 *  - schema.ts exports the users table
 *
 * @lore P2: The /api/agents route is renamed to /api/users. All existing
 * endpoint behaviors are preserved — only the path changes.
 */

import {
	teams,
	// P2: import new symbols — compile error until implementation done
	users,
} from "@hyperidle/db";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-p2-users";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("P2 — /api/users endpoints (AC4, AC10)", () => {
	const NOW = new Date().toISOString();

	// -------------------------------------------------------------------------
	// AC4: /api/users replaces /api/agents
	// -------------------------------------------------------------------------
	describe("AC4: /api/users route exists (was /api/agents)", () => {
		test("GET /api/users returns 200 and list of users", async ({ app, db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db
				.insert(teams)
				.values({ id: "prod-p2", name: "P2 Product", phase: "build", createdAt: NOW });
			await db.insert(users).values([
				{
					id: "user-p2-1",
					kind: "ai",
					name: "Builder Bot",
					role: "builder",
					status: "active",
					teamId: "prod-p2",
					createdAt: NOW,
				},
				{
					id: "user-p2-2",
					kind: "ai",
					name: "Growth Bot",
					role: "growth",
					status: "active",
					teamId: "prod-p2",
					createdAt: NOW,
				},
			]);

			const res = await app.request("/api/users", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Array<Record<string, unknown>>;
			expect(Array.isArray(body)).toBe(true);
			expect(body.length).toBeGreaterThanOrEqual(2);
			vi.unstubAllEnvs();
		});

		// @lore X3: The /api/agents 404 assertion was removed here. X3 reintroduces
		// /api/agents as a dedicated agent management endpoint (GET/POST/PATCH/DELETE)
		// distinct from the general /api/users listing route. The P2 rename assertion
		// (agents → users) was valid when /api/agents was simply removed; now that X3
		// adds it back with a different purpose (agent config, not user listing), the
		// 404 assertion is no longer valid (separate routes, separate authorization model).

		// @lore AU26 J1: the `activeSessions` count is gone from this response.
		test("GET /api/users returns users with their identity fields", async ({ app, db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db
				.insert(teams)
				.values({ id: "prod-p2", name: "P2 Product", phase: "build", createdAt: NOW });
			await db.insert(users).values({
				id: "user-p2-1",
				kind: "ai",
				name: "Builder Bot",
				role: "builder",
				status: "active",
				teamId: "prod-p2",
				createdAt: NOW,
			});

			const res = await app.request("/api/users", { headers: authHeaders() });
			const body = (await res.json()) as Array<Record<string, unknown>>;

			expect(body[0]).toHaveProperty("status");
			expect(body[0]).toHaveProperty("role");
			vi.unstubAllEnvs();
		});

		test("GET /api/users returns kind field on each user", async ({ app, db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db
				.insert(teams)
				.values({ id: "prod-p2", name: "P2 Product", phase: "build", createdAt: NOW });
			await db.insert(users).values([
				{
					id: "user-p2-1",
					kind: "ai",
					name: "Builder Bot",
					role: "builder",
					status: "active",
					teamId: "prod-p2",
					createdAt: NOW,
				},
				{
					id: "user-p2-2",
					kind: "ai",
					name: "Growth Bot",
					role: "growth",
					status: "active",
					teamId: "prod-p2",
					createdAt: NOW,
				},
			]);

			const res = await app.request("/api/users", { headers: authHeaders() });
			const body = (await res.json()) as Array<Record<string, unknown>>;

			for (const user of body) {
				expect(user).toHaveProperty("kind");
				expect(["human", "ai"]).toContain(user.kind as string);
			}
			vi.unstubAllEnvs();
		});
	});

	// -------------------------------------------------------------------------
	// AC10: user detail endpoint
	// -------------------------------------------------------------------------
	describe("AC10: GET /api/users/:id — user detail", () => {
		test("returns 200 with user details", async ({ app, db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db
				.insert(teams)
				.values({ id: "prod-p2", name: "P2 Product", phase: "build", createdAt: NOW });
			await db.insert(users).values({
				id: "user-p2-1",
				kind: "ai",
				name: "Builder Bot",
				role: "builder",
				status: "active",
				teamId: "prod-p2",
				createdAt: NOW,
			});
			const res = await app.request("/api/users/user-p2-1", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.id).toBe("user-p2-1");
			vi.unstubAllEnvs();
		});

		test("returns 404 for unknown user id", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/users/nonexistent-id", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
			vi.unstubAllEnvs();
		});
	});

	// AC10 GET /api/users/:id/inbox (door #92) was deleted. Test removed.

	// -------------------------------------------------------------------------
	// AC3: No factorySettings founder keys in responses
	// -------------------------------------------------------------------------
	describe("AC3: responses do not reference factorySettings founder keys", () => {
		test("GET /api/users returns users array without factorySettings dependency", async ({
			app,
			db,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db
				.insert(teams)
				.values({ id: "prod-p2", name: "P2 Product", phase: "build", createdAt: NOW });
			await db.insert(users).values({
				id: "user-p2-1",
				kind: "ai",
				name: "Builder Bot",
				role: "builder",
				status: "active",
				teamId: "prod-p2",
				createdAt: NOW,
			});

			// If factorySettings founder_name/email are removed from seed,
			// the endpoint must still work — user data comes from users table
			const res = await app.request("/api/users", { headers: authHeaders() });
			expect(res.status).toBe(200);
			// Response must not include factorySettings-derived fields
			const body = (await res.json()) as Array<Record<string, unknown>>;
			for (const user of body) {
				expect(user).not.toHaveProperty("founder_name");
				expect(user).not.toHaveProperty("founder_email");
			}
			vi.unstubAllEnvs();
		});
	});
});
