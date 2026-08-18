import type { AgentSessionSourceCorrelation, AgentSessionSourceKind } from "./session-request.js";
import type { HostKind, MessageType } from "./thread.js";
import type { BetStatus, ModelTier, TaskState } from "./types.js";

/**
 * The canonical runtime-checkable list `AgentWorkIntentKind` is built from —
 * kept in lockstep with `agent_work_intents_kind_ck`
 * (`framework/db/src/schema.ts`) and consumed by
 * `AgentWorkIntentRecorderInput` (`agent-work-intent-recorder.ts`, AU21 §6
 * Decision G) so a kind-set drift test (`framework/db`) can derive its
 * accept-list mechanically from this single source instead of a second
 * hardcoded copy.
 */
export const AGENT_WORK_INTENT_KINDS = [
	"assistant_turn",
	"session_start",
	"knowledge_action",
	"routine_run",
	"task_run",
	"reengagement",
] as const;

export type AgentWorkIntentKind = (typeof AGENT_WORK_INTENT_KINDS)[number];

/**
 * The RAW `agent_work_intents.source_kind` vocabulary (the identity an intent
 * was recorded under, pre-resolution) — distinct from `AgentSessionSourceKind`
 * (the RESOLVED "session-source" vocabulary a chosen agent's request ends up
 * carrying, e.g. `"routine"`/`"knowledge"`). `AgentRunAdmissionFailedEvent`
 * fires from the drain against the STORED intent row, before (or instead of)
 * resolution succeeds, so it carries this pre-resolution vocabulary verbatim.
 */
export type AgentWorkIntentSourceKind =
	| "thread_message"
	| "explicit_session_start"
	| "knowledge_action"
	| "routine_run"
	| "task_dispatch_attempt"
	| "proposed_call";

export interface AgentWorkIntentEvent {
	readonly type: "agent_work_intent_recorded";
	readonly streamId: string;
	readonly intentId: string;
	readonly intentKind: AgentWorkIntentKind;
	readonly sourceKind: AgentSessionSourceKind | "explicit_session_start";
	readonly sourceId: string;
	readonly idempotencyKey: string;
	readonly timestamp: number;
}

export type AgentRunAdmissionFailureCode =
	| "INVALID_WORK_SOURCE" // baked payload's source no longer exists / no longer eligible (domain-state staleness)
	| "MAX_ATTEMPTS_EXCEEDED" // orchestration's own claim/dedup attempt budget (agentWorkIntents.attempts) exhausted
	| "TARGET_AGENT_NOT_RUNNABLE" // resolved agent deactivated/non-existent between emit and provisioning (§12)
	| "PROVISIONING_FAILED"; // hard infra failure building/deploying the session (harness/sandbox), not a domain problem

/**
 * AU21 §6 Decision B4 / §10 — the NEW pre-handoff failure report-back
 * channel: `failOrRelease` (session-requests) emits this on every failed
 * claim/dispatch attempt (before any session exists). `terminal===true`
 * means orchestration's own claim/attempt budget is spent (or the error is
 * unrecoverable by retry) — core-api MUST finalize its own state and decide
 * retry(re-emit a fresh intent)/abandon. `terminal===false` is informational
 * only (orchestration is still retrying internally); no core-api state
 * mutation.
 */
export interface AgentRunAdmissionFailedEvent {
	readonly type: "agent_run_admission_failed";
	readonly streamId: string;
	readonly intentId: string;
	readonly kind: AgentWorkIntentKind;
	readonly sourceKind: AgentWorkIntentSourceKind;
	readonly sourceId: string;
	readonly failureCode: AgentRunAdmissionFailureCode;
	readonly terminal: boolean;
	readonly timestamp: number;
}

export interface AgentRunLifecycleChangedEvent {
	readonly type: "agent_run_lifecycle_changed";
	readonly streamId: string;
	readonly requestId: string;
	readonly sourceKind: AgentSessionSourceKind;
	readonly sourceId: string;
	readonly state: "completed" | "failed" | "cancelled";
	readonly sessionId?: string;
	readonly timestamp: number;
}

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
 * "not_returned" is a non-completed outcome for a turn that exhausted its
 * stream without a return action (after force budget spent, or on a Tier-2
 * harness). Every switch(outcome) consumer MUST handle this member — see the
 * exhaustiveness guard in session-lifecycle.ts.
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
	/**
	 * AU21 §9 Increment 4 (Decision B″ item 3) — additive, routine-sourced
	 * sessions only. Carries the routine-run finalize outcome, independent of
	 * the session's own `outcome`. Consumed by the core-api subscriber
	 * `routine-run-session-end-reactions.ts`, the literal replacement for
	 * `run-orchestration`'s deleted direct `routineRuns` write
	 * (`updateRoutineRunOnSessionEnd`). `"timeout"` is the stale-session-reaper
	 * outcome (`runtime-reapers.ts`'s `reapStaleRoutineSessions`) — the SAME
	 * event channel, a second producer.
	 *
	 * @lore AU21 Increment 14a: `"budget_exhausted"` (the per-run cost-cap
	 * outcome) is deleted along with the cap gate — no replacement.
	 */
	routineRunOutcome?: "success" | "error" | "timeout";
	/**
	 * AU21 §9 Increment 12 (Decision H3), Wave D — additive. Carries
	 * `run-orchestration/provisioner.ts`'s per-model-tier accumulated token
	 * counts (`accumulatedTokens`, populated from `token_usage` stream events
	 * across the session's lifetime) so a core-api `session_ended` subscriber
	 * (`work-session-end-reactions.ts`) can merge them into the owning bet's
	 * `bets.tokensActualJson` — the literal replacement for the deleted direct
	 * `ports.work.updateBetById` write (`accumulateSessionTokensOnBet`,
	 * `provisioner.ts`). Absent/empty when the session accumulated no tokens
	 * (e.g. it failed before any `token_usage` events arrived).
	 */
	tokensByTier?: Partial<Record<ModelTier, { prompt: number; completion: number }>>;
}

