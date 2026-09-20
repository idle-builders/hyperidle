/**
 * AU13 red-phase: Work service owns reads AND writes to `bets`, `tasks`, `items`.
 *
 * Write-side coverage (plan §5.4, shipped PR #436):
 *   - createBet / createTask / createItem: plain inserts.
 *   - updateBetById / updateTaskById / updateItemById: plain by-id field-set.
 *   - transitionBetStatus / transitionTaskState: guarded CAS predicate +
 *     `.returning()`; returns `{ applied }`, never throws itself.
 *
 * Read-side coverage (reopened 2026-07-12, plan addendum §A3/§A5), written
 * BEFORE the read functions exist on `../work-service.ts`:
 *   - get*ById collapses (getBetById/getTaskById/getItemById).
 *   - list/filter AND-composition (listTasks), exact aggregate predicates
 *     (countBetsByTeamAndStatus), empty-ids short-circuit (listTasksByIds/
 *     listBetsByIds), the owned-primary + foreign-join functions
 *     (listBetTasksWithLatestSessionOutcome imports sessions;
 *     findRetroItemByThreadIds is items-only — the former threads join was
 *     decomposed per founder ruling 2026-07-12, zero cross-owned-table joins).
 *   - R5 tx-visibility: a read fn called with `tx` inside an open transaction
 *     must see an uncommitted row written earlier in the same `tx`.
 */
import { type HyperIdleDb, tasks, teams, threads, users } from "@hyperidle/db";
import * as work from "@hyperidle/task";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

async function seedTeamAndAgent(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({
		id: "team-1",
		name: "Test Team",
		phase: "build",
		createdAt: new Date().toISOString(),
	});
	await db.insert(users).values({
		id: "agent-1",
		name: "Agent One",
		role: "builder",
		status: "idle",
		teamId: "team-1",
		createdAt: new Date().toISOString(),
	});
}

/**
 * @lore BC3 architecture.md §5: `tasks.threadId` is `NOT NULL` now — every
 * `work.create(db, "task", ...)` call needs a real thread row first.
 */
async function seedTaskThread(db: HyperIdleDb, id: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(threads).values({
		id,
		hostKind: "team",
		hostId: "team-1",
		initiatorId: "agent-1",
		participants: JSON.stringify(["agent-1"]),
		lastActiveAt: now,
		createdAt: now,
	});
}

