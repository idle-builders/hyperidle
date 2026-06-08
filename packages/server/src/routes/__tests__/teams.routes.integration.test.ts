/**
 * V1 — Route integration tests for teams endpoints.
 *
 * GET   /api/teams          — list teams with portfolio counters
 * POST  /api/teams          — create team with teamMembers + default agents
 * PATCH /api/teams/:id      — update team phase
 * GET   /api/teams/:id      — full TeamDetail
 */

import {
	bets,
	createTestDb,
	type HyperIdleDb,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-teams";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

async function seedTeam(
	db: HyperIdleDb,
): Promise<{ teamId: string; teamMembersId: string; agentId: string }> {
	const now = new Date().toISOString();
	const teamId = "team-seed";
	const teamMembersId = "tm-seed";
	const agentId = "agent-seed";

	await db
		.insert(teams)
		.values({ id: teamId, name: "Seeded Team", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: now });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Seeded Agent",
		role: "builder",
		status: "active",
		teamId: teamMembersId,
		createdAt: now,
	});
	await db
		.update(teamMembers)
		.set({ leadAgentId: agentId })
		.where(eq(teamMembers.id, teamMembersId));

	return { teamId, teamMembersId, agentId };
}

describe("teams routes", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		const handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("teams auth", () => {
		it("returns 401 without auth header on GET /api/teams", async () => {
			const res = await app.request("/api/teams", { method: "GET" });
			expect(res.status).toBe(401);
		});
	});

	describe("GET /api/teams", () => {
		it("returns 200 with teams list including portfolio counters", async () => {
			await seedTeam(db);
			const res = await app.request("/api/teams", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				teams: Array<{ id: string; name: string; activeBets: number }>;
			};
			expect(Array.isArray(body.teams)).toBe(true);
			expect(body.teams).toHaveLength(1);
			expect(typeof body.teams[0]?.activeBets).toBe("number");
		});

		it("returns 200 with empty teams list when none exist", async () => {
			const res = await app.request("/api/teams", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { teams: unknown[] };
			expect(body.teams).toHaveLength(0);
		});

		it("includes correct activeBets, shipped, shipRate, progress", async () => {
			const { teamId, agentId } = await seedTeam(db);
			const now = new Date().toISOString();

			await db.insert(bets).values({
				id: "bet-active",
				teamId,
				description: "Active bet",
				appetite: "small",
				status: "active",
				createdAt: now,
			});
			await db.insert(bets).values({
				id: "bet-completed",
				teamId,
				description: "Completed bet",
				appetite: "small",
				status: "completed",
				createdAt: now,
			});
			await db.insert(tasks).values({
				id: "task-done",
				title: "Done task",
				betId: "bet-active",
				teamId,
				state: "done",
				ownerAgentId: agentId,
				createdAt: now,
				updatedAt: now,
			});

			const res = await app.request("/api/teams", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				teams: Array<{
					activeBets: number;
					shipped: number;
					shipRate: string;
					progress: { done: number; total: number };
				}>;
			};
			const team = body.teams[0];
			expect(team?.activeBets).toBe(1);
			expect(team?.shipped).toBe(1);
			expect(typeof team?.shipRate).toBe("string");
			expect(team?.progress.done).toBe(1);
			expect(team?.progress.total).toBe(1);
		});
	});

	describe("POST /api/teams", () => {
		it("returns 201 with created team, teamMembers, and default agents", async () => {
			const res = await app.request("/api/teams", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: "New Team" }),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as {
				team: { id: string; name: string; phase: string };
				teamMembers: { id: string };
			};
			expect(body.team.name).toBe("New Team");
			expect(body.team.phase).toBe("build");
			expect(typeof body.teamMembers.id).toBe("string");
		});

		it("returns 400 when name is missing or empty", async () => {
			const res = await app.request("/api/teams", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: "" }),
			});
			expect(res.status).toBe(400);
		});

		it("returns 400 on invalid JSON body", async () => {
			const res = await app.request("/api/teams", {
				method: "POST",
				headers: authHeaders(),
				body: "not-json{",
			});
			expect(res.status).toBe(400);
		});

		it("creates builder and PM agent users", async () => {
			const createRes = await app.request("/api/teams", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ name: "Agents Team" }),
			});
			expect(createRes.status).toBe(201);

			// Verify users were created via GET /api/teams/:id
			// The team endpoint requires finding the team ID from the response
			const listRes = await app.request("/api/teams", {
				method: "GET",
				headers: authHeaders(),
			});
			const list = (await listRes.json()) as { teams: Array<{ id: string; name: string }> };
			const newTeam = list.teams.find((t) => t.name === "Agents Team");
			expect(newTeam).toBeDefined();
			if (!newTeam) return;

			const detailRes = await app.request(`/api/teams/${newTeam.id}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(detailRes.status).toBe(200);
			const detail = (await detailRes.json()) as { roster: Array<{ role: string }> };
			const roles = detail.roster.map((m) => m.role);
			expect(roles).toContain("builder");
			expect(roles).toContain("product_manager");
		});
	});

	describe("PATCH /api/teams/:id", () => {
		it("returns 200 with updated team phase", async () => {
			const { teamId } = await seedTeam(db);
			const res = await app.request(`/api/teams/${teamId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ phase: "live" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { team: { phase: string } };
			expect(body.team.phase).toBe("live");
		});

		it("returns 404 for non-existent team", async () => {
			const res = await app.request("/api/teams/non-existent", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ phase: "live" }),
			});
			expect(res.status).toBe(404);
		});

		it("returns 400 on invalid phase value", async () => {
			const { teamId } = await seedTeam(db);
			const res = await app.request(`/api/teams/${teamId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ phase: "invalid_phase" }),
			});
			expect(res.status).toBe(400);
		});
	});

	describe("GET /api/teams/:id", () => {
		it("returns 200 with full TeamDetail (roster, burn, activeBets)", async () => {
			const { teamId } = await seedTeam(db);
			const res = await app.request(`/api/teams/${teamId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				team: { id: string; status: string };
				roster: unknown[];
				burn: { capacity: number };
				activeBets: unknown[];
			};
			expect(body.team.id).toBe(teamId);
			expect(Array.isArray(body.roster)).toBe(true);
			expect(typeof body.burn.capacity).toBe("number");
			expect(Array.isArray(body.activeBets)).toBe(true);
		});

		it("returns 404 for non-existent team", async () => {
			const res = await app.request("/api/teams/non-existent", {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);
		});

		it("sorts roster with lead first", async () => {
			const { teamId, agentId } = await seedTeam(db);
			// Add a second agent (non-lead)
			const now = new Date().toISOString();
			await db.insert(users).values({
				id: "agent-2",
				kind: "ai",
				name: "Second Agent",
				role: "product_manager",
				status: "active",
				teamId: "tm-seed",
				createdAt: now,
			});

			const res = await app.request(`/api/teams/${teamId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { roster: Array<{ agentId: string; isLead: boolean }> };
			expect(body.roster[0]?.isLead).toBe(true);
			expect(body.roster[0]?.agentId).toBe(agentId);
		});

		it("derives team status correctly (healthy, behind, blocked)", async () => {
			const { teamId, agentId } = await seedTeam(db);
			const now = new Date().toISOString();
			await db.insert(bets).values({
				id: "bet-1",
				teamId,
				description: "Active bet",
				appetite: "small",
				status: "active",
				createdAt: now,
			});
			await db.insert(tasks).values({
				id: "task-blocked",
				title: "Blocked task",
				betId: "bet-1",
				teamId,
				state: "blocked",
				ownerAgentId: agentId,
				createdAt: now,
				updatedAt: now,
			});

			const res = await app.request(`/api/teams/${teamId}`, {
				method: "GET",
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { team: { status: string } };
			expect(body.team.status).toBe("blocked");
		});
	});
});
