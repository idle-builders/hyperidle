/**
 * `policy` Service (core-api) — outbound composition-boundary (Mechanism C)
 * DI ports, per architecture §10.2's census (as refined during this
 * migration — the census is "a floor, refinable during migration", §14):
 * `policy`'s real outbound edges (`work`, `conversation`, `users`, `org`,
 * `notifications`) are ordinary same-layer core-api→core-api edges, wired at
 * each real call site directly to the target's real exported functions
 * (already-migrated packages, same idiom as `review`'s Increment 1j ports).
 * The three §10.3 against-grain edges (`session-requests`, `cost`,
 * `session-lifecycle` — all `core-api → agent-orchestration`) are wired as
 * DI ports. `PolicyCostDedupReleaser`/`PolicySessionTerminationRequester`
 * (`cost`/`session-lifecycle`, not real packages yet) stay interim, still
 * flagged for a future increment's EventBus-vs-permanent-port check once
 * those Services exist. `PolicyAgentWorkIntentRecorder`/
 * `PolicyAgentSessionRequestReader`/`PolicySessionRunRegistry`
 * (`session-requests`, real as of Increment 3b) are **permanent** —
 * §10.3's amendment (decided Increment 3b, founder-directed): the
 * `handoff-protocol.ts` read-then-branch (`findBySessionId` feeding a
 * same-request `requestTermination`) shares a transaction with the
 * caller's domain write, and `plans/AU9/requirements.md` line 51 mandates
 * synchronous same-transaction intent recording — an EventBus emit-after-
 * commit would be a durability regression, not a mechanical rewire. Same
 * exception lever as §11's `AgentWorkIntentRecorder` (`routes/threads.ts`
 * case). Matches `work`'s `AgentWorkIntentRecorder`/`AgentSelectionDefaults`/
 * `CostCapChecker` port *shape* (`packages/core-api/work/src/ports.ts`) —
 * but do not assume `work`'s ports inherit this same permanence without
 * their own same-transaction check (§10.3 amendment note).
 *
 * @lore AU19 Increment 2a — census corrections discovered migrating for
 * real (§14 sanctions updating the census as a "floor, refinable during
 * migration"):
 *  1. `policy → org` (`teamMembers`) was MISSING from the original census —
 *     `handoff-protocol.ts`'s role-based routing read `teamMembers` directly
 *     via a raw multi-row `.select(...).where(eq(teamMembers.teamId, ...))`.
 *     `org`'s own `team-lookup.ts` documents `team_members` as a real 1:1
 *     invariant per team (`loadTeamMembers` throws if a team has more or
 *     fewer than exactly one row) — so this is behaviorally identical to
 *     `org`'s existing `getTeamMembersByTeamId` (single-row read), reused
 *     here instead of duplicating the raw query. `PolicyOrgTeamReader`.
 *  2. `policy ⚠ session-requests` underexpressed at ×2 — a THIRD call,
 *     `sessionRunRegistry.abort(sessionId)` (`session-run-registry.ts`,
 *     confirmed `session-requests`-owned per architecture §4 line 88), was
 *     never counted. `PolicySessionRunRegistry`.
 *  3. `policy → knowledge` (×1, `PropagationLevel` type) DISSOLVES: the type
 *     is independently exported from `@hyperidle/shared` (`knowledge.ts`,
 *     identical literal union `"session"|"task"|"bet"|"team"|"portfolio"`)
 *     — importing it from `@hyperidle/shared` instead of `@hyperidle/knowledge`
 *     is a zero-behavior-change type-identity swap, same resolution lever as
 *     the `settings ⚠ (builtin-tool-catalog)` §10.3 dissolution.
 *  4. `policy → conversation`/`policy → notifications`/`policy → users` are
 *     all undercounted in the original per-source table (which only credited
 *     `approval-rate`'s and `lifecycle-propagation`'s calls) — `policy-engine.ts`
 *     and `handoff-protocol.ts` make additional real calls into both. The
 *     ports below cover every real call site found across all four files.
 *
 * Structural ports, same idiom as `@hyperidle/review`'s `ports.ts`: each
 * mirrors the real target function's signature so the concrete caller
 * (still `packages/server`, the not-yet-split composition root) can pass its
 * existing function reference unchanged — zero behavior change. Types are
 * declared locally (structural mirrors of the target Service's own types, or
 * typed directly off `@hyperidle/db` row types per §7.3 W4) rather than
 * imported from the target package — a Service NEVER imports another
 * Service, even for a type-only reference.
 */

