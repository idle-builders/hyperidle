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
/** `TransitionPorts` carries only the own-state `sessionRequests` port the "request" disposition path needs. */
type TransitionPorts = Pick<SessionLifecyclePorts, "sessionRequests">;

/** `cost_cap` is absent — the cap gate does not exist. */
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
	// @lore: persistence precedes publication — domain projections can always reload the terminal truth; execution callbacks never cross into core domains
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
	ingestion: IngestionHandle;
	/** Correlates every observability event for this session. */
	traceId: string;
	readonly requestContext?: SessionLifecycleCorrelation;
}
async function endSession(
	db: HyperIdleDb,
	eventBus: EventBus,
	context: SessionContext,
	terminalOutcome: "completed" | "not_returned" | "stopped" = "completed",
	tokensByTier?: Partial<Record<ModelTier, { prompt: number; completion: number }>>,
): Promise<void> {
	context.ingestion.dispose();

	const now = new Date().toISOString();
	// CAS terminal write — SET only WHERE state='active'; duplicate teardown or a session a different writer already finalized affects ZERO rows (no-op).
	// @lore: stopped session — state is "stopped" not "done"; terminalOutcome:"stopped" keeps lifecycle-propagation.ts (acts only on outcome==="completed") inert
	const state = terminalOutcome === "stopped" ? "stopped" : "done";
	const updated = await updateSessionRow(db, context.sessionId, state, terminalOutcome, now);

	// Gate emit on rowCount, not merely on "the UPDATE ran" — a handoff-ended session (already 'done') whose detached tail calls endSession must not emit a spurious session_ended.
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
			outcome: terminalOutcome,
			...(tokensByTier && Object.keys(tokensByTier).length > 0 ? { tokensByTier } : {}),
		});
	}

	// @lore: workspace cleanup — async rm avoids blocking event loop; skip if session awaits verdict (resume needs this dir; harness hangs if dir is gone)
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
	// Port contract guarantees dispose() does not throw; try/catch is defensive for crash-path teardown.
	try {
		context.ingestion.dispose();
	} catch {
		// Ingestion handle may already be in a bad state during crash — swallow.
	}

	// 2. Update session row.
	const now = new Date().toISOString();
	// CAS terminal write — crashing an already-terminal session affects zero rows and emits nothing.
	const updated = await updateSessionRow(db, context.sessionId, "crashed", "crashed", now);

	// 3. Emit session_ended IFF the CAS UPDATE transitioned a row.
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
				 * The session's
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
// `sessions` table — this Service owns the table; local helper keeps endSession/crashSession import-clean.
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
