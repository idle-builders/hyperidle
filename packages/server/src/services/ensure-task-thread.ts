/**
 * L15 §5.4 — race-safe lazy thread creation for a task.
 *
 * @lore L15 §5.4 CRITICAL-2: conditional UPDATE WHERE thread_id IS NULL
 * races first-writer-wins; loser deletes its speculative thread row and
 * re-reads the winner's id. Mirrors the `VerdictRaceConflict` rowcount
 * idiom at `threads.ts:510–524`.
 */

import {
	type HyperIdleDb,
	messages as messagesTable,
	type Task as DbTask,
	type Thread as DbThread,
	tasks,
	threads,
} from "@hyperidle/db";
import { and, eq, isNull } from "drizzle-orm";
import { threadParticipantsSchema } from "../routes/threads-schema.js";

export interface EnsureTaskThreadResult {
	readonly threadRow: DbThread;
	readonly created: boolean;
}

class TaskThreadRaceLost extends Error {}

export function ensureTaskThread(
	db: HyperIdleDb,
	task: DbTask,
	senderId: string,
): EnsureTaskThreadResult {
	if (task.threadId) {
		const existing = db.select().from(threads).where(eq(threads.id, task.threadId)).get();
		if (!existing) {
			throw new Error(`Thread ${task.threadId} pinned to task ${task.id} not found`);
		}
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
				// Another writer pinned tasks.thread_id first. Roll back our
				// speculative thread row and use the winner's id.
				tx.delete(threads).where(eq(threads.id, newThreadId)).run();
				throw new TaskThreadRaceLost();
			}
		});
	} catch (cause) {
		if (cause instanceof TaskThreadRaceLost) {
			const reread = db.select().from(tasks).where(eq(tasks.id, task.id)).get();
			if (!reread?.threadId) {
				throw new Error(`Race lost but task ${task.id} has no thread_id pinned`);
			}
			const winner = db.select().from(threads).where(eq(threads.id, reread.threadId)).get();
			if (!winner) {
				throw new Error(`Race winner thread ${reread.threadId} not found`);
			}
			return { threadRow: winner, created: false };
		}
		throw cause;
	}

	const inserted = db.select().from(threads).where(eq(threads.id, newThreadId)).get();
	if (!inserted) {
		throw new Error(`Inserted thread ${newThreadId} disappeared`);
	}
	return { threadRow: inserted, created: true };
}

/**
 * Add `senderId` to the thread's participants[] if not already there.
 *
 * @lore L15 security MUST-FIX-2: read-modify-write of the JSON `participants`
 * column has a lost-update race (two concurrent senders both read [A,B,C]
 * and each write back their own append, dropping the other). The fix is a
 * conditional UPDATE pinned to the bytes we observed: `WHERE participants = <observed>`.
 * On miss we re-read and retry. Parse errors propagate as 500 (no silent
 * data wipe — the malformed-JSON branch previously rewrote the column to
 * `[senderId]` and erased the audit trail).
 *
 * Bounded retry count guards against pathological live-lock; in practice
 * better-sqlite3 serialises writers so the loop usually exits on the first
 * iteration. PG is the stress case.
 */
const ENSURE_PARTICIPANT_MAX_ATTEMPTS = 8;

export function ensureParticipant(db: HyperIdleDb, threadRow: DbThread, senderId: string): void {
	let observed = threadRow.participants;
	for (let attempt = 0; attempt < ENSURE_PARTICIPANT_MAX_ATTEMPTS; attempt++) {
		const parts = threadParticipantsSchema.parse(JSON.parse(observed));
		if (parts.includes(senderId)) return;
		const next = [...parts, senderId];
		const result = db
			.update(threads)
			.set({ participants: JSON.stringify(next) })
			.where(and(eq(threads.id, threadRow.id), eq(threads.participants, observed)))
			.run();
		if ((result as { changes: number }).changes === 1) return;
		// Lost the race; re-read and retry against the new value.
		const fresh = db.select().from(threads).where(eq(threads.id, threadRow.id)).get();
		if (!fresh) {
			throw new Error(`Thread ${threadRow.id} disappeared during participant append`);
		}
		observed = fresh.participants;
	}
	throw new Error(
		`ensureParticipant exhausted ${ENSURE_PARTICIPANT_MAX_ATTEMPTS} attempts on thread ${threadRow.id}`,
	);
}

/**
 * Roll back a thread that was created via {@link ensureTaskThread} but whose
 * subsequent message append failed. Removes the thread row AND clears
 * `tasks.thread_id` (conditional on the same id we just pinned, so a parallel
 * winner is never disturbed).
 *
 * @lore L15 adversary F1: without rollback, every 5xx/409 from
 * `appendPlainMessage` after a successful `ensureTaskThread` leaves a phantom
 * thread row pinned to the task with zero messages.
 */
export function rollbackCreatedThread(db: HyperIdleDb, taskId: string, threadId: string): void {
	db.transaction((tx) => {
		// Only rollback the pin if it still matches our speculative thread id.
		tx.update(tasks)
			.set({ threadId: null })
			.where(and(eq(tasks.id, taskId), eq(tasks.threadId, threadId)))
			.run();
		// Only delete the thread if no messages have been appended to it.
		const msgs = tx
			.select({ id: messagesTable.id })
			.from(messagesTable)
			.where(eq(messagesTable.threadId, threadId))
			.limit(1)
			.all();
		if (msgs.length === 0) {
			tx.delete(threads).where(eq(threads.id, threadId)).run();
		}
	});
}
