/**
 * `review` Service (core-api) — outbound composition-boundary (Mechanism C)
 * DI ports, per architecture §10.2's census: `review`'s six real outbound
 * edges (`work`, `conversation`, `org`, `users`, `knowledge`,
 * `session-requests`) become injected ports here, wired by the caller
 * (still `packages/server`, the not-yet-split Application composition root)
 * to each target's real exported functions.
 *
 * @lore AU19 Increment 1k: `TaskRiskTierReader` (→ `work`) ADDED — a seventh
 * outbound edge, surfaced when finishing AU3's half-done Strategy-vocabulary
 * rename. `taskPlanningSignals`'s real owner is `work` (`riskTier` is data
 * moved off `tasks`, which `work` owns), not `review` — `review` only ever
 * READ the table (`session-review-creator.ts`'s risk-tier lookup, its one
 * accessor anywhere in the repo), so this is an ordinary same-layer
 * core-api→core-api DI port, matching `TeamCapacityReader`'s Inc-1c
 * precedent, wired directly to `@hyperidle/work`'s real exported
 * `getTaskRiskTierByTaskId`.
 *
 * @lore AU19 Increment 1j: the `work`/`conversation`/`org`/`users`/
 * `knowledge` targets are ALL already-migrated real packages (unlike
 * `work`'s Increment 1b interim edges) — ordinary same-layer
 * core-api→core-api edges, wired DIRECTLY at each call site to the real
 * exported functions (no interim indirection needed, matching
 * `TeamCapacityReader`'s Inc-1c precedent — `packages/core-api/work/src/ports.ts`).
 * Only the `session-requests` edge (`composeTailoredGrant` →
 * `recordAgentWorkIntent`) is §10.3 against-grain (core-api→orchestration).
 *
 * @lore AU19 Increment 3b: `session-requests` is now a real Service package
 * — this port's concrete wiring repoints from `packages/server`'s
 * still-flat `agent-work-intents.ts` to `@hyperidle/session-requests`'s real
 * `recordAgentWorkIntent` export (mechanical, zero behavior change). It
 * stays a plain DI port rather than the EventBus inversion §10.3 names as
 * the default lever: `composeTailoredGrant` records the intent INSIDE the
 * same transaction as the `tailoredGrants` insert + `proposedCalls`
 * status transition it is atomic with — an EventBus emit-after-commit would
 * split that into two transactions (a crash between them would leave a
 * granted call with no recorded intent), a genuine durability regression,
 * not a mechanical migration. Flagged for founder/review confirmation
 * rather than silently forcing the inversion or silently declining it —
 * see `@hyperidle/policy`'s `ports.ts` top `@lore` for the identical
 * finding on its own (more clearly synchronous) `session-requests` ports.
 *

 * Types are declared locally (structural mirrors of the target Service's own
 * types) rather than imported from the target package — a Service NEVER
 * imports another Service, even for a type-only reference (composition-
 * boundary-guard flags type-only imports too, §7.3 W4 allows typing off
 * `@hyperidle/db` directly instead).
 */
import type {
	HyperIdleDb,
	NewItem,
	NewThread,
	Task,
	Thread,
	User,
	WriteExecutor,
} from "@hyperidle/db";

// ---------------------------------------------------------------------------
// work — ReviewWorkStore (ordinary downward core-api edge)
// ---------------------------------------------------------------------------

/** Narrow patch shape `review` writes onto a task (only `threadId`, matching current usage). */
export interface ReviewTaskPatch {
	readonly threadId: string;
}

/** Port for `work`'s task read/patch + item-create surface `review` calls directly today. */
export interface ReviewWorkStore {
	getTaskById(db: WriteExecutor, id: string): Promise<Task | undefined>;
	updateTaskById(db: WriteExecutor, id: string, patch: ReviewTaskPatch): Promise<void>;
	createItem(db: WriteExecutor, values: NewItem): Promise<void>;
}

// ---------------------------------------------------------------------------
// conversation — ReviewConversationStore (ordinary downward core-api edge)
// ---------------------------------------------------------------------------

/** Port for `conversation`'s thread read/write surface `review` calls directly today. */
export interface ReviewConversationStore {
	insertThread(db: HyperIdleDb, values: NewThread): Promise<void>;
	updateThread(db: HyperIdleDb, id: string, patch: Partial<NewThread>): Promise<void>;
	getThreadById(db: HyperIdleDb, id: string): Promise<Thread | undefined>;
}

// ---------------------------------------------------------------------------
// users — ReviewUserDirectory (ordinary downward core-api edge)
// ---------------------------------------------------------------------------

/** Port for `users`' read surface `review` calls directly today. */
export interface ReviewUserDirectory {
	getUserById(db: HyperIdleDb, id: string): Promise<User | undefined>;
	listUsersByKind(db: HyperIdleDb, kind: string): Promise<User[]>;
}

