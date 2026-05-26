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
	createTestDb,
	type HyperIdleDb,
	// P2: import new symbols — compile error until implementation done
	orgEdges,
	products,
	teams,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-p2-org";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("P2 — /api/org endpoints (AC5, AC6, AC10)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;
	const NOW = new Date().toISOString();

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		// Seed prerequisite data
		db.insert(products)
			.values({ id: "prod-org", name: "Org Product", phase: "build", createdAt: NOW })
			.run();
		db.insert(teams)
			.values({
				id: "team-org",
				productId: "prod-org",
				capacity: 5,
				activeBets: 0,
				formedAt: NOW,
			})
			.run();

		// Seed a human user (the org edge owner)
		db.insert(users)
			.values({
				id: "u-human-org",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				email: "founder@example.com",
				createdAt: NOW,
			})
			.run();

		// Seed an AI user (the org edge target)
		db.insert(users)
			.values({
				id: "u-ai-org",
				kind: "ai",
				name: "Builder Bot",
				role: "builder",
				status: "active",
				teamId: "team-org",
				createdAt: NOW,
			})
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// -------------------------------------------------------------------------
	// AC6: GET /api/org
	// -------------------------------------------------------------------------
	describe("AC6: GET /api/org", () => {
		it("returns 200 with edges and users arrays when org chart is empty", async () => {
			const res = await app.request("/api/org", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				edges: unknown[];
				users: unknown[];
			};
			expect(Array.isArray(body.edges)).toBe(true);
			expect(body.edges).toHaveLength(0);
			expect(Array.isArray(body.users)).toBe(true);
		});

		it("returns edges with correct shape after inserting one", async () => {
			// Pre-seed an edge directly in DB
			db.insert(orgEdges)
				.values({
					id: "edge-org-1",
					fromUserId: "u-human-org",
					mechanism: "direct",
					target: "u-ai-org",
					createdAt: NOW,
				})
				.run();

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

			expect(body.edges).toHaveLength(1);
			expect(body.edges[0]).toMatchObject({
				fromUserId: "u-human-org",
				mechanism: "direct",
				target: "u-ai-org",
			});

			// users array in response has id, kind, name, role
			const userIds = body.users.map((u) => u.id);
			expect(userIds).toContain("u-human-org");
			expect(userIds).toContain("u-ai-org");
			for (const u of body.users) {
				expect(u).toHaveProperty("id");
				expect(u).toHaveProperty("kind");
				expect(u).toHaveProperty("name");
				expect(u).toHaveProperty("role");
			}
		});

		it("requires authentication", async () => {
			const res = await app.request("/api/org");
			expect(res.status).toBe(401);
		});
	});

	// -------------------------------------------------------------------------
	// AC6: PUT /api/org/edges
	// -------------------------------------------------------------------------
	describe("AC6: PUT /api/org/edges", () => {
		it("creates a new edge and returns 201", async () => {
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: "u-human-org",
					mechanism: "direct",
					target: "u-ai-org",
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
			expect(body.fromUserId).toBe("u-human-org");
			expect(body.mechanism).toBe("direct");
			expect(body.target).toBe("u-ai-org");
			expect(body.id).toBeDefined();
			expect(typeof body.id).toBe("string");
		});

		it("upserts: returns 200 when the same edge already exists", async () => {
			const payload = {
				fromUserId: "u-human-org",
				mechanism: "direct",
				target: "u-ai-org",
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
		});

		it("returns 400 for invalid mechanism value", async () => {
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: "u-human-org",
					mechanism: "invalid_mechanism",
					target: "u-ai-org",
				}),
			});
			expect(res.status).toBe(400);
		});

		it("returns 400 when fromUserId is missing", async () => {
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					mechanism: "direct",
					target: "u-ai-org",
				}),
			});
			expect(res.status).toBe(400);
		});

		it("returns 400 when target is empty string", async () => {
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: "u-human-org",
					mechanism: "direct",
					target: "",
				}),
			});
			expect(res.status).toBe(400);
		});

		it("returns 400 when mechanism=direct and target userId does not exist", async () => {
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: "u-human-org",
					mechanism: "direct",
					target: "u-nonexistent-user",
				}),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("returns 400 when mechanism=function and target is not a valid UserRole", async () => {
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: "u-human-org",
					mechanism: "function",
					target: "garbage_role",
				}),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("returns 400 when mechanism=team and target teamId does not exist", async () => {
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: "u-human-org",
					mechanism: "team",
					target: "nonexistent-team-id",
				}),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("creates a function-mechanism edge", async () => {
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: "u-human-org",
					mechanism: "function",
					target: "builder",
				}),
			});
			expect(res.status).toBe(201);

			const body = (await res.json()) as { mechanism: string; target: string };
			expect(body.mechanism).toBe("function");
			expect(body.target).toBe("builder");
		});

		it("creates a team-mechanism edge", async () => {
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: "u-human-org",
					mechanism: "team",
					target: "team-org",
				}),
			});
			expect(res.status).toBe(201);

			const body = (await res.json()) as { mechanism: string };
			expect(body.mechanism).toBe("team");
		});

		it("requires authentication", async () => {
			const res = await app.request("/api/org/edges", {
				method: "PUT",
				body: JSON.stringify({
					fromUserId: "u-human-org",
					mechanism: "direct",
					target: "u-ai-org",
				}),
			});
			expect(res.status).toBe(401);
		});
	});

	// -------------------------------------------------------------------------
	// AC6: DELETE /api/org/edges/:id
	// -------------------------------------------------------------------------
	describe("AC6: DELETE /api/org/edges/:id", () => {
		it("returns 204 after deleting an existing edge", async () => {
			// Create edge first via API
			const createRes = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: "u-human-org",
					mechanism: "direct",
					target: "u-ai-org",
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
		});

		it("returns 404 when deleting a nonexistent edge", async () => {
			const res = await app.request("/api/org/edges/nonexistent-edge-id", {
				method: "DELETE",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});

		it("edge is gone from GET /api/org after deletion", async () => {
			// Create edge
			const createRes = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: "u-human-org",
					mechanism: "direct",
					target: "u-ai-org",
				}),
			});
			const created = (await createRes.json()) as { id: string };

			// Delete it
			await app.request(`/api/org/edges/${created.id}`, {
				method: "DELETE",
				headers: authHeaders(),
			});

			// Verify it's gone
			const listRes = await app.request("/api/org", { headers: authHeaders() });
			const listBody = (await listRes.json()) as { edges: unknown[] };
			expect(listBody.edges).toHaveLength(0);
		});

		it("requires authentication", async () => {
			const res = await app.request("/api/org/edges/some-id", {
				method: "DELETE",
			});
			expect(res.status).toBe(401);
		});
	});
});
