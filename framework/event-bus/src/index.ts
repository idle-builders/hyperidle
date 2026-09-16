export { EventBus } from "./event-bus.js";
// Event vocabulary dissolved from framework/domain-model (AU44 batch 8).
// The union exists to type the bus; it lives where the bus lives.
export type {
	AgentAddedEvent,
	AgentRunAdmissionFailedEvent,
	AgentRunAdmissionFailureCode,
	AgentRunLifecycleChangedEvent,
	AgentWorkIntentEvent,
	AgentWorkIntentKind,
	AgentWorkIntentSourceKind,
	// @lore BB1: BetRevisedEvent and BetStateChangedEvent deleted — bet is now a root task.
	DomainEvent,
	EventByType,
	EventHandler,
	EventType,
	FilesystemNeedsAttentionEvent,
	ItemCreatedEvent,
	KnowledgeArchivedEvent,
	KnowledgeCreatedEvent,
	KnowledgeUpdatedEvent,
	NotificationEvent,
	PropagationAppliedEvent,
	PropagationFailedEvent,
	SandboxWritebackChange,
	SandboxWritebackChangesDetectedEvent,
	SessionEndedEvent,
	SessionHandoffCompletedEvent,
	SessionNotReturnedEvent,
	// SessionOutcome stays in @hyperidle/domain-model (core-ui uses it; core-ui cannot reach event-bus)
	SessionStartedEvent,
	TaskStateChangedEvent,
	TeamCreatedEvent,
	ThreadCreatedEvent,
	ThreadMessageAppendedEvent,
	ThreadReopenedEvent,
	ThreadResolvedEvent,
	ToolCallRecordedEvent,
	UserCreatedEvent,
	WildcardHandler,
	WildcardType,
} from "./events.js";
export { AGENT_WORK_INTENT_KINDS, EVENT_TYPES } from "./events.js";
