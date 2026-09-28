/**
 * Parent auto-completion with the needsReview fork: when every child of a
 * task reaches a terminal state (`done`/`killed`), the parent advances —
 * `needsReview:false` moves it straight to `done` and the cascade continues
 * upward in the same pass; `needsReview:true` moves it to `review` and the
 * cascade stops there until a human gives a verdict. Session completion
 * drives the same fork one level down (task, not parent).
 */

import {
	type HyperIdleDb,
	type Task,
	tasks,
	teams,
	threads,
	users,
	type WriteExecutor,
} from "@hyperidle/db";
import { test as dbTest, describe, expect } from "@hyperidle/db/test-fixtures";
import {
	type ActionResult,
	canTransitionTaskState,
	type EditTaskInput,
	type SendMessageOutput,
	type TaskState,
	type TaskView,
} from "@hyperidle/domain-model";
import { EventBus, objectEvent } from "@hyperidle/event-bus";
import { and, eq } from "drizzle-orm";
import { vi } from "vitest";
import { type PolicyDeps, registerLifecyclePropagation } from "../index.js";
import type { PolicyEditTask, PolicySendMessage } from "../ports.js";

// ─── Manual port implementations (raw Drizzle, no @hyperidle/work dep) ────────
//

function makeWorkPort(): PolicyDeps["work"] {
	return {
		getTaskById: async (exec: WriteExecutor, id: string): Promise<Task | undefined> => {
			const [row] = await exec.select().from(tasks).where(eq(tasks.id, id));
			return row;
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
	};
}

// This test file exercises task-state propagation only — no test asserts on
// the posted ship-confirmation review itself (`lifecycle-propagation.integration.test.ts`
// in `layers/core-api/src/__tests__` does that against the real `send_message`
// action). `listInitiatedVerdictMessages` has no reader in `lifecycle-propagation.ts`
// either; both stubs exist only so `PolicyDeps` is satisfiable here.
const conversationStub: PolicyDeps["conversation"] = {
	listInitiatedVerdictMessages: async () => [],
};

/**
 * Minimal `send_message` stand-in — `policy` cannot import `@hyperidle/thread`
 * (Mechanism C). Lifecycle propagation posts the ship-confirmation review
 * through this when a root task completes (through the action, never the
 * table); a no-op success is sufficient here
 * since these tests assert task-state transitions, not the posted message.
 */
const sendMessageStub: PolicySendMessage = async (): Promise<ActionResult<SendMessageOutput>> => ({
	ok: true,
	data: {} as unknown as SendMessageOutput,
});

/**
 * a minimal `edit_task` stand-in for THIS test file only: `policy`
 * cannot import `@hyperidle/task` (Mechanism C), so the test hand-rolls the
 * CAS-write-then-emit shape the real action provides, using the SAME pure
 * `canTransitionTaskState` grammar the real action's invariants run over.
 * Sufficient for what these tests exercise (ancestor cascade logic driven
 * off `task.changed`) — no dispatch, no real `changes` row (a synthetic
 * `ChangeRow` is built in place, the same shape `objectEvent` would decode
 * from a real one).
 */
function makeEditTask(): PolicyEditTask {
	return async (ctx, input: EditTaskInput): Promise<ActionResult<TaskView>> => {
		const taskId = input.id;
		if (!taskId) {
			return { ok: false, problems: [{ code: "not_found", message: "id is required" }] };
		}
		const [prevRow] = await ctx.db.select().from(tasks).where(eq(tasks.id, taskId));
		if (!prevRow) {
			return { ok: false, problems: [{ code: "not_found", message: `Task ${taskId} not found` }] };
		}
		const fromState = prevRow.state as TaskState;
		const toState = (input.state ?? fromState) as TaskState;
		if (toState !== fromState && !canTransitionTaskState(fromState, toState)) {
			return {
				ok: false,
				problems: [
					{ code: "invalid_transition", message: `Cannot move from ${fromState} to ${toState}` },
				],
			};
		}
		if (toState !== fromState) {
			const result = await ctx.db
				.update(tasks)
				.set({ state: toState, updatedAt: ctx.now })
				.where(and(eq(tasks.id, taskId), eq(tasks.state, fromState)))
				.returning({ id: tasks.id });
			if (result.length === 0) {
				return {
					ok: false,
					problems: [{ code: "invalid_transition", message: "lost the CAS race" }],
				};
			}
			ctx.eventBus.emit(
				objectEvent({
					id: `test-change-${taskId}-${Date.now()}`,
					object: "task",
					objectId: taskId,
					kind: "changed",
					actor: ctx.actor,
					before: JSON.stringify({ state: fromState }),
					after: JSON.stringify({ state: toState }),
					at: ctx.now,
				}),
			);
		}
		return {
			ok: true,
			data: { task: { ...prevRow, state: toState } } as unknown as TaskView,
		};
	};
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

const NOW = new Date().toISOString();

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	await db.insert(teams).values({ id: teamId, name: teamId, createdAt: NOW });
	// Seed system:propagation user so seedTask's threads.initiatorId (below)
	// does not fail its FK constraint (threads.initiatorId → users.id).
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
	// Every task has a real thread now (`tasks.thread_id` is NOT NULL).
	await db.insert(threads).values({
		id: `thr-${id}`,
		hostKind: "team",
		hostId: teamId,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id,
		parentTaskId,
		teamId,
		title: `Task ${id}`,
		state,
		needsReview,
		threadId: `thr-${id}`,
		createdAt: NOW,
		updatedAt: NOW,
	});
}

async function getTaskState(db: HyperIdleDb, id: string): Promise<string | undefined> {
	const [row] = await db.select({ state: tasks.state }).from(tasks).where(eq(tasks.id, id));
	return row?.state;
}

/** Directly write a terminal state then emit task.changed so propagation fires. */
async function completeTask(
	db: HyperIdleDb,
	eventBus: EventBus,
	_policyDeps: PolicyDeps,
	taskId: string,
	fromState: TaskState,
	toState: "done" | "killed",
	/** Marks the emit as part of a deliberate subtree kill. */
	cascade = false,
): Promise<void> {
	// Direct write + emit — this simulates a leaf task reaching a terminal
	// state (the trigger for ancestor propagation), not `edit_task` itself.
	const result = await db
		.update(tasks)
		.set({ state: toState, updatedAt: new Date().toISOString() })
		.where(and(eq(tasks.id, taskId), eq(tasks.state, fromState)))
		.returning({ id: tasks.id });
	expect(result.length > 0).toBe(true);
	eventBus.emit(
		objectEvent(
			{
				id: `test-change-${taskId}-${Date.now()}`,
				object: "task",
				objectId: taskId,
				kind: "changed",
				actor: "system:propagation",
				before: JSON.stringify({ state: fromState }),
				after: JSON.stringify({ state: toState }),
				at: new Date().toISOString(),
			},
			cascade ? { cascade: true } : undefined,
		),
	);
}

// ─── Session → Task propagation tests ────────────────────────────────────────

describe("session→task propagation (needsReview fork)", () => {
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
			sendMessage: sendMessageStub,
			editTask: makeEditTask(),
		};
		const unregister = registerLifecyclePropagation(db, eventBus, policyDeps);

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
			sendMessage: sendMessageStub,
			editTask: makeEditTask(),
		};
		const unregister = registerLifecyclePropagation(db, eventBus, policyDeps);

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

describe("parent auto-completion cascade (needsReview fork)", () => {
	// A 3-level tree, parent in `accepted` (never worked) with needsReview=false at
	// every ancestor: all children terminal cascades all the way to root in one pass.
	dbTest(
		"parent in accepted (needsReview=false): all children terminal → cascade continues to root in one pass",
		async ({ db }) => {
			const teamId = "bb1-p3-team";
			await seedTeam(db, teamId);

			// 3-level tree: root and middle both in `accepted`, both needsReview=false.
			// When leaf finishes, middle → done in the first propagation pass,
			// which then emits task.changed(done) for middle, triggering
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
				sendMessage: sendMessageStub,
				editTask: makeEditTask(),
			};
			const unregister = registerLifecyclePropagation(db, eventBus, policyDeps);

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
				sendMessage: sendMessageStub,
				editTask: makeEditTask(),
			};
			const unregister = registerLifecyclePropagation(db, eventBus, policyDeps);

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

	dbTest("mixed done+killed children count as all-terminal → parent advances", async ({ db }) => {
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
			sendMessage: sendMessageStub,
			editTask: makeEditTask(),
		};
		const unregister = registerLifecyclePropagation(db, eventBus, policyDeps);

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
	});

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
			sendMessage: sendMessageStub,
			editTask: makeEditTask(),
		};
		const unregister = registerLifecyclePropagation(db, eventBus, policyDeps);

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

// ─── A kill cascade must not run the COMPLETION cascade ───────

describe("a cascade kill does not complete its ancestors", () => {
	/**
	 * `cascadeTaskKill` kills deepest-first and every kill emits
	 * `task.changed(killed)`. This handler listens for `killed` on purpose
	 * so that killing the last live child still advances its parent — and it
	 * only ever moves ancestors to `done`/`review`, never `killed`. On the shared
	 * production bus that meant killing a subtree raced its own completion:
	 * ancestors were marked `done` (stamping `completedAt` on cancelled work, and
	 * raising a "Confirm shipping?" review on a killed root) moments before the
	 * cascade reached them.
	 *
	 * TO SEE THIS FAIL: delete the `event.cascade === true` early return in
	 * `registerLifecyclePropagation`'s task handler.
	 */
	dbTest("a kill marked as cascade does not advance the parent", async ({ db }) => {
		const eventBus = new EventBus();
		await seedTeam(db, "ct");
		await seedTask(db, { id: "c-root", parentTaskId: null, teamId: "ct", state: "in_progress" });
		await seedTask(db, {
			id: "c-child",
			parentTaskId: "c-root",
			teamId: "ct",
			state: "in_progress",
		});
		const policyDeps: PolicyDeps = {
			work: makeWorkPort(),
			conversation: conversationStub,
			sendMessage: sendMessageStub,
			editTask: makeEditTask(),
		};
		const unsub = registerLifecyclePropagation(db, eventBus, policyDeps);
		try {
			await completeTask(db, eventBus, policyDeps, "c-child", "in_progress", "killed", true);
			// NOT vi.waitFor: asserting "still in_progress" would pass instantly,
			// before propagation had a chance to run, and could never fail. Give
			// the fire-and-forget handler real time to do the wrong thing first.
			await new Promise((r) => setTimeout(r, 400));
			const [root] = await db.select().from(tasks).where(eq(tasks.id, "c-root")).limit(1);
			expect(root?.state).toBe("in_progress");
			expect(root?.completedAt).toBeNull();
		} finally {
			unsub();
		}
	});

	/**
	 * The suppression must be scoped to the CASCADE, not to `killed` in general.
	 * Killing the last live child by hand still advances the parent — that is
	 * what this rule promises, and narrowing it would be a silent regression.
	 */
	dbTest("an ordinary kill of the last child still advances the parent", async ({ db }) => {
		const eventBus = new EventBus();
		await seedTeam(db, "ot");
		await seedTask(db, { id: "o-root", parentTaskId: null, teamId: "ot", state: "in_progress" });
		await seedTask(db, {
			id: "o-child",
			parentTaskId: "o-root",
			teamId: "ot",
			state: "in_progress",
		});
		const policyDeps: PolicyDeps = {
			work: makeWorkPort(),
			conversation: conversationStub,
			sendMessage: sendMessageStub,
			editTask: makeEditTask(),
		};
		const unsub = registerLifecyclePropagation(db, eventBus, policyDeps);
		try {
			await completeTask(db, eventBus, policyDeps, "o-child", "in_progress", "killed");
			await vi.waitFor(async () => {
				const [root] = await db.select().from(tasks).where(eq(tasks.id, "o-root")).limit(1);
				expect(root?.state).toBe("done");
			});
		} finally {
			unsub();
		}
	});
});
