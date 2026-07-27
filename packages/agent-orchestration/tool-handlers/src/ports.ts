/**
 * `tool-handlers` Service (agent-orchestration) — outbound composition-
 * boundary (Mechanism C) DI ports, per architecture §10.2's census (the
 * merged `tools` census row, §7.5's C1 split). Real outbound edges (`work`,
 * `users`, `conversation`, `knowledge`, `org`, `agent-selection`, `routine`,
 * `dispatch`) are ordinary downward-or-same-layer DI, wired by the
 * composition root (`packages/server/src/services/tool-handlers-bindings.ts`)
 * to each target's real exported functions. `policy` is also ordinary
 * same-layer DI. `coreApi` (AU21 §9 Increment 1) is DIFFERENT in kind — it
 * crosses the `CoreApiPort` write seam (a real route call), not same-process
 * DI; see `ToolHandlersCoreApiAccessor`'s own doc comment below.
 *
 * Several call shapes COLLAPSE (not a 1:1 port-per-function mirror) because
 * Mechanism C forbids `tool-handlers` from importing the Services a tool
 * used to wire together itself — same shape `dispatch`'s own
 * `DispatchReviewAccessor.createPracticeMeeting` /
 * `DispatchKnowledgeAccessor.recomputeAttentionForCandidates` collapses
 * already established:
 *  - `score-attention.ts`'s recompute mode used to build a
 *    `buildCreateReviewItemForKnowledge({conversation,work})` store and pass
 *    it into `buildAttentionService({db,eventBus,work,review})
 *    .recomputeOne(id)` — collapsed into ONE
 *    `ToolHandlersKnowledgeAccessor.recomputeAttentionScoreForItem` method.
 *  - `create-item.ts`'s `resolveReviewRecipients(db, ctx, orgUsers)` —
 *    collapsed into ONE `ToolHandlersOrgAccessor.resolveReviewRecipientsForItem`.
 *  - `add-agent.ts`/`create-team.ts`'s `persistScaffoldedAgents(db, orgUsers,
 *    teamMembersId, specs)` — collapsed into ONE
 *    `ToolHandlersOrgAccessor.persistScaffoldedAgents` (the composition root
 *    still wires the same `{getUserById, insertUser}` `orgUsers` object
 *    internally, just one level up).
 *
 * Types are declared locally (structural mirrors of the target Service's own
 * types, or a narrow generic `TDb`) rather than imported from the target
 * package — a Service NEVER imports another Service, even for a type-only
 * reference (`dispatch`'s `ports.ts` top `@lore` established this precedent
 * first). Pipeline values a handler only ever spreads/forwards (never reads
 * a specific field of) are typed `Record<string, unknown>` rather than
 * mirrored field-by-field.
 *
 * @lore AU20 Stage 2: All 16 sub-interface type exports removed — they are
 * now structurally internal under `ToolHandlersPorts`. External code that
 * holds a `ToolHandlersPorts<TDb>` accesses each sub-port structurally
 * without needing to import the named interface. `parseCron`/`nextCronMatch`
 * removed from `ToolHandlersDispatchAccessor` — relocated to
 * `@hyperidle/shared` so tool implementations import them directly (2 of 3
 * dispatch back-edges deleted; only `provisionTeamRoutines` remains).
 */

import type { UserRole } from "@hyperidle/shared";

interface ToolHandlersWorkAccessor<TDb> {
	getTaskById(
		db: TDb,
		id: string,
	): Promise<
		{ readonly betId: string; readonly teamId: string; readonly notes: string | null } | undefined
	>;
	getBetById(db: TDb, id: string): Promise<{ readonly status: string } | undefined>;
	updateBetById(
		db: TDb,
		id: string,
		updates: Partial<{
			description: string;
			doneCondition: string | null;
			hypothesis: string | null;
		}>,
	): Promise<void>;
	createTask(
		db: TDb,
		input: {
			readonly id: string;
			readonly betId: string;
			readonly teamId: string;
			readonly ownerAgentId: string;
			readonly title: string;
			readonly description: string | null;
			readonly doneCondition: string | null;
			readonly state: "proposed";
			readonly createdAt: string;
			readonly updatedAt: string;
		},
	): Promise<void>;
	updateTaskById(
		db: TDb,
		id: string,
		updates: Partial<{ notes: string; updatedAt: string }>,
	): Promise<void>;
	/**
	 * Atomic note append — single UPDATE with SQL CASE, no pre-read.
	 * Returns `{ id }` when the task was found and updated, `undefined` when
	 * the task does not exist (task-not-found signal for the `log_task` handler).
	 */
	appendTaskNote(
		db: TDb,
		taskId: string,
		entry: string,
	): Promise<{ readonly id: string } | undefined>;
	getItemById(
		db: TDb,
		id: string,
	): Promise<
		| {
				readonly riskTier: string | null;
				readonly kind: string | null;
				readonly verb: string | null;
		  }
		| undefined
	>;
	updateItemById(
		db: TDb,
		id: string,
		updates: Partial<{ riskTier: string; kind: string; verb: string }>,
	): Promise<void>;
	createItem(db: TDb, input: Record<string, unknown>): Promise<void>;
	routeItem(input: {
		readonly riskTier: string | null;
		readonly kind: string | null;
		readonly verb: string | null;
	}): "conversations" | "work" | "knowledge";
	findItemByReasoningMarker(db: TDb, marker: string): Promise<{ readonly id: string } | undefined>;
	createArtifact(
		db: TDb,
		input: {
			readonly id: string;
			readonly producingTaskId: string;
			readonly kind: string;
			readonly label: string | null;
			readonly previewJson: string | null;
			readonly createdAt: string;
		},
	): Promise<void>;
}

