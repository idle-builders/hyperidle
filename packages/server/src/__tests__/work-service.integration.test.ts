/**
 * AU13 red-phase: Work service owns reads AND writes to `bets`, `tasks`, `items`.
 *
 * Write-side coverage (plan §5.4, shipped PR #436):
 *   - createBet / createTask / createItem: plain inserts.
 *   - updateBetById / updateTaskById / updateItemById: plain by-id field-set.
 *   - transitionBetStatus / transitionTaskState: guarded CAS predicate +
 *     `.returning()`; returns `{ applied }`, never throws itself.
 *   - updateBetDecompositionStatusIfRunning: in-update guard predicate, no
 *     `.returning()`, silent no-op when the guard misses.
 *   - resolveOrphanedBetDecompositions: bulk sweep
 *     (decompositionStatus='running' -> blocked/failed), returns affected count.
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

import { work } from "@hyperidle/core-app";
import {
	bets,
	type HyperIdleDb,
	items,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../test-fixtures.js";

async function seedTeamAndAgent(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({
		id: "team-1",
		name: "Test Team",
		phase: "build",
		createdAt: new Date().toISOString(),
	});
	await db.insert(teamMembers).values({
		id: "tm-1",
		teamId: "team-1",
		capacity: 3,
		activeBets: 0,
		formedAt: new Date().toISOString(),
	});
	await db.insert(users).values({
		id: "agent-1",
		name: "Agent One",
		role: "builder",
		status: "idle",
		teamId: "tm-1",
		createdAt: new Date().toISOString(),
	});
}

async function seedThread(db: HyperIdleDb, id: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(threads).values({
		id,
		hostKind: "task",
		hostId: "task-1",
		initiatorId: "agent-1",
		participants: JSON.stringify(["agent-1"]),
		lastActiveAt: now,
		createdAt: now,
	});
}

describe("work-service", () => {
	describe("createBet / updateBetById", () => {
		test("createBet inserts a readable row", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "Ship the thing",
				status: "draft",
				createdAt: new Date().toISOString(),
			});

			const [row] = await db.select().from(bets).where(eq(bets.id, "bet-1")).limit(1);
			expect(row?.description).toBe("Ship the thing");
			expect(row?.status).toBe("draft");
		});

		test("updateBetById patches only the addressed row", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "Original",
				status: "draft",
				createdAt: new Date().toISOString(),
			});
			await work.createBet(db, {
				id: "bet-2",
				teamId: "team-1",
				description: "Untouched",
				status: "draft",
				createdAt: new Date().toISOString(),
			});

			await work.updateBetById(db, "bet-1", { description: "Updated" });

			const [updated] = await db.select().from(bets).where(eq(bets.id, "bet-1")).limit(1);
			const [other] = await db.select().from(bets).where(eq(bets.id, "bet-2")).limit(1);
			expect(updated?.description).toBe("Updated");
			expect(other?.description).toBe("Untouched");
		});
	});

	describe("transitionBetStatus", () => {
		test("applies the CAS update and returns applied:true when status matches fromStatus", async ({
			db,
		}) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "draft",
				createdAt: new Date().toISOString(),
			});

			const result = await work.transitionBetStatus(db, {
				betId: "bet-1",
				fromStatus: "draft",
				patch: { status: "active" },
			});

			expect(result.applied).toBe(true);
			const [row] = await db.select().from(bets).where(eq(bets.id, "bet-1")).limit(1);
			expect(row?.status).toBe("active");
		});

		test("returns applied:false and mutates nothing when status does not match fromStatus", async ({
			db,
		}) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			const result = await work.transitionBetStatus(db, {
				betId: "bet-1",
				fromStatus: "draft",
				patch: { status: "active" },
			});

			expect(result.applied).toBe(false);
			const [row] = await db.select().from(bets).where(eq(bets.id, "bet-1")).limit(1);
			// Unchanged — the guard predicate missed, so status stays "active" (not re-written).
			expect(row?.status).toBe("active");
		});
	});

	describe("updateBetDecompositionStatusIfRunning", () => {
		test("updates when decompositionStatus is currently running", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				decompositionStatus: "running",
				createdAt: new Date().toISOString(),
			});

			await work.updateBetDecompositionStatusIfRunning(db, "bet-1", {
				decompositionStatus: "done",
				decompositionBlockerReason: null,
			});

			const [row] = await db.select().from(bets).where(eq(bets.id, "bet-1")).limit(1);
			expect(row?.decompositionStatus).toBe("done");
		});

		test("silently no-ops when decompositionStatus is not running", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				decompositionStatus: "blocked",
				createdAt: new Date().toISOString(),
			});

			await work.updateBetDecompositionStatusIfRunning(db, "bet-1", {
				decompositionStatus: "done",
				decompositionBlockerReason: null,
			});

			const [row] = await db.select().from(bets).where(eq(bets.id, "bet-1")).limit(1);
			expect(row?.decompositionStatus).toBe("blocked");
		});
	});

	describe("resolveOrphanedBetDecompositions", () => {
		test("bulk-flips every running bet to blocked/failed and returns the affected count", async ({
			db,
		}) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d1",
				status: "active",
				decompositionStatus: "running",
				createdAt: new Date().toISOString(),
			});
			await work.createBet(db, {
				id: "bet-2",
				teamId: "team-1",
				description: "d2",
				status: "active",
				decompositionStatus: "running",
				createdAt: new Date().toISOString(),
			});
			await work.createBet(db, {
				id: "bet-3",
				teamId: "team-1",
				description: "d3",
				status: "active",
				decompositionStatus: "done",
				createdAt: new Date().toISOString(),
			});

			const count = await work.resolveOrphanedBetDecompositions(db);

			expect(count).toBe(2);
			const [b1] = await db.select().from(bets).where(eq(bets.id, "bet-1")).limit(1);
			const [b2] = await db.select().from(bets).where(eq(bets.id, "bet-2")).limit(1);
			const [b3] = await db.select().from(bets).where(eq(bets.id, "bet-3")).limit(1);
			expect(b1?.decompositionStatus).toBe("blocked");
			expect(b1?.decompositionBlockerReason).toBe("failed");
			expect(b2?.decompositionStatus).toBe("blocked");
			// Untouched — was not "running".
			expect(b3?.decompositionStatus).toBe("done");
		});
	});

	describe("createTask / updateTaskById", () => {
		test("createTask inserts a readable row", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			await work.createTask(db, {
				id: "task-1",
				betId: "bet-1",
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
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.createTask(db, {
				id: "task-1",
				betId: "bet-1",
				teamId: "team-1",
				title: "Original",
				state: "proposed",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			await work.updateTaskById(db, "task-1", { notes: "hello" });

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
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.createTask(db, {
				id: "task-1",
				betId: "bet-1",
				teamId: "team-1",
				title: "t",
				state: "proposed",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const result = await work.transitionTaskState(db, {
				taskId: "task-1",
				fromState: "proposed",
				patch: { state: "accepted" },
			});

			expect(result.applied).toBe(true);
			const [row] = await db.select().from(tasks).where(eq(tasks.id, "task-1")).limit(1);
			expect(row?.state).toBe("accepted");
		});

		test("returns applied:false when state does not match fromState", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.createTask(db, {
				id: "task-1",
				betId: "bet-1",
				teamId: "team-1",
				title: "t",
				state: "accepted",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const result = await work.transitionTaskState(db, {
				taskId: "task-1",
				fromState: "proposed",
				patch: { state: "in_progress" },
			});

			expect(result.applied).toBe(false);
			const [row] = await db.select().from(tasks).where(eq(tasks.id, "task-1")).limit(1);
			expect(row?.state).toBe("accepted");
		});
	});

	describe("createItem / updateItemById", () => {
		test("createItem inserts a readable row", async ({ db }) => {
			await seedTeamAndAgent(db);
			await seedThread(db, "thread-1");

			await work.createItem(db, {
				id: "item-1",
				title: "Review me",
				threadId: "thread-1",
				createdAt: new Date().toISOString(),
			});

			const [row] = await db.select().from(items).where(eq(items.id, "item-1")).limit(1);
			expect(row?.title).toBe("Review me");
		});

		test("updateItemById patches only the addressed row", async ({ db }) => {
			await seedTeamAndAgent(db);
			await seedThread(db, "thread-1");
			await work.createItem(db, {
				id: "item-1",
				title: "Original",
				threadId: "thread-1",
				createdAt: new Date().toISOString(),
			});

			await work.updateItemById(db, "item-1", { riskTier: "high" });

			const [row] = await db.select().from(items).where(eq(items.id, "item-1")).limit(1);
			expect(row?.riskTier).toBe("high");
			expect(row?.title).toBe("Original");
		});
	});

	// -------------------------------------------------------------------------
	// AU13 read-ownership addendum — reads
	// -------------------------------------------------------------------------

	describe("getBetById", () => {
		test("returns the full row for an existing bet", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "Ship the thing",
				status: "draft",
				createdAt: new Date().toISOString(),
			});

			const row = await work.getBetById(db, "bet-1");
			expect(row?.description).toBe("Ship the thing");
		});

		test("returns undefined for a missing bet", async ({ db }) => {
			const row = await work.getBetById(db, "nope");
			expect(row).toBeUndefined();
		});
	});

	describe("listBets", () => {
		test("returns every bet when opts are omitted", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d1",
				status: "draft",
				createdAt: new Date().toISOString(),
			});
			await work.createBet(db, {
				id: "bet-2",
				teamId: "team-1",
				description: "d2",
				status: "draft",
				createdAt: new Date().toISOString(),
			});

			const rows = await work.listBets(db);
			expect(rows).toHaveLength(2);
		});

		test("applies limit and offset together", async ({ db }) => {
			await seedTeamAndAgent(db);
			for (const n of [1, 2, 3]) {
				await work.createBet(db, {
					id: `bet-${n}`,
					teamId: "team-1",
					description: `d${n}`,
					status: "draft",
					createdAt: new Date().toISOString(),
				});
			}

			const rows = await work.listBets(db, { limit: 1, offset: 1 });
			expect(rows).toHaveLength(1);
		});
	});

	describe("listBetsByTeamAndStatus / countBetsByTeamAndStatus", () => {
		test("filters by exact team + status pair", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d1",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.createBet(db, {
				id: "bet-2",
				teamId: "team-1",
				description: "d2",
				status: "completed",
				createdAt: new Date().toISOString(),
			});

			const active = await work.listBetsByTeamAndStatus(db, "team-1", "active");
			expect(active.map((b) => b.id)).toEqual(["bet-1"]);

			const activeCount = await work.countBetsByTeamAndStatus(db, "team-1", "active");
			const completedCount = await work.countBetsByTeamAndStatus(db, "team-1", "completed");
			expect(activeCount).toBe(1);
			expect(completedCount).toBe(1);
		});

		test("count excludes bets from a different team", async ({ db }) => {
			await seedTeamAndAgent(db);
			await db.insert(teams).values({
				id: "team-2",
				name: "Other Team",
				phase: "build",
				createdAt: new Date().toISOString(),
			});
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d1",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.createBet(db, {
				id: "bet-2",
				teamId: "team-2",
				description: "d2",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			const count = await work.countBetsByTeamAndStatus(db, "team-1", "active");
			expect(count).toBe(1);
		});
	});

	describe("listBetsByIds", () => {
		test("returns matching bets, empty ids short-circuits without querying", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d1",
				status: "draft",
				createdAt: new Date().toISOString(),
			});

			const rows = await work.listBetsByIds(db, ["bet-1", "missing"]);
			expect(rows.map((b) => b.id)).toEqual(["bet-1"]);

			const empty = await work.listBetsByIds(db, []);
			expect(empty).toEqual([]);
		});
	});

	describe("searchBetsByText", () => {
		test("matches description/hypothesis/doneCondition, ranks prefix matches first", async ({
			db,
		}) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "unrelated",
				hypothesis: "widgets will sell",
				status: "draft",
				createdAt: "2026-01-01T00:00:00.000Z",
			});
			await work.createBet(db, {
				id: "bet-2",
				teamId: "team-1",
				description: "widgets are the future",
				status: "draft",
				createdAt: "2026-01-02T00:00:00.000Z",
			});

			const rows = await work.searchBetsByText(db, {
				pattern: "%widgets%",
				query: "widgets",
				limit: 10,
			});
			expect(rows.map((b) => b.id).sort()).toEqual(["bet-1", "bet-2"]);
			// bet-2's description starts with the query → matchRank 0, ranked first.
			expect(rows[0]?.id).toBe("bet-2");
		});
	});

	describe("getTaskById", () => {
		test("returns the full row for an existing task", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.createTask(db, {
				id: "task-1",
				betId: "bet-1",
				teamId: "team-1",
				title: "Do it",
				state: "proposed",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const row = await work.getTaskById(db, "task-1");
			expect(row?.title).toBe("Do it");
		});
	});

	describe("listTasks", () => {
		async function seedTwoTasks(db: HyperIdleDb): Promise<void> {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.createTask(db, {
				id: "task-1",
				betId: "bet-1",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				title: "T1",
				state: "proposed",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});
			await work.createTask(db, {
				id: "task-2",
				betId: "bet-1",
				teamId: "team-1",
				title: "T2",
				state: "accepted",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});
		}

		test("returns every task when opts are omitted", async ({ db }) => {
			await seedTwoTasks(db);
			const rows = await work.listTasks(db);
			expect(rows).toHaveLength(2);
		});

		test("AND-composes betId + state + ownerAgentId over only the provided keys", async ({
			db,
		}) => {
			await seedTwoTasks(db);

			const byBet = await work.listTasks(db, { betId: "bet-1" });
			expect(byBet).toHaveLength(2);

			const byState = await work.listTasks(db, { betId: "bet-1", state: "proposed" });
			expect(byState.map((t) => t.id)).toEqual(["task-1"]);

			const byOwner = await work.listTasks(db, {
				betId: "bet-1",
				state: "proposed",
				ownerAgentId: "agent-1",
			});
			expect(byOwner.map((t) => t.id)).toEqual(["task-1"]);

			const byOwnerMiss = await work.listTasks(db, {
				betId: "bet-1",
				state: "accepted",
				ownerAgentId: "agent-1",
			});
			expect(byOwnerMiss).toEqual([]);
		});
	});

	describe("listTasksByIds", () => {
		test("returns matching tasks, empty ids short-circuits without querying", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.createTask(db, {
				id: "task-1",
				betId: "bet-1",
				teamId: "team-1",
				title: "T1",
				state: "proposed",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});

			const rows = await work.listTasksByIds(db, ["task-1", "missing"]);
			expect(rows.map((t) => t.id)).toEqual(["task-1"]);

			const empty = await work.listTasksByIds(db, []);
			expect(empty).toEqual([]);
		});
	});

	describe("listBetTasksWithLatestSessionOutcome", () => {
		test("owns the correlated sessions subquery for latestSessionOutcome", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.createBet(db, {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.createTask(db, {
				id: "task-1",
				betId: "bet-1",
				teamId: "team-1",
				title: "T1",
				state: "in_progress",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});
			await db.insert(sessions).values({
				id: "session-1",
				taskId: "task-1",
				agentId: "agent-1",
				modelTier: "workhorse",
				startedAt: "2026-01-01T00:00:00.000Z",
				state: "done",
				outcome: "completed",
			});

			const rows = await work.listBetTasksWithLatestSessionOutcome(db, "bet-1");
			expect(rows).toHaveLength(1);
			expect(rows[0]?.latestSessionOutcome).toBe("completed");
		});
	});

	describe("getItemById / listItemsByThread", () => {
		test("getItemById returns the full row", async ({ db }) => {
			await seedTeamAndAgent(db);
			await seedThread(db, "thread-1");
			await work.createItem(db, {
				id: "item-1",
				title: "Review me",
				threadId: "thread-1",
				createdAt: new Date().toISOString(),
			});

			const row = await work.getItemById(db, "item-1");
			expect(row?.title).toBe("Review me");
		});

		test("listItemsByThread orders by createdAt ascending", async ({ db }) => {
			await seedTeamAndAgent(db);
			await seedThread(db, "thread-1");
			await work.createItem(db, {
				id: "item-2",
				title: "Second",
				threadId: "thread-1",
				createdAt: "2026-01-02T00:00:00.000Z",
			});
			await work.createItem(db, {
				id: "item-1",
				title: "First",
				threadId: "thread-1",
				createdAt: "2026-01-01T00:00:00.000Z",
			});

			const rows = await work.listItemsByThread(db, "thread-1");
			expect(rows.map((i) => i.id)).toEqual(["item-1", "item-2"]);
		});
	});

	describe("listQueuedItemsSince", () => {
		test("matches items whose auditTrail mentions policy_queued, created on/after cutoff", async ({
			db,
		}) => {
			await seedTeamAndAgent(db);
			await seedThread(db, "thread-1");
			await work.createItem(db, {
				id: "item-1",
				title: "Queued",
				threadId: "thread-1",
				auditTrail: JSON.stringify([{ action: "policy_queued" }]),
				createdAt: "2026-01-02T00:00:00.000Z",
			});
			await work.createItem(db, {
				id: "item-2",
				title: "Too old",
				threadId: "thread-1",
				auditTrail: JSON.stringify([{ action: "policy_queued" }]),
				createdAt: "2025-01-01T00:00:00.000Z",
			});
			await work.createItem(db, {
				id: "item-3",
				title: "Not queued",
				threadId: "thread-1",
				createdAt: "2026-01-02T00:00:00.000Z",
			});

			const rows = await work.listQueuedItemsSince(db, "2026-01-01T00:00:00.000Z");
			expect(rows.map((i) => i.id)).toEqual(["item-1"]);
		});
	});

	describe("findItemByReasoningMarker", () => {
		test("finds an item whose reasoning contains the marker", async ({ db }) => {
			await seedTeamAndAgent(db);
			await seedThread(db, "thread-1");
			await work.createItem(db, {
				id: "item-1",
				title: "Has marker",
				threadId: "thread-1",
				reasoning: JSON.stringify({ marker: "attention:knowledge-item-1" }),
				createdAt: new Date().toISOString(),
			});

			const row = await work.findItemByReasoningMarker(db, "attention:knowledge-item-1");
			expect(row?.id).toBe("item-1");

			const miss = await work.findItemByReasoningMarker(db, "attention:missing");
			expect(miss).toBeUndefined();
		});

		test("tx-scoped read sees an uncommitted row written earlier in the same transaction", async ({
			db,
		}) => {
			await seedTeamAndAgent(db);
			await seedThread(db, "thread-1");

			let sawInTx: { id: string } | undefined;
			await db.transaction(async (tx) => {
				await work.createItem(tx, {
					id: "item-tx",
					title: "In-flight",
					threadId: "thread-1",
					reasoning: JSON.stringify({ marker: "attention:tx-item" }),
					createdAt: new Date().toISOString(),
				});
				// Not yet committed — a fn using the pooled `db` (not `tx`) would miss this.
				sawInTx = await work.findItemByReasoningMarker(tx, "attention:tx-item");
			});

			expect(sawInTx?.id).toBe("item-tx");
		});
	});

	describe("findRetroItemByThreadIds", () => {
		test("finds the post-bet-retro item by thread ids + body marker (items-only, no threads join)", async ({
			db,
		}) => {
			await seedTeamAndAgent(db);
			const now = new Date().toISOString();
			await db.insert(threads).values({
				id: "thread-retro",
				hostKind: "bet",
				hostId: "bet-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: now,
				createdAt: now,
			});
			await work.createItem(db, {
				id: "item-retro",
				title: "Post-bet retro",
				threadId: "thread-retro",
				body: "betId=bet-1\nHypothesis: x",
				createdAt: now,
			});

			const row = await work.findRetroItemByThreadIds(db, ["thread-retro"], "betId=bet-1");
			expect(row?.id).toBe("item-retro");

			const miss = await work.findRetroItemByThreadIds(db, ["thread-retro"], "betId=bet-missing");
			expect(miss).toBeUndefined();

			// Empty thread-id set short-circuits to undefined (no bet threads yet).
			const emptyMiss = await work.findRetroItemByThreadIds(db, [], "betId=bet-1");
			expect(emptyMiss).toBeUndefined();
		});
	});
});
