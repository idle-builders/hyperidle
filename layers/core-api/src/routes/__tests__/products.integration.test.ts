/**
 * L13 — GET /api/teams and GET /api/teams/:id integration tests (red phase).
 *
 * AC coverage:
 * 1. GET /api/teams returns { products: [] } when the table is empty.
 * 2. GET /api/teams returns one row with derived activeBets, shipped, shipRate for seeded fixture.
 * 3. GET /api/teams/:id returns 404 for an unknown id.
 * 4. GET /api/teams/:id returns 500 with code 'team_missing' when the team for a product is absent.
 * 5. GET /api/teams/:id returns populated ProductDetail for a seeded product+team+roster+bets.
 * 6. GET /api/teams/:id returns activeBets: [] for a product whose bets are all shipped.
 */

import { bets, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-products";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

const NOW = new Date().toISOString();

describe("GET /api/teams", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// @lore AU38 P4: the original claimed `{ teams: [] }` on an empty table — a
	// global absence a populated world cannot honour. Re-homed on the shape the
	// test actually guards: the response carries a `teams` array.
	test("returns a teams array regardless of world state", async ({ app }) => {
		const res = await app.request("/api/teams", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		// @lore U1: route now returns { teams: [] } (renamed from { products: [] })
		expect(body).toHaveProperty("teams");
		expect(Array.isArray(body.teams)).toBe(true);
	});

	test("returns one row with derived activeBets, shipped, shipRate for a seeded product+team+bet+task fixture", async ({
		db,
		app,
		ids,
	}) => {
		await db
			.insert(teams)
			.values({ id: ids("p1"), name: "HyperIdle Core", phase: "build", createdAt: NOW });

		await db
			.insert(teamMembers)
			.values({ id: ids("t1"), teamId: ids("p1"), capacity: 5, activeBets: 0, formedAt: NOW });

		await db.insert(bets).values({
			id: ids("b1"),
			teamId: ids("p1"),
			description: "# Active\n\ncommitted bet",
			appetite: "2 weeks",
			status: "active",
			createdAt: NOW,
		});

		await db.insert(bets).values({
			id: ids("b2"),
			teamId: ids("p1"),
			description: "# Shipped\n\nshipped bet",
			appetite: "1 week",
			status: "completed",
			createdAt: NOW,
			completedAt: NOW,
		});

		const res = await app.request("/api/teams", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		// @lore U1: route now returns { teams: [...] } (renamed from { products: [...] })
		const body = (await res.json()) as {
			teams: Array<{
				id: string;
				name: string;
				activeBets: number;
				shipped: number;
				shipRate: string;
			}>;
		};
		// AU38 P6: global list endpoint — find the arranged team inside the
		// response instead of asserting the response holds exactly one team.
		const product = body.teams.find((t) => t.id === ids("p1"));
		expect(product).toBeDefined();
		expect(product!.name).toBe("HyperIdle Core");
		expect(product!.activeBets).toBe(1);
		expect(product!.shipped).toBe(1);
		expect(typeof product!.shipRate).toBe("string");
	});
});

describe("GET /api/teams/:id", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 404 for an unknown id", async ({ app, ids }) => {
		// AU38 P4: a derived id nobody inserted stays absent in a populated world.
		const res = await app.request(`/api/teams/${ids("does-not-exist")}`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(404);
	});

	test("returns 500 with code 'team_missing' when the team for a product is absent", async ({
		db,
		app,
		ids,
	}) => {
		await db
			.insert(teams)
			.values({ id: ids("p-no-team"), name: "Orphan Product", phase: "build", createdAt: NOW });

		const res = await app.request(`/api/teams/${ids("p-no-team")}`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as { code?: string };
		// @lore U1: error code renamed from "team_missing" to "team_members_missing"
		expect(body.code).toBe("team_members_missing");
	});

	test("returns populated ProductDetail for a seeded product+team+roster+bets", async ({
		db,
		app,
		ids,
	}) => {
		await db
			.insert(teams)
			.values({ id: ids("p1"), name: "HyperIdle Core", phase: "build", createdAt: NOW });

		await db.insert(teamMembers).values({
			id: ids("t1"),
			teamId: ids("p1"),
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
		});

		await db.insert(users).values({
			id: ids("agent-lead"),
			name: "Lead Agent",
			role: "lead",
			status: "active",
			teamId: ids("t1"),
			createdAt: NOW,
		});

		await db.insert(users).values({
			id: ids("agent-member"),
			name: "Alice Agent",
			role: "member",
			status: "active",
			teamId: ids("t1"),
			createdAt: NOW,
		});

		await db.insert(bets).values({
			id: ids("b1"),
			teamId: ids("p1"),
			description: "# Active\n\ncommitted bet",
			appetite: "2 weeks",
			status: "active",
			createdAt: NOW,
		});

		await db.insert(bets).values({
			id: ids("b2"),
			teamId: ids("p1"),
			description: "# In progress\n\nin progress bet",
			appetite: "6 weeks",
			status: "active",
			createdAt: NOW,
		});

		await db.insert(bets).values({
			id: ids("b-shipped"),
			teamId: ids("p1"),
			description: "# Shipped\n\nshipped bet",
			appetite: "1 week",
			status: "completed",
			createdAt: NOW,
			completedAt: NOW,
		});

		// Tasks for b1
		await db.insert(tasks).values({
			id: ids("task-1"),
			betId: ids("b1"),
			teamId: ids("p1"),
			title: "Task 1",
			state: "done",
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(tasks).values({
			id: ids("task-2"),
			betId: ids("b1"),
			teamId: ids("p1"),
			title: "Task 2",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});

		// Update the team to reference lead agent
		// (teams.leadAgentId is set separately)

		const res = await app.request(`/api/teams/${ids("p1")}`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		// @lore U1: response shape changed: product+team → team+teamMembers
		const body = (await res.json()) as {
			team: { id: string; name: string };
			teamMembers: { id: string };
			roster: Array<{ agentId: string; name: string; isLead: boolean }>;
			burn: {
				capacity: number;
				activeBets: number;
			};
			activeBets: Array<{
				id: string;
				status: string;
				progressDone: number;
				progressTotal: number;
			}>;
		};

		// Team (formerly Product) summary
		expect(body.team.id).toBe(ids("p1"));
		expect(body.team.name).toBe("HyperIdle Core");

		// TeamMembers (formerly Team)
		expect(body.teamMembers.id).toBe(ids("t1"));

		// Roster — 2 members (team-scoped response; this test arranged both)
		expect(body.roster).toHaveLength(2);

		// Active bets — only committed and in_progress (not shipped)
		expect(body.activeBets).toHaveLength(2);
		const betIds = body.activeBets.map((b) => b.id);
		expect(betIds).toContain(ids("b1"));
		expect(betIds).toContain(ids("b2"));
		expect(betIds).not.toContain(ids("b-shipped"));

		// Progress on b1
		const bet1 = body.activeBets.find((b) => b.id === ids("b1"));
		expect(bet1).toBeDefined();
		expect(bet1?.progressDone).toBe(1);
		expect(bet1?.progressTotal).toBe(2);
	});

	test("returns activeBets: [] for a product whose bets are all shipped", async ({
		db,
		app,
		ids,
	}) => {
		await db
			.insert(teams)
			.values({ id: ids("p2"), name: "Shipped Product", phase: "cool-down", createdAt: NOW });

		await db
			.insert(teamMembers)
			.values({ id: ids("t2"), teamId: ids("p2"), capacity: 3, activeBets: 0, formedAt: NOW });

		await db.insert(bets).values({
			id: ids("b-s1"),
			teamId: ids("p2"),
			description: "# Shipped\n\nshipped bet",
			appetite: "1 week",
			status: "completed",
			createdAt: NOW,
			completedAt: NOW,
		});

		const res = await app.request(`/api/teams/${ids("p2")}`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { activeBets: unknown[] };
		// Scoped absence: every bet this test arranged on its own team shipped.
		expect(body.activeBets).toEqual([]);
	});
});
