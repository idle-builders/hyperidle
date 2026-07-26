import { type HyperIdleDb, propagationLog, sessions } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { type TaskStateMachineDeps, transitionTask } from "./task-state-machine.js";
import * as work from "./work-service.js";

/** Task states that are terminal — never re-killed by the cascade. */
const TERMINAL_TASK_STATES: string[] = ["done", "killed"];

/**
 * Cascade a bet kill downward to its tasks and sessions (AF12 AC3/AC6).
 *
 * Synchronous, in the kernel kill path: the `/kill` endpoint returns only after
 * tasks/sessions are stopped, so the UI's immediate refresh shows true state.
 *
 * - Non-terminal tasks on the bet → killed via the CAS-guarded `transitionTask`.
 * - Active sessions on those tasks → `state='stopped'`, `outcome='stopped'`
 *   (CAS on `state='active'` for idempotency). No `session_ended` event is
 *   emitted: the upward propagation engine only acts on `outcome='completed'`,
 *   and a silent terminal write avoids re-entrant propagation.
 * - Each cascade hop writes a synchronous `propagation_log` row with
 *   `sourceEvent:'bet_killed'`, `status:'applied'`, labelled to the real target.
 *
 * @lore AF12 cascade: stops active sessions WITHOUT emitting `session_ended` to
 * avoid re-entrant upward propagation (the engine ignores non-'completed'
 * outcomes anyway, but emitting could trip unrelated handlers).
 *
 * @lore AF12 propagation_log dual-writer: the kernel cascade writes downward rows
 * directly (fabric owns the upward log helper; kernel cannot import fabric). The
 * row shape is kept identical to fabric's `logPropagation`. Cascade rows carry
 * `sourceEvent:'bet_killed'`; the async upward skip rows the engine writes carry
 * `sourceEvent:'task_state_changed'` — disambiguated so AC6 can query deterministically.
 *
 * @lore AF12 idempotency: all writes are CAS / `NOT IN terminal`-guarded. A 0-row
 * CAS-stop on an already-stopped session does NOT write a phantom propagation_log
 * row (the row is written only when the CAS update actually changed a row).
 */
export async function cascadeBetKill(
	db: HyperIdleDb,
	eventBus: EventBus,
	betId: string,
	deps: TaskStateMachineDeps,
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

	for (const task of nonTerminalTasks) {
		// 2. Active sessions on this task.
		const activeSessions = await db
			.select({ id: sessions.id })
			.from(sessions)
			.where(and(eq(sessions.taskId, task.id), eq(sessions.state, "active")));

		for (const sess of activeSessions) {
			// 3. Stop each active session (CAS on state='active' for idempotency).
			const now = new Date().toISOString();
			const stopped = await db
				.update(sessions)
				.set({ state: "stopped", outcome: "stopped", endedAt: now })
				.where(and(eq(sessions.id, sess.id), eq(sessions.state, "active")))
				.returning({ id: sessions.id });

			// 0-row CAS (already stopped) → no phantom propagation_log row.
			if (stopped.length === 0) continue;

			sessionsStopped.push(sess.id);
			await writeCascadeRow(db, {
				sourceLevel: "task",
				sourceId: task.id,
				targetLevel: "session",
				targetId: sess.id,
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
