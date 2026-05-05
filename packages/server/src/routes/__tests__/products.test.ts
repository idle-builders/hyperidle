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
	agents,
	bets,
	createTestDb,
	type HyperIdleDb,
	products,
	tasks,
	teams,
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
		const body = await res.json();
		expect(body).toHaveProperty("products");
		expect(body.products).toEqual([]);
	});

	it("returns one row with derived activeBets, shipped, shipRate for a seeded product+team+bet+task fixture", async () => {
		const { db } = ctx;

		db.insert(products)
			.values({ id: "p1", name: "HyperIdle Core", phase: "build", createdAt: NOW })
			.run();
		db.insert(teams)
			.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: NOW })
			.run();
		db.insert(bets)
			.values({
				id: "b1",
				productId: "p1",
				teamId: "t1",
				pitch: "# Active\n\ncommitted bet",
				appetite: "2 weeks",
				status: "committed",
				createdAt: NOW,
			})
			.run();
		db.insert(bets)
			.values({
				id: "b2",
				productId: "p1",
				teamId: "t1",
				pitch: "# Shipped\n\nshipped bet",
				appetite: "1 week",
				status: "shipped",
				createdAt: NOW,
				shippedAt: NOW,
			})
			.run();

		const res = await ctx.app.request("/api/products", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			products: Array<{
				id: string;
				name: string;
				activeBets: number;
				shipped: number;
				shipRate: string;
			}>;
		};
		expect(body.products).toHaveLength(1);
		const product = body.products[0];
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

		db.insert(products)
			.values({ id: "p-no-team", name: "Orphan Product", phase: "build", createdAt: NOW })
			.run();

		const res = await ctx.app.request("/api/products/p-no-team", {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(500);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("team_missing");
	});

	it("returns populated ProductDetail for a seeded product+team+roster+bets", async () => {
		const { db } = ctx;

		db.insert(products)
			.values({ id: "p1", name: "HyperIdle Core", phase: "build", createdAt: NOW })
			.run();
		db.insert(teams)
			.values({
				id: "t1",
				productId: "p1",
				capacity: 5,
				activeBets: 0,
				formedAt: NOW,
				costCap: 10000,
				costActual: 4200,
			})
			.run();
		db.insert(agents)
			.values({
				id: "agent-lead",
				name: "Lead Agent",
				role: "lead",
				status: "active",
				teamId: "t1",
				createdAt: NOW,
			})
			.run();
		db.insert(agents)
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
				productId: "p1",
				teamId: "t1",
				pitch: "# Active\n\ncommitted bet",
				appetite: "2 weeks",
				status: "committed",
				createdAt: NOW,
			})
			.run();
		db.insert(bets)
			.values({
				id: "b2",
				productId: "p1",
				teamId: "t1",
				pitch: "# In progress\n\nin progress bet",
				appetite: "6 weeks",
				status: "in_progress",
				createdAt: NOW,
			})
			.run();
		db.insert(bets)
			.values({
				id: "b-shipped",
				productId: "p1",
				teamId: "t1",
				pitch: "# Shipped\n\nshipped bet",
				appetite: "1 week",
				status: "shipped",
				createdAt: NOW,
				shippedAt: NOW,
			})
			.run();
		// Tasks for b1
		db.insert(tasks)
			.values({
				id: "task-1",
				betId: "b1",
				productId: "p1",
				teamId: "t1",
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
				productId: "p1",
				teamId: "t1",
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
		const body = (await res.json()) as {
			product: { id: string; name: string };
			team: { id: string };
			roster: Array<{ agentId: string; name: string; isLead: boolean }>;
			burn: { costActual: number; costCap: number | null; capacity: number; activeBets: number };
			activeBets: Array<{
				id: string;
				status: string;
				progressDone: number;
				progressTotal: number;
			}>;
		};

		// Product summary
		expect(body.product.id).toBe("p1");
		expect(body.product.name).toBe("HyperIdle Core");

		// Team
		expect(body.team.id).toBe("t1");

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

		// Burn
		expect(body.burn.costCap).toBe(10000);
		expect(body.burn.costActual).toBe(4200);
	});

	it("returns activeBets: [] for a product whose bets are all shipped", async () => {
		const { db } = ctx;

		db.insert(products)
			.values({ id: "p2", name: "Shipped Product", phase: "cool-down", createdAt: NOW })
			.run();
		db.insert(teams)
			.values({ id: "t2", productId: "p2", capacity: 3, activeBets: 0, formedAt: NOW })
			.run();
		db.insert(bets)
			.values({
				id: "b-s1",
				productId: "p2",
				teamId: "t2",
				pitch: "# Shipped\n\nshipped bet",
				appetite: "1 week",
				status: "shipped",
				createdAt: NOW,
				shippedAt: NOW,
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

		db.insert(products)
			.values({ id: "p3", name: "No Cap Product", phase: "shape", createdAt: NOW })
			.run();
		db.insert(teams)
			.values({
				id: "t3",
				productId: "p3",
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
