export { derivePrimaryHarness } from "./derive-primary-harness.js";
export type {
	AdapterInfo,
	AdapterMeta,
	ConversationMessage,
	HarnessAdapter,
	HarnessCapabilities,
	McpConnectionInfo,
	ReturnEnforcementChannel,
	ReturnHookConfig,
	SessionConfig,
	SessionHandle,
	SessionMetrics,
	SessionResult,
	SessionWorkflow,
} from "./harness-adapter.js";
export type {
	HarnessAccessMode,
	HarnessAuthActionDescriptor,
	HarnessAuthActionKind,
	HarnessCapabilityDescriptor,
	HarnessDiscoveryStatus,
	HarnessModelDescriptor,
	HarnessModelOptionControl,
	HarnessModelOptionDescriptor,
	HarnessOptionChoice,
	HarnessOptionControlKind,
	HarnessReadinessState,
	HarnessRuntimeCapabilities,
	InheritedToolDescriptor,
} from "./harness-capability-descriptor.js";
export { HARNESS_OPTION_CONTROL_KINDS } from "./harness-capability-descriptor.js";
export {
	isHarnessEvent,
	normalizeHarnessEvent,
	preMapClaudeEvent,
} from "./harness-event-normalization.js";
export type {
	CompletionEvent,
	ErrorEvent,
	HarnessEvent,
	HarnessEventType,
	PreCompactionEvent,
	TokenUsageEvent,
	ToolCallEvent,
} from "./harness-events.js";
export { MockHarnessAdapter } from "./mock-harness-adapter.js";
export type { HarnessAdapterType, LiteralToolNamer, ReturnActionName } from "./return-actions.js";
// ── Closed accepted-return set + forcing helpers ──
export {
	buildForceReturnMessage,
	FORCE_RETURN_MESSAGE,
	isInternalExtractionDrain,
	isRequiredReturnAction,
	isReturnAction,
	// AU27 Increment 8: harness-literal tool naming for return-action mentions
	literalToolNamerForAdapterType,
	MAX_FORCE_RETURNS,
	mcpNamespacedToolName,
	opencodeToolName,
	RETURN_ACTION_NAMES,
	shouldForceReturn,
} from "./return-actions.js";

export type {
	ServerDispatchMessage,
	ServerRegisteredMessage,
	ServerStopMessage,
	ServerToWorkerMessage,
	WorkerErrorMessage,
	WorkerEventMessage,
	WorkerPauseMessage,
	WorkerRegisterMessage,
	WorkerResumeMessage,
	WorkerSessionResultMessage,
	WorkerToServerMessage,
} from "./worker-protocol.js";
