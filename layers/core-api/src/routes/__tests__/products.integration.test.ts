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

	test("returns { teams: [] } when the table is empty", async ({ app }) => {
		const res = await app.request("/api/teams", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		// @lore U1: route now returns { teams: [] } (renamed from { products: [] })
		expect(body).toHaveProperty("teams");
		expect((body.teams as unknown[]).length).toBe(0);
	});

	test("returns one row with derived activeBets, shipped, shipRate for a seeded product+team+bet+task fixture", async ({
		db,
		app,
	}) => {
		await db
			.insert(teams)
			.values({ id: "p1", name: "HyperIdle Core", phase: "build", createdAt: NOW });

		await db
			.insert(teamMembers)
			.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });

		await db.insert(bets).values({
			id: "b1",
			teamId: "p1",
			description: "# Active\n\ncommitted bet",
			appetite: "2 weeks",
			status: "active",
			createdAt: NOW,
		});

		await db.insert(bets).values({
			id: "b2",
			teamId: "p1",
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
		expect(body.teams).toHaveLength(1);
		const product = body.teams[0];
		expect(product!.id).toBe("p1");
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

	test("returns 404 for an unknown id", async ({ app }) => {
		const res = await app.request("/api/teams/does-not-exist", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(404);
	});

	test("returns 500 with code 'team_missing' when the team for a product is absent", async ({
		db,
		app,
	}) => {
		await db
			.insert(teams)
			.values({ id: "p-no-team", name: "Orphan Product", phase: "build", createdAt: NOW });

		const res = await app.request("/api/teams/p-no-team", {
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
	}) => {
		await db
			.insert(teams)
			.values({ id: "p1", name: "HyperIdle Core", phase: "build", createdAt: NOW });

		await db.insert(teamMembers).values({
			id: "t1",
			teamId: "p1",
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
		});

		await db.insert(users).values({
			id: "agent-lead",
			name: "Lead Agent",
			role: "lead",
			status: "active",
			teamId: "t1",
			createdAt: NOW,
		});

		await db.insert(users).values({
			id: "agent-member",
			name: "Alice Agent",
			role: "member",
			status: "active",
			teamId: "t1",
			createdAt: NOW,
		});

		await db.insert(bets).values({
			id: "b1",
			teamId: "p1",
			description: "# Active\n\ncommitted bet",
			appetite: "2 weeks",
			status: "active",
			createdAt: NOW,
		});

		await db.insert(bets).values({
			id: "b2",
			teamId: "p1",
			description: "# In progress\n\nin progress bet",
			appetite: "6 weeks",
			status: "active",
			createdAt: NOW,
		});

		await db.insert(bets).values({
			id: "b-shipped",
			teamId: "p1",
			description: "# Shipped\n\nshipped bet",
			appetite: "1 week",
			status: "completed",
			createdAt: NOW,
			completedAt: NOW,
		});

		// Tasks for b1
		await db.insert(tasks).values({
			id: "task-1",
			betId: "b1",
			teamId: "p1",
			title: "Task 1",
			state: "done",
			createdAt: NOW,
			updatedAt: NOW,
		});

		await db.insert(tasks).values({
			id: "task-2",
			betId: "b1",
			teamId: "p1",
			title: "Task 2",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});

		// Update the team to reference lead agent
		// (teams.leadAgentId is set separately)

		const res = await app.request("/api/teams/p1", {
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
		expect(body.team.id).toBe("p1");
		expect(body.team.name).toBe("HyperIdle Core");

		// TeamMembers (formerly Team)
		expect(body.teamMembers.id).toBe("t1");

		// Roster — 2 members
		expect(body.roster).toHaveLength(2);

		// Active bets — only committed and in_progress (not shipped)
		expect(body.activeBets).toHaveLength(2);
		const betIds = body.activeBets.map((b) => b.id);
		expect(betIds).toContain("b1");
		expect(betIds).toContain("b2");
		expect(betIds).not.toContain("b-shipped");

		// Progress on b1
		const bet1 = body.activeBets.find((b) => b.id === "b1");
		expect(bet1).toBeDefined();
		expect(bet1?.progressDone).toBe(1);
		expect(bet1?.progressTotal).toBe(2);
	});

	test("returns activeBets: [] for a product whose bets are all shipped", async ({ db, app }) => {
		await db
			.insert(teams)
			.values({ id: "p2", name: "Shipped Product", phase: "cool-down", createdAt: NOW });

		await db
			.insert(teamMembers)
			.values({ id: "t2", teamId: "p2", capacity: 3, activeBets: 0, formedAt: NOW });

		await db.insert(bets).values({
			id: "b-s1",
			teamId: "p2",
			description: "# Shipped\n\nshipped bet",
			appetite: "1 week",
			status: "completed",
			createdAt: NOW,
			completedAt: NOW,
		});

		const res = await app.request("/api/teams/p2", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { activeBets: unknown[] };
		expect(body.activeBets).toEqual([]);
	});
});
