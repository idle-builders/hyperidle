/**
 * Work service: one repository vocabulary for the owned `tasks` table.
 * Every write call site and every read call site routes through one of
 * these functions instead of a direct `insert`/`update`/`delete`/`select`
 * against the table object.
 *
 * @lore BC3 architecture.md §5 B7: `items` DROPPED, destructive, no compat
 * column — a review, a question, an escalation are messages already.
 * `WorkEntity` collapses from `"task" | "item"` to `"task"` alone, and
 * every generic `<E extends "task" | "item">` signature below loses its
 * union with it.
 *
 * Mirrors `knowledge/knowledge-repository.ts`'s style (`create`/`update`
 * functions, executor-first param), widened to accept `WriteExecutor` so
 * callers that already coordinate a multi-table write inside
 * `db.transaction(async (tx) => …)` (handoff-protocol, bet-state-machine,
 * task-state-machine, lifecycle-propagation, bet-decomposition) can join
 * this service's write into their existing transaction unchanged. Reads
 * reuse the same `WriteExecutor` type
 * (addendum §A3) so tx-scoped reads keep seeing uncommitted in-transaction
 * state.
 *
 * @lore AU13 §5.3 (design-it-twice synthesis): a single generic
 * `update*ById(exec, id, patch)` cannot express the guarded-transition /
 * silent-if-running mechanics without leaking a per-caller predicate through
 * `args` (Shape B, rejected). Each genuinely different mechanic — plain
 * by-id set, guarded CAS transition with `.returning()`, in-update silent
 * guard, bulk sweep — gets its own named function whose predicate +
 * returning-shape is fixed and internal. The same discipline applies to
 * reads: distinct predicates get distinct named functions; get-by-id
 * collapses uniformly since every caller wants the same full row.
 *
 * @lore Founder ruling (2026-07-12): zero exceptions for cross-owned-table
 * access — a cross-service join is decomposed, never allowlisted. The former
 * `findPostBetRetroItem` `items ⋈ threads` join (AU13 addendum §A2
 * "FOREIGN-IMPORT CEILING") was decomposed into `findRetroItemByThreadIds`
 * (items-only) plus a caller-side `getThreadIdsByHost` lookup in
 * conversation-store, since Conversation owns `threads`. See `searchBetsByText`
 * below for the same decompose-don't-join discipline (owned-primary query +
 * caller-side `teams` lookup). AU26 H2 (§D-M.3) closed the LAST exception: the
 * `latestSessionOutcome` correlated `sessions` subquery is deleted and
 * recomposed at `routes/bets.ts`. There are now zero foreign reads here.
 *
 * Event emission stays at call sites (out of scope — see plan §3).
 */

import { randomUUID } from "node:crypto";
import { type NewTask, taskDispatchAttempts, tasks, type WriteExecutor } from "@hyperidle/db";
import type { SQL } from "drizzle-orm";
import {
	and,
	desc,
	eq,
	exists,
	inArray,
	isNotNull,
	isNull,
	like,
	lt,
	ne,
	or,
	sql,
} from "drizzle-orm";

export type Task = typeof tasks.$inferSelect;

