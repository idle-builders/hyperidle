/**
 * AU19 Increment 1k: `getTaskRiskTierByTaskId` reads `work`'s
 * `task_planning_signals` extension table (O2's `riskTier`). This is the real
 * function `review`'s `TaskRiskTierReader` DI port wires to, replacing the
 * direct `taskStrategyFabric` table import `session-review-creator.ts` used
 * before this increment's rename.
 *
 * Uses the `{ db }`-only fixture (no `{ app }`/`{ eventBus }` needed).
 */

import {
	bets,
	type HyperIdleDb,
	taskPlanningSignals,
	tasks,
	teamMembers,
	teams,
} from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { describe } from "vitest";
import { getTaskRiskTierByTaskId } from "../task-planning-signals.js";

async function seedTask(db: HyperIdleDb, id: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: `${id}-team`, name: "Test", phase: "build", createdAt: now });
	// The owner writes the membership row alongside the team.
	await db.insert(teamMembers).values({
		id: `${id}-team-members`,
		teamId: `${id}-team`,
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});
	await db.insert(bets).values({
		id: `${id}-bet`,
		teamId: `${id}-team`,
		description: "Test",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id,
		betId: `${id}-bet`,
		teamId: `${id}-team`,
		title: "Test Task",
		state: "accepted",
		createdAt: now,
		updatedAt: now,
	});
}

describe("getTaskRiskTierByTaskId", () => {
	test("returns the riskTier from the task's task_planning_signals row", async ({ db }) => {
		await seedTask(db, "tps-task-1");
		await db.insert(taskPlanningSignals).values({
			id: "tps-1",
			taskId: "tps-task-1",
			riskTier: "high",
		});

		const riskTier = await getTaskRiskTierByTaskId(db, "tps-task-1");
		expect(riskTier).toBe("high");
	});

	test("returns null when the task has no task_planning_signals row", async ({ db }) => {
		await seedTask(db, "tps-task-2");

		const riskTier = await getTaskRiskTierByTaskId(db, "tps-task-2");
		expect(riskTier).toBeNull();
	});

	test("returns null when the row's riskTier column is null", async ({ db }) => {
		await seedTask(db, "tps-task-3");
		await db.insert(taskPlanningSignals).values({
			id: "tps-3",
			taskId: "tps-task-3",
			riskTier: null,
		});

		const riskTier = await getTaskRiskTierByTaskId(db, "tps-task-3");
		expect(riskTier).toBeNull();
	});
});
