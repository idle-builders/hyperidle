import * as fs from "node:fs";
import { type HyperIdleDb, sessions } from "@hyperidle/db";
import type {
	AgentSessionSourceKind,
	EventBus,
	SessionLifecycleCorrelation,
} from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import type { IngestionHandle } from "./contracts.js";
import type { SessionLifecyclePorts } from "./session-lifecycle-ports.js";

/**
 * @lore AU19 Increment 3i: real cut-over — moved here from
 * `packages/server/src/services/session-lifecycle.ts` (behavior-preserving
 * move). Every raw cross-Service touch became an injected `ports:
 * SessionLifecyclePorts` parameter (Mechanism C, see `ports.ts`):
 *  - `requestAgentTermination`/`recoverRequestedTerminations`/
 *    `transitionAgentRunLifecycle` raw-read/wrote `agentSessionRequests`
 *    directly pre-migration — closed via `ports.sessionRequests`'
 *    `requestAgentSessionTermination`/`listRunningAgentSessionRequests`/
 *    `findAgentSessionRequestTerminationReasonInTx`/
 *    `terminalizeAgentSessionRequestInTx` (see `ports.ts`'s top `@lore`).
 *  - `updateRoutineRunOnSessionEnd`'s `routine.updateRoutineById`/
 *    `updateRoutineRunById` calls — ordinary downward DI via `ports.routine`.
 *    The `costActualMinor = coalesce(...) + n` accumulation split into its
 *    own `ports.routine.incrementRoutineCost` call (closes the coalesce-
 *    ownership gap `@hyperidle/routine`'s `RoutinePatch` doc comment
 *    anticipated) — see `@hyperidle/routine`'s `incrementRoutineCost` top
 *    `@lore` for the atomicity note (unchanged: these were never
 *    transactional with each other pre-migration either).
 *  - `releaseSessionDedup` (`cost`) stays a direct `@hyperidle/db`-free,
 *    in-memory singleton import — `cost-bindings.ts`'s dedup map, not a
 *    table-owning call; unaffected by this migration (still wired the same
 *    way at the composition root, `session-lifecycle-bindings.ts`).
 */

export const TERMINATION_REASONS = [
	"user_done",
	"user_crashed",
	"handoff",
	"cost_cap",
	"shutdown",
] as const;
export type AgentTerminationReason = (typeof TERMINATION_REASONS)[number];

export const TERMINATION_DISPOSITIONS = {
	user_done: { state: "cancelled", failureCode: null },
	user_crashed: { state: "failed", failureCode: null },
	handoff: { state: "completed", failureCode: null },
	cost_cap: { state: "failed", failureCode: "BUDGET_EXHAUSTED" },
	shutdown: { state: "failed", failureCode: "RUNTIME_LOST" },
} as const;

export async function requestAgentTermination(
	db: HyperIdleDb,
	input: { requestId: string; reason: AgentTerminationReason; requestedBy?: string },
	ports: SessionLifecyclePorts,
): Promise<"accepted" | "idempotent" | "conflict" | "terminal"> {
	return ports.sessionRequests.requestAgentSessionTermination(db, input);
}

/** @lore AU9: recovery reads the durable reason; abort signals never define outcome. */
export async function recoverRequestedTerminations(
	db: HyperIdleDb,
	eventBus: EventBus,
	ports: SessionLifecyclePorts,
): Promise<number> {
	const running = await ports.sessionRequests.listRunningAgentSessionRequests(db);
	const requests = running.filter((r) => r.terminationReason != null);
	let recovered = 0;
	for (const request of requests) {
		const reason = request.terminationReason as AgentTerminationReason;
		const disposition = TERMINATION_DISPOSITIONS[reason];
		await transitionAgentRunLifecycle(
			db,
			eventBus,
			{
				requestId: request.id,
				state: disposition.state,
				sessionId: request.sessionId ?? undefined,
				failureCode: disposition.failureCode ?? undefined,
			},
			ports,
		);
		recovered += 1;
	}
	return recovered;
}

