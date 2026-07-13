// AU17: curated cross-package barrel. Every symbol re-exported here is
// part of this package's public surface — internals not listed here are
// unreachable from outside the package (enforced by tsc: unexported deep
// imports fail to resolve). Derived mechanically from actual importers by
// scripts/au17-migrate.ts; keep additions/removals in sync with real usage.

export { harnessTestResolvedModel, requireHarness } from "./harness/__tests__/require-harness.js";
export {
	AdapterPool,
	CLAUDE_CLI_CONFIG,
	CLI_TOOL_CONFIGS,
	createLocalAdapterPool,
} from "./harness/adapter-pool.js";
export { BuiltinHarnessAdapter } from "./harness/builtin-harness-adapter.js";
export { CliHarnessAdapter } from "./harness/cli-harness-adapter.js";
export { EMITTED_ROOTS_CLI_MCP_CONFIG, writeCliMcpConfig } from "./harness/cli-mcp-config.js";
export { DisabledSandboxAdapter } from "./harness/disabled-sandbox-adapter.js";
export type { HarnessDiscoveryInput } from "./harness/harness-discovery.js";
export { callLlm, HttpError } from "./harness/llm-client.js";
export type { LlmResponse } from "./harness/llm-types.js";
export { LocalSandboxAdapter } from "./harness/local-sandbox-adapter.js";
export {
	EMITTED_ROOTS_CLAUDE_SETTINGS,
	EMITTED_ROOTS_CODEX_HOME,
	EMITTED_ROOTS_OPENCODE_PLUGIN,
	provisionReturnHook,
} from "./harness/provision-return-hook.js";
export { RemoteHarnessAdapter } from "./harness/remote-harness-adapter.js";
export type { EnforcementRegistry } from "./harness/return-enforcement-registry.js";
export {
	createEnforcementRegistry,
	enforcementRegistry,
} from "./harness/return-enforcement-registry.js";
export type { SandboxAdapter, SandboxHandle } from "./harness/sandbox-adapter.js";
export type { CreateMcpBridgeOptions, McpBridgeInstance } from "./mcp/mcp-bridge.js";
export { createMcpBridge, toolResultToCallToolResult } from "./mcp/mcp-bridge.js";
export type { McpBridgeRegistry } from "./mcp/mcp-bridge-registry.js";
export { createMcpBridgeRegistry } from "./mcp/mcp-bridge-registry.js";
export { resolveAgentScaffoldSpecs } from "./services/agent-defaults/resolvers.js";
export {
	bootAgentLayer,
	classifyAdmissionFailure,
	drainAgentSessionRequests,
	markRunningAgentSessionRequestsForShutdown,
} from "./services/agent-layer-boot.js";
export { executeAgentRunRequest } from "./services/agent-run-boundary.js";
export { createAgentSessionRequest } from "./services/agent-session-requests.js";
export type { AssistantTurnDeps } from "./services/agent-work-assistant.js";
export { executeAssistantRequest, mapErrorToNotice } from "./services/agent-work-assistant.js";
export {
	consumeAgentSessionRequest,
	drainAgentWorkIntents,
} from "./services/agent-work-intent-worker.js";
export { registerAssistantDispatcher } from "./services/assistant-dispatcher.js";
export type { BetDecompositionDeps } from "./services/bet-decomposition.js";
export {
	insertProposedBetTasks,
	resolveOrphanedDecompositions,
	runBetDecomposition,
} from "./services/bet-decomposition.js";
export { registerBetDecomposition } from "./services/bet-decomposition-subscriber.js";
export type { PostBetRetroArgs } from "./services/builtin-routine-handlers.js";
export {
	provisionTeamRoutines,
	registerBuiltinRoutineHandlers,
	runBuiltinRoutine,
} from "./services/builtin-routine-handlers.js";
export { assembleContext, EMITTED_ROOTS_CONTEXT_ASSEMBLY } from "./services/context-assembly.js";
export { EMITTED_ROOTS_AGENTS_MD } from "./services/context-assembly-prompt.js";
export {
	checkCostCap,
	clearDeduplicationCache,
	getDedupCacheSize,
	getFactoryCostActual,
	recordCostAndCheck,
	registerCostCapDedupReleaser,
	releaseSessionDedup,
	resetCosts,
} from "./services/cost-cap.js";
export {
	clearCostSentinelCache,
	runCostSentinelCheck,
	startCostSentinel,
} from "./services/cost-sentinel.js";
export type { HandoffMetadata } from "./services/handoff-protocol.js";
export { handoff } from "./services/handoff-protocol.js";
export type { HarnessCapabilityReader } from "./services/harness-capability-read-model.js";
export {
	harnessCapabilitiesForType,
	harnessCapabilityDescriptors,
	harnessRegistrationMeta,
	refreshHarnessDiscoveries,
	registeredHarnessCount,
	workerConnections,
} from "./services/harness-capability-read-model.js";
export {
	checkAndFireRoutine,
	getRoutineMonthlySpend,
	nextCronMatch,
	parseCron,
	startRoutineScheduler,
} from "./services/routine-scheduler.js";
export { reapStaleRoutineSessions } from "./services/routine-session-reaper.js";
export { startSandboxReaper } from "./services/sandbox-reaper.js";
export { persistScaffoldedAgents } from "./services/scaffold-agents.js";
export type { SessionContext } from "./services/session-lifecycle.js";
export {
	requestAgentTermination,
	transitionAgentRunLifecycle,
} from "./services/session-lifecycle.js";
export type {
	ProvisionSessionDeps,
	ProvisionSessionParams,
	ProvisionSessionResult,
} from "./services/session-provisioning.js";
export { EMITTED_ROOTS_MCP_JSON, provisionSession } from "./services/session-provisioning.js";
export type { TaskDispatcherDeps } from "./services/task-dispatcher.js";
export { getDispatchQueueSnapshot, registerTaskDispatcher } from "./services/task-dispatcher.js";
export { createTriggeredAgentSessionRequest } from "./services/trigger-resolution.js";
export { makeContext, NOW, seedBase } from "./tools/__tests__/_helpers.js";
export { commitFileTool } from "./tools/commit-file.js";
export { createArtifactTool } from "./tools/create-artifact.js";
export { createBetTool } from "./tools/create-bet.js";
export { createConflictReviewTool } from "./tools/create-conflict-review.js";
export { createItemTool } from "./tools/create-item.js";
export { createRoutineTool } from "./tools/create-routine.js";
export { createTaskTool } from "./tools/create-task.js";
export { editBetTool } from "./tools/edit-bet.js";
export { handoffToTool } from "./tools/handoff-to.js";
export { logTaskTool } from "./tools/log-task.js";
export { promoteKnowledgeTool } from "./tools/promote-knowledge.js";
export { queryPracticeTool } from "./tools/query-practice.js";
export { readInboxTool } from "./tools/read-inbox.js";
export { routeItemTool } from "./tools/route-item.js";
export { scoreAttentionTool } from "./tools/score-attention.js";
export { sendMessageTool } from "./tools/send-message.js";
export { submitReviewTool } from "./tools/submit-review.js";
export type {
	BuildToolRegistryOptions,
	RegisteredTool,
	ToolContext,
	ToolRegistry,
} from "./tools/tool-registry.js";
export {
	ALL_TOOL_DEFINITIONS,
	buildToolRegistry,
	classifyReversibility,
	composeWorkflowAllowDeny,
	identityHash,
	toClaudeToolSpec,
	toRegistered,
} from "./tools/tool-registry.js";
export type { ToolResult } from "./tools/tool-result.js";
export { err } from "./tools/tool-result.js";
export { updateRoutineTool } from "./tools/update-routine.js";
export { writeMemoryTool } from "./tools/write-memory.js";
export { writeSessionNotesTool } from "./tools/write-session-notes.js";
