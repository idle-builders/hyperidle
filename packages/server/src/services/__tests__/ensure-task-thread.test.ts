/**
 * L15 — ensureTaskThread + ensureParticipant unit tests.
 *
 * Source: docs/work-packages/L15-plan.md §5.4 (CRITICAL-2 race resolution)
 *   + adversary review F1 (orphan-thread rollback)
 *   + adversary review F2 (the "concurrent" route test does not actually race
 *     on better-sqlite3; this file simulates the race deterministically by
 *     pre-pinning tasks.thread_id between read and conditional UPDATE).
 *   + security MUST-FIX-2 (ensureParticipant lost-update race + parse-error wipe).
 */

import {
	bets,
	createTestDb,
	type HyperIdleDb,
	products,
	tasks,
	teams,
	threads,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	ensureParticipant,
	ensureTaskThread,
	rollbackCreatedThread,
} from "../ensure-task-thread.js";

interface Ctx {
	db: HyperIdleDb;
}

function setup(): Ctx {
	const db = createTestDb();
	const now = new Date().toISOString();
	db.insert(products).values({ id: "p1", name: "P", phase: "build", createdAt: now }).run();
	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();
	db.insert(bets)
		.values({
			id: "bet-1",
			productId: "p1",
			teamId: "t1",
			pitch: "p",
			appetite: "small",
			status: "in_progress",
			createdAt: now,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task-1",
			betId: "bet-1",
			productId: "p1",
			teamId: "t1",
			title: "T",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();
	return { db };
}

describe("ensureTaskThread", () => {
	let ctx: Ctx;
	beforeEach(() => {
		ctx = setup();
	});

	it("creates a thread and pins tasks.thread_id when null (created=true)", () => {
		const task = ctx.db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		if (!task) throw new Error("task-1 missing");
		const result = ensureTaskThread(ctx.db, task, "u-founder");
		expect(result.created).toBe(true);
		expect(result.threadRow.hostId).toBe("task-1");
		const after = ctx.db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		expect(after?.threadId).toBe(result.threadRow.id);
	});

	it("returns the existing thread when tasks.thread_id is already pinned (created=false)", () => {
		const task = ctx.db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		if (!task) throw new Error("task-1 missing");
		const first = ensureTaskThread(ctx.db, task, "u-founder");
		expect(first.created).toBe(true);

		const reread = ctx.db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		if (!reread) throw new Error("task-1 missing after first ensure");
		const second = ensureTaskThread(ctx.db, reread, "u-founder");
		expect(second.created).toBe(false);
		expect(second.threadRow.id).toBe(first.threadRow.id);
	});

	it("(F2 deterministic race) loser branch returns the winner thread without creating an orphan", () => {
		// Regression: adversary F2 — the route-level "concurrent" test runs
		// sequentially on better-sqlite3, so the conditional-UPDATE race-lost
		// branch is never exercised. Simulate the race deterministically by
		// pre-seeding a winner thread and pinning tasks.thread_id BEFORE
		// calling ensureTaskThread on the stale task row.
		const stale = ctx.db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		if (!stale) throw new Error("task-1 missing");
		expect(stale.threadId).toBeNull();

		// Winner racing: insert a different thread row + pin task.thread_id to it.
		const winnerThreadId = "winner-thread";
		const now = new Date().toISOString();
		ctx.db
			.insert(threads)
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
		ctx.db.update(tasks).set({ threadId: winnerThreadId }).where(eq(tasks.id, "task-1")).run();

		// Now run ensureTaskThread with the STALE task row (threadId=null in our
		// hand). The conditional UPDATE WHERE thread_id IS NULL must hit zero
		// rows; the helper rolls back its speculative thread and returns the
		// winner.
		const result = ensureTaskThread(ctx.db, stale, "u-founder");
		expect(result.created).toBe(false);
		expect(result.threadRow.id).toBe(winnerThreadId);

		// No orphan thread should remain.
		const allThreads = ctx.db
			.select()
			.from(threads)
			.where(eq(threads.hostId, "task-1"))
			.all();
		expect(allThreads).toHaveLength(1);
		expect(allThreads[0].id).toBe(winnerThreadId);
	});
});

describe("ensureParticipant", () => {
	let ctx: Ctx;
	beforeEach(() => {
		ctx = setup();
	});

	function createThread(participants: string[]): { id: string } {
		const id = "thread-1";
		const now = new Date().toISOString();
		ctx.db
			.insert(threads)
			.values({
				id,
				hostKind: "task",
				hostId: "task-1",
				initiatorId: participants[0] ?? "u-founder",
				participants: JSON.stringify(participants),
				pinned: 0,
				lastActiveAt: now,
				createdAt: now,
			})
			.run();
		return { id };
	}

	it("appends a new sender to participants[]", () => {
		const { id } = createThread(["u-founder"]);
		const row = ctx.db.select().from(threads).where(eq(threads.id, id)).get();
		if (!row) throw new Error("thread missing");
		ensureParticipant(ctx.db, row, "agent-A");
		const after = ctx.db.select().from(threads).where(eq(threads.id, id)).get();
		expect(JSON.parse(after?.participants ?? "[]")).toEqual(["u-founder", "agent-A"]);
	});

	it("is a no-op when sender is already a participant", () => {
		const { id } = createThread(["u-founder", "agent-A"]);
		const row = ctx.db.select().from(threads).where(eq(threads.id, id)).get();
		if (!row) throw new Error("thread missing");
		ensureParticipant(ctx.db, row, "agent-A");
		const after = ctx.db.select().from(threads).where(eq(threads.id, id)).get();
		expect(JSON.parse(after?.participants ?? "[]")).toEqual(["u-founder", "agent-A"]);
	});

	it("(MUST-FIX-2 lost-update) retries when the column changed under us; both senders end up present", () => {
		// Regression: security MUST-FIX-2 — without the conditional UPDATE
		// guard, two concurrent appends would each read [u-founder] and write
		// back their own appended version, dropping the other.
		const { id } = createThread(["u-founder"]);
		const stale = ctx.db.select().from(threads).where(eq(threads.id, id)).get();
		if (!stale) throw new Error("thread missing");

		// Simulate a racing writer adding agent-B BEFORE we run ensureParticipant
		// with our stale snapshot.
		ctx.db
			.update(threads)
			.set({ participants: JSON.stringify(["u-founder", "agent-B"]) })
			.where(eq(threads.id, id))
			.run();

		// Now run ensureParticipant with the stale row. The conditional
		// UPDATE must miss, the helper must re-read, and append agent-A on
		// top of the racer's write.
		ensureParticipant(ctx.db, stale, "agent-A");

		const after = ctx.db.select().from(threads).where(eq(threads.id, id)).get();
		const list = JSON.parse(after?.participants ?? "[]") as string[];
		expect(list).toContain("u-founder");
		expect(list).toContain("agent-B");
		expect(list).toContain("agent-A");
	});

	it("(MUST-FIX-2 parse-error) propagates on malformed participants instead of wiping", () => {
		// Regression: security MUST-FIX-2 — the prior code silently rewrote a
		// corrupt participants column to [senderId], erasing the audit trail.
		// Now: parse errors propagate. The thread row is left intact.
		const { id } = createThread(["u-founder", "agent-A"]);
		ctx.db
			.update(threads)
			.set({ participants: "not-valid-json{" })
			.where(eq(threads.id, id))
			.run();
		const corrupt = ctx.db.select().from(threads).where(eq(threads.id, id)).get();
		if (!corrupt) throw new Error("thread missing");

		expect(() => ensureParticipant(ctx.db, corrupt, "agent-B")).toThrow();
		const after = ctx.db.select().from(threads).where(eq(threads.id, id)).get();
		expect(after?.participants).toBe("not-valid-json{");
	});
});

describe("rollbackCreatedThread", () => {
	let ctx: Ctx;
	beforeEach(() => {
		ctx = setup();
	});

	it("(F1) deletes the thread row and clears the task pin when no messages exist", () => {
		const task = ctx.db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		if (!task) throw new Error("task-1 missing");
		const ensured = ensureTaskThread(ctx.db, task, "u-founder");
		expect(ensured.created).toBe(true);

		rollbackCreatedThread(ctx.db, "task-1", ensured.threadRow.id);

		const after = ctx.db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		expect(after?.threadId).toBeNull();
		const remaining = ctx.db
			.select()
			.from(threads)
			.where(eq(threads.id, ensured.threadRow.id))
			.get();
		expect(remaining).toBeUndefined();
	});

	it("does NOT clear the task pin when it has been re-pinned to a different thread (race-safe)", () => {
		const task = ctx.db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		if (!task) throw new Error("task-1 missing");
		const ensured = ensureTaskThread(ctx.db, task, "u-founder");

		// A parallel winner re-pins to a new thread.
		const otherThreadId = "other-thread";
		const now = new Date().toISOString();
		ctx.db
			.insert(threads)
			.values({
				id: otherThreadId,
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "u-founder",
				participants: JSON.stringify(["u-founder"]),
				pinned: 0,
				lastActiveAt: now,
				createdAt: now,
			})
			.run();
		ctx.db.update(tasks).set({ threadId: otherThreadId }).where(eq(tasks.id, "task-1")).run();

		// Now we attempt to roll back our (no-longer-pinned) thread. It must
		// delete its own thread row but MUST NOT clear the now-different pin.
		rollbackCreatedThread(ctx.db, "task-1", ensured.threadRow.id);

		const after = ctx.db.select().from(tasks).where(eq(tasks.id, "task-1")).get();
		expect(after?.threadId).toBe(otherThreadId);
	});
});
