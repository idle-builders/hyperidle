// @lore AU44-b8: events.ts DISSOLVED from framework/domain-model → framework/event-bus.
// The event vocabulary exists to type the bus's API; it lives where the bus lives.
// Under Ruling 2 (extension surface), all events survive — only the location changes.
// Callers that imported from @hyperidle/domain-model now import from @hyperidle/event-bus.
// SessionOutcome stays in domain-model (core-ui needs it; core-ui cannot reach event-bus).
// @lore BB1: BetStatus import removed — bet vocabulary deleted, task vocabulary is the only work vocabulary.
import type {
	AgentSessionSourceCorrelation,
	AgentSessionSourceKind,
	ChangeKind,
	ChangeObject,
	ChangeRow,
	HostKind,
	MessageType,
	ModelTier,
	ObjectEventName,
	SessionOutcome,
	TaskState,
} from "@hyperidle/domain-model";

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
	// @lore BC3 architecture.md §5 B5: renamed from "assistant_turn" — a
	// thread turn is not necessarily "the assistant"; any woken agent gets
	// one. Migration 0085 step 8 respells the DB check constraint the same way.
	"thread_turn",
	"session_start",
	"knowledge_action",
	"routine_run",
	"task_run",
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
	| "task_dispatch_attempt";

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
	/**
	 * Why the run ended this way, read back off the durable request row. A
	 * subscriber that records a terminal outcome of its own (core-api's
	 * routine-run finalizer) has no other source for the reason — without
	 * these it can only write "it failed", which is what left every real
	 * provisioning failure undiagnosable from the product.
	 */
	readonly failureCode?: string;
	readonly errorMessage?: string;
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
	/**
	 * BB1: this transition is part of a deliberate subtree KILL, not ordinary
	 * progress. Upward completion propagation must ignore it.
	 *
	 * @lore BB1: without this, killing a task with descendants raced its own
	 * completion cascade. `cascadeTaskKill` kills deepest-first, each kill emits
	 * this event, and the propagation handler — which listens for `killed` on
	 * purpose, so a last child being killed can still advance its parent — found
	 * the ancestors' children all terminal and marked them `done` before the
	 * cascade reached them. That stamped `completedAt` on cancelled work and
	 * raised a "Confirm shipping?" review on a killed root. The cascade already
	 * suppresses `session_ended` for exactly this reason; this closes the other
	 * path. Optional, so every existing emitter is unchanged and only the
	 * cascade opts in.
	 */
	cascade?: boolean;
}

/**
 * @lore BB1: `BetStateChangedEvent` DELETED — a bet is now a root task.
 * A bet state change IS a task state change; `task_state_changed` is the
 * only work-state event. This NARROWS the routine extension surface:
 * routines authored against `bet_state_changed` will no longer fire. Since
 * no code emits `bet_state_changed` anymore (the bet entity is gone), no
 * routine could have matched it in practice — the deletion removes a dead
 * event type from the extension surface.
 */

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

/**
 * @lore BB1: `BetRevisedEvent` DELETED — a bet is now a root task.
 * Task field updates go through normal task mutation paths; there is no
 * dedicated "bet revised" event. This removes a dead surface: nothing
 * emitted `bet_revised` after the bet entity was dropped.
 */

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

/**
 * @lore O1: PropagationLevel moved to @hyperidle/server (packages/server/src/knowledge/types.ts). This inline literal
 * union avoids importing from fabric in shared (boundary rule: kernel never
 * imports from strategy). The canonical definition is in packages/server/src/knowledge/types.ts.
 *
 * @lore U1: "product" renamed to "team" in propagation levels. The propagation
 * hierarchy is: session -> task -> team -> portfolio.
 * Note: "product" scope kind in documents is UNCHANGED (different taxonomy).
 */
type PropagationLevelLiteral = "session" | "task" | "team" | "portfolio";

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

/**
 * L20: Emitted when lifecycle propagation fails.
 *
 * @lore AU44 batch6: `attempts` field dropped (AU20 Ruling 2). The retry
 * apparatus and propagation_log table are gone; this event is emitted on
 * first failure and is the extension surface for plugins.
 */