/** Queue-facing operations for the work-owned dispatch-attempt table. */
export const taskDispatchAttemptStore = {
	/**
	 * Record a dispatch attempt for a task and return its generated id.
	 *
	 * The ordinal is NOT a parameter: it is the count of the task's existing
	 * attempts plus one, and that rule belongs to whoever owns the table. The
	 * count and the insert run on the executor the caller passes, so a caller
	 * inside `db.transaction` sees its own uncommitted attempts in the count and
	 * its rows roll back with the rest of the handoff.
	 *
	 * `occasion` is the caller's word for why the dispatch happened, constrained
	 * only by the table's own CHECK.
	 */
	insertAttempt: async (
		exec: WriteExecutor,
		input: {
			readonly taskId: string;
			readonly occasion: string;
			readonly agentId: string;
			readonly predecessorSessionId?: string | null;
			readonly now: string;
		},
	): Promise<{ readonly id: string | undefined }> => {
		const existing = await exec
			.select({ id: taskDispatchAttempts.id })
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.taskId, input.taskId));
		const id = randomUUID();
		// §5 step 4: `.onConflictDoNothing()` — migration 0047 carries a
		// second unique index `schema.ts` does not declare
		// (`(task_id, occasion, coalesce(predecessor_session_id,''), agent_id)`),
		// and handing a task with no live session back and forth between the
		// same two agents collides on it. A swallowed conflict means no new
		// attempt row is inserted; `returning()` then yields no row.
		// @lore B1 fix: a swallowed conflict must not fabricate an id for a row
		// that was never written — the caller reads `id === undefined` as "no
		// attempt was inserted" and skips the bake and the work-intent submit.
		const inserted = await exec
			.insert(taskDispatchAttempts)
			.values({
				id,
				taskId: input.taskId,
				occasion: input.occasion,
				agentId: input.agentId,
				predecessorSessionId: input.predecessorSessionId ?? null,
				ordinal: existing.length + 1,
				status: "requested",
				createdAt: input.now,
				updatedAt: input.now,
			})
			.onConflictDoNothing()
			.returning({ id: taskDispatchAttempts.id });
		return { id: inserted[0]?.id };
	},
	get: async (exec: WriteExecutor, id: string) => {
		const [row] = await exec
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.id, id))
			.limit(1);
		return row;
	},
	/**
	 * §1/§6 row 1 — the dispatch-attempt repair. `requestId`/`sessionId`
	 * were never written in production: the only writers were `insertAttempt`
	 * (neither) and `markFailed` (neither), so `updateIfActive`'s
	 * `eq(taskDispatchAttempts.requestId, requestId)` matched zero rows,
	 * always. Called from the session-started reaction, before the
	 * `in_progress` edit, on the task's highest-ordinal `requested` row — the
	 * one the session that just started was dispatched for.
	 */
	markRunning: async (
		exec: WriteExecutor,
		input: {
			readonly taskId: string;
			readonly requestId: string;
			readonly sessionId: string;
			readonly now: string;
		},
	): Promise<void> => {
		const [row] = await exec
			.select({ id: taskDispatchAttempts.id })
			.from(taskDispatchAttempts)
			.where(
				and(
					eq(taskDispatchAttempts.taskId, input.taskId),
					eq(taskDispatchAttempts.status, "requested"),
				),
			)
			.orderBy(desc(taskDispatchAttempts.ordinal))
			.limit(1);
		if (!row) return;
		await exec
			.update(taskDispatchAttempts)
			.set({
				requestId: input.requestId,
				sessionId: input.sessionId,
				status: "running",
				updatedAt: input.now,
			})
			.where(eq(taskDispatchAttempts.id, row.id));
	},
	/**
	 * §5 step 5b — the predecessor's live session id for a handoff,
	 * read once inside `edit_task`'s own transaction, over this task-owned
	 * table only.
	 */
	findLiveSessionId: async (exec: WriteExecutor, taskId: string): Promise<string | undefined> => {
		const [row] = await exec
			.select({ sessionId: taskDispatchAttempts.sessionId })
			.from(taskDispatchAttempts)
			.where(
				and(
					eq(taskDispatchAttempts.taskId, taskId),
					isNotNull(taskDispatchAttempts.sessionId),
					inArray(taskDispatchAttempts.status, ["requested", "running"]),
				),
			)
			.orderBy(desc(taskDispatchAttempts.ordinal))
			.limit(1);
		return row?.sessionId ?? undefined;
	},
	updateIfActive: async (
		exec: WriteExecutor,
		requestId: string,
		patch: {
			readonly status: "completed" | "failed" | "cancelled";
			readonly sessionId: string | null;
		},
	) => {
		await exec
			.update(taskDispatchAttempts)
			.set({ ...patch, updatedAt: new Date().toISOString() })
			.where(
				and(
					eq(taskDispatchAttempts.requestId, requestId),
					inArray(taskDispatchAttempts.status, ["requested", "running"]),
				),
			);
	},
	/**
	 * @lore AU21 Increment 3 Wave 0 (§10 subscriber table): the `task_run`
	 * reaction to a terminal `agent_run_admission_failed` marks the attempt
	 * row failed by its OWN id — distinct from `updateIfActive` (keyed on
	 * `requestId`, which never gets assigned for a PRE-handoff failure since
	 * no `agentSessionRequests` row was ever created for this attempt).
	 */
	markFailed: async (exec: WriteExecutor, id: string) => {
		await exec
			.update(taskDispatchAttempts)
			.set({ status: "failed", updatedAt: new Date().toISOString() })
			.where(
				and(eq(taskDispatchAttempts.id, id), inArray(taskDispatchAttempts.status, ["requested"])),
			);
	},
	reapTerminal: async (exec: WriteExecutor, cutoff: string, batchSize: number) => {
		const rows = await exec
			.delete(taskDispatchAttempts)
			.where(
				and(
					inArray(taskDispatchAttempts.status, ["completed", "failed", "cancelled"]),
					lt(taskDispatchAttempts.updatedAt, cutoff),
				),
			)
			.returning({ id: taskDispatchAttempts.id });
		return Math.min(rows.length, batchSize);
	},
};
/** Internal raw update shape. Consumers use the operator-aware generic patch. */
/** `NewTask` widened so a patch field may carry a raw `SQL` fragment. */
type TaskPatch = { [K in keyof NewTask]?: NewTask[K] | SQL };

