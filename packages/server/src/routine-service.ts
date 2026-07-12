/**
 * AU13: Routine service — the only module permitted to write `routines`,
 * `routine_runs`. Every call site enumerated in `.pipeline/plans/AU13.md`
 * §4d-§4e routes through one of these functions instead of a direct
 * `insert`/`update`/`delete` against the table objects.
 *
 * Mirrors `work-service.ts`'s style / `WriteExecutor` executor-first param.
 * Event emission stays at call sites (out of scope — see plan §3). The two
 * `tx.insert(threads)` writes inside `builtin-routine-handlers.ts` are
 * deferred to AU12's Conversation service (plan §6) — `threads` is not one
 * of this service's tables.
 */
import { type NewRoutine, type NewRoutineRun, routineRuns, routines } from "@hyperidle/db";
import type { SQL } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import type { WriteExecutor } from "./write-executor.js";

/** `NewRoutine` widened so a patch field may carry a raw `SQL` fragment (session-lifecycle.ts's `costActualMinor = coalesce(...) + n` accumulation). */
export type RoutinePatch = { [K in keyof NewRoutine]?: NewRoutine[K] | SQL };
/** `NewRoutineRun` widened so a patch field may carry a raw `SQL` fragment. */
export type RoutineRunPatch = { [K in keyof NewRoutineRun]?: NewRoutineRun[K] | SQL };

export interface InsertRoutineOpts {
	/** builtin-routine-handlers.ts's per-team provisioning: re-provisioning an existing team is a no-op. */
	readonly onConflictDoNothing?: boolean;
}

export async function insertRoutine(
	exec: WriteExecutor,
	values: NewRoutine,
	opts?: InsertRoutineOpts,
): Promise<void> {
	if (opts?.onConflictDoNothing) {
		await exec.insert(routines).values(values).onConflictDoNothing();
		return;
	}
	await exec.insert(routines).values(values);
}

export async function updateRoutineById(
	exec: WriteExecutor,
	id: string,
	patch: RoutinePatch,
): Promise<void> {
	await exec.update(routines).set(patch).where(eq(routines.id, id));
}

export async function insertRoutineRun(exec: WriteExecutor, values: NewRoutineRun): Promise<void> {
	await exec.insert(routineRuns).values(values);
}

/**
 * Plain by-id field-set. The "find the still-running run" SELECT + early
 * return, and any co-located sequenced write (e.g. session-lifecycle.ts's
 * routines cost-accumulation UPDATE), stay at the call site — only the
 * final `.where(eq(id, run.id))` UPDATE moves here (plan §4e "select-first,
 * update-by-id").
 */
export async function updateRoutineRunById(
	exec: WriteExecutor,
	id: string,
	patch: RoutineRunPatch,
): Promise<void> {
	await exec.update(routineRuns).set(patch).where(eq(routineRuns.id, id));
}

/**
 * In-update guard, no `.returning()` — silent no-op when the run's
 * `outcome` is not currently "running" (agent-lifecycle-projectors.ts's
 * projectRoutine).
 */
export async function updateRoutineRunIfRunning(
	exec: WriteExecutor,
	id: string,
	patch: RoutineRunPatch,
): Promise<void> {
	await exec
		.update(routineRuns)
		.set(patch)
		.where(and(eq(routineRuns.id, id), eq(routineRuns.outcome, "running")));
}