/**
 * @lore AU9 R1: this is the sole orchestration entrypoint agent-runtime call sites use
 * for a terminal transition (natural completion/failure, detached-runtime failure,
 * PATCH/handoff/shutdown/cost-cap disposition, running-recovery). It composes the
 * single low-level writer (`terminalizeAgentSessionRequestInTx`) inside one
 * transaction that FIRST re-reads the durable termination reason: teardown never
 * infers cause from an in-memory abort — if a reason is already stored, that
 * disposition wins over the caller's natural-completion guess (precedence:
 * "once a reason exists, teardown disposition wins"). `sessionId` selects the
 * post-admission precondition; `claimToken` (used when `sessionId` is absent)
 * selects the pre-admission precondition for a failure caught before
 * `markRequestRunning` ever ran.
 */
export async function transitionAgentRunLifecycle(
	db: HyperIdleDb,
	eventBus: EventBus,
	input: {
		readonly requestId: string;
		readonly state: "completed" | "failed" | "cancelled";
		readonly sessionId?: string;
		readonly claimToken?: string;
		readonly failureCode?: string;
		readonly errorMessage?: string;
	},
	ports: SessionLifecyclePorts,
): Promise<void> {
	const row = await db.transaction(async (tx) => {
		const txDb = tx as HyperIdleDb;
		const current = await ports.sessionRequests.findAgentSessionRequestTerminationReasonInTx(
			txDb,
			input.requestId,
		);
		if (current === undefined) return null;
		const reason = current as AgentTerminationReason | null;
		const disposition = reason ? TERMINATION_DISPOSITIONS[reason] : null;
		const effectiveState = disposition?.state ?? input.state;
		const effectiveFailureCode = disposition
			? (disposition.failureCode ?? undefined)
			: input.failureCode;
		if (input.sessionId) {
			return ports.sessionRequests.terminalizeAgentSessionRequestInTx(txDb, {
				requestId: input.requestId,
				precondition: "running",
				sessionId: input.sessionId,
				state: effectiveState,
				failureCode: effectiveFailureCode,
				errorMessage: input.errorMessage,
				requireNoTerminationReason: !reason && effectiveState === "completed",
			});
		}
		if (!input.claimToken) {
			throw new Error(
				`transitionAgentRunLifecycle requires sessionId or claimToken for ${input.requestId}`,
			);
		}
		return ports.sessionRequests.terminalizeAgentSessionRequestInTx(txDb, {
			requestId: input.requestId,
			precondition: "claimed",
			claimToken: input.claimToken,
			state: "failed",
			failureCode: effectiveFailureCode,
			errorMessage: input.errorMessage,
		});
	});
	if (!row) throw new Error(`Unknown agent request ${input.requestId}`);
	// @lore AU9: persistence precedes publication so domain projections can always
	// reload the terminal truth; execution callbacks never cross into core domains.
	eventBus.emit({
		type: "agent_run_lifecycle_changed",
		streamId: row.streamId,
		requestId: row.id,
		sourceKind: row.sourceKind as AgentSessionSourceKind,
		sourceId: row.sourceId,
		state: row.status as "completed" | "failed" | "cancelled",
		sessionId: row.sessionId ?? undefined,
		timestamp: Date.now(),
	});
}

export interface SessionContext {
	sessionId: string;
	agentId: string;
	taskId: string | null;
	sandboxPath: string;
	/**
	 * AU3: was `watcher: FileWatcher`. Renamed to
	 * `ingestion: IngestionHandle` during runtime boundary simplification.
	 * The IngestionHandle.dispose() replaces FileWatcher.stop() at every
	 * teardown site (endSession + crashSession).
	 */
	ingestion: IngestionHandle;
	/** Correlates every observability event for this session (H3). */
	traceId: string;
	readonly requestContext?: SessionLifecycleCorrelation;
	/**
	 * AA2: When set, this session belongs to a routine. Used by endSession/crashSession
	 * to update routine_runs outcome and routines.lastRunSummary on completion.
	 */
	routineId?: string;
}

