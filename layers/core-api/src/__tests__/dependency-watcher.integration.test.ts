import { type HyperIdleDb, tasks, teams, users } from "@hyperidle/db";
import type { ActionResult, EditTaskInput, TaskState, TaskView } from "@hyperidle/domain-model";
import type { NotificationEvent, TaskStateChangedEvent } from "@hyperidle/event-bus";
import { checkAndUnblockDependents } from "@hyperidle/task";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";
import type { ActionContext } from "../actions/action.js";
import { buildCoreActions } from "../actions/compose.js";

/**
 * §6 row 2: `checkAndUnblockDependents` writes through `edit_task` now —
 * this test builds the real composed action off the `agentOrchestration`
 * fixture and calls it directly, the same shape `app.ts`'s ambient
 * `task_state_changed` subscription uses.
 */
function makeEditTask(
	agentOrchestration: Parameters<typeof buildCoreActions>[0],
): (ctx: ActionContext, input: EditTaskInput) => Promise<ActionResult<TaskView>> {
	const editTaskAction = buildCoreActions(agentOrchestration).find(
		(a) => a.declaration.name === "edit_task",
	);
	if (!editTaskAction) throw new Error("edit_task action not found");
	return editTaskAction.run as (
		ctx: ActionContext,
		input: EditTaskInput,
	) => Promise<ActionResult<TaskView>>;
}

function makeCtx(db: HyperIdleDb, eventBus: ActionContext["eventBus"]): ActionContext {
	return { actor: "system:propagation", db, eventBus, now: new Date().toISOString() };
}