// ---------------------------------------------------------------------------
// tasks
// ---------------------------------------------------------------------------

const NOTE_SEPARATOR = "\n\n---\n\n";

// ---------------------------------------------------------------------------
// General primitives: get() and list()
//
// @lore AU20 Ag5b: collapses ~19 read exports (4 get*ById + ~14 list*/find*/
// count* + joined/enriched reads) into two discriminated primitives. Internal
// helpers above stay exported from work-service.ts (internal-package imports in
// dependency-watcher.ts / bet-state-machine.ts use them directly), but the
// barrel (index.ts) only re-exports get/list. Callers that need the old named
// functions as DI-port bindings wrap them in lambdas at the composition root.
//

/** Discriminant union of all work-owned entity kinds. */
export type WorkEntity = "task";

/** Maps each entity discriminant to its plain (non-joined) row type. */
interface WorkEntityRowMap {
	task: Task;
}

/**
 * AND-composed filter for `list()`. `count: true` short-circuits to a
 * number. `include` carries an enriched join with a CONDITIONAL return type.
 *
 * Key mapping to old functions:
 *   - `text`           → searchBetsByText (internally escapes via escapeLikePattern)
 *   - `ids`            → listBetsByIds / listTasksByIds
 *   - `teamId+status`  → listBetsByTeamAndStatus
 *   - `teamId+status+count:true` → countBetsByTeamAndStatus
 *   - `taskIds+include:"taskTitle"` → listArtifactsPage
 */
export interface WorkFilter {
	ids?: readonly string[];
	limit?: number;
	offset?: number;
	count?: true;
	include?: "taskTitle";
	// task-specific
	teamId?: string;
	text?: string;
	state?: string;
	/** The task's own `thread_id` column — every branch honours it. */
	threadId?: string;
	/** Direct children of this task. `null` selects ROOT tasks (no parent). */
	parentTaskId?: string | null;
	ownerAgentId?: string;
	dependencyId?: string;
	/**
	 * @lore BA6: opt-in only — the shared `text` branch is also `GET
	 * /api/search`'s door, and global search exists to show state (killed
	 * included), so it may not exclude `killed` unconditionally. Only the
	 * dependency picker (`GET /api/tasks?q=`) wants a corpse excluded from
	 * its candidate list, so it must ask for that explicitly.
	 */
	excludeKilled?: true;
	// artifact-specific
	taskIds?: readonly string[] | null;
	cursor?: { readonly createdAt: string; readonly id: string } | null;
}

// -- get() overloads ---------------------------------------------------------

/** Plain get-by-id — return type discriminated by entity literal. */
export function get<E extends WorkEntity>(
	exec: WriteExecutor,
	entity: E,
	id: string,
): Promise<WorkEntityRowMap[E] | undefined>;
export async function get(exec: WriteExecutor, entity: WorkEntity, id: string): Promise<unknown> {
	switch (entity) {
		case "task": {
			const [row] = await exec.select().from(tasks).where(eq(tasks.id, id)).limit(1);
			return row;
		}
	}
}

// -- list() overloads --------------------------------------------------------

