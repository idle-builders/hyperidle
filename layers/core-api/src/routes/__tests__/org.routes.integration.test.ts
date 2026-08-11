/**
 * V1 — Route integration tests for org endpoints.
 *
 * GET    /api/org              — full org chart (edges + users)
 * PUT    /api/org/edges        — upsert an edge
 * DELETE /api/org/edges/:id   — delete an edge
 */

import { type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-org";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedUsers(
	db: HyperIdleDb,
	ids: ScopedIds,
): Promise<{ fromUserId: string; targetUserId: string; teamMembersId: string }> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: ids("team-1"), name: "Test Team", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: ids("tm-1"), teamId: ids("team-1"), capacity: 5, activeBets: 0, formedAt: now });
	await db.insert(users).values({
		id: ids("human-1"),
		kind: "human",
		name: "From User",
		role: "admin",
		status: "active",
		createdAt: now,
	});
	await db.insert(users).values({
		id: ids("agent-1"),
		kind: "ai",
		name: "Target Agent",
		role: "builder",
		status: "active",
		teamId: ids("tm-1"),
		createdAt: now,
	});
	return { fromUserId: ids("human-1"), targetUserId: ids("agent-1"), teamMembersId: ids("tm-1") };
}

describe("org routes", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("GET /api/org", () => {
		test("returns 401 without auth", async ({ app }) => {
			const res = await app.request("/api/org", { method: "GET" });
			expect(res.status).toBe(401);
		});

		test("returns 200 with edges and users arrays", async ({ db, app, ids }) => {
			await seedUsers(db, ids);
			const res = await app.request("/api/org", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				edges: unknown[];
				users: Array<{ id: string }>;
			};
			expect(Array.isArray(body.edges)).toBe(true);
			expect(Array.isArray(body.users)).toBe(true);
			// AU38 P6: global org chart — assert the arranged users are present,
			// not that the chart holds exactly two users.
			const userIds = body.users.map((u) => u.id);
			expect(userIds).toContain(ids("human-1"));
			expect(userIds).toContain(ids("agent-1"));
		});

		test("returns no edges for users that have none arranged", async ({ db, app, ids }) => {
			// AU38 P4: the original claimed a globally empty edges array; in a
			// populated world other tests' edges exist. Re-homed on this test's
			// own scope: its arranged users have no edges, so none of the
			// response's edges may anchor on them.
			await seedUsers(db, ids);
			const res = await app.request("/api/org", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { edges: Array<{ fromUserId: string }> };
			expect(Array.isArray(body.edges)).toBe(true);
			expect(body.edges.filter((e) => e.fromUserId === ids("human-1"))).toHaveLength(0);
		});
	});

	describe("PUT /api/org/edges", () => {
		test("returns 401 without auth", async ({ app }) => {
			const res = await app.request("/api/org/edges", { method: "PUT" });
			expect(res.status).toBe(401);
		});

		test("returns 201 with created edge on valid input (mechanism=direct)", async ({
			db,
			app,
			ids,
		}) => {
			const { fromUserId, targetUserId } = await seedUsers(db, ids);
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

		test("returns 200 with existing edge on duplicate tuple (upsert)", async ({ db, app, ids }) => {
			const { fromUserId, targetUserId } = await seedUsers(db, ids);
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

		test("returns 400 when fromUserId not found", async ({ db, app, ids }) => {
			await seedUsers(db, ids);
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: ids("non-existent"),
					mechanism: "direct",
					target: ids("agent-1"),
				}),
			});
			expect(res.status).toBe(400);
		});

		test("returns 400 when target userId not found (mechanism=direct)", async ({
			db,
			app,
			ids,
		}) => {
			const { fromUserId } = await seedUsers(db, ids);
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId,
					mechanism: "direct",
					target: ids("non-existent-user"),
				}),
			});
			expect(res.status).toBe(400);
		});

		// AB0: roles are now open strings — any non-empty string is valid.
		// The security boundary moved from "not in USER_ROLES enum" to "empty string".
		test("returns 400 when target role is empty string (mechanism=function)", async ({
			db,
			app,
			ids,
		}) => {
			const { fromUserId } = await seedUsers(db, ids);
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
			ids,
		}) => {
			const { fromUserId } = await seedUsers(db, ids);
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ fromUserId, mechanism: "function", target: "custom_specialist" }),
			});
			expect(res.status).toBe(201);
		});

		test("returns 400 when target teamId not found (mechanism=team)", async ({ db, app, ids }) => {
			const { fromUserId } = await seedUsers(db, ids);
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({ fromUserId, mechanism: "team", target: ids("non-existent-team") }),
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
		test("returns 401 without auth", async ({ app, ids }) => {
			const res = await app.request(`/api/org/edges/${ids("some-id")}`, { method: "DELETE" });
			expect(res.status).toBe(401);
		});

		test("returns 204 on successful delete", async ({ db, app, ids }) => {
			const { fromUserId, targetUserId } = await seedUsers(db, ids);
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

		test("returns 404 for non-existent edge", async ({ app, ids }) => {
			// AU38 P4: a derived id nobody inserted stays absent in a populated world.
			const res = await app.request(`/api/org/edges/${ids("non-existent")}`, {
				method: "DELETE",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});
	});
});
