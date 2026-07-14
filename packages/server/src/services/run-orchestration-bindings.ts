/**
 * @lore AU19 Increment 3c: `@hyperidle/run-orchestration`'s `executeAgentRunRequest`/
 * `getAgentRunLifecycle`/`listAgentRunLifecycleBySource`/
 * `recoverRunningAgentSessionRequests`/`consumeAgentSessionRequest`/
 * `bootAgentLayer`/`drainAgentSessionRequests`/
 * `markRunningAgentSessionRequestsForShutdown`/`registerWorkerWsRoute` need
 * injected `sessionRequests` (real, same-layer), `sessionLifecycle` (INTERIM
 * forward-ref), `sessionProvisioner` (INTERIM forward-ref), `dispatch`
 * (INTERIM forward-ref), and `harness-registry`'s `AdapterPool`/
 * `RemoteHarnessAdapter` (INTERIM forward-ref) ports (Mechanism C —
 * `run-orchestration` never imports another Service). This module builds
 * each bound singleton ONCE, at the composition root, so every real call
 * site (`agent-work-assistant.ts`, `session-requests-bindings.ts`,
 * `server-factory.ts`) imports the already-wired function — same
 * factory-curry idiom as `session-requests-bindings.ts`'s own
 * `agentWorkIntentWorkerDeps` (Increment 3b).
 *
 * @lore circular-import-by-construction: this module and `agent-work-assistant.ts`
 * import each other (this file needs `executeAssistantRequest` for the
 * `dispatch` port; `agent-work-assistant.ts` needs `executeAgentRunRequest`
 * from here). Safe under ESM: every cross-reference is used INSIDE a function
 * body (the `dispatchPort.executeAssistantRequest` method, `runTurnInternal`'s
 * call), never at module top-level — both modules finish initial evaluation
 * (and populate their live export bindings) before either function is ever
 * actually invoked. Pre-existing shape (`session-requests-bindings.ts`'s
 * `consumeAgentSessionRequest` alias already reached back into
 * `agent-run-boundary.ts`); this migration only relocates which file the
 * cross-reference passes through.
 *
 * `sessionRequests`' port methods map 1:1 onto real `@hyperidle/session-requests`
 * exports (identical signatures, zero opacity — no cast needed).
 * `sessionLifecycle`/`sessionProvisioner`/`dispatch`/the `AdapterPool` factory
 * wire to `session-lifecycle.ts`/`session-provisioning.ts`/
 * `agent-work-assistant.ts`/`harness/remote-harness-adapter.ts` — still-flat
 * `packages/server` files (not yet migrated). Each opaque-typed port method
 * (`crashSession`'s `context`, `admitSession`/`runSession`'s `deps`/`params`/
 * `admitted`, `executeAssistantRequest`'s `deps`, the remote-adapter
 * factory's `registration`) needs exactly ONE documented boundary-crossing
 * cast recovering the real wide type from the Mechanism-C-narrowed one — the
 * SAME real object flows through unchanged at runtime, only the TYPE was
 * narrowed crossing the package boundary. Same established idiom as
 * `worker-ws.ts`'s pre-existing `ws as never`. `AdapterPool`'s own methods
 * (`has`/`register`/`unregister`/`pause`/`resume`) need NO cast — the real
 * class's method signatures already satisfy `RunOrchestrationAdapterPool`
 * structurally (TS method-shorthand bivariance), so the live instance is
 * passed straight through.
 */