/** Count entities matching the filter. */
export function list(
	exec: WriteExecutor,
	entity: WorkEntity,
	filter: WorkFilter & { count: true },
): Promise<number>;
/** Plain entity list — return type discriminated by entity literal. */
export function list<E extends WorkEntity>(
	exec: WriteExecutor,
	entity: E,
	filter?: WorkFilter,
): Promise<WorkEntityRowMap[E][]>;
export async function list(
	exec: WriteExecutor,
	entity: WorkEntity,
	filter?: WorkFilter,
): Promise<unknown> {
	const f = filter ?? {};

	// ── count short-circuit ──────────────────────────────────────────────────
	if (f.count) {
		if (entity === "task") {
			const conds: SQL[] = [];
			if (f.teamId !== undefined) conds.push(eq(tasks.teamId, f.teamId));
			if (f.state !== undefined) conds.push(eq(tasks.state, f.state));
			if (f.parentTaskId !== undefined) conds.push(parentCond(f.parentTaskId));
			const [row] = await exec
				.select({ n: sql<number>`count(*)` })
				.from(tasks)
				.where(conds.length > 0 ? and(...conds) : undefined);
			return Number(row?.n ?? 0);
		}
		return 0;
	}

	// ── enriched includes ────────────────────────────────────────────────────
	// ── task dispatches ──────────────────────────────────────────────────────
	if (entity === "task") {
		if (f.ids !== undefined) {
			if (f.ids.length === 0) return [];
			const idConds: SQL[] = [inArray(tasks.id, [...f.ids])];
			// threadId narrows here too — every branch honours it.
			if (f.threadId !== undefined) idConds.push(eq(tasks.threadId, f.threadId));
			return exec
				.select()
				.from(tasks)
				.where(and(...idConds));
		}
		if (f.dependencyId !== undefined) {
			// `state` is OPTIONAL here on purpose — the `done` watcher only
			// ever cares about `hold` dependents (pass `state: "hold"`), but the
			// `killed` watcher must find a dependent CARRYING the id in ANY
			// state (a task can be `proposed`, `accepted`, or `in_progress` while
			// still listing a since-killed dependency), so it omits `state` and
			// filters by outcome itself. Hardcoding `hold` here silently excluded
			// every non-`hold` dependent from the killed-dependency cleanup.
			const escaped = f.dependencyId.replace(/[\\%_]/g, "\\$&");
			const conds: SQL[] = [like(tasks.dependencies, `%"${escaped}"%`)];
			if (f.state !== undefined) conds.push(eq(tasks.state, f.state));
			return exec
				.select()
				.from(tasks)
				.where(and(...conds));
		}
		if (f.text !== undefined) {
			// Moved off the deleted bet dispatch. A task's searchable prose is
			// its title, description and goal — `hypothesis` is cut, and `title`
			// is a real column now rather than the first line of the description.
			const escaped = f.text.replace(/[\\%_]/g, "\\$&");
			const pattern = `%${escaped}%`;
			const rank = sql<number>`CASE WHEN ${tasks.title} ILIKE ${`${escaped}%`} ESCAPE '\\' THEN 0 WHEN ${tasks.title} ILIKE ${`% ${escaped}%`} ESCAPE '\\' THEN 1 ELSE 2 END`;
			const textConds: SQL[] = [
				or(
					sql`${tasks.title} ILIKE ${pattern} ESCAPE '\\'`,
					sql`${tasks.description} ILIKE ${pattern} ESCAPE '\\'`,
					sql`${tasks.doneCondition} ILIKE ${pattern} ESCAPE '\\'`,
				) as SQL,
			];
			// A `killed` task can never be a legitimate dependency target (see
			// `assertValidDependencies`), so the dependency picker's door opts in
			// via `excludeKilled` (see the doc on `WorkFilter`); global search
			// never sets this flag.
			if (f.excludeKilled) textConds.push(ne(tasks.state, "killed"));
			// threadId narrows here too — every branch honours it.
			if (f.threadId !== undefined) textConds.push(eq(tasks.threadId, f.threadId));
			return exec
				.select()
				.from(tasks)
				.where(and(...textConds))
				.orderBy(rank, desc(tasks.createdAt), tasks.id)
				.limit(f.limit ?? 50);
		}
		const conditions = [];
		if (f.parentTaskId !== undefined) conditions.push(parentCond(f.parentTaskId));
		if (f.state !== undefined) conditions.push(eq(tasks.state, f.state));
		if (f.ownerAgentId !== undefined) conditions.push(eq(tasks.ownerAgentId, f.ownerAgentId));
		if (f.teamId !== undefined) conditions.push(eq(tasks.teamId, f.teamId));
		if (f.threadId !== undefined) conditions.push(eq(tasks.threadId, f.threadId));
		// Siblings come back in display order, always. `position` alone is not
		// a total order (it defaults to 0 and nothing forces uniqueness), so
		// createdAt then id break ties — otherwise the tree can render in a
		// different order on two successive reads.
		const query =
			conditions.length > 0
				? exec
						.select()
						.from(tasks)
						.where(and(...conditions))
						.orderBy(tasks.position, tasks.createdAt, tasks.id)
				: exec.select().from(tasks).orderBy(tasks.position, tasks.createdAt, tasks.id);
		return f.limit !== undefined ? query.limit(f.limit) : query;
	}

	return [];
}

