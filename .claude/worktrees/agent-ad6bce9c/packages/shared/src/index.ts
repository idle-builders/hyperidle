export type { ApiErrorResponse, ApiErrorCode } from "./api-types.js";
export { API_ERROR_CODES } from "./api-types.js";

export type {
	AgentRole,
	AgentStatus,
	AutonomyLevel,
	BetStatus,
	HealthResponse,
	KnowledgeFormat,
	KnowledgeKind,
	KnowledgeLayer,
	KnowledgeStatus,
	ModelTier,
	RiskTier,
	SessionState,
	TaskState,
	TriggerType,
} from "./types.js";

export { KNOWLEDGE_LAYERS } from "./types.js";

export { createLogger, type Logger } from "./logger.js";

export type {
	DomainEvent,
	EventType,
	WildcardType,
	EventByType,
	EventHandler,
	WildcardHandler,
	EventBusAdapter,
	TaskStateChangedEvent,
	BetStateChangedEvent,
	BetShippedEvent,
	ItemCreatedEvent,
	SessionStartedEvent,
	SessionEndedEvent,
	SessionOutcome,
	CostCapWarningEvent,
	CostCapBreachedEvent,
	NotificationEvent,
	ResponseRecordedEvent,
	KnowledgeUpdatedEvent,
	RoutineFiredEvent,
	DependencyMetEvent,
	BetCommittedEvent,
	BetRevisedEvent,
} from "./events.js";

export { EventBus } from "./event-bus.js";

export { encode, decode } from "./toon-codec.js";
export { ToonParseError } from "./toon-errors.js";

export {
	InvalidTransitionError,
	CapacityExceededError,
	CostCapExceededError,
	ConcurrencyLimitError,
	ActiveRoutinesError,
	MissingCredentialError,
	VersionConflictError,
} from "./errors.js";

export type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	HarnessEventType,
	SessionConfig,
	SessionHandle,
	SessionResult,
	TokenUsageEvent,
	ToolCallEvent,
	CompletionEvent,
	ErrorEvent,
	CostUpdateEvent,
	PreCompactionEvent,
} from "./harness/index.js";

export { MockHarnessAdapter } from "./harness/index.js";
