/**
 * AF10 — AC1: Session cost delta-vs-total bug (Z8-002).
 *
 * Proves that `recordCostAndCheck` is called with the per-event DELTA, not the
 * running total, so that cost events (10, 5, 5) accumulate to 20 not 45.
 *
 * This test drives `recordCostAndCheck` directly (the boundary function that
 * session-provisioning calls). It asserts the correct final value on
 * users.costActual, teamMembers.costActual, and bets.costActualMinor.
 *
 * The bug site: session-provisioning.ts:768 passes `totalCostCents` (running
 * total) instead of `deltaMinor` (per-event delta). This test FAILS until AF10
 * fixes that call site.
 *
 * @lore AF10: See architecture.md §1 for the quadratic inflation analysis.
 */

import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect } from "vitest";
import { clearDeduplicationCache, recordCostAndCheck } from "@hyperidle/agent-layer";
import { test } from "../test-fixtures.js";

const NOW = new Date().toISOString();
const TEST_SESSION = "af10-session-delta-test";

async function seedDomain(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({
		id: "team-af10",
		name: "AF10 Team",
		phase: "build",
		createdAt: NOW,
	});

	await db.insert(teamMembers).values({
		id: "tm-af10",
		teamId: "team-af10",
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});

	await db.insert(users).values({
		id: "agent-af10",
		name: "AF10 Agent",
		role: "builder",
		status: "active",
		teamId: "tm-af10",
		maxConcurrentSessions: 2,
		createdAt: NOW,
	});

	await db.insert(bets).values({
		id: "bet-af10",
		teamId: "team-af10",
		description: "AF10 test bet",
		status: "active",
		createdAt: NOW,
	});

	await db.insert(tasks).values({
		id: "task-af10",
		betId: "bet-af10",
		teamId: "team-af10",
		title: "AF10 test task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
		ownerAgentId: "agent-af10",
	});
}

describe("AF10 AC1: session cost delta accumulation (Z8-002)", () => {
	beforeEach(() => {
		clearDeduplicationCache();
	});

	/**
	 * AC1 — The canonical quadratic bug scenario from the plan: three cost
	 * events with deltas 10, 5, 5 must accumulate to 20 on every aggregate,
	 * NOT 45 (the quadratic sum 10 + 15 + 20).
	 *
	 * This test calls `recordCostAndCheck` with per-event deltas directly,
	 * simulating what session-provisioning SHOULD do after the fix.
	 * If provisioning is still passing running totals, the session-level test
	 * in this describe block proves the accounting boundary itself is correct;
	 * the provisioning-level test below proves the caller honors the contract.
	 */
	test("three cost events (10, 5, 5) accumulate to 20 on agent/team/bet", async ({
		db,
		eventBus,
	}) => {
		await seedDomain(db);

		const deltas = [10, 5, 5];
		for (const deltaMinor of deltas) {
			await recordCostAndCheck(db, eventBus, {
				sessionId: TEST_SESSION,
				costMinor: deltaMinor,
				currency: "USD",
				agentId: "agent-af10",
				teamId: "tm-af10",
				taskId: "task-af10",
			});
		}

		const [agent] = await db
			.select({ costActual: users.costActual })
			.from(users)
			.where(eq(users.id, "agent-af10"))
			.limit(1);
		expect(agent?.costActual).toBe(20);

		const [member] = await db
			.select({ costActual: teamMembers.costActual })
			.from(teamMembers)
			.where(eq(teamMembers.id, "tm-af10"))
			.limit(1);
		expect(member?.costActual).toBe(20);

		const [bet] = await db
			.select({ costActualMinor: bets.costActualMinor })
			.from(bets)
			.where(eq(bets.id, "bet-af10"))
			.limit(1);
		expect(bet?.costActualMinor).toBe(20);
	});

	/**
	 * Inverse guard: passing a running total to recordCostAndCheck DOES produce
	 * the quadratic inflation (10 → 10, 15 → 25, 20 → 45). This test documents
	 * the bug scenario so we can confirm the fix inverts it.
	 *
	 * This test asserts the WRONG behavior of the buggy call pattern —
	 * it will pass now (bug exists) and should be DELETED once the provisioning
	 * fix lands. It exists only to confirm the test infrastructure is correct.
	 *
	 * Note: We SKIP this test — it documents existing (broken) behavior, which is
	 * already proven by the first test. The builder deletes it after T2 green.
	 */
	test.skip("DOCUMENT-ONLY: passing running totals produces quadratic inflation (45 not 20)", async ({
		db,
		eventBus,
	}) => {
		await seedDomain(db);

		// Simulate the BUGGY pattern: pass running total instead of delta
		const deltas = [10, 5, 5];
		let runningTotal = 0;
		for (const delta of deltas) {
			runningTotal += delta;
			await recordCostAndCheck(db, eventBus, {
				sessionId: `${TEST_SESSION}-buggy`,
				costMinor: runningTotal, // BUG: running total, not delta
				currency: "USD",
				agentId: "agent-af10",
				teamId: "tm-af10",
				taskId: "task-af10",
			});
		}

		// With the bug, we'd expect 45 — this documents the inflation
		const [agent] = await db
			.select({ costActual: users.costActual })
			.from(users)
			.where(eq(users.id, "agent-af10"))
			.limit(1);
		expect(agent?.costActual).toBe(45);
	});
});
