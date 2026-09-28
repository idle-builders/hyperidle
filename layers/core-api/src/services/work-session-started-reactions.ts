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
	// A `session_started` with no `requestId` marks nothing and is not an error.
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
		return () => {
			// Already registered for this bus — nothing new to dispose.
		};
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
