/**
 * Work service: one repository vocabulary for all owned work entities.
 * `tasks`, `items`. Every write call site enumerated in
 * `.pipeline/plans/AU13.md` §4a-§4c, and every read call site enumerated in
 * the read-ownership addendum §A3, routes through one of these functions
 * instead of a direct `insert`/`update`/`delete`/`select` against the table
 * objects.
 *
 * Mirrors `knowledge/knowledge-repository.ts`'s style (`create`/`update`
 * functions, executor-first param), widened to accept `WriteExecutor` so
 * callers that already coordinate a multi-table write inside
 * `db.transaction(async (tx) => …)` (handoff-protocol, bet-state-machine,
 * task-state-machine, lifecycle-propagation, bet-decomposition,
 * builtin-routine-handlers) can join this service's write into their
 * existing transaction unchanged. Reads reuse the same `WriteExecutor` type
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
import {
	artifacts,
	items,
	type NewItem,
	type NewTask,
	taskDispatchAttempts,
	tasks,
	type WriteExecutor,
} from "@hyperidle/db";
import type { SQL } from "drizzle-orm";
import { and, desc, eq, inArray, isNull, like, lt, or, sql } from "drizzle-orm";

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
			readonly predecessorSessionId: string;
			readonly now: string;
		},
	): Promise<{ id: string }> => {
		const existing = await exec
			.select({ id: taskDispatchAttempts.id })
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.taskId, input.taskId));
		const id = randomUUID();
		await exec.insert(taskDispatchAttempts).values({
			id,
			taskId: input.taskId,
			occasion: input.occasion,
			agentId: input.agentId,
			predecessorSessionId: input.predecessorSessionId,
			ordinal: existing.length + 1,
			status: "requested",
			createdAt: input.now,
			updatedAt: input.now,
		});
		return { id };
	},
	get: async (exec: WriteExecutor, id: string) => {
		const [row] = await exec
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.id, id))
			.limit(1);
		return row;
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
export type Item = typeof items.$inferSelect;

/** Internal raw update shapes. Consumers use the operator-aware generic patches. */
/** `NewTask` widened so a patch field may carry a raw `SQL` fragment. */
type TaskPatch = { [K in keyof NewTask]?: NewTask[K] | SQL };
/** `NewItem` widened so a patch field may carry a raw `SQL` fragment. */
type ItemPatch = { [K in keyof NewItem]?: NewItem[K] | SQL };

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
// artifact-store read functions now accept WriteExecutor (see artifact-store.ts
// AU20 change), so get/list can call them with the same exec they receive.
// ---------------------------------------------------------------------------

import type { ArtifactRow, ArtifactWithTaskTitle, CreateArtifactInput } from "./artifact-store.js";

/** Discriminant union of all work-owned entity kinds. */
export type WorkEntity = "task" | "item" | "artifact";

/** Maps each entity discriminant to its plain (non-joined) row type. */
interface WorkEntityRowMap {
	task: Task;
	item: Item;
	artifact: ArtifactRow;
}

/**
 * AND-composed filter for `list()`. Keys are entity-specific — supply only
 * those relevant to your entity. `count: true` short-circuits to a number.
 * `include` carries an enriched join with a CONDITIONAL return type.
 *
 * Key mapping to old functions:
 *   - `text`           → searchBetsByText (internally escapes via escapeLikePattern)
 *   - `ids`            → listBetsByIds / listTasksByIds
 *   - `teamId+status`  → listBetsByTeamAndStatus
 *   - `teamId+status+count:true` → countBetsByTeamAndStatus
 *   - `threadId`       → listItemsByThread
 *   - `queued+createdSince` → listQueuedItemsSince
 *   - `marker`         → findItemByReasoningMarker (returns Item[]; take [0] for {id})
 *   - `threadIds+bodyMarker` → findRetroItemByThreadIds (take [0] for {id})
 *   - `sourceAgentId`  → items filtered by sourceAgentId (map to .id for old string[])
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
	/** BB1: direct children of this task. `null` selects ROOT tasks (no parent). */
	parentTaskId?: string | null;
	ownerAgentId?: string;
	dependencyId?: string;
	// item-specific
	threadId?: string;
	threadIds?: readonly string[];
	sourceAgentId?: string;
	/** Reasoning-field LIKE marker — maps to findItemByReasoningMarker. Take [0]. */
	marker?: string;
	/** Body-field LIKE marker — maps to findRetroItemByThreadIds. Take [0]. */
	bodyMarker?: string;
	queued?: true;
	createdSince?: string;
	// artifact-specific
	taskIds?: readonly string[] | null;
	cursor?: { readonly createdAt: string; readonly id: string } | null;
}