import type {
	Bet,
	Item,
	Message,
	NewBet,
	NewItem,
	NewNotificationQueueRow,
	NewTask,
	NewThread,
	Task,
	TeamMember,
	User,
	WriteExecutor,
} from "@hyperidle/db";
import type { EventBus, TaskState } from "@hyperidle/shared";

// ---------------------------------------------------------------------------
// work — PolicyWorkStore (ordinary downward core-api edge)
// ---------------------------------------------------------------------------

/** Port for `work`'s item/task/bet read+write surface `policy` calls directly today. */
export interface PolicyWorkStore {
	getItemById(db: WriteExecutor, id: string): Promise<Item | undefined>;
	updateItemById(db: WriteExecutor, id: string, patch: Partial<NewItem>): Promise<void>;
	listItemIdsBySourceAgent(db: WriteExecutor, sourceAgentId: string): Promise<string[]>;
	getTaskById(db: WriteExecutor, id: string): Promise<Task | undefined>;
	updateTaskById(db: WriteExecutor, id: string, patch: Partial<NewTask>): Promise<void>;
	createItem(db: WriteExecutor, values: NewItem): Promise<void>;
	getBetById(db: WriteExecutor, id: string): Promise<Bet | undefined>;
	transitionBetStatus(
		db: WriteExecutor,
		args: { betId: string; fromStatus: string; patch: Partial<NewBet> },
	): Promise<{ applied: boolean }>;
	transitionTaskState(
		db: WriteExecutor,
		args: { taskId: string; fromState: string; patch: Partial<NewTask> },
	): Promise<{ applied: boolean }>;
	listTasks(db: WriteExecutor, opts?: { betId?: string }): Promise<Task[]>;
}

