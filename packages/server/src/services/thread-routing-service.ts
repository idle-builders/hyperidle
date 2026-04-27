/**
 * L2 — Thread routing service. Atomically updates `routed_to_actor_id`
 * and writes one `thread_routing_audit` row in a single transaction.
 *
 * Self-reassign (when `from === to`) is a 200 no-op: no thread update,
 * no audit row written. See L2 review (adversary W4): the prior choice
 * to always write an audit row produced unbounded "I poked my own
 * thread" entries with no state change. We prefer noise-free history.
 *
 * @lore L2: never UPDATE or DELETE rows in `thread_routing_audit`. The
 * append-only invariant is regression-tested by a static-source grep
 * in `__tests__/thread-routing-service.test.ts` (matching the L1
 * `autonomy-service.test.ts` pattern).
 *
 * @lore L2 review (W1/C2): wraps writes in `.transaction(fn,
 * { behavior: 'immediate' })` so concurrent reassigns serialise on
 * better-sqlite3 (default DEFERRED leaves a TOCTOU window between the
 * SELECT and the INSERT). PG default isolation is sufficient.
 */
import { type HyperIdleDb, type Thread, threadRoutingAudit, threads } from "@hyperidle/db";
import { eq } from "drizzle-orm";

export interface ReassignThreadInput {
	threadId: string;
	toActorId: string | null;
	reason: string;
	changedBy: string;
}

export interface ReassignThreadAudit {
	auditId: string;
	fromActorId: string | null;
	toActorId: string | null;
	at: string;
}

export type ReassignThreadResult =
	| { ok: true; thread: Thread; audit: ReassignThreadAudit | null }
	| { ok: false; reason: "thread_not_found" };

export function reassignThread(db: HyperIdleDb, input: ReassignThreadInput): ReassignThreadResult {
	const at = new Date().toISOString();
	const auditId = crypto.randomUUID();

	return db.transaction(
		(tx) => {
			const existing = tx.select().from(threads).where(eq(threads.id, input.threadId)).get();
			if (!existing) {
				return { ok: false as const, reason: "thread_not_found" as const };
			}
			const fromActorId = existing.routedToActorId ?? null;

			// Self-reassign is a 200 no-op. No thread update, no audit row.
			if (fromActorId === input.toActorId) {
				return {
					ok: true as const,
					thread: existing,
					audit: null,
				};
			}

			tx.update(threads)
				.set({ routedToActorId: input.toActorId })
				.where(eq(threads.id, input.threadId))
				.run();

			tx.insert(threadRoutingAudit)
				.values({
					id: auditId,
					threadId: input.threadId,
					fromActorId,
					toActorId: input.toActorId,
					reason: input.reason,
					changedBy: input.changedBy,
					at,
				})
				.run();

			const updated = tx.select().from(threads).where(eq(threads.id, input.threadId)).get();
			// `updated` is guaranteed non-null: we just confirmed `existing`
			// and updated it within the same transaction.
			if (!updated) {
				throw new Error(`reassignThread: thread vanished mid-transaction: ${input.threadId}`);
			}

			return {
				ok: true as const,
				thread: updated,
				audit: { auditId, fromActorId, toActorId: input.toActorId, at },
			};
		},
		{ behavior: "immediate" },
	);
}
