/**
 * AU13: Work service — the only module permitted to read or write `bets`,
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
 * conversation-store, since Conversation owns `threads`. The one remaining
 * foreign read here (`listBetTasksWithLatestSessionOutcome` imports
 * `sessions`) predates and is unaffected by this ruling. See `searchBetsByText`
 * below for the same decompose-don't-join discipline (owned-primary query +
 * caller-side `teams` lookup).
 *
 * Event emission stays at call sites (out of scope — see plan §3).
 */
import {
	bets,
	items,
	type NewBet,
	type NewItem,
	type NewTask,
	sessions,
	tasks,
	type WriteExecutor,
} from "@hyperidle/db";
import type { SQL } from "drizzle-orm";
import { and, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";

export type Bet = typeof bets.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Item = typeof items.$inferSelect;

/** `NewBet` widened so a patch field may carry a raw `SQL` fragment (cost-cap.ts's atomic `coalesce(...)` accumulation). */
export type BetPatch = { [K in keyof NewBet]?: NewBet[K] | SQL };
/** `NewTask` widened so a patch field may carry a raw `SQL` fragment. */
export type TaskPatch = { [K in keyof NewTask]?: NewTask[K] | SQL };
/** `NewItem` widened so a patch field may carry a raw `SQL` fragment. */
export type ItemPatch = { [K in keyof NewItem]?: NewItem[K] | SQL };

// ---------------------------------------------------------------------------
// bets
// ---------------------------------------------------------------------------

export async function createBet(exec: WriteExecutor, values: NewBet): Promise<void> {
	await exec.insert(bets).values(values);
}

export async function updateBetById(
	exec: WriteExecutor,
	id: string,
	patch: BetPatch,
): Promise<void> {
	await exec.update(bets).set(patch).where(eq(bets.id, id));
}

/**
 * Atomically add `deltaMinor` to a bet's `costActualMinor` via
 * `coalesce(costActualMinor, 0) + delta`. Owns the coalesce SQL so the
 * `bets.costActualMinor` column ref never leaves this store. Mirrors
 * `@hyperidle/users`' `incrementUserCost` / `@hyperidle/org`'s
 * `incrementTeamMembersCost`.
 *
 * @lore AU19 Increment 3g: the concrete write-side counterpart `cost`'s
 * `CostWorkAccessor` port (Mechanism C) wires to — `cost-cap.ts`'s
 * `recordCostAndCheck` used to build this `coalesce(...)` SQL fragment
 * itself via a raw `updateBetById(db, betId, { costActualMinor: sql\`...\` })`
 * patch, which required importing the `bets` table object directly (an
 * ownership violation once `cost-cap.ts` becomes its own Service package —
 * `bets` is `work`'s `TABLE_OWNER`).
 */
export async function incrementBetCost(
	exec: WriteExecutor,
	id: string,
	deltaMinor: number,
	currency: string,
): Promise<void> {
	await exec
		.update(bets)
		.set({
			costActualMinor: sql`coalesce(${bets.costActualMinor}, 0) + ${deltaMinor}`,
			costActualCurrency: currency,
		})
		.where(eq(bets.id, id));
}

export interface TransitionBetStatusArgs {
	readonly betId: string;
	readonly fromStatus: string;
	readonly patch: BetPatch;
}

/**
 * Guarded CAS status transition: `where(and(eq(id), eq(status, fromStatus)))
 * .returning({id})`. Returns `{applied}` — never throws itself. Callers
 * (`bet-state-machine.ts`, `lifecycle-propagation.ts`) throw their own
 * (different) error type when `applied` is false — preserved at the call
 * site, not duplicated here.
 */
export async function transitionBetStatus(
	exec: WriteExecutor,
	args: TransitionBetStatusArgs,
): Promise<{ applied: boolean }> {
	const rows = await exec
		.update(bets)
		.set(args.patch)
		.where(and(eq(bets.id, args.betId), eq(bets.status, args.fromStatus)))
		.returning({ id: bets.id });
	return { applied: rows.length > 0 };
}

/**
 * In-update guard, no `.returning()` — silent no-op when the bet's
 * `decompositionStatus` is not currently "running" (agent-lifecycle-
 * projectors.ts's projectDecomposition).
 */
export async function updateBetDecompositionStatusIfRunning(
	exec: WriteExecutor,
	id: string,
	patch: BetPatch,
): Promise<void> {
	await exec
		.update(bets)
		.set(patch)
		.where(and(eq(bets.id, id), eq(bets.decompositionStatus, "running")));
}

/**
 * Boot-time crash-recovery bulk sweep (bet-decomposition.ts's
 * `resolveOrphanedDecompositions`): every bet with `decompositionStatus =
 * "running"` is an orphan (the in-process turn died with a prior process) —
 * flip all of them to blocked/failed in one statement. Returns the affected
 * row count.
 *
 * @lore AU13 CONFUSION: the architecture plan (§4a) classified this call
 * site as a plain `updateBetById` (by-id) mechanic. The real code
 * (`bet-decomposition.ts` pre-migration) updates ALL rows matching
 * `decompositionStatus = "running"` — a bulk sweep, not addressed by id.
 * That is a distinct mechanic (no id, `.returning()` used only to count
 * affected rows, not to guard/throw), so it gets its own named function per
 * §5.3's synthesis rule rather than being forced through `updateBetById`.
 */
export async function resolveOrphanedBetDecompositions(exec: WriteExecutor): Promise<number> {
	const result = await exec
		.update(bets)
		.set({ decompositionStatus: "blocked", decompositionBlockerReason: "failed" })
		.where(eq(bets.decompositionStatus, "running"))
		.returning({ id: bets.id });
	return result.length;
}

/**
 * Guarded claim (NULL -> "running"): `where(and(eq(id),
 * isNull(decompositionStatus))).returning({id})`. Returns `{claimed}` — the
 * caller (`bet-decomposition.ts`) early-returns (no throw) when the claim is
 * lost to a concurrent decomposition attempt on the same bet.
 *
 * @lore AU13 CONFUSION: the architecture plan (§4a) classified
 * `bet-decomposition.ts:425` as a plain `updateBetById` (by-id) mechanic.
 * The real code guards on `isNull(decompositionStatus)` with `.returning()`
 * used to detect claim success — a genuinely different mechanic from a
 * plain field-set update, so it gets its own named function per §5.3's
 * synthesis rule (mirrors `updateBetDecompositionStatusIfRunning`'s guard
 * shape, but this one needs `.returning()` because the caller branches on
 * claim success instead of firing a silent no-op).
 */
export async function claimBetDecomposition(
	exec: WriteExecutor,
	betId: string,
): Promise<{ claimed: boolean }> {
	const rows = await exec
		.update(bets)
		.set({ decompositionStatus: "running" })
		.where(and(eq(bets.id, betId), isNull(bets.decompositionStatus)))
		.returning({ id: bets.id });
	return { claimed: rows.length > 0 };
}

// ---------------------------------------------------------------------------
// tasks
// ---------------------------------------------------------------------------

const NOTE_SEPARATOR = "\n\n---\n\n";

/**
 * Atomically appends `entry` to `tasks.notes`, separated by {@link NOTE_SEPARATOR},
 * using a single UPDATE with a SQL CASE expression that references the live
 * column value — no pre-read, no CAS, no lost-update race.
 *
 * Mirrors `incrementBetCost`'s atomic-write idiom (sql`coalesce(...)` accumulation
 * in one UPDATE). Returns `{ id }` when the row exists and was updated, `undefined`
 * when no row matches (task not found).
 *
 * @lore AU20 I0a: the old `log_task` path did getTaskById → concat in memory →
 * updateTaskById. Two concurrent callers both read notes=null, then the second
 * write clobbered the first. Proven red by the integration test's Promise.all
 * concurrency probe before this fix landed. The SQL CASE runs the concatenation
 * inside the DB engine atomically, so concurrent callers see each other's writes.
 */
export async function appendTaskNote(
	exec: WriteExecutor,
	taskId: string,
	entry: string,
): Promise<{ id: string } | undefined> {
	const now = new Date().toISOString();
	const rows = await exec
		.update(tasks)
		.set({
			notes: sql`CASE WHEN ${tasks.notes} IS NULL OR ${tasks.notes} = '' THEN ${entry} ELSE ${tasks.notes} || ${NOTE_SEPARATOR} || ${entry} END`,
			updatedAt: now,
		})
		.where(eq(tasks.id, taskId))
		.returning({ id: tasks.id });
	return rows[0];
}

export async function createTask(exec: WriteExecutor, values: NewTask): Promise<void> {
	await exec.insert(tasks).values(values);
}

export async function updateTaskById(
	exec: WriteExecutor,
	id: string,
	patch: TaskPatch,
): Promise<void> {
	await exec.update(tasks).set(patch).where(eq(tasks.id, id));
}

export interface TransitionTaskStateArgs {
	readonly taskId: string;
	readonly fromState: string;
	readonly patch: TaskPatch;
}

/**
 * Guarded CAS state transition: `where(and(eq(id), eq(state, fromState)))
 * .returning({id})`. Returns `{applied}` — never throws itself. Callers
 * (`task-state-machine.ts`, `lifecycle-propagation.ts`) throw their own
 * error on `!applied`.
 */
export async function transitionTaskState(
	exec: WriteExecutor,
	args: TransitionTaskStateArgs,
): Promise<{ applied: boolean }> {
	const rows = await exec
		.update(tasks)
		.set(args.patch)
		.where(and(eq(tasks.id, args.taskId), eq(tasks.state, args.fromState)))
		.returning({ id: tasks.id });
	return { applied: rows.length > 0 };
}

// ---------------------------------------------------------------------------
// items
// ---------------------------------------------------------------------------

export async function createItem(exec: WriteExecutor, values: NewItem): Promise<void> {
	await exec.insert(items).values(values);
}

export async function updateItemById(
	exec: WriteExecutor,
	id: string,
	patch: ItemPatch,
): Promise<void> {
	await exec.update(items).set(patch).where(eq(items.id, id));
}

// ---------------------------------------------------------------------------
// reads — bets
// ---------------------------------------------------------------------------

/** Full-row get-by-id. Collapses ~31 sites (plan addendum §A3). */
export async function getBetById(exec: WriteExecutor, id: string): Promise<Bet | undefined> {
	const [row] = await exec.select().from(bets).where(eq(bets.id, id)).limit(1);
	return row;
}

/**
 * `routes/bets.ts:370,396` — unfiltered list; optional limit/offset for the
 * paginated `GET /bets` route (`bets.ts:396`'s canvas route passes no opts —
 * every row). Both `limit` and `offset` are always supplied together at the
 * one call site that uses them, so a paired branch (rather than a fully
 * dynamic builder) mirrors the real shapes exactly.
 */
export async function listBets(
	exec: WriteExecutor,
	opts?: { limit?: number; offset?: number },
): Promise<Bet[]> {
	if (opts?.limit !== undefined && opts?.offset !== undefined) {
		return exec.select().from(bets).limit(opts.limit).offset(opts.offset);
	}
	return exec.select().from(bets);
}

/**
 * `teams-routes.ts:230-233,885` — bets scoped to a team + status, exact
 * predicate `and(eq(bets.teamId, teamId), eq(bets.status, status))`.
 */
export async function listBetsByTeamAndStatus(
	exec: WriteExecutor,
	teamId: string,
	status: string,
): Promise<Bet[]> {
	return exec
		.select()
		.from(bets)
		.where(and(eq(bets.teamId, teamId), eq(bets.status, status)));
}

/**
 * `teams-routes.ts:215,221` — exact predicate
 * `and(eq(bets.teamId, teamId), eq(bets.status, status))`, count only.
 */
export async function countBetsByTeamAndStatus(
	exec: WriteExecutor,
	teamId: string,
	status: string,
): Promise<number> {
	const [row] = await exec
		.select({ count: sql<number>`count(*)` })
		.from(bets)
		.where(and(eq(bets.teamId, teamId), eq(bets.status, status)));
	return Number(row?.count ?? 0);
}

/**
 * `routes/threads.ts:428` (`resolveThreadTitles` batched title resolver) —
 * `where(inArray(bets.id, ids))`. Mirrors `listTasksByIds`'s empty-ids
 * short-circuit (an empty `inArray` errors in some dialects).
 */
export async function listBetsByIds(exec: WriteExecutor, ids: readonly string[]): Promise<Bet[]> {
	if (ids.length === 0) return [];
	return exec
		.select()
		.from(bets)
		.where(inArray(bets.id, Array.from(ids)));
}

/**
 * `routes/search.ts` global search — bets-primary text search across
 * description/hypothesis/doneCondition, ranked by prefix/substring match on
 * `description`, ordered `matchRank ASC, createdAt DESC, id ASC`.
 *
 * @lore AU13 CONFUSION: the real site also `.innerJoin(teams, …)` for the
 * team name. Routing the join in would require a THIRD foreign-table import
 * (past the two-function ceiling — addendum §A2/§A9). Resolved instead by
 * keeping this function bets-only (no foreign import) and having the caller
 * (`routes/search.ts`) do a SEPARATE `teams` lookup for the returned bet ids.
 * Same result set, same order, same values — only the SQL mechanics (JOIN
 * vs. app-level map) differ, which is unobservable to the caller.
 *
 * @lore AU19 Increment 3 (teams table-ownership remediation, 2026-07-15
 * founder ruling): the above previously read "`teams` is not one of the five
 * owned tables, so any file may query it directly without going through a
 * service" — WRONG, `teams` IS `org`-owned (architecture.md §4 line 69).
 * `routes/search.ts`'s separate lookup now calls `@hyperidle/org`'s
 * `listTeamsByIds` instead of a direct `@hyperidle/db` query; this function
 * itself never imported `teams` and needed no code change.
 */
export async function searchBetsByText(
	exec: WriteExecutor,
	opts: { readonly pattern: string; readonly query: string; readonly limit: number },
): Promise<Bet[]> {
	const matchRankExpr = sql<number>`CASE
		WHEN ${bets.description} ILIKE ${`${opts.query}%`} ESCAPE '\\' THEN 0
		WHEN ${bets.description} ILIKE ${`% ${opts.query}%`} ESCAPE '\\' THEN 1
		ELSE 2
	END`;
	return exec
		.select()
		.from(bets)
		.where(
			or(
				sql`${bets.description} ILIKE ${opts.pattern} ESCAPE '\\'`,
				sql`${bets.hypothesis} ILIKE ${opts.pattern} ESCAPE '\\'`,
				sql`${bets.doneCondition} ILIKE ${opts.pattern} ESCAPE '\\'`,
			),
		)
		.orderBy(matchRankExpr, desc(bets.createdAt), bets.id)
		.limit(opts.limit);
}

// ---------------------------------------------------------------------------
// reads — tasks
// ---------------------------------------------------------------------------

/** Full-row get-by-id. Collapses ~22 sites (plan addendum §A3). */
export async function getTaskById(exec: WriteExecutor, id: string): Promise<Task | undefined> {
	const [row] = await exec.select().from(tasks).where(eq(tasks.id, id)).limit(1);
	return row;
}

export interface ListTasksOpts {
	readonly betId?: string;
	readonly state?: string;
	readonly ownerAgentId?: string;
	/** `routes/artifacts.ts` axis="product" — teamId filter, AND-composed like the others. */
	readonly teamId?: string;
	/**
	 * `routes/artifacts.ts` axis="bet"/"product" — Sec-MED-4 fan-out cap
	 * (`MAX_TASK_ID_FANOUT + 1`). Optional, SQL-level `.limit()` — omitted for
	 * every other call site (unbounded, matching current behavior).
	 */
	readonly limit?: number;
}

/**
 * `routes/tasks.ts:96-112` (+ every `.from(tasks).where(eq(betId,…))` loop
 * site) — AND-composed over only the provided keys, exactly reproducing
 * `routes/tasks.ts`'s `conditions.push(...)` then `and(...conditions)`.
 * Omitted keys add no predicate; `opts` undefined/`{}` → unfiltered
 * `.from(tasks)`. No OR path exists today — do not add one.
 */
export async function listTasks(exec: WriteExecutor, opts?: ListTasksOpts): Promise<Task[]> {
	const conditions = [];
	if (opts?.betId !== undefined) conditions.push(eq(tasks.betId, opts.betId));
	if (opts?.state !== undefined) conditions.push(eq(tasks.state, opts.state));
	if (opts?.ownerAgentId !== undefined) conditions.push(eq(tasks.ownerAgentId, opts.ownerAgentId));
	if (opts?.teamId !== undefined) conditions.push(eq(tasks.teamId, opts.teamId));
	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
	const query =
		whereClause === undefined
			? exec.select().from(tasks)
			: exec.select().from(tasks).where(whereClause);
	return opts?.limit !== undefined ? query.limit(opts.limit) : query;
}

/**
 * `dependency-watcher.ts:36-39` — hold-state tasks whose `dependencies` JSON
 * text column contains the caller-escaped, JSON-quoted dependency id.
 * Distinct mechanic (LIKE pre-filter, not an `eq` predicate) — doesn't fit
 * `listTasks`'s AND-composed opts, so it gets its own named function per
 * plan §5.3's synthesis rule. `likePattern` is pre-escaped by the caller
 * (`escapeLikePattern`) — this function does not escape it again.
 */
export async function listHoldTasksWithDependencyPattern(
	exec: WriteExecutor,
	likePattern: string,
): Promise<Task[]> {
	return exec
		.select()
		.from(tasks)
		.where(
			and(eq(tasks.state, "hold"), sql`${tasks.dependencies} LIKE ${likePattern} ESCAPE '\\'`),
		);
}

/**
 * `agent-profile.ts:280` / `threads.ts:434` — `where(inArray(tasks.id, ids))`.
 * Empty `ids` → return `[]` WITHOUT querying (matches the callers'
 * length-guard; an empty `inArray` errors in some dialects — same guard as
 * `listBetsByIds`).
 */
export async function listTasksByIds(exec: WriteExecutor, ids: readonly string[]): Promise<Task[]> {
	if (ids.length === 0) return [];
	return exec
		.select()
		.from(tasks)
		.where(inArray(tasks.id, Array.from(ids)));
}

/**
 * `routes/bets.ts:461-496` — the bet-detail route's per-task correlated
 * `sessions` subquery for `latestSessionOutcome`. Owned-primary (`.from(tasks)`)
 * with a foreign subquery — one of the two sanctioned foreign imports
 * (addendum §A2 FOREIGN-IMPORT CEILING).
 */
export interface BetTaskWithLatestSessionOutcome {
	readonly id: string;
	readonly betId: string;
	readonly teamId: string;
	readonly ownerAgentId: string | null;
	readonly title: string;
	readonly description: string | null;
	readonly doneCondition: string | null;
	readonly state: string;
	readonly dependencies: string | null;
	readonly artifacts: string | null;
	readonly costCap: number | null;
	readonly costActual: number | null;
	readonly threadId: string | null;
	readonly notes: string | null;
	readonly auditTrail: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly latestSessionOutcome: string | null;
	readonly outcomeVerdict: string | null;
	readonly outcomeRecordedAt: string | null;
}

export async function listBetTasksWithLatestSessionOutcome(
	exec: WriteExecutor,
	betId: string,
): Promise<BetTaskWithLatestSessionOutcome[]> {
	const outerTaskId = sql`${sql.identifier("tasks")}.${sql.identifier("id")}`;
	return exec
		.select({
			id: tasks.id,
			betId: tasks.betId,
			teamId: tasks.teamId,
			ownerAgentId: tasks.ownerAgentId,
			title: tasks.title,
			description: tasks.description,
			doneCondition: tasks.doneCondition,
			state: tasks.state,
			dependencies: tasks.dependencies,
			artifacts: tasks.artifacts,
			costCap: tasks.costCap,
			costActual: tasks.costActual,
			threadId: tasks.threadId,
			notes: tasks.notes,
			auditTrail: tasks.auditTrail,
			createdAt: tasks.createdAt,
			updatedAt: tasks.updatedAt,
			latestSessionOutcome: sql<
				string | null
			>`(SELECT ${sessions.outcome} FROM ${sessions} WHERE ${sessions.taskId} = ${outerTaskId} ORDER BY ${sessions.startedAt} DESC LIMIT 1)`.as(
				"latest_session_outcome",
			),
			outcomeVerdict: tasks.outcomeVerdict,
			outcomeRecordedAt: tasks.outcomeRecordedAt,
		})
		.from(tasks)
		.where(eq(tasks.betId, betId));
}

// ---------------------------------------------------------------------------
// reads — items
// ---------------------------------------------------------------------------

/** Full-row get-by-id. `policy-engine.ts:57,154,197`; `conversations.ts:191`; `route-item.ts:37`; `score-attention.ts:137`. */
export async function getItemById(exec: WriteExecutor, id: string): Promise<Item | undefined> {
	const [row] = await exec.select().from(items).where(eq(items.id, id)).limit(1);
	return row;
}

/** `conversations.ts:127-131` — items for a thread, ordered `createdAt` ascending. */
export async function listItemsByThread(exec: WriteExecutor, threadId: string): Promise<Item[]> {
	return exec.select().from(items).where(eq(items.threadId, threadId)).orderBy(items.createdAt);
}

/**
 * `daily-digest.ts:32-35` — items whose `auditTrail` mentions
 * `policy_queued` and were created on/after `cutoff`.
 */
export async function listQueuedItemsSince(exec: WriteExecutor, cutoff: string): Promise<Item[]> {
	return exec
		.select()
		.from(items)
		.where(and(like(items.auditTrail, "%policy_queued%"), sql`${items.createdAt} >= ${cutoff}`));
}

/**
 * `attention-service.ts:230-234` (tx-scoped) — existence probe for the
 * idempotency marker embedded in `items.reasoning`.
 */
export async function findItemByReasoningMarker(
	exec: WriteExecutor,
	marker: string,
): Promise<{ id: string } | undefined> {
	const [row] = await exec
		.select({ id: items.id })
		.from(items)
		.where(like(items.reasoning, `%${marker}%`))
		.limit(1);
	return row;
}

/**
 * `builtin-routine-handlers.ts` (`runPostBetRetro` dedupe probe) — does a retro
 * item already exist for any of the bet's threads, matching the body marker?
 * Items-only (`.from(items)`, no `threads` join): the caller resolves the bet's
 * thread ids via conversation-store (Conversation owns `threads`) and passes
 * them in. Decomposed from a former `items ⋈ threads` join to avoid a
 * cross-owned-table read, per founder ruling (2026-07-12): zero exceptions for
 * cross-service table access.
 */
export async function findRetroItemByThreadIds(
	exec: WriteExecutor,
	threadIds: string[],
	marker: string,
): Promise<{ id: string } | undefined> {
	if (threadIds.length === 0) {
		return undefined;
	}
	const [row] = await exec
		.select({ id: items.id })
		.from(items)
		.where(and(inArray(items.threadId, threadIds), like(items.body, `%${marker}%`)))
		.limit(1);
	return row;
}

/**
 * `approval-rate.ts` (Path 1 attribution) — the ids of items authored by
 * `sourceAgentId`. Items-only owned read; approval-rate then resolves the
 * matching verdict messages via conversation-store, so neither the Work-owned
 * `items` nor the Conversation-owned `messages` is read from the other's
 * service (no cross-owner join, per founder ruling 2026-07-12: cross-owned-table
 * reads route through the owner).
 */
export async function listItemIdsBySourceAgent(
	exec: WriteExecutor,
	sourceAgentId: string,
): Promise<string[]> {
	const rows = await exec
		.select({ id: items.id })
		.from(items)
		.where(eq(items.sourceAgentId, sourceAgentId));
	return rows.map((r) => r.id);
}
