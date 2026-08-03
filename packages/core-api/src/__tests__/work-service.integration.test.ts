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
import * as work from "@hyperidle/work";
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
			await work.create(db, "bet", {
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
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "Original",
				status: "draft",
				createdAt: new Date().toISOString(),
			});
			await work.create(db, "bet", {
				id: "bet-2",
				teamId: "team-1",
				description: "Untouched",
				status: "draft",
				createdAt: new Date().toISOString(),
			});

			await work.update(db, "bet", "bet-1", { description: "Updated" });

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
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "draft",
				createdAt: new Date().toISOString(),
			});

			const result = await work.transition(db, "bet", {
				id: "bet-1",
				guard: { field: "status", equals: "draft" },
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
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			const result = await work.transition(db, "bet", {
				id: "bet-1",
				guard: { field: "status", equals: "draft" },
				patch: { status: "active" },
			});

			expect(result.applied).toBe(false);
			const [row] = await db.select().from(bets).where(eq(bets.id, "bet-1")).limit(1);
			// Unchanged — the guard predicate missed, so status stays "active" (not re-written).
			expect(row?.status).toBe("active");
		});
	});

	describe("createTask / updateTaskById", () => {
		test("createTask inserts a readable row", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			await work.create(db, "task", {
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
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.create(db, "task", {
				id: "task-1",
				betId: "bet-1",
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
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.create(db, "task", {
				id: "task-1",
				betId: "bet-1",
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
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.create(db, "task", {
				id: "task-1",
				betId: "bet-1",
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

	describe("createItem / updateItemById", () => {
		test("createItem inserts a readable row", async ({ db }) => {
			await seedTeamAndAgent(db);
			await seedThread(db, "thread-1");

			await work.create(db, "item", {
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
			await work.create(db, "item", {
				id: "item-1",
				title: "Original",
				threadId: "thread-1",
				createdAt: new Date().toISOString(),
			});

			await work.update(db, "item", "item-1", { riskTier: "high" });

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
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "Ship the thing",
				status: "draft",
				createdAt: new Date().toISOString(),
			});

			const row = await work.get(db, "bet", "bet-1");
			expect(row?.description).toBe("Ship the thing");
		});

		test("returns undefined for a missing bet", async ({ db }) => {
			const row = await work.get(db, "bet", "nope");
			expect(row).toBeUndefined();
		});
	});

	describe("listBets", () => {
		test("returns every bet when opts are omitted", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "d1",
				status: "draft",
				createdAt: new Date().toISOString(),
			});
			await work.create(db, "bet", {
				id: "bet-2",
				teamId: "team-1",
				description: "d2",
				status: "draft",
				createdAt: new Date().toISOString(),
			});

			const rows = await work.list(db, "bet");
			expect(rows).toHaveLength(2);
		});

		test("applies limit and offset together", async ({ db }) => {
			await seedTeamAndAgent(db);
			for (const n of [1, 2, 3]) {
				await work.create(db, "bet", {
					id: `bet-${n}`,
					teamId: "team-1",
					description: `d${n}`,
					status: "draft",
					createdAt: new Date().toISOString(),
				});
			}

			const rows = await work.list(db, "bet", { limit: 1, offset: 1 });
			expect(rows).toHaveLength(1);
		});
	});

	describe("listBetsByTeamAndStatus / countBetsByTeamAndStatus", () => {
		test("filters by exact team + status pair", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "d1",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.create(db, "bet", {
				id: "bet-2",
				teamId: "team-1",
				description: "d2",
				status: "completed",
				createdAt: new Date().toISOString(),
			});

			const active = await work.list(db, "bet", { teamId: "team-1", status: "active" });
			expect(active.map((b) => b.id)).toEqual(["bet-1"]);

			const activeCount = await work.list(db, "bet", {
				teamId: "team-1",
				status: "active",
				count: true,
			});
			const completedCount = await work.list(db, "bet", {
				teamId: "team-1",
				status: "completed",
				count: true,
			});
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
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "d1",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.create(db, "bet", {
				id: "bet-2",
				teamId: "team-2",
				description: "d2",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			const count = await work.list(db, "bet", { teamId: "team-1", status: "active", count: true });
			expect(count).toBe(1);
		});
	});

	describe("listBetsByIds", () => {
		test("returns matching bets, empty ids short-circuits without querying", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "d1",
				status: "draft",
				createdAt: new Date().toISOString(),
			});

			const rows = await work.list(db, "bet", { ids: ["bet-1", "missing"] });
			expect(rows.map((b) => b.id)).toEqual(["bet-1"]);

			const empty = await work.list(db, "bet", { ids: [] });
			expect(empty).toEqual([]);
		});
	});

	describe("searchBetsByText", () => {
		test("matches description/hypothesis/doneCondition, ranks prefix matches first", async ({
			db,
		}) => {
			await seedTeamAndAgent(db);
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "unrelated",
				hypothesis: "widgets will sell",
				status: "draft",
				createdAt: "2026-01-01T00:00:00.000Z",
			});
			await work.create(db, "bet", {
				id: "bet-2",
				teamId: "team-1",
				description: "widgets are the future",
				status: "draft",
				createdAt: "2026-01-02T00:00:00.000Z",
			});

			const rows = await work.list(db, "bet", { text: "widgets", limit: 10 });
			expect(rows.map((b) => b.id).sort()).toEqual(["bet-1", "bet-2"]);
			// bet-2's description starts with the query → matchRank 0, ranked first.
			expect(rows[0]?.id).toBe("bet-2");
		});
	});

	describe("getTaskById", () => {
		test("returns the full row for an existing task", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.create(db, "task", {
				id: "task-1",
				betId: "bet-1",
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
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.create(db, "task", {
				id: "task-1",
				betId: "bet-1",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				title: "T1",
				state: "proposed",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});
			await work.create(db, "task", {
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
			const rows = await work.list(db, "task");
			expect(rows).toHaveLength(2);
		});

		test("AND-composes betId + state + ownerAgentId over only the provided keys", async ({
			db,
		}) => {
			await seedTwoTasks(db);

			const byBet = await work.list(db, "task", { betId: "bet-1" });
			expect(byBet).toHaveLength(2);

			const byState = await work.list(db, "task", { betId: "bet-1", state: "proposed" });
			expect(byState.map((t) => t.id)).toEqual(["task-1"]);

			const byOwner = await work.list(db, "task", {
				betId: "bet-1",
				state: "proposed",
				ownerAgentId: "agent-1",
			});
			expect(byOwner.map((t) => t.id)).toEqual(["task-1"]);

			const byOwnerMiss = await work.list(db, "task", {
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
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.create(db, "task", {
				id: "task-1",
				betId: "bet-1",
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

	describe("listBetTasksWithLatestSessionOutcome", () => {
		test("owns the correlated sessions subquery for latestSessionOutcome", async ({ db }) => {
			await seedTeamAndAgent(db);
			await work.create(db, "bet", {
				id: "bet-1",
				teamId: "team-1",
				description: "d",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await work.create(db, "task", {
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

			const rows = await work.list(db, "task", { betId: "bet-1", include: "latestSessionOutcome" });
			expect(rows).toHaveLength(1);
			expect(rows[0]?.latestSessionOutcome).toBe("completed");
		});
	});

	describe("getItemById / listItemsByThread", () => {
		test("getItemById returns the full row", async ({ db }) => {
			await seedTeamAndAgent(db);
			await seedThread(db, "thread-1");
			await work.create(db, "item", {
				id: "item-1",
				title: "Review me",
				threadId: "thread-1",
				createdAt: new Date().toISOString(),
			});

			const row = await work.get(db, "item", "item-1");
			expect(row?.title).toBe("Review me");
		});

		test("listItemsByThread orders by createdAt ascending", async ({ db }) => {
			await seedTeamAndAgent(db);
			await seedThread(db, "thread-1");
			await work.create(db, "item", {
				id: "item-2",
				title: "Second",
				threadId: "thread-1",
				createdAt: "2026-01-02T00:00:00.000Z",
			});
			await work.create(db, "item", {
				id: "item-1",
				title: "First",
				threadId: "thread-1",
				createdAt: "2026-01-01T00:00:00.000Z",
			});

			const rows = await work.list(db, "item", { threadId: "thread-1" });
			expect(rows.map((i) => i.id)).toEqual(["item-1", "item-2"]);
		});
	});

	describe("listQueuedItemsSince", () => {
		test("matches items whose auditTrail mentions policy_queued, created on/after cutoff", async ({
			db,
		}) => {
			await seedTeamAndAgent(db);
			await seedThread(db, "thread-1");
			await work.create(db, "item", {
				id: "item-1",
				title: "Queued",
				threadId: "thread-1",
				auditTrail: JSON.stringify([{ action: "policy_queued" }]),
				createdAt: "2026-01-02T00:00:00.000Z",
			});
			await work.create(db, "item", {
				id: "item-2",
				title: "Too old",
				threadId: "thread-1",
				auditTrail: JSON.stringify([{ action: "policy_queued" }]),
				createdAt: "2025-01-01T00:00:00.000Z",
			});
			await work.create(db, "item", {
				id: "item-3",
				title: "Not queued",
				threadId: "thread-1",
				createdAt: "2026-01-02T00:00:00.000Z",
			});

			const rows = await work.list(db, "item", {
				queued: true,
				createdSince: "2026-01-01T00:00:00.000Z",
			});
			expect(rows.map((i) => i.id)).toEqual(["item-1"]);
		});
	});

	describe("findItemByReasoningMarker", () => {
		test("finds an item whose reasoning contains the marker", async ({ db }) => {
			await seedTeamAndAgent(db);
			await seedThread(db, "thread-1");
			await work.create(db, "item", {
				id: "item-1",
				title: "Has marker",
				threadId: "thread-1",
				reasoning: JSON.stringify({ marker: "attention:knowledge-item-1" }),
				createdAt: new Date().toISOString(),
			});

			const [row] = await work.list(db, "item", { marker: "attention:knowledge-item-1" });
			expect(row?.id).toBe("item-1");

			const missRows = await work.list(db, "item", { marker: "attention:missing" });
			expect(missRows[0]).toBeUndefined();
		});

		test("tx-scoped read sees an uncommitted row written earlier in the same transaction", async ({
			db,
		}) => {
			await seedTeamAndAgent(db);
			await seedThread(db, "thread-1");

			let sawInTx: import("@hyperidle/work").Item | undefined;
			await db.transaction(async (tx) => {
				await work.create(tx, "item", {
					id: "item-tx",
					title: "In-flight",
					threadId: "thread-1",
					reasoning: JSON.stringify({ marker: "attention:tx-item" }),
					createdAt: new Date().toISOString(),
				});
				// Not yet committed — a fn using the pooled `db` (not `tx`) would miss this.
				const txRows = await work.list(tx, "item", { marker: "attention:tx-item" });
				sawInTx = txRows[0];
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
			await work.create(db, "item", {
				id: "item-retro",
				title: "Post-bet retro",
				threadId: "thread-retro",
				body: "betId=bet-1\nHypothesis: x",
				createdAt: now,
			});

			const [row] = await work.list(db, "item", {
				threadIds: ["thread-retro"],
				bodyMarker: "betId=bet-1",
			});
			expect(row?.id).toBe("item-retro");

			const missRows = await work.list(db, "item", {
				threadIds: ["thread-retro"],
				bodyMarker: "betId=bet-missing",
			});
			expect(missRows[0]).toBeUndefined();

			// Empty thread-id set short-circuits to undefined (no bet threads yet).
			const emptyMissRows = await work.list(db, "item", {
				threadIds: [],
				bodyMarker: "betId=bet-1",
			});
			expect(emptyMissRows[0]).toBeUndefined();
		});
	});
});
