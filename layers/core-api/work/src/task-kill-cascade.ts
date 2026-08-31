import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import { type TaskStateMachineDeps, transitionTask } from "./task-state-machine.js";
import * as work from "./work-service.js";

/**
 * `cascadeTaskKill`'s deps — `transitionTask`'s bag plus the downward run-stop
 * call.
 *
 * @lore AU26 H2 (§D-M.2): stopping a run is `agent-orchestration`'s state
 * transition, so `work` asks for it (Mechanism C — a nested Service may depend
 * only on `@hyperidle/db` + framework packages, never on another Service
 * directly). Wired at `routes/tasks.ts` to `@hyperidle/run-orchestration`'s
 * `requestRunStopForTasks`.
 */
export interface TaskKillCascadeDeps extends TaskStateMachineDeps {
	readonly runOrchestration: {
		requestRunStopForTasks(
			exec: WriteExecutor,
			taskIds: readonly string[],
		): Promise<readonly { readonly taskId: string; readonly sessionId: string }[]>;
	};
}

/**
 * Task states the cascade never touches when it meets them BENEATH the root.
 *
 * @lore BB1: the root is deliberately not judged by this list — see
 * `cascadeTaskKill`. Killing work you finished on purpose is a decision; having
 * it killed as collateral because an ancestor died is not.
 */
const TERMINAL_TASK_STATES: string[] = ["done", "killed"];

/**
 * Kill a task and its entire subtree, at any depth, plus the runs underneath.
 *
 * Synchronous, in the kill path: the endpoint returns only after tasks and runs
 * are stopped, so the UI's immediate refresh shows true state.
 *
 * - Non-terminal tasks in the subtree → killed via the CAS-guarded `transitionTask`.
 * - Active runs on those tasks → stopped via `run-orchestration`'s
 *   `requestRunStopForTasks`, which owns the CAS and the `session_ended`
 *   suppression.
 *
 * @lore BB1: this used to be `cascadeBetKill`, and it walked exactly ONE hop —
 * `list("task", { betId })` — because a bet's tasks were the only thing below
 * it. With a recursive task the subtree has no depth bound, so the hop becomes
 * `listSubtreeIds` (one recursive CTE, one consistent read). Killing deepest
 * first means a parent is never killed while a live child still hangs off it.
 *
 * @lore AF12 cascade: stops active sessions WITHOUT emitting `session_ended` to
 * avoid re-entrant upward propagation (the engine ignores non-'completed'
 * outcomes anyway, but emitting could trip unrelated handlers). AU26 H2 moved
 * both the CAS write and that suppression down into `run-orchestration`.
 *
 * @lore AU44 batch6: `propagation_log` table dropped (AU20 Ruling 2). The
 * cascade no longer writes log rows. Failed hops emit `propagation_failed` on
 * the event bus — the extension surface for plugins.
 *
 * @lore AF12 idempotency: all writes are CAS / `NOT IN terminal`-guarded.
 * `requestRunStopForTasks` returns the runs it actually stopped so callers know
 * which sessions were affected.
 */
export async function cascadeTaskKill(
	db: HyperIdleDb,
	eventBus: EventBus,
	rootTaskId: string,
	deps: TaskKillCascadeDeps,
): Promise<{ tasksKilled: string[]; sessionsStopped: string[] }> {
	const tasksKilled: string[] = [];
	const sessionsStopped: string[] = [];

	// 1. The whole subtree, root included, nearest-first.
	const subtreeIds = await work.listSubtreeIds(db, rootTaskId);
	if (subtreeIds.length === 0) return { tasksKilled, sessionsStopped };

	const subtree = await work.list(db, "task", { ids: subtreeIds });

	// @lore BB1: the ROOT is the task someone explicitly asked to kill; everything
	// below it dies as collateral. The two are not the same decision, so they do
	// not get the same rule.
	//
	// A `done` root IS killed: `TASK_STATE_TRANSITIONS` allows `done -> killed`,
	// and before the one edit door routed through this cascade, PATCHing a
	// finished task to `killed` did exactly that. Judging the root by the
	// terminal list turned that into a silent no-op — HTTP 200, state unchanged —
	// and `done` roots are the common case, since parent auto-completion is what
	// puts container tasks there.
	//
	// An already-`killed` root is skipped instead of erroring, because re-killing
	// is how you finish a subtree that was half-killed: the parent stays as it is
	// and the live descendants below it still die.
	//
	// Descendants keep the full terminal filter: a kill must never un-finish
	// work that was completed on purpose.
	const doomed = subtree.filter((t) =>
		t.id === rootTaskId ? t.state !== "killed" : !TERMINAL_TASK_STATES.includes(t.state),
	);
	// Runs are only stopped for tasks that were actually running; a `done` root
	// has none, so this stays the non-terminal set.
	const nonTerminal = doomed.filter((t) => !TERMINAL_TASK_STATES.includes(t.state));

	// 2. Stop the active runs on those tasks. `run-orchestration` owns the
	// select, the CAS and the `session_ended` suppression; it returns only the
	// runs it actually stopped.
	const stoppedRuns = await deps.runOrchestration.requestRunStopForTasks(
		db,
		nonTerminal.map((t) => t.id),
	);

	// 3. Kill deepest-first. `listSubtreeIds` returns nearest-first (root at
	// index 0), so reversing walks the leaves up — a parent is never killed
	// while a live child still hangs off it.
	const depthOrder = new Map(subtreeIds.map((id, i) => [id, i]));
	const deepestFirst = [...doomed].sort(
		(a, b) => (depthOrder.get(b.id) ?? 0) - (depthOrder.get(a.id) ?? 0),
	);

	for (const task of deepestFirst) {
		for (const run of stoppedRuns.filter((r) => r.taskId === task.id)) {
			sessionsStopped.push(run.sessionId);
		}
		// @lore BB1: `cascade: true` marks the emitted `task_state_changed` so the
		// upward COMPLETION propagation ignores it. Without it, killing a subtree
		// raced its own completion: the leaf's kill advanced the ancestors to
		// `done` (stamping `completedAt` on cancelled work, and raising a
		// "Confirm shipping?" review on a killed root) moments before this loop
		// killed those same rows. The same reasoning as the `session_ended`
		// suppression above — a kill is not progress.
		await transitionTask(db, eventBus, task.id, "killed", deps, undefined, { cascade: true });
		tasksKilled.push(task.id);
	}

	return { tasksKilled, sessionsStopped };
}