// ---------------------------------------------------------------------------
// org — ReviewOrgRouting (ordinary downward core-api edge)
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/org`'s `ReviewRoutingContext` (Mechanism C — no cross-Service type import). */
export interface ReviewRoutingContext {
	userId?: string;
	agentRole?: string;
	teamId?: string;
}

/** Port for `org`'s review-recipient resolution `review` calls directly today. */
export interface ReviewOrgRouting {
	resolveReviewRecipients(
		db: HyperIdleDb,
		context: ReviewRoutingContext,
		users: Pick<ReviewUserDirectory, "listUsersByKind">,
	): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// knowledge — PracticeMeetingKnowledgeStore (ordinary downward core-api edge)
// ---------------------------------------------------------------------------

export interface RawKnowledgeItemInsert {
	readonly id: string;
	readonly topic: string | null;
	readonly title: string;
	readonly body: string;
	readonly format: string;
	readonly status: string;
	readonly version: number;
	readonly updatedBy: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface RawKnowledgeAppProjectionInsert {
	readonly id: string;
	readonly knowledgeItemId: string;
	readonly layer: string | null;
	readonly kind: string | null;
	readonly scopeId: string | null;
	readonly meta: string | null;
}

export interface RawKnowledgeEditLogInsert {
	readonly id: string;
	readonly itemId: string;
	readonly editor: string;
	readonly field: string;
	readonly oldValue: string | null;
	readonly newValue: string | null;
	readonly editType: string;
	readonly createdAt: string;
}

export interface RawKnowledgeItemRow {
	readonly id: string;
	readonly status: string;
}

export interface KnowledgeAppProjectionRow {
	readonly id: string;
	readonly knowledgeItemId: string;
	readonly layer: string | null;
	readonly scopeId: string | null;
	readonly kind: string | null;
	readonly meta: string | null;
}

export interface CapturedProjectedItem {
	readonly item: RawKnowledgeItemRow;
	readonly fabric: KnowledgeAppProjectionRow;
}

export interface ArchiveKnowledgeItemInput {
	readonly id: string;
	readonly oldStatus: string;
	readonly updatedAt: string;
	readonly updatedBy: string;
	readonly editLogId: string;
}

/** Port for `knowledge`'s low-level raw item/projection/edit-log primitives `practice-meeting.ts` needs. */
export interface PracticeMeetingKnowledgeStore {
	insertKnowledgeItem(db: HyperIdleDb, input: RawKnowledgeItemInsert): Promise<void>;
	insertKnowledgeAppProjection(
		db: HyperIdleDb,
		input: RawKnowledgeAppProjectionInsert,
	): Promise<void>;
	insertKnowledgeEditLog(db: HyperIdleDb, input: RawKnowledgeEditLogInsert): Promise<void>;
	findKnowledgeItemById(db: HyperIdleDb, id: string): Promise<RawKnowledgeItemRow | null>;
	findKnowledgeAppProjectionByItemId(
		db: HyperIdleDb,
		knowledgeItemId: string,
	): Promise<KnowledgeAppProjectionRow | null>;
	updateKnowledgeAppProjectionMetaIfUnchanged(
		db: HyperIdleDb,
		knowledgeItemId: string,
		newMeta: string,
		expectedMeta: string,
	): Promise<number>;
	touchKnowledgeItemUpdatedAt(db: HyperIdleDb, id: string, updatedAt: string): Promise<void>;
	listCapturedItemsByProjectionScope(
		db: HyperIdleDb,
		scopeId: string | null,
	): Promise<readonly CapturedProjectedItem[]>;
	archiveKnowledgeItemWithLog(db: HyperIdleDb, input: ArchiveKnowledgeItemInput): Promise<void>;
}

// ---------------------------------------------------------------------------
// work — TaskRiskTierReader (ordinary downward core-api edge, NOT against-grain)
// ---------------------------------------------------------------------------

/**
 * Port for `work`'s `task_planning_signals` risk-tier read `review` calls
 * directly today (`session-review-creator.ts`'s risk-tier lookup, driving
 * whether a review item is created for a session).
 */
export interface TaskRiskTierReader {
	getRiskTierByTaskId(db: HyperIdleDb, taskId: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// session-requests — ReviewAgentWorkIntentRecorder (§10.3 against-grain —
// real target since Increment 3b, stays a DI port, see this file's top `@lore`)
// ---------------------------------------------------------------------------

/** The one `agent_work_intents` kind `review` records today (`composeTailoredGrant`'s re-engagement). */
export type ReviewAgentWorkIntentKind = "reengagement";

export interface ReviewAgentWorkIntentInput {
	readonly kind: ReviewAgentWorkIntentKind;
	readonly sourceKind: string;
	readonly sourceId: string;
	readonly requestedBy?: string;
	readonly idempotencyKey: string;
}

export interface ReviewAgentWorkIntentRecord {
	readonly id: string;
	readonly idempotencyKey: string;
}

/** Port for `session-requests`' durable `agent_work_intents` writer (Mechanism C). */
export interface ReviewAgentWorkIntentRecorder {
	record(
		tx: WriteExecutor,
		input: ReviewAgentWorkIntentInput,
	): Promise<ReviewAgentWorkIntentRecord>;
}
