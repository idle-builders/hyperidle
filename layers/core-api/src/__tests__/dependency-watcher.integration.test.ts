import { bets, type HyperIdleDb, tasks, teamMembers, teams } from "@hyperidle/db";
import type { NotificationEvent, TaskState, TaskStateChangedEvent } from "@hyperidle/domain-model";
import { requireRunnableAgent } from "@hyperidle/users";
import { checkAndUnblockDependents } from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

// @lore AU20 Ag2: `checkAndUnblockDependents` relocated to `@hyperidle/work`
// and simplified — the `work:` sub-object is gone (function calls work
// internals directly). Only the against-grain `workIntents` recorder remains injected.
// AgentWorkIntentRecorderFn is a plain function (tx was ignored by the sole production impl).
const depWatcherDeps = {
	workIntents: async () => ({ id: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
	taskRunResolver: { requireRunnableAgent },
};

async function seedPrerequisites(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "p1", name: "Test Product", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(bets).values({
		id: "b1",
		teamId: "p1",
		description: "Test bet",
		appetite: "small",
		status: "active",
		createdAt: now,
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
		betId: "b1",
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
		test("unblocks a dependent task when its only dependency is done", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "dep-1", "done");
			await insertTask(db, "dependent", "hold", ["dep-1"]);

			await checkAndUnblockDependents(db, eventBus, "dep-1", depWatcherDeps);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "dependent"));
			expect(task?.state).toBe("accepted");
		});

		test("does not unblock a task that is not in hold state", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "dep-1", "done");
			await insertTask(db, "dependent", "in_progress", ["dep-1"]);

			await checkAndUnblockDependents(db, eventBus, "dep-1", depWatcherDeps);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "dependent"));
			expect(task?.state).toBe("in_progress");
		});

		test("handles tasks with no dependents gracefully", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "standalone", "done");
			// Should not throw
			await checkAndUnblockDependents(db, eventBus, "standalone", depWatcherDeps);
		});
	});

	describe("multi-dependency completion", () => {
		test("only unblocks when ALL dependencies are done", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "dep-1", "done");
			await insertTask(db, "dep-2", "in_progress");
			await insertTask(db, "dependent", "hold", ["dep-1", "dep-2"]);

			await checkAndUnblockDependents(db, eventBus, "dep-1", depWatcherDeps);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "dependent"));
			expect(task?.state).toBe("hold");
		});

		test("unblocks when the last dependency completes", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "dep-1", "done");
			await insertTask(db, "dep-2", "done");
			await insertTask(db, "dependent", "hold", ["dep-1", "dep-2"]);

			await checkAndUnblockDependents(db, eventBus, "dep-2", depWatcherDeps);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "dependent"));
			expect(task?.state).toBe("accepted");
		});
	});

	describe("notification emission", () => {
		test("emits notification event on auto-transition", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "dep-1", "done");
			await insertTask(db, "dependent", "hold", ["dep-1"]);

			const notifications: NotificationEvent[] = [];
			eventBus.on("notification", (e) => notifications.push(e));

			await checkAndUnblockDependents(db, eventBus, "dep-1", depWatcherDeps);

			expect(notifications).toHaveLength(1);
			expect(notifications[0]!.targetId).toBe("dependent");
			expect(notifications[0]!.message).toContain("dependent");
			expect(notifications[0]!.message).toContain("accepted");
		});

		test("emits task_state_changed event on auto-transition", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "dep-1", "done");
			await insertTask(db, "dependent", "hold", ["dep-1"]);

			const events: TaskStateChangedEvent[] = [];
			eventBus.on("task_state_changed", (e) => events.push(e));

			await checkAndUnblockDependents(db, eventBus, "dep-1", depWatcherDeps);

			expect(events).toHaveLength(1);
			expect(events[0]!.taskId).toBe("dependent");
			expect(events[0]!.fromState).toBe("hold");
			expect(events[0]!.toState).toBe("accepted");
		});

		test("does not emit notification when task stays in hold", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "dep-1", "done");
			await insertTask(db, "dep-2", "in_progress");
			await insertTask(db, "dependent", "hold", ["dep-1", "dep-2"]);

			const notifications: NotificationEvent[] = [];
			eventBus.on("notification", (e) => notifications.push(e));

			await checkAndUnblockDependents(db, eventBus, "dep-1", depWatcherDeps);

			expect(notifications).toHaveLength(0);
		});
	});

	// I3 review W3 / sec MEDIUM-2: LIKE wildcards (`%`, `_`) in the
	// completedTaskId must be escaped so a malformed/exotic ID can't
	// match unrelated dependents. UUIDs don't contain these chars but
	// the escape is defence-in-depth for future ID formats.
	describe("LIKE wildcard escape (W3)", () => {
		test("treats `%` in completedTaskId as a literal, not a wildcard", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			// The literal completedTaskId is "any%id". A dependent task
			// listing "anyREALLYid" as a dependency must NOT be unblocked
			// by completion of "any%id" — the `%` must be treated literally.
			await insertTask(db, "anyREALLYid", "done");
			await insertTask(db, "dependent", "hold", ["anyREALLYid"]);

			// Caller "completes" a task whose id contains `%`. Without the
			// escape, the SQL LIKE pattern `%"any%id"%` would match the
			// stored dependency `"anyREALLYid"`. With the escape it
			// doesn't.
			await checkAndUnblockDependents(db, eventBus, "any%id", depWatcherDeps);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "dependent"));
			expect(task?.state).toBe("hold");
		});

		test("treats `_` in completedTaskId as a literal, not a single-char wildcard", async ({
			db,
			eventBus,
		}) => {
			await seedPrerequisites(db);
			await insertTask(db, "depX1", "done");
			await insertTask(db, "dependent", "hold", ["depX1"]);

			// SQL `_` is single-char wildcard; without escape `dep_1` would
			// match `depX1`. Escape forces literal.
			await checkAndUnblockDependents(db, eventBus, "dep_1", depWatcherDeps);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "dependent"));
			expect(task?.state).toBe("hold");
		});
	});

	describe("multiple dependents", () => {
		test("unblocks multiple tasks that depend on the same completed task", async ({
			db,
			eventBus,
		}) => {
			await seedPrerequisites(db);
			await insertTask(db, "dep-1", "done");
			await insertTask(db, "dependent-a", "hold", ["dep-1"]);
			await insertTask(db, "dependent-b", "hold", ["dep-1"]);

			await checkAndUnblockDependents(db, eventBus, "dep-1", depWatcherDeps);

			const [taskA] = await db.select().from(tasks).where(eq(tasks.id, "dependent-a"));
			const [taskB] = await db.select().from(tasks).where(eq(tasks.id, "dependent-b"));
			expect(taskA?.state).toBe("accepted");
			expect(taskB?.state).toBe("accepted");
		});
	});
});
