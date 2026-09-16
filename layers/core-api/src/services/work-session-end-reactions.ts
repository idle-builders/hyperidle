/**
 * AU21 §9 Increment 10 (Decision H1) — core-api's POST-SESSION reaction that
 * finalizes a `task`'s `taskDispatchAttempts` row.
 *
 * Subscribes `agent_run_lifecycle_changed` ONLY for dispatch-attempt finalize.
 * Idempotent by construction via `updateIfActive`'s guard.
 *
 * AU21 §9 Increment 12 (Decision H3), BB1-adapted — a SECOND subscription on
 * `session_ended` merges per-tier token counts into the WORKED TASK's own
 * `tasks.tokensActualJson`. There is no ancestor rollup write — subtree totals
 * are computed at read time by `GET /api/tasks/:id/tree`.
 *
 * @lore BB1: `task.betId` is gone. Tokens accumulate on the worked task itself
 * (not on an ancestor). Per api-contract.md §"Token rollup": nothing writes a
 * rollup onto an ancestor — `tokensActualRollup` is summed at read time.
 *
 * @lore B3 fix (the architecture doc §6): the merged JSON used to land through
 * a bare `update(db, "task", taskId, …)` straight from this file — a
 * production writer of `tasks` outside the task module, with no `changes`
 * row, so the writeback was invisible to the record the item exists to
 * create. `tokensActualJson` is now a field on `EditTaskInput`; this reaction
 * merges the counts (still its own job — `edit_task` has no tier-merge
 * semantics) and calls `edit_task.run` in-process, as the session's own
 * agent, exactly like `work-session-started-reactions.ts` does for the
 * `in_progress` transition.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { ActionResult, EditTaskInput, TaskView } from "@hyperidle/domain-model";
import type {
	AgentRunLifecycleChangedEvent,
	EventBus,
	SessionEndedEvent,
} from "@hyperidle/event-bus";
import { get, taskDispatchAttemptStore } from "@hyperidle/task";
import type { ActionContext } from "../actions/action.js";

const logger = createLogger({ pkg: "core-api.work-session-end-reactions" });
const registeredBuses = new WeakSet<EventBus>();
const processedTokenSessions = new WeakMap<EventBus, Set<string>>();

/** `edit_task`'s own bound `run` function. */
type EditTask = (ctx: ActionContext, input: EditTaskInput) => Promise<ActionResult<TaskView>>;

function reactToLifecycleChanged(
	db: HyperIdleDb,
	event: AgentRunLifecycleChangedEvent,
): Promise<void> | undefined {
	if (event.sourceKind !== "task") return undefined;
	return taskDispatchAttemptStore.updateIfActive(db, event.requestId, {
		status: event.state,
		sessionId: event.sessionId ?? null,
	});
}

/**
 * Merge `tokensByTier` into the worked task's own `tokensActualJson` and
 * write it back through `edit_task`, as the session's own agent. Additive
 * read-modify-write per tier. Never walks up to a parent.
 */
async function mergeSessionTokensOntoTask(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId: string,
	agentId: string,
	tokensByTier: NonNullable<SessionEndedEvent["tokensByTier"]>,
	editTask: EditTask,
): Promise<void> {
	const task = await get(db, "task", taskId);
	if (!task) return;

	const existing: Record<string, { prompt: number; completion: number }> = task.tokensActualJson
		? ((
				JSON.parse(task.tokensActualJson) as {
					byTier: Record<string, { prompt: number; completion: number }>;
				}
			).byTier ?? {})
		: {};

	const merged: Record<string, { prompt: number; completion: number }> = { ...existing };
	for (const [tier, counts] of Object.entries(tokensByTier)) {
		if (!counts) continue;
		const ex = merged[tier] ?? { prompt: 0, completion: 0 };
		merged[tier] = {
			prompt: ex.prompt + counts.prompt,
			completion: ex.completion + counts.completion,
		};
	}

	const now = new Date().toISOString();
	const result = await editTask(
		{ actor: agentId, db, eventBus, now },
		{ id: taskId, tokensActualJson: JSON.stringify({ byTier: merged }) },
	);
	if (!result.ok) {
		logger.warn("session_ended task token writeback refused", {
			taskId,
			problems: result.problems,
		});
	}
}

function reactToSessionEndedTokens(
	db: HyperIdleDb,
	eventBus: EventBus,
	event: SessionEndedEvent,
	editTask: EditTask,
): Promise<void> | undefined {
	if (!(event.taskId && event.tokensByTier) || Object.keys(event.tokensByTier).length === 0) {
		return undefined;
	}
	let seen = processedTokenSessions.get(eventBus);
	if (!seen) {
		seen = new Set();
		processedTokenSessions.set(eventBus, seen);
	}
	if (seen.has(event.sessionId)) return undefined;
	seen.add(event.sessionId);
	return mergeSessionTokensOntoTask(
		db,
		eventBus,
		event.taskId,
		event.agentId,
		event.tokensByTier,
		editTask,
	);
}

/**
 * Register core-api's POST-SESSION reactions on `eventBus`. Returns an
 * unsubscribe function. Safe to call more than once with the SAME `eventBus`
 * instance — only the first registration takes effect.
 */
export function registerWorkSessionEndReactions(
	db: HyperIdleDb,
	eventBus: EventBus,
	editTask: EditTask,
): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {};
	}
	registeredBuses.add(eventBus);

	const unsubscribeLifecycle = eventBus.on("agent_run_lifecycle_changed", (event) => {
		void reactToLifecycleChanged(db, event)?.catch((error: unknown) => {
			logger.error("agent_run_lifecycle_changed task dispatch-attempt finalize reaction failed", {
				sourceId: event.sourceId,
				requestId: event.requestId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	});
	const unsubscribeTokens = eventBus.on("session_ended", (event) => {
		void reactToSessionEndedTokens(db, eventBus, event, editTask)?.catch((error: unknown) => {
			logger.error("session_ended task token-writeback reaction failed", {
				sessionId: event.sessionId,
				taskId: event.taskId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	});

	return () => {
		unsubscribeLifecycle();
		unsubscribeTokens();
		registeredBuses.delete(eventBus);
	};
}
