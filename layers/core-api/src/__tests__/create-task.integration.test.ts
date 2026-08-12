/**
 * R5 RED — Unit tests for create_task skill tool.
 *
 * AC1: Agent creates tasks via skill tools. A task row appears in the tasks
 * table with state: "proposed", correct betId, productId, teamId, ownerAgentId.
 * AC5: New tasks from create_task start in proposed state (status chip renders).
 *
 * These tests FAIL until the create-task.ts implementation ships.
 */

import * as os from "node:os";
import * as path from "node:path";
import {
	buildToolDefinitions,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import type { TaskStateChangedEvent } from "@hyperidle/domain-model";
import type { ToolContext } from "@hyperidle/tool-protocol";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

function buildCreateTaskTool(app: Hono): ReturnType<typeof buildToolDefinitions>[number] {
	return buildToolDefinitions(createInProcessCoreApiTransport(app)).find(
		(t) => t.name === "create_task",
	)!;
}

const NOW = new Date().toISOString();

async function seed(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	// @lore U1: teams = domain entity (formerly products); teamMembers = membership group (formerly teams).
	await db
		.insert(teams)
		.values({ id: ids("team-1"), name: "Test Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: ids("tm-1"), teamId: ids("team-1"), capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: ids("b1"),
		teamId: ids("team-1"),
		description: "Implement feature X",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: ids("agent-a"),
		name: "Builder Agent",
		role: "builder",
		teamId: ids("tm-1"),
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: ids("task-1"),
		betId: ids("b1"),
		teamId: ids("team-1"),
		ownerAgentId: ids("agent-a"),
		title: "Parent Task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

function makeContext(
	db: HyperIdleDb,
	eventBus: import("@hyperidle/event-bus").EventBus,
	ids: ScopedIds,
): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: ids("agent-a"),
		sessionId: ids("session-1"),
		taskId: ids("task-1"),
		sandboxPath: path.join(os.tmpdir(), `hi-r5-createtask-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

describe("create_task tool", () => {
	// AC1 happy path: task created with correct betId, productId, teamId, ownerAgentId, state
	describe("AC1: creates task with correct fields", () => {
		test("returns ok with taskId and inserts task row with derived betId", async ({
			db,
			eventBus,
			app,
			ids,
		}) => {
			const createTaskTool = buildCreateTaskTool(app);
			await seed(db, ids);
			const result = await createTaskTool.handler(
				{ title: "Implement feature X" },
				makeContext(db, eventBus, ids),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { taskId: string; betId: string };
			expect(typeof data.taskId).toBe("string");
			expect(data.betId).toBe(ids("b1"));

			const [inserted] = await db.select().from(tasks).where(eq(tasks.id, data.taskId));
			expect(inserted).toBeDefined();
			expect(inserted?.betId).toBe(ids("b1"));
			// @lore U1: tasks.teamId now references teams.id (domain entity), no productId column.
			expect(inserted?.teamId).toBe(ids("team-1"));
			expect(inserted?.ownerAgentId).toBe(ids("agent-a"));
			expect(inserted?.title).toBe("Implement feature X");
			expect(inserted?.state).toBe("proposed");
		});

		test("persists optional description and doneCondition when provided", async ({
			db,
			eventBus,
			app,
			ids,
		}) => {
			const createTaskTool = buildCreateTaskTool(app);
			await seed(db, ids);
			const result = await createTaskTool.handler(
				{
					title: "Write tests",
					description: "Cover all edge cases",
					doneCondition: "All tests pass and coverage >= 90%",
				},
				makeContext(db, eventBus, ids),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { taskId: string };
			const [inserted] = await db.select().from(tasks).where(eq(tasks.id, data.taskId));
			expect(inserted?.description).toBe("Cover all edge cases");
			expect(inserted?.doneCondition).toBe("All tests pass and coverage >= 90%");
		});
	});

	// AC5: new tasks from create_task start in proposed state
	describe("AC5: new task starts in proposed state", () => {
		test("inserted task has state=proposed", async ({ db, eventBus, app, ids }) => {
			const createTaskTool = buildCreateTaskTool(app);
			await seed(db, ids);
			const result = await createTaskTool.handler(
				{ title: "Subtask" },
				makeContext(db, eventBus, ids),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { taskId: string };
			const [inserted] = await db.select().from(tasks).where(eq(tasks.id, data.taskId));
			expect(inserted?.state).toBe("proposed");
		});
	});

	// Event emission
	describe("event emission", () => {
		test("emits task_state_changed event after creating a task", async ({
			db,
			eventBus,
			app,
			ids,
		}) => {
			const createTaskTool = buildCreateTaskTool(app);
			await seed(db, ids);
			const emitted: TaskStateChangedEvent[] = [];
			eventBus.on("task_state_changed", (e: TaskStateChangedEvent) => emitted.push(e));

			const result = await createTaskTool.handler(
				{ title: "New Task" },
				makeContext(db, eventBus, ids),
			);

			expect(result.success).toBe(true);
			expect(emitted).toHaveLength(1);
			if (!result.success) return;

			const data = result.data as { taskId: string };
			expect(emitted[0]!.taskId).toBe(data.taskId);
		});
	});

	// Error cases
	describe("error cases", () => {
		test("returns NOT_FOUND when ctx.taskId does not exist", async ({ db, eventBus, app, ids }) => {
			const createTaskTool = buildCreateTaskTool(app);
			await seed(db, ids);
			const ctx: ToolContext<HyperIdleDb> = {
				...makeContext(db, eventBus, ids),
				taskId: ids("ghost-task"),
			};

			const result = await createTaskTool.handler({ title: "Will fail" }, ctx);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("NOT_FOUND");
		});

		test("returns INVALID_INPUT when title is empty string", async ({ db, eventBus, app, ids }) => {
			const createTaskTool = buildCreateTaskTool(app);
			await seed(db, ids);
			const result = await createTaskTool.handler({ title: "" }, makeContext(db, eventBus, ids));

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		test("returns INVALID_INPUT when title exceeds 512 characters", async ({
			db,
			eventBus,
			app,
			ids,
		}) => {
			const createTaskTool = buildCreateTaskTool(app);
			await seed(db, ids);
			const result = await createTaskTool.handler(
				{ title: "x".repeat(513) },
				makeContext(db, eventBus, ids),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});
	});
});
