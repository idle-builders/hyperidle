/**
 * Barrel for @hyperidle/run-orchestration (agent-orchestration Layer).
 *
 * Typed functions only. This Service owns zero tables (architecture §4
 * roster) — no Table ACL barrel-discipline concern here (no raw `pgTable`
 * object could leak through this barrel).
 *
 * @lore AU19 Increment 3c: real cut-over — `agent-run-boundary.ts`/
 * `agent-session-runtime.ts`/`agent-layer-boot.ts`/`worker-ws.ts` moved here
 * from `packages/server/src/services/` (behavior-preserving move, aside from
 * every outbound edge becoming an injected `ports: RunOrchestrationPorts`
 * parameter — Mechanism C, see `ports.ts`'s top `@lore`). Real outbound edges
 * (`session-requests`, ordinary same-layer) plus three INTERIM
 * forward-references (`session-lifecycle`, `dispatch`, `harness-registry`'s
 * not-yet-migrated bulk) became injected DI ports.
 */

export {
	AGENT_LAYER_REAP_INTERVAL_MS,
	type AgentAdmissionFailureCode,
	type AgentLayerBootDeps,
	bootAgentLayer,
	classifyAdmissionFailure,
	drainAgentSessionRequests,
	markRunningAgentSessionRequestsForShutdown,
} from "./agent-layer-boot.js";
export {
	type AgentRunLifecycle,
	type AgentRunLifecycleState,
	executeAgentRunRequest,
	getAgentRunLifecycle,
	listAgentRunLifecycleBySource,
	recoverRunningAgentSessionRequests,
} from "./agent-run-boundary.js";
export {
	admitOnlyWithRequestLease,
	type ConsumeAgentSessionRequestOptions,
	consumeAgentSessionRequest,
	reserveOrAdoptSession,
} from "./agent-session-runtime.js";
export type {
	RunOrchestrationAdapterMeta,
	RunOrchestrationAdapterPool,
	RunOrchestrationAdmittedSession,
	RunOrchestrationClaimOptions,
	RunOrchestrationDispatchPort,
	RunOrchestrationPorts,
	RunOrchestrationProvisionDeps,
	RunOrchestrationProvisionParams,
	RunOrchestrationProvisionResult,
	RunOrchestrationRemoteHarnessAdapterFactory,
	RunOrchestrationRemoteWorkerAdapter,
	RunOrchestrationSessionContext,
	RunOrchestrationSessionLifecycleRuntime,
	RunOrchestrationSessionProvisioner,
	RunOrchestrationSessionRequestsPort,
	RunOrchestrationTerminationReason,
	RunOrchestrationWorkIntentSource,
} from "./ports.js";
export { registerWorkerWsRoute, WorkerConnectionManager } from "./worker-ws.js";