interface ToolHandlersUsersAccessor<TDb> {
	getUserById(
		db: TDb,
		id: string,
	): Promise<
		| {
				readonly id: string;
				readonly role: string | null;
				readonly teamId: string | null;
				readonly name: string;
		  }
		| undefined
	>;
	listUsersByTeam(
		db: TDb,
		teamMembersId: string,
	): Promise<
		ReadonlyArray<{ readonly id: string; readonly name: string; readonly role: string | null }>
	>;
}

interface ToolHandlersConversationAccessor<TDb> {
	getThreadById(
		db: TDb,
		id: string,
	): Promise<{ readonly id: string; readonly participants: string } | undefined>;
	insertThread(db: TDb, input: Record<string, unknown>): Promise<void>;
	updateThread(db: TDb, id: string, updates: Record<string, unknown>): Promise<void>;
	insertMessage(db: TDb, input: Record<string, unknown>): Promise<void>;
	listInboxBySenderExclusion(
		db: TDb,
		agentId: string,
		limit: number,
	): Promise<ReadonlyArray<{ readonly participants: string; readonly message: unknown }>>;
	findOrCreateDirectThread(db: TDb, agentA: string, agentB: string, now: string): Promise<string>;
	getFirstThreadByHost(
		db: TDb,
		hostKind: string,
		hostId: string,
	): Promise<{ readonly id: string; readonly participants: string } | undefined>;
}

/**
 * Structural mirror of `org`'s own `CreateTeamInput` (`team-lookup.ts`) —
 * `org`'s `createTeam` atomically inserts both the `teams` row and its
 * `teamMembers` companion (1:1 invariant). `teamMembersId` replaced the
 * old separate `CreateTeamMembersGroupInput.id` (AU20 Am7).
 */
interface ToolHandlersCreateTeamInput {
	readonly id: string;
	readonly name: string;
	readonly phase: string;
	readonly functions: string | null;
	readonly factoryDbPath: string | null;
	readonly createdAt: string;
	/** The `teamMembers.id` for the companion row (1:1 invariant). */
	readonly teamMembersId: string;
	readonly capacity?: number;
	readonly activeBets?: number;
	readonly formedAt?: string;
}

interface ToolHandlersOrgAccessor<TDb> {
	getTeamById(
		db: TDb,
		teamId: string,
	): Promise<{ readonly id: string; readonly name: string } | undefined>;
	getTeamMembersByTeamId(db: TDb, teamId: string): Promise<{ readonly id: string } | undefined>;
	/** `team_members.id` -> the full row (incl. `teamId`, i.e. `teams.id`) — the AK4 two-hop resolution's second hop. */
	getTeamMembersById(
		db: TDb,
		teamMembersId: string,
	): Promise<{ readonly teamId: string } | undefined>;
	/**
	 * Atomically creates a `teams` row + its `teamMembers` companion (1:1 invariant).
	 * @lore AU20 Am7: replaces the old `createTeam + createTeamMembersGroup` two-call pattern.
	 */
	createTeam(db: TDb, input: ToolHandlersCreateTeamInput): Promise<void>;
	/**
	 * Update team-owned columns (phase on `teams`, activeBets/leadAgentId on `teamMembers`).
	 * @lore AU20 Am7: replaces `setTeamMembersLeadAgent` (and `updateTeamPhase`/`setTeamMembersActiveBets`).
	 */
	updateTeam(
		db: TDb,
		teamId: string,
		patch: { phase?: string; activeBets?: number; leadAgentId?: string },
	): Promise<void>;
	/** Collapses `resolveReviewRecipients(db, ctx, {getUserById})` — see this file's top `@lore`. */
	resolveReviewRecipientsForItem(
		db: TDb,
		ctx: {
			readonly userId: string;
			readonly agentRole: string | undefined;
			readonly teamId: string | undefined;
		},
	): Promise<readonly string[]>;
	/** Collapses `persistScaffoldedAgents(db, {getUserById,insertUser}, teamMembersId, specs)` — see this file's top `@lore`. */
	persistScaffoldedAgents(
		db: TDb,
		teamMembersId: string | null,
		specs: readonly Record<string, unknown>[],
	): Promise<{ readonly agentIds: readonly string[]; readonly leadAgentId: string | null }>;
}

