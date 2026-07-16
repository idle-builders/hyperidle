/**
 * P2 RED — User routes: CRUD endpoints under /api/users.
 *
 * These tests FAIL until:
 *  - routes/users.ts exports createUserRoutes(db)
 *  - app.ts mounts createUserRoutes at /api/users
 *  - /api/agents route is removed or returns 404
 *  - schema.ts exports users, userSkills tables
 *
 * @lore P2: The /api/agents route is renamed to /api/users. All existing
 * endpoint behaviors are preserved — only the path changes.
 */

import {
	teamMembers,
	teams,
	userSkills,
	// P2: import new symbols — compile error until implementation done
	users,
} from "@hyperidle/db";
import { describe, expect, vi } from "vitest";
import { test } from "../test-fixtures.js";

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
			await db.insert(teamMembers).values({
				id: "team-p2",
				teamId: "prod-p2",
				capacity: 5,
				activeBets: 0,
				formedAt: NOW,
			});
			await db.insert(users).values([
				{
					id: "user-p2-1",
					kind: "ai",
					name: "Builder Bot",
					role: "builder",
					status: "active",
					teamId: "team-p2",
					createdAt: NOW,
				},
				{
					id: "user-p2-2",
					kind: "ai",
					name: "Growth Bot",
					role: "growth",
					status: "active",
					teamId: "team-p2",
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
		// 404 assertion is no longer valid. See plans/X3/architecture.md §3 for the
		// design rationale (separate routes, separate authorization model).

		test("GET /api/users returns users with activeSessions count", async ({ app, db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db
				.insert(teams)
				.values({ id: "prod-p2", name: "P2 Product", phase: "build", createdAt: NOW });
			await db.insert(teamMembers).values({
				id: "team-p2",
				teamId: "prod-p2",
				capacity: 5,
				activeBets: 0,
				formedAt: NOW,
			});
			await db.insert(users).values({
				id: "user-p2-1",
				kind: "ai",
				name: "Builder Bot",
				role: "builder",
				status: "active",
				teamId: "team-p2",
				createdAt: NOW,
			});

			const res = await app.request("/api/users", { headers: authHeaders() });
			const body = (await res.json()) as Array<Record<string, unknown>>;

			expect(body[0]).toHaveProperty("activeSessions");
			expect(body[0]).toHaveProperty("status");
			expect(body[0]).toHaveProperty("role");
			vi.unstubAllEnvs();
		});

		test("GET /api/users returns kind field on each user", async ({ app, db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db
				.insert(teams)
				.values({ id: "prod-p2", name: "P2 Product", phase: "build", createdAt: NOW });
			await db.insert(teamMembers).values({
				id: "team-p2",
				teamId: "prod-p2",
				capacity: 5,
				activeBets: 0,
				formedAt: NOW,
			});
			await db.insert(users).values([
				{
					id: "user-p2-1",
					kind: "ai",
					name: "Builder Bot",
					role: "builder",
					status: "active",
					teamId: "team-p2",
					createdAt: NOW,
				},
				{
					id: "user-p2-2",
					kind: "ai",
					name: "Growth Bot",
					role: "growth",
					status: "active",
					teamId: "team-p2",
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
		test("returns 200 with user details including skills", async ({ app, db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db
				.insert(teams)
				.values({ id: "prod-p2", name: "P2 Product", phase: "build", createdAt: NOW });
			await db.insert(teamMembers).values({
				id: "team-p2",
				teamId: "prod-p2",
				capacity: 5,
				activeBets: 0,
				formedAt: NOW,
			});
			await db.insert(users).values({
				id: "user-p2-1",
				kind: "ai",
				name: "Builder Bot",
				role: "builder",
				status: "active",
				teamId: "team-p2",
				createdAt: NOW,
			});
			await db.insert(userSkills).values([
				{ userId: "user-p2-1", skillId: "coding", autonomyLevel: 2 },
				{ userId: "user-p2-1", skillId: "testing", autonomyLevel: 3 },
			]);

			const res = await app.request("/api/users/user-p2-1", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.id).toBe("user-p2-1");
			expect(body).toHaveProperty("skills");
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

	// -------------------------------------------------------------------------
	// AC10: user skill update endpoint
	// -------------------------------------------------------------------------
	describe("AC10: PATCH /api/users/:id/skills/:skillId — update autonomy level", () => {
		test("returns 200 after updating skill autonomy level", async ({ app, db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db
				.insert(teams)
				.values({ id: "prod-p2", name: "P2 Product", phase: "build", createdAt: NOW });
			await db.insert(teamMembers).values({
				id: "team-p2",
				teamId: "prod-p2",
				capacity: 5,
				activeBets: 0,
				formedAt: NOW,
			});
			await db.insert(users).values({
				id: "user-p2-1",
				kind: "ai",
				name: "Builder Bot",
				role: "builder",
				status: "active",
				teamId: "team-p2",
				createdAt: NOW,
			});
			await db
				.insert(userSkills)
				.values({ userId: "user-p2-1", skillId: "coding", autonomyLevel: 2 });

			const res = await app.request("/api/users/user-p2-1/skills/coding", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 4 }),
			});
			expect(res.status).toBe(200);
			vi.unstubAllEnvs();
		});

		test("returns 400 for invalid autonomy level", async ({ app, db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db
				.insert(teams)
				.values({ id: "prod-p2", name: "P2 Product", phase: "build", createdAt: NOW });
			await db.insert(teamMembers).values({
				id: "team-p2",
				teamId: "prod-p2",
				capacity: 5,
				activeBets: 0,
				formedAt: NOW,
			});
			await db.insert(users).values({
				id: "user-p2-1",
				kind: "ai",
				name: "Builder Bot",
				role: "builder",
				status: "active",
				teamId: "team-p2",
				createdAt: NOW,
			});
			await db
				.insert(userSkills)
				.values({ userId: "user-p2-1", skillId: "coding", autonomyLevel: 2 });

			const res = await app.request("/api/users/user-p2-1/skills/coding", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 999 }),
			});
			expect(res.status).toBe(400);
			vi.unstubAllEnvs();
		});
	});

	// -------------------------------------------------------------------------
	// AC10: user inbox endpoints
	// -------------------------------------------------------------------------
	describe("AC10: GET /api/users/:id/inbox — user inbox", () => {
		test("returns 200 with empty inbox array by default", async ({ app, db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db
				.insert(teams)
				.values({ id: "prod-p2", name: "P2 Product", phase: "build", createdAt: NOW });
			await db.insert(teamMembers).values({
				id: "team-p2",
				teamId: "prod-p2",
				capacity: 5,
				activeBets: 0,
				formedAt: NOW,
			});
			await db.insert(users).values({
				id: "user-p2-1",
				// AF11: kind='human' so auth middleware resolves this user as the principal.
				// GET /api/users/:id/inbox is principal-self only (AC5 AF11); principal must
				// match the inbox owner. With kind='human', resolved principal = "user-p2-1".
				kind: "human",
				name: "Builder Bot",
				role: "builder",
				status: "active",
				teamId: "team-p2",
				createdAt: NOW,
			});

			const res = await app.request("/api/users/user-p2-1/inbox", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as { messages: unknown[]; total: number };
			expect(Array.isArray(body.messages)).toBe(true);
			vi.unstubAllEnvs();
		});
	});

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
			await db.insert(teamMembers).values({
				id: "team-p2",
				teamId: "prod-p2",
				capacity: 5,
				activeBets: 0,
				formedAt: NOW,
			});
			await db.insert(users).values({
				id: "user-p2-1",
				kind: "ai",
				name: "Builder Bot",
				role: "builder",
				status: "active",
				teamId: "team-p2",
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