// -- get() overloads ---------------------------------------------------------

/** Artifact with task-title join (getArtifactWithTaskTitleById). */
export function get(
	exec: WriteExecutor,
	entity: "artifact",
	id: string,
	opts: { include: "taskTitle" },
): Promise<ArtifactWithTaskTitle | undefined>;
/** Plain get-by-id — return type discriminated by entity literal. */
export function get<E extends WorkEntity>(
	exec: WriteExecutor,
	entity: E,
	id: string,
): Promise<WorkEntityRowMap[E] | undefined>;
export async function get(
	exec: WriteExecutor,
	entity: WorkEntity,
	id: string,
	opts?: { include?: string },
): Promise<unknown> {
	switch (entity) {
		case "task": {
			const [row] = await exec.select().from(tasks).where(eq(tasks.id, id)).limit(1);
			return row;
		}
		case "item": {
			const [row] = await exec.select().from(items).where(eq(items.id, id)).limit(1);
			return row;
		}
		case "artifact":
			if (opts?.include === "taskTitle") {
				const [row] = await exec
					.select({ artifact: artifacts, taskTitle: tasks.title })
					.from(artifacts)
					.innerJoin(tasks, eq(tasks.id, artifacts.producingTaskId))
					.where(eq(artifacts.id, id))
					.limit(1);
				return row;
			}
			return (await exec.select().from(artifacts).where(eq(artifacts.id, id)).limit(1))[0];
	}
}

// -- list() overloads --------------------------------------------------------