interface ToolHandlersAgentSelectionAccessor<TDb> {
	resolveScaffoldSpecs(input: {
		readonly db: TDb;
		/** Narrowed to `agent-selection`'s own `ScaffoldRequest.trigger` literal union (structural mirror, not a type import — same reasoning as `role` below). */
		readonly trigger: "team_scaffold" | "agent_added" | "user_assistant";
		readonly teamId: string;
		readonly teamMembersId: string | null;
		readonly teamName: string;
		readonly functions: readonly string[] | null;
		/** Agent-selection requires the exact shared role union, not an arbitrary string. */
		readonly role: UserRole | null;
		readonly name: string | null;
		readonly ownerUserId: string | null;
		readonly ownerUserName: string | null;
	}): Promise<readonly Record<string, unknown>[]>;
}

interface ToolHandlersRoutineAccessor<TDb> {
	insertRoutine(db: TDb, input: Record<string, unknown>): Promise<void>;
	getRoutineById(
		db: TDb,
		id: string,
	): Promise<
		{ readonly name: string; readonly state: string; readonly deletedAt: string | null } | undefined
	>;
	updateRoutineById(db: TDb, id: string, updates: Record<string, unknown>): Promise<void>;
}

/**
 * @lore AU20 Stage 2: `parseCron` and `nextCronMatch` removed — they are
 * pure utilities relocated to `@hyperidle/shared`. Only `provisionTeamRoutines`
 * remains as a genuine service-layer back-edge (it provisions DB rows and
 * spawns work — cannot be a pure utility).
 */
interface ToolHandlersDispatchAccessor<TDb> {
	/** Opaque pass-through — this Service's own bound `provisionTeamRoutines`. Never inspected here. */
	provisionTeamRoutines(
		db: TDb,
		opts: {
			readonly teamId: string;
			readonly ownerByRole: Partial<Record<string, string>>;
			readonly leadAgentId: string;
		},
	): Promise<unknown>;
}

/**
 * Structural mirror of `knowledge`'s own `CreateKnowledgeItemInput`
 * (`knowledge-repository.ts`) — same reasoning as
 * `ToolHandlersCreateTeamInput`: `knowledge.create` reads these
 * specific fields, so this cannot stay the opaque `Record<string, unknown>`
 * shape. `KnowledgeLayer`/`KnowledgeKind`/`KnowledgeStatus` literal unions
 * widen to `string` (Mechanism C: never importing `knowledge`'s own types).
 */
interface ToolHandlersCreateKnowledgeItemInput {
	readonly layer: string | null;
	readonly scopeKind?: string | null;
	readonly scopeId?: string | null;
	readonly kind?: string | null;
	readonly topic?: string | null;
	readonly title: string;
	readonly body: string;
	readonly format: string;
	readonly status: string;
	readonly updatedBy: string;
	readonly attentionScore?: number | null;
	readonly confidence?: number | null;
	readonly meta?: string | null;
}

/** Structural mirror of `knowledge`'s own `CreateKnowledgeConflictInput` (`conflict-review-store.ts`). */
interface ToolHandlersCreateKnowledgeConflictInput {
	readonly id: string;
	readonly itemId: string;
	readonly versionBase: number;
	readonly versionCurrent: number;
	readonly proposedBody: string;
	readonly proposedMeta: string | null;
	readonly proposedBy: string;
	readonly createdAt: string;
}

