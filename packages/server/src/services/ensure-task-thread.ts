/**
 * L15 § 5.4 — lazy-thread-creation race resolution.
 *
 * Two concurrent writers can both observe `tasks.thread_id IS NULL`. The
 * conditional `UPDATE ... WHERE thread_id IS NULL` returns rowcount=0 for
 * the loser; the loser then deletes its speculative thread row in the same
 * transaction and re-reads the winner's thread. Mirrors the
 * `VerdictRaceConflict` pattern at `threads.ts:488–524`.
 *
 * @lore L15 § 5.4: conditional UPDATE on `tasks.thread_id` is the race
 * detector — single source of truth, identical on sqlite + pg, no partial
 * unique index needed.
 */

import { type HyperIdleDb, type Task, tasks, threads } from "@hyperidle/db";
import { and, eq, isNull } from "drizzle-orm";

export class TaskThreadRaceLost extends Error {
	constructor() {
		super("ensureTaskThread: another writer pinned tasks.thread_id first");
		this.name = "TaskThreadRaceLost";
	}
}

export interface EnsureTaskThreadResult {
	threadRow: typeof threads.$inferSelect;
	created: boolean;
}

export function ensureTaskThread(
	db: HyperIdleDb,
	task: Task,
	senderId: string,
): EnsureTaskThreadResult {
	if (task.threadId) {
		const existing = db.select().from(threads).where(eq(threads.id, task.threadId)).get();
		if (!existing) throw new Error(`Thread ${task.threadId} pinned on task ${task.id} not found`);
		return { threadRow: existing, created: false };
	}

	const newThreadId = crypto.randomUUID();
	const now = new Date().toISOString();

	try {
		db.transaction((tx) => {
			tx.insert(threads)
				.values({
					id: newThreadId,
					hostKind: "task",
					hostId: task.id,
					initiatorId: senderId,
					participants: JSON.stringify([senderId]),
					pinned: 0,
					lastActiveAt: now,
					createdAt: now,
				})
				.run();

			const result = tx
				.update(tasks)
				.set({ threadId: newThreadId })
				.where(and(eq(tasks.id, task.id), isNull(tasks.threadId)))
				.run();

			if ((result as { changes: number }).changes === 0) {
				tx.delete(threads).where(eq(threads.id, newThreadId)).run();
				throw new TaskThreadRaceLost();
			}
		});
	} catch (cause) {
		if (cause instanceof TaskThreadRaceLost) {
			const reread = db.select().from(tasks).where(eq(tasks.id, task.id)).get();
			if (!reread?.threadId) {
				throw new Error("ensureTaskThread: race lost but no winning thread_id present");
			}
			const winner = db.select().from(threads).where(eq(threads.id, reread.threadId)).get();
			if (!winner) throw new Error(`Winning thread ${reread.threadId} not found`);
			return { threadRow: winner, created: false };
		}
		throw cause;
	}

	const created = db.select().from(threads).where(eq(threads.id, newThreadId)).get();
	if (!created) throw new Error(`Created thread ${newThreadId} not found`);
	return { threadRow: created, created: true };
}