// ---------------------------------------------------------------------------
// Generic write primitives: create() / update() / transition()
//
// @lore AU20 Ag5c: collapses ~14 write exports (createBet/createTask/
// createItem/createArtifact/updateBetById/updateTaskById/updateItemById/
// incrementBetCost/transitionBetStatus/transitionTaskState/
// updateBetDecompositionStatusIfRunning/claimBetDecomposition/
// resolveOrphanedBetDecompositions/appendTaskNote/setArtifactPreviewIfAbsent)
// into three discriminated primitives.  Old named functions stay in this file
// for internal-package callers (bet-state-machine.ts, bet-decomposition.ts,
// task-state-machine.ts); the barrel (index.ts) only re-exports the three
// primitives.
// ---------------------------------------------------------------------------

/** Atomic append operator — translates to a SQL CASE concat with separator. */
export interface AppendNoteOp {
	readonly appendNote: string;
}

/** Task update patch: standard TaskPatch fields; notes also accepts AppendNoteOp. */
type TaskUpdatePatch = Omit<TaskPatch, "notes"> & {
	readonly notes?: TaskPatch["notes"] | AppendNoteOp;
};

/** Maps each entity discriminant to its create-values type. */
interface WorkEntityCreateMap {
	task: NewTask;
}

/** Maps each entity discriminant to its update-patch type. */
interface WorkEntityUpdatePatchMap {
	task: TaskUpdatePatch;
}

/** Guard: WHERE field = value. */
interface TransitionFieldEqualsGuard {
	readonly field: string;
	readonly equals: string;
}

/** Guard: WHERE field IS NULL. */
interface TransitionFieldIsNullGuard {
	readonly field: string;
	readonly isNull: true;
}

/** Discriminated guard for transition() WHERE clause. */
export type TransitionGuard = TransitionFieldEqualsGuard | TransitionFieldIsNullGuard;

/** Spec for a guarded CAS update. id-less form is a bulk sweep. */
export interface TransitionSpec<P = unknown> {
	readonly id?: string;
	readonly guard: TransitionGuard;
	readonly patch: P;
}

/** Maps each entity discriminant to its transition-patch type. */
interface WorkEntityTransitionPatchMap {
	task: TaskPatch;
}

export type { TaskPatch, TaskUpdatePatch };

function isNullGuard(guard: TransitionGuard): guard is TransitionFieldIsNullGuard {
	return "isNull" in guard;
}

/**
 * `parentTaskId: null` means "root tasks", not "ignore this filter". The
 * distinction matters — `undefined` is absence, `null` is a value.
 */
function parentCond(parentTaskId: string | null): SQL {
	return parentTaskId === null ? isNull(tasks.parentTaskId) : eq(tasks.parentTaskId, parentTaskId);
}

/**
 * Every descendant of `rootId`, the root itself included, nearest first.
 *
 * Recursive CTE rather than a loop of per-level queries: the tree has no depth
 * bound, so a loop would issue an unbounded number of round trips, and the two
 * callers that need this (the kill cascade and the token rollup) both need the
 * whole subtree in one consistent read.
 *
 * @lore BB1: `depth` is capped at MAX_TASK_DEPTH. A cycle is rejected at write
 * time (`assertNoCycle`), so this cap should never bind — it is here because a
 * recursive CTE that meets a cycle does not error, it spins forever, and a
 * corrupt row must not be able to hang a request.
 *
 * @lore BB1: 32 matches the cap the nested-knowledge-documents work chose for
 * its own tree. The number is arbitrary in both places; having ONE number
 * across the product's two trees is the point, so if either moves, move both.
 */
export const MAX_TASK_DEPTH = 32;

