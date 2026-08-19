export type {
	AnySchema,
	ClaudeToolSpec,
	RegisteredTool,
	ToolContext,
	ToolRegistry,
	ToolResult,
} from "./harness/tool-seam.js";
export { err, ok } from "./harness/tool-seam.js";
export type {
	AdapterInfo,
	AdapterMeta,
	ConversationMessage,
	HarnessAdapter,
	HarnessCapabilities,
	McpConnectionInfo,
	ReturnHookConfig,
	SessionConfig,
	SessionHandle,
	SessionMetrics,
	SessionResult,
	SessionWorkflow,
} from "./harness/harness-adapter.js";
export type {
	CompletionEvent,
	ErrorEvent,
	HarnessEvent,
	HarnessEventType,
	TokenUsageEvent,
	ToolCallEvent,
} from "./harness/harness-events.js";
export type {
	HarnessAdapterType,
	LiteralToolNamer,
	ReturnActionName,
} from "./harness/return-actions.js";
export {
	FORCE_RETURN_MESSAGE,
	isRequiredReturnAction,
	isReturnAction,
	literalToolNamerForAdapterType,
	MAX_FORCE_RETURNS,
	mcpNamespacedToolName,
	opencodeToolName,
	RETURN_ACTION_NAMES,
	shouldForceReturn,
} from "./harness/return-actions.js";