async function seedPrerequisites(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "p1", name: "Test Product", phase: "build", createdAt: now });

	// `changes.actor` FKs to `users` — `makeCtx`'s actor "system:propagation"
	// needs a real row for `edit_task`'s changes-row write to succeed.
	await db
		.insert(users)
		.values({
			id: "system:propagation",
			name: "Propagation System",
			role: "system",
			status: "active",
			createdAt: now,
		})
		.onConflictDoNothing();

	await db.insert(tasks).values({
		id: "b1",
		parentTaskId: null,
		teamId: "p1",
		title: "Test bet",
		description: "Test bet",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
}

async function insertTask(
	db: HyperIdleDb,
	id: string,
	state: TaskState,
	dependencies?: string[],
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(tasks).values({
		id,
		parentTaskId: "b1",
		teamId: "p1",
		title: `Task ${id}`,
		state,
		dependencies: dependencies ? JSON.stringify(dependencies) : null,
		createdAt: now,
		updatedAt: now,
	});
}

describe("Dependency Watcher", () => {
	describe("single dependency completion", () => {
		test("unblocks a dependent task when its only dependency is done", async ({
			db,
			eventBus,
			agentOrchestration,
		}) => {
			await seedPrerequisites(db);
			await insertTask(db, "dep-1", "done");
			await insertTask(db, "dependent", "hold", ["dep-1"]);

			await checkAndUnblockDependents(
				makeCtx(db, eventBus),
				"dep-1",
				makeEditTask(agentOrchestration),
			);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "dependent"));
			expect(task?.state).toBe("accepted");
		});

		test("does not unblock a task that is not in hold state", async ({
			db,
			eventBus,
			agentOrchestration,
		}) => {
			await seedPrerequisites(db);
			await insertTask(db, "dep-1", "done");
			await insertTask(db, "dependent", "in_progress", ["dep-1"]);

			await checkAndUnblockDependents(
				makeCtx(db, eventBus),
				"dep-1",
				makeEditTask(agentOrchestration),
			);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "dependent"));
			expect(task?.state).toBe("in_progress");
		});

		test("handles tasks with no dependents gracefully", async ({
			db,
			eventBus,
			agentOrchestration,
		}) => {
			await seedPrerequisites(db);
			await insertTask(db, "standalone", "done");
			// Should not throw
			await checkAndUnblockDependents(
				makeCtx(db, eventBus),
				"standalone",
				makeEditTask(agentOrchestration),
			);
		});
	});

	describe("multi-dependency completion", () => {
		test("only unblocks when ALL dependencies are done", async ({
			db,
			eventBus,
			agentOrchestration,
		}) => {
			await seedPrerequisites(db);
			await insertTask(db, "dep-1", "done");
			await insertTask(db, "dep-2", "in_progress");
			await insertTask(db, "dependent", "hold", ["dep-1", "dep-2"]);

			await checkAndUnblockDependents(
				makeCtx(db, eventBus),
				"dep-1",
				makeEditTask(agentOrchestration),
			);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "dependent"));
			expect(task?.state).toBe("hold");
		});

		test("unblocks when the last dependency completes", async ({
			db,
			eventBus,
			agentOrchestration,
		}) => {
			await seedPrerequisites(db);
			await insertTask(db, "dep-1", "done");
			await insertTask(db, "dep-2", "done");
			await insertTask(db, "dependent", "hold", ["dep-1", "dep-2"]);

			await checkAndUnblockDependents(
				makeCtx(db, eventBus),
				"dep-2",
				makeEditTask(agentOrchestration),
			);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "dependent"));
			expect(task?.state).toBe("accepted");
		});
	});

	describe("notification emission", () => {
		test("emits notification event on auto-transition", async ({
			db,
			eventBus,
			agentOrchestration,
		}) => {
			await seedPrerequisites(db);
			await insertTask(db, "dep-1", "done");
			await insertTask(db, "dependent", "hold", ["dep-1"]);

			const notifications: NotificationEvent[] = [];
			eventBus.on("notification", (e) => notifications.push(e));

			await checkAndUnblockDependents(
				makeCtx(db, eventBus),
				"dep-1",
				makeEditTask(agentOrchestration),
			);

			expect(notifications).toHaveLength(1);
			expect(notifications[0]!.targetId).toBe("dependent");
			expect(notifications[0]!.message).toContain("dependent");
			expect(notifications[0]!.message).toContain("accepted");
		});

		test("emits task_state_changed event on auto-transition", async ({
			db,
			eventBus,
			agentOrchestration,
		}) => {
			await seedPrerequisites(db);
			await insertTask(db, "dep-1", "done");
			await insertTask(db, "dependent", "hold", ["dep-1"]);

			const events: TaskStateChangedEvent[] = [];
			eventBus.on("task_state_changed", (e) => events.push(e));

			await checkAndUnblockDependents(
				makeCtx(db, eventBus),
				"dep-1",
				makeEditTask(agentOrchestration),
			);

			expect(events).toHaveLength(1);
			expect(events[0]!.taskId).toBe("dependent");
			expect(events[0]!.fromState).toBe("hold");
			expect(events[0]!.toState).toBe("accepted");
		});

		test("does not emit notification when task stays in hold", async ({
			db,
			eventBus,
			agentOrchestration,
		}) => {
			await seedPrerequisites(db);
			await insertTask(db, "dep-1", "done");
			await insertTask(db, "dep-2", "in_progress");
			await insertTask(db, "dependent", "hold", ["dep-1", "dep-2"]);

			const notifications: NotificationEvent[] = [];
			eventBus.on("notification", (e) => notifications.push(e));

			await checkAndUnblockDependents(
				makeCtx(db, eventBus),
				"dep-1",
				makeEditTask(agentOrchestration),
			);

			expect(notifications).toHaveLength(0);
		});
	});

	// I3 review W3 / sec MEDIUM-2: LIKE wildcards (`%`, `_`) in the
	// completedTaskId must be escaped so a malformed/exotic ID can't
	// match unrelated dependents. UUIDs don't contain these chars but
	// the escape is defence-in-depth for future ID formats.
	describe("LIKE wildcard escape (W3)", () => {
		test("treats `%` in completedTaskId as a literal, not a wildcard", async ({
			db,
			eventBus,
			agentOrchestration,
		}) => {
			await seedPrerequisites(db);
			await insertTask(db, "anyREALLYid", "done");
			await insertTask(db, "dependent", "hold", ["anyREALLYid"]);

			await checkAndUnblockDependents(
				makeCtx(db, eventBus),
				"any%id",
				makeEditTask(agentOrchestration),
			);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "dependent"));
			expect(task?.state).toBe("hold");
		});

		test("treats `_` in completedTaskId as a literal, not a single-char wildcard", async ({
			db,
			eventBus,
			agentOrchestration,
		}) => {
			await seedPrerequisites(db);
			await insertTask(db, "depX1", "done");
			await insertTask(db, "dependent", "hold", ["depX1"]);

			await checkAndUnblockDependents(
				makeCtx(db, eventBus),
				"dep_1",
				makeEditTask(agentOrchestration),
			);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "dependent"));
			expect(task?.state).toBe("hold");
		});
	});

	describe("multiple dependents", () => {
		test("unblocks multiple tasks that depend on the same completed task", async ({
			db,
			eventBus,
			agentOrchestration,
		}) => {
			await seedPrerequisites(db);
			await insertTask(db, "dep-1", "done");
			await insertTask(db, "dependent-a", "hold", ["dep-1"]);
			await insertTask(db, "dependent-b", "hold", ["dep-1"]);

			await checkAndUnblockDependents(
				makeCtx(db, eventBus),
				"dep-1",
				makeEditTask(agentOrchestration),
			);

			const [taskA] = await db.select().from(tasks).where(eq(tasks.id, "dependent-a"));
			const [taskB] = await db.select().from(tasks).where(eq(tasks.id, "dependent-b"));
			expect(taskA?.state).toBe("accepted");
			expect(taskB?.state).toBe("accepted");
		});
	});
});