interface ToolHandlersKnowledgeAccessor<TDb> {
	/**
	 * Returned items are opaque (`Record<string, unknown>`) plus the one field
	 * `query-practice.ts`'s handler filters on (`layer`, optional/nullable —
	 * matches `knowledge`'s own `KnowledgeItemWithProjection.layer` exactly,
	 * a structural mirror not a type import). The handler forwards the whole
	 * item back to its caller (`ok({ items })`) — narrowing the return shape
	 * to `{layer}` only, as an earlier draft of this port did, would silently
	 * drop every other field (`id`/`title`/`body`/...) real callers need.
	 */
	search(
		db: TDb,
		query: string,
		opts: { readonly limit: number },
	): Promise<ReadonlyArray<Record<string, unknown> & { readonly layer?: string | null }>>;
	create(
		db: TDb,
		input: ToolHandlersCreateKnowledgeItemInput,
	): Promise<{ readonly id: string; readonly version: number }>;
	findKnowledgeItemVersionById(
		db: TDb,
		id: string,
	): Promise<{ readonly id: string; readonly version: number } | undefined>;
	findKnowledgeItemStatusById(
		db: TDb,
		id: string,
	): Promise<{ readonly status: string } | undefined>;
	findOpenConflictByItemAndProposer(
		db: TDb,
		itemId: string,
		proposedBy: string,
	): Promise<{ readonly id: string } | undefined>;
	createKnowledgeConflict(db: TDb, input: ToolHandlersCreateKnowledgeConflictInput): Promise<void>;
	promoteKnowledgeItem(
		db: TDb,
		input: {
			readonly knowledgeItemId: string;
			readonly fromStatus: string;
			readonly toStatus: string;
			readonly reason: string | undefined;
			readonly editor: string;
		},
	): Promise<
		| { readonly ok: true; readonly fromStatus: string }
		| {
				readonly ok: false;
				readonly code: "CONFLICT_OPEN" | "CONCURRENT_MODIFICATION";
				readonly message: string;
		  }
	>;
	upsertKnowledgeAppProjectionAttentionScore(
		db: TDb,
		knowledgeItemId: string,
		attentionScore: string,
	): Promise<void>;
	/**
	 * Collapses `buildCreateReviewItemForKnowledge({conversation,work})` +
	 * `buildAttentionService({db,eventBus,work,review}).recomputeOne(id)` —
	 * see this file's top `@lore` (same shape `dispatch`'s own
	 * `recomputeAttentionForCandidates` collapse already established).
	 */
	recomputeAttentionScoreForItem(
		db: TDb,
		eventBus: unknown,
		knowledgeItemId: string,
	): Promise<{ readonly current: number }>;
}

/** Structural mirror of `@hyperidle/policy`'s `HandoffMetadata`/`HandoffParams`/`HandoffResult` (Mechanism C). */
interface ToolHandlersHandoffMetadata {
	// biome-ignore lint/style/useNamingConvention: agent handoff protocol wire format uses snake_case
	context_id: string;
	status: "completed" | "failed" | "blocked" | "in_progress";
	reason: string;
	artifacts: string[];
	// biome-ignore lint/style/useNamingConvention: agent handoff protocol wire format uses snake_case
	remaining_work: string[];
	error?: string;
}

interface ToolHandlersSessionContext {
	sessionId: string;
	agentId: string;
	taskId: string;
	sandboxPath: string;
	ingestion: { dispose(): void };
	traceId: string;
}

interface ToolHandlersHandoffParams {
	sessionContext: ToolHandlersSessionContext;
	toAgent?: string;
	toRole?: string;
	toHuman?: boolean;
	metadata: ToolHandlersHandoffMetadata;
}

interface ToolHandlersHandoffResult {
	status: "success" | "escalated";
	targetAgentId?: string;
	escalationItemId?: string;
}

interface ToolHandlersPolicyAccessor<TDb> {
	/** Bound `@hyperidle/policy`'s `handoff` — wired at the composition root, same idiom `dispatch-bindings.ts` already established. */
	handoff(
		db: TDb,
		eventBus: unknown,
		params: ToolHandlersHandoffParams,
	): Promise<ToolHandlersHandoffResult>;
}

/**
 * `CoreApiPort` write-seam accessor (AU21 §9 Increment 1). Unlike every
 * other accessor in this file, this one takes NO `TDb` — the write crosses
 * via the seam's transport (a real `POST /bets` route call through the
 * SAME door core-ui uses, architecture.md §6 Decision A/C), not a
 * same-process DB handle. `actorId` carries the calling agent's own
 * identity as the route actor (§12) — the composition root threads it onto
 * the request, never a hardcoded/founder constant.
 */
interface ToolHandlersCoreApiAccessor {
	createBet(
		input: {
			readonly teamId: string;
			readonly description: string;
			readonly doneCondition: string | null;
			readonly hypothesis: string | null;
		},
		actorId: string,
	): Promise<{ readonly id: string; readonly teamId: string; readonly status: string }>;
}

/** Every real outbound port this Service's source files need. */
export interface ToolHandlersPorts<TDb> {
	readonly work: ToolHandlersWorkAccessor<TDb>;
	readonly users: ToolHandlersUsersAccessor<TDb>;
	readonly conversation: ToolHandlersConversationAccessor<TDb>;
	readonly org: ToolHandlersOrgAccessor<TDb>;
	readonly agentSelection: ToolHandlersAgentSelectionAccessor<TDb>;
	readonly routine: ToolHandlersRoutineAccessor<TDb>;
	readonly dispatch: ToolHandlersDispatchAccessor<TDb>;
	readonly knowledge: ToolHandlersKnowledgeAccessor<TDb>;
	readonly policy: ToolHandlersPolicyAccessor<TDb>;
	readonly coreApi: ToolHandlersCoreApiAccessor;
}
