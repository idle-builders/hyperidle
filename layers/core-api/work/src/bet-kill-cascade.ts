import type { HyperIdleDb, WriteExecutor } from "@hyperidle/db";
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
	/**
	 * `policy` owns `propagation_log`. Same Mechanism C as `runOrchestration`
	 * above — a nested Service asks, it does not import a sibling — and wired at
	 * the same site, `routes/bets.ts`.
	 */
	readonly policy: {
		recordPropagationHop(
			db: HyperIdleDb,
			entry: {
				readonly sourceLevel: string;
				readonly sourceId: string;
				readonly sourceEvent: string;
				readonly targetLevel: string;
				readonly targetId: string;
				readonly targetTransition: string | null;
				readonly status: string;
				readonly failureReason?: string;
				readonly attempts?: number;
			},
		): Promise<void>;
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
 * @lore AF12 propagation_log: there is no longer a second writer. The cascade's
 * downward rows and the engine's upward rows go through the same builder in
 * `policy`, which owns the table; the cascade reaches it through the injected
 * port rather than importing a sibling Service. Cascade rows carry
 * `sourceEvent:'bet_killed'`; the async upward skip rows carry
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
		// 3. One `propagation_log` hop per run actually stopped, recorded by the
		// service that owns the table.
		for (const run of stoppedRuns.filter((r) => r.taskId === task.id)) {
			sessionsStopped.push(run.sessionId);
			await writeCascadeRow(db, deps, {
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
		await writeCascadeRow(db, deps, {
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
 * Write a single downward-cascade `propagation_log` row through the service
 * that owns the table.
 *
 * @lore This used to be a local row builder whose own comment said it "mirrors
 * fabric's `logPropagation` field-for-field". It did — by hand, and only for as
 * long as someone kept reading both. `policy` owns `propagation_log` and now
 * exposes the real builder, so the cascade fills in what is genuinely its own
 * (the hop, and `sourceEvent: "bet_killed"`) and nothing else.
 */
async function writeCascadeRow(
	db: HyperIdleDb,
	deps: BetKillCascadeDeps,
	hop: {
		sourceLevel: string;
		sourceId: string;
		targetLevel: string;
		targetId: string;
		targetTransition: string;
	},
): Promise<void> {
	await deps.policy.recordPropagationHop(db, {
		sourceLevel: hop.sourceLevel,
		sourceId: hop.sourceId,
		sourceEvent: "bet_killed",
		targetLevel: hop.targetLevel,
		targetId: hop.targetId,
		targetTransition: hop.targetTransition,
		status: "applied",
	});
}
