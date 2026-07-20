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
 *
 * @lore AU20 B2a: `context-assembly` folded in — all exports from
 * `@hyperidle/context-assembly` now re-exported here. Consumers that previously
 * imported from `@hyperidle/context-assembly` now import from
 * `@hyperidle/run-orchestration`. The satellite package is deleted.
 *
 * @lore AU20 B2b: `session-lifecycle` folded in — all exports from
 * `@hyperidle/session-lifecycle` now re-exported here. The satellite package
 * is deleted. session-lifecycle's `ports.ts` renamed to
 * `session-lifecycle-ports.ts` (avoids conflict with run-orchestration's own
 * `ports.ts`). All internal `./ports.js` references in moved files updated
 * accordingly.
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
// -- context-assembly (folded in, AU20 B2a) --
export type {
	AgentContextAssemblyOutcome,
	AgentWritebackHandle,
	AssembleAgentContextInput,
} from "./assemble-context.js";
export type {
	ContextAssemblyConfig,
	ContextAssemblyResult,
	Manifest,
	ManifestEntry,
} from "./context-assembly.js";
export { EMITTED_ROOTS_CONTEXT_ASSEMBLY } from "./context-assembly.js";
export type {
	ContextAssemblyFileWatcher,
	ContextAssemblyFileWatcherConfig,
	ContextAssemblyKnowledgeListFilters,
	ContextAssemblyPorts,
	ContextAssemblyScoringContext,
	FilesystemsReader,
	KnowledgeReader,
	RoutineReader,
	UsersReader,
	WorkReader,
} from "./context-assembly-ports.js";
export type {
	AssistantPromptResult,
	PromptCompositionInput,
	PromptCompositionResult,
	RoutinePromptCompositionInput,
	ToolSummary,
} from "./context-assembly-prompt.js";
export {
	buildTemplateVariables,
	EMITTED_ROOTS_AGENTS_MD,
	stripFrontmatter,
	substituteTemplateVars,
} from "./context-assembly-prompt.js";
export type { ContextAssemblyOps } from "./context-assembly-service.js";
export { createContextAssemblyOps } from "./context-assembly-service.js";
// -- session-lifecycle (folded in, AU20 B2b) --
export type { IngestionHandle } from "./contracts.js";
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
export {
	type ReapStaleRoutineSessionsOpts,
	reapStaleRoutineSessions,
} from "./routine-session-reaper.js";
export {
	reapSandboxesOnce,
	SANDBOX_REAPER_INTERVAL_MS,
	type SandboxReaperOptions,
	startSandboxReaper,
} from "./sandbox-reaper.js";
export type {
	RoutineSessionContextConfig,
	RoutineSessionContextData,
	SessionContextConfig,
	SessionContextData,
} from "./session-context.js";
export {
	type AgentTerminationReason,
	crashSession,
	endSession,
	recoverRequestedTerminations,
	requestAgentTermination,
	type SessionContext,
	TERMINATION_DISPOSITIONS,
	TERMINATION_REASONS,
	transitionAgentRunLifecycle,
} from "./session-lifecycle.js";
export * from "./session-lifecycle-ports.js";
export {
	type AdmittedSession,
	admitSession,
	type BeforeHarnessStartContext,
	type BeforeTeardownContext,
	captureMountedFilesystems,
	EMITTED_ROOTS_MCP_JSON,
	mountFilesystemsForAgent,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	type ProvisionSessionResult,
	provisionSession,
	runSession,
	startSessionProvision,
} from "./session-provisioning.js";
export { registerWorkerWsRoute, WorkerConnectionManager } from "./worker-ws.js";
