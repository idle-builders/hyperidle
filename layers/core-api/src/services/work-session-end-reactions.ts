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
 *
 * AU21 §9 Increment 12 (Decision H3), Wave D — a SECOND, independent
 * subscription on `session_ended` merges a task-sourced session's
 * accumulated per-tier token counts (`SessionEndedEvent.tokensByTier`,
 * additive payload growth) into the owning bet's `bets.tokensActualJson`.
 * This is the literal replacement for
 * `run-orchestration/provisioner.ts`'s deleted direct
 * `ports.work.updateBetById` write (`accumulateSessionTokensOnBet`), called
 * at every one of the four session-end branches (crash / budget_exhausted /
 * not_returned / normal completion) immediately after that branch's own
 * `session_ended`-emitting `transitionRun` call — the merge logic (existing
 * `byTier` read-modify-write) is copied verbatim.
 *
 * Unlike `agent_run_lifecycle_changed`'s dispatch-attempt-row-status guard,
 * there is no natural persisted marker for "this session's tokens were
 * already merged" (`sessions` carries no per-session token-application
 * column). Idempotency here is a per-eventBus-instance `Set<sessionId>`
 * guard (`processedTokenSessions`), scoped identically to this module's own
 * `registeredBuses` — defensive against event redelivery, matching the
 * production invariant that `session_ended` itself fires at most once per
 * session (CAS-gated at `transition-run.ts`'s emission source).
 */

import type { Bet, HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { AgentRunLifecycleChangedEvent, SessionEndedEvent } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { get, taskDispatchAttemptStore, update } from "@hyperidle/work";

const logger = createLogger({ pkg: "core-api.work-session-end-reactions" });
const registeredBuses = new WeakSet<EventBus>();
const processedTokenSessions = new WeakMap<EventBus, Set<string>>();

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
 * Merge `tokensByTier` into the bet owning `taskId`'s `tokensActualJson`,
 * copying `provisioner.ts`'s deleted `accumulateSessionTokensOnBet` exactly:
 * a read-modify-write per tier, additive onto any existing counts.
 */
async function mergeSessionTokensIntoBet(
	db: HyperIdleDb,
	taskId: string,
	tokensByTier: NonNullable<SessionEndedEvent["tokensByTier"]>,
): Promise<void> {
	const task = await get(db, "task", taskId);
	if (!task?.betId) return;

	const bet: Bet | undefined = await get(db, "bet", task.betId);

	const existing: Record<string, { prompt: number; completion: number }> = bet?.tokensActualJson
		? ((
				JSON.parse(bet.tokensActualJson) as {
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

	await update(db, "bet", task.betId, { tokensActualJson: JSON.stringify({ byTier: merged }) });
}

function reactToSessionEndedTokens(
	db: HyperIdleDb,
	eventBus: EventBus,
	event: SessionEndedEvent,
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
	return mergeSessionTokensIntoBet(db, event.taskId, event.tokensByTier);
}

/**
 * Register core-api's POST-SESSION `taskDispatchAttempts` finalize reaction
 * + `session_ended` bet-token-writeback reaction on `eventBus`. Returns an
 * unsubscribe function. Safe to call more than once with the SAME `eventBus`
 * instance — only the first registration takes effect.
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
	const unsubscribeTokens = eventBus.on("session_ended", (event) => {
		void reactToSessionEndedTokens(db, eventBus, event)?.catch((error: unknown) => {
			logger.error("session_ended bet token-writeback reaction failed", {
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