export interface PropagationFailedEvent {
	type: "propagation_failed";
	/** streamId = targetId so per-entity streams receive the event. */
	streamId: string;
	sourceLevel: PropagationLevelLiteral;
	sourceId: string;
	targetLevel: PropagationLevelLiteral;
	targetId: string;
	failureReason: string;
	timestamp: number;
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
 * The wire shape of a raw `changes` table row — `@hyperidle/db`'s `Change`
 * (and the value its own `appendChange` returns) structurally satisfies
 * this without a cast: `before`/`after` are still JSON text, undecoded.
 * event-bus does not depend on `@hyperidle/db`; TypeScript's structural
 * typing is what makes that row assignable here.
 */
export interface ChangesRow {
	readonly id: string;
	readonly object: string;
	readonly objectId: string;
	readonly kind: string;
	readonly actor: string;
	readonly before: string | null;
	readonly after: string;
	readonly at: string;
}

/**
 * The nine object events, one member per `ObjectEventName` — a distributive
 * mapped type so `EventByType<"task.changed">` resolves to exactly the
 * `task.changed` member, not the union of all nine. `change` is the decoded
 * `ChangeRow` (architecture.md §3); `cascade` rides only on a kill loop's
 * descendant rows.
 */
export type ObjectChangeEvent = {
	[T in ObjectEventName]: {
		readonly type: T;
		readonly streamId: string;
		readonly change: ChangeRow;
		readonly timestamp: number;
		readonly cascade?: true;
	};
}[ObjectEventName];

/**
 * Builds one object-change event from a raw `changes` row — the module that
 * appended the row calls this once, post commit, over each row it appended
 * (architecture.md §3). Decodes `before`/`after` from JSON text into the
 * `ChangeRow` wire shape; derives the dotted event name from `object.kind`.
 */
export function objectEvent(row: ChangesRow, opts?: { readonly cascade?: true }): ObjectChangeEvent {
	const change: ChangeRow = {
		id: row.id,
		object: row.object as ChangeObject,
		objectId: row.objectId,
		kind: row.kind as ChangeKind,
		actor: row.actor,
		before: row.before === null ? null : (JSON.parse(row.before) as Record<string, unknown>),
		after: JSON.parse(row.after) as Record<string, unknown>,
		at: row.at,
	};
	return {
		type: `${row.object}.${row.kind}` as ObjectEventName,
		streamId: row.objectId,
		change,
		timestamp: Date.now(),
		...(opts?.cascade ? { cascade: true as const } : {}),
	} as ObjectChangeEvent;
}

/**
 * Discriminated union of all domain events.
 *
 * @lore O1: To add an event: (1) define the interface with type literal
 * discriminant, streamId, and timestamp, (2) add it to this union, (3) emit
 * from the route/service after the DB write. The EventBus is generic — no
 * bus changes needed.
 * @lore BA9d: KernelEvent and StrategyEvent type aliases removed — they reflected
 * a kernel/strategy split that is now gone. DomainEvent is the single union.
 */
export type DomainEvent =
	| ObjectChangeEvent
	| AgentWorkIntentEvent
	| AgentRunAdmissionFailedEvent
	| AgentRunLifecycleChangedEvent
	| TaskStateChangedEvent
	// @lore BB1: BetStateChangedEvent and BetRevisedEvent deleted — bet is now a root task.
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
	// AU19 Increment 3f: filesystems ⚠ capture-writeback EventBus inversion
	| SandboxWritebackChangesDetectedEvent
	// AK6: creation events
	| TeamCreatedEvent
	| AgentAddedEvent
	| UserCreatedEvent
	| NotificationEvent
	| PropagationAppliedEvent
	| PropagationFailedEvent
	| ToolCallRecordedEvent;

/** All valid event type strings. */
export type EventType = DomainEvent["type"];

/**
 * BA1 D8/D2 — the one compile-time-complete list of every event type. D2's
 * routine-event matcher subscribes to every member (all 24, nothing
 * excluded — the founder's loop ruling at §3.1 rejects a narrowed
 * allow-list); D8's create/patch validators and `GET /api/routines/event-types`
 * all read this SAME constant.
 *
 * `as const satisfies readonly EventType[]` is load-bearing, not cosmetic:
 * `satisfies` rejects a listed name that is not an `EventType`, and the
 * completeness assertion below rejects an `EventType` that is not listed.
 * A plain `readonly string[]` annotation would make the assertion vacuous —
 * `Exclude<EventType, string>` is `never` for any list, including an empty
 * one. Demonstrated red once (delete one entry, `npm run check` fails,
 * restore) — see the architecture's §9 required step.
 */
export const EVENT_TYPES = [
	// The nine object events (architecture.md §3) — one per `changes` row,
	// spelled out literally so the governance lint's clause 4 (a regex over
	// this file's source text) can see them.
	"task.created",
	"task.changed",
	"thread.created",
	"thread.message",
	"thread.changed",
	"document.created",
	"document.changed",
	"user.created",
	"user.changed",
	"agent_work_intent_recorded",
	"agent_run_admission_failed",
	"agent_run_lifecycle_changed",
	"task_state_changed",
	// @lore BB1: "bet_state_changed" and "bet_revised" deleted — bet is now a root task.
	"session_started",
	"session_ended",
	"session_handoff_completed",
	"session_not_returned",
	"thread_created",
	"thread_message_appended",
	"thread_resolved",
	"thread_reopened",
	// @lore BC3 architecture.md §5: "item_created" DELETED — its only backing
	// store, the `items` table (the founder's conversation-review "block"
	// concept), is gone, and nothing emits it anymore.
	"sandbox_writeback_changes_detected",
	"team_created",
	"agent_added",
	"user_created",
	"notification",
	"propagation_applied",
	"propagation_failed",
	"tool_call_recorded",
] as const satisfies readonly EventType[];
// completeness: a new EventType not listed above is a compile error here.
type EventTypesComplete =
	Exclude<EventType, (typeof EVENT_TYPES)[number]> extends never
		? true
		: ["EVENT_TYPES is missing", Exclude<EventType, (typeof EVENT_TYPES)[number]>];
const EventTypesComplete: EventTypesComplete = true;
void EventTypesComplete;

/** Wildcard subscription type. */
export type WildcardType = "*";

/** Extract the event interface for a given event type string. */
export type EventByType<T extends EventType> = Extract<DomainEvent, { type: T }>;

/** Handler function for a specific event type. */
export type EventHandler<T extends EventType> = (event: EventByType<T>) => void;

/** Handler function for wildcard subscriptions. */
export type WildcardHandler = (event: DomainEvent) => void;
