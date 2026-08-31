/**
 * BB1 — AC2, AC4, AC5, AC6: service-level integration tests for the recursive task tree.
 *
 * AC2: a task cannot be its own parent, and cannot be reparented under one of
 *      its own descendants. Both throw TaskCycleError at write time (not a DB
 *      constraint). Row unchanged on error.
 * AC4: killing a task kills its ENTIRE subtree at any depth. Already-terminal
 *      tasks are not re-killed.
 * AC5: token usage on a leaf is visible summed over the subtree; NO ancestor
 *      row is written (no drifting rollup column).
 * AC6: a team cannot exceed its capacity of concurrent in_progress tasks. The
 *      limit counts tasks at EVERY depth, not just root tasks.
 */

import { type HyperIdleDb, taskDispatchAttempts, tasks, teams, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { CapacityExceededError, TaskCycleError } from "../errors.js";
import { cascadeTaskKill, type TaskKillCascadeDeps } from "../task-kill-cascade.js";
import { assertNoCycle, type TaskStateMachineDeps, transitionTask } from "../task-state-machine.js";
import { list, listSubtreeIds, update } from "../work-service.js";
import { describe, expect, test } from "./test-fixtures.js";

const NOW = "2026-08-30T00:00:00.000Z";

// ---------------------------------------------------------------------------
// Shared deps
// ---------------------------------------------------------------------------

/**
 * TeamCapacityReader that reads the teams table from whatever executor is
 * passed — always current, never stale, works inside a transaction.
 */
const teamCapacity: TaskStateMachineDeps["teamCapacity"] = {
	getByTeamId: async (exec, teamId) => {
		const [team] = await exec.select().from(teams).where(eq(teams.id, teamId)).limit(1);
		return team;
	},
};

/**
 * Shared TaskStateMachineDeps. The workIntents and taskRunResolver paths are
 * never reached in these tests: no task carries an ownerAgentId, so the
 * dispatch block inside transitionTask is never entered.
 */
const taskDeps: TaskStateMachineDeps = {
	workIntents: async () => {
		throw new Error("workIntents must not fire in BB1 service tests");
	},
	taskRunResolver: {
		requireRunnableAgent: async () => {
			throw new Error("requireRunnableAgent must not fire in BB1 service tests");
		},
		getAgentIdentity: async () => {
			throw new Error("getAgentIdentity must not fire in BB1 service tests");
		},
	},
	teamCapacity,
};

/**
 * Deps for the ONE test that must actually reach the dispatch block. Records
 * the intent instead of throwing, and returns the seeded agent row.
 *
 * @lore BB1: kept separate from `taskDeps` on purpose — everywhere else, a
 * dispatch firing is a bug, and the throwing stubs above are what catch it.
 */
const dispatchedIntents: string[] = [];
const dispatchDeps: TaskStateMachineDeps = {
	workIntents: async (intent) => {
		dispatchedIntents.push(intent.sourceId);
		return { id: `intent-${intent.sourceId}`, idempotencyKey: intent.idempotencyKey };
	},
	taskRunResolver: {
		/**
		 * @lore BB1: reads through the EXECUTOR it is handed, never a captured
		 * outer `db`. `transitionTask` calls this from inside its transaction, and
		 * on PGlite a query issued on the outer connection while that transaction
		 * is open deadlocks the single connection — the test hangs to timeout
		 * rather than failing, which is a genuinely confusing way to lose an hour.
		 */
		requireRunnableAgent: async (exec, agentId) => {
			const [agent] = await exec.select().from(users).where(eq(users.id, agentId)).limit(1);
			if (!agent) throw new Error(`no agent ${agentId}`);
			return agent;
		},
		// No knowledge items seeded in these tests — identity is always null.
		getAgentIdentity: async () => null,
	},
	teamCapacity,
};

/** Kill-cascade deps: taskDeps plus a no-op run-stop (no active sessions in these seeds). */
const killDeps: TaskKillCascadeDeps = {
	...taskDeps,
	runOrchestration: {
		requestRunStopForTasks: async () => [],
	},
};

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function insertTeam(db: HyperIdleDb, id: string, capacity = 5): Promise<void> {
	await db.insert(teams).values({ id, name: id, phase: "build", createdAt: NOW, capacity });
}

async function insertTask(
	db: HyperIdleDb,
	id: string,
	teamId: string,
	state: string,
	parentTaskId: string | null = null,
	ownerAgentId: string | null = null,
): Promise<void> {
	await db.insert(tasks).values({
		id,
		parentTaskId,
		teamId,
		title: id,
		state,
		ownerAgentId,
		createdAt: NOW,
		updatedAt: NOW,
	});
}

async function insertAgent(db: HyperIdleDb, id: string): Promise<void> {
	await db
		.insert(users)
		.values({ id, name: id, kind: "ai", role: "builder", status: "active", createdAt: NOW });
}

// ---------------------------------------------------------------------------
// AC2 — cycle rejection
// ---------------------------------------------------------------------------

describe("AC2 — cycle rejection", () => {
	test("self-parent throws TaskCycleError and leaves the row unchanged", async ({ db }) => {
		// Arrange
		await insertTeam(db, "team");
		await insertTask(db, "task-a", "team", "proposed");

		// Act + Assert — thrown immediately (before any DB write)
		await expect(assertNoCycle(db, "task-a", "task-a")).rejects.toBeInstanceOf(TaskCycleError);

		// Row unchanged: parentTaskId is still null
		const [row] = await db
			.select({ parentTaskId: tasks.parentTaskId })
			.from(tasks)
			.where(eq(tasks.id, "task-a"))
			.limit(1);
		expect(row?.parentTaskId).toBeNull();
	});

	test("reparent under a deep descendant throws TaskCycleError and leaves the row unchanged", async ({
		db,
	}) => {
		// Arrange: 4-level chain root → child → grandchild → great-grandchild
		await insertTeam(db, "team");
		await insertTask(db, "root", "team", "proposed", null);
		await insertTask(db, "child", "team", "proposed", "root");
		await insertTask(db, "grandchild", "team", "proposed", "child");
		await insertTask(db, "great-grandchild", "team", "proposed", "grandchild");

		// Act + Assert — great-grandchild is in root's own subtree → cycle
		await expect(assertNoCycle(db, "root", "great-grandchild")).rejects.toBeInstanceOf(
			TaskCycleError,
		);

		// Row unchanged: root still has no parent
		const [row] = await db
			.select({ parentTaskId: tasks.parentTaskId })
			.from(tasks)
			.where(eq(tasks.id, "root"))
			.limit(1);
		expect(row?.parentTaskId).toBeNull();
	});

	test("valid reparent does not throw (boundary: not a descendant)", async ({ db }) => {
		// Arrange: two sibling tasks under the same parent
		await insertTeam(db, "team");
		await insertTask(db, "root", "team", "proposed", null);
		await insertTask(db, "sibling-a", "team", "proposed", "root");
		await insertTask(db, "sibling-b", "team", "proposed", "root");

		// Reparenting sibling-b under sibling-a is acyclic — sibling-a is not
		// in sibling-b's subtree.
		await expect(assertNoCycle(db, "sibling-b", "sibling-a")).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// AC4 — recursive kill cascade
// ---------------------------------------------------------------------------

describe("AC4 — recursive kill cascade", () => {
	test("killing root kills its entire 3-level subtree (none missed)", async ({ db, eventBus }) => {
		// Arrange: root → [child1 → [grandchild1, grandchild2], child2]
		await insertTeam(db, "team");
		await insertTask(db, "root", "team", "accepted", null);
		await insertTask(db, "child1", "team", "accepted", "root");
		await insertTask(db, "child2", "team", "accepted", "root");
		await insertTask(db, "grandchild1", "team", "accepted", "child1");
		await insertTask(db, "grandchild2", "team", "accepted", "child1");

		// Act
		const result = await cascadeTaskKill(db, eventBus, "root", killDeps);

		// Assert: every task is killed (sorted for stable comparison)
		const expectedIds = ["child1", "child2", "grandchild1", "grandchild2", "root"].sort();
		expect(result.tasksKilled.sort()).toEqual(expectedIds);

		const rows = await list(db, "task", { ids: expectedIds });
		for (const row of rows) {
			expect(row.state, `task ${row.id} should be killed`).toBe("killed");
		}
		expect(rows).toHaveLength(5); // none missed
	});

	/**
	 * @lore BB1: from the independent review of the cascade fix. The cascade used
	 * to pre-filter the run-stop list to non-terminal tasks, on the reasoning that
	 * a `done` task has no session left to stop. That is false:
	 * `requestRunStopForTasks` selects on `sessions.state = "active"` alone, and
	 * nothing ends a session when its task moves to `done` — the transition writes
	 * task state and `completedAt`, and the `done` handler only propagates upward.
	 * So `in_progress` -> `done` -> `killed` left the task killed with its agent
	 * session still running, which is the exact inconsistency the cascade exists to
	 * prevent. The seeds here have no real sessions; what is asserted is the
	 * CONTRACT — which task ids the cascade asks run-orchestration to stop.
	 */
	test("asks run-orchestration to stop runs for a `done` root, not just live tasks", async ({
		db,
		eventBus,
	}) => {
		await insertTeam(db, "team");
		await insertTask(db, "root", "team", "done");
		await insertTask(db, "child", "team", "in_progress", "root");

		const asked: string[][] = [];
		const recordingDeps: TaskKillCascadeDeps = {
			...taskDeps,
			runOrchestration: {
				requestRunStopForTasks: async (_exec, taskIds) => {
					asked.push([...taskIds]);
					return [];
				},
			},
		};

		await cascadeTaskKill(db, eventBus, "root", recordingDeps);

		const requested = asked.flat().sort();
		// The `done` root must be in the stop request. Before the fix it was
		// filtered out, so a session running under it was orphaned by its own kill.
		expect(requested).toContain("root");
		expect(requested).toContain("child");
	});

	/**
	 * @lore BB1: also from that review — every cascade test through the route was
	 * depth 1 or shallower, so the recursive walk and the deepest-first sort were
	 * only ever exercised on a single level. This is the combination where the
	 * root/descendant asymmetry actually bites: a `done` ROOT (killed, because it
	 * was named) over a `done` DESCENDANT (spared, because it is collateral), with
	 * live work in between at two levels.
	 */
	test("a `done` root over a mixed 3-level tree: root dies, done descendant survives", async ({
		db,
		eventBus,
	}) => {
		await insertTeam(db, "team");
		await insertTask(db, "root", "team", "done");
		await insertTask(db, "live-child", "team", "in_progress", "root");
		await insertTask(db, "done-child", "team", "done", "root");
		await insertTask(db, "grandchild", "team", "accepted", "live-child");
		await insertTask(db, "great-grandchild", "team", "blocked", "grandchild");

		await cascadeTaskKill(db, eventBus, "root", killDeps);

		const byId = new Map(
			(
				await list(db, "task", {
					ids: ["root", "live-child", "done-child", "grandchild", "great-grandchild"],
				})
			).map((t) => [t.id, t.state]),
		);
		expect(byId.get("root"), "the named root dies even though it was done").toBe("killed");
		expect(byId.get("live-child")).toBe("killed");
		expect(byId.get("grandchild")).toBe("killed");
		expect(byId.get("great-grandchild"), "the cascade reaches depth 3").toBe("killed");
		expect(byId.get("done-child"), "finished work is never un-finished by collateral").toBe("done");
	});

	test("already-terminal tasks are not re-killed by the cascade", async ({ db, eventBus }) => {
		// Arrange: root with one live child, one done child, one already-killed child
		await insertTeam(db, "team");
		await insertTask(db, "root", "team", "accepted", null);
		await insertTask(db, "live-child", "team", "accepted", "root");
		await insertTask(db, "done-child", "team", "done", "root");
		await insertTask(db, "killed-child", "team", "killed", "root");

		// Act
		const result = await cascadeTaskKill(db, eventBus, "root", killDeps);

		// Assert: only non-terminal tasks are in the killed set
		expect(result.tasksKilled.sort()).toEqual(["live-child", "root"].sort());
		expect(result.tasksKilled).not.toContain("done-child");
		expect(result.tasksKilled).not.toContain("killed-child");

		// Terminal tasks retain their original state (no re-kill)
		const [doneRow] = await db
			.select({ state: tasks.state })
			.from(tasks)
			.where(eq(tasks.id, "done-child"))
			.limit(1);
		expect(doneRow?.state).toBe("done");

		const [killedRow] = await db
			.select({ state: tasks.state })
			.from(tasks)
			.where(eq(tasks.id, "killed-child"))
			.limit(1);
		expect(killedRow?.state).toBe("killed");
	});
});

// ---------------------------------------------------------------------------
// AC5 — read-time token rollup
// ---------------------------------------------------------------------------

describe("AC5 — read-time token rollup", () => {
	test("leaf tokens are visible in the subtree sum; no ancestor row is written", async ({ db }) => {
		// Arrange: root → parent → leaf
		await insertTeam(db, "team");
		await insertTask(db, "root", "team", "in_progress", null);
		await insertTask(db, "parent", "team", "in_progress", "root");
		await insertTask(db, "leaf", "team", "in_progress", "parent");

		const leafTokens = JSON.stringify({
			byTier: { standard: { prompt: 100, completion: 50 } },
		});

		// Act: write tokens to the leaf only (simulates what work-session-end-reactions does)
		await update(db, "task", "leaf", { tokensActualJson: leafTokens });

		// Read the full subtree and all task rows
		const subtreeIds = await listSubtreeIds(db, "root");
		const subtreeTasks = await list(db, "task", { ids: subtreeIds });

		// Assert: the leaf's tokens appear in the subtree
		const tokenBearers = subtreeTasks.filter((t) => t.tokensActualJson !== null);
		expect(tokenBearers).toHaveLength(1);
		expect(tokenBearers[0]?.id).toBe("leaf");
		expect(tokenBearers[0]?.tokensActualJson).toBe(leafTokens);

		// Assert: ancestor rows were NOT written (the whole design point —
		// no denormalised rollup column that can drift)
		const rootRow = subtreeTasks.find((t) => t.id === "root");
		const parentRow = subtreeTasks.find((t) => t.id === "parent");
		expect(rootRow?.tokensActualJson).toBeNull();
		expect(parentRow?.tokensActualJson).toBeNull();

		// Assert: the subtree sum equals the leaf's tokens (rollup is derivable
		// from per-task rows without any ancestor write)
		type TierEntry = { prompt: number; completion: number };
		type TokenJson = { byTier: Record<string, TierEntry> };
		const subtreeSum = subtreeTasks.reduce((acc, t) => {
			if (!t.tokensActualJson) return acc;
			const parsed = JSON.parse(t.tokensActualJson) as TokenJson;
			return (
				acc + Object.values(parsed.byTier).reduce((s, tier) => s + tier.prompt + tier.completion, 0)
			);
		}, 0);
		expect(subtreeSum).toBe(150); // leaf: 100 prompt + 50 completion
	});
});

// ---------------------------------------------------------------------------
// AC6 — WIP limit
// ---------------------------------------------------------------------------

describe("AC6 — WIP limit", () => {
	test("capacity refuses DISPATCH (accept-with-owner), counts every depth, and frees on completion", async ({
		db,
		eventBus,
	}) => {
		// Arrange: capacity = 2; a root + a depth-2 grandchild will fill it
		await insertTeam(db, "team", 2);
		await insertAgent(db, "agent-1");
		await insertTask(db, "root1", "team", "accepted", null);
		await insertTask(db, "child1", "team", "accepted", "root1");
		await insertTask(db, "grandchild1", "team", "accepted", "child1"); // depth 2
		await insertTask(db, "root2", "team", "proposed", null, "agent-1"); // wants dispatch

		// Fill capacity with work at TWO DIFFERENT DEPTHS (0 and 2). A limit that
		// only counted root tasks would not be full here — that is the regression
		// this arrangement exists to catch.
		await transitionTask(db, eventBus, "root1", "in_progress", taskDeps);
		await transitionTask(db, eventBus, "grandchild1", "in_progress", taskDeps);

		// Assert: accepting an OWNED task — the act that requests a session — is
		// refused at capacity. `taskDeps` throws if the dispatch block is reached,
		// so this also proves the check runs BEFORE any session is requested.
		await expect(
			transitionTask(db, eventBus, "root2", "accepted", taskDeps),
		).rejects.toBeInstanceOf(CapacityExceededError);

		// The row is unchanged and — the point of the fix — NO dispatch attempt
		// was written, so no agent was ever asked to start work.
		const [root2Before] = await db
			.select({ state: tasks.state })
			.from(tasks)
			.where(eq(tasks.id, "root2"))
			.limit(1);
		expect(root2Before?.state).toBe("proposed");
		const attemptsAtCapacity = await db
			.select({ id: taskDispatchAttempts.id })
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.taskId, "root2"));
		expect(attemptsAtCapacity).toHaveLength(0);

		// Free a slot, then the same dispatch succeeds and DOES request a session.
		await transitionTask(db, eventBus, "root1", "review", taskDeps);
		await transitionTask(db, eventBus, "root2", "accepted", dispatchDeps);

		const attemptsAfter = await db
			.select({ id: taskDispatchAttempts.id })
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.taskId, "root2"));
		expect(attemptsAfter).toHaveLength(1);
		expect(dispatchedIntents).toHaveLength(1);
	});

	/**
	 * A dispatched task holds its slot from the moment the session is REQUESTED,
	 * not from the moment the agent answers. Counting only `in_progress` let a
	 * run of accepts each observe the same count and all pass — overshooting the
	 * limit by however many were provisioning at once.
	 *
	 * TO SEE THIS FAIL: drop the `accepted`-with-a-requested-dispatch clause from
	 * `countTeamTasksInProgress` and the second accept is admitted.
	 */
	test("a dispatched-but-not-yet-started task still occupies a slot", async ({ db, eventBus }) => {
		await insertTeam(db, "team", 1);
		await insertAgent(db, "agent-1");
		await insertTask(db, "first", "team", "proposed", null, "agent-1");
		await insertTask(db, "second", "team", "proposed", null, "agent-1");

		// First accept dispatches and fills the single slot. The task stays
		// `accepted` — `session_started` has not fired yet.
		await transitionTask(db, eventBus, "first", "accepted", dispatchDeps);
		const [firstRow] = await db
			.select({ state: tasks.state })
			.from(tasks)
			.where(eq(tasks.id, "first"))
			.limit(1);
		expect(firstRow?.state).toBe("accepted");

		// Second accept must be refused even though nothing is `in_progress`.
		await expect(
			transitionTask(db, eventBus, "second", "accepted", dispatchDeps),
		).rejects.toBeInstanceOf(CapacityExceededError);
	});

	/**
	 * The regression that live testing on the packaged app found: at capacity an
	 * agent session still started, and the reaction that moves the task to
	 * `in_progress` was refused — stranding the task in `accepted` so session-end
	 * propagation never fired and the agent's work was lost. A transition that
	 * RECORDS an already-running session must never be refused.
	 */
	test("a recording transition into in_progress is NEVER refused, even over capacity", async ({
		db,
		eventBus,
	}) => {
		await insertTeam(db, "team", 1);
		await insertTask(db, "running", "team", "accepted", null);
		await insertTask(db, "alsoRunning", "team", "accepted", null);

		await transitionTask(db, eventBus, "running", "in_progress", taskDeps);

		// Team is now at 1/1. A session has started for `alsoRunning`; recording
		// that fact must succeed regardless of capacity.
		await expect(
			transitionTask(db, eventBus, "alsoRunning", "in_progress", taskDeps),
		).resolves.toBeUndefined();

		const [row] = await db
			.select({ state: tasks.state })
			.from(tasks)
			.where(eq(tasks.id, "alsoRunning"))
			.limit(1);
		expect(row?.state).toBe("in_progress");
	});
});
