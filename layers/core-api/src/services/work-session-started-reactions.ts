/**
 * AU21 §9 Increment 12 (Decision H3), Wave D — core-api's POST-SESSION-START
 * reaction that transitions a task to `in_progress`, replacing
 * `run-orchestration/provisioner.ts`'s direct
 * `ports.work.transitionTask(db, eventBus, taskId, "in_progress")` call
 * (fired synchronously at launch, immediately before phase 4's sandbox spawn,
 * when the task is not already `in_progress` — the AD2 handoff-re-dispatch
 * guard).
 *
 * Reacts to the EXISTING `session_started` event instead — emitted once the
 * sandbox/session row/context are fully committed (`provisioner.ts`'s
 * `admitSession`), and also by `sessions-routes.ts`'s legacy bare-insert
 * path. `session_started` already carries `taskId` (`SessionStartedEvent`) so
 * no payload growth was needed for this half of Wave D (unlike the
 * `session_ended` token-writeback half, which needed the additive
 * `tokensByTier` field).
 *
 * Calls `@hyperidle/work`'s real `transitionTask` state machine — the SAME
 * function `run-orchestration-composition.ts`'s deleted `workAccessor` used
 * to call, now invoked core-side with the SAME fully-wired
 * `TaskStateMachineDeps` every other real `task_run`-baking call site already
 * uses (`routes/tasks.ts`, `routes/bets.ts`, `app.ts`'s dependency-watcher) —
 * `enqueueWorkIntent` (`@hyperidle/session-requests`) + the shared
 * `taskRunResolverDeps` singleton (`task-run-resolver-bindings.ts`).
 *
 * Idempotent by construction, mirroring `routine-run-session-end-reactions.ts`'s
 * `onlyIfRunning`-style guard: `transitionTask` validates the transition
 * against the task's CURRENT state inside its own CAS transaction. A task
 * already `in_progress` (a handoff re-dispatch launching a second session for
 * a task already mid-flight, OR a duplicate/redelivered `session_started`)
 * throws `TaskInvalidTransitionError` (`in_progress -> in_progress` is not a
 * member of `TASK_STATE_TRANSITIONS`) — swallowed here as a safe no-op,
 * never propagated as an unexpected failure.
 *
 * `taskId: null` (a task-free session — an `assistant_turn`/reengagement/
 * explicit non-task session request) is a no-op.
 *
 * @lore this module mirrors `work-session-end-reactions.ts`'s
 * per-eventBus-instance idempotency guard (`registeredBuses`) so booting the
 * production app AND a test requesting the same `eventBus` instance never
 * double-registers. NOT auto-wired onto the `test-fixtures.ts` `eventBus`
 * fixture — tests call `registerWorkSessionStartedReactions(db, eventBus)`
 * explicitly, the same convention `registerPolicy`/`registerReviewSubscriptions`/
 * `registerRoutineRunSessionEndReactions`/`registerWorkSessionEndReactions`
 * already use.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	createLogger,
	type EventBus,
	type SessionStartedEvent,
	TaskInvalidTransitionError,
} from "@hyperidle/shared";
import { type TaskStateMachineDeps, transitionTask } from "@hyperidle/work";
import { buildSeamBackedWorkIntentRecorder } from "./agent-orchestration-port-composition.js";
import { taskRunResolverDeps } from "./task-run-resolver-bindings.js";

const logger = createLogger({ pkg: "core-api.work-session-started-reactions" });
const registeredBuses = new WeakSet<EventBus>();

async function reactToSessionStarted(
	db: HyperIdleDb,
	eventBus: EventBus,
	event: SessionStartedEvent,
	agentOrchestration: AgentOrchestrationPort,
): Promise<void> {
	if (!event.taskId) return;
	const transitionDeps: TaskStateMachineDeps = {
		workIntents: buildSeamBackedWorkIntentRecorder(agentOrchestration),
		taskRunResolver: taskRunResolverDeps,
	};
	try {
		await transitionTask(db, eventBus, event.taskId, "in_progress", transitionDeps);
	} catch (error) {
		// A task already in_progress (handoff re-dispatch) or any other invalid
		// source state is a safe no-op — never an unexpected failure.
		if (error instanceof TaskInvalidTransitionError) return;
		throw error;
	}
}

/**
 * Register core-api's POST-SESSION-START task `in_progress` transition
 * reaction on `eventBus`. Returns an unsubscribe function. Safe to call more
 * than once with the SAME `eventBus` instance — only the first registration
 * takes effect.
 */
export function registerWorkSessionStartedReactions(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {};
	}
	registeredBuses.add(eventBus);

	const unsubscribe = eventBus.on("session_started", (event) => {
		void reactToSessionStarted(db, eventBus, event, agentOrchestration).catch((error: unknown) => {
			logger.error("session_started task in_progress transition reaction failed", {
				taskId: event.taskId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	});

	return () => {
		unsubscribe();
		registeredBuses.delete(eventBus);
	};
}
