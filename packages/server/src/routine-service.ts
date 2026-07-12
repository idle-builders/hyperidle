/**
 * AU13: Routine service — the only module permitted to read or write
 * `routines`, `routine_runs`. Every write call site enumerated in
 * `.pipeline/plans/AU13.md` §4d-§4e, and every read call site enumerated in
 * the read-ownership addendum §A3, routes through one of these functions
 * instead of a direct `insert`/`update`/`delete`/`select` against the table
 * objects.
 *
 * Mirrors `work-service.ts`'s style / `WriteExecutor` executor-first param
 * (reused for reads too — addendum §A3, no separate `ReadExecutor`).
 * Event emission stays at call sites (out of scope — see plan §3). The two
 * `tx.insert(threads)` writes inside `builtin-routine-handlers.ts` are
 * deferred to AU12's Conversation service (plan §6) — `threads` is not one
 * of this service's tables.
 *
 * @lore AU13 addendum §A2/A9: this file imports ZERO foreign tables for
 * reads (unlike `work-service.ts`, which owns the two sanctioned
 * foreign-import functions). Keep it that way — a routine read that appears
 * to need a foreign join should route the foreign lookup through the
 * caller instead (see `work-service.ts`'s `searchBetsByText` for the
 * pattern), not import a table here.
 */
