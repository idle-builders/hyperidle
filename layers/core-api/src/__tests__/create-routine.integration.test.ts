/**
 * AE3 — create_routine tool integration tests.
 *
 * @lore BA1 D5/D8: `teamId` is dropped from the tool's input — a routine has
 * no team, it belongs to its owner agent. `triggerType` widens to
 * `"calendar" | "event"`; an event routine takes a top-level `eventType`
 * instead of `triggerConfig`.
 */

import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { THROWING_REVIEW_ACCESSOR } from "@hyperidle/agent-orchestration/testing";
import { routines, tasks, teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { makeContext, NOW } from "./_helpers.js";

function buildCreateRoutineTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app), THROWING_REVIEW_ACCESSOR).find(
		(t) => t.name === "create_routine",
	)!;
}

async function seedTeamAndAgent(db: Parameters<typeof makeContext>[0]): Promise<{
	teamId: string;
	agentId: string;
}> {
	const teamId = `team-${Date.now()}`;
	const agentId = `agent-${Date.now()}`;
	await db.insert(teams).values({ id: teamId, name: "Test Team", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: agentId,
		name: "Test Agent",
		role: "builder",
		status: "active",
		teamId: teamId,
		createdAt: NOW,
	});
	return { teamId, agentId };
}

describe("create_routine tool", () => {
	test("inserts a task-free routines row, owned by the agent, with no team", async ({
		db,
		app,
	}) => {
		const createRoutineTool = buildCreateRoutineTool(app);
		const { agentId } = await seedTeamAndAgent(db);

		const result = await createRoutineTool.handler(
			{
				name: "Daily standup",
				ownerAgentId: agentId,
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * 1-5" }),
			},
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { routineId: string; name: string; nextRunAt: string };
		expect(data.name).toBe("Daily standup");
		expect(typeof data.nextRunAt).toBe("string");
		expect(data).not.toHaveProperty("stubTaskId");

		const routineRows = await db.select().from(routines).where(eq(routines.id, data.routineId));
		expect(routineRows).toHaveLength(1);
		const routine = routineRows[0];
		expect(routine!.name).toBe("Daily standup");
		expect(routine!.ownerAgentId).toBe(agentId);
		expect(routine!.triggerConfig).toBe(JSON.stringify({ cron: "0 9 * * 1-5" }));
		expect(routine!.stubTaskId).toBeNull();
		expect(await db.select().from(tasks)).toHaveLength(0);
	});

	test("returns ok({ routineId, name, nextRunAt })", async ({ db, app }) => {
		const createRoutineTool = buildCreateRoutineTool(app);
		const { agentId } = await seedTeamAndAgent(db);

		const result = await createRoutineTool.handler(
			{
				name: "Weekly sync",
				ownerAgentId: agentId,
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 10 * * 1" }),
			},
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { routineId: string; name: string; nextRunAt: string };
		expect(typeof data.routineId).toBe("string");
		expect(data.name).toBe("Weekly sync");
		expect(typeof data.nextRunAt).toBe("string");
		expect(data).not.toHaveProperty("stubTaskId");
	});

	// BA1 D8: an event routine is created against a top-level `eventType`,
	// validated against EVENT_TYPES, with no `triggerConfig`.
	test("creates an event routine with eventType, no triggerConfig required", async ({
		db,
		app,
	}) => {
		const createRoutineTool = buildCreateRoutineTool(app);
		const { agentId } = await seedTeamAndAgent(db);

		const result = await createRoutineTool.handler(
			{
				// BB1: bet_state_changed removed; use task_state_changed instead.
				name: "On task completion",
				ownerAgentId: agentId,
				triggerType: "event",
				eventType: "task_state_changed",
			},
			makeContext(db),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;

		const data = result.data as { routineId: string };
		const routineRows = await db.select().from(routines).where(eq(routines.id, data.routineId));
		expect(routineRows[0]?.triggerType).toBe("event");
		expect(routineRows[0]?.eventType).toBe("task_state_changed");
		expect(routineRows[0]?.triggerConfig).toBeNull();
	});

	test("INVALID_INPUT for an event routine missing eventType", async ({ db, app }) => {
		const createRoutineTool = buildCreateRoutineTool(app);
		const { agentId } = await seedTeamAndAgent(db);

		const result = await createRoutineTool.handler(
			{
				name: "Missing eventType",
				ownerAgentId: agentId,
				triggerType: "event",
			},
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});

	test("INVALID_INPUT for an unrecognized eventType", async ({ db, app }) => {
		const createRoutineTool = buildCreateRoutineTool(app);
		const { agentId } = await seedTeamAndAgent(db);

		const result = await createRoutineTool.handler(
			{
				name: "Bad event",
				ownerAgentId: agentId,
				triggerType: "event",
				eventType: "not_a_real_event",
			},
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});

	test("NOT_FOUND for nonexistent ownerAgentId", async ({ db, app }) => {
		const createRoutineTool = buildCreateRoutineTool(app);
		await seedTeamAndAgent(db);

		const result = await createRoutineTool.handler(
			{
				name: "Daily standup",
				ownerAgentId: "agent-does-not-exist",
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * 1-5" }),
			},
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	test("INVALID_INPUT for invalid cron expression", async ({ db, app }) => {
		const createRoutineTool = buildCreateRoutineTool(app);
		const { agentId } = await seedTeamAndAgent(db);

		const result = await createRoutineTool.handler(
			{
				name: "Bad cron",
				ownerAgentId: agentId,
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "not-a-cron" }),
			},
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});

	test("INVALID_INPUT for invalid JSON in triggerConfig", async ({ db, app }) => {
		const createRoutineTool = buildCreateRoutineTool(app);
		const { agentId } = await seedTeamAndAgent(db);

		const result = await createRoutineTool.handler(
			{
				name: "Bad JSON",
				ownerAgentId: agentId,
				triggerType: "calendar",
				triggerConfig: "not-json",
			},
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});

	test("INVALID_INPUT for valid JSON but missing cron field", async ({ db, app }) => {
		const createRoutineTool = buildCreateRoutineTool(app);
		const { agentId } = await seedTeamAndAgent(db);

		const result = await createRoutineTool.handler(
			{
				name: "No cron field",
				ownerAgentId: agentId,
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ interval: "1h" }),
			},
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("INVALID_INPUT");
	});

	// @lore AD8b: role "chief_of_staff" renamed to "assistant".
	test("tool is restricted to assistant role", ({ app }) => {
		const createRoutineTool = buildCreateRoutineTool(app);
		expect(createRoutineTool.roles).toBeDefined();
		expect(createRoutineTool.roles).toContain("assistant");
	});
});
