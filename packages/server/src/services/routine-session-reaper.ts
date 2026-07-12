import { type HyperIdleDb, sessions } from "@hyperidle/db";
import { createLogger, type EventBus } from "@hyperidle/shared";
import { and, eq, lt, sql } from "drizzle-orm";
import * as routine from "../routine-service.js";

const reaperLog = createLogger({ pkg: "server.routine-reaper" });

export interface ReapStaleRoutineSessionsOpts {
	/** A routine session active longer than this (ms) is considered stale/hung. */
	staleAfterMs: number;
	/** Override "now" (ms) for deterministic tests. */
	now?: number;
}

/**
 * AF6 §4 (R5) — finalize stale `active` routine sessions that never reached
 * endSession/crashSession (process restart mid-run, in-process adapter hang).
 *
 * A `running` routine_run + `active` routine session that is never finalized
 * makes `shouldCoalesce` true forever → the routine bricks itself. This reaper
 * marks each stale session `crashed` and its `running` routine_run `timeout`,
 * self-healing coalescing so the next scheduled fire is eligible.
 *
 * Direct DB finalize (not via session-lifecycle): after a restart there is no
 * live SessionContext / harness to tear down — the process that owned it is gone.
 * For an in-process hang there is likewise nothing in-memory worth draining.
 *
 * @lore AF6: pure-DB (db + eventBus only) so it can live in app runtime and be
 * injected into the scheduler poll loop without coupling to session provisioning.
 */
export async function reapStaleRoutineSessions(
	db: HyperIdleDb,
	_eventBus: EventBus,
	opts: ReapStaleRoutineSessionsOpts,
): Promise<number> {
	const nowMs = opts.now ?? Date.now();
	const cutoffIso = new Date(nowMs - opts.staleAfterMs).toISOString();
	const endedAt = new Date(nowMs).toISOString();

	// Stale = active routine session started before the cutoff.
	const stale = await db
		.select({ id: sessions.id, routineId: sessions.routineId })
		.from(sessions)
		.where(
			and(
				eq(sessions.state, "active"),
				sql`${sessions.routineId} is not null`,
				lt(sessions.startedAt, cutoffIso),
			),
		);

	let reaped = 0;
	for (const session of stale) {
		if (!session.routineId) continue;

		await db.update(sessions).set({ state: "crashed", endedAt }).where(eq(sessions.id, session.id));

		// Finalize the still-"running" routine_run for this routine to timeout.
		const run = await routine.findRunningRoutineRun(db, session.routineId);

		if (run) {
			await routine.updateRoutineRunById(db, run.id, {
				outcome: "timeout",
				endedAt,
				errorMessage: "Routine session reaped: stale active session finalized to timeout",
			});
		}

		reaped += 1;
	}

	if (reaped > 0) {
		reaperLog.info("reaped stale routine sessions", { reaped, staleAfterMs: opts.staleAfterMs });
	}

	return reaped;
}
