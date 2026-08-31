/**
 * AU21 §9 Increment 4 (Decision B″ item 3) — core-api's POST-SESSION
 * reaction that finalizes a routine's `routineRuns` row, replacing the two
 * `agent-orchestration` direct writes this wave deletes:
 * `run-orchestration/transition-run.ts`'s `updateRoutineRunOnSessionEnd`
 * (called from `endSession`/`crashSession`) and
 * `run-orchestration/runtime-reapers.ts`'s `reapStaleRoutineSessions`.
 *
 * Both former call sites now finalize by EMITTING an event instead of
 * writing `routineRuns` directly:
 *   - `session_ended` (`@hyperidle/domain-model`), additive `routineRunOutcome`
 *     field, for a routine-sourced session that reached a terminal
 *     disposition (success / crash / stale-session-reaper timeout).
 *   - `agent_run_lifecycle_changed` with `state:"failed"`/`"cancelled"`, for
 *     a routine session that never reached `session_ended` at all (a
 *     pre-session-launch provisioning failure) — the "request" disposition
 *     path in `transition-run.ts`.
 *
 * This is a DIFFERENT mechanism from `agent-run-admission-reactions.ts`'s
 * PRE-HANDOFF `agent_run_admission_failed` subscriber (which finalizes a
 * routine run that never got as far as a session at all, e.g. a bad baked
 * payload or `MAX_ATTEMPTS_EXCEEDED`). This subscriber only reacts to a
 * session that DID get provisioned.
 *
 * @lore AU21 Increment 14a: this reaction used to also finalize the run's
 * cost (`costInCents` on `session_ended`, threaded into `routineRuns.
 * costMinor`/`costCurrency` and `routines.costActualMinor` via
 * `incrementRoutineCost`) — all deleted along with the rest of the cost
 * feature (columns dropped, no replacement). Only the routine-run-outcome
 * finalization below survives, per the founder's directive to preserve any
 * non-cost concern riding the same event/subscriber path.
 *
 * @lore this module mirrors `agent-run-admission-reactions.ts`'s
 * per-eventBus-instance idempotency guard (`registeredBuses`) so booting the
 * production app AND a test requesting the same `eventBus` instance never
 * double-registers. UNLIKE that module, this one is NOT auto-wired onto the
 * `test-fixtures.ts` `eventBus` fixture — tests call
 * `registerRoutineRunSessionEndReactions(db, eventBus)` explicitly, the same
 * convention `registerPolicy`/`registerReviewSubscriptions` already use.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type {
	AgentRunLifecycleChangedEvent,
	EventBus,
	SessionEndedEvent,
} from "@hyperidle/event-bus";
import * as routineService from "@hyperidle/routine";

const logger = createLogger({ pkg: "core-api.routine-run-session-end-reactions" });
const registeredBuses = new WeakSet<EventBus>();

type RoutineRunFinalizeOutcome = NonNullable<SessionEndedEvent["routineRunOutcome"]>;

/**
 * Finalize routine run `runId` to `outcome`, mirroring
 * `updateRoutineRunOnSessionEnd`'s writes exactly: the `routineRuns` row
 * (`outcome`, `sessionId`, `endedAt`), then the owning routine's `lastRunAt`.
 *
 * Idempotent: only fires when the run is still `outcome:"running"` — a
 * duplicate delivery of an already-finalized run's terminal event (or an
 * event for an unknown run) is a safe no-op.
 */
async function finalizeRoutineRun(
	db: HyperIdleDb,
	input: {
		readonly runId: string;
		readonly outcome: RoutineRunFinalizeOutcome;
		readonly endedAt: string;
		readonly sessionId?: string;
		readonly errorMessage?: string;
	},
): Promise<void> {
	const run = await routineService.getRoutineRun(db, input.runId);
	if (!run || run.outcome !== "running") return;

	await routineService.updateRoutineRun(
		db,
		input.runId,
		{
			outcome: input.outcome,
			endedAt: input.endedAt,
			...(input.sessionId ? { sessionId: input.sessionId } : {}),
			...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
		},
		{ onlyIfRunning: true },
	);

	await routineService.updateRoutine(db, run.routineId, { lastRunAt: input.endedAt });
}

function reactToSessionEnded(db: HyperIdleDb, event: SessionEndedEvent): Promise<void> | undefined {
	if (event.sourceKind !== "routine" || !event.sourceId || !event.routineRunOutcome)
		return undefined;
	return finalizeRoutineRun(db, {
		runId: event.sourceId,
		outcome: event.routineRunOutcome,
		endedAt: new Date(event.timestamp).toISOString(),
		sessionId: event.sessionId,
	});
}

function reactToLifecycleChanged(
	db: HyperIdleDb,
	event: AgentRunLifecycleChangedEvent,
): Promise<void> | undefined {
	if (event.sourceKind !== "routine") return undefined;
	if (event.state !== "failed" && event.state !== "cancelled") return undefined;
	return finalizeRoutineRun(db, {
		runId: event.sourceId,
		outcome: "error",
		endedAt: new Date(event.timestamp).toISOString(),
		sessionId: event.sessionId,
		// A run that records only "error" cannot be diagnosed by anyone — not
		// the person reading the routine's history, not the next agent. Prefer
		// the message; fall back to the code when that is all there is.
		errorMessage: event.errorMessage ?? event.failureCode,
	});
}

/**
 * Register core-api's POST-SESSION `routineRuns` finalize reaction on
 * `eventBus`. Returns an unsubscribe function. Safe to call more than once
 * with the SAME `eventBus` instance — only the first registration takes
 * effect.
 */
export function registerRoutineRunSessionEndReactions(
	db: HyperIdleDb,
	eventBus: EventBus,
): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {};
	}
	registeredBuses.add(eventBus);

	const unsubscribeEnded = eventBus.on("session_ended", (event) => {
		void reactToSessionEnded(db, event)?.catch((error: unknown) => {
			logger.error("session_ended routine-run finalize reaction failed", {
				sourceId: event.sourceId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	});
	const unsubscribeLifecycle = eventBus.on("agent_run_lifecycle_changed", (event) => {
		void reactToLifecycleChanged(db, event)?.catch((error: unknown) => {
			logger.error("agent_run_lifecycle_changed routine-run finalize reaction failed", {
				sourceId: event.sourceId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	});

	return () => {
		unsubscribeEnded();
		unsubscribeLifecycle();
		registeredBuses.delete(eventBus);
	};
}
