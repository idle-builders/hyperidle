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
 *
 * @lore AU20 Am2: collapsed 24 exports → 15. Five predicate-specific list
 * fns → `listRoutines(filter)`, two updateRun variants → `updateRoutineRun(opts?)`,
 * cost-aggregation trio → `sumRunCost({kind})`, and get-by-id renames
 * (`getRoutine`/`getRoutineRun`). The `| SQL` widening on patch types is
 * intentionally kept — `updateRoutine` is still the general setter and the
 * widening does no harm (only `incrementRoutineCost` eliminates the need for
 * callers to build coalesce SQL, but the type flexibility is harmless).
 */
import {
	type NewRoutine,
	type NewRoutineRun,
	routineRuns,
	routines,
	type WriteExecutor,
} from "@hyperidle/db";
import type { SQL } from "drizzle-orm";
import { and, asc, avg, desc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm";

export type Routine = typeof routines.$inferSelect;
export type RoutineRun = typeof routineRuns.$inferSelect;

/** `NewRoutine` widened so a patch field may carry a raw `SQL` fragment. */
export type RoutinePatch = { [K in keyof NewRoutine]?: NewRoutine[K] | SQL };
/** `NewRoutineRun` widened so a patch field may carry a raw `SQL` fragment. */
export type RoutineRunPatch = { [K in keyof NewRoutineRun]?: NewRoutineRun[K] | SQL };

// ---------------------------------------------------------------------------
// routines — writes
// ---------------------------------------------------------------------------

export async function insertRoutine(
	exec: WriteExecutor,
	values: NewRoutine,
	opts?: { readonly onConflictDoNothing?: boolean },
): Promise<void> {
	if (opts?.onConflictDoNothing) {
		await exec.insert(routines).values(values).onConflictDoNothing();
		return;
	}
	await exec.insert(routines).values(values);
}

/** Rename for old callers: keep identical semantics. */
export async function updateRoutine(
	exec: WriteExecutor,
	id: string,
	patch: RoutinePatch,
): Promise<void> {
	await exec.update(routines).set(patch).where(eq(routines.id, id));
}

/**
 * Atomically add `deltaMinor` to a routine's `costActualMinor` via
 * `coalesce(costActualMinor, 0) + delta`. Owns the coalesce SQL so the
 * `routines.costActualMinor` column ref never leaves this store. Mirrors
 * `@hyperidle/work`'s `incrementBetCost` / `@hyperidle/users`'
 * `incrementUserCost` / `@hyperidle/org`'s `incrementTeamMembersCost`.
 *
 * @lore AU19 Increment 3i: closes the coalesce-ownership gap `RoutinePatch`'s
 * own doc comment anticipated — `session-lifecycle.ts`'s
 * `updateRoutineRunOnSessionEnd` used to build this fragment itself via a raw
 * `updateRoutineById(db, routineId, { costActualMinor: sql\`...\` })` patch,
 * which required importing the `routines` table object directly (an
 * ownership violation once `session-lifecycle.ts` becomes its own Service
 * package — `routines` is this Service's `TABLE_OWNER`). Split into its own
 * call (previously part of ONE combined `updateRoutineById` patch alongside
 * `lastRunAt`/`lastRunSummary`) — the two writes were never transactional
 * with each other pre-migration either (`db`, not a shared `tx`), so this
 * does not weaken any atomicity guarantee.
 */
export async function incrementRoutineCost(
	exec: WriteExecutor,
	id: string,
	deltaMinor: number,
	currency: string,
): Promise<void> {
	await exec
		.update(routines)
		.set({
			costActualMinor: sql`coalesce(${routines.costActualMinor}, 0) + ${deltaMinor}`,
			costActualCurrency: currency,
		})
		.where(eq(routines.id, id));
}

// ---------------------------------------------------------------------------
// routines — reads
// ---------------------------------------------------------------------------

/** Full-row get-by-id. */
export async function getRoutine(exec: WriteExecutor, id: string): Promise<Routine | undefined> {
	const [row] = await exec.select().from(routines).where(eq(routines.id, id)).limit(1);
	return row;
}

/**
 * Parameterized list — every routine read is a WHERE predicate on this table.
 * `filter.teamId` scopes to a team; `filter.active` filters by the `active`
 * flag; `filter.triggerType` filters by trigger type; `filter.missingNextRunAt`
 * further requires the active + schedulable predicate (`calendar`/`heartbeat`/
 * `continuous` + `nextRunAt IS NULL`); `filter.includeDeleted` lifts the
 * default soft-delete exclusion. Ordered by `id` ASC for determinism.
 *
 * @lore AU20 Am2: replaces `listRoutines` (old `{includeDeleted?}` opts),
 * `listRoutinesByTeam`, `listActiveRoutines`, `listScheduledRoutinesMissingNextRunAt`,
 * `countRoutinesByTeam` (count via `.length`). One filter builder absorbs new
 * predicates as new `if (filter.x)` branches — the export count stays flat.
 */
export async function listRoutines(
	exec: WriteExecutor,
	filter?: {
		teamId?: string;
		active?: boolean;
		triggerType?: string;
		missingNextRunAt?: boolean;
		includeDeleted?: boolean;
	},
): Promise<Routine[]> {
	return exec
		.select()
		.from(routines)
		.where(
			and(
				filter?.includeDeleted ? undefined : isNull(routines.deletedAt),
				filter?.teamId !== undefined ? eq(routines.teamId, filter.teamId) : undefined,
				filter?.active !== undefined ? eq(routines.active, filter.active) : undefined,
				filter?.triggerType !== undefined
					? eq(routines.triggerType, filter.triggerType)
					: undefined,
				filter?.missingNextRunAt
					? and(
							inArray(routines.triggerType, ["calendar", "heartbeat", "continuous"]),
							isNull(routines.nextRunAt),
						)
					: undefined,
			),
		)
		.orderBy(asc(routines.id));
}

// ---------------------------------------------------------------------------
// routine_runs — writes
// ---------------------------------------------------------------------------

export async function insertRoutineRun(exec: WriteExecutor, values: NewRoutineRun): Promise<void> {
	await exec.insert(routineRuns).values(values);
}

/**
 * By-id field-set. When `opts.onlyIfRunning` is true the update only fires
 * when `outcome = 'running'` (silent no-op otherwise) — the race-guard flag
 * that `updateRoutineRunIfRunning` was previously a separate function for.
 *
 * @lore AU20 Am2: collapses `updateRoutineRunById` (plain set) +
 * `updateRoutineRunIfRunning` (race-guard predicate) into one method with an
 * `opts.onlyIfRunning` flag. The guard is one extra `eq(outcome,"running")`
 * leg — not a second export.
 */
export async function updateRoutineRun(
	exec: WriteExecutor,
	id: string,
	patch: RoutineRunPatch,
	opts?: { readonly onlyIfRunning?: boolean },
): Promise<void> {
	if (opts?.onlyIfRunning) {
		await exec
			.update(routineRuns)
			.set(patch)
			.where(and(eq(routineRuns.id, id), eq(routineRuns.outcome, "running")));
	} else {
		await exec.update(routineRuns).set(patch).where(eq(routineRuns.id, id));
	}
}

// ---------------------------------------------------------------------------
// routine_runs — reads
// ---------------------------------------------------------------------------

/** Full-row get-by-id. */
export async function getRoutineRun(
	exec: WriteExecutor,
	id: string,
): Promise<RoutineRun | undefined> {
	const [row] = await exec.select().from(routineRuns).where(eq(routineRuns.id, id)).limit(1);
	return row;
}

/**
 * Parameterized list. `filter.routineId` scopes to a routine; `filter.running`
 * true filters for `outcome = 'running'`; `filter.limit` caps result count;
 * `filter.order` is `'asc'`/`'desc'` by `startedAt` (default `desc`).
 *
 * The "find the running run" pattern is `listRoutineRuns({routineId, running:true, limit:1})[0]`.
 *
 * @lore AU20 Am2: replaces `listRoutineRunsByRoutine` +
 * `findRunningRoutineRun`. The latter is just `{running:true,limit:1}[0]`.
 */
export async function listRoutineRuns(
	exec: WriteExecutor,
	filter?: {
		routineId?: string;
		running?: boolean;
		limit?: number;
		order?: "asc" | "desc";
	},
): Promise<RoutineRun[]> {
	const orderExpr =
		filter?.order === "asc" ? asc(routineRuns.startedAt) : desc(routineRuns.startedAt);

	const q = exec
		.select()
		.from(routineRuns)
		.where(
			and(
				filter?.routineId !== undefined ? eq(routineRuns.routineId, filter.routineId) : undefined,
				filter?.running === true ? eq(routineRuns.outcome, "running") : undefined,
			),
		)
		.orderBy(orderExpr);

	if (filter?.limit !== undefined) {
		return q.limit(filter.limit);
	}
	return q;
}

// ---------------------------------------------------------------------------
// cost aggregation
// ---------------------------------------------------------------------------

/**
 * Unified run-cost aggregator. `kind: 'sum'` returns `coalesce(sum(costMinor), 0)`
 * over all runs in `routineIds` (optionally bounded by `since`); returns `0`
 * when `routineIds` is empty. `kind: 'avg'` returns `round(avg(costMinor))`
 * over runs with `costMinor > 0`; returns `null` when no cost-bearing runs
 * exist.
 *
 * @lore AU20 Am2: collapses `avgRoutineRunCost`, `sumRoutineRunCostSince`,
 * `sumRoutineRunCostForRoutinesSince` into one parameterized query. All three
 * were `aggregate(costMinor) over runs where routineId in (…) [and startedAt >= since]`;
 * `kind` picks the aggregation, `since` is now optional on both.
 */
export async function sumRunCost(
	exec: WriteExecutor,
	query: { routineIds: readonly string[]; since?: string; kind: "sum" },
): Promise<number>;
export async function sumRunCost(
	exec: WriteExecutor,
	query: { routineIds: readonly string[]; since?: string; kind: "avg" },
): Promise<number | null>;
export async function sumRunCost(
	exec: WriteExecutor,
	query: { routineIds: readonly string[]; since?: string; kind: "sum" | "avg" },
): Promise<number | null> {
	if (query.routineIds.length === 0) return 0;

	const whereClause = and(
		inArray(routineRuns.routineId, Array.from(query.routineIds)),
		query.since !== undefined ? gte(routineRuns.startedAt, query.since) : undefined,
		query.kind === "avg" ? gt(routineRuns.costMinor, 0) : undefined,
	);

	if (query.kind === "avg") {
		const [row] = await exec
			.select({ result: avg(routineRuns.costMinor) })
			.from(routineRuns)
			.where(whereClause);
		return row?.result != null ? Math.round(Number(row.result)) : null;
	}

	const [row] = await exec
		.select({ result: sql<number>`coalesce(sum(${routineRuns.costMinor}), 0)` })
		.from(routineRuns)
		.where(whereClause)
		.limit(1);
	return row?.result ?? 0;
}