/** Count entities matching the filter. */
export function list(
	exec: WriteExecutor,
	entity: WorkEntity,
	filter: WorkFilter & { count: true },
): Promise<number>;
/** Artifacts page join (full ArtifactWithTaskTitle shape). */
export function list(
	exec: WriteExecutor,
	entity: "artifact",
	filter: WorkFilter & { include: "taskTitle" },
): Promise<ArtifactWithTaskTitle[]>;
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
		if (entity === "item") {
			const conds: SQL[] = [];
			if (f.threadId !== undefined) conds.push(eq(items.threadId, f.threadId));
			const [row] = await exec
				.select({ n: sql<number>`count(*)` })
				.from(items)
				.where(conds.length > 0 ? and(...conds) : undefined);
			return Number(row?.n ?? 0);
		}
		return 0;
	}

	// ── enriched includes ────────────────────────────────────────────────────
	if (entity === "artifact" && f.include === "taskTitle") {
		if (f.taskIds !== null && f.taskIds !== undefined && f.taskIds.length === 0) return [];
		const conditions = [];
		if (f.taskIds !== null && f.taskIds !== undefined)
			conditions.push(inArray(artifacts.producingTaskId, [...f.taskIds]));
		if (f.cursor) {
			const cursorCondition = or(
				lt(artifacts.createdAt, f.cursor.createdAt),
				and(eq(artifacts.createdAt, f.cursor.createdAt), lt(artifacts.id, f.cursor.id)),
			);
			if (cursorCondition) conditions.push(cursorCondition);
		}
		const query = exec
			.select({ artifact: artifacts, taskTitle: tasks.title })
			.from(artifacts)
			.innerJoin(tasks, eq(tasks.id, artifacts.producingTaskId));
		return conditions.length > 0
			? query
					.where(and(...conditions))
					.orderBy(desc(artifacts.createdAt), desc(artifacts.id))
					.limit(f.limit ?? 50)
			: query.orderBy(desc(artifacts.createdAt), desc(artifacts.id)).limit(f.limit ?? 50);
	}
	// ── task dispatches ──────────────────────────────────────────────────────
	if (entity === "task") {
		if (f.ids !== undefined)
			return f.ids.length === 0
				? []
				: exec
						.select()
						.from(tasks)
						.where(inArray(tasks.id, [...f.ids]));
		if (f.dependencyId !== undefined) {
			const escaped = f.dependencyId.replace(/[\\%_]/g, "\\$&");
			return exec
				.select()
				.from(tasks)
				.where(and(eq(tasks.state, "hold"), like(tasks.dependencies, `%"${escaped}"%`)));
		}
		if (f.text !== undefined) {
			// BB1: moved off the deleted bet dispatch. A task's searchable prose is
			// its title, description and goal — `hypothesis` is cut, and `title`
			// is a real column now rather than the first line of the description.
			const escaped = f.text.replace(/[\\%_]/g, "\\$&");
			const pattern = `%${escaped}%`;
			const rank = sql<number>`CASE WHEN ${tasks.title} ILIKE ${`${escaped}%`} ESCAPE '\\' THEN 0 WHEN ${tasks.title} ILIKE ${`% ${escaped}%`} ESCAPE '\\' THEN 1 ELSE 2 END`;
			return exec
				.select()
				.from(tasks)
				.where(
					or(
						sql`${tasks.title} ILIKE ${pattern} ESCAPE '\\'`,
						sql`${tasks.description} ILIKE ${pattern} ESCAPE '\\'`,
						sql`${tasks.doneCondition} ILIKE ${pattern} ESCAPE '\\'`,
					),
				)
				.orderBy(rank, desc(tasks.createdAt), tasks.id)
				.limit(f.limit ?? 50);
		}
		const conditions = [];
		if (f.parentTaskId !== undefined) conditions.push(parentCond(f.parentTaskId));
		if (f.state !== undefined) conditions.push(eq(tasks.state, f.state));
		if (f.ownerAgentId !== undefined) conditions.push(eq(tasks.ownerAgentId, f.ownerAgentId));
		if (f.teamId !== undefined) conditions.push(eq(tasks.teamId, f.teamId));
		const query =
			conditions.length > 0
				? exec
						.select()
						.from(tasks)
						.where(and(...conditions))
				: exec.select().from(tasks);
		return f.limit !== undefined ? query.limit(f.limit) : query;
	}

	// ── item dispatches ──────────────────────────────────────────────────────
	if (entity === "item") {
		if (f.threadId !== undefined)
			return exec
				.select()
				.from(items)
				.where(eq(items.threadId, f.threadId))
				.orderBy(items.createdAt);
		if (f.queued) {
			return exec
				.select()
				.from(items)
				.where(
					and(
						like(items.auditTrail, "%policy_queued%"),
						sql`${items.createdAt} >= ${f.createdSince ?? new Date(0).toISOString()}`,
					),
				);
		}
		if (f.marker !== undefined) {
			return exec
				.select()
				.from(items)
				.where(like(items.reasoning, `%${f.marker}%`))
				.limit(1);
		}
		if (f.threadIds !== undefined) {
			if (f.threadIds.length === 0) return [];
			const conds: SQL[] = [inArray(items.threadId, Array.from(f.threadIds))];
			if (f.bodyMarker !== undefined) conds.push(like(items.body, `%${f.bodyMarker}%`));
			return exec
				.select()
				.from(items)
				.where(and(...conds))
				.limit(1);
		}
		if (f.sourceAgentId !== undefined) {
			return exec.select().from(items).where(eq(items.sourceAgentId, f.sourceAgentId));
		}
		if (f.ids !== undefined) {
			if (f.ids.length === 0) return [];
			return exec
				.select()
				.from(items)
				.where(inArray(items.id, Array.from(f.ids)));
		}
		// NOTE: bare `createdSince` without `queued:true` is intentionally absent —
		// the only real caller passes both together (hits the `f.queued` branch above).
		// A bare-createdSince path would silently bypass the policy_queued filter.
		return exec.select().from(items);
	}

	// ── artifact plain dispatches ────────────────────────────────────────────
	if (entity === "artifact") {
		if (f.taskIds !== null && f.taskIds !== undefined) {
			if (f.taskIds.length === 0) return [];
			return exec
				.select()
				.from(artifacts)
				.where(inArray(artifacts.producingTaskId, Array.from(f.taskIds)));
		}
		if (f.ids !== undefined) {
			if (f.ids.length === 0) return [];
			return exec
				.select()
				.from(artifacts)
				.where(inArray(artifacts.id, Array.from(f.ids)));
		}
		return exec.select().from(artifacts);
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

/** Item update patch: same as ItemPatch (no special operators). */
type ItemUpdatePatch = ItemPatch;

/** Maps each entity discriminant to its create-values type. */
interface WorkEntityCreateMap {
	task: NewTask;
	item: NewItem;
	artifact: CreateArtifactInput;
}

/** Maps each entity discriminant to its update-patch type (excluding artifact). */
interface WorkEntityUpdatePatchMap {
	task: TaskUpdatePatch;
	item: ItemUpdatePatch;
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

/** Maps each entity discriminant to its transition-patch type. Note: "item" is excluded — items have no guard-able state column, no transition() callers. */
interface WorkEntityTransitionPatchMap {
	task: TaskPatch;
	artifact: Partial<ArtifactRow>;
}

export type { ItemUpdatePatch, TaskPatch, TaskUpdatePatch };

function isNullGuard(guard: TransitionGuard): guard is TransitionFieldIsNullGuard {
	return "isNull" in guard;
}

/**
 * BB1: `parentTaskId: null` means "root tasks", not "ignore this filter". The
 * distinction matters — `undefined` is absence, `null` is a value.
 */
function parentCond(parentTaskId: string | null): SQL {
	return parentTaskId === null
		? isNull(tasks.parentTaskId)
		: eq(tasks.parentTaskId, parentTaskId);
}

/**
 * BB1: every descendant of `rootId`, the root itself included, nearest first.
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
 */
export const MAX_TASK_DEPTH = 100;

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
 * BB1: every ancestor of `taskId`, nearest parent first, excluding the task.
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
 * BB1: how many tasks this team currently has `in_progress`, at any depth.
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
		.where(and(eq(tasks.teamId, teamId), eq(tasks.state, "in_progress")));
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

function buildArtifactGuardCond(guard: TransitionGuard): SQL {
	if (guard.field === "previewJson") {
		return isNullGuard(guard)
			? isNull(artifacts.previewJson)
			: eq(artifacts.previewJson, guard.equals);
	}
	throw new Error(`Unknown artifact field for transition guard: ${guard.field}`);
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
		case "item":
			await exec.insert(items).values(values as NewItem);
			return;
		case "artifact":
			await exec.insert(artifacts).values(values as CreateArtifactInput);
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
 * `BetUpdatePatch`/`TaskUpdatePatch`/`ItemUpdatePatch` uses the `{increment}`
 * operator anymore.)
 */
export function update<E extends "task" | "item">(
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
	if (entity === "item") {
		await exec
			.update(items)
			.set(patch as ItemPatch)
			.where(eq(items.id, id));
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
		case "artifact": {
			const guardCond = buildArtifactGuardCond(spec.guard);
			const whereCond =
				spec.id !== undefined ? and(eq(artifacts.id, spec.id), guardCond) : guardCond;
			rows = await exec
				.update(artifacts)
				.set(patch as Partial<ArtifactRow>)
				.where(whereCond)
				.returning({ id: artifacts.id });
			break;
		}
		default: {
			const Exhaustive: never = entity;
			throw new Error(`transition(): unsupported entity "${Exhaustive}"`);
		}
	}

	return { applied: rows.length > 0, affected: rows.length };
}
