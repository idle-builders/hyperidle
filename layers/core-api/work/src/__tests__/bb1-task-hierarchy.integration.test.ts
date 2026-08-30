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

import { type HyperIdleDb, tasks, teams } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { CapacityExceededError, TaskCycleError } from "../errors.js";
import { type TaskKillCascadeDeps, cascadeTaskKill } from "../task-kill-cascade.js";
import {
	assertNoCycle,
	type TaskStateMachineDeps,
	transitionTask,
} from "../task-state-machine.js";
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
		const [team] = await exec
			.select()
			.from(teams)
			.where(eq(teams.id, teamId))
			.limit(1);
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
): Promise<void> {
	await db
		.insert(tasks)
		.values({ id, parentTaskId, teamId, title: id, state, createdAt: NOW, updatedAt: NOW });
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
		await expect(
			assertNoCycle(db, "root", "great-grandchild"),
		).rejects.toBeInstanceOf(TaskCycleError);

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
	test("killing root kills its entire 3-level subtree (none missed)", async ({
		db,
		eventBus,
	}) => {
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

	test("already-terminal tasks are not re-killed by the cascade", async ({
		db,
		eventBus,
	}) => {
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
	test("leaf tokens are visible in the subtree sum; no ancestor row is written", async ({
		db,
	}) => {
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
				acc +
				Object.values(parsed.byTier).reduce(
					(s, tier) => s + tier.prompt + tier.completion,
					0,
				)
			);
		}, 0);
		expect(subtreeSum).toBe(150); // leaf: 100 prompt + 50 completion
	});
});

// ---------------------------------------------------------------------------
// AC6 — WIP limit
// ---------------------------------------------------------------------------

describe("AC6 — WIP limit", () => {
	test("capacity is enforced; limit counts tasks at every depth; slot freed on transition out of in_progress", async ({
		db,
		eventBus,
	}) => {
		// Arrange: capacity = 2; a root + grandchild will fill it
		await insertTeam(db, "team", 2);
		await insertTask(db, "root1", "team", "accepted", null);
		await insertTask(db, "child1", "team", "accepted", "root1");
		await insertTask(db, "grandchild1", "team", "accepted", "child1"); // depth 2
		await insertTask(db, "root2", "team", "accepted", null); // will be blocked

		// Fill to capacity: root1 (depth 0) + grandchild1 (depth 2) = 2
		await transitionTask(db, eventBus, "root1", "in_progress", taskDeps);
		await transitionTask(db, eventBus, "grandchild1", "in_progress", taskDeps);

		// Assert: the next in_progress attempt is refused at capacity
		await expect(
			transitionTask(db, eventBus, "root2", "in_progress", taskDeps),
		).rejects.toBeInstanceOf(CapacityExceededError);

		// root2 row unchanged — CapacityExceededError rolls back inside the transaction
		const [root2Before] = await db
			.select({ state: tasks.state })
			.from(tasks)
			.where(eq(tasks.id, "root2"))
			.limit(1);
		expect(root2Before?.state).toBe("accepted");

		// Free a slot: root1 moves out of in_progress → review
		await transitionTask(db, eventBus, "root1", "review", taskDeps);

		// Now root2 can start (one slot is open)
		await expect(
			transitionTask(db, eventBus, "root2", "in_progress", taskDeps),
		).resolves.toBeUndefined();

		const [root2After] = await db
			.select({ state: tasks.state })
			.from(tasks)
			.where(eq(tasks.id, "root2"))
			.limit(1);
		expect(root2After?.state).toBe("in_progress");
	});
});
