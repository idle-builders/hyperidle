/**
 * AE3 — update_routine tool integration tests.
 *
 * RED phase: these tests will fail until update-routine.ts is implemented.
 */

import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { bets, routines, tasks, teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { makeContext, NOW } from "./_helpers.js";

function buildUpdateRoutineTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app)).find(
		(t) => t.name === "update_routine",
	)!;
}

async function seedRoutine(db: Parameters<typeof makeContext>[0]): Promise<{
	routineId: string;
	teamId: string;
	agentId: string;
	stubTaskId: string;
}> {
	const teamId = `team-${Date.now()}`;
	const agentId = `agent-${Date.now()}`;
	const betId = `bet-${Date.now()}`;
	const stubTaskId = `task-${Date.now()}`;
	const routineId = `routine-${Date.now()}`;

	await db.insert(teams).values({ id: teamId, name: "Test Team", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: agentId,
		name: "Test Agent",
		role: "builder",
		status: "active",
		teamId: teamId,
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "Stub bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: stubTaskId,
		betId,
		teamId,
		title: "Routine: Test Routine",
		state: "accepted",
		ownerAgentId: agentId,
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(routines).values({
		id: routineId,
		name: "Test Routine",
		ownerAgentId: agentId,
		triggerType: "calendar",
		triggerConfig: JSON.stringify({ cron: "0 9 * * 1-5" }),
		state: "active",
		active: true,
		stubTaskId,
		createdAt: NOW,
	});

	return { routineId, teamId, agentId, stubTaskId };
}

describe("update_routine tool", () => {
	test("updates routine name", async ({ db, app }) => {
		const updateRoutineTool = buildUpdateRoutineTool(app);
		const { routineId } = await seedRoutine(db);

		const result = await updateRoutineTool.handler(
			{ routineId, updates: { name: "Weekly sync" } },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { routineId: string; name: string; state: string };
		expect(data.name).toBe("Weekly sync");

		const [row] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
		expect(row!.name).toBe("Weekly sync");
	});

	test("pausing syncs active=false", async ({ db, app }) => {
		const updateRoutineTool = buildUpdateRoutineTool(app);
		const { routineId } = await seedRoutine(db);

		const result = await updateRoutineTool.handler(
			{ routineId, updates: { state: "paused" } },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { routineId: string; name: string; state: string };
		expect(data.state).toBe("paused");

		const [row] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
		expect(row!.state).toBe("paused");
		expect(row!.active).toBe(false);
	});

	test("resuming with active sets active=true", async ({ db, app }) => {
		const updateRoutineTool = buildUpdateRoutineTool(app);
		const { routineId } = await seedRoutine(db);

		// First pause it
		await db
			.update(routines)
			.set({ state: "paused", active: false })
			.where(eq(routines.id, routineId));

		// Then resume
		const result = await updateRoutineTool.handler(
			{ routineId, updates: { state: "active" } },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const [row] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
		expect(row!.state).toBe("active");
		expect(row!.active).toBe(true);
	});

	test("updates multiple fields in one call", async ({ db, app }) => {
		const updateRoutineTool = buildUpdateRoutineTool(app);
		const { routineId } = await seedRoutine(db);

		const result = await updateRoutineTool.handler(
			{
				routineId,
				updates: {
					name: "Updated Name",
					state: "paused",
					prompt: "New prompt",
				},
			},
			makeContext(db),
		);
		expect(result.success).toBe(true);

		const [row] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
		expect(row!.name).toBe("Updated Name");
		expect(row!.state).toBe("paused");
		expect(row!.prompt).toBe("New prompt");
	});

	test("returns ok({ routineId, name, state })", async ({ db, app }) => {
		const updateRoutineTool = buildUpdateRoutineTool(app);
		const { routineId } = await seedRoutine(db);

		const result = await updateRoutineTool.handler(
			{ routineId, updates: { name: "New Name" } },
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { routineId: string; name: string; state: string };
		expect(data.routineId).toBe(routineId);
		expect(typeof data.name).toBe("string");
		expect(typeof data.state).toBe("string");
	});

	test("NOT_FOUND for nonexistent routineId", async ({ db, app }) => {
		const updateRoutineTool = buildUpdateRoutineTool(app);
		const result = await updateRoutineTool.handler(
			{ routineId: "routine-does-not-exist", updates: { name: "X" } },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	test("NOT_FOUND for soft-deleted routine", async ({ db, app }) => {
		const updateRoutineTool = buildUpdateRoutineTool(app);
		const { routineId } = await seedRoutine(db);

		// Soft-delete the routine
		await db.update(routines).set({ deletedAt: NOW }).where(eq(routines.id, routineId));

		const result = await updateRoutineTool.handler(
			{ routineId, updates: { name: "Should fail" } },
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	// @lore AD8b: role "chief_of_staff" renamed to "assistant".
	test("tool is restricted to assistant role", ({ app }) => {
		const updateRoutineTool = buildUpdateRoutineTool(app);
		expect(updateRoutineTool.roles).toBeDefined();
		expect(updateRoutineTool.roles).toContain("assistant");
	});
});
