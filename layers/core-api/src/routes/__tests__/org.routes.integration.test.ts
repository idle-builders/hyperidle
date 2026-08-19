/**
 * V1 — Route integration tests for org endpoints.
 *
 * GET    /api/org              — full org chart (edges + users)
 * PUT    /api/org/edges        — upsert an edge
 * DELETE /api/org/edges/:id   — delete an edge
 */

import { type HyperIdleDb, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-org";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedUsers(
	db: HyperIdleDb,
): Promise<{ fromUserId: string; targetUserId: string; teamMembersId: string }> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "team-1", name: "Test Team", phase: "build", createdAt: now });
	await db.insert(users).values({
		id: "human-1",
		kind: "human",
		name: "From User",
		role: "admin",
		status: "active",
		createdAt: now,
	});
	await db.insert(users).values({
		id: "agent-1",
		kind: "ai",
		name: "Target Agent",
		role: "builder",
		status: "active",
		teamId: "tm-1",
		createdAt: now,
	});
	return { fromUserId: "human-1", targetUserId: "agent-1", teamMembersId: "tm-1" };
}

describe("org routes", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("GET /api/org", () => {
		test("returns 401 without auth", async ({ requestWithoutAuth }) => {
			const res = await requestWithoutAuth("/api/org", { method: "GET" });
			expect(res.status).toBe(401);
		});

		test("returns 200 with edges and users arrays", async ({ db, app }) => {
			await seedUsers(db);
			const res = await app.request("/api/org", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { edges: unknown[]; users: unknown[] };
			expect(Array.isArray(body.edges)).toBe(true);
			expect(Array.isArray(body.users)).toBe(true);
			expect(body.users).toHaveLength(2);
		});

		test("returns empty edges when none exist", async ({ app }) => {
			const res = await app.request("/api/org", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { edges: unknown[] };
			expect(body.edges).toHaveLength(0);
		});
	});

	describe("PUT /api/org/edges", () => {
		test("returns 401 without auth", async ({ requestWithoutAuth }) => {
			const res = await requestWithoutAuth("/api/org/edges", { method: "PUT" });
			expect(res.status).toBe(401);
		});

		test("returns 201 with created edge on valid input (mechanism=direct)", async ({ db, app }) => {
			const { fromUserId, targetUserId } = await seedUsers(db);
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ fromUserId, mechanism: "direct", target: targetUserId }),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as { id: string; fromUserId: string };
			expect(typeof body.id).toBe("string");
			expect(body.fromUserId).toBe(fromUserId);
		});

		test("returns 200 with existing edge on duplicate tuple (upsert)", async ({ db, app }) => {
			const { fromUserId, targetUserId } = await seedUsers(db);
			// First PUT: creates
			await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ fromUserId, mechanism: "direct", target: targetUserId }),
			});
			// Second PUT: returns existing
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ fromUserId, mechanism: "direct", target: targetUserId }),
			});
			expect(res.status).toBe(200);
		});

		test("returns 400 when fromUserId not found", async ({ db, app }) => {
			await seedUsers(db);
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: "non-existent",
					mechanism: "direct",
					target: "agent-1",
				}),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 when target userId not found (mechanism=direct)", async ({ db, app }) => {
			const { fromUserId } = await seedUsers(db);
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ fromUserId, mechanism: "direct", target: "non-existent-user" }),
			});
			expect(res.status).toBe(400);
		});

		// AB0: roles are now open strings — any non-empty string is valid.
		// The security boundary moved from "not in USER_ROLES enum" to "empty string".
		test("returns 400 when target role is empty string (mechanism=function)", async ({
			db,
			app,
		}) => {
			const { fromUserId } = await seedUsers(db);
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ fromUserId, mechanism: "function", target: "" }),
			});
			expect(res.status).toBe(400);
		});

		test("returns 201 when target role is a custom string (mechanism=function, AB0)", async ({
			db,
			app,
		}) => {
			const { fromUserId } = await seedUsers(db);
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ fromUserId, mechanism: "function", target: "custom_specialist" }),
			});
			expect(res.status).toBe(201);
		});

		test("returns 400 when target teamId not found (mechanism=team)", async ({ db, app }) => {
			const { fromUserId } = await seedUsers(db);
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ fromUserId, mechanism: "team", target: "non-existent-team" }),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 on missing required fields", async ({ app }) => {
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ mechanism: "direct" }),
			});
			expect(res.status).toBe(400);
		});
	});

	describe("DELETE /api/org/edges/:id", () => {
		test("returns 401 without auth", async ({ requestWithoutAuth }) => {
			const res = await requestWithoutAuth("/api/org/edges/some-id", { method: "DELETE" });
			expect(res.status).toBe(401);
		});

		test("returns 204 on successful delete", async ({ db, app }) => {
			const { fromUserId, targetUserId } = await seedUsers(db);
			// Create an edge first
			const createRes = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ fromUserId, mechanism: "direct", target: targetUserId }),
			});
			const created = (await createRes.json()) as { id: string };

			const res = await app.request(`/api/org/edges/${created.id}`, {
				method: "DELETE",
				headers: authHeaders(),
			});
			expect(res.status).toBe(204);
		});

		test("returns 404 for non-existent edge", async ({ app }) => {
			const res = await app.request("/api/org/edges/non-existent", {
				method: "DELETE",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});
	});
});
