/**
 * AU26 H2 (§D-M.2) — the run-stop write a bet kill cascades downward.
 *
 * `layers/core-api/work/bet-kill-cascade.ts` selected the active runs per
 * task and CAS-stopped each itself. Killing a bet must stop its runs — that is
 * a genuine core need — but the write is `run-orchestration`'s state
 * transition, so core asks for it instead of performing it.
 *
 * @lore D-46jmx6/D-bsjkae: this used to CAS-mark every active run straight to
 * `stopped` itself, taking no `EventBus`, deliberately silent — the fear was
 * `review/session-review-creator.ts` reacting to a `session_ended` it never
 * expected. That reactor no longer exists, and "killing a task goes through
 * the same abort" is now a real requirement (D-bsjkae), not a CAS-mark that
 * leaves the harness process running. This is now a thin loop over the ONE
 * stop path both doors share (`stopSessionRun`, `session-store.ts`): it takes
 * the bus and an injected `abort`, and emits ONLY on the no-live-entry path —
 * on the abort path the provisioning teardown emits, exactly as `stop_session`
 * itself does.
 *
 * @lore AU26 H2: the return value is the set of runs ACTUALLY stopped
 * (aborted or marked alike), not a count. A 0-row CAS — an already-stopped run
 * on a re-kill — stops nothing. A count could not tell the caller which runs
 * were affected.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { sessions } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import { and, eq, inArray } from "drizzle-orm";
import { stopSessionRun } from "./session-store.js";

export interface StoppedRun {
	readonly taskId: string;
	readonly sessionId: string;
}

/**
 * `db`, not `WriteExecutor` — `stopSessionRun` reads and CAS-writes the same
 * row per session (never inside a shared transaction, PGlite has one
 * connection), matching every other `session-store.ts` accessor.
 */
export async function requestRunStopForTasks(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskIds: readonly string[],
	abort: (sessionId: string) => Promise<boolean>,
): Promise<readonly StoppedRun[]> {
	if (taskIds.length === 0) return [];

	const active = await db
		.select({ id: sessions.id, taskId: sessions.taskId })
		.from(sessions)
		.where(and(inArray(sessions.taskId, [...taskIds]), eq(sessions.state, "active")));

	const stopped: StoppedRun[] = [];
	for (const run of active) {
		// `sessions.taskId` is nullable, but the predicate above already
		// constrained it to the caller's list.
		if (run.taskId === null) continue;
		const result = await stopSessionRun(db, eventBus, run.id, abort);
		if (result === "already_ended") continue;
		stopped.push({ taskId: run.taskId, sessionId: run.id });
	}
	return stopped;
}