// @lore O1: resolveCostBaseline and costDelta removed from session_ended
// as part of kernel/strategy separation. Session cost tracking is a
// strategy concern, not kernel. The observability layer no longer receives
// costDelta — intentional gap, cost signals belong in the strategy layer.

/**
 * AA2: Update the routine_runs row and routines last-run fields when a routine
 * session ends (normally or via crash).
 *
 * Finds the routine_run row with outcome="running" for this routine, then
 * updates it with the final outcome, sessionId, endedAt, cost, and summary.
 * Also updates routines.lastRunAt and routines.lastRunSummary.
 *
 * @lore AA2: Match on routineId+outcome="running", NOT sessionId. The
 * routine_runs row is inserted with outcome="running" and sessionId=NULL
 * by the trigger handler before provisionSession is called. The sessionId
 * back-population happens AFTER provisionSession returns — too late for this
 * hook to use it as a filter. Coalescing guarantees at most one "running" row
 * per routine at any time, so routineId+outcome is a safe unique key.
 * sessionId is set here in the UPDATE so the historical record is complete.
 *
 * @lore AA3: outcome widened to include "budget_exhausted" so the per-run cap
 * enforcement path can write the correct outcome in a single write (no
 * write-then-overwrite). Passing the outcome through avoids the failure window
 * where endSession succeeds but the override fails (critique Warning 1).
 */
async function updateRoutineRunOnSessionEnd(
	db: HyperIdleDb,
	routineId: string,
	sessionId: string,
	outcome: "success" | "error" | "budget_exhausted",
	endedAt: string,
	costInCents: number,
	ports: SessionLifecyclePorts,
	summary?: string,
): Promise<void> {
	// Find the routine_run row that is still "running" for this routine.
	// NOTE: Do NOT filter by sessionId — it may be NULL on the row when this
	// hook fires (see @lore above).
	// @lore AU13 addendum §A6: this call site currently passes the pooled `db`
	// (not a `tx`) — findRunningRoutineRun accepts whatever executor the caller
	// passes; do not hard-code tx here.
	const run = await ports.routine.findRunningRoutineRun(db, routineId);

	if (!run) {
		// No matching running run — pre-AA2 session or already finalized. No-op.
		return;
	}

	await ports.routine.updateRoutineRunById(db, run.id, {
		outcome,
		// Set sessionId here so the historical record is complete even though
		// it was NULL when the row was first inserted.
		sessionId,
		endedAt,
		costMinor: costInCents > 0 ? costInCents : null,
		costCurrency: costInCents > 0 ? "USD" : null,
		...(summary ? { summary } : {}),
	});

	// AF10 AC2: increment routines.costActualMinor (cumulative, += per run).
	// costInCents is the per-run session total — a true delta w.r.t. the running
	// cumulative field. Uses an atomic coalesce accumulator (mirrors
	// recordCostAndCheck cost-cap.ts:247) to avoid lost updates under
	// concurrent routine runs.
	// @lore AF10: currency literal "USD" matches routineRuns.costCurrency write above.
	// Single-currency factory assumption — see architecture.md §2 tech-debt note.
	if (costInCents > 0) {
		await ports.routine.incrementRoutineCost(db, routineId, costInCents, "USD");
	}
	if (summary) {
		await ports.routine.updateRoutineById(db, routineId, {
			lastRunAt: endedAt,
			lastRunSummary: summary,
		});
	} else {
		await ports.routine.updateRoutineById(db, routineId, { lastRunAt: endedAt });
	}
}

