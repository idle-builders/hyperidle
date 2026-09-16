/**
 * Release a task's git worktree once the task is `done` (or `killed`) and no
 * session of it is still running.
 *
 * Two occasions, one door (`AgentOrchestrationFilesystemsPort.releaseForTask`):
 *
 * - **`task_state_changed → done`/`killed`** — usually no session is left, so
 *   the worktree goes right here.
 * - **`session_ended` whose task is (core's own) `done` or `killed`** —
 *   finishes what the first occasion declined. `task-kill-cascade.ts` says
 *   outright that nothing ends a session when its task moves to `done` — an
 *   agent marks its own task done mid-turn through `edit_task` while the
 *   harness keeps working — so a task can reach `done` with a session of it
 *   still active.
 *
 * The liveness guard against a running session lives INSIDE `releaseForTask`
 * itself, against orchestration's OWN `sessions` table — core decides the
 * task is done, orchestration decides nothing is running. Every failure is
 * logged and swallowed: a release is best-effort, never a reason to fail the
 * transition or the session-end path that triggered it.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { EventBus, SessionEndedEvent, TaskStateChangedEvent } from "@hyperidle/event-bus";
import { get } from "@hyperidle/task";

const logger = createLogger({ pkg: "core-api.task-done-worktree-reactions" });
const registeredBuses = new WeakSet<EventBus>();

/**
 * @lore a killed task's worktree is released the same way a done one's is: a
 * clean worktree goes, a dirty one still stays, because `releaseForTask`
 * never forces the removal — killing a task is not a reason to lose
 * uncommitted work `worktreeRemove` would otherwise refuse to discard.
 */
function reactToTaskStateChanged(
	agentOrchestration: AgentOrchestrationPort,
	event: TaskStateChangedEvent,
): Promise<void> | undefined {
	if (event.toState !== "done" && event.toState !== "killed") return undefined;
	return agentOrchestration.filesystems.releaseForTask(event.taskId);
}

async function reactToSessionEnded(
	db: HyperIdleDb,
	agentOrchestration: AgentOrchestrationPort,
	event: SessionEndedEvent,
): Promise<void> {
	if (!event.taskId) return;
	const task = await get(db, "task", event.taskId);
	if (task?.state !== "done" && task?.state !== "killed") return;
	await agentOrchestration.filesystems.releaseForTask(event.taskId);
}

/**
 * Register core-api's task-done worktree-release reactions on `eventBus`.
 * Returns an unsubscribe function. Safe to call more than once with the SAME
 * `eventBus` instance — only the first registration takes effect.
 */
export function registerTaskDoneWorktreeReactions(
	db: HyperIdleDb,
	eventBus: EventBus,
	agentOrchestration: AgentOrchestrationPort,
): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {};
	}
	registeredBuses.add(eventBus);

	const unsubscribeTaskStateChanged = eventBus.on("task_state_changed", (event) => {
		reactToTaskStateChanged(agentOrchestration, event)?.catch((error: unknown) => {
			logger.error("task_state_changed worktree-release reaction failed", {
				taskId: event.taskId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	});
	const unsubscribeSessionEnded = eventBus.on("session_ended", (event) => {
		void reactToSessionEnded(db, agentOrchestration, event).catch((error: unknown) => {
			logger.error("session_ended worktree-release reaction failed", {
				taskId: event.taskId,
				sessionId: event.sessionId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	});

	return () => {
		unsubscribeTaskStateChanged();
		unsubscribeSessionEnded();
		registeredBuses.delete(eventBus);
	};
}
