export { EventBus } from "./event-bus.js";
// Event vocabulary dissolved from framework/domain-model (AU44 batch 8).
// The union exists to type the bus; it lives where the bus lives.
export type {
	AgentRunAdmissionFailedEvent,
	AgentRunAdmissionFailureCode,
	AgentRunLifecycleChangedEvent,
	AgentWorkIntentKind,
	AgentWorkIntentSourceKind,
	// @lore BB1: BetRevisedEvent and BetStateChangedEvent deleted — bet is now a root task.
	// @lore BC5 T7b: NotificationEvent, TaskStateChangedEvent and the four
	// ThreadCreated/ThreadMessageAppended/ThreadResolved/ThreadReopened events
	// deleted — their last listener is gone — subscriptions replace them with
	// `ObjectChangeEvent`'s "task.changed"/"thread.*"/"user.changed" members.
	// @lore BC5 T11: TeamCreatedEvent/AgentAddedEvent/UserCreatedEvent deleted
	// with the `org`/`teams-routes`/`users` routes, their last emitters.
	ChangesRow,
	DomainEvent,
	EventByType,
	EventHandler,
	EventType,
	ObjectChangeEvent,
	PropagationAppliedEvent,
	PropagationFailedEvent,
	SandboxWritebackChange,
	SandboxWritebackChangesDetectedEvent,
	SessionEndedEvent,
	SessionHandoffCompletedEvent,
	SessionNotReturnedEvent,
	// SessionOutcome stays in @hyperidle/domain-model (core-ui uses it; core-ui cannot reach event-bus)
	SessionStartedEvent,
	ToolCallRecordedEvent,
	WildcardHandler,
	WildcardType,
} from "./events.js";
export { AGENT_WORK_INTENT_KINDS, EVENT_TYPES, objectEvent } from "./events.js";