/**
 * End a session gracefully: flush ingestion, update DB, emit event, clean up workspace.
 *
 * @param routineRunOutcome - AA3: Optional override for the routine_run outcome.
 *   When "budget_exhausted", the routine_run is recorded with that outcome directly
 *   (avoids write-then-overwrite race window; critique Warning 1).
 * @param terminalOutcome - AL6 v2 WARNING-A: Optional terminal session outcome override.
 *   When provided, overrides the hardcoded "completed" outcome in BOTH the persisted
 *   sessions row AND the session_ended bus event. Used to persist "not_returned" outcome
 *   so the DB row and bus event are consistent with ProvisionSessionResult.outcome.
 *   Defaults to "completed" for backwards compat (all existing call sites are unaffected).
 *
 * @lore AL6 v2: The previous signature had routineRunOutcome typed as "budget_exhausted"
 * and only touched the routine_run row — not the sessions row or session_ended event.
 * Adding terminalOutcome as a separate parameter keeps existing callers unchanged and
 * lets the not_returned path thread the outcome through all three write sites.
 */
export async function endSession(
	db: HyperIdleDb,
	eventBus: EventBus,
	context: SessionContext,
	costInCents: number,
	ports: SessionLifecyclePorts,
	baselineCost?: number,
	routineRunOutcome?: "budget_exhausted",
	terminalOutcome: "completed" | "not_returned" = "completed",
): Promise<void> {
	// 1. Dispose ingestion handle (final flush).
	// @lore AK2 §5b: was `context.watcher.stop()`. Renamed to `context.ingestion.dispose()`
	// dispose() must not throw during teardown.
	context.ingestion.dispose();

	// 2. Update session row.
	// @lore O2: cost, costMinor, costCurrency columns stripped from sessions table.
	// costInCents parameter retained for API compatibility but no longer written to DB.
	// Cost tracking is now a strategy concern handled at the fabric layer.
	void baselineCost;
	void costInCents;
	const now = new Date().toISOString();
	// AF7 §4.3 (Z8-094/095): CAS terminal write. SET only WHERE state='active', so
	// a duplicate teardown — or a teardown for a session a different writer already
	// finalized (e.g. a handoff that set state='done') — affects ZERO rows and is a
	// no-op. The runtime is the SOLE terminal-state writer for a session it runs.
	//
	// AL6 v2 WARNING-A: `terminalOutcome` overrides the previously hardcoded "completed"
	// in BOTH the row write and the event emit. This ensures a not_returned turn is
	// persisted correctly in the DB and carried on the bus — not just in the in-memory
	// ProvisionSessionResult. Passing "not_returned" here is what gives AC1/AC3 real
	// teeth at the persistence layer.
	const updated = await updateSessionRow(db, context.sessionId, "done", terminalOutcome, now);

	// 3. Emit session_ended IFF the CAS UPDATE actually transitioned a row.
	// HARD INVARIANT (AF7 §4.3): gate the emit on rowCount, NOT merely on "the
	// UPDATE ran". A handoff-ended session (already 'done') whose detached
	// runSession tail later calls endSession would otherwise emit a spurious
	// session_ended that handoff is forbidden to emit (handoff-protocol.ts).
	if (updated) {
		eventBus.emit({
			type: "session_ended",
			streamId: context.sessionId,
			sessionId: context.sessionId,
			agentId: context.agentId,
			taskId: context.taskId,
			...(context.requestContext
				? {
						requestId: context.requestContext.requestId,
						sourceKind: context.requestContext.sourceKind,
						sourceId: context.requestContext.sourceId,
						sourceCorrelation: context.requestContext.sourceCorrelation,
					}
				: {}),
			timestamp: Date.now(),
			// AL6 v2: use terminalOutcome (not hardcoded "completed") so not_returned
			// turns surface correctly on the bus.
			outcome: terminalOutcome,
		});
	}

	// 4. AA2: If this is a routine session, update the routine_run row.
	// AA3: routineRunOutcome defaults to "success"; "budget_exhausted" is passed through
	// from the per-run cap enforcement path to avoid write-then-overwrite (critique Warning 1).
	// Only run routine-run finalization when WE performed the terminal transition.
	if (updated && context.routineId) {
		await updateRoutineRunOnSessionEnd(
			db,
			context.routineId,
			context.sessionId,
			routineRunOutcome ?? "success",
			now,
			costInCents,
			ports,
		);
	}

	// 5. (Dedup state reclaimed automatically via the EventBus subscription
	//    installed by `startSentinel` — see `installDedupReleaser` in cost-cap.ts.
	//    The direct call was belt-and-suspenders; removed in AU20 Am3.)

	// 6. Delete workspace directory
	// @lore I6: use async fs.promises.rm() instead of sync fs.rmSync() to avoid
	// blocking the event loop during large workspace cleanup.
	try {
		await fs.promises.rm(context.sandboxPath, { recursive: true, force: true });
	} catch {
		// Directory may already be gone — safe to ignore.
	}
}

