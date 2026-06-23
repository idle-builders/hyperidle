export type {
	ConversationMessage,
	HarnessAdapter,
	HarnessCapabilities,
	McpConnectionInfo,
	SessionConfig,
	SessionHandle,
	SessionResult,
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
} from "./harness-capability-descriptor.js";
export { HARNESS_OPTION_CONTROL_KINDS } from "./harness-capability-descriptor.js";
export { isHarnessEvent, normalizeHarnessEvent } from "./harness-event-normalization.js";
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