import { type NewRoutine, type NewRoutineRun, routineRuns, routines } from "@hyperidle/db";
import type { SQL } from "drizzle-orm";
import { and, asc, avg, desc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";
import type { WriteExecutor } from "./write-executor.js";

export type Routine = typeof routines.$inferSelect;
export type RoutineRun = typeof routineRuns.$inferSelect;

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

// ---------------------------------------------------------------------------
// reads — routines
// ---------------------------------------------------------------------------

/** Full-row get-by-id. Collapses 8+ sites (plan addendum §A3). */
export async function getRoutineById(
	exec: WriteExecutor,
	id: string,
): Promise<Routine | undefined> {
	const [row] = await exec.select().from(routines).where(eq(routines.id, id)).limit(1);
	return row;
}

/**
 * `routines-routes.ts:175` (not-deleted, no opts) / `plugin-configuration.ts:407`
 * (all routines, `includeDeleted:true`).
 */
export async function listRoutines(
	exec: WriteExecutor,
	opts?: { includeDeleted?: boolean },
): Promise<Routine[]> {
	if (opts?.includeDeleted) {
		return exec.select().from(routines);
	}
	return exec.select().from(routines).where(isNull(routines.deletedAt));
}

/**
 * `teams-routes.ts:929-933` — routines for a team, excluding soft-deleted,
 * ordered by `id` ascending (the sole call site's exact shape).
 */
export async function listRoutinesByTeam(exec: WriteExecutor, teamId: string): Promise<Routine[]> {
	return exec
		.select()
		.from(routines)
		.where(and(eq(routines.teamId, teamId), isNull(routines.deletedAt)))
		.orderBy(routines.id);
}

/**
 * `routine-scheduler.ts:480` (`triggerType:"event"`) / `routine-scheduler.ts:580`
 * (no filter — every active routine in the poll loop).
 */
export async function listActiveRoutines(
	exec: WriteExecutor,
	opts?: { triggerType?: string },
): Promise<Routine[]> {
	if (opts?.triggerType !== undefined) {
		return exec
			.select()
			.from(routines)
			.where(and(eq(routines.triggerType, opts.triggerType), eq(routines.active, true)));
	}
	return exec.select().from(routines).where(eq(routines.active, true));
}

/**
 * `routine-scheduler.ts:528-539` (`backfillMissingNextRunAt`) — active,
 * schedulable (calendar/heartbeat/continuous), missing `nextRunAt`. Distinct
 * predicate from `listActiveRoutines` (extra `inArray` + `isNull` legs), so
 * it gets its own named function per plan §5.3's synthesis rule.
 */
export async function listScheduledRoutinesMissingNextRunAt(
	exec: WriteExecutor,
): Promise<Routine[]> {
	return exec
		.select()
		.from(routines)
		.where(
			and(
				eq(routines.active, true),
				inArray(routines.triggerType, ["calendar", "heartbeat", "continuous"]),
				isNull(routines.nextRunAt),
			),
		);
}

/**
 * `teams-routes.ts:260-264` — exact predicate
 * `and(eq(routines.teamId, teamId), isNull(routines.deletedAt))`. Soft-deleted
 * routines are EXCLUDED.
 */
export async function countRoutinesByTeam(exec: WriteExecutor, teamId: string): Promise<number> {
	const [row] = await exec
		.select({ count: sql<number>`count(*)` })
		.from(routines)
		.where(and(eq(routines.teamId, teamId), isNull(routines.deletedAt)));
	return Number(row?.count ?? 0);
}

// ---------------------------------------------------------------------------
// reads — routineRuns
// ---------------------------------------------------------------------------

/** Full-row get-by-id. `agent-work-intent-worker.ts:198-203`. */
export async function getRoutineRunById(
	exec: WriteExecutor,
	id: string,
): Promise<RoutineRun | undefined> {
	const [row] = await exec.select().from(routineRuns).where(eq(routineRuns.id, id)).limit(1);
	return row;
}

/**
 * `session-lifecycle.ts:237`, `routine-session-reaper.ts:61` — the write-era
 * "select-first" read now lives in the service; the early-return + any
 * co-located sequenced write STAY at the call site (plan addendum §A3).
 * Exact predicate: `and(eq(routineId), eq(outcome,"running"))`.
 */
export async function findRunningRoutineRun(
	exec: WriteExecutor,
	routineId: string,
): Promise<{ id: string } | undefined> {
	const [row] = await exec
		.select({ id: routineRuns.id })
		.from(routineRuns)
		.where(and(eq(routineRuns.routineId, routineId), eq(routineRuns.outcome, "running")))
		.limit(1);
	return row;
}

/**
 * `routines-routes.ts:219-226` (`limit:20, order:"desc"`) /
 * `teams-routes.ts:977-985` (`limit:1, order:"desc"` — latest run).
 */
export async function listRoutineRunsByRoutine(
	exec: WriteExecutor,
	routineId: string,
	opts?: { limit?: number; order?: "asc" | "desc" },
): Promise<RoutineRun[]> {
	const orderExpr =
		opts?.order === "asc" ? asc(routineRuns.startedAt) : desc(routineRuns.startedAt);
	if (opts?.limit !== undefined) {
		return exec
			.select()
			.from(routineRuns)
			.where(eq(routineRuns.routineId, routineId))
			.orderBy(orderExpr)
			.limit(opts.limit);
	}
	return exec
		.select()
		.from(routineRuns)
		.where(eq(routineRuns.routineId, routineId))
		.orderBy(orderExpr);
}

/**
 * `routines-routes.ts:243-248`, `routine-scheduler.ts:329-340`
 * (`getRoutineMonthlySpend`) — exact predicate
 * `and(eq(routineId), gte(startedAt, since))`.
 */
export async function sumRoutineRunCostSince(
	exec: WriteExecutor,
	routineId: string,
	since: string,
): Promise<number> {
	const [row] = await exec
		.select({ total: sql<number>`coalesce(sum(${routineRuns.costMinor}), 0)` })
		.from(routineRuns)
		.where(and(eq(routineRuns.routineId, routineId), gte(routineRuns.startedAt, since)))
		.limit(1);
	return row?.total ?? 0;
}

/**
 * `routines-routes.ts:236-240` — exact predicate
 * `and(eq(routineId), gt(costMinor, 0))`, averaged.
 */
export async function avgRoutineRunCost(
	exec: WriteExecutor,
	routineId: string,
): Promise<number | null> {
	const [row] = await exec
		.select({ avg: avg(routineRuns.costMinor) })
		.from(routineRuns)
		.where(and(eq(routineRuns.routineId, routineId), gt(routineRuns.costMinor, 0)));
	return row?.avg != null ? Math.round(Number(row.avg)) : null;
}

/**
 * `teams-routes.ts:936-957` — exact predicate
 * `and(inArray(routineId, routineIds), gte(startedAt, since))`.
 */
export async function sumRoutineRunCostForRoutinesSince(
	exec: WriteExecutor,
	routineIds: readonly string[],
	since: string,
): Promise<number> {
	if (routineIds.length === 0) return 0;
	const [row] = await exec
		.select({ total: sql<number>`coalesce(sum(${routineRuns.costMinor}), 0)` })
		.from(routineRuns)
		.where(
			and(
				inArray(routineRuns.routineId, Array.from(routineIds)),
				gte(routineRuns.startedAt, since),
			),
		)
		.limit(1);
	return row?.total ?? 0;
}