/**
 * Crash a session: same as end but state=crashed, outcome=crashed,
 * with try-catch around ingestion.dispose().
 */
export async function crashSession(
	db: HyperIdleDb,
	eventBus: EventBus,
	context: SessionContext,
	costInCents: number,
	ports: SessionLifecyclePorts,
	baselineCost?: number,
): Promise<void> {
	// 1. Try to dispose ingestion handle (may be in a bad state during crash).
	// @lore AK2 §5b: was `context.watcher.stop()`. Renamed to
	// `context.ingestion.dispose()`. The port contract guarantees dispose() does
	// not throw, but the try/catch is belt-and-suspenders — crash-path teardown
	// is defensive (behaviour-identical to the old try { watcher.stop() } catch {}).
	try {
		context.ingestion.dispose();
	} catch {
		// Ingestion handle may already be in a bad state during crash — swallow.
	}

	// 2. Update session row.
	// @lore O2: cost, costMinor, costCurrency columns stripped from sessions table.
	void baselineCost;
	void costInCents;
	const now = new Date().toISOString();
	// AF7 §4.3: CAS terminal write — see endSession. Crashing an already-terminal
	// session affects zero rows and emits nothing.
	const updated = await updateSessionRow(db, context.sessionId, "crashed", "crashed", now);

	// 3. Emit session_ended IFF the CAS UPDATE transitioned a row (AF7 §4.3 invariant).
	if (updated) {
		eventBus.emit({
			type: "session_ended",
			streamId: context.sessionId,
			sessionId: context.sessionId,
			agentId: context.agentId,
			taskId: context.taskId,
			...(context.requestContext
				? {
						requestId: context.requestContext.requestId,
						sourceKind: context.requestContext.sourceKind,
						sourceId: context.requestContext.sourceId,
						sourceCorrelation: context.requestContext.sourceCorrelation,
					}
				: {}),
			timestamp: Date.now(),
			outcome: "crashed",
		});
	}

	// 4. AA2: If this is a routine session, update the routine_run row with error outcome.
	if (updated && context.routineId) {
		await updateRoutineRunOnSessionEnd(
			db,
			context.routineId,
			context.sessionId,
			"error",
			now,
			costInCents,
			ports,
		);
	}

	// 5. (Dedup state reclaimed automatically via the EventBus subscription —
	//    see `installDedupReleaser` in cost-cap.ts. AU20 Am3.)

	// Note: Do NOT delete workspace on crash -- knowledge is preserved in DB
	// and workspace may be needed for debugging
}

// ---------------------------------------------------------------------------
// `sessions` table access — UNOWNED_SHARED_TABLES (table-ownership-guard.ts
// exemption, unaffected by this migration, same as `handoff-protocol.ts`'s
// own direct `sessions` access). Kept as a tiny local helper (not a port —
// no Service owns this table) so `endSession`/`crashSession` stay
// import-clean of `@hyperidle/db`'s table object in their own bodies.
// ---------------------------------------------------------------------------

async function updateSessionRow(
	db: HyperIdleDb,
	sessionId: string,
	state: "done" | "crashed",
	outcome: "completed" | "not_returned" | "crashed",
	endedAt: string,
): Promise<boolean> {
	const updated = await db
		.update(sessions)
		.set({ state, outcome, endedAt })
		.where(and(eq(sessions.id, sessionId), eq(sessions.state, "active")))
		.returning({ id: sessions.id });
	return updated.length > 0;
}
