/**
 * AU13 red-phase: Work service owns writes to `bets`, `tasks`, `items`.
 *
 * This test file is written BEFORE `../work-service.ts` exists — it asserts
 * the exact predicate/return/silent-no-op mechanics enumerated in
 * `.pipeline/plans/AU13.md` §5.4 for every migrated call-site mechanic:
 *   - createBet / createTask / createItem: plain inserts.
 *   - updateBetById / updateTaskById / updateItemById: plain by-id field-set.
 *   - transitionBetStatus / transitionTaskState: guarded CAS predicate +
 *     `.returning()`; returns `{ applied }`, never throws itself.
 *   - updateBetDecompositionStatusIfRunning: in-update guard predicate, no
 *     `.returning()`, silent no-op when the guard misses.
 *   - resolveOrphanedBetDecompositions: bulk sweep
 *     (decompositionStatus='running' -> blocked/failed), returns affected count.
 */
import {
	bets,
	type HyperIdleDb,
	items,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../test-fixtures.js";
import * as work from "../work-service.js";

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
});