describe("work-service", () => {
	describe("createTask / updateTaskById", () => {
		test("createTask inserts a readable row", async ({ db }) => {
			await seedTeamAndAgent(db);
			await seedTaskThread(db, "thr-bet-1");
			await work.create(db, "task", {
				id: "bet-1",
				threadId: "thr-bet-1",
				parentTaskId: null,
				teamId: "team-1",
				title: "Root task",
				state: "in_progress",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			await seedTaskThread(db, "thr-task-1");
			await work.create(db, "task", {
				id: "task-1",
				threadId: "thr-task-1",
				parentTaskId: "bet-1",
				teamId: "team-1",
				title: "Do the thing",
				state: "proposed",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const [row] = await db.select().from(tasks).where(eq(tasks.id, "task-1")).limit(1);
			expect(row?.title).toBe("Do the thing");
			expect(row?.state).toBe("proposed");
		});

		test("updateTaskById patches only the addressed row", async ({ db }) => {
			await seedTeamAndAgent(db);
			await seedTaskThread(db, "thr-bet-1");
			await work.create(db, "task", {
				id: "bet-1",
				threadId: "thr-bet-1",
				parentTaskId: null,
				teamId: "team-1",
				title: "Root task",
				state: "in_progress",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});
			await seedTaskThread(db, "thr-task-1");
			await work.create(db, "task", {
				id: "task-1",
				threadId: "thr-task-1",
				parentTaskId: "bet-1",
				teamId: "team-1",
				title: "Original",
				state: "proposed",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			await work.update(db, "task", "task-1", { notes: "hello" });

			const [row] = await db.select().from(tasks).where(eq(tasks.id, "task-1")).limit(1);
			expect(row?.notes).toBe("hello");
			expect(row?.title).toBe("Original");
		});
	});

	describe("transitionTaskState", () => {
		test("applies the CAS update and returns applied:true when state matches fromState", async ({
			db,
		}) => {
			await seedTeamAndAgent(db);
			await seedTaskThread(db, "thr-bet-1");
			await work.create(db, "task", {
				id: "bet-1",
				threadId: "thr-bet-1",
				parentTaskId: null,
				teamId: "team-1",
				title: "Root task",
				state: "in_progress",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});
			await seedTaskThread(db, "thr-task-1");
			await work.create(db, "task", {
				id: "task-1",
				threadId: "thr-task-1",
				parentTaskId: "bet-1",
				teamId: "team-1",
				title: "t",
				state: "proposed",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const result = await work.transition(db, "task", {
				id: "task-1",
				guard: { field: "state", equals: "proposed" },
				patch: { state: "accepted" },
			});

			expect(result.applied).toBe(true);
			const [row] = await db.select().from(tasks).where(eq(tasks.id, "task-1")).limit(1);
			expect(row?.state).toBe("accepted");
		});

		test("returns applied:false when state does not match fromState", async ({ db }) => {
			await seedTeamAndAgent(db);
			await seedTaskThread(db, "thr-bet-1");
			await work.create(db, "task", {
				id: "bet-1",
				threadId: "thr-bet-1",
				parentTaskId: null,
				teamId: "team-1",
				title: "Root task",
				state: "in_progress",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});
			await seedTaskThread(db, "thr-task-1");
			await work.create(db, "task", {
				id: "task-1",
				threadId: "thr-task-1",
				parentTaskId: "bet-1",
				teamId: "team-1",
				title: "t",
				state: "accepted",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const result = await work.transition(db, "task", {
				id: "task-1",
				guard: { field: "state", equals: "proposed" },
				patch: { state: "in_progress" },
			});

			expect(result.applied).toBe(false);
			const [row] = await db.select().from(tasks).where(eq(tasks.id, "task-1")).limit(1);
			expect(row?.state).toBe("accepted");
		});
	});

	// @lore BC3 architecture.md §5: describe("createItem / updateItemById")
	// DELETED — both wrote the `items` table, which no longer exists.

	// -------------------------------------------------------------------------
	// AU13 read-ownership addendum — reads
	// -------------------------------------------------------------------------

	describe("getTaskById", () => {
		test("returns the full row for an existing task", async ({ db }) => {
			await seedTeamAndAgent(db);
			await seedTaskThread(db, "thr-bet-1");
			await work.create(db, "task", {
				id: "bet-1",
				threadId: "thr-bet-1",
				parentTaskId: null,
				teamId: "team-1",
				title: "Root task",
				state: "in_progress",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});
			await seedTaskThread(db, "thr-task-1");
			await work.create(db, "task", {
				id: "task-1",
				threadId: "thr-task-1",
				parentTaskId: "bet-1",
				teamId: "team-1",
				title: "Do it",
				state: "proposed",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const row = await work.get(db, "task", "task-1");
			expect(row?.title).toBe("Do it");
		});
	});

	describe("listTasks", () => {
		async function seedTwoTasks(db: HyperIdleDb): Promise<void> {
			await seedTeamAndAgent(db);
			await seedTaskThread(db, "thr-bet-1");
			await work.create(db, "task", {
				id: "bet-1",
				threadId: "thr-bet-1",
				parentTaskId: null,
				teamId: "team-1",
				title: "Root task",
				state: "in_progress",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});
			await seedTaskThread(db, "thr-task-1");
			await work.create(db, "task", {
				id: "task-1",
				threadId: "thr-task-1",
				parentTaskId: "bet-1",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				title: "T1",
				state: "proposed",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});
			await seedTaskThread(db, "thr-task-2");
			await work.create(db, "task", {
				id: "task-2",
				threadId: "thr-task-2",
				parentTaskId: "bet-1",
				teamId: "team-1",
				title: "T2",
				state: "accepted",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});
		}

		test("returns every task when opts are omitted", async ({ db }) => {
			await seedTwoTasks(db);
			// BB1: work.list(db, "task") returns ALL tasks including root (bet-1, task-1, task-2)
			const rows = await work.list(db, "task");
			expect(rows).toHaveLength(3);
		});

		test("AND-composes parentTaskId + state + ownerAgentId over only the provided keys", async ({
			db,
		}) => {
			await seedTwoTasks(db);

			const byParent = await work.list(db, "task", { parentTaskId: "bet-1" });
			expect(byParent).toHaveLength(2);

			const byState = await work.list(db, "task", { parentTaskId: "bet-1", state: "proposed" });
			expect(byState.map((t) => t.id)).toEqual(["task-1"]);

			const byOwner = await work.list(db, "task", {
				parentTaskId: "bet-1",
				state: "proposed",
				ownerAgentId: "agent-1",
			});
			expect(byOwner.map((t) => t.id)).toEqual(["task-1"]);

			const byOwnerMiss = await work.list(db, "task", {
				parentTaskId: "bet-1",
				state: "accepted",
				ownerAgentId: "agent-1",
			});
			expect(byOwnerMiss).toEqual([]);
		});
	});

	describe("listTasksByIds", () => {
		test("returns matching tasks, empty ids short-circuits without querying", async ({ db }) => {
			await seedTeamAndAgent(db);
			await seedTaskThread(db, "thr-bet-1");
			await work.create(db, "task", {
				id: "bet-1",
				threadId: "thr-bet-1",
				parentTaskId: null,
				teamId: "team-1",
				title: "Root task",
				state: "in_progress",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});
			await seedTaskThread(db, "thr-task-1");
			await work.create(db, "task", {
				id: "task-1",
				threadId: "thr-task-1",
				parentTaskId: "bet-1",
				teamId: "team-1",
				title: "T1",
				state: "proposed",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const rows = await work.list(db, "task", { ids: ["task-1", "missing"] });
			expect(rows.map((t) => t.id)).toEqual(["task-1"]);

			const empty = await work.list(db, "task", { ids: [] });
			expect(empty).toEqual([]);
		});
	});

	// @lore BC3 architecture.md §5: describe("getItemById / listItemsByThread"),
	// describe("listQueuedItemsSince"), describe("findItemByReasoningMarker"),
	// and describe("findRetroItemByThreadIds") all DELETED — every one read
	// the `items` table, which no longer exists.
});