// ---------------------------------------------------------------------------
// conversation — PolicyConversationStore (ordinary downward core-api edge)
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/conversation`'s `MessageListOpts` (Mechanism C). */
export interface PolicyMessageListOpts {
	readonly type?: string;
	readonly order?: "createdAt";
	readonly dir?: "asc" | "desc";
	readonly limit?: number;
}

/** Structural mirror of `@hyperidle/conversation`'s `VerdictMessageRow` (Mechanism C). */
export interface PolicyVerdictMessageRow {
	readonly id: string;
	readonly payload: string;
	readonly threadId: string;
	readonly createdAt: string;
}

/** Port for `conversation`'s thread/message read+write surface `policy` calls directly today. */
export interface PolicyConversationStore {
	insertMessage(db: WriteExecutor, values: NewMessagePayload): Promise<void>;
	updateMessage(db: WriteExecutor, id: string, patch: Partial<NewMessagePayload>): Promise<void>;
	listMessagesByThread(
		db: WriteExecutor,
		threadId: string,
		opts?: PolicyMessageListOpts,
	): Promise<Message[]>;
	insertThread(db: WriteExecutor, values: NewThread): Promise<void>;
	updateThread(db: WriteExecutor, id: string, patch: Partial<NewThread>): Promise<void>;
	listInitiatedVerdictMessages(
		db: WriteExecutor,
		initiatorId: string,
		windowStart: string,
	): Promise<PolicyVerdictMessageRow[]>;
	listVerdictMessagesByItemIds(
		db: WriteExecutor,
		itemIds: string[],
		windowStart: string,
	): Promise<PolicyVerdictMessageRow[]>;
}

/**
 * Structural mirror of `@hyperidle/conversation`'s `NewMessage` insert shape
 * (Mechanism C — `policy` never imports the target's own `NewMessage` type).
 * Narrowed to the fields `policy-engine.ts`/`handoff-protocol.ts` actually
 * write.
 */
export interface NewMessagePayload {
	readonly id: string;
	readonly senderId: string;
	readonly threadId: string;
	readonly type: string;
	readonly payload: string;
	readonly clientKey: string;
	readonly legacyItemId?: string;
	readonly createdAt: string;
	readonly resolvedAt?: string;
}

// ---------------------------------------------------------------------------
// users — PolicyUserDirectory (ordinary downward core-api edge)
// ---------------------------------------------------------------------------

/** Port for `users`' read surface `policy` calls directly today. */
export interface PolicyUserDirectory {
	getUserById(db: WriteExecutor, id: string): Promise<User | undefined>;
	getFirstUserByKind(db: WriteExecutor, kind: string): Promise<User | undefined>;
	findActiveTeammateByRole(
		db: WriteExecutor,
		role: string,
		teamMembersIds: string[],
		excludeId: string,
	): Promise<User | undefined>;
}

// ---------------------------------------------------------------------------
// org — PolicyOrgTeamReader (ordinary downward core-api edge, NOT against-grain)
// ---------------------------------------------------------------------------

/**
 * Port for `org`'s team-membership read `handoff-protocol.ts`'s role-based
 * routing calls directly today. `getByTeamId` replaces the former raw
 * multi-row `teamMembers` select — see this file's top `@lore` (census
 * correction #1) for why a single-row read is behaviorally identical.
 */
export interface PolicyOrgTeamReader {
	getByTeamId(db: WriteExecutor, teamId: string): Promise<TeamMember | undefined>;
}

// ---------------------------------------------------------------------------
// notifications — PolicySilenceChecker + PolicyNotificationQueue (ordinary)
// ---------------------------------------------------------------------------

/** Item shape `policy-engine.ts`'s silence check needs (mirrors notifications' own `SilenceItem`). */
export interface PolicySilenceItem {
	readonly sourceAgentId: string | null;
}

/**
 * Port for `notifications`' `isSilenced` predicate. The composition root
 * closes over `notifications`' own `NotificationsSilenceDeps` (settings/
 * users/org wiring) — `policy` never sees that type, only the boolean
 * result, keeping `notifications`' internal deps shape entirely inside its
 * own boundary.
 */
export interface PolicySilenceChecker {
	isSilenced(db: WriteExecutor, item: PolicySilenceItem, now: Date): Promise<boolean>;
}

/** Structural mirror of `@hyperidle/notifications`' `NewNotificationQueueRow` insert shape. */
export type PolicyNewNotificationRow = NewNotificationQueueRow;

/** Port for `notifications`' queue writer `lifecycle-propagation.ts` calls directly today. */
export interface PolicyNotificationQueue {
	insert(db: WriteExecutor, row: PolicyNewNotificationRow): Promise<void>;
}

// ---------------------------------------------------------------------------
// session-requests — against-grain (§10.3 — Inc 3 rewires to EventBus)
// ---------------------------------------------------------------------------

/**
 * The one `agent_work_intents` kind `policy` records today
 * (`handoff-protocol.ts`'s owner-handoff dispatch attempt).
 */
export type PolicyAgentWorkIntentKind = "task_run";

export interface PolicyAgentWorkIntentInput {
	readonly kind: PolicyAgentWorkIntentKind;
	readonly sourceKind: string;
	readonly sourceId: string;
	readonly requestedBy?: string;
	readonly idempotencyKey: string;
}

export interface PolicyAgentWorkIntentRecord {
	readonly id: string;
	readonly idempotencyKey: string;
}

/** Port for `session-requests`' durable `agent_work_intents` writer (Mechanism C). */
export interface PolicyAgentWorkIntentRecorder {
	record(
		tx: WriteExecutor,
		input: PolicyAgentWorkIntentInput,
	): Promise<PolicyAgentWorkIntentRecord>;
}

/** Port for `session-requests`' `agent_session_requests` correlated-request read. */
export interface PolicyAgentSessionRequestReader {
	findBySessionId(db: WriteExecutor, sessionId: string): Promise<{ id: string } | undefined>;
}

/** Port for `session-requests`' `session-run-registry.ts` (census correction #2 above). */
export interface PolicySessionRunRegistry {
	abort(sessionId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// cost — against-grain (§10.3 — Inc 3 rewires to EventBus)
// ---------------------------------------------------------------------------

/** Port for `cost`'s per-session dedup release `handoff-protocol.ts` calls directly today. */
export interface PolicyCostDedupReleaser {
	release(sessionId: string): void;
}

// ---------------------------------------------------------------------------
// session-lifecycle — against-grain (§10.3 — Inc 3 rewires to EventBus)
// ---------------------------------------------------------------------------

/** The one termination reason `policy` requests today (`handoff-protocol.ts`'s handoff path). */
export type PolicyTerminationReason = "handoff";

export interface PolicyTerminationRequest {
	readonly requestId: string;
	readonly reason: PolicyTerminationReason;
	readonly requestedBy?: string;
}

/** Port for `session-lifecycle`'s agent-termination request `handoff-protocol.ts` calls directly today. */
export interface PolicySessionTerminationRequester {
	requestTermination(
		db: WriteExecutor,
		input: PolicyTerminationRequest,
	): Promise<"accepted" | "idempotent" | "conflict" | "terminal">;
}

/**
 * Structural mirror of `session-lifecycle`'s `SessionContext`, narrowed to
 * the three fields `handoff-protocol.ts` actually reads (`sessionId`,
 * `agentId`, `taskId`) — a Service never imports another Service's type,
 * even a large one it only touches partially. The full production
 * `SessionContext` object structurally satisfies this narrower shape (TS
 * excess-property checks only apply to object literals, not variables), so
 * every real caller passes its existing object unchanged.
 */
export interface PolicySessionContext {
	readonly sessionId: string;
	readonly agentId: string;
	readonly taskId: string | null;
}

// ---------------------------------------------------------------------------
// Aggregate deps bundles (per registration entry point)
// ---------------------------------------------------------------------------

/** Deps `registerPolicyEngine` needs — `work`/`conversation`/`notifications` (Mechanism C). */
export interface PolicyEngineDeps {
	readonly work: Pick<PolicyWorkStore, "getItemById" | "updateItemById">;
	readonly conversation: Pick<
		PolicyConversationStore,
		"insertMessage" | "listMessagesByThread" | "updateMessage" | "updateThread"
	>;
	readonly silence: PolicySilenceChecker;
	readonly approvalRate: ApprovalRateDeps;
}

/** Deps `computeApprovalRate` needs — `work`/`conversation` (Mechanism C). */
export interface ApprovalRateDeps {
	readonly work: Pick<PolicyWorkStore, "listItemIdsBySourceAgent">;
	readonly conversation: Pick<
		PolicyConversationStore,
		"listInitiatedVerdictMessages" | "listVerdictMessagesByItemIds"
	>;
}

/** Deps `buildHandoff` needs — every real outbound edge `handoff-protocol.ts` has. */
export interface HandoffDeps {
	readonly work: Pick<PolicyWorkStore, "getTaskById" | "updateTaskById" | "createItem">;
	readonly conversation: Pick<PolicyConversationStore, "insertMessage" | "insertThread">;
	readonly users: Pick<PolicyUserDirectory, "getUserById" | "findActiveTeammateByRole">;
	readonly org: PolicyOrgTeamReader;
	readonly sessionRequests: PolicyAgentWorkIntentRecorder &
		PolicyAgentSessionRequestReader &
		PolicySessionRunRegistry;
	readonly cost: PolicyCostDedupReleaser;
	readonly sessionLifecycle: PolicySessionTerminationRequester;
}

/** Deps `registerLifecyclePropagation` needs — every real outbound edge `lifecycle-propagation.ts` has. */
export interface LifecyclePropagationDeps {
	readonly work: Pick<
		PolicyWorkStore,
		"getTaskById" | "transitionTaskState" | "getBetById" | "transitionBetStatus" | "listTasks"
	>;
	readonly conversation: Pick<PolicyConversationStore, "insertMessage" | "insertThread">;
	readonly users: Pick<PolicyUserDirectory, "getFirstUserByKind">;
	readonly notifications: PolicyNotificationQueue;
}

// Re-exported for call sites that need the plain EventBus type alongside these ports.
export type { EventBus, TaskState };
