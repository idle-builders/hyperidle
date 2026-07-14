/**
 * AU18 §9 — `getFactoryCostActual` unit test.
 *
 * `getFactoryCostActual` replaces `recordFactoryCost` (which wrote the SUM
 * into the now-retired `factory_settings.cost_actual`). Proves it's a live
 * SUM(users.costActual) over ALL users — matching `sumAllUserCost`'s
 * coalesce-over-all-users semantics (not a single row).
 */

import { users } from "@hyperidle/db";
import { getFactoryCostActual } from "../services/cost-bindings.js";
import { describe, expect, test } from "../test-fixtures.js";

describe("getFactoryCostActual — live SUM(users.costActual)", () => {
	test("returns 0 when no users exist", async ({ db }) => {
		expect(await getFactoryCostActual(db)).toBe(0);
	});

	test("returns 0 when users exist but none have costActual set", async ({ db }) => {
		await db.insert(users).values({
			id: "agent-no-cost",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		expect(await getFactoryCostActual(db)).toBe(0);
	});

	test("returns the single costed user's value", async ({ db }) => {
		await db.insert(users).values({
			id: "agent-costed",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			costActual: 4200,
			createdAt: new Date().toISOString(),
		});
		expect(await getFactoryCostActual(db)).toBe(4200);
	});

	test("sums costActual across ALL users, not just one", async ({ db }) => {
		await db.insert(users).values([
			{
				id: "agent-a",
				kind: "ai",
				name: "A",
				role: "builder",
				status: "active",
				costActual: 1000,
				createdAt: new Date().toISOString(),
			},
			{
				id: "agent-b",
				kind: "ai",
				name: "B",
				role: "builder",
				status: "active",
				costActual: 2500,
				createdAt: new Date().toISOString(),
			},
			{
				id: "human-founder",
				kind: "human",
				name: "Founder",
				role: "product_manager",
				status: "active",
				createdAt: new Date().toISOString(),
			},
		]);
		expect(await getFactoryCostActual(db)).toBe(3500);
	});
});
