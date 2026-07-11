/**
 * R5 RED — Unit tests for recordCostAndCheck bet cost accumulation.
 *
 * AC4: Cost from harness adapter flows through and displays in WorkBet cost
 *      section. The bet's costActualMinor must be incremented when a taskId
 *      is provided to recordCostAndCheck.
 *
 * These tests FAIL until Task 3 (extend recordCostAndCheck) implementation ships.
 *
 * @lore R5: This test lives in packages/server/src/__tests__ (not fabric) to
 * avoid modifying the protected packages/server/app-runtime/src/__tests__/cost-cap.test.ts.
 * The architecture plan lists this as a new test file separate from the
 * protected one.
 */

import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { clearDeduplicationCache, recordCostAndCheck } from "../services/cost-cap.js";
import { beforeEach, describe, expect, test } from "../test-fixtures.js";

const NOW = new Date().toISOString();

async function seedBase(db: HyperIdleDb): Promise<void> {
	// @lore U1: teams = domain entity (formerly products); teamMembers = membership group (formerly teams).
	await db
		.insert(teams)
		.values({ id: "team-1", name: "Test Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "tm-1", teamId: "team-1", capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: "b1",
		teamId: "team-1",
		description: "Bet pitch",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "agent-1",
		name: "Builder Agent",
		role: "builder",
		status: "active",
		teamId: "tm-1",
		maxConcurrentSessions: 2,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-1",
		betId: "b1",
		teamId: "team-1",
		ownerAgentId: "agent-1",
		title: "Test task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("recordCostAndCheck — bet cost accumulation (R5 AC4)", () => {
	beforeEach(() => {
		clearDeduplicationCache();
	});

	test("increments bets.costActualMinor when taskId is provided", async ({ db, eventBus }) => {
		await seedBase(db);
		await recordCostAndCheck(db, eventBus, {
			sessionId: "s1",
			costMinor: 100,
			currency: "USD",
			agentId: "agent-1",
			teamId: "tm-1",
			taskId: "task-1",
		});

		const [bet] = await db
			.select({
				costActualMinor: bets.costActualMinor,
				costActualCurrency: bets.costActualCurrency,
			})
			.from(bets)
			.where(eq(bets.id, "b1"));

		expect(bet?.costActualMinor).toBe(100);
		expect(bet?.costActualCurrency).toBe("USD");
	});

	test("accumulates cumulatively on successive calls", async ({ db, eventBus }) => {
		await seedBase(db);
		await recordCostAndCheck(db, eventBus, {
			sessionId: "s1",
			costMinor: 100,
			currency: "USD",
			agentId: "agent-1",
			teamId: "tm-1",
			taskId: "task-1",
		});

		await recordCostAndCheck(db, eventBus, {
			sessionId: "s2",
			costMinor: 75,
			currency: "USD",
			agentId: "agent-1",
			teamId: "tm-1",
			taskId: "task-1",
		});

		const [bet] = await db
			.select({ costActualMinor: bets.costActualMinor })
			.from(bets)
			.where(eq(bets.id, "b1"));

		expect(bet?.costActualMinor).toBe(175);
	});

	test("does NOT modify bet when taskId is omitted (backward compat)", async ({ db, eventBus }) => {
		await seedBase(db);
		await recordCostAndCheck(db, eventBus, {
			sessionId: "s1",
			costMinor: 500,
			currency: "USD",
			agentId: "agent-1",
			teamId: "tm-1",
			// taskId deliberately omitted
		});

		const [bet] = await db
			.select({ costActualMinor: bets.costActualMinor })
			.from(bets)
			.where(eq(bets.id, "b1"));

		// Bet should remain null — no taskId means no bet lookup
		expect(bet?.costActualMinor).toBeNull();
	});

	test("does NOT modify bet when costMinor is zero", async ({ db, eventBus }) => {
		await seedBase(db);
		await recordCostAndCheck(db, eventBus, {
			sessionId: "s1",
			costMinor: 0,
			currency: "USD",
			agentId: "agent-1",
			teamId: "tm-1",
			taskId: "task-1",
		});

		const [bet] = await db
			.select({ costActualMinor: bets.costActualMinor })
			.from(bets)
			.where(eq(bets.id, "b1"));

		// Zero cost should not increment the bet
		expect(bet?.costActualMinor).toBeNull();
	});

	test("does NOT modify bet when taskId does not exist", async ({ db, eventBus }) => {
		await seedBase(db);
		// Should not throw — just no-op if task not found
		await recordCostAndCheck(db, eventBus, {
			sessionId: "s1",
			costMinor: 100,
			currency: "USD",
			agentId: "agent-1",
			teamId: "tm-1",
			taskId: "ghost-task-xyz",
		});

		const [bet] = await db
			.select({ costActualMinor: bets.costActualMinor })
			.from(bets)
			.where(eq(bets.id, "b1"));

		// Bet unchanged — task not found means no betId lookup
		expect(bet?.costActualMinor).toBeNull();
	});
});
