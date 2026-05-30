/**
 * L13 — GET /api/products and GET /api/products/:id integration tests (red phase).
 *
 * AC coverage:
 * 1. GET /api/products returns { products: [] } when the table is empty.
 * 2. GET /api/products returns one row with derived activeBets, shipped, shipRate for seeded fixture.
 * 3. GET /api/products/:id returns 404 for an unknown id.
 * 4. GET /api/products/:id returns 500 with code 'team_missing' when the team for a product is absent.
 * 5. GET /api/products/:id returns populated ProductDetail for a seeded product+team+roster+bets.
 * 6. GET /api/products/:id returns activeBets: [] for a product whose bets are all shipped.
 * 7. GET /api/products/:id with teams.cost_cap = null returns burn.costCap: null.
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
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-products";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

interface AppCtx {
	app: Hono;
	db: HyperIdleDb;
}

function setupApp(): AppCtx {
	const db = createTestDb();
	const eventBus = new EventBus();
	const app = createTestApp({ db, eventBus });
	return { app, db };
}

const NOW = new Date().toISOString();

describe("GET /api/products", () => {
	let ctx: AppCtx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setupApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns { products: [] } when the table is empty", async () => {
		const res = await ctx.app.request("/api/products", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		// @lore U1: route now returns { teams: [] } (renamed from { products: [] })
		expect(body).toHaveProperty("teams");
		expect((body.teams as unknown[]).length).toBe(0);
	});

	it("returns one row with derived activeBets, shipped, shipRate for a seeded product+team+bet+task fixture", async () => {
		const { db } = ctx;

		db.insert(teams)
			.values({ id: "p1", name: "HyperIdle Core", phase: "build", createdAt: NOW })
			.run();
		db.insert(teamMembers)
			.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW })
			.run();
		db.insert(bets)
			.values({
				id: "b1",
				teamId: "p1",
				description: "# Active\n\ncommitted bet",
				appetite: "2 weeks",
				status: "active",
				createdAt: NOW,
			})
			.run();
		db.insert(bets)
			.values({
				id: "b2",
				teamId: "p1",
				description: "# Shipped\n\nshipped bet",
				appetite: "1 week",
				status: "completed",
				createdAt: NOW,
				completedAt: NOW,
			})
			.run();

		const res = await ctx.app.request("/api/products", {
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
		expect(product.id).toBe("p1");
		expect(product.name).toBe("HyperIdle Core");
		expect(product.activeBets).toBe(1);
		expect(product.shipped).toBe(1);
		expect(typeof product.shipRate).toBe("string");
	});
});

describe("GET /api/products/:id", () => {
	let ctx: AppCtx;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		ctx = setupApp();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns 404 for an unknown id", async () => {
		const res = await ctx.app.request("/api/products/does-not-exist", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(404);
	});

	it("returns 500 with code 'team_missing' when the team for a product is absent", async () => {
		const { db } = ctx;

		db.insert(teams)
			.values({ id: "p-no-team", name: "Orphan Product", phase: "build", createdAt: NOW })
			.run();

		const res = await ctx.app.request("/api/products/p-no-team", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as { code?: string };
		// @lore U1: error code renamed from "team_missing" to "team_members_missing"
		expect(body.code).toBe("team_members_missing");
	});

	it("returns populated ProductDetail for a seeded product+team+roster+bets", async () => {
		const { db } = ctx;

		db.insert(teams)
			.values({ id: "p1", name: "HyperIdle Core", phase: "build", createdAt: NOW })
			.run();
		db.insert(teamMembers)
			.values({
				id: "t1",
				teamId: "p1",
				capacity: 5,
				activeBets: 0,
				formedAt: NOW,
				costCap: 10000,
				costActual: 4200,
			})
			.run();
		db.insert(users)
			.values({
				id: "agent-lead",
				name: "Lead Agent",
				role: "lead",
				status: "active",
				teamId: "t1",
				createdAt: NOW,
			})
			.run();
		db.insert(users)
			.values({
				id: "agent-member",
				name: "Alice Agent",
				role: "member",
				status: "active",
				teamId: "t1",
				createdAt: NOW,
			})
			.run();
		db.insert(bets)
			.values({
				id: "b1",
				teamId: "p1",
				description: "# Active\n\ncommitted bet",
				appetite: "2 weeks",
				status: "active",
				createdAt: NOW,
			})
			.run();
		db.insert(bets)
			.values({
				id: "b2",
				teamId: "p1",
				description: "# In progress\n\nin progress bet",
				appetite: "6 weeks",
				status: "active",
				createdAt: NOW,
			})
			.run();
		db.insert(bets)
			.values({
				id: "b-shipped",
				teamId: "p1",
				description: "# Shipped\n\nshipped bet",
				appetite: "1 week",
				status: "completed",
				createdAt: NOW,
				completedAt: NOW,
			})
			.run();
		// Tasks for b1
		db.insert(tasks)
			.values({
				id: "task-1",
				betId: "b1",
				teamId: "p1",
				title: "Task 1",
				state: "done",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.run();
		db.insert(tasks)
			.values({
				id: "task-2",
				betId: "b1",
				teamId: "p1",
				title: "Task 2",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.run();

		// Update the team to reference lead agent
		// (teams.leadAgentId is set separately)

		const res = await ctx.app.request("/api/products/p1", {
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
				costActual: { minor: number; currency: string } | null;
				costCap: { minor: number; currency: string } | null;
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

		// Burn — L17: costCap and costActual are WireMoney objects
		expect(body.burn.costCap?.minor).toBe(10000);
		expect(body.burn.costCap?.currency).toBe("USD");
		expect(body.burn.costActual?.minor).toBe(4200);
		expect(body.burn.costActual?.currency).toBe("USD");
	});

	it("returns activeBets: [] for a product whose bets are all shipped", async () => {
		const { db } = ctx;

		db.insert(teams)
			.values({ id: "p2", name: "Shipped Product", phase: "cool-down", createdAt: NOW })
			.run();
		db.insert(teamMembers)
			.values({ id: "t2", teamId: "p2", capacity: 3, activeBets: 0, formedAt: NOW })
			.run();
		db.insert(bets)
			.values({
				id: "b-s1",
				teamId: "p2",
				description: "# Shipped\n\nshipped bet",
				appetite: "1 week",
				status: "completed",
				createdAt: NOW,
				completedAt: NOW,
			})
			.run();

		const res = await ctx.app.request("/api/products/p2", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { activeBets: unknown[] };
		expect(body.activeBets).toEqual([]);
	});

	it("returns burn.costCap: null when teams.cost_cap is null", async () => {
		const { db } = ctx;

		db.insert(teams)
			.values({ id: "p3", name: "No Cap Product", phase: "shape", createdAt: NOW })
			.run();
		db.insert(teamMembers)
			.values({
				id: "t3",
				teamId: "p3",
				capacity: 2,
				activeBets: 0,
				formedAt: NOW,
				// costCap not set — null
			})
			.run();

		const res = await ctx.app.request("/api/products/p3", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { burn: { costCap: number | null } };
		expect(body.burn.costCap).toBeNull();
	});
});
