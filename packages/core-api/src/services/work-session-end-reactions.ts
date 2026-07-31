/**
 * AU21 §9 Increment 10 (Decision H1, task-only — the `decomposition` half of
 * this writeback is gone entirely via Increment 10a / Decision I, not
 * migrated) — core-api's POST-SESSION reaction that finalizes a `task`'s
 * `taskDispatchAttempts` row, replacing `session-requests`'s own direct
 * cross-layer write (`lifecycleProjectors.task` → `projectTask`,
 * `service.ts`, calling `deps.work.updateTaskDispatchAttemptIfActive`).
 *
 * Reuses `routine-run-session-end-reactions.ts`'s exact shape: a per-eventBus-
 * instance idempotency guard (`registeredBuses`) so booting the production
 * app AND a test requesting the same `eventBus` instance never double-
 * registers, and the same explicit `register*(db, eventBus)` wiring
 * convention (`registerPolicy`/`registerReviewSubscriptions`/
 * `registerRoutineRunSessionEndReactions`) — NOT auto-wired onto the
 * `test-fixtures.ts` `eventBus` fixture; tests call
 * `registerWorkSessionEndReactions(db, eventBus)` explicitly.
 *
 * Subscribes **`agent_run_lifecycle_changed` ONLY** — NOT `session_ended`.
 * Per architecture.md §6 Decision H / §9 Increment 10: `SessionEndedEvent`'s
 * `SessionOutcome` vocabulary (`"completed"|"crashed"|"stopped"|
 * "not_returned"`) does not match `taskDispatchAttemptStore.updateIfActive`'s
 * expected status values, while `AgentRunLifecycleChangedEvent.state`
 * (`"completed"|"failed"|"cancelled"`, a required `requestId`) matches
 * exactly and fires on every terminal state including `"completed"`
 * (`transition-run.ts`'s `transitionAgentRunLifecycle`).
 *
 * Idempotent by construction: `updateIfActive`'s own
 * `status IN ('requested','running')` guard means a duplicate/redelivered
 * terminal event for an already-finalized attempt row is a safe no-op — it
 * can never move a row backwards or re-apply a stale `sessionId`.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { AgentRunLifecycleChangedEvent, EventBus } from "@hyperidle/shared";
import { createLogger } from "@hyperidle/shared";
import { taskDispatchAttemptStore } from "@hyperidle/work";

const logger = createLogger({ pkg: "core-api.work-session-end-reactions" });
const registeredBuses = new WeakSet<EventBus>();

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
 * Register core-api's POST-SESSION `taskDispatchAttempts` finalize reaction
 * on `eventBus`. Returns an unsubscribe function. Safe to call more than once
 * with the SAME `eventBus` instance — only the first registration takes
 * effect.
 */
export function registerWorkSessionEndReactions(db: HyperIdleDb, eventBus: EventBus): () => void {
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

	return () => {
		unsubscribeLifecycle();
		registeredBuses.delete(eventBus);
	};
}