import type { AgentSessionRequest, HyperIdleDb } from "@hyperidle/db";
import {
	AGENT_LAYER_REAP_INTERVAL_MS,
	type AgentLayerBootDeps,
	bootAgentLayer as bootAgentLayerInternal,
	type ConsumeAgentSessionRequestOptions,
	classifyAdmissionFailure,
	drainAgentSessionRequests as drainAgentSessionRequestsInternal,
	executeAgentRunRequest as executeAgentRunRequestInternal,
	getAgentRunLifecycle as getAgentRunLifecycleInternal,
	listAgentRunLifecycleBySource as listAgentRunLifecycleBySourceInternal,
	markRunningAgentSessionRequestsForShutdown as markRunningAgentSessionRequestsForShutdownInternal,
	type RunOrchestrationAdapterPool,
	type RunOrchestrationDispatchPort,
	type RunOrchestrationPorts,
	type RunOrchestrationProvisionDeps,
	type RunOrchestrationProvisionResult,
	type RunOrchestrationRemoteHarnessAdapterFactory,
	type RunOrchestrationSessionContext,
	type RunOrchestrationSessionLifecycleRuntime,
	type RunOrchestrationSessionProvisioner,
	type RunOrchestrationSessionRequestsPort,
	WorkerConnectionManager as RunOrchestrationWorkerConnectionManager,
	recoverRunningAgentSessionRequests as recoverRunningAgentSessionRequestsInternal,
	registerWorkerWsRoute as registerWorkerWsRouteInternal,
} from "@hyperidle/run-orchestration";
import {
	claimAgentSessionRequestById,
	claimNextAgentSessionRequest,
	findAgentSessionRequestById,
	findAgentWorkIntentSourceByRequestId,
	findExplicitSessionStartById,
	isAgentSessionRequestClaimActive,
	listAgentSessionRequestsBySource,
	listRunningAgentSessionRequests,
	markExplicitSessionStartAdmitted,
	markExplicitSessionStartFailed,
	releaseRequestClaim,
	renewAgentSessionRequestLease,
} from "@hyperidle/session-requests";
import type { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import type { AdapterPool } from "../harness/adapter-pool.js";
import { RemoteHarnessAdapter } from "../harness/remote-harness-adapter.js";
import { type AssistantTurnDeps, executeAssistantRequest } from "./agent-work-assistant.js";
import {
	crashSession,
	recoverRequestedTerminations,
	requestAgentTermination,
	type SessionContext,
	transitionAgentRunLifecycle,
} from "./session-lifecycle.js";
import {
	type AdmittedSession,
	admitSession,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	runSession,
} from "./session-provisioning.js";
import {
	drainAgentWorkIntents,
	markRequestRunning,
	reapTerminalAgentWorkIntents,
} from "./session-requests-bindings.js";

// ---------------------------------------------------------------------------
// session-requests — every method maps 1:1 onto a real export.
// ---------------------------------------------------------------------------

const sessionRequestsPort: RunOrchestrationSessionRequestsPort = {
	findAgentSessionRequestById,
	listAgentSessionRequestsBySource,
	listRunningAgentSessionRequests,
	isAgentSessionRequestClaimActive,
	claimNextAgentSessionRequest,
	claimAgentSessionRequestById,
	releaseRequestClaim,
	renewAgentSessionRequestLease,
	markRequestRunning,
	findAgentWorkIntentSourceByRequestId,
	drainAgentWorkIntents,
	reapTerminalAgentWorkIntents,
	findExplicitSessionStartById,
	markExplicitSessionStartAdmitted,
	markExplicitSessionStartFailed,
};

// ---------------------------------------------------------------------------
// session-lifecycle — INTERIM, wired to still-flat packages/server functions.
// ---------------------------------------------------------------------------

const sessionLifecyclePort: RunOrchestrationSessionLifecycleRuntime = {
	requestAgentTermination,
	recoverRequestedTerminations,
	transitionAgentRunLifecycle,
	crashSession(
		db: HyperIdleDb,
		eventBus: EventBus,
		context: RunOrchestrationSessionContext,
		costInCents: number,
		baselineCost?: number,
	): Promise<void> {
		// @lore boundary-crossing cast: `context` is the SAME real `SessionContext`
		// value `admitSession`'s concrete impl below returned — only its TYPE was
		// narrowed crossing the Mechanism-C boundary (ports.ts's top `@lore`).
		return crashSession(db, eventBus, context as SessionContext, costInCents, baselineCost);
	},
};

// ---------------------------------------------------------------------------
// session-lifecycle's admission/execution surface — INTERIM.
// ---------------------------------------------------------------------------

const sessionProvisionerPort: RunOrchestrationSessionProvisioner = {
	admitSession(deps, params, enforceResolvedModelGuard) {
		// @lore boundary-crossing cast: `deps`/`params` are the SAME real
		// `ProvisionSessionDeps`/`ProvisionSessionParams` values this Service's own
		// callers built — only narrowed in TYPE crossing the boundary.
		return admitSession(
			deps as ProvisionSessionDeps,
			params as ProvisionSessionParams,
			enforceResolvedModelGuard,
		);
	},
	runSession(deps, params, admitted, onHarnessStarted) {
		return runSession(
			deps as ProvisionSessionDeps,
			params as ProvisionSessionParams,
			admitted as AdmittedSession,
			onHarnessStarted,
		);
	},
};

// ---------------------------------------------------------------------------
// dispatch — INTERIM, wired to still-flat agent-work-assistant.ts.
// ---------------------------------------------------------------------------

const dispatchPort: RunOrchestrationDispatchPort = {
	executeAssistantRequest(deps: unknown, request: AgentSessionRequest): Promise<void> {
		// @lore boundary-crossing cast: `deps` is the real `AssistantTurnDeps` this
		// Service's own caller built — opaque-typed crossing the boundary (`dispatch`
		// has not migrated yet; `run-orchestration` never inspects its internals).
		return executeAssistantRequest(deps as AssistantTurnDeps, request);
	},
};

export const runOrchestrationPorts: RunOrchestrationPorts = {
	sessionRequests: sessionRequestsPort,
	sessionLifecycle: sessionLifecyclePort,
	sessionProvisioner: sessionProvisionerPort,
	dispatch: dispatchPort,
};

// ---------------------------------------------------------------------------
// harness-registry — INTERIM (NOT the final HarnessPort, §7.4 — a separate,
// later item builds that; see ports.ts's top `@lore`).
// ---------------------------------------------------------------------------

/** The live `AdapterPool` instance satisfies `RunOrchestrationAdapterPool` structurally — passed straight through, zero wrapper. */
export function asRunOrchestrationAdapterPool(pool: AdapterPool): RunOrchestrationAdapterPool {
	return pool;
}

/**
 * The ONE audited cast recovering `WorkerRegisterMessage` from this Service's
 * Mechanism-C-narrowed registration type (`ports.ts`'s top `@lore`) — the
 * SAME real object `worker-ws.ts` received off the wire, only its TYPE was
 * narrowed crossing the boundary. `registration`'s parameter type is already
 * `unknown` (not a cast expression), so this is a single, contained
 * assertion — `design/no-unknown-cast` bans the `X as unknown as T`
 * double-assertion shape, not an audited single cast inside a named helper.
 */
function widenToWorkerRegisterMessage(
	registration: unknown,
): ConstructorParameters<typeof RemoteHarnessAdapter>[1] {
	return registration as ConstructorParameters<typeof RemoteHarnessAdapter>[1];
}

const remoteHarnessAdapterFactory: RunOrchestrationRemoteHarnessAdapterFactory = {
	create(ws, registration) {
		// @lore boundary-crossing cast: `ws` is the SAME real `WSContext` value
		// `worker-ws.ts` received off the wire — same established idiom as this
		// file's pre-move `ws as never`.
		return new RemoteHarnessAdapter(ws as never, widenToWorkerRegisterMessage(registration));
	},
};

// ---------------------------------------------------------------------------
// Production-wired drop-in replacements — every real call site imports these,
// not `@hyperidle/run-orchestration` directly for the deps-carrying functions.
// ---------------------------------------------------------------------------

/** @lore AU6: production code must use this boundary naming — `session-requests-bindings.ts` re-exports it under the legacy alias (see this file's top `@lore`) for its own test-assertion-surface reasons; this module never declares that other name itself (au6-agent-boundary-guard bans re-declaring it as a local binding). */
export function executeAgentRunRequest(
	deps: RunOrchestrationProvisionDeps,
	request: AgentSessionRequest,
	options: ConsumeAgentSessionRequestOptions,
): Promise<RunOrchestrationProvisionResult> {
	return executeAgentRunRequestInternal(deps, request, options, runOrchestrationPorts);
}

export function getAgentRunLifecycle(
	db: HyperIdleDb,
	requestId: string,
): ReturnType<typeof getAgentRunLifecycleInternal> {
	return getAgentRunLifecycleInternal(db, requestId, runOrchestrationPorts);
}

export function listAgentRunLifecycleBySource(
	db: HyperIdleDb,
	sourceKind: Parameters<typeof listAgentRunLifecycleBySourceInternal>[1],
	sourceId: string,
): ReturnType<typeof listAgentRunLifecycleBySourceInternal> {
	return listAgentRunLifecycleBySourceInternal(db, sourceKind, sourceId, runOrchestrationPorts);
}

export function recoverRunningAgentSessionRequests(
	db: HyperIdleDb,
	eventBus: EventBus,
): ReturnType<typeof recoverRunningAgentSessionRequestsInternal> {
	return recoverRunningAgentSessionRequestsInternal(db, eventBus, runOrchestrationPorts);
}

export function bootAgentLayer(
	deps: Omit<AgentLayerBootDeps, "ports">,
): ReturnType<typeof bootAgentLayerInternal> {
	return bootAgentLayerInternal({ ...deps, ports: runOrchestrationPorts });
}

export function drainAgentSessionRequests(
	deps: Omit<AgentLayerBootDeps, "ports">,
): ReturnType<typeof drainAgentSessionRequestsInternal> {
	return drainAgentSessionRequestsInternal({ ...deps, ports: runOrchestrationPorts });
}

export function markRunningAgentSessionRequestsForShutdown(
	db: HyperIdleDb,
): ReturnType<typeof markRunningAgentSessionRequestsForShutdownInternal> {
	return markRunningAgentSessionRequestsForShutdownInternal(db, runOrchestrationPorts);
}

export function registerWorkerWsRoute(
	app: Hono,
	pool: AdapterPool,
	upgradeWebSocket: UpgradeWebSocket,
): () => void {
	return registerWorkerWsRouteInternal(
		app,
		asRunOrchestrationAdapterPool(pool),
		remoteHarnessAdapterFactory,
		upgradeWebSocket,
	);
}

/** Same wiring `registerWorkerWsRoute` uses — exported so tests can construct a `WorkerConnectionManager` with the production adapter factory without duplicating it. */
export function createWorkerConnectionManager(
	pool: AdapterPool,
): RunOrchestrationWorkerConnectionManager {
	return new RunOrchestrationWorkerConnectionManager(
		asRunOrchestrationAdapterPool(pool),
		remoteHarnessAdapterFactory,
	);
}

export type { AgentLayerBootDeps };
export { AGENT_LAYER_REAP_INTERVAL_MS, classifyAdmissionFailure };
