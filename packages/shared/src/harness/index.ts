export type {
	HarnessAdapter,
	HarnessCapabilities,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "./harness-adapter.js";

export type {
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
