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
 * §6 row 1: calls `edit_task.run` in-process instead of the deleted
 * `transitionTask` — the injected function is `edit_task`'s own bound `run`,
 * built by `app.ts` from the composed actions list and threaded through
 * `serviceBootstrap`'s ctx. Before the transition, this reaction repairs the
 * dispatch-attempt row: `requestId`/`sessionId` were never written in
 * production (§1's live defect), so `markRunning` fills them on the task's
 * highest-ordinal `requested` attempt — the write that makes
 * `work-session-end-reactions`' `updateIfActive` finalize a real row for the
 * first time, and that makes step 5b's "find the predecessor's live session"
 * query answerable.
 *
 * Idempotent by construction: `edit_task` validates the transition against
 * the task's CURRENT state and returns a `Problem` rather than throwing. A
 * task already `in_progress` (a handoff re-dispatch launching a second
 * session for a task already mid-flight, OR a duplicate/redelivered
 * `session_started`) is a safe no-op — logged, not propagated.
 *
 * `taskId: null` (a task-free session — an `assistant_turn`/
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

import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { ActionResult, EditTaskInput, TaskView } from "@hyperidle/domain-model";
import type { EventBus, SessionStartedEvent } from "@hyperidle/event-bus";
import { taskDispatchAttemptStore } from "@hyperidle/task";
import type { ActionContext } from "../actions/action.js";

const logger = createLogger({ pkg: "core-api.work-session-started-reactions" });
const registeredBuses = new WeakSet<EventBus>();

/** `edit_task`'s own bound `run` function. */
type EditTask = (ctx: ActionContext, input: EditTaskInput) => Promise<ActionResult<TaskView>>;

async function reactToSessionStarted(
	db: HyperIdleDb,
	eventBus: EventBus,
	event: SessionStartedEvent,
	editTask: EditTask,
): Promise<void> {
	if (!event.taskId) return;
	const now = new Date().toISOString();
	// §1/§6 row 1 — the repair. A `session_started` with no `requestId`
	// (the legacy bare-insert path) marks nothing and is not an error.
	if (event.requestId && event.sessionId) {
		await taskDispatchAttemptStore.markRunning(db, {
			taskId: event.taskId,
			requestId: event.requestId,
			sessionId: event.sessionId,
			now,
		});
	}
	const result = await editTask(
		{ actor: event.agentId, db, eventBus, now },
		{ id: event.taskId, state: "in_progress" },
	);
	if (!result.ok) {
		// A task already in_progress (handoff re-dispatch) or any other invalid
		// source state is a safe no-op — never an unexpected failure.
		logger.warn("session_started task in_progress transition refused", {
			taskId: event.taskId,
			problems: result.problems,
		});
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
	editTask: EditTask,
): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {};
	}
	registeredBuses.add(eventBus);

	const unsubscribe = eventBus.on("session_started", (event) => {
		void reactToSessionStarted(db, eventBus, event, editTask).catch((error: unknown) => {
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
