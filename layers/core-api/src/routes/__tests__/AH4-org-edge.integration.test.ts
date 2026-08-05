/**
 * AH4 — Integration tests: org-edge wiring + agent placement.
 *
 * AC1: POST /api/teams inserts a founder→team org edge.
 * AC2: POST /api/agents with teamId sets users.teamId.
 * AC3: After team + agent creation, GET /api/org reflects real structure (no orphans).
 * AC4: Edge creation is idempotent; PUT /api/org/edges still returns 201/200 after refactor.
 * Rider FK-422: POST /api/agents with an unknown teamId returns 422 (not 500).
 * W1: resolveFounderId path 1 (auth context) wins over body userId (anti-spoof).
 */

import { orgEdges, teamMembers, teams, users } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-ah4-org";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

const NOW = new Date().toISOString();

describe("AH4 — Org edge wiring", () => {
	beforeEach(() => {
		process.env.HYPERIDLE_API_KEY = TEST_API_KEY;
	});

	afterEach(() => {
		delete process.env.HYPERIDLE_API_KEY;
	});

	// ── AC1: POST /api/teams creates the founder→team org edge ─────────────────

	describe("AC1 — POST /api/teams produces a founder→team org edge", () => {
		test("inserts exactly one org edge with mechanism='team' after team creation", async ({
			db,
			app,
		}) => {
			// Seed a human founder
			await db.insert(users).values({
				id: "ah4-founder-1",
				kind: "human",
				name: "Founder One",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			const res = await app.request("/api/teams", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: "AH4 Test Team", userId: "ah4-founder-1" }),
			});

			// Team creation succeeds
			expect(res.status).toBe(201);
			const body = (await res.json()) as {
				team: { id: string };
				teamMembers: { id: string };
			};
			const teamMembersId = body.teamMembers.id;

			// Exactly one org edge for the (founder, "team", teamMembersId) tuple
			const edges = await db
				.select()
				.from(orgEdges)
				.where(
					and(
						eq(orgEdges.fromUserId, "ah4-founder-1"),
						eq(orgEdges.mechanism, "team"),
						eq(orgEdges.target, teamMembersId),
					),
				);

			expect(edges).toHaveLength(1);
			expect(edges[0]).toMatchObject({
				fromUserId: "ah4-founder-1",
				mechanism: "team",
				target: teamMembersId,
			});
		});

		test("team creation is non-fatal when founder cannot be resolved (no userId, no human user)", async ({
			app,
		}) => {
			// No human user seeded → founder lookup falls back through all paths to null
			const res = await app.request("/api/teams", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: "Orphan Team" }), // no userId
			});

			// Team creation still succeeds — edge creation is best-effort
			expect(res.status).toBe(201);
			const body = (await res.json()) as {
				team: { id: string };
				teamMembers: { id: string };
			};
			expect(typeof body.team.id).toBe("string");
		});
	});

	// ── AC2: POST /api/agents with teamId sets users.teamId ────────────────────

	describe("AC2 — POST /api/agents with teamId lands agent in that team", () => {
		test("agent created with teamId has users.teamId set to the submitted value", async ({
			db,
			app,
		}) => {
			// Seed a team so FK constraint is satisfiable
			await db.insert(teams).values({
				id: "ah4-team-agent",
				name: "Agent Team",
				phase: "build",
				createdAt: NOW,
			});
			await db.insert(teamMembers).values({
				id: "ah4-tm-agent",
				teamId: "ah4-team-agent",
				capacity: 5,
				activeBets: 0,
				formedAt: NOW,
			});

			const res = await app.request("/api/agents", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					name: "AH4 Builder",
					role: "builder",
					teamId: "ah4-tm-agent",
				}),
			});

			expect(res.status).toBe(201);
			const created = (await res.json()) as { id: string };

			// Verify users.teamId is set in the DB
			const [row] = await db.select().from(users).where(eq(users.id, created.id)).limit(1);
			expect(row?.teamId).toBe("ah4-tm-agent");
		});
	});

	// ── Rider FK-422: unknown teamId → 422, not 500 ────────────────────────────

	describe("Rider FK-422 — POST /api/agents with unknown teamId returns 422", () => {
		test("returns 422 when teamId does not exist in teamMembers", async ({ app }) => {
			const res = await app.request("/api/agents", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					name: "Stale Agent",
					role: "builder",
					teamId: "non-existent-tm-id",
				}),
			});

			expect(res.status).toBe(422);
		});
	});

	// ── AC3: After team + agent creation, GET /api/org reflects real structure ──

	describe("AC3 — GET /api/org reflects no orphans after team+agent creation", () => {
		test("GET /api/org shows founder→team edge and agent.teamId after full setup", async ({
			db,
			app,
		}) => {
			// Seed founder
			await db.insert(users).values({
				id: "ah4-founder-3",
				kind: "human",
				name: "Founder Three",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			// Create team (auto-creates edge)
			const teamRes = await app.request("/api/teams", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: "Full Org Team", userId: "ah4-founder-3" }),
			});
			expect(teamRes.status).toBe(201);
			const teamBody = (await teamRes.json()) as { teamMembers: { id: string } };
			const teamMembersId = teamBody.teamMembers.id;

			// Create agent in that team
			const agentRes = await app.request("/api/agents", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					name: "Org Team Builder",
					role: "builder",
					teamId: teamMembersId,
				}),
			});
			expect(agentRes.status).toBe(201);
			const agentBody = (await agentRes.json()) as { id: string };

			// GET /api/org — verify edge present and agent not orphaned
			const orgRes = await app.request("/api/org", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(orgRes.status).toBe(200);
			const orgBody = (await orgRes.json()) as {
				edges: { fromUserId: string; mechanism: string; target: string }[];
				users: { id: string }[];
			};

			// Founder→team edge must exist
			const teamEdge = orgBody.edges.find(
				(e) =>
					e.fromUserId === "ah4-founder-3" && e.mechanism === "team" && e.target === teamMembersId,
			);
			expect(teamEdge).toBeDefined();

			// Agent is in the users list
			const agentUser = orgBody.users.find((u) => u.id === agentBody.id);
			expect(agentUser).toBeDefined();

			// Agent's teamId in DB resolves to the correct teamMembers row
			const [agentRow] = await db.select().from(users).where(eq(users.id, agentBody.id)).limit(1);
			expect(agentRow?.teamId).toBe(teamMembersId);
		});
	});

	// ── AC4: Idempotency — no duplicate edges ───────────────────────────────────

	describe("AC4 — Edge creation is idempotent; no duplicates", () => {
		test("POST /api/teams then PUT /api/org/edges with same tuple → PUT returns 200 (existing), count=1", async ({
			db,
			app,
		}) => {
			// Seed founder
			await db.insert(users).values({
				id: "ah4-founder-4",
				kind: "human",
				name: "Founder Four",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			// Create team (inserts edge automatically)
			const teamRes = await app.request("/api/teams", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: "Idempotent Team", userId: "ah4-founder-4" }),
			});
			expect(teamRes.status).toBe(201);
			const teamBody = (await teamRes.json()) as { teamMembers: { id: string } };
			const teamMembersId = teamBody.teamMembers.id;

			// Retrieve the edge created by team creation
			const edgesAfterTeam = await db
				.select()
				.from(orgEdges)
				.where(
					and(
						eq(orgEdges.fromUserId, "ah4-founder-4"),
						eq(orgEdges.mechanism, "team"),
						eq(orgEdges.target, teamMembersId),
					),
				);
			expect(edgesAfterTeam).toHaveLength(1);
			const originalEdgeId = edgesAfterTeam[0]!.id;

			// Now PUT /api/org/edges with the identical tuple → must return 200 + same id
			const putRes = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: "ah4-founder-4",
					mechanism: "team",
					target: teamMembersId,
				}),
			});
			expect(putRes.status).toBe(200); // Existing edge → 200
			const putBody = (await putRes.json()) as { id: string };
			expect(putBody.id).toBe(originalEdgeId);

			// Still only one row in the DB
			const edgesAfterPut = await db
				.select()
				.from(orgEdges)
				.where(
					and(
						eq(orgEdges.fromUserId, "ah4-founder-4"),
						eq(orgEdges.mechanism, "team"),
						eq(orgEdges.target, teamMembersId),
					),
				);
			expect(edgesAfterPut).toHaveLength(1);
		});

		test("PUT /api/org/edges returns 201 on first create, 200 on subsequent (status split preserved)", async ({
			db,
			app,
		}) => {
			// Seed users and team
			await db.insert(teams).values({
				id: "ah4-team-upsert",
				name: "Upsert Team",
				phase: "build",
				createdAt: NOW,
			});
			await db.insert(teamMembers).values({
				id: "ah4-tm-upsert",
				teamId: "ah4-team-upsert",
				capacity: 5,
				activeBets: 0,
				formedAt: NOW,
			});
			await db.insert(users).values({
				id: "ah4-human-upsert",
				kind: "human",
				name: "Upsert Founder",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			// First PUT → 201 (create)
			const first = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: "ah4-human-upsert",
					mechanism: "team",
					target: "ah4-tm-upsert",
				}),
			});
			expect(first.status).toBe(201);
			const firstBody = (await first.json()) as { id: string };

			// Second PUT → 200 (existing, same id)
			const second = await app.request("/api/org/edges", {
				method: "PUT",
				headers: authHeaders(),
				body: JSON.stringify({
					fromUserId: "ah4-human-upsert",
					mechanism: "team",
					target: "ah4-tm-upsert",
				}),
			});
			expect(second.status).toBe(200);
			const secondBody = (await second.json()) as { id: string };
			expect(secondBody.id).toBe(firstBody.id);
		});
	});

	// ── W1: resolveFounderId path 1 (auth context) wins over body userId ───────

	describe("W1 — resolveFounderId: auth-context userId wins over body userId (anti-spoof)", () => {
		test("org edge uses auth-context userId (founder A), not body userId (founder B)", async ({
			db,
			app,
		}) => {
			/**
			 * @lore AH4 W1: In local mode, createAuthMiddleware resolves c.get("userId")
			 * from the first kind='human' row in the DB (ordered by DB insertion order).
			 * By seeding founder A first, the auth middleware sets c.get("userId") = A.
			 * The body carries userId = B. resolveFounderId() checks the auth context
			 * (path 1) first and returns A — B is never used. This test proves the
			 * spoofing defense: a caller cannot claim an arbitrary fromUserId via the body.
			 */

			// Seed founder A first — auth middleware will resolve this as c.get("userId")
			await db.insert(users).values({
				id: "ah4-w1-founder-a",
				kind: "human",
				name: "Founder A (auth context)",
				role: "founder",
				status: "active",
				createdAt: NOW,
			});

			// Seed founder B — this is what the request body will carry
			await db.insert(users).values({
				id: "ah4-w1-founder-b",
				kind: "human",
				name: "Founder B (body spoof attempt)",
				role: "member",
				status: "active",
				createdAt: NOW,
			});

			// POST /api/teams with userId = B in the body
			const res = await app.request("/api/teams", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: "W1 Anti-Spoof Team", userId: "ah4-w1-founder-b" }),
			});

			expect(res.status).toBe(201);
			const body = (await res.json()) as {
				team: { id: string };
				teamMembers: { id: string };
			};
			const teamMembersId = body.teamMembers.id;

			// The org edge must use founder A (auth context), NOT founder B (body)
			const edges = await db
				.select()
				.from(orgEdges)
				.where(and(eq(orgEdges.mechanism, "team"), eq(orgEdges.target, teamMembersId)));

			expect(edges).toHaveLength(1);
			expect(edges[0]?.fromUserId).toBe("ah4-w1-founder-a");
			expect(edges[0]?.fromUserId).not.toBe("ah4-w1-founder-b");
		});
	});
});
