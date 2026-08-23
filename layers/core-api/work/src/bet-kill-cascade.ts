import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import { type TaskStateMachineDeps, transitionTask } from "./task-state-machine.js";
import * as work from "./work-service.js";

/**
 * `cascadeBetKill`'s deps — `transitionTask`'s bag plus the downward run-stop
 * call.
 *
 * @lore AU26 H2 (§D-M.2): stopping a run is `agent-orchestration`'s state
 * transition, so `work` asks for it (Mechanism C — a nested Service may depend
 * only on `@hyperidle/db` + framework packages, never on another Service
 * directly). Wired at `routes/bets.ts` to `@hyperidle/run-orchestration`'s
 * `requestRunStopForTasks`.
 */
export interface BetKillCascadeDeps extends TaskStateMachineDeps {
	readonly runOrchestration: {
		requestRunStopForTasks(
			exec: WriteExecutor,
			taskIds: readonly string[],
			opts: { reason: "bet_killed" },
		): Promise<readonly { readonly taskId: string; readonly sessionId: string }[]>;
	};
}

/** Task states that are terminal — never re-killed by the cascade. */
const TERMINAL_TASK_STATES: string[] = ["done", "killed"];

/**
 * Cascade a bet kill downward to its tasks and sessions (AF12 AC3/AC6).
 *
 * Synchronous, in the kernel kill path: the `/kill` endpoint returns only after
 * tasks/sessions are stopped, so the UI's immediate refresh shows true state.
 *
 * - Non-terminal tasks on the bet → killed via the CAS-guarded `transitionTask`.
 * - Active runs on those tasks → stopped via `run-orchestration`'s
 *   `requestRunStopForTasks`, which owns the CAS and the `session_ended`
 *   suppression.
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
export async function cascadeBetKill(
	db: HyperIdleDb,
	eventBus: EventBus,
	betId: string,
	deps: BetKillCascadeDeps,
): Promise<{ tasksKilled: string[]; sessionsStopped: string[] }> {
	const tasksKilled: string[] = [];
	const sessionsStopped: string[] = [];

	// 1. Non-terminal tasks on the bet.
	// @lore AU13 CONFUSION: `notInArray(state, TERMINAL_TASK_STATES)` doesn't fit
	// `listTasks`'s AND-composed `eq`-only opts shape — filter client-side over
	// the full per-bet task list instead of adding a new SQL-level function for
	// one caller (same result set, plan §5.3's "distinct mechanic" bar not met).
	const nonTerminalTasks = (await work.list(db, "task", { betId })).filter(
		(t) => !TERMINAL_TASK_STATES.includes(t.state),
	);

	// 2. Stop the active runs on those tasks. `run-orchestration` owns the
	// select, the CAS and the `session_ended` suppression; it returns only the
	// runs it actually stopped.
	const stoppedRuns = await deps.runOrchestration.requestRunStopForTasks(
		db,
		nonTerminalTasks.map((t) => t.id),
		{ reason: "bet_killed" },
	);

	for (const task of nonTerminalTasks) {
		// 3. Track runs actually stopped.
		for (const run of stoppedRuns.filter((r) => r.taskId === task.id)) {
			sessionsStopped.push(run.sessionId);
		}

		// 4. Kill the task via the CAS-guarded transitionTask (emits task_state_changed;
		// the upward engine sees a terminal bet and logs `skipped` — harmless).
		await transitionTask(db, eventBus, task.id, "killed", deps);
		tasksKilled.push(task.id);
	}

	return { tasksKilled, sessionsStopped };
}
