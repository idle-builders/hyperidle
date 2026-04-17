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
import { InvalidTransitionError, transitionTask } from "../services/task-state-machine.js";

interface AuditEntry {
	from: string;
	to: string;
	timestamp: string;
}

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

describe("Task State Machine", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		seedPrerequisites(db);
	});

	describe("valid transitions", () => {
		it("transitions proposed -> accepted", () => {
			insertTask(db, "task-1", "proposed");
			transitionTask(db, eventBus, "task-1", "accepted");
			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(task?.state).toBe("accepted");
		});

		it("transitions accepted -> in_progress", () => {
			insertTask(db, "task-1", "accepted");
			transitionTask(db, eventBus, "task-1", "in_progress");
			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(task?.state).toBe("in_progress");
		});

		it("transitions in_progress -> review", () => {
			insertTask(db, "task-1", "in_progress");
			transitionTask(db, eventBus, "task-1", "review");
			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(task?.state).toBe("review");
		});

		it("transitions review -> done", () => {
			insertTask(db, "task-1", "review");
			transitionTask(db, eventBus, "task-1", "done");
			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(task?.state).toBe("done");
		});

		it("transitions accepted -> hold", () => {
			insertTask(db, "task-1", "accepted");
			transitionTask(db, eventBus, "task-1", "hold");
			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(task?.state).toBe("hold");
		});

		it("transitions in_progress -> blocked", () => {
			insertTask(db, "task-1", "in_progress");
			transitionTask(db, eventBus, "task-1", "blocked");
			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(task?.state).toBe("blocked");
		});

		it("transitions blocked -> in_progress", () => {
			insertTask(db, "task-1", "blocked");
			transitionTask(db, eventBus, "task-1", "in_progress");
			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(task?.state).toBe("in_progress");
		});

		it("transitions review -> in_progress (rework)", () => {
			insertTask(db, "task-1", "review");
			transitionTask(db, eventBus, "task-1", "in_progress");
			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			expect(task?.state).toBe("in_progress");
		});
	});

	describe("invalid transitions", () => {
		it("throws InvalidTransitionError for proposed -> done", () => {
			insertTask(db, "task-1", "proposed");
			expect(() => transitionTask(db, eventBus, "task-1", "done")).toThrow(InvalidTransitionError);
		});

		it("throws InvalidTransitionError for done -> proposed", () => {
			insertTask(db, "task-1", "done");
			expect(() => transitionTask(db, eventBus, "task-1", "proposed")).toThrow(
				InvalidTransitionError,
			);
		});

		it("throws InvalidTransitionError for proposed -> in_progress", () => {
			insertTask(db, "task-1", "proposed");
			expect(() => transitionTask(db, eventBus, "task-1", "in_progress")).toThrow(
				InvalidTransitionError,
			);
		});

		it("throws when task does not exist", () => {
			expect(() => transitionTask(db, eventBus, "nonexistent", "accepted")).toThrow();
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
			it(`transitions ${state} -> killed`, () => {
				insertTask(db, `task-${state}`, state);
				transitionTask(db, eventBus, `task-${state}`, "killed");
				const task = db
					.select()
					.from(tasks)
					.where(eq(tasks.id, `task-${state}`))
					.get();
				expect(task?.state).toBe("killed");
			});
		}
	});

	describe("all 8 states are achievable", () => {
		it("can reach all 8 states through valid transitions", () => {
			const achievedStates = new Set<TaskState>();

			// proposed (initial)
			insertTask(db, "t-proposed", "proposed");
			achievedStates.add("proposed");

			// proposed -> accepted
			insertTask(db, "t-accepted", "proposed");
			transitionTask(db, eventBus, "t-accepted", "accepted");
			achievedStates.add("accepted");

			// accepted -> hold
			insertTask(db, "t-hold", "accepted");
			transitionTask(db, eventBus, "t-hold", "hold");
			achievedStates.add("hold");

			// accepted -> in_progress
			insertTask(db, "t-in-progress", "accepted");
			transitionTask(db, eventBus, "t-in-progress", "in_progress");
			achievedStates.add("in_progress");

			// in_progress -> blocked
			insertTask(db, "t-blocked", "in_progress");
			transitionTask(db, eventBus, "t-blocked", "blocked");
			achievedStates.add("blocked");

			// in_progress -> review
			insertTask(db, "t-review", "in_progress");
			transitionTask(db, eventBus, "t-review", "review");
			achievedStates.add("review");

			// review -> done
			insertTask(db, "t-done", "review");
			transitionTask(db, eventBus, "t-done", "done");
			achievedStates.add("done");

			// proposed -> killed
			insertTask(db, "t-killed", "proposed");
			transitionTask(db, eventBus, "t-killed", "killed");
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
		it("logs every transition in the audit trail", () => {
			insertTask(db, "task-1", "proposed");
			transitionTask(db, eventBus, "task-1", "accepted");
			transitionTask(db, eventBus, "task-1", "in_progress");

			const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
			const audit: AuditEntry[] = JSON.parse(task?.auditTrail ?? "[]");
			expect(audit).toHaveLength(2);
			expect(audit[0].from).toBe("proposed");
			expect(audit[0].to).toBe("accepted");
			expect(audit[1].from).toBe("accepted");
			expect(audit[1].to).toBe("in_progress");
		});

		it("preserves existing audit entries when appending new ones", () => {
			const now = new Date().toISOString();
			const existingAudit: AuditEntry[] = [{ from: "initial", to: "proposed", timestamp: now }];
			db.insert(tasks)
				.values({
					id: "task-existing",
					betId: "b1",
					productId: "p1",
					teamId: "t1",
					title: "Existing task",
					state: "proposed",
					auditTrail: JSON.stringify(existingAudit),
					createdAt: now,
					updatedAt: now,
				})
				.run();

			transitionTask(db, eventBus, "task-existing", "accepted");

			const task = db.select().from(tasks).where(eq(tasks.id, "task-existing")).get();
			const audit: AuditEntry[] = JSON.parse(task?.auditTrail ?? "[]");
			expect(audit).toHaveLength(2);
			expect(audit[0].from).toBe("initial");
			expect(audit[1].from).toBe("proposed");
			expect(audit[1].to).toBe("accepted");
		});
	});

	describe("event emission", () => {
		it("emits task_state_changed event on valid transition", () => {
			insertTask(db, "task-1", "proposed");
			const events: TaskStateChangedEvent[] = [];
			eventBus.on("task_state_changed", (e) => events.push(e));

			transitionTask(db, eventBus, "task-1", "accepted");

			expect(events).toHaveLength(1);
			expect(events[0].taskId).toBe("task-1");
			expect(events[0].fromState).toBe("proposed");
			expect(events[0].toState).toBe("accepted");
			expect(events[0].streamId).toBe("task-1");
		});

		it("does not emit event on invalid transition", () => {
			insertTask(db, "task-1", "proposed");
			const events: TaskStateChangedEvent[] = [];
			eventBus.on("task_state_changed", (e) => events.push(e));

			expect(() => transitionTask(db, eventBus, "task-1", "done")).toThrow(InvalidTransitionError);
			expect(events).toHaveLength(0);
		});
	});

	describe("dependency-driven auto-transitions (integration)", () => {
		it("task B depends on A: complete A -> B auto-transitions to accepted", () => {
			insertTask(db, "task-a", "in_progress");
			insertTask(db, "task-b", "hold", ["task-a"]);

			// Complete task A through valid path
			transitionTask(db, eventBus, "task-a", "review");
			transitionTask(db, eventBus, "task-a", "done");
			checkAndUnblockDependents(db, eventBus, "task-a");

			const taskB = db.select().from(tasks).where(eq(tasks.id, "task-b")).get();
			expect(taskB?.state).toBe("accepted");
		});

		it("task C depends on A and B: complete A -> C stays hold, complete B -> C transitions", () => {
			insertTask(db, "task-a", "in_progress");
			insertTask(db, "task-b", "in_progress");
			insertTask(db, "task-c", "hold", ["task-a", "task-b"]);

			// Complete A
			transitionTask(db, eventBus, "task-a", "review");
			transitionTask(db, eventBus, "task-a", "done");
			checkAndUnblockDependents(db, eventBus, "task-a");

			let taskC = db.select().from(tasks).where(eq(tasks.id, "task-c")).get();
			expect(taskC?.state).toBe("hold");

			// Complete B
			transitionTask(db, eventBus, "task-b", "review");
			transitionTask(db, eventBus, "task-b", "done");
			checkAndUnblockDependents(db, eventBus, "task-b");

			taskC = db.select().from(tasks).where(eq(tasks.id, "task-c")).get();
			expect(taskC?.state).toBe("accepted");
		});

		it("hold -> accepted auto-transition emits notification event", () => {
			insertTask(db, "task-a", "review");
			insertTask(db, "task-b", "hold", ["task-a"]);

			const notifications: NotificationEvent[] = [];
			eventBus.on("notification", (e) => notifications.push(e));

			transitionTask(db, eventBus, "task-a", "done");
			checkAndUnblockDependents(db, eventBus, "task-a");

			expect(notifications).toHaveLength(1);
			expect(notifications[0].targetId).toBe("task-b");
			expect(notifications[0].message).toContain("task-b");
			expect(notifications[0].message).toContain("accepted");
		});
	});
});
