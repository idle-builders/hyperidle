import type { AgentSessionSourceCorrelation, AgentSessionSourceKind } from "./session-request.js";
import type { HostKind, MessageType } from "./thread.js";
import type { BetStatus, TaskState } from "./types.js";

// --- Event type discriminants ---

export interface TaskStateChangedEvent {
	type: "task_state_changed";
	streamId: string;
	taskId: string;
	fromState: TaskState;
	toState: TaskState;
	timestamp: number;
}

export interface BetStateChangedEvent {
	type: "bet_state_changed";
	streamId: string;
	betId: string;
	fromState: BetStatus;
	toState: BetStatus;
	timestamp: number;
}

export interface ItemCreatedEvent {
	type: "item_created";
	streamId: string;
	itemId: string;
	conversationId: string;
	kind: string;
	timestamp: number;
}

export interface SessionStartedEvent {
	type: "session_started";
	streamId: string;
	sessionId: string;
	agentId: string;
	taskId: string | null;
	requestId?: string;
	sourceKind?: AgentSessionSourceKind;
	sourceId?: string;
	sourceCorrelation?: AgentSessionSourceCorrelation;
	timestamp: number;
}

/**
 * AL6 v2: "not_returned" added as a non-completed outcome for a turn that
 * exhausted its stream without a return action (after force budget spent, or
 * on a Tier-2 harness). Every switch(outcome) consumer MUST handle this member
 * — see the exhaustiveness guard in session-lifecycle.ts.
 */
export type SessionOutcome = "completed" | "crashed" | "stopped" | "not_returned";

export interface SessionEndedEvent {
	type: "session_ended";
	streamId: string;
	sessionId: string;
	agentId: string;
	taskId: string | null;
	requestId?: string;
	sourceKind?: AgentSessionSourceKind;
	sourceId?: string;
	sourceCorrelation?: AgentSessionSourceCorrelation;
	timestamp: number;
	/** Final disposition of the session. */
	outcome: SessionOutcome;
}

/**
 * AL6: Emitted by `runSession` (site A) when a task-session turn exhausts its
 * event stream without having invoked any member of the accepted-return set
 * (RETURN_ACTION_NAMES). The turn is flagged — never silently completed (AC3).
 *
 * @lore AL6: "flag" policy (concept §3.4): the turn still settles via endSession;
 * this event makes the escape visible and attributable. "redirect" (forced re-prompt)
 * is a clean additive follow-up where the harness supports it. streamId = sessionId
 * for per-session stream routing (consistent with session_started / session_ended).
 */
export interface SessionNotReturnedEvent {
	readonly type: "session_not_returned";
	/** streamId = sessionId for per-session routing (event-bus stream key convention). */
	readonly streamId: string;
	readonly sessionId: string;
	readonly agentId: string;
	readonly taskId: string | null;
	readonly requestId?: string;
	readonly sourceKind?: AgentSessionSourceKind;
	readonly sourceId?: string;
	readonly sourceCorrelation?: AgentSessionSourceCorrelation;
	readonly timestamp: number;
}

export interface CostCapWarningEvent {
	type: "cost_cap_warning";
	streamId: string;
	level: "warning" | "critical";
	capLevel: "agent" | "team" | "factory";
	entityId: string;
	spend: number;
	cap: number;
	timestamp: number;
}

export interface CostCapBreachedEvent {
	type: "cost_cap_breached";
	streamId: string;
	level: "hard" | "soft";
	capLevel: "agent" | "team" | "factory";
	entityId: string;
	spend: number;
	cap: number;
	timestamp: number;
}

export interface NotificationEvent {
	type: "notification";
	streamId: string;
	targetId: string;
	message: string;
	timestamp: number;
	/**
	 * AF8: MANDATORY discriminator. Distinguishes policy-engine "attention"
	 * push notifications from dep-watcher "auto_unblock" ambient events.
	 *
	 * @lore AF8: This field is MANDATORY (not optional) so TypeScript forces
	 * both emit sites to set it. The notification listener filters on `kind`
	 * ONLY — never on message text. auto_unblock is ambient (concept hard
	 * rule #6) and must never produce a notification_queue row.
	 *
	 * Emit sites:
	 *   policy-engine.ts   → kind: "attention"
	 *   dependency-watcher.ts → kind: "auto_unblock"
	 */
	kind: "attention" | "auto_unblock";
}

