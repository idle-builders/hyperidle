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
	createTestDb,
	type HyperIdleDb,
	products,
	type TestDbHandle,
	teams,
	userSkills,
	// P2: import new symbols — compile error until implementation done
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-p2-users";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("P2 — /api/users endpoints (AC4, AC10)", () => {
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

		// Seed prerequisite data
		await db
			.insert(products)
			.values({ id: "prod-p2", name: "P2 Product", phase: "build", createdAt: NOW });

		await db.insert(teams).values({
			id: "team-p2",
			productId: "prod-p2",
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
		});

		// Seed users (AI kind)
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

		// Seed user skills
		await db.insert(userSkills).values([
			{ userId: "user-p2-1", skillId: "coding", autonomyLevel: 2 },
			{ userId: "user-p2-1", skillId: "testing", autonomyLevel: 3 },
		]);
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	// -------------------------------------------------------------------------
	// AC4: /api/users replaces /api/agents
	// -------------------------------------------------------------------------
	describe("AC4: /api/users route exists (was /api/agents)", () => {
		it("GET /api/users returns 200 and list of users", async () => {
			const res = await app.request("/api/users", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Array<Record<string, unknown>>;
			expect(Array.isArray(body)).toBe(true);
			expect(body.length).toBeGreaterThanOrEqual(2);
		});

		it("GET /api/agents returns 404 (route renamed to /api/users)", async () => {
			const res = await app.request("/api/agents", { headers: authHeaders() });
			expect(res.status).toBe(404);
		});

		it("GET /api/users returns users with activeSessions count", async () => {
			const res = await app.request("/api/users", { headers: authHeaders() });
			const body = (await res.json()) as Array<Record<string, unknown>>;

			expect(body[0]).toHaveProperty("activeSessions");
			expect(body[0]).toHaveProperty("status");
			expect(body[0]).toHaveProperty("role");
		});

		it("GET /api/users returns kind field on each user", async () => {
			const res = await app.request("/api/users", { headers: authHeaders() });
			const body = (await res.json()) as Array<Record<string, unknown>>;

			for (const user of body) {
				expect(user).toHaveProperty("kind");
				expect(["human", "ai"]).toContain(user.kind as string);
			}
		});
	});

	// -------------------------------------------------------------------------
	// AC10: user detail endpoint
	// -------------------------------------------------------------------------
	describe("AC10: GET /api/users/:id — user detail", () => {
		it("returns 200 with user details including skills", async () => {
			const res = await app.request("/api/users/user-p2-1", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.id).toBe("user-p2-1");
			expect(body).toHaveProperty("skills");
		});

		it("returns 404 for unknown user id", async () => {
			const res = await app.request("/api/users/nonexistent-id", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});
	});

	// -------------------------------------------------------------------------
	// AC10: user skill update endpoint
	// -------------------------------------------------------------------------
	describe("AC10: PATCH /api/users/:id/skills/:skillId — update autonomy level", () => {
		it("returns 200 after updating skill autonomy level", async () => {
			const res = await app.request("/api/users/user-p2-1/skills/coding", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 4 }),
			});
			expect(res.status).toBe(200);
		});

		it("returns 400 for invalid autonomy level", async () => {
			const res = await app.request("/api/users/user-p2-1/skills/coding", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ autonomyLevel: 999 }),
			});
			expect(res.status).toBe(400);
		});
	});

	// -------------------------------------------------------------------------
	// AC10: user inbox endpoints
	// -------------------------------------------------------------------------
	describe("AC10: GET /api/users/:id/inbox — user inbox", () => {
		it("returns 200 with empty inbox array by default", async () => {
			const res = await app.request("/api/users/user-p2-1/inbox", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as { messages: unknown[]; total: number };
			expect(Array.isArray(body.messages)).toBe(true);
		});
	});

	// -------------------------------------------------------------------------
	// AC3: No factorySettings founder keys in responses
	// -------------------------------------------------------------------------
	describe("AC3: responses do not reference factorySettings founder keys", () => {
		it("GET /api/users returns users array without factorySettings dependency", async () => {
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
		});
	});
});