export async function listSubtreeIds(exec: WriteExecutor, rootId: string): Promise<string[]> {
	const result = (await exec.execute(sql`
		WITH RECURSIVE subtree(id, depth) AS (
			SELECT id, 0 FROM ${tasks} WHERE id = ${rootId}
			UNION ALL
			SELECT t.id, s.depth + 1
			FROM ${tasks} t
			JOIN subtree s ON t.parent_task_id = s.id
			WHERE s.depth < ${MAX_TASK_DEPTH}
		)
		SELECT id FROM subtree ORDER BY depth
	`)) as { readonly rows: ReadonlyArray<{ readonly id: string }> };
	return result.rows.map((r) => r.id);
}

/**
 * Every ancestor of `taskId`, nearest parent first, excluding the task.
 * Drives the upward completion rollup, which is no longer a single hop.
 */
export async function listAncestorIds(exec: WriteExecutor, taskId: string): Promise<string[]> {
	const result = (await exec.execute(sql`
		WITH RECURSIVE ancestors(id, parent_task_id, depth) AS (
			SELECT id, parent_task_id, 0 FROM ${tasks} WHERE id = ${taskId}
			UNION ALL
			SELECT t.id, t.parent_task_id, a.depth + 1
			FROM ${tasks} t
			JOIN ancestors a ON t.id = a.parent_task_id
			WHERE a.depth < ${MAX_TASK_DEPTH}
		)
		SELECT id FROM ancestors WHERE depth > 0 ORDER BY depth
	`)) as { readonly rows: ReadonlyArray<{ readonly id: string }> };
	return result.rows.map((r) => r.id);
}

/**
 * How many tasks this team currently has `in_progress`, at any depth.
 *
 * This is the WIP limit's live count. It replaces the stored `teams.activeBets`
 * tally, which the bet commit/complete/kill paths maintained by hand and which
 * could therefore drift from the truth. Counted inside the caller's transaction,
 * so it cannot be stale.
 */
export async function countTeamTasksInProgress(
	exec: WriteExecutor,
	teamId: string,
): Promise<number> {
	const [row] = await exec
		.select({ n: sql<number>`count(*)` })
		.from(tasks)
		.where(
			and(
				eq(tasks.teamId, teamId),
				or(
					eq(tasks.state, "in_progress"),
					// Dispatched but not yet started: a task is `accepted` from the
					// moment a session is REQUESTED until `session_started` flips it
					// to `in_progress`, and provisioning takes real time. Counting
					// only `in_progress` let N accepts in that window each observe
					// the same count, all pass the capacity check, and all become
					// `in_progress` — overshooting the limit. Work that has been
					// handed to an agent occupies a slot from the moment it is
					// handed over, not from the moment the agent answers.
					and(
						eq(tasks.state, "accepted"),
						exists(
							exec
								.select({ one: sql`1` })
								.from(taskDispatchAttempts)
								.where(
									and(
										eq(taskDispatchAttempts.taskId, tasks.id),
										eq(taskDispatchAttempts.status, "requested"),
									),
								),
						),
					),
				),
			),
		);
	return Number(row?.n ?? 0);
}

function buildTaskGuardCond(guard: TransitionGuard): SQL {
	if (guard.field === "state") {
		return isNullGuard(guard) ? isNull(tasks.state) : eq(tasks.state, guard.equals);
	}
	if (guard.field === "updatedAt") {
		return isNullGuard(guard) ? isNull(tasks.updatedAt) : eq(tasks.updatedAt, guard.equals);
	}
	throw new Error(`Unknown task field for transition guard: ${guard.field}`);
}

// -- maxSiblingPosition() -----------------------------------------------------

/**
 * Returns the current maximum `position` value among tasks with the given
 * `parentTaskId` (or among root tasks when `parentTaskId` is null).
 * Returns -1 when the sibling group is empty, so the first child gets 0.
 *
 * @lore BB1: used by POST /tasks (append) and PATCH /tasks/:id (reparent) to
 * assign the next-last position without a data race — callers that need
 * atomicity must call this INSIDE their own transaction.
 *
 * @lore BB1: `teamId` is REQUIRED, not optional. A nested task's parent already
 * implies its team, but a ROOT task's parent is null — so without the team
 * filter the "sibling group" for a root is every root task in the entire
 * install, and a new root would take its position from an unrelated team's
 * count. Making the argument mandatory means a caller cannot forget it.
 */