/**
 * @lore O1: action stays as `string` because the codebase emits 11+ distinct
 * action values across 4 files, including a dynamic `practice_meeting_turn_N`
 * pattern in practice-meeting.ts that makes a closed union impossible.
 *
 * Actual values emitted today:
 *   knowledge.ts routes:      "created", "updated", "merged", "split", "archived", "flagged"
 *   attention-service.ts:     "attention_recomputed"
 *   promotion-pipeline.ts:    "contradiction_flagged", "auto_promoted", "marked_stale"
 *   practice-meeting.ts:      `practice_meeting_turn_${turnNumber}` (dynamic, unbounded)
 *
 * Tightening requires either (a) making the dynamic pattern use a fixed action
 * with turnNumber as a separate field, or (b) a branded string with a
 * `practice_meeting_turn_` prefix type. Both are behavior changes, out of O1 scope.
 * Filed as follow-up.
 */
export interface KnowledgeUpdatedEvent {
	type: "knowledge_updated";
	streamId: string;
	itemId: string;
	action: string; // intentionally loose -- see @lore above
	timestamp: number;
}

export interface KnowledgeCreatedEvent {
	type: "knowledge_created";
	streamId: string;
	itemId: string;
	timestamp: number;
}

export interface KnowledgeArchivedEvent {
	type: "knowledge_archived";
	streamId: string;
	itemId: string;
	timestamp: number;
}

export interface KnowledgeAccessedEvent {
	type: "knowledge_accessed";
	streamId: string;
	itemId: string;
	accessorKind: "human" | "agent";
	accessorId: string;
	timestamp: number;
}

export interface RoutineFiredEvent {
	type: "routine_fired";
	streamId: string;
	routineId: string;
	agentId: string;
	timestamp: number;
}

export interface DependencyMetEvent {
	type: "dependency_met";
	streamId: string;
	taskId: string;
	dependencyId: string;
	timestamp: number;
}

export interface BetRevisedEvent {
	type: "bet_revised";
	streamId: string;
	betId: string;
	field: string;
	timestamp: number;
}

/**
 * Emitted by `session-provisioning` each time the harness yields a
 * `tool_call` event. Observability subscribes to this; the provisioning
 * layer also invokes the tool registry. Separate from the harness-level
 * `ToolCallEvent` to keep the pub/sub domain decoupled from the adapter
 * stream semantics.
 *
 * `argsSummary` is the already-scrubbed, length-bounded preview produced
 * by `summarizeToolArgs` — never the raw args object.
 */
export interface ToolCallRecordedEvent {
	type: "tool_call_recorded";
	streamId: string;
	sessionId: string;
	toolName: string;
	argsSummary: string;
	timestamp: number;
}

// L1a — Thread primitive events (plan §6.3). `streamId` = `threadId` so
// per-thread events arrive in order.
export interface ThreadCreatedEvent {
	type: "thread_created";
	streamId: string;
	threadId: string;
	hostKind: HostKind;
	hostId: string;
	initiatorId: string;
	timestamp: number;
}

export interface ThreadMessageAppendedEvent {
	type: "thread_message_appended";
	streamId: string;
	threadId: string;
	messageId: string;
	messageType: MessageType;
	senderId: string;
	timestamp: number;
}

export interface ThreadResolvedEvent {
	type: "thread_resolved";
	streamId: string;
	threadId: string;
	resolvedByMessageId: string;
	timestamp: number;
}

export interface ThreadReopenedEvent {
	type: "thread_reopened";
	streamId: string;
	threadId: string;
	reopenedByMessageId: string;
	timestamp: number;
}

export interface ThreadArchivedEvent {
	type: "thread_archived";
	streamId: string;
	threadId: string;
	timestamp: number;
}

/**
 * R6: Emitted by the create_artifact skill tool after a new artifact row is
 * inserted into the kernel artifacts table.
 *
 * @lore R6: producingTaskId is carried as `taskId` (not producingTaskId) to
 * keep the event shape consistent with other task-scoped events where the
 * field is called `taskId`. The WsBroadcaster forwards this to the "work"
 * topic so the UI can invalidate artifact galleries.
 */
export interface ArtifactCreatedEvent {
	type: "artifact_created";
	streamId: string;
	artifactId: string;
	taskId: string;
	kind: string;
	timestamp: number;
}

