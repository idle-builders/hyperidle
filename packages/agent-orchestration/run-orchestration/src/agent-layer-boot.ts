import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus, type ModelTier, type ResolvedModel } from "@hyperidle/shared";
import {
	executeAgentRunRequest,
	recoverRunningAgentSessionRequests,
} from "./agent-run-boundary.js";
import type { RunOrchestrationPorts, RunOrchestrationProvisionDeps } from "./ports.js";

/**
 * @lore AU19 Increment 3c: real cut-over — moved here from
 * `packages/server/src/services/agent-layer-boot.ts` (behavior-preserving
 * move). Every `@hyperidle/session-requests` (real, same-layer),
 * `session-lifecycle` (INTERIM forward-ref), and `dispatch` (INTERIM
 * forward-ref) touch converts to `deps.ports` (Mechanism C — see `ports.ts`'s
 * top `@lore`). `agentSessionRequests`/`explicitSessionStarts` raw table
 * reads/writes (the running-request shutdown sweep; the explicit-start
 * requested-model-tier read + admitted/failed projection) convert to the new
 * `@hyperidle/session-requests` exports this migration added
 * (`listRunningAgentSessionRequests`, `findExplicitSessionStartById`,
 * `markExplicitSessionStartAdmitted`, `markExplicitSessionStartFailed`) —
 * both tables are `session-requests`-owned (`TABLE_OWNER`).
 */

export interface AgentLayerBootDeps {
	readonly db: HyperIdleDb;
	readonly eventBus?: EventBus;
	readonly runtime?: RunOrchestrationProvisionDeps;
	readonly sandboxBasePath?: string;
	readonly resolveModel?: (tier: ModelTier) => Promise<ResolvedModel | undefined>;
	/** Opaque — `dispatch`-owned `AssistantTurnDeps` (INTERIM forward-ref). Never inspected here, only forwarded whole to `ports.dispatch.executeAssistantRequest`. */
	readonly assistantTurn?: unknown;
	readonly ports: RunOrchestrationPorts;
}

/** @lore AU9: every recovery/reap primitive needs a bus; boot always constructs one when absent. */
function resolveEventBus(deps: AgentLayerBootDeps): EventBus {
	return deps.eventBus ?? new EventBus();
}

/** 6h cadence for the terminal-intent/explicit-start/task-attempt reaper. */
export const AGENT_LAYER_REAP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Request custody is separate from intent handoff: only this drain executes rows. */
export async function drainAgentSessionRequests(deps: AgentLayerBootDeps): Promise<number> {
	if (!deps.runtime) return 0;
	const runtime = deps.runtime;
	let consumed = 0;
	for (;;) {
		const request = await deps.ports.sessionRequests.claimNextAgentSessionRequest(
			deps.db,
			"agent-layer",
			{ now: new Date(), leaseMs: 30_000 },
		);
		if (!request) return consumed;
		// @lore AU9: explicitSessionStarts.requestId is only populated by THIS
		// function's own success write below — before admission it is still null,
		// so looking the row up `WHERE requestId = request.id` silently matches
		// zero rows both for the pre-admission tier read and (worse) the failure
		// projection, which then never surfaces a terminal code to the poller.
		// The correlated intent's sourceId is the durable link the whole way
		// through — resolve the explicit-session-start row through it instead.
		const correlatedIntent = await deps.ports.sessionRequests.findAgentWorkIntentSourceByRequestId(
			deps.db,
			request.id,
		);
		const explicitStartId =
			correlatedIntent?.sourceKind === "explicit_session_start" ? correlatedIntent.sourceId : null;
		try {
			if (request.sourceKind === "assistant") {
				if (!deps.assistantTurn) {
					await deps.ports.sessionRequests.releaseRequestClaim(deps.db, request.id);
					return consumed;
				}
				await deps.ports.dispatch.executeAssistantRequest(deps.assistantTurn, request);
			} else {
				let tier: ModelTier = "workhorse";
				if (explicitStartId) {
					const start = await deps.ports.sessionRequests.findExplicitSessionStartById(
						deps.db,
						explicitStartId,
					);
					tier = (start?.requestedModelTier as ModelTier | null) ?? tier;
				}
				const resolvedModel = await deps.resolveModel?.(tier);
				const result = await executeAgentRunRequest(
					runtime,
					request,
					{
						sandboxBasePath: deps.sandboxBasePath ?? "/tmp/hyperidle-workspaces",
						modelTier: tier,
						resolvedModel,
						detachAfterAdmission: true,
					},
					deps.ports,
				);
				if (explicitStartId) {
					await deps.ports.sessionRequests.markExplicitSessionStartAdmitted(deps.db, {
						id: explicitStartId,
						requestId: request.id,
						sessionId: result.sessionId,
					});
				}
			}
			consumed += 1;
		} catch (error) {
			const failure = classifyAdmissionFailure(error);
			// @lore AU9 R1: executeAgentRunRequest (via runClaimedRequest) already
			// terminalizes the request itself before rethrowing — for
			// ConcurrencyLimitError/CostCapExceededError it releases the claim back
			// to pending (retryable), for every other error it terminalizes to
			// failed through the single terminal writer. Calling
			// transitionAgentRunLifecycle again here would either double-terminalize
			// (CAS finds zero rows — a thrown "Unknown agent request", the exact
			// silent-no-op-turned-crash class R1 exists to kill) or incorrectly
			// terminalize a legitimately-retryable released claim. This catch's only
			// remaining job is the family-specific explicit-session-start projection.
			// (executeAssistantRequest never throws here — it maps failures to
			// persisted notices internally.)
			if (explicitStartId) {
				await deps.ports.sessionRequests.markExplicitSessionStartFailed(deps.db, {
					id: explicitStartId,
					failureCode: failure.code,
				});
			}
		}
	}
}

