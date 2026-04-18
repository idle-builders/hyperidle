import { type HyperIdleDb, bets, createTestDb, products, tasks, teams } from "@hyperidle/db";
import {
	EventBus,
	type NotificationEvent,
	type TaskState,
	type TaskStateChangedEvent,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { checkAndUnblockDependents } from "../services/dependency-watcher.js";

function seedPrerequisites(db: HyperIdleDb): void {
	const now = new Date().toISOString();
	db.insert(products)
		.values({ id: "p1", name: "Test Product", phase: "build", createdAt: now })
		.run();
	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(bets)
		.values({
			id: "b1",
			productId: "p1",
			teamId: "t1",
			pitch: "Test bet",
			appetite: "small",
			status: "committed",
			createdAt: now,
		})
		.run();
}

function insertTask(db: HyperIdleDb, id: string, state: TaskState, dependencies?: string[]): void {
	const now = new Date().toISOString();
	db.insert(tasks)
		.values({
			id,
			betId: "b1",
			productId: "p1",
			teamId: "t1",
			title: `Task ${id}`,
			state,
			dependencies: dependencies ? JSON.stringify(dependencies) : null,
			createdAt: now,
			updatedAt: now,
		})
		.run();
}

describe("Dependency Watcher", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		seedPrerequisites(db);
	});

	describe("single dependency completion", () => {
		it("unblocks a dependent task when its only dependency is done", () => {
			insertTask(db, "dep-1", "done");
			insertTask(db, "dependent", "hold", ["dep-1"]);

			checkAndUnblockDependents(db, eventBus, "dep-1");

			const task = db.select().from(tasks).where(eq(tasks.id, "dependent")).get();
			expect(task?.state).toBe("accepted");
		});

		it("does not unblock a task that is not in hold state", () => {
			insertTask(db, "dep-1", "done");
			insertTask(db, "dependent", "in_progress", ["dep-1"]);

			checkAndUnblockDependents(db, eventBus, "dep-1");

			const task = db.select().from(tasks).where(eq(tasks.id, "dependent")).get();
			expect(task?.state).toBe("in_progress");
		});

		it("handles tasks with no dependents gracefully", () => {
			insertTask(db, "standalone", "done");
			// Should not throw
			checkAndUnblockDependents(db, eventBus, "standalone");
		});
	});

	describe("multi-dependency completion", () => {
		it("only unblocks when ALL dependencies are done", () => {
			insertTask(db, "dep-1", "done");
			insertTask(db, "dep-2", "in_progress");
			insertTask(db, "dependent", "hold", ["dep-1", "dep-2"]);

			checkAndUnblockDependents(db, eventBus, "dep-1");

			const task = db.select().from(tasks).where(eq(tasks.id, "dependent")).get();
			expect(task?.state).toBe("hold");
		});

		it("unblocks when the last dependency completes", () => {
			insertTask(db, "dep-1", "done");
			insertTask(db, "dep-2", "done");
			insertTask(db, "dependent", "hold", ["dep-1", "dep-2"]);

			checkAndUnblockDependents(db, eventBus, "dep-2");

			const task = db.select().from(tasks).where(eq(tasks.id, "dependent")).get();
			expect(task?.state).toBe("accepted");
		});
	});

	describe("notification emission", () => {
		it("emits notification event on auto-transition", () => {
			insertTask(db, "dep-1", "done");
			insertTask(db, "dependent", "hold", ["dep-1"]);

			const notifications: NotificationEvent[] = [];
			eventBus.on("notification", (e) => notifications.push(e));

			checkAndUnblockDependents(db, eventBus, "dep-1");

			expect(notifications).toHaveLength(1);
			expect(notifications[0].targetId).toBe("dependent");
			expect(notifications[0].message).toContain("dependent");
			expect(notifications[0].message).toContain("accepted");
		});

		it("emits task_state_changed event on auto-transition", () => {
			insertTask(db, "dep-1", "done");
			insertTask(db, "dependent", "hold", ["dep-1"]);

			const events: TaskStateChangedEvent[] = [];
			eventBus.on("task_state_changed", (e) => events.push(e));

			checkAndUnblockDependents(db, eventBus, "dep-1");

			expect(events).toHaveLength(1);
			expect(events[0].taskId).toBe("dependent");
			expect(events[0].fromState).toBe("hold");
			expect(events[0].toState).toBe("accepted");
		});

		it("does not emit notification when task stays in hold", () => {
			insertTask(db, "dep-1", "done");
			insertTask(db, "dep-2", "in_progress");
			insertTask(db, "dependent", "hold", ["dep-1", "dep-2"]);

			const notifications: NotificationEvent[] = [];
			eventBus.on("notification", (e) => notifications.push(e));

			checkAndUnblockDependents(db, eventBus, "dep-1");

			expect(notifications).toHaveLength(0);
		});
	});

	// I3 review W3 / sec MEDIUM-2: LIKE wildcards (`%`, `_`) in the
	// completedTaskId must be escaped so a malformed/exotic ID can't
	// match unrelated dependents. UUIDs don't contain these chars but
	// the escape is defence-in-depth for future ID formats.
	describe("LIKE wildcard escape (W3)", () => {
		it("treats `%` in completedTaskId as a literal, not a wildcard", () => {
			// The literal completedTaskId is "any%id". A dependent task
			// listing "anyREALLYid" as a dependency must NOT be unblocked
			// by completion of "any%id" — the `%` must be treated literally.
			insertTask(db, "anyREALLYid", "done");
			insertTask(db, "dependent", "hold", ["anyREALLYid"]);

			// Caller "completes" a task whose id contains `%`. Without the
			// escape, the SQL LIKE pattern `%"any%id"%` would match the
			// stored dependency `"anyREALLYid"`. With the escape it
			// doesn't.
			checkAndUnblockDependents(db, eventBus, "any%id");

			const task = db.select().from(tasks).where(eq(tasks.id, "dependent")).get();
			expect(task?.state).toBe("hold");
		});

		it("treats `_` in completedTaskId as a literal, not a single-char wildcard", () => {
			insertTask(db, "depX1", "done");
			insertTask(db, "dependent", "hold", ["depX1"]);

			// SQL `_` is single-char wildcard; without escape `dep_1` would
			// match `depX1`. Escape forces literal.
			checkAndUnblockDependents(db, eventBus, "dep_1");

			const task = db.select().from(tasks).where(eq(tasks.id, "dependent")).get();
			expect(task?.state).toBe("hold");
		});
	});

	describe("multiple dependents", () => {
		it("unblocks multiple tasks that depend on the same completed task", () => {
			insertTask(db, "dep-1", "done");
			insertTask(db, "dependent-a", "hold", ["dep-1"]);
			insertTask(db, "dependent-b", "hold", ["dep-1"]);

			checkAndUnblockDependents(db, eventBus, "dep-1");

			const taskA = db.select().from(tasks).where(eq(tasks.id, "dependent-a")).get();
			const taskB = db.select().from(tasks).where(eq(tasks.id, "dependent-b")).get();
			expect(taskA?.state).toBe("accepted");
			expect(taskB?.state).toBe("accepted");
		});
	});
});