/**
 * @lore O1: PropagationLevel moved to @hyperidle/fabric. This inline literal
 * union avoids importing from fabric in shared (boundary rule: kernel never
 * imports from strategy). The canonical definition is in @hyperidle/fabric.
 *
 * @lore U1: "product" renamed to "team" in propagation levels. The propagation
 * hierarchy is: session -> task -> bet -> team -> portfolio.
 * Note: "product" scope kind in knowledge_items is UNCHANGED (different taxonomy).
 */
type PropagationLevelLiteral = "session" | "task" | "bet" | "team" | "portfolio";

/** L20: Emitted when lifecycle propagation successfully applies a transition. */
export interface PropagationAppliedEvent {
	type: "propagation_applied";
	/** streamId = targetId so per-entity streams receive the event. */
	streamId: string;
	sourceLevel: PropagationLevelLiteral;
	sourceId: string;
	targetLevel: PropagationLevelLiteral;
	targetId: string;
	targetTransition: string;
	timestamp: number;
}

/** L20: Emitted when lifecycle propagation fails after exhausting retries. */
export interface PropagationFailedEvent {
	type: "propagation_failed";
	/** streamId = targetId so per-entity streams receive the event. */
	streamId: string;
	sourceLevel: PropagationLevelLiteral;
	sourceId: string;
	targetLevel: PropagationLevelLiteral;
	targetId: string;
	failureReason: string;
	attempts: number;
	timestamp: number;
}

/**
 * AK7: Emitted by the Kernel at a selection point BEFORE an owner is chosen.
 * Observable announcement of "work needs an agent" (AC1). The owner decision
 * is made via the synchronous selectAgent port call, NOT by a subscriber to
 * this event. Carried for audit + AK8 + future async subscribers.
 *
 * streamId = teamId for per-team routing (bet_* surfaces).
 *
 * @lore AK7: This event is audit-only in AK7 — no subscriber acts on it to
 * mutate state. Emit-then-call ordering (event fires BEFORE selectAgent is
 * called) makes the occasion observable without being the reply channel.
 * Idempotency: a crash between emit and the ownerAgentId write leaves only
 * an orphan audit record; re-running re-emits and existing CAS/owner-already-set
 * guards prevent double-assignment.
 */
export interface WorkSelectionRequestedEvent {
	type: "work_selection_requested";
	streamId: string; // = teamId for bet_* surfaces
	teamId: string;
	surface: "bet_task" | "bet_decomposer" | "routine_delegate";
	/** The bet/routine the work is keyed to (for audit correlation). */
	workKey: string;
	roleHint: string | null;
	at: string;
}

/**
 * AK6: Emitted by POST /api/teams (and create-team tool) AFTER the team,
 * teamMembers, and all scaffolded agent users rows have been persisted.
 * streamId = teamId for per-team stream routing.
 */
export interface TeamCreatedEvent {
	type: "team_created";
	streamId: string;
	teamId: string;
	teamMembersId: string;
	functions: readonly string[];
	/** Ids of every agent users row created for this team (real ids, post-persist). */
	agentIds: readonly string[];
	at: string;
}

/**
 * AK6: Emitted by the add_agent tool (and teams add-agent route) AFTER the
 * agent users row has been persisted.
 * streamId = teamId for per-team stream routing.
 */
export interface AgentAddedEvent {
	type: "agent_added";
	streamId: string;
	teamId: string;
	teamMembersId: string;
	agentId: string;
	role: string;
	at: string;
}

/**
 * AK6: Emitted by POST /api/users (and assistant lazy-create) AFTER the human
 * user row AND the assistant agent users row have been persisted.
 * Semantics: "human + their assistant now exist."
 * streamId = userId for per-user stream routing.
 */
export interface UserCreatedEvent {
	type: "user_created";
	streamId: string;
	userId: string;
	/** The assistant agent's users.id (real id, post-persist). */
	assistantAgentId: string;
	at: string;
}

/**
 * AK8: Emitted by the Kernel when a committed bet enters decomposition.
 * Observable "work to decompose" occasion (AC1). Post-CAS, post-eligible-check —
 * only the CAS winner emits, so a duplicate `bet_state_changed(active)` produces
 * exactly one emit. Sibling of WorkSelectionRequestedEvent — same audit-only
 * semantics; the decomposition DECISION arrives via the synchronous `decomposeBet`
 * port call. streamId = teamId for per-team stream routing.
 *
 * @lore AK8 @lore O1: interface + union + emit site (bet-decomposition.ts).
 * The event is audit/observability-only — no subscriber mutates state off it.
 */
