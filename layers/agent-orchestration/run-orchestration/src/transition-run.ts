import * as fs from "node:fs";
import { type AgentSessionRequest, type HyperIdleDb, sessions } from "@hyperidle/db";
import type {
	AgentSessionSourceKind,
	ModelTier,
	SessionLifecycleCorrelation,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { and, eq } from "drizzle-orm";
import type { createProvisioner } from "./provisioner.js";
import { sessionAwaitsVerdict } from "./review-sessions.js";

interface IngestionHandle {
	dispose(): void;
}
type SessionLifecyclePorts = Parameters<typeof createProvisioner>[0];
/**
 * AU21 §9 Increment 4 (Decision B″ item 3): `routine` dropped from this Pick.
 * `endSession`/`crashSession` no longer write `routineRuns` directly — the
 * finalize payload rides the existing `session_ended` emit (additive
 * `routineRunOutcome` field, `@hyperidle/domain-model`'s
 * `SessionEndedEvent`) and a NEW core-api subscriber
 * (`routine-run-session-end-reactions.ts`) performs the write from inside
 * core-api. `TransitionPorts` now carries only the own-state
 * `sessionRequests` port the "request" disposition path still needs.
 */
type TransitionPorts = Pick<SessionLifecyclePorts, "sessionRequests">;

/** AU21 Increment 14a: `cost_cap` reason deleted — the cap gate no longer exists. */
const TERMINATION_REASONS = ["user_done", "user_crashed", "handoff", "shutdown"] as const;
type AgentTerminationReason = (typeof TERMINATION_REASONS)[number];

const TERMINATION_DISPOSITIONS = {
	user_done: { state: "cancelled", failureCode: null },
	user_crashed: { state: "failed", failureCode: null },
	handoff: { state: "completed", failureCode: null },
	shutdown: { state: "failed", failureCode: "RUNTIME_LOST" },
} as const;

function requestAgentTermination(
	db: HyperIdleDb,
	input: { requestId: string; reason: AgentTerminationReason; requestedBy?: string },
	ports: TransitionPorts,
): Promise<"accepted" | "idempotent" | "conflict" | "terminal"> {
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
		// Read back off the row the CAS just wrote, not off `input` — the row is
		// the durable truth, and a termination reason may have overridden the
		// caller's own code (see `TERMINATION_DISPOSITIONS` above).
		failureCode: row.errorCode ?? undefined,
		errorMessage: row.errorMessage ?? undefined,
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
async function endSession(
	db: HyperIdleDb,
	eventBus: EventBus,
	context: SessionContext,
	terminalOutcome: "completed" | "not_returned" | "stopped" = "completed",
	tokensByTier?: Partial<Record<ModelTier, { prompt: number; completion: number }>>,
): Promise<void> {
	// 1. Dispose ingestion handle (final flush).
	// @lore AK2 §5b: was `context.watcher.stop()`. Renamed to `context.ingestion.dispose()`
	// dispose() must not throw during teardown.
	context.ingestion.dispose();

	// 2. Update session row.
	const now = new Date().toISOString();
	// AF7 §4.3 (Z8-094/095): CAS terminal write. SET only WHERE state='active', so
	// a duplicate teardown — or a teardown for a session a different writer already
	// finalized (e.g. a handoff that set state='done') — affects ZERO rows and is a
	// no-op. The runtime is the SOLE terminal-state writer for a session it runs.
	//
	// WARNING-A: `terminalOutcome` overrides the previously hardcoded "completed"
	// in BOTH the row write and the event emit. This ensures a not_returned turn is
	// persisted correctly in the DB and carried on the bus — not just in the in-memory
	// ProvisionSessionResult. Passing "not_returned" here is what gives AC1/AC3 real
	// teeth at the persistence layer.
	//
	// @lore A stopped session writes state "stopped", not "done" — the
	// abort path (provisioner.ts's own `stopRequested` flag) threads
	// `terminalOutcome: "stopped"` here so `lifecycle-propagation.ts` (which
	// only acts on `outcome==='completed'`) stays inert on a stop.
	const state = terminalOutcome === "stopped" ? "stopped" : "done";
	const updated = await updateSessionRow(db, context.sessionId, state, terminalOutcome, now);

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
			// Use terminalOutcome (not hardcoded "completed") so not_returned
			// turns surface correctly on the bus.
			outcome: terminalOutcome,
			// AU21 §9 Increment 4 (Decision B″ item 3): the routine-run finalize
			// payload rides the SAME event — no direct `routineRuns` write here
			// anymore. AU21 Increment 14a: the "budget_exhausted" per-run-cap
			// outcome is deleted along with the cap gate. A core-api subscriber
			// (`routine-run-session-end-reactions.ts`) performs the write.
			//
			// @lore A stop finalizes a routine run as "error", not
			// "success" — the routine's own run history must not read a killed
			// run as a clean finish.
			...(context.routineId
				? {
						routineRunOutcome:
							terminalOutcome === "stopped" ? ("error" as const) : ("success" as const),
					}
				: {}),
			// AU21 §9 Increment 12 (Decision H3), Wave D: the session's
			// accumulated per-tier token counts ride this SAME event — no direct
			// `bets.tokensActualJson` write here anymore. A core-api subscriber
			// (`work-session-end-reactions.ts`) merges them onto the owning bet.
			...(tokensByTier && Object.keys(tokensByTier).length > 0 ? { tokensByTier } : {}),
		});
	}

	// 6. Delete workspace directory
	// @lore I6: use async fs.promises.rm() instead of sync fs.rmSync() to avoid
	// blocking the event loop during large workspace cleanup.
	//
	// @lore BA2: unless a human owes this session an answer. A session that ended
	// by filing a review is not finished, it is waiting — a human may take days —
	// and when the verdict comes the agent is resumed IN THIS DIRECTORY. Deleting
	// it now does not merely lose the agent's files: the resume spawns the harness
	// with a working directory that no longer exists, and it hangs instead of
	// failing, so the answer reaches nobody and nothing anywhere says why. This is
	// the delete that matters — `workspace.destroy` in the provisioner removes an
	// already-removed tree — so a guard placed only there does nothing.
	if (await sessionAwaitsVerdict(db, context.sessionId)) return;
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
	tokensByTier?: Partial<Record<ModelTier, { prompt: number; completion: number }>>,
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
			// AU21 §9 Increment 4 (Decision B″ item 3): crash always finalizes the
			// routine run to "error" — carried on the same event, no direct write.
			...(context.routineId ? { routineRunOutcome: "error" as const } : {}),
			// AU21 §9 Increment 12 (Decision H3), Wave D: see endSession's identical
			// comment — accumulated tokens ride this same event, no direct write.
			...(tokensByTier && Object.keys(tokensByTier).length > 0 ? { tokensByTier } : {}),
		});
	}

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
				readonly errorMessage?: string;
		  }
		| {
				readonly target: "session";
				readonly context: SessionContext;
				readonly disposition: "end" | "crash";
				readonly terminalOutcome?: "completed" | "not_returned" | "stopped";
				/**
				 * AU21 §9 Increment 12 (Decision H3), Wave D: the session's
				 * accumulated per-tier token counts, carried through onto the
				 * `session_ended` emit's additive `tokensByTier` field — see
				 * `endSession`/`crashSession`'s own comment.
				 */
				readonly tokensByTier?: Partial<Record<ModelTier, { prompt: number; completion: number }>>;
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
		? endSession(deps.db, deps.eventBus, spec.context, spec.terminalOutcome, spec.tokensByTier)
		: crashSession(deps.db, deps.eventBus, spec.context, spec.tokensByTier);
}

// ---------------------------------------------------------------------------
// `sessions` table access. This Service OWNS the table, so naming it here is
// the point rather than an exemption. Kept as a tiny local helper so
// `endSession`/`crashSession` stay import-clean of `@hyperidle/db`'s table
// object in their own bodies. Deliberately NOT merged with `session-store.ts`'s
// `endSessionByCas`: the two share a CAS shape but not a field set, and both
// now live inside the owner — which is the whole point. Consolidating them is a
// separate judgement.
// ---------------------------------------------------------------------------

async function updateSessionRow(
	db: HyperIdleDb,
	sessionId: string,
	state: "done" | "crashed" | "stopped",
	outcome: "completed" | "not_returned" | "crashed" | "stopped",
	endedAt: string,
): Promise<boolean> {
	const updated = await db
		.update(sessions)
		.set({ state, outcome, endedAt })
		.where(and(eq(sessions.id, sessionId), eq(sessions.state, "active")))
		.returning({ id: sessions.id });
	return updated.length > 0;
}
