import { type HyperIdleDb, propagationLog, type WriteExecutor } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { type TaskStateMachineDeps, transitionTask } from "./task-state-machine.js";
import * as work from "./work-service.js";

/**
 * `cascadeBetKill`'s deps — `transitionTask`'s bag plus the downward run-stop
 * call.
 *
 * @lore AU26 H2 (§D-M.2): stopping a run is `agent-orchestration`'s state
 * transition, so `work` asks for it (Mechanism C — a nested Service may depend
 * only on `@hyperidle/db` + `@hyperidle/shared`, never on another Service
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
 * - Each cascade hop writes a synchronous `propagation_log` row with
 *   `sourceEvent:'bet_killed'`, `status:'applied'`, labelled to the real target.
 *
 * @lore AF12 cascade: stops active sessions WITHOUT emitting `session_ended` to
 * avoid re-entrant upward propagation (the engine ignores non-'completed'
 * outcomes anyway, but emitting could trip unrelated handlers). AU26 H2 moved
 * both the CAS write and that suppression down into `run-orchestration`; what
 * stays here is the `propagation_log` hop, which is core's own row.
 *
 * @lore AF12 propagation_log dual-writer: the kernel cascade writes downward rows
 * directly (fabric owns the upward log helper; kernel cannot import fabric). The
 * row shape is kept identical to fabric's `logPropagation`. Cascade rows carry
 * `sourceEvent:'bet_killed'`; the async upward skip rows the engine writes carry
 * `sourceEvent:'task_state_changed'` — disambiguated so AC6 can query deterministically.
 *
 * @lore AF12 idempotency: all writes are CAS / `NOT IN terminal`-guarded. A 0-row
 * CAS-stop on an already-stopped session does NOT write a phantom propagation_log
 * row — which is exactly why `requestRunStopForTasks` returns the runs it
 * actually stopped rather than a count.
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
	// runs it actually stopped, so an already-stopped run writes no phantom
	// `propagation_log` row below.
	const stoppedRuns = await deps.runOrchestration.requestRunStopForTasks(
		db,
		nonTerminalTasks.map((t) => t.id),
		{ reason: "bet_killed" },
	);

	for (const task of nonTerminalTasks) {
		// 3. One `propagation_log` hop per run actually stopped. The row is
		// core's (`policy` owns the concept, `work` writes it) and stays here.
		for (const run of stoppedRuns.filter((r) => r.taskId === task.id)) {
			sessionsStopped.push(run.sessionId);
			await writeCascadeRow(db, {
				sourceLevel: "task",
				sourceId: task.id,
				targetLevel: "session",
				targetId: run.sessionId,
				targetTransition: "active -> stopped",
			});
		}

		// 4. Kill the task via the CAS-guarded transitionTask (emits task_state_changed;
		// the upward engine sees a terminal bet and logs `skipped` — harmless).
		const fromState = task.state;
		await transitionTask(db, eventBus, task.id, "killed", deps);
		tasksKilled.push(task.id);
		await writeCascadeRow(db, {
			sourceLevel: "bet",
			sourceId: betId,
			targetLevel: "task",
			targetId: task.id,
			targetTransition: `${fromState} -> killed`,
		});
	}

	return { tasksKilled, sessionsStopped };
}

/**
 * Write a single downward-cascade `propagation_log` row. Mirrors fabric's
 * `logPropagation` field-for-field (every NOT-NULL column present, same id
 * strategy, `appliedAt = now` because status is always 'applied' here).
 */
async function writeCascadeRow(
	db: HyperIdleDb,
	hop: {
		sourceLevel: string;
		sourceId: string;
		targetLevel: string;
		targetId: string;
		targetTransition: string;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(propagationLog).values({
		id: crypto.randomUUID(),
		sourceLevel: hop.sourceLevel,
		sourceId: hop.sourceId,
		sourceEvent: "bet_killed",
		targetLevel: hop.targetLevel,
		targetId: hop.targetId,
		targetTransition: hop.targetTransition,
		status: "applied",
		failureReason: null,
		attempts: 1,
		createdAt: now,
		appliedAt: now,
	});
}
