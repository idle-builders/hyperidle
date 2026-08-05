/**
 * AE3 — create_routine tool integration tests.
 *
 * RED phase: these tests will fail until create-routine.ts is implemented.
 */

import { routines, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { buildToolDefinitions } from "@hyperidle/tool-handlers";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test as baseTest } from "../__testing__/test-fixtures.js";
import {
	createInProcessCoreApiTransport,
	registerCoreApiTransport,
} from "../services/core-api-port-composition.js";
import { toolHandlersPorts } from "../services/tool-handlers-bindings.js";

/**
 * @lore AU21 §9 Increment 2: this file's tool handler(s) now reach
 * `ports.coreApi.*` (the seam) — this file-scoped `auto:true` fixture
 * registers a real in-process `CoreApiPort` transport off THIS test's own
 * `app` for every test in this file, without forcing `app`'s full
 * subscriber wiring onto every OTHER test file that imports the bare
 * `test` from `test-fixtures.ts` (that fixture's `app` stays lazy — a
 * global auto-fixture there double-fired `app.ts`'s task-`done`
 * dep-watcher against tests that manually drive the same transition,
 * an AU21 Increment 2 GREEN-phase finding).
 */
const test = baseTest.extend<{ coreApiSeamRegistration: undefined }>({
	coreApiSeamRegistration: [
		async ({ app }, use) => {
			registerCoreApiTransport(createInProcessCoreApiTransport(app));
			await use(undefined);
		},
		{ auto: true },
	],
});

import { makeContext, NOW } from "./_helpers.js";

const createRoutineTool = buildToolDefinitions(toolHandlersPorts).find(
	(t) => t.name === "create_routine",
)!;

async function seedTeamAndAgent(db: Parameters<typeof makeContext>[0]): Promise<{
	teamId: string;
	teamMembersId: string;
	agentId: string;
}> {
	const teamId = `team-${Date.now()}`;
	const teamMembersId = `tm-${Date.now()}`;
	const agentId = `agent-${Date.now()}`;
	await db.insert(teams).values({ id: teamId, name: "Test Team", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: teamMembersId,
		teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(users).values({
		id: agentId,
		name: "Test Agent",
		role: "builder",
		status: "active",
		teamId: teamMembersId,
		createdAt: NOW,
	});
	return { teamId, teamMembersId, agentId };
}

describe("create_routine tool", () => {
	test("inserts a task-free routines row", async ({ db }) => {
		const { teamId, agentId } = await seedTeamAndAgent(db);

		const result = await createRoutineTool.handler(
			{
				name: "Daily standup",
				teamId,
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
		expect(routine!.teamId).toBe(teamId);
		expect(routine!.ownerAgentId).toBe(agentId);
		expect(routine!.triggerConfig).toBe(JSON.stringify({ cron: "0 9 * * 1-5" }));
		expect(routine!.stubTaskId).toBeNull();
		expect(await db.select().from(tasks)).toHaveLength(0);
	});

	test("returns ok({ routineId, name, nextRunAt })", async ({ db }) => {
		const { teamId, agentId } = await seedTeamAndAgent(db);

		const result = await createRoutineTool.handler(
			{
				name: "Weekly sync",
				teamId,
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

	test("NOT_FOUND for nonexistent teamId", async ({ db }) => {
		const { agentId } = await seedTeamAndAgent(db);

		const result = await createRoutineTool.handler(
			{
				name: "Daily standup",
				teamId: "team-does-not-exist",
				ownerAgentId: agentId,
				triggerType: "calendar",
				triggerConfig: JSON.stringify({ cron: "0 9 * * 1-5" }),
			},
			makeContext(db),
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.code).toBe("NOT_FOUND");
	});

	test("NOT_FOUND for nonexistent ownerAgentId", async ({ db }) => {
		const { teamId } = await seedTeamAndAgent(db);

		const result = await createRoutineTool.handler(
			{
				name: "Daily standup",
				teamId,
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

	test("INVALID_INPUT for invalid cron expression", async ({ db }) => {
		const { teamId, agentId } = await seedTeamAndAgent(db);

		const result = await createRoutineTool.handler(
			{
				name: "Bad cron",
				teamId,
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

	test("INVALID_INPUT for invalid JSON in triggerConfig", async ({ db }) => {
		const { teamId, agentId } = await seedTeamAndAgent(db);

		const result = await createRoutineTool.handler(
			{
				name: "Bad JSON",
				teamId,
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

	test("INVALID_INPUT for valid JSON but missing cron field", async ({ db }) => {
		const { teamId, agentId } = await seedTeamAndAgent(db);

		const result = await createRoutineTool.handler(
			{
				name: "No cron field",
				teamId,
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
	test("tool is restricted to assistant role", () => {
		expect(createRoutineTool.roles).toBeDefined();
		expect(createRoutineTool.roles).toContain("assistant");
	});
});
