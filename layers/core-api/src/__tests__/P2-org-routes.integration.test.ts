/**
 * P2 RED — Org chart API routes: GET /api/org, PUT /api/org/edges, DELETE /api/org/edges/:id.
 *
 * These tests FAIL until:
 *  - routes/org.ts exports createOrgRoutes(db)
 *  - app.ts mounts createOrgRoutes at /api/org
 *  - schema.ts exports orgEdges table
 *
 * @lore P2: The org routes handle the OrgChart primitive. PUT /api/org/edges is
 * an upsert: if the (fromUserId, mechanism, target) tuple already exists, it
 * returns 200 with the existing edge; otherwise creates and returns 201.
 */

import {
	// P2: import new symbols — compile error until implementation done
	orgEdges,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-p2-org";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

/** Seed the prerequisite rows for org tests (team, members, human + AI users). */
async function seedOrgBase(db: import("@hyperidle/db").HyperIdleDb, ids: ScopedIds): Promise<void> {
	const NOW = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: ids("team"), name: "Org Product", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: ids("tm"),
		teamId: ids("team"),
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(users).values({
		id: ids("human"),
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		email: "founder@example.com",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: ids("ai"),
		kind: "ai",
		name: "Builder Bot",
		role: "builder",
		status: "active",
		teamId: ids("tm"),
		createdAt: NOW,
	});
}

describe("P2 — /api/org endpoints (AC5, AC6, AC10)", () => {
	// -------------------------------------------------------------------------
	// AC6: GET /api/org
	// -------------------------------------------------------------------------
	describe("AC6: GET /api/org", () => {
		test("returns 200 with edges and users arrays when org chart is empty", async ({
			app,
			db,
			ids,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedOrgBase(db, ids);

			const res = await app.request("/api/org", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				edges: unknown[];
				users: unknown[];
			};
			expect(Array.isArray(body.edges)).toBe(true);
			expect(Array.isArray(body.users)).toBe(true);
			vi.unstubAllEnvs();
		});

		test("returns edges with correct shape after inserting one", async ({ app, db, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedOrgBase(db, ids);

			// Pre-seed an edge directly in DB
			await db.insert(orgEdges).values({
				id: ids("edge"),
				fromUserId: ids("human"),
				mechanism: "direct",
				target: ids("ai"),
				createdAt: new Date().toISOString(),
			});

			const res = await app.request("/api/org", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				edges: Array<{
					id: string;
					fromUserId: string;
					mechanism: string;
					target: string;
					createdAt: string;
				}>;
				users: Array<{
					id: string;
					kind: string;
					name: string;
					role: string;
				}>;
			};

			const myEdge = body.edges.find((e) => e.id === ids("edge"));
			expect(myEdge).toBeDefined();
			expect(myEdge).toMatchObject({
				fromUserId: ids("human"),
				mechanism: "direct",
				target: ids("ai"),
			});

			// users array in response has id, kind, name, role
			const userIds = body.users.map((u) => u.id);
			expect(userIds).toContain(ids("human"));
			expect(userIds).toContain(ids("ai"));
			for (const u of body.users) {
				expect(u).toHaveProperty("id");
				expect(u).toHaveProperty("kind");
				expect(u).toHaveProperty("name");
				expect(u).toHaveProperty("role");
			}
			vi.unstubAllEnvs();
		});

		test("requires authentication", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/org");
			expect(res.status).toBe(401);
			vi.unstubAllEnvs();
		});
	});

	// -------------------------------------------------------------------------
	// AC6: PUT /api/org/edges
	// -------------------------------------------------------------------------
	describe("AC6: PUT /api/org/edges", () => {
		test("creates a new edge and returns 201", async ({ app, db, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedOrgBase(db, ids);

			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: ids("human"),
					mechanism: "direct",
					target: ids("ai"),
				}),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as {
				id: string;
				fromUserId: string;
				mechanism: string;
				target: string;
				createdAt: string;
			};
			expect(body.fromUserId).toBe(ids("human"));
			expect(body.mechanism).toBe("direct");
			expect(body.target).toBe(ids("ai"));
			expect(body.id).toBeDefined();
			expect(typeof body.id).toBe("string");
			vi.unstubAllEnvs();
		});

		test("upserts: returns 200 when the same edge already exists", async ({ app, db, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedOrgBase(db, ids);

			const payload = {
				fromUserId: ids("human"),
				mechanism: "direct",
				target: ids("ai"),
			};

			const res1 = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify(payload),
			});
			expect(res1.status).toBe(201);

			// Second call with same tuple
			const res2 = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify(payload),
			});
			expect(res2.status).toBe(200);
			vi.unstubAllEnvs();
		});

		test("returns 400 for invalid mechanism value", async ({ app, db, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db.insert(users).values({
				id: ids("human"),
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				email: "founder@example.com",
				createdAt: new Date().toISOString(),
			});

			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: ids("human"),
					mechanism: "invalid_mechanism",
					target: ids("ai"),
				}),
			});
			expect(res.status).toBe(400);
			vi.unstubAllEnvs();
		});

		test("returns 400 when fromUserId is missing", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					mechanism: "direct",
					target: "u-ai-org",
				}),
			});
			expect(res.status).toBe(400);
			vi.unstubAllEnvs();
		});

		test("returns 400 when target is empty string", async ({ app, db, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db.insert(users).values({
				id: ids("human"),
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				email: "founder@example.com",
				createdAt: new Date().toISOString(),
			});
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: ids("human"),
					mechanism: "direct",
					target: "",
				}),
			});
			expect(res.status).toBe(400);
			vi.unstubAllEnvs();
		});

		test("returns 400 when mechanism=direct and target userId does not exist", async ({
			app,
			db,
			ids,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db.insert(users).values({
				id: ids("human"),
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				email: "founder@example.com",
				createdAt: new Date().toISOString(),
			});
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: ids("human"),
					mechanism: "direct",
					target: ids("nonexistent-user"),
				}),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
			vi.unstubAllEnvs();
		});

		// @lore AB0: UserRole is now an open string (not a closed enum). Any non-empty string
		// is a valid function-mechanism target. The only invalid case is an empty string.
		test("returns 400 when mechanism=function and target is an empty string", async ({
			app,
			db,
			ids,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db.insert(users).values({
				id: ids("human"),
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				email: "founder@example.com",
				createdAt: new Date().toISOString(),
			});
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: ids("human"),
					mechanism: "function",
					target: "",
				}),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
			vi.unstubAllEnvs();
		});

		test("returns 400 when mechanism=team and target teamId does not exist", async ({
			app,
			db,
			ids,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db.insert(users).values({
				id: ids("human"),
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				email: "founder@example.com",
				createdAt: new Date().toISOString(),
			});
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: ids("human"),
					mechanism: "team",
					target: ids("nonexistent-team"),
				}),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
			vi.unstubAllEnvs();
		});

		test("creates a function-mechanism edge", async ({ app, db, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await db.insert(users).values({
				id: ids("human"),
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				email: "founder@example.com",
				createdAt: new Date().toISOString(),
			});

			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: ids("human"),
					mechanism: "function",
					target: "builder",
				}),
			});
			expect(res.status).toBe(201);

			const body = (await res.json()) as { mechanism: string; target: string };
			expect(body.mechanism).toBe("function");
			expect(body.target).toBe("builder");
			vi.unstubAllEnvs();
		});

		test("creates a team-mechanism edge", async ({ app, db, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedOrgBase(db, ids);

			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: ids("human"),
					mechanism: "team",
					target: ids("tm"),
				}),
			});
			expect(res.status).toBe(201);

			const body = (await res.json()) as { mechanism: string };
			expect(body.mechanism).toBe("team");
			vi.unstubAllEnvs();
		});

		test("requires authentication", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				body: JSON.stringify({
					fromUserId: "u-human-org",
					mechanism: "direct",
					target: "u-ai-org",
				}),
			});
			expect(res.status).toBe(401);
			vi.unstubAllEnvs();
		});
	});

	// -------------------------------------------------------------------------
	// AC6: DELETE /api/org/edges/:id
	// -------------------------------------------------------------------------
	describe("AC6: DELETE /api/org/edges/:id", () => {
		test("returns 204 after deleting an existing edge", async ({ app, db, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedOrgBase(db, ids);

			// Create edge first via API
			const createRes = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: ids("human"),
					mechanism: "direct",
					target: ids("ai"),
				}),
			});
			expect(createRes.status).toBe(201);

			const created = (await createRes.json()) as { id: string };
			const edgeId = created.id;

			// Delete the edge
			const deleteRes = await app.request(`/api/org/edges/${edgeId}`, {
				method: "DELETE",
				headers: authHeaders(),
			});
			expect(deleteRes.status).toBe(204);
			vi.unstubAllEnvs();
		});

		test("returns 404 when deleting a nonexistent edge", async ({ app, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request(`/api/org/edges/${ids("nonexistent-edge")}`, {
				method: "DELETE",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
			vi.unstubAllEnvs();
		});

		test("edge is gone from GET /api/org after deletion", async ({ app, db, ids }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			await seedOrgBase(db, ids);

			// Create edge
			const createRes = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: ids("human"),
					mechanism: "direct",
					target: ids("ai"),
				}),
			});
			const created = (await createRes.json()) as { id: string };

			// Delete it
			await app.request(`/api/org/edges/${created.id}`, {
				method: "DELETE",
				headers: authHeaders(),
			});

			// Verify it's gone — scope to our edge id
			const listRes = await app.request("/api/org", { headers: authHeaders() });
			const listBody = (await listRes.json()) as { edges: Array<{ id: string }> };
			const myEdge = listBody.edges.find((e) => e.id === created.id);
			expect(myEdge).toBeUndefined();
			vi.unstubAllEnvs();
		});

		test("requires authentication", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/org/edges/some-id", {
				method: "DELETE",
			});
			expect(res.status).toBe(401);
			vi.unstubAllEnvs();
		});
	});
});
