/**
 * N7 (BA5 no-teardown §4) — `registerTaskDoneWorktreeReactions` calls the
 * `releaseForTask` door on both occasions the ruling names, and on neither
 * of the other two:
 *
 *   - `task_state_changed → done` calls the door once, for that task.
 *   - `session_ended` whose task is (core's own) `done` calls the door too —
 *     the case where an agent marks its own task done mid-turn and the
 *     session that did it is still running when it ends.
 *   - `session_ended` whose task is NOT done never calls the door.
 *   - a door that throws never escapes the reaction as an unhandled
 *     rejection or blocks either event path.
 *
 * The door itself (`RegistryFilesystemMounter.releaseForTask`, its liveness
 * guard, and the git-level removal semantics) is proven at the mounter level
 * (`git-repository-adapter.integration.test.ts`'s N4-N6) — this file proves
 * only that the reaction calls it at the right two occasions and no others.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { type HyperIdleDb, tasks, teams } from "@hyperidle/db";
import type { SessionEndedEvent, TaskStateChangedEvent } from "@hyperidle/event-bus";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";
import { registerTaskDoneWorktreeReactions } from "../task-done-worktree-reactions.js";

const NOW = new Date().toISOString();

async function seedTask(
	db: HyperIdleDb,
	id: string,
	state: "done" | "in_progress" | "killed",
): Promise<void> {
	const teamId = `${id}-team`;
	await db.insert(teams).values({ id: teamId, name: "T", phase: "build", createdAt: NOW });
	await db.insert(tasks).values({
		id,
		parentTaskId: null,
		teamId,
		title: id,
		state,
		createdAt: NOW,
		updatedAt: NOW,
	});
}

function taskStateChanged(taskId: string, toState: "done" | "killed"): TaskStateChangedEvent {
	return {
		type: "task_state_changed",
		streamId: taskId,
		taskId,
		fromState: "in_progress",
		toState,
		timestamp: Date.now(),
	};
}

function sessionEnded(sessionId: string, taskId: string | null): SessionEndedEvent {
	return {
		type: "session_ended",
		streamId: sessionId,
		sessionId,
		agentId: "agent-1",
		taskId,
		timestamp: Date.now(),
		outcome: "completed",
	};
}

/** A narrow fake — only `filesystems.releaseForTask` is ever called by this reaction. */
function fakePort(releaseForTask: (taskId: string) => Promise<void>): AgentOrchestrationPort {
	return {
		filesystems: { releaseForTask, getTeamId: vi.fn(), persistInjection: vi.fn() },
	} as unknown as AgentOrchestrationPort;
}

describe("registerTaskDoneWorktreeReactions", () => {
	test("task_state_changed → done calls the door once, for that task", async ({ db, eventBus }) => {
		await seedTask(db, "task-n7-done", "done");
		const released: string[] = [];
		registerTaskDoneWorktreeReactions(
			db,
			eventBus,
			fakePort(async (taskId) => {
				released.push(taskId);
			}),
		);

		eventBus.emit(taskStateChanged("task-n7-done", "done"));

		await vi.waitFor(() => {
			expect(released).toEqual(["task-n7-done"]);
		});
	});

	test("session_ended whose task is already done (core's own row) calls the door", async ({
		db,
		eventBus,
	}) => {
		await seedTask(db, "task-n7-sessend-done", "done");
		const released: string[] = [];
		registerTaskDoneWorktreeReactions(
			db,
			eventBus,
			fakePort(async (taskId) => {
				released.push(taskId);
			}),
		);

		eventBus.emit(sessionEnded("sess-n7-1", "task-n7-sessend-done"));

		await vi.waitFor(() => {
			expect(released).toEqual(["task-n7-sessend-done"]);
		});
	});

	test("task_state_changed → killed calls the door once, for that task", async ({
		db,
		eventBus,
	}) => {
		await seedTask(db, "task-n7-killed", "killed");
		const released: string[] = [];
		registerTaskDoneWorktreeReactions(
			db,
			eventBus,
			fakePort(async (taskId) => {
				released.push(taskId);
			}),
		);

		eventBus.emit(taskStateChanged("task-n7-killed", "killed"));

		await vi.waitFor(() => {
			expect(released).toEqual(["task-n7-killed"]);
		});
	});

	test("session_ended whose task is already killed (core's own row) calls the door", async ({
		db,
		eventBus,
	}) => {
		await seedTask(db, "task-n7-sessend-killed", "killed");
		const released: string[] = [];
		registerTaskDoneWorktreeReactions(
			db,
			eventBus,
			fakePort(async (taskId) => {
				released.push(taskId);
			}),
		);

		eventBus.emit(sessionEnded("sess-n7-killed", "task-n7-sessend-killed"));

		await vi.waitFor(() => {
			expect(released).toEqual(["task-n7-sessend-killed"]);
		});
	});

	test("session_ended whose task is NOT done never calls the door", async ({ db, eventBus }) => {
		await seedTask(db, "task-n7-sessend-live", "in_progress");
		const released: string[] = [];
		registerTaskDoneWorktreeReactions(
			db,
			eventBus,
			fakePort(async (taskId) => {
				released.push(taskId);
			}),
		);

		eventBus.emit(sessionEnded("sess-n7-2", "task-n7-sessend-live"));
		await new Promise((resolve) => setTimeout(resolve, 30));

		expect(released).toEqual([]);
	});

	test("session_ended with taskId: null is a no-op — never throws, never calls the door", async ({
		db,
		eventBus,
	}) => {
		const released: string[] = [];
		registerTaskDoneWorktreeReactions(
			db,
			eventBus,
			fakePort(async (taskId) => {
				released.push(taskId);
			}),
		);

		expect(() => eventBus.emit(sessionEnded("sess-n7-3", null))).not.toThrow();
		await new Promise((resolve) => setTimeout(resolve, 30));

		expect(released).toEqual([]);
	});

	test("a door that throws does not fail either path", async ({ db, eventBus }) => {
		await seedTask(db, "task-n7-throws", "done");
		let calls = 0;
		const throwingPort = fakePort(async () => {
			calls += 1;
			throw new Error("simulated door failure");
		});
		registerTaskDoneWorktreeReactions(db, eventBus, throwingPort);

		expect(() => eventBus.emit(taskStateChanged("task-n7-throws", "done"))).not.toThrow();
		expect(() => eventBus.emit(sessionEnded("sess-n7-4", "task-n7-throws"))).not.toThrow();

		await vi.waitFor(() => {
			expect(calls).toBe(2);
		});
	});
});
