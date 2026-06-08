/**
 * AD5 — Rail Cost Values Show Real Spend (AC-6)
 *
 * Tests that GET /api/rail returns actual cost spend from teamMembers.costActual,
 * not hardcoded zeros.
 *
 * Red phase: rail.ts currently hardcodes todaySpend: { minor: 0 }.
 * These tests will FAIL until rail.ts reads from the teamMembers table.
 */

import {
	createTestDb,
	factorySettings,
	type HyperIdleDb,
	type TestDbHandle,
	teamMembers,
	teams,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-ad5-rail";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedTeamWithCost(
	db: HyperIdleDb,
	teamId: string,
	costActual: number,
): Promise<void> {
	const now = new Date().toISOString();

	await db.insert(teams).values({
		id: teamId,
		name: `Team ${teamId}`,
		phase: "build",
		createdAt: now,
	});

	await db.insert(teamMembers).values({
		id: `tm-${teamId}`,
		teamId,
		capacity: 5,
		activeBets: 0,
		costActual,
		formedAt: now,
	});
}

describe("AD5 — AC-6: Rail endpoint shows real spend from teamMembers.costActual", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		app = await createTestApp({ db, eventBus: new EventBus() });
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	it("returns todaySpend.minor = 5000 when a team member has costActual = 5000", async () => {
		await seedTeamWithCost(db, "team-ad5-cost-1", 5000);

		const res = await app.request("/api/rail", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		const cost = body.costBurnRate as {
			todaySpend: { minor: number; currency: string } | null;
			todayCap: { minor: number; currency: string } | null;
		};

		// AC-6: must NOT be zero — must reflect actual teamMembers.costActual
		expect(cost.todaySpend).not.toBeNull();
		expect(cost.todaySpend?.minor).toBe(5000);
	});

	it("returns todaySpend.minor = 0 when no teamMembers have costActual set", async () => {
		// Seed a team but with default costActual (0/null)
		await seedTeamWithCost(db, "team-ad5-zero", 0);

		const res = await app.request("/api/rail", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		const cost = body.costBurnRate as {
			todaySpend: { minor: number; currency: string } | null;
		};

		expect(cost.todaySpend?.minor).toBe(0);
	});

	it("sums costActual across multiple teams", async () => {
		await seedTeamWithCost(db, "team-ad5-multi-1", 3000);
		await seedTeamWithCost(db, "team-ad5-multi-2", 2000);
		await seedTeamWithCost(db, "team-ad5-multi-3", 1500);

		const res = await app.request("/api/rail", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		const cost = body.costBurnRate as {
			todaySpend: { minor: number; currency: string } | null;
		};

		// 3000 + 2000 + 1500 = 6500
		expect(cost.todaySpend?.minor).toBe(6500);
	});

	it("returns todayCap populated from factory settings when cost_cap_daily_minor is set", async () => {
		await seedTeamWithCost(db, "team-ad5-cap", 0);

		await db.insert(factorySettings).values({
			key: "cost_cap_daily_minor",
			value: "10000",
			updatedAt: new Date().toISOString(),
		});

		const res = await app.request("/api/rail", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		const cost = body.costBurnRate as {
			todayCap: { minor: number; currency: string } | null;
		};

		expect(cost.todayCap).not.toBeNull();
		expect(cost.todayCap?.minor).toBe(10000);
	});

	it("returns todaySpend as WireMoney with currency field", async () => {
		await seedTeamWithCost(db, "team-ad5-currency", 1234);

		const res = await app.request("/api/rail", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		const cost = body.costBurnRate as {
			todaySpend: { minor: number; currency: string } | null;
		};

		expect(cost.todaySpend).not.toBeNull();
		expect(cost.todaySpend?.minor).toBe(1234);
		expect(typeof cost.todaySpend?.currency).toBe("string");
		expect(cost.todaySpend?.currency.length).toBeGreaterThan(0);
	});

	it("returns correct spend after teamMembers.costActual is updated", async () => {
		await seedTeamWithCost(db, "team-ad5-update", 0);

		// Simulate fabric's recordCostAndCheck updating costActual
		await db
			.update(teamMembers)
			.set({ costActual: 9999 })
			.where(eq(teamMembers.id, "tm-team-ad5-update"));

		const res = await app.request("/api/rail", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		const cost = body.costBurnRate as {
			todaySpend: { minor: number; currency: string } | null;
		};

		expect(cost.todaySpend?.minor).toBe(9999);
	});
});
