/**
 * BB1 AC3 — Parent auto-completion with needsReview fork.
 *
 * Rule (2026-08-31 founder call): when all children of a task reach a terminal
 * state (`done` or `killed`), the parent advances automatically.
 *   - `task.needsReview = false` → parent goes to `done` and the cascade
 *     continues upward in the same pass (all the way to root if no ancestor
 *     has needsReview=true).
 *   - `task.needsReview = true`  → parent goes to `review` and the cascade
 *     stops there until a human gives a verdict.
 *
 * The same fork applies to session→task propagation:
 *   - Session completes, task.needsReview=false → task goes to `done`.
 *   - Session completes, task.needsReview=true  → task goes to `review`.
 *
 * EACH TEST IS PROVED REDUCIBLE TO RED: how to break each is documented inline.
 *
 * The old test seeded all tasks in `review` (the one state where `review -> done`
 * was previously legal) — hiding the real defect. These tests use `accepted` or
 * `in_progress` as parent states to surface the actual regression.
 */

import { and, eq } from "drizzle-orm";
import {
	type HyperIdleDb,
	type Item,
	type NewTask,
	type Task,
	tasks,
	teams,
	users,
	type WriteExecutor,
} from "@hyperidle/db";
import { test as dbTest, describe, expect } from "@hyperidle/db/test-fixtures";
import type { TaskState } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { vi } from "vitest";
import { type PolicyDeps, registerPolicy } from "../index.js";

// ─── Manual port implementations (raw Drizzle, no @hyperidle/work dep) ────────
//
// @lore BB1 test: policy package cannot import @hyperidle/work directly
// (Mechanism C). The test wires the ports manually using raw Drizzle so the
// test stays inside the policy package's own dependency set.

function makeWorkPort(): PolicyDeps["work"] {
	return {
		getTaskById: async (exec: WriteExecutor, id: string): Promise<Task | undefined> => {
			const [row] = await exec.select().from(tasks).where(eq(tasks.id, id));
			return row;
		},

		transitionTaskState: async (
			exec: WriteExecutor,
			args: { taskId: string; fromState: string; patch: Partial<NewTask> },
		): Promise<{ applied: boolean }> => {
			const result = await exec
				.update(tasks)
				.set({ ...args.patch })
				.where(and(eq(tasks.id, args.taskId), eq(tasks.state, args.fromState)))
				.returning({ id: tasks.id });
			return { applied: result.length > 0 };
		},

		listChildTasks: async (exec: WriteExecutor, parentTaskId: string): Promise<Task[]> => {
			return exec.select().from(tasks).where(eq(tasks.parentTaskId, parentTaskId));
		},

		/**
		 * Traverse the parentTaskId chain to build nearest-first ancestor list.
		 * Mirrors `listAncestorIds` in @hyperidle/work but uses raw Drizzle so
		 * the test stays within policy's own dependency set.
		 */
		listAncestorIds: async (exec: WriteExecutor, taskId: string): Promise<string[]> => {
			const visited: string[] = [];
			let currentId = taskId;
			while (true) {
				const [row] = await exec
					.select({ parentTaskId: tasks.parentTaskId })
					.from(tasks)
					.where(eq(tasks.id, currentId));
				if (!row?.parentTaskId) break;
				visited.push(row.parentTaskId);
				currentId = row.parentTaskId;
			}
			return visited;
		},

		// These ports are required by PolicyDeps.work but not invoked by
		// lifecycle propagation — stub as no-ops.
		getItemById: async (_exec: WriteExecutor, _id: string): Promise<Item | undefined> => {
			return undefined;
		},
		updateItemById: async (_exec: WriteExecutor, _id: string, _patch): Promise<void> => {},
		listItemIdsBySourceAgent: async (_exec: WriteExecutor, _agentId: string): Promise<string[]> => {
			return [];
		},
	};
}

// Minimal conversation stubs — lifecycle propagation calls insertThread +
// insertMessage when a root task completes (ship-confirmation thread).
// Tests assert state changes only, not thread creation.
const conversationStub: PolicyDeps["conversation"] = {
	insertMessage: async () => {},
	insertThread: async () => {},
	listMessagesByThread: async () => [],
	resolveMessageIfUnresolved: async () => [],
	updateThread: async () => {},
	listInitiatedVerdictMessages: async () => [],
	listVerdictMessagesByItemIds: async () => [],
};

// Users stub — ship-confirmation thread reads the first human user.
const usersStub: PolicyDeps["users"] = {
	getFirstUserByKind: async () => undefined,
};