/**
 * @lore AU19 Increment 3g: `handoff-protocol.ts`'s `buildHandoff` emits this
 * post-commit. Handoff deliberately does NOT emit `session_ended` (a handoff
 * is not a session-end outcome). Historical note: this event originally
 * existed to let the (now AU21-Increment-14a-deleted) cost package release
 * its per-session dedup state on the handoff path since it doesn't see
 * `session_ended`; that consumer is gone, but `start-runtime.ts` and
 * `session-lifecycle`'s `registerHandoffTerminationRequester` still subscribe
 * for termination-request bookkeeping (see below), so the event stays.
 *
 * @lore AU19 Increment 3i fix round: `requestedBy` carries the outgoing
 * agent's id (`sessionContext.agentId`) so `session-lifecycle`'s
 * `registerHandoffTerminationRequester` subscriber can pass it through to
 * `requestAgentTermination`'s `terminationRequestedBy` write
 * (`agent_session_requests.termination_requested_by`, `schema.ts`). Pre-
 * migration `handoff-protocol.ts` passed `requestedBy: sessionContext.agentId`
 * directly to the (then-synchronous) termination call; the EventBus inversion
 * had silently dropped it since the event carried only `sessionId` — this
 * field closes that gap so the inversion stays behavior-preserving.
 */
export interface SessionHandoffCompletedEvent {
	type: "session_handoff_completed";
	streamId: string;
	sessionId: string;
	requestedBy: string;
	timestamp: number;
}

/**
 * Emitted by `runSession` (site A) when a task-session turn exhausts its
 * event stream without having invoked any member of the accepted-return set
 * (RETURN_ACTION_NAMES). The turn is flagged — never silently completed (AC3).
 *
 * @lore "flag" policy (concept §3.4): the turn still settles via endSession;
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
	/**
	 * AU27 Increment 5 (Decision 5) — the session's calling thread id, when it
	 * has one (`params.callingThreadId` in hand at the emit site). Absent for
	 * a `task_run`-sourced session (`sourceCorrelation` is `{taskId, teamId}`,
	 * no thread) — the never-silent net's `conversation` subscriber no-ops
	 * when this is absent; there is nowhere to post a notice.
	 */
	readonly callingThreadId?: string;
	readonly timestamp: number;
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
 * action values across several files, and (historically, before AU21
 * Increment 5 deleted the practice-meeting workflow) included a dynamic
 * `practice_meeting_turn_N` pattern that made a closed union impossible.
 *
 * Actual values emitted today:
 *   knowledge.ts routes:      "created", "updated", "merged", "split", "archived", "flagged"
 *   attention-service.ts:     "attention_recomputed"
 *   promotion-pipeline.ts:    "contradiction_flagged", "auto_promoted", "marked_stale"
 *
 * Tightening to a closed union remains a behavior change, out of O1 scope.
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

/** A single detected file-level writeback change (create/modify/delete). */
export interface SandboxWritebackChange {
	readonly type: "create" | "modify" | "delete";
	readonly relativePath: string;
	readonly fullPath: string;
}

/**
 * @lore AU19 Increment 3f: §10.3 against-grain inversion for `filesystems ⚠
 * capture-writeback` (§10.3 line 517's pure-inversion ruling). Emitted by
 * `@hyperidle/filesystems`' `file-watcher.ts` debounced flush (previously a
 * direct call to an injected `FilesystemsWritebackProcessor` port);
 * `@hyperidle/capture-writeback`'s `registerCaptureWriteback` subscribes and
 * drives `processWriteback` off the batch. See both packages' `@lore`
 * comments (`file-watcher.ts`, `writeback-subscriber.ts`) for the full
 * atomicity-check reasoning.
 */
export interface SandboxWritebackChangesDetectedEvent {
	type: "sandbox_writeback_changes_detected";
	streamId: string;
	sessionId: string;
	sandboxPath: string;
	manifestPath: string;
	changes: readonly SandboxWritebackChange[];
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
 * @lore O1: PropagationLevel moved to @hyperidle/server (packages/server/src/knowledge/types.ts). This inline literal
 * union avoids importing from fabric in shared (boundary rule: kernel never
 * imports from strategy). The canonical definition is in packages/server/src/knowledge/types.ts.
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
type KernelEvent =
	| AgentWorkIntentEvent
	| AgentRunAdmissionFailedEvent
	| AgentRunLifecycleChangedEvent
	| TaskStateChangedEvent
	| BetStateChangedEvent
	| BetRevisedEvent
	| SessionStartedEvent
	| SessionEndedEvent
	// AU19 Increment 3g: handoff EventBus inversion
	| SessionHandoffCompletedEvent
	// Return-gate escape surface
	| SessionNotReturnedEvent
	| ThreadCreatedEvent
	| ThreadMessageAppendedEvent
	| ThreadResolvedEvent
	| ThreadReopenedEvent
	| ThreadArchivedEvent
	| ItemCreatedEvent
	| DependencyMetEvent
	// AU19 Increment 3f: filesystems ⚠ capture-writeback EventBus inversion
	| SandboxWritebackChangesDetectedEvent
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
	// AL7 trust-first: proposed call executed (renamed from operation_executed)
	| ProposedCallExecutedEvent
	// AL7 trust-first: proposed call granted → triggers session-2 re-engagement
	| ProposedCallGrantedEvent;

/** Strategy events: automation reactions and strategy-layer observations. */
type StrategyEvent =
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