export async function maxSiblingPosition(
	exec: WriteExecutor,
	parentTaskId: string | null,
	teamId: string,
): Promise<number> {
	const parentCondition =
		parentTaskId === null ? isNull(tasks.parentTaskId) : eq(tasks.parentTaskId, parentTaskId);
	const [row] = await exec
		.select({ m: sql<number>`COALESCE(MAX(${tasks.position}), -1)` })
		.from(tasks)
		.where(and(parentCondition, eq(tasks.teamId, teamId)));
	return row?.m ?? -1;
}

// -- create() -----------------------------------------------------------------

/** Insert a new entity row. Discriminated by entity literal; values typed per entity. */
export async function create<E extends WorkEntity>(
	exec: WriteExecutor,
	entity: E,
	values: WorkEntityCreateMap[E],
): Promise<void> {
	switch (entity) {
		case "task":
			await exec.insert(tasks).values(values as NewTask);
			return;
	}
}

// -- update() -----------------------------------------------------------------

/**
 * Update a task row with atomic note-append (SQL CASE — no pre-read).
 * Returns `{ id }` when the row was found and updated; `undefined` when absent.
 *
 * @lore AU20 Ag5c: appendTaskNote folds into update() via { notes: AppendNoteOp }.
 */
export function update(
	exec: WriteExecutor,
	entity: "task",
	id: string,
	patch: { readonly notes: AppendNoteOp },
): Promise<{ id: string } | undefined>;
/**
 * Plain by-id field-set. (@lore AU21 Increment 14a: the `costActualMinor:
 * { increment: n }` atomic-accumulation example this used to document is
 * HARD-DELETED along with the rest of the cost feature — no field on
 * `BetUpdatePatch`/`TaskUpdatePatch` uses the `{increment}` operator anymore.)
 */
export function update<E extends "task">(
	exec: WriteExecutor,
	entity: E,
	id: string,
	patch: WorkEntityUpdatePatchMap[E],
): Promise<void>;
export async function update(
	exec: WriteExecutor,
	entity: string,
	id: string,
	patch: Record<string, unknown>,
): Promise<void | { id: string } | undefined> {
	if (entity === "task") {
		const notes = patch.notes;
		if (typeof notes === "object" && notes !== null && "appendNote" in notes) {
			const entry = (notes as AppendNoteOp).appendNote;
			const rows = await exec
				.update(tasks)
				.set({
					notes: sql`CASE WHEN ${tasks.notes} IS NULL OR ${tasks.notes} = '' THEN ${entry} ELSE ${tasks.notes} || ${NOTE_SEPARATOR} || ${entry} END`,
					updatedAt: new Date().toISOString(),
				})
				.where(eq(tasks.id, id))
				.returning({ id: tasks.id });
			return rows[0];
		}
		await exec
			.update(tasks)
			.set(patch as TaskPatch)
			.where(eq(tasks.id, id));
		return;
	}
	throw new Error(`update(): unsupported entity "${entity}"`);
}

// -- transition() -------------------------------------------------------------

/**
 * Guarded CAS update. Returns `{ applied, affected }`.
 * - `id` present → single-row guard (WHERE id = ? AND field ...)
 * - `id` absent  → bulk sweep (WHERE field ...)
 * - `guard.equals` → WHERE field = value
 * - `guard.isNull` → WHERE field IS NULL
 *
 * @lore AU20 Ag5c: replaces transitionBetStatus / transitionTaskState /
 * updateBetDecompositionStatusIfRunning / claimBetDecomposition /
 * resolveOrphanedBetDecompositions / setArtifactPreviewIfAbsent.
 */
export async function transition<E extends keyof WorkEntityTransitionPatchMap>(
	exec: WriteExecutor,
	entity: E,
	spec: TransitionSpec<WorkEntityTransitionPatchMap[E]>,
): Promise<{ applied: boolean; affected: number }> {
	let rows: { id: string }[];
	const patch = spec.patch;

	switch (entity) {
		case "task": {
			const guardCond = buildTaskGuardCond(spec.guard);
			const whereCond = spec.id !== undefined ? and(eq(tasks.id, spec.id), guardCond) : guardCond;
			rows = await exec
				.update(tasks)
				.set(patch as TaskPatch)
				.where(whereCond)
				.returning({ id: tasks.id });
			break;
		}
		default: {
			const Exhaustive: never = entity;
			throw new Error(`transition(): unsupported entity "${Exhaustive}"`);
		}
	}

	return { applied: rows.length > 0, affected: rows.length };
}
