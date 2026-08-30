/**
 * BB1 AC3 — Recursive propagation: 3-level tree completes from leaves up.
 *
 * AC3 states: "When a task completes, its parent should also complete if all
 * siblings are done, and this should cascade upward at any depth."
 *
 * This test MUST fail against single-hop behavior: old code called
 * `propagateTaskToBet` which only moved the task's direct bet (one level up).
 * A 3-level tree (root → middle → leaf) would only complete middle, never root.
 * This test asserts BOTH middle AND root reach `done`.
 *
 * Tree:
 *   root (review) ← parentTaskId: null
 *     └─ middle (review) ← parentTaskId: root
 *           └─ leaf (review → done) ← parentTaskId: middle
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
		 * This mirrors `listAncestorIds` in @hyperidle/work but uses raw Drizzle
		 * so the test stays within policy's own dependency set.
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
// The test asserts state changes only, not thread creation.
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
	// Seed a placeholder human user so ship-confirmation thread creation
	// does not fail on FK constraint (messages.senderId → users.id for
	// "system:propagation").
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
	}: { id: string; teamId: string; parentTaskId: string | null; state: string },
): Promise<void> {
	await db.insert(tasks).values({
		id,
		parentTaskId,
		teamId,
		title: `Task ${id}`,
		state,
		createdAt: NOW,
		updatedAt: NOW,
	});
}

async function getTaskState(db: HyperIdleDb, id: string): Promise<string | undefined> {
	const [row] = await db.select({ state: tasks.state }).from(tasks).where(eq(tasks.id, id));
	return row?.state;
}

// ─── AC3: 3-level tree completes from leaves up ───────────────────────────────

describe("BB1 AC3 — recursive lifecycle propagation", () => {
	/**
	 * THE test that proves multi-hop behavior. Old single-hop code:
	 *   propagateTaskToBet(leaf) → transitions middle to done, STOPS.
	 *   root remains in `review`.
	 *
	 * New recursive code:
	 *   propagateTaskToParent(leaf) → listAncestorIds → [middle, root]
	 *   → transitions middle to done, THEN checks root's children → transitions
	 *   root to done as well.
	 *
	 * The assert on root is the distinguishing claim.
	 */
	dbTest(
		"completes middle and root when leaf task goes done (3-level tree, all-terminal rollup)",
		async ({ db }) => {
			const teamId = "bb1-ac3-team-1";
			await seedTeam(db, teamId);

			// Seed 3-level tree: root → middle → leaf
			// All in `review` state so `review -> done` is a valid transition.
			await seedTask(db, { id: "bb1-ac3-root", teamId, parentTaskId: null, state: "review" });
			await seedTask(db, {
				id: "bb1-ac3-middle",
				teamId,
				parentTaskId: "bb1-ac3-root",
				state: "review",
			});
			await seedTask(db, {
				id: "bb1-ac3-leaf",
				teamId,
				parentTaskId: "bb1-ac3-middle",
				state: "review",
			});

			// Wire the event bus and lifecycle propagation.
			const eventBus = new EventBus();
			const policyDeps: PolicyDeps = {
				work: makeWorkPort(),
				conversation: conversationStub,
				users: usersStub,
			};
			const unregister = registerPolicy(db, eventBus, policyDeps);

			try {
				// Transition leaf to `done` via the work port (CAS write) then
				// emit the task_state_changed event that triggers propagation.
				// This mimics what the real transitionTask in task-state-machine.ts does.
				const { applied } = await policyDeps.work.transitionTaskState(db, {
					taskId: "bb1-ac3-leaf",
					fromState: "review",
					patch: { state: "done", updatedAt: new Date().toISOString() },
				});
				expect(applied).toBe(true);

				eventBus.emit({
					type: "task_state_changed",
					streamId: "bb1-ac3-leaf",
					taskId: "bb1-ac3-leaf",
					fromState: "review",
					toState: "done",
					timestamp: Date.now(),
				});

				// Wait for async propagation to settle.
				// The handler runs as void async IIFE so we poll until both
				// parent tasks are done.
				await vi.waitFor(
					async () => {
						const middleState = await getTaskState(db, "bb1-ac3-middle");
						const rootState = await getTaskState(db, "bb1-ac3-root");

						// BOTH must be done. If only middle is done (single-hop),
						// this will keep retrying until timeout — proving multi-hop.
						expect(middleState).toBe("done");
						expect(rootState).toBe("done");
					},
					{ timeout: 5000 },
				);
			} finally {
				unregister();
			}
		},
	);

	/**
	 * Sibling-blocking: if middle has a sibling that is NOT done, root must NOT
	 * be completed even though one child (middle) finishes.
	 */
	dbTest("does not complete root when one sibling child is still active", async ({ db }) => {
		const teamId = "bb1-ac3-team-2";
		await seedTeam(db, teamId);

		// root has two children: middle-a and middle-b
		// Only middle-a will complete.
		await seedTask(db, { id: "bb1-ac3-root-2", teamId, parentTaskId: null, state: "review" });
		await seedTask(db, {
			id: "bb1-ac3-middle-a",
			teamId,
			parentTaskId: "bb1-ac3-root-2",
			state: "review",
		});
		await seedTask(db, {
			id: "bb1-ac3-middle-b",
			teamId,
			parentTaskId: "bb1-ac3-root-2",
			state: "in_progress",
		});
		await seedTask(db, {
			id: "bb1-ac3-leaf-2",
			teamId,
			parentTaskId: "bb1-ac3-middle-a",
			state: "review",
		});

		const eventBus = new EventBus();
		const policyDeps: PolicyDeps = {
			work: makeWorkPort(),
			conversation: conversationStub,
			users: usersStub,
		};
		const unregister = registerPolicy(db, eventBus, policyDeps);

		try {
			// Complete the leaf → should complete middle-a but NOT root (middle-b is still active)
			await policyDeps.work.transitionTaskState(db, {
				taskId: "bb1-ac3-leaf-2",
				fromState: "review",
				patch: { state: "done", updatedAt: new Date().toISOString() },
			});
			eventBus.emit({
				type: "task_state_changed",
				streamId: "bb1-ac3-leaf-2",
				taskId: "bb1-ac3-leaf-2",
				fromState: "review",
				toState: "done",
				timestamp: Date.now(),
			});

			// Wait for middle-a to complete
			await vi.waitFor(
				async () => {
					const state = await getTaskState(db, "bb1-ac3-middle-a");
					expect(state).toBe("done");
				},
				{ timeout: 5000 },
			);

			// Root must still be in review — middle-b is still active
			const rootState = await getTaskState(db, "bb1-ac3-root-2");
			expect(rootState).toBe("review");
		} finally {
			unregister();
		}
	});
});
