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
	CapturedToolCall,
	CompletionEvent,
	CostUpdateEvent,
	ErrorEvent,
	HarnessEvent,
	HarnessEventType,
	PreCompactionEvent,
	TokenUsageEvent,
	ToolCallEvent,
} from "./harness-events.js";
export { MockHarnessAdapter } from "./mock-harness-adapter.js";
export type { ReturnActionName } from "./return-actions.js";
// ── AL6: Closed accepted-return set + v2 forcing helpers ──
export {
	AL6_FORCE_RETURN_MESSAGE,
	AL6_MAX_FORCE_RETURNS,
	isInternalExtractionDrain,
	isReturnAction,
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
