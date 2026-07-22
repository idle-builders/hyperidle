import * as fs from "node:fs";
import { type AgentSessionRequest, type HyperIdleDb, sessions } from "@hyperidle/db";
import type {
	AgentSessionSourceKind,
	EventBus,
	SessionLifecycleCorrelation,
} from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import type { createProvisioner } from "./provisioner.js";

interface IngestionHandle {
	dispose(): void;
}
type SessionLifecyclePorts = Parameters<typeof createProvisioner>[0];
type TransitionPorts = Pick<SessionLifecyclePorts, "sessionRequests" | "routine">;

const TERMINATION_REASONS = [
	"user_done",
	"user_crashed",
	"handoff",
	"cost_cap",
	"shutdown",
] as const;
type AgentTerminationReason = (typeof TERMINATION_REASONS)[number];

const TERMINATION_DISPOSITIONS = {
	user_done: { state: "cancelled", failureCode: null },
	user_crashed: { state: "failed", failureCode: null },
	handoff: { state: "completed", failureCode: null },
	cost_cap: { state: "failed", failureCode: "BUDGET_EXHAUSTED" },
	shutdown: { state: "failed", failureCode: "RUNTIME_LOST" },
} as const;

function requestAgentTermination(
	db: HyperIdleDb,
	input: { requestId: string; reason: AgentTerminationReason; requestedBy?: string },
	ports: TransitionPorts,
): Promise<"accepted" | "idempotent" | "conflict" | "terminal"> {
	void ports;
	return ports.sessionRequests.transitionSessionRequest(db, {
		to: "termination-requested",
		requestId: input.requestId,
		reason: input.reason,
		requestedBy: input.requestedBy,
	}) as Promise<"accepted" | "idempotent" | "conflict" | "terminal">;
}

async function transitionAgentRunLifecycle(
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
	ports: TransitionPorts,
): Promise<void> {
	void ports;
	const row = await db.transaction(async (tx) => {
		const txDb = tx as HyperIdleDb;
		const current = await ports.sessionRequests.findSessionRequest(txDb, {
			by: "terminationReason",
			requestId: input.requestId,
		});
		if (current === undefined) return null;
		const reason = current as AgentTerminationReason | null;
		const disposition = reason ? TERMINATION_DISPOSITIONS[reason] : null;
		const effectiveState = disposition?.state ?? input.state;
		const effectiveFailureCode = disposition
			? (disposition.failureCode ?? undefined)
			: input.failureCode;
		if (input.sessionId) {
			return ports.sessionRequests.transitionSessionRequest(txDb, {
				requestId: input.requestId,
				precondition: "running",
				sessionId: input.sessionId,
				to: effectiveState,
				failureCode: effectiveFailureCode,
				errorMessage: input.errorMessage,
				requireNoTerminationReason: !reason && effectiveState === "completed",
				transaction: "existing",
			}) as Promise<AgentSessionRequest | null>;
		}
		if (!input.claimToken) {
			throw new Error(
				`transitionAgentRunLifecycle requires sessionId or claimToken for ${input.requestId}`,
			);
		}
		return ports.sessionRequests.transitionSessionRequest(txDb, {
			requestId: input.requestId,
			precondition: "claimed",
			claimToken: input.claimToken,
			to: "failed",
			failureCode: effectiveFailureCode,
			errorMessage: input.errorMessage,
			transaction: "existing",
		}) as Promise<AgentSessionRequest | null>;
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

async function recoverRequestedTerminations(
	db: HyperIdleDb,
	eventBus: EventBus,
	ports: TransitionPorts,
): Promise<number> {
	const requests = await ports.sessionRequests.listSessionRequests(db, { status: "running" });
	let recovered = 0;
	for (const request of requests) {
		const reason = await ports.sessionRequests.findSessionRequest(db, {
			by: "terminationReason",
			requestId: request.id,
		});
		if (!(reason && request.sessionId)) continue;
		const disposition = TERMINATION_DISPOSITIONS[reason as AgentTerminationReason];
		await transitionAgentRunLifecycle(
			db,
			eventBus,
			{
				requestId: request.id,
				state: disposition.state,
				sessionId: request.sessionId,
				failureCode: disposition.failureCode ?? undefined,
			},
			ports,
		);
		recovered += 1;
	}
	return recovered;
}

interface SessionContext {
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
	routineId?: string;
}
async function updateRoutineRunOnSessionEnd(
	db: HyperIdleDb,
	routineId: string,
	sessionId: string,
	outcome: "success" | "error" | "budget_exhausted",
	endedAt: string,
	costInCents: number,
	ports: TransitionPorts,
	summary?: string,
): Promise<void> {
	const run = await ports.routine.findRunningRoutineRun(db, routineId);

	if (!run) {
		return;
	}

	await ports.routine.updateRoutineRunById(db, run.id, {
		outcome,
		sessionId,
		endedAt,
		costMinor: costInCents > 0 ? costInCents : null,
		costCurrency: costInCents > 0 ? "USD" : null,
		...(summary ? { summary } : {}),
	});

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

async function endSession(
	db: HyperIdleDb,
	eventBus: EventBus,
	context: SessionContext,
	costInCents: number,
	ports: TransitionPorts,
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
async function crashSession(
	db: HyperIdleDb,
	eventBus: EventBus,
	context: SessionContext,
	costInCents: number,
	ports: TransitionPorts,
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

/** Single public transition operation for durable requests and admitted sessions. */
export function transitionRun(
	deps: {
		readonly db: HyperIdleDb;
		readonly eventBus: EventBus;
		readonly ports: TransitionPorts;
	},
	spec:
		| { readonly target: "request"; readonly intent: "recover-terminations" }
		| {
				readonly target: "request";
				readonly requestId: string;
				readonly intent: "request-termination";
				readonly reason: AgentTerminationReason;
				readonly requestedBy?: string;
		  }
		| {
				readonly target: "request";
				readonly requestId: string;
				readonly intent: "terminalize";
				readonly state: "completed" | "failed" | "cancelled";
				readonly sessionId?: string;
				readonly claimToken?: string;
				readonly failureCode?: string;
		  }
		| {
				readonly target: "session";
				readonly context: SessionContext;
				readonly disposition: "end" | "crash";
				readonly costInCents?: number;
				readonly baselineCost?: number;
				readonly routineOutcome?: "budget_exhausted";
				readonly terminalOutcome?: "completed" | "not_returned";
		  },
): Promise<unknown> {
	if (spec.target === "request") {
		if (spec.intent === "recover-terminations") {
			return recoverRequestedTerminations(deps.db, deps.eventBus, deps.ports);
		}
		return spec.intent === "request-termination"
			? requestAgentTermination(deps.db, spec, deps.ports)
			: transitionAgentRunLifecycle(deps.db, deps.eventBus, spec, deps.ports);
	}
	return spec.disposition === "end"
		? endSession(
				deps.db,
				deps.eventBus,
				spec.context,
				spec.costInCents ?? 0,
				deps.ports,
				spec.baselineCost,
				spec.routineOutcome,
				spec.terminalOutcome,
			)
		: crashSession(
				deps.db,
				deps.eventBus,
				spec.context,
				spec.costInCents ?? 0,
				deps.ports,
				spec.baselineCost,
			);
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
