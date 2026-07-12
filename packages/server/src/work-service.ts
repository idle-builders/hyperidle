/**
 * AU13: Work service — the only module permitted to write `bets`, `tasks`,
 * `items`. Every call site enumerated in `.pipeline/plans/AU13.md` §4a-§4c
 * routes through one of these functions instead of a direct
 * `insert`/`update`/`delete` against the table objects.
 *
 * Mirrors `knowledge/knowledge-repository.ts`'s style (`create`/`update`
 * functions, executor-first param), widened to accept `WriteExecutor` so
 * callers that already coordinate a multi-table write inside
 * `db.transaction(async (tx) => …)` (handoff-protocol, bet-state-machine,
 * task-state-machine, lifecycle-propagation, bet-decomposition,
 * builtin-routine-handlers) can join this service's write into their
 * existing transaction unchanged.
 *
 * @lore AU13 §5.3 (design-it-twice synthesis): a single generic
 * `update*ById(exec, id, patch)` cannot express the guarded-transition /
 * silent-if-running mechanics without leaking a per-caller predicate through
 * `args` (Shape B, rejected). Each genuinely different mechanic — plain
 * by-id set, guarded CAS transition with `.returning()`, in-update silent
 * guard, bulk sweep — gets its own named function whose predicate +
 * returning-shape is fixed and internal.
 *
 * Event emission stays at call sites (out of scope — see plan §3).
 */
import { bets, items, type NewBet, type NewItem, type NewTask, tasks } from "@hyperidle/db";
import type { SQL } from "drizzle-orm";
import { and, eq, isNull } from "drizzle-orm";
import type { WriteExecutor } from "./write-executor.js";

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