export interface WorkDecomposeRequestedEvent {
	type: "work_decompose_requested";
	streamId: string; // = teamId
	teamId: string;
	betId: string; // the work keyed to this decomposition
	at: string; // ISO 8601
}

/**
 * AL7 trust-first: Emitted after an approved call executes (ok or failed) in session 2.
 * Renamed from operation_executed → proposed_call_executed.
 *
 * @lore AL7 W4: streamId = subjectThreadId (the bet host thread).
 * The UI subscribes per thread to refresh the Outcome band on the review canvas.
 */
export interface ProposedCallExecutedEvent {
	type: "proposed_call_executed";
	streamId: string; // = subjectThreadId (the bet host thread)
	proposedCallId: string;
	reviewMessageId: string;
	status: "ok" | "failed";
	timestamp: number;
}

/**
 * AL7 trust-first: Emitted after an approve verdict composes a tailored grant and
 * transitions the Proposed Call to 'granted'. Triggers session-2 re-engagement
 * via task-dispatcher's handleProposedCallGranted subscription.
 *
 * @lore AL7 R1: explicit event + dedicated subscription (not the owner-change
 * handleSessionEnded path) — avoids double-dispatch and collision with session reuse.
 */
export interface ProposedCallGrantedEvent {
	type: "proposed_call_granted";
	streamId: string; // = subjectThreadId for per-thread subscriptions
	proposedCallId: string;
	taskId: string;
	agentId: string;
	timestamp: number;
}

/**
 * Kernel events: entity lifecycle facts. When a kernel entity changes state,
 * these events announce what happened.
 *
 * @lore O1: To add a kernel event: (1) define the interface with type literal
 * discriminant, streamId, and timestamp, (2) add it to this union, (3) emit
 * from the route/service after the DB write. The EventBus is generic — no
 * bus changes needed. A switch(event.type) over KernelEvent must compile
 * without a default case.
 */
export type KernelEvent =
	| TaskStateChangedEvent
	| BetStateChangedEvent
	| BetRevisedEvent
	| SessionStartedEvent
	| SessionEndedEvent
	// AL6: return-gate escape surface
	| SessionNotReturnedEvent
	| ThreadCreatedEvent
	| ThreadMessageAppendedEvent
	| ThreadResolvedEvent
	| ThreadReopenedEvent
	| ThreadArchivedEvent
	| ItemCreatedEvent
	| DependencyMetEvent
	| KnowledgeCreatedEvent
	| KnowledgeUpdatedEvent
	| KnowledgeArchivedEvent
	| KnowledgeAccessedEvent
	| ArtifactCreatedEvent
	// AK6: creation events
	| TeamCreatedEvent
	| AgentAddedEvent
	| UserCreatedEvent
	// AK7: selection occasion event
	| WorkSelectionRequestedEvent
	// AK8: decomposition occasion event
	| WorkDecomposeRequestedEvent
	// AL7 trust-first: proposed call executed (renamed from operation_executed)
	| ProposedCallExecutedEvent
	// AL7 trust-first: proposed call granted → triggers session-2 re-engagement
	| ProposedCallGrantedEvent;

/** Strategy events: automation reactions and strategy-layer observations. */
export type StrategyEvent =
	| CostCapWarningEvent
	| CostCapBreachedEvent
	| NotificationEvent
	| PropagationAppliedEvent
	| PropagationFailedEvent
	| RoutineFiredEvent
	| ToolCallRecordedEvent;

/** Discriminated union of all domain events. */
export type DomainEvent = KernelEvent | StrategyEvent;

/** All valid event type strings. */
export type EventType = DomainEvent["type"];

/** Wildcard subscription type. */
export type WildcardType = "*";

/** Extract the event interface for a given event type string. */
export type EventByType<T extends EventType> = Extract<DomainEvent, { type: T }>;

/** Handler function for a specific event type. */
export type EventHandler<T extends EventType> = (event: EventByType<T>) => void;

/** Handler function for wildcard subscriptions. */
export type WildcardHandler = (event: DomainEvent) => void;

/** Redis adapter interface (implementation deferred). */
export interface EventBusAdapter {
	publish(event: DomainEvent): Promise<void>;
	subscribe(type: EventType | WildcardType, handler: (event: DomainEvent) => void): Promise<void>;
	unsubscribe(type: EventType | WildcardType, handler: (event: DomainEvent) => void): Promise<void>;
}
