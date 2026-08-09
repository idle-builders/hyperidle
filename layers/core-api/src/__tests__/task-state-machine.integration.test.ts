import { bets, type HyperIdleDb, tasks, teamMembers, teams } from "@hyperidle/db";
import type { NotificationEvent, TaskState, TaskStateChangedEvent } from "@hyperidle/domain-model";
import { enqueueWorkIntent } from "@hyperidle/session-requests";
import { requireRunnableAgent } from "@hyperidle/users";
import type {
	StateTransitionAuditEntry,
	TaskAuditEntry,
	TaskStateMachineDeps,
} from "@hyperidle/work";
import { checkAndUnblockDependents, InvalidTransitionError, transitionTask } from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

/** AU19 Increment 1b: `transitionTask` now takes an injected `session-requests` port. */
const testDeps: TaskStateMachineDeps = {
	workIntents: { record: enqueueWorkIntent },
	taskRunResolver: { requireRunnableAgent },
};

/** AU20 Ag2: `checkAndUnblockDependents` relocated to work; `work:` sub-object removed. */
const depWatcherDeps = {
	workIntents: { record: enqueueWorkIntent },
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

describe("Task State Machine", () => {
	describe("valid transitions", () => {
		test("transitions proposed -> accepted", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-1", "proposed");
			await transitionTask(db, eventBus, "task-1", "accepted", testDeps);
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.state).toBe("accepted");
		});

		test("transitions accepted -> in_progress", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-1", "accepted");
			await transitionTask(db, eventBus, "task-1", "in_progress", testDeps);
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.state).toBe("in_progress");
		});

		test("transitions in_progress -> review", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-1", "in_progress");
			await transitionTask(db, eventBus, "task-1", "review", testDeps);
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.state).toBe("review");
		});

		test("transitions review -> done", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-1", "review");
			await transitionTask(db, eventBus, "task-1", "done", testDeps);
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.state).toBe("done");
		});

		test("transitions accepted -> hold", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-1", "accepted");
			await transitionTask(db, eventBus, "task-1", "hold", testDeps);
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.state).toBe("hold");
		});

		test("transitions in_progress -> blocked", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-1", "in_progress");
			await transitionTask(db, eventBus, "task-1", "blocked", testDeps);
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.state).toBe("blocked");
		});

		test("transitions blocked -> in_progress", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-1", "blocked");
			await transitionTask(db, eventBus, "task-1", "in_progress", testDeps);
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.state).toBe("in_progress");
		});

		test("transitions review -> in_progress (rework)", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-1", "review");
			await transitionTask(db, eventBus, "task-1", "in_progress", testDeps);
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			expect(task?.state).toBe("in_progress");
		});
	});

	describe("invalid transitions", () => {
		test("throws InvalidTransitionError for proposed -> done", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-1", "proposed");
			await expect(transitionTask(db, eventBus, "task-1", "done", testDeps)).rejects.toThrow(
				InvalidTransitionError,
			);
		});

		test("throws InvalidTransitionError for done -> proposed", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-1", "done");
			await expect(transitionTask(db, eventBus, "task-1", "proposed", testDeps)).rejects.toThrow(
				InvalidTransitionError,
			);
		});

		test("throws InvalidTransitionError for proposed -> in_progress", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-1", "proposed");
			await expect(transitionTask(db, eventBus, "task-1", "in_progress", testDeps)).rejects.toThrow(
				InvalidTransitionError,
			);
		});

		test("throws when task does not exist", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await expect(
				transitionTask(db, eventBus, "nonexistent", "accepted", testDeps),
			).rejects.toThrow();
		});
	});

	describe("killed is reachable from any state", () => {
		const allStates: TaskState[] = [
			"proposed",
			"accepted",
			"hold",
			"in_progress",
			"blocked",
			"review",
			"done",
		];

		for (const state of allStates) {
			test(`transitions ${state} -> killed`, async ({ db, eventBus }) => {
				await seedPrerequisites(db);
				await insertTask(db, `task-${state}`, state);
				await transitionTask(db, eventBus, `task-${state}`, "killed", testDeps);
				const [task] = await db
					.select()
					.from(tasks)
					.where(eq(tasks.id, `task-${state}`));
				expect(task?.state).toBe("killed");
			});
		}
	});

	describe("all 8 states are achievable", () => {
		test("can reach all 8 states through valid transitions", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			const achievedStates = new Set<TaskState>();

			// proposed (initial)
			await insertTask(db, "t-proposed", "proposed");
			achievedStates.add("proposed");

			// proposed -> accepted
			await insertTask(db, "t-accepted", "proposed");
			await transitionTask(db, eventBus, "t-accepted", "accepted", testDeps);
			achievedStates.add("accepted");

			// accepted -> hold
			await insertTask(db, "t-hold", "accepted");
			await transitionTask(db, eventBus, "t-hold", "hold", testDeps);
			achievedStates.add("hold");

			// accepted -> in_progress
			await insertTask(db, "t-in-progress", "accepted");
			await transitionTask(db, eventBus, "t-in-progress", "in_progress", testDeps);
			achievedStates.add("in_progress");

			// in_progress -> blocked
			await insertTask(db, "t-blocked", "in_progress");
			await transitionTask(db, eventBus, "t-blocked", "blocked", testDeps);
			achievedStates.add("blocked");

			// in_progress -> review
			await insertTask(db, "t-review", "in_progress");
			await transitionTask(db, eventBus, "t-review", "review", testDeps);
			achievedStates.add("review");

			// review -> done
			await insertTask(db, "t-done", "review");
			await transitionTask(db, eventBus, "t-done", "done", testDeps);
			achievedStates.add("done");

			// proposed -> killed
			await insertTask(db, "t-killed", "proposed");
			await transitionTask(db, eventBus, "t-killed", "killed", testDeps);
			achievedStates.add("killed");

			expect(achievedStates.size).toBe(8);
			expect(achievedStates).toContain("proposed");
			expect(achievedStates).toContain("accepted");
			expect(achievedStates).toContain("hold");
			expect(achievedStates).toContain("in_progress");
			expect(achievedStates).toContain("blocked");
			expect(achievedStates).toContain("review");
			expect(achievedStates).toContain("done");
			expect(achievedStates).toContain("killed");
		});
	});

	describe("audit trail", () => {
		test("logs every transition in the audit trail", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-1", "proposed");
			await transitionTask(db, eventBus, "task-1", "accepted", testDeps);
			await transitionTask(db, eventBus, "task-1", "in_progress", testDeps);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-1"));
			const audit = JSON.parse(task?.auditTrail ?? "[]") as TaskAuditEntry[];
			expect(audit).toHaveLength(2);
			const first = audit[0] as StateTransitionAuditEntry;
			const second = audit[1] as StateTransitionAuditEntry;
			expect(first.from).toBe("proposed");
			expect(first.to).toBe("accepted");
			expect(second.from).toBe("accepted");
			expect(second.to).toBe("in_progress");
		});

		test("preserves existing audit entries when appending new ones", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			const now = new Date().toISOString();
			const existingAudit: StateTransitionAuditEntry[] = [
				{ from: "proposed", to: "accepted", timestamp: now },
			];
			await db.insert(tasks).values({
				id: "task-existing",
				betId: "b1",
				teamId: "p1",
				title: "Existing task",
				state: "proposed",
				auditTrail: JSON.stringify(existingAudit),
				createdAt: now,
				updatedAt: now,
			});

			await transitionTask(db, eventBus, "task-existing", "accepted", testDeps);

			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-existing"));
			const audit = JSON.parse(task?.auditTrail ?? "[]") as TaskAuditEntry[];
			expect(audit).toHaveLength(2);
			const first = audit[0] as StateTransitionAuditEntry;
			const second = audit[1] as StateTransitionAuditEntry;
			expect(first.from).toBe("proposed");
			expect(first.to).toBe("accepted");
			expect(second.from).toBe("proposed");
			expect(second.to).toBe("accepted");
		});
	});

	describe("event emission", () => {
		test("emits task_state_changed event on valid transition", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-1", "proposed");
			const events: TaskStateChangedEvent[] = [];
			eventBus.on("task_state_changed", (e) => events.push(e));

			await transitionTask(db, eventBus, "task-1", "accepted", testDeps);

			expect(events).toHaveLength(1);
			expect(events[0]!.taskId).toBe("task-1");
			expect(events[0]!.fromState).toBe("proposed");
			expect(events[0]!.toState).toBe("accepted");
			expect(events[0]!.streamId).toBe("task-1");
		});

		test("does not emit event on invalid transition", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-1", "proposed");
			const events: TaskStateChangedEvent[] = [];
			eventBus.on("task_state_changed", (e) => events.push(e));

			await expect(transitionTask(db, eventBus, "task-1", "done", testDeps)).rejects.toThrow(
				InvalidTransitionError,
			);
			expect(events).toHaveLength(0);
		});
	});

	describe("dependency-driven auto-transitions (integration)", () => {
		test("task B depends on A: complete A -> B auto-transitions to accepted", async ({
			db,
			eventBus,
		}) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-a", "in_progress");
			await insertTask(db, "task-b", "hold", ["task-a"]);

			// Complete task A through valid path
			await transitionTask(db, eventBus, "task-a", "review", testDeps);
			await transitionTask(db, eventBus, "task-a", "done", testDeps);
			await checkAndUnblockDependents(db, eventBus, "task-a", depWatcherDeps);

			const [taskB] = await db.select().from(tasks).where(eq(tasks.id, "task-b"));
			expect(taskB?.state).toBe("accepted");
		});

		test("task C depends on A and B: complete A -> C stays hold, complete B -> C transitions", async ({
			db,
			eventBus,
		}) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-a", "in_progress");
			await insertTask(db, "task-b", "in_progress");
			await insertTask(db, "task-c", "hold", ["task-a", "task-b"]);

			// Complete A
			await transitionTask(db, eventBus, "task-a", "review", testDeps);
			await transitionTask(db, eventBus, "task-a", "done", testDeps);
			await checkAndUnblockDependents(db, eventBus, "task-a", depWatcherDeps);

			let [taskC] = await db.select().from(tasks).where(eq(tasks.id, "task-c"));
			expect(taskC?.state).toBe("hold");

			// Complete B
			await transitionTask(db, eventBus, "task-b", "review", testDeps);
			await transitionTask(db, eventBus, "task-b", "done", testDeps);
			await checkAndUnblockDependents(db, eventBus, "task-b", depWatcherDeps);

			[taskC] = await db.select().from(tasks).where(eq(tasks.id, "task-c"));
			expect(taskC?.state).toBe("accepted");
		});

		test("hold -> accepted auto-transition emits notification event", async ({ db, eventBus }) => {
			await seedPrerequisites(db);
			await insertTask(db, "task-a", "review");
			await insertTask(db, "task-b", "hold", ["task-a"]);

			const notifications: NotificationEvent[] = [];
			eventBus.on("notification", (e) => notifications.push(e));

			await transitionTask(db, eventBus, "task-a", "done", testDeps);
			await checkAndUnblockDependents(db, eventBus, "task-a", depWatcherDeps);

			expect(notifications).toHaveLength(1);
			expect(notifications[0]!.targetId).toBe("task-b");
			expect(notifications[0]!.message).toContain("task-b");
			expect(notifications[0]!.message).toContain("accepted");
		});
	});
});