// ─── Test helpers ─────────────────────────────────────────────────────────────

const NOW = new Date().toISOString();

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: NOW });
	// Seed system:propagation user so ship-confirmation thread inserts do not
	// fail on an FK constraint (messages.senderId → users.id).
	await db.insert(users).values({
		id: "system:propagation",
		name: "Propagation System",
		role: "system",
		status: "active",
		createdAt: NOW,
	});
}

async function seedTask(
	db: HyperIdleDb,
	{
		id,
		teamId,
		parentTaskId,
		state,
		needsReview = false,
	}: {
		id: string;
		teamId: string;
		parentTaskId: string | null;
		state: string;
		needsReview?: boolean;
	},
): Promise<void> {
	await db.insert(tasks).values({
		id,
		parentTaskId,
		teamId,
		title: `Task ${id}`,
		state,
		needsReview,
		createdAt: NOW,
		updatedAt: NOW,
	});
}

async function getTaskState(db: HyperIdleDb, id: string): Promise<string | undefined> {
	const [row] = await db.select({ state: tasks.state }).from(tasks).where(eq(tasks.id, id));
	return row?.state;
}

/** Directly write a terminal state then emit task_state_changed so propagation fires. */
async function completeTask(
	db: HyperIdleDb,
	eventBus: EventBus,
	policyDeps: PolicyDeps,
	taskId: string,
	fromState: TaskState,
	toState: "done" | "killed",
): Promise<void> {
	const { applied } = await policyDeps.work.transitionTaskState(db, {
		taskId,
		fromState,
		patch: { state: toState, updatedAt: new Date().toISOString() },
	});
	expect(applied).toBe(true);
	eventBus.emit({
		type: "task_state_changed",
		streamId: taskId,
		taskId,
		fromState,
		toState,
		timestamp: Date.now(),
	});
}

// ─── Session → Task propagation tests ────────────────────────────────────────

describe("BB1 AC3 — session→task propagation (needsReview fork)", () => {
	/**
	 * TEST 1: session ends, needsReview=false → task reaches `done`.
	 *
	 * HOW TO PROVE IT CAN FAIL:
	 * In lifecycle-propagation.ts, remove the needsReview fork — always use "review":
	 *   const targetState: TaskState = "review";  // was: task.needsReview ? "review" : "done"
	 * Result: task goes to `review` instead of `done` → test fails with
	 *   Expected: "done"  Received: "review"
	 * Restore and test is green.
	 */
	dbTest("session ends on needsReview=false task → task reaches done", async ({ db }) => {
		const teamId = "bb1-s1-team";
		await seedTeam(db, teamId);
		await seedTask(db, {
			id: "bb1-s1-task",
			teamId,
			parentTaskId: null,
			state: "in_progress",
			needsReview: false,
		});

		const eventBus = new EventBus();
		const policyDeps: PolicyDeps = {
			work: makeWorkPort(),
			conversation: conversationStub,
			users: usersStub,
		};
		const unregister = registerPolicy(db, eventBus, policyDeps);

		try {
			eventBus.emit({
				type: "session_ended",
				streamId: "sess-1",
				sessionId: "sess-1",
				agentId: "agent-1",
				taskId: "bb1-s1-task",
				outcome: "completed",
				timestamp: Date.now(),
			});

			await vi.waitFor(
				async () => {
					expect(await getTaskState(db, "bb1-s1-task")).toBe("done");
				},
				{ timeout: 5000 },
			);
		} finally {
			unregister();
		}
	});

	/**
	 * TEST 2: session ends, needsReview=true → task reaches `review`.
	 *
	 * HOW TO PROVE IT CAN FAIL:
	 * In lifecycle-propagation.ts, force the target to "done" always:
	 *   const targetState: TaskState = "done";  // was: task.needsReview ? "review" : "done"
	 * Result: task goes to `done` instead of `review` → test fails with
	 *   Expected: "review"  Received: "done"
	 * Restore and test is green.
	 */
	dbTest("session ends on needsReview=true task → task reaches review", async ({ db }) => {
		const teamId = "bb1-s2-team";
		await seedTeam(db, teamId);
		await seedTask(db, {
			id: "bb1-s2-task",
			teamId,
			parentTaskId: null,
			state: "in_progress",
			needsReview: true,
		});

		const eventBus = new EventBus();
		const policyDeps: PolicyDeps = {
			work: makeWorkPort(),
			conversation: conversationStub,
			users: usersStub,
		};
		const unregister = registerPolicy(db, eventBus, policyDeps);

		try {
			eventBus.emit({
				type: "session_ended",
				streamId: "sess-2",
				sessionId: "sess-2",
				agentId: "agent-2",
				taskId: "bb1-s2-task",
				outcome: "completed",
				timestamp: Date.now(),
			});

			await vi.waitFor(
				async () => {
					expect(await getTaskState(db, "bb1-s2-task")).toBe("review");
				},
				{ timeout: 5000 },
			);
		} finally {
			unregister();
		}
	});
});

