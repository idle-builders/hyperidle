/**
 * AA2 — Coalescing helper tests.
 *
 * AC-5: shouldCoalesce returns true when an active session exists for the routine,
 *       false when no active session exists.
 */

import {
	bets,
	type HyperIdleDb,
	routines,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { shouldCoalesce } from "../services/routine-scheduler.js";

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();

	await db.insert(teams).values({
		id: "team-coalesce",
		name: "Coalesce Team",
		phase: "build",
		createdAt: now,
	});

	await db.insert(teamMembers).values({
		id: "tm-coalesce",
		teamId: "team-coalesce",
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});

	await db.insert(users).values({
		id: "agent-coalesce",
		name: "Coalesce Agent",
		role: "builder",
		status: "active",
		teamId: "tm-coalesce",
		createdAt: now,
	});

	await db.insert(bets).values({
		id: "bet-coalesce",
		teamId: "team-coalesce",
		description: "Coalesce test bet",
		status: "active",
		createdAt: now,
	});

	await db.insert(tasks).values({
		id: "task-coalesce",
		betId: "bet-coalesce",
		teamId: "team-coalesce",
		title: "Coalesce test task",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
		ownerAgentId: "agent-coalesce",
	});

	await db.insert(routines).values({
		id: "routine-coalesce",
		name: "Coalesce test routine",
		ownerAgentId: "agent-coalesce",
		teamId: "team-coalesce",
		state: "active",
		triggerType: "calendar",
		active: true,
	});
}

describe("shouldCoalesce", () => {
	test("returns false when no session exists for the routine", async ({ db }) => {
		await seedBase(db);
		const result = await shouldCoalesce(db, "routine-coalesce");
		expect(result).toBe(false);
	});

	test("returns true when an active session exists for the routine", async ({ db }) => {
		await seedBase(db);
		await db.insert(sessions).values({
			id: "session-active-coalesce",
			taskId: "task-coalesce",
			agentId: "agent-coalesce",
			modelTier: "workhorse",
			startedAt: new Date().toISOString(),
			state: "active",
			routineId: "routine-coalesce",
		});

		const result = await shouldCoalesce(db, "routine-coalesce");
		expect(result).toBe(true);
	});

	test("returns false when a completed (not active) session exists", async ({ db }) => {
		await seedBase(db);
		await db.insert(sessions).values({
			id: "session-completed-coalesce",
			taskId: "task-coalesce",
			agentId: "agent-coalesce",
			modelTier: "workhorse",
			startedAt: new Date().toISOString(),
			endedAt: new Date().toISOString(),
			state: "completed",
			routineId: "routine-coalesce",
		});

		const result = await shouldCoalesce(db, "routine-coalesce");
		expect(result).toBe(false);
	});

	test("returns false when active session belongs to a different routine", async ({ db }) => {
		await seedBase(db);
		// Insert another routine first
		await db.insert(routines).values({
			id: "routine-other",
			name: "Other routine",
			ownerAgentId: "agent-coalesce",
			teamId: "team-coalesce",
			state: "active",
			triggerType: "calendar",
			active: true,
		});

		// Active session for OTHER routine
		await db.insert(sessions).values({
			id: "session-other-routine",
			taskId: "task-coalesce",
			agentId: "agent-coalesce",
			modelTier: "workhorse",
			startedAt: new Date().toISOString(),
			state: "active",
			routineId: "routine-other",
		});

		// Should NOT coalesce for our routine
		const result = await shouldCoalesce(db, "routine-coalesce");
		expect(result).toBe(false);
	});

	test("returns false when routineId is not associated with any session", async ({ db }) => {
		await seedBase(db);
		const result = await shouldCoalesce(db, "nonexistent-routine-id");
		expect(result).toBe(false);
	});
});
