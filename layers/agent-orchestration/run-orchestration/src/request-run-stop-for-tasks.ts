/**
 * AU26 H2 (§D-M.2) — the run-stop write a bet kill cascades downward.
 *
 * `layers/core-api/work/bet-kill-cascade.ts` selected the active runs per
 * task and CAS-stopped each itself. Killing a bet must stop its runs — that is
 * a genuine core need — but the write is `run-orchestration`'s state
 * transition, so core asks for it instead of performing it.
 *
 * @lore AU26 H2: no `session_ended` is emitted, and the decision lives here now
 * rather than in `work`. The upward propagation engine only acts on
 * `outcome:'completed'` so it would ignore the event anyway, but emitting could
 * trip unrelated handlers (`review/session-review-creator.ts` creates a review
 * item on it). This function takes no `EventBus`, so the suppression is
 * structural rather than a comment someone must keep honouring.
 *
 * @lore AU26 H2: the return value is the set of runs ACTUALLY stopped, not a
 * count. A 0-row CAS — an already-stopped run on a re-kill — stops nothing.
 * A count could not tell the caller which runs were affected.
 */

import { sessions, type WriteExecutor } from "@hyperidle/db";
import { and, eq, inArray } from "drizzle-orm";

/** The terminal disposition each stop reason writes. */
const STOP_DISPOSITIONS = {
	bet_killed: { state: "stopped", outcome: "stopped" },
} as const;

export interface StoppedRun {
	readonly taskId: string;
	readonly sessionId: string;
}

export async function requestRunStopForTasks(
	exec: WriteExecutor,
	taskIds: readonly string[],
	opts: { reason: keyof typeof STOP_DISPOSITIONS },
): Promise<readonly StoppedRun[]> {
	if (taskIds.length === 0) return [];
	const disposition = STOP_DISPOSITIONS[opts.reason];

	const active = await exec
		.select({ id: sessions.id, taskId: sessions.taskId })
		.from(sessions)
		.where(and(inArray(sessions.taskId, [...taskIds]), eq(sessions.state, "active")));

	const stopped: StoppedRun[] = [];
	for (const run of active) {
		// `sessions.taskId` is nullable, but the predicate above already
		// constrained it to the caller's list.
		if (run.taskId === null) continue;
		const now = new Date().toISOString();
		const updated = await exec
			.update(sessions)
			.set({ ...disposition, endedAt: now })
			.where(and(eq(sessions.id, run.id), eq(sessions.state, "active")))
			.returning({ id: sessions.id });
		if (updated.length === 0) continue;
		stopped.push({ taskId: run.taskId, sessionId: run.id });
	}
	return stopped;
}