// ─── Task → Parent propagation tests ─────────────────────────────────────────

describe("BB1 AC3 — parent auto-completion cascade (needsReview fork)", () => {
	/**
	 * TEST 3: all children terminal, parent needsReview=false → parent done,
	 * and cascade CONTINUES to grandparent in the same pass.
	 *
	 * This also covers TEST 5 (parent in `accepted`, never worked, still advances)
	 * because both root and middle start in `accepted`.
	 *
	 * HOW TO PROVE IT CAN FAIL:
	 * In lifecycle-propagation.ts, change the propagation target to always "review":
	 *   const targetState: TaskState = "review";  // was: ancestor.needsReview ? "review" : "done"
	 * Result: middle goes to `review` (not terminal), root does not advance →
	 *   test times out waiting for root to reach `done`.
	 * Restore and test is green.
	 *
	 * Alternatively, remove `done` from `accepted`'s transitions in task-transition.ts:
	 *   accepted: ["in_progress", "hold", "review", "killed"],  // no "done"
	 * Result: `accepted -> done` throws InvalidTransitionError → middle stays `accepted` → timeout.
	 */
	dbTest(
		"parent in accepted (needsReview=false): all children terminal → cascade continues to root in one pass",
		async ({ db }) => {
			const teamId = "bb1-p3-team";
			await seedTeam(db, teamId);

			// 3-level tree: root and middle both in `accepted`, both needsReview=false.
			// When leaf finishes, middle → done in the first propagation pass,
			// which then emits task_state_changed(done) for middle, triggering
			// propagateTaskToParent(middle) → root → done.
			await seedTask(db, {
				id: "bb1-p3-root",
				teamId,
				parentTaskId: null,
				state: "accepted",
				needsReview: false,
			});
			await seedTask(db, {
				id: "bb1-p3-middle",
				teamId,
				parentTaskId: "bb1-p3-root",
				state: "accepted",
				needsReview: false,
			});
			await seedTask(db, {
				id: "bb1-p3-leaf",
				teamId,
				parentTaskId: "bb1-p3-middle",
				state: "in_progress",
			});

			const eventBus = new EventBus();
			const policyDeps: PolicyDeps = {
				work: makeWorkPort(),
				conversation: conversationStub,
				users: usersStub,
			};
			const unregister = registerPolicy(db, eventBus, policyDeps);

			try {
				await completeTask(db, eventBus, policyDeps, "bb1-p3-leaf", "in_progress", "done");

				// Both middle AND root must reach done — the cascade goes all the way.
				await vi.waitFor(
					async () => {
						expect(await getTaskState(db, "bb1-p3-middle")).toBe("done");
						expect(await getTaskState(db, "bb1-p3-root")).toBe("done");
					},
					{ timeout: 5000 },
				);
			} finally {
				unregister();
			}
		},
	);

	/**
	 * TEST 4: all children terminal, parent needsReview=true → parent review,
	 * cascade stops there (root stays `accepted` until human gives a verdict).
	 *
	 * HOW TO PROVE IT CAN FAIL:
	 * In lifecycle-propagation.ts, force the target to "done" always:
	 *   const targetState: TaskState = "done";  // was: ancestor.needsReview ? "review" : "done"
	 * Result: middle goes to `done` (terminal), root's propagation fires,
	 *   root also goes to `done` → expect(root).toBe("accepted") fails.
	 * Restore and test is green.
	 */
	dbTest(
		"parent in accepted (needsReview=true): all children terminal → parent review, cascade stops",
		async ({ db }) => {
			const teamId = "bb1-p4-team";
			await seedTeam(db, teamId);

			// middle has needsReview=true — the cascade should stop here.
			await seedTask(db, {
				id: "bb1-p4-root",
				teamId,
				parentTaskId: null,
				state: "accepted",
				needsReview: false,
			});
			await seedTask(db, {
				id: "bb1-p4-middle",
				teamId,
				parentTaskId: "bb1-p4-root",
				state: "accepted",
				needsReview: true,
			});
			await seedTask(db, {
				id: "bb1-p4-leaf",
				teamId,
				parentTaskId: "bb1-p4-middle",
				state: "in_progress",
			});

			const eventBus = new EventBus();
			const policyDeps: PolicyDeps = {
				work: makeWorkPort(),
				conversation: conversationStub,
				users: usersStub,
			};
			const unregister = registerPolicy(db, eventBus, policyDeps);

			try {
				await completeTask(db, eventBus, policyDeps, "bb1-p4-leaf", "in_progress", "done");

				// Middle must reach review (needs a verdict).
				await vi.waitFor(
					async () => {
						expect(await getTaskState(db, "bb1-p4-middle")).toBe("review");
					},
					{ timeout: 5000 },
				);

				// Root must still be `accepted` — middle is not terminal (it is in review).
				expect(await getTaskState(db, "bb1-p4-root")).toBe("accepted");
			} finally {
				unregister();
			}
		},
	);

	/**
	 * TEST 6a: mixed done+killed children count as all-terminal → parent advances.
	 *
	 * HOW TO PROVE IT CAN FAIL:
	 * In lifecycle-propagation.ts, change TERMINAL_TASK_STATES to only include `done`:
	 *   const TERMINAL_TASK_STATES = new Set(["done"]);
	 * Result: `killed` child is not terminal → `allTerminal` is false → parent stays
	 *   `accepted` → test times out.
	 * Restore and test is green.
	 */
	dbTest(
		"mixed done+killed children count as all-terminal → parent advances",
		async ({ db }) => {
			const teamId = "bb1-p6a-team";
			await seedTeam(db, teamId);

			await seedTask(db, {
				id: "bb1-p6a-root",
				teamId,
				parentTaskId: null,
				state: "accepted",
				needsReview: false,
			});
			// child-a was killed; child-b will be done — both are terminal.
			await seedTask(db, {
				id: "bb1-p6a-child-a",
				teamId,
				parentTaskId: "bb1-p6a-root",
				state: "killed",
			});
			await seedTask(db, {
				id: "bb1-p6a-child-b",
				teamId,
				parentTaskId: "bb1-p6a-root",
				state: "in_progress",
			});

			const eventBus = new EventBus();
			const policyDeps: PolicyDeps = {
				work: makeWorkPort(),
				conversation: conversationStub,
				users: usersStub,
			};
			const unregister = registerPolicy(db, eventBus, policyDeps);

			try {
				await completeTask(db, eventBus, policyDeps, "bb1-p6a-child-b", "in_progress", "done");

				await vi.waitFor(
					async () => {
						expect(await getTaskState(db, "bb1-p6a-root")).toBe("done");
					},
					{ timeout: 5000 },
				);
			} finally {
				unregister();
			}
		},
	);

	/**
	 * TEST 6b: one live child → parent does NOT advance.
	 *
	 * HOW TO PROVE IT CAN FAIL:
	 * In lifecycle-propagation.ts, remove the allTerminal guard:
	 *   // if (!allTerminal) break;   ← comment this out
	 * Result: propagation advances root even though child-b is still active →
	 *   expect(root).toBe("accepted") fails (root is now "done").
	 * Restore and test is green.
	 */
	dbTest("one live child → parent does NOT advance", async ({ db }) => {
		const teamId = "bb1-p6b-team";
		await seedTeam(db, teamId);

		await seedTask(db, {
			id: "bb1-p6b-root",
			teamId,
			parentTaskId: null,
			state: "accepted",
			needsReview: false,
		});
		await seedTask(db, {
			id: "bb1-p6b-child-a",
			teamId,
			parentTaskId: "bb1-p6b-root",
			state: "in_progress",
		});
		// child-b is still active — root must NOT advance.
		await seedTask(db, {
			id: "bb1-p6b-child-b",
			teamId,
			parentTaskId: "bb1-p6b-root",
			state: "in_progress",
		});

		const eventBus = new EventBus();
		const policyDeps: PolicyDeps = {
			work: makeWorkPort(),
			conversation: conversationStub,
			users: usersStub,
		};
		const unregister = registerPolicy(db, eventBus, policyDeps);

		try {
			await completeTask(db, eventBus, policyDeps, "bb1-p6b-child-a", "in_progress", "done");

			// Give propagation time to settle.
			await new Promise((r) => setTimeout(r, 200));

			// Root must still be `accepted` — child-b is still active.
			expect(await getTaskState(db, "bb1-p6b-root")).toBe("accepted");
		} finally {
			unregister();
		}
	});
});
