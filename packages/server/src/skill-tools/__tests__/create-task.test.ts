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
	bets,
	createTestDb,
	type HyperIdleDb,
	products,
	type TestDbHandle,
	tasks,
	teams,
	users,
} from "@hyperidle/db";
import type { TaskStateChangedEvent } from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskTool } from "../create-task.js";
import type { ToolContext } from "../tool-registry.js";

const NOW = new Date().toISOString();

async function seed(db: HyperIdleDb): Promise<void> {
	await db
		.insert(products)
		.values({ id: "p1", name: "Test Product", phase: "build", createdAt: NOW });
	await db
		.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: "b1",
		productId: "p1",
		teamId: "t1",
		pitch: "Implement feature X",
		status: "committed",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "agent-a",
		name: "Builder Agent",
		role: "builder",
		teamId: "t1",
		status: "active",
		maxConcurrentSessions: 2,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-1",
		betId: "b1",
		productId: "p1",
		teamId: "t1",
		ownerAgentId: "agent-a",
		title: "Parent Task",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

function makeContext(db: HyperIdleDb, eventBus: EventBus): ToolContext {
	return {
		db,
		eventBus,
		agentId: "agent-a",
		sessionId: "session-1",
		taskId: "task-1",
		workspacePath: path.join(os.tmpdir(), `hi-r5-createtask-${Date.now()}`),
		watcher: { stop: (): void => {} },
	};
}

describe("create_task tool", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		await seed(db);
	});

	afterEach(async () => {
		await handle?.close();
	});

	// AC1 happy path: task created with correct betId, productId, teamId, ownerAgentId, state
	describe("AC1: creates task with correct fields", () => {
		it("returns ok with taskId and inserts task row with derived betId", async () => {
			const result = await createTaskTool.handler(
				{ title: "Implement feature X" },
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { taskId: string; betId: string };
			expect(typeof data.taskId).toBe("string");
			expect(data.betId).toBe("b1");

			const [inserted] = await db.select().from(tasks).where(eq(tasks.id, data.taskId));
			expect(inserted).toBeDefined();
			expect(inserted?.betId).toBe("b1");
			expect(inserted?.productId).toBe("p1");
			expect(inserted?.teamId).toBe("t1");
			expect(inserted?.ownerAgentId).toBe("agent-a");
			expect(inserted?.title).toBe("Implement feature X");
			expect(inserted?.state).toBe("proposed");
		});

		it("persists optional description and doneCondition when provided", async () => {
			const result = await createTaskTool.handler(
				{
					title: "Write tests",
					description: "Cover all edge cases",
					doneCondition: "All tests pass and coverage >= 90%",
				},
				makeContext(db, eventBus),
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
		it("inserted task has state=proposed", async () => {
			const result = await createTaskTool.handler({ title: "Subtask" }, makeContext(db, eventBus));

			expect(result.success).toBe(true);
			if (!result.success) return;

			const data = result.data as { taskId: string };
			const [inserted] = await db.select().from(tasks).where(eq(tasks.id, data.taskId));
			expect(inserted?.state).toBe("proposed");
		});
	});

	// Event emission
	describe("event emission", () => {
		it("emits task_state_changed event after creating a task", async () => {
			const emitted: TaskStateChangedEvent[] = [];
			eventBus.on("task_state_changed", (e: TaskStateChangedEvent) => emitted.push(e));

			const result = await createTaskTool.handler({ title: "New Task" }, makeContext(db, eventBus));

			expect(result.success).toBe(true);
			expect(emitted).toHaveLength(1);
			if (!result.success) return;

			const data = result.data as { taskId: string };
			expect(emitted[0].taskId).toBe(data.taskId);
		});
	});

	// Error cases
	describe("error cases", () => {
		it("returns NOT_FOUND when ctx.taskId does not exist", async () => {
			const ctx: ToolContext = {
				...makeContext(db, eventBus),
				taskId: "ghost-task-does-not-exist",
			};

			const result = await createTaskTool.handler({ title: "Will fail" }, ctx);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("NOT_FOUND");
		});

		it("returns INVALID_INPUT when title is empty string", async () => {
			const result = await createTaskTool.handler({ title: "" }, makeContext(db, eventBus));

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});

		it("returns INVALID_INPUT when title exceeds 512 characters", async () => {
			const result = await createTaskTool.handler(
				{ title: "x".repeat(513) },
				makeContext(db, eventBus),
			);

			expect(result.success).toBe(false);
			if (result.success) return;
			expect(result.code).toBe("INVALID_INPUT");
		});
	});
});