export type AgentAdmissionFailureCode =
	| "COST_CAP_EXCEEDED"
	| "CONCURRENCY_LIMIT"
	| "MISSING_CREDENTIAL"
	| "NO_ELIGIBLE_HARNESS"
	| "INTERNAL_ERROR";

/** Stable public projection; private runtime messages never cross the API boundary. */
export function classifyAdmissionFailure(error: unknown): {
	readonly code: AgentAdmissionFailureCode;
	readonly status: 422 | 429 | 500;
} {
	const name = error instanceof Error ? error.name : "Error";
	switch (name) {
		case "CostCapExceededError":
			return { code: "COST_CAP_EXCEEDED", status: 422 };
		case "ConcurrencyLimitError":
			return { code: "CONCURRENCY_LIMIT", status: 429 };
		case "MissingCredentialError":
			return { code: "MISSING_CREDENTIAL", status: 500 };
		case "NoEligibleHarnessError":
			return { code: "NO_ELIGIBLE_HARNESS", status: 422 };
		default:
			return { code: "INTERNAL_ERROR", status: 500 };
	}
}

/**
 * @lore AU9 Shutdown/cost-cap callers: the process disposer stores `shutdown` on
 * every still-running correlated request before it aborts them — through
 * `requestAgentTermination` then the single terminal writer, never a bare abort.
 * A recovering boot (or this same process's own recovery sweep next start) then
 * disposes each to `failed/RUNTIME_LOST` via the durable reason, not a generic
 * guess. Best-effort: process teardown does not block on this.
 */
export async function markRunningAgentSessionRequestsForShutdown(
	db: HyperIdleDb,
	ports: RunOrchestrationPorts,
): Promise<number> {
	const running = await ports.sessionRequests.listRunningAgentSessionRequests(db);
	let marked = 0;
	for (const request of running) {
		const result = await ports.sessionLifecycle.requestAgentTermination(db, {
			requestId: request.id,
			reason: "shutdown",
		});
		if (result === "accepted") marked += 1;
	}
	return marked;
}

/**
 * Opaque composition-root seam. Domain code gets no create/execute callback.
 *
 * @lore AU9 Boot wiring: an awaited first sweep runs before anything else observes
 * readiness — recover running-request custody (adopt-or-RUNTIME_LOST), recover
 * durably-stored termination causes that never reached teardown (crash after
 * HTTP 202: shutdown/cost-cap/user causes), then reap eligible terminal rows.
 * Only after that sweep does the intent/request drain start, scheduled every 1s,
 * with the reaper additionally scheduled every 6h.
 */
export async function bootAgentLayer(deps: AgentLayerBootDeps): Promise<() => void> {
	const runtime = deps.runtime;
	const eventBus = resolveEventBus(deps);
	await recoverRunningAgentSessionRequests(deps.db, eventBus, deps.ports);
	await deps.ports.sessionLifecycle.recoverRequestedTerminations(deps.db, eventBus);
	await deps.ports.sessionRequests.reapTerminalAgentWorkIntents(deps.db);
	let draining = false;
	const wake = async () => {
		if (draining) return;
		draining = true;
		try {
			await deps.ports.sessionRequests.drainAgentWorkIntents(deps.db);
			if (runtime) await drainAgentSessionRequests(deps);
		} finally {
			draining = false;
		}
	};
	await wake();
	// EventBus is a latency hint only; polling remains the process-death recovery path.
	const unsubscribe = deps.eventBus?.on("*", () => void wake());
	const timer = setInterval(() => void wake(), 1_000);
	const reapTimer = setInterval(
		() => void deps.ports.sessionRequests.reapTerminalAgentWorkIntents(deps.db),
		AGENT_LAYER_REAP_INTERVAL_MS,
	);
	reapTimer.unref();
	timer.unref();
	return () => {
		clearInterval(timer);
		clearInterval(reapTimer);
		unsubscribe?.();
	};
}
