/**
 * L15 — `ensureTaskThread` lazy-thread-creation race resolution unit tests.
 *
 * Source: L15-plan.md § 5.4 ("Lazy-thread-creation race resolution") +
 * § 12 protected row `ensure-task-thread.test.ts`.
 *
 * The helper uses a conditional `UPDATE ... WHERE thread_id IS NULL`
 * rowcount check. When `result.changes === 0`, a sentinel
 * `TaskThreadRaceLost` is thrown and the speculative thread row is deleted
 * in the same transaction. The caller catches the sentinel and re-reads
 * the winner's thread.
 *
 * Red phase: the service does not exist yet — the import fails.
 */

import {
	agents,
	bets,
	createTestDb,
	type HyperIdleDb,
	products,
	tasks,
	teams,
	threads as threadsTable,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error — module does not exist in red phase; green phase creates it.
import { ensureTaskThread, TaskThreadRaceLost } from "../ensure-task-thread.js";

interface Setup {
	db: HyperIdleDb;
	task: typeof tasks.$inferSelect;
}

function setup(): Setup {
	const db = createTestDb();
	const now = new Date().toISOString();
	db.insert(products).values({ id: "p1", name: "P", phase: "build", createdAt: now }).run();
	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(agents)
		.values({ id: "u-founder", name: "F", role: "founder", status: "active", createdAt: now })
		.run();
	db.insert(bets)
		.values({
			id: "bet-x",
			productId: "p1",
			teamId: "t1",
			pitch: "x",
			appetite: "small",
			status: "in_progress",
			createdAt: now,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task-1",
			betId: "bet-x",
			productId: "p1",
			teamId: "t1",
			title: "T",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();
	const task = db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
	if (!task) throw new Error("task-1 not found");
	return { db, task };
}

describe("ensureTaskThread", () => {
	let s: Setup;

	beforeEach(() => {
		s = setup();
	});

	it("creates a new thread row + pins tasks.thread_id when thread_id IS NULL", () => {
		const result = ensureTaskThread(s.db, s.task, "u-founder");
		expect(result.created).toBe(true);
		expect(result.threadRow.hostKind).toBe("task");
		expect(result.threadRow.hostId).toBe("task-1");

		const after = s.db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		expect(after?.threadId).toBe(result.threadRow.id);
	});

	it("returns the existing thread row when tasks.thread_id is already set", () => {
		// First call creates it.
		const first = ensureTaskThread(s.db, s.task, "u-founder");
		// Re-read the task to pick up the pinned thread_id.
		const taskReread = s.db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		if (!taskReread) throw new Error("task-1 not found");

		// Second call observes the existing pin.
		const second = ensureTaskThread(s.db, taskReread, "u-founder");
		expect(second.created).toBe(false);
		expect(second.threadRow.id).toBe(first.threadRow.id);
	});

	it("when the conditional UPDATE returns rowcount=0 (race lost), the speculative thread row is deleted and TaskThreadRaceLost is thrown internally", () => {
		// Simulate a race: pre-pin tasks.thread_id with a different thread, then
		// invoke ensureTaskThread on the STALE task snapshot (where threadId
		// is still null). The helper observes thread_id IS NULL, attempts the
		// conditional UPDATE, sees rowcount=0, and must:
		//   (a) delete the speculative thread row inserted in this tx
		//   (b) re-read the winner's thread id and return it with created:false
		//
		// This test pins the contract.
		const winnerThreadId = "winner-thread-id-1";
		const now = new Date().toISOString();
		s.db
			.insert(threadsTable)
			.values({
				id: winnerThreadId,
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "u-founder",
				participants: JSON.stringify(["u-founder"]),
				pinned: 0,
				lastActiveAt: now,
				createdAt: now,
			})
			.run();
		s.db.update(tasks).set({ threadId: winnerThreadId }).where(eq(tasks.id, "task-1")).run();

		// Pass the STALE task snapshot (threadId still null in the in-memory copy).
		const result = ensureTaskThread(s.db, s.task, "u-founder");
		expect(result.created).toBe(false);
		expect(result.threadRow.id).toBe(winnerThreadId);

		// No orphan thread row was left behind.
		const allTaskThreads = s.db
			.select()
			.from(threadsTable)
			.where(eq(threadsTable.hostId, "task-1"))
			.all();
		expect(allTaskThreads.length).toBe(1);
		expect(allTaskThreads[0].id).toBe(winnerThreadId);
	});

	it("exports `TaskThreadRaceLost` as the sentinel error class", () => {
		expect(TaskThreadRaceLost).toBeDefined();
		expect(typeof TaskThreadRaceLost).toBe("function");
		const err = new TaskThreadRaceLost();
		expect(err).toBeInstanceOf(Error);
	});
});
