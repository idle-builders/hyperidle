/**
 * `tool-handlers` Service (agent-orchestration) — outbound composition-
 * boundary (Mechanism C) DI ports, per architecture §10.2's census (the
 * merged `tools` census row, §7.5's C1 split). Real outbound edges
 * (`agent-selection`, `dispatch`) are ordinary downward-or-same-layer DI,
 * wired by the composition root
 * (`packages/server/src/services/tool-handlers-bindings.ts`) to each target's
 * real exported functions. `coreApi` (AU21 §9 Increment 1, `work`; Increment
 * 2, `users`+`conversation`, then `org`+`routine`+`handoffTask`, then
 * `knowledge`) is DIFFERENT in kind — it crosses the `CoreApiPort` write seam
 * (a real route call), not same-process DI; see `ToolHandlersCoreApiAccessor`'s
 * own doc comment below. There is no longer a standalone `conversation`/`org`/
 * `routine`/`policy`/`knowledge` port — every former
 * `ToolHandlersConversationAccessor`/`ToolHandlersOrgAccessor`/
 * `ToolHandlersRoutineAccessor`/`ToolHandlersPolicyAccessor.handoff`/
 * `ToolHandlersKnowledgeAccessor` capability moved onto `coreApi` (Increment
 * 2's conversation wave, then org/routine/handoff wave, then knowledge wave).
 *
 * Several call shapes COLLAPSE (not a 1:1 port-per-function mirror) because
 * Mechanism C forbids `tool-handlers` from importing the Services a tool
 * used to wire together itself — same shape `dispatch`'s own (historical)
 * `DispatchKnowledgeAccessor.recomputeAttentionForCandidates` collapse
 * already established:
 *  - `score-attention.ts`'s recompute mode used to build a
 *    `buildCreateReviewItemForKnowledge({conversation,work})` store and pass
 *    it into `buildAttentionService({db,eventBus,work,review})
 *    .recomputeOne(id)` — collapsed into ONE
 *    `ToolHandlersCoreApiAccessor.recomputeAttentionScoreForItem` method.
 *  - `create-item.ts`'s `resolveReviewRecipients(db, ctx, orgUsers)` —
 *    collapsed into ONE `ToolHandlersCoreApiAccessor.resolveReviewRecipientsForItem`.
 *  - `add-agent.ts`/`create-team.ts`'s `persistScaffoldedAgents(db, orgUsers,
 *    teamMembersId, specs)` — collapsed into ONE
 *    `ToolHandlersCoreApiAccessor.persistScaffoldedAgents` (the composition root
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

/**
 * @lore AU21 §9 Increment 2: every `work` read/write except `routeItem` moved
 * onto the `CoreApiPort` seam (`ToolHandlersCoreApiAccessor` below) — the
 * agent acting on core "just like the user would" (edge-disposition.md's
 * `work.{get, list, create, update}` row, both §4 seam). `routeItem` is the
 * ONE `work` capability that stays ordinary same-process logic: it takes no
 * `TDb` (a pure `{riskTier,kind,verb} -> view` string switch, zero DB access,
 * verified against `@hyperidle/work`'s real implementation) — never a seam
 * method.
 */
interface ToolHandlersWorkAccessor {
	routeItem(input: {
		readonly riskTier: string | null;
		readonly kind: string | null;
		readonly verb: string | null;
	}): "conversations" | "work" | "knowledge";
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
	/** Structural mirror of `@hyperidle/api-contract`'s `TaskView` (Mechanism C: no import). */
	getTaskById(
		id: string,
		actorId: string,
	): Promise<
		{ readonly betId: string; readonly teamId: string; readonly notes: string | null } | undefined
	>;
	getBetById(id: string, actorId: string): Promise<{ readonly status: string } | undefined>;
	updateBetById(
		id: string,
		updates: Partial<{
			description: string;
			doneCondition: string | null;
			hypothesis: string | null;
		}>,
		actorId: string,
	): Promise<void>;
	createTask(
		input: {
			readonly betId: string;
			readonly title: string;
			readonly description: string | null;
			readonly doneCondition: string | null;
			readonly ownerAgentId: string | null;
		},
		actorId: string,
	): Promise<{ readonly id: string; readonly betId: string; readonly teamId: string }>;
	/**
	 * Atomic note append via the seam. Resolves `undefined` when the task does
	 * not exist (task-not-found signal for the `log_task` handler) — never throws.
	 */
	appendTaskNote(
		taskId: string,
		entry: string,
		actorId: string,
	): Promise<{ readonly id: string } | undefined>;
	getItemById(
		id: string,
		actorId: string,
	): Promise<
		| {
				readonly riskTier: string | null;
				readonly kind: string | null;
				readonly verb: string | null;
		  }
		| undefined
	>;
	updateItemById(
		id: string,
		updates: Partial<{ riskTier: string; kind: string; verb: string }>,
		actorId: string,
	): Promise<void>;
	createItem(input: Record<string, unknown>, actorId: string): Promise<{ readonly id: string }>;
	findItemByReasoningMarker(
		marker: string,
		actorId: string,
	): Promise<{ readonly id: string } | undefined>;
	createArtifact(
		input: {
			readonly producingTaskId: string;
			readonly kind: string;
			readonly label: string | null;
			readonly preview: Record<string, unknown> | null;
		},
		actorId: string,
	): Promise<{ readonly id: string; readonly producingTaskId: string; readonly kind: string }>;
	getUserById(
		id: string,
		actorId: string,
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
		teamMembersId: string,
		actorId: string,
	): Promise<
		ReadonlyArray<{ readonly id: string; readonly name: string; readonly role: string | null }>
	>;
	/**
	 * @lore AU21 §9 Increment 2 (conversation wave): every
	 * `ToolHandlersConversationAccessor` capability moved onto this seam
	 * (`edge-disposition.md`'s `conversation.{findThread, insertThread,
	 * insertMessage, updateThread, findOrCreateDirectThread, listInbox}` row) —
	 * the agent acting on core "just like the user would", same as `work`'s
	 * Increment 2 migration. Structural mirror of
	 * `@hyperidle/api-contract`'s `ConversationThreadView` (Mechanism C: no import).
	 */
	getThreadById(
		id: string,
		actorId: string,
	): Promise<{ readonly id: string; readonly participants: readonly string[] } | undefined>;
	insertThread(
		input: {
			readonly hostKind: string;
			readonly hostId: string;
			readonly participants: readonly string[];
			readonly pinned?: boolean;
		},
		actorId: string,
	): Promise<{ readonly id: string }>;
	updateThread(
		id: string,
		updates: Partial<{
			participants: readonly string[];
			lastActiveAt: string;
			pinned: boolean;
		}>,
		actorId: string,
	): Promise<void>;
	insertMessage(
		input: {
			readonly threadId: string;
			readonly type: "plain" | "review" | "questionnaire" | "verdict";
			readonly payload: Record<string, unknown>;
			readonly clientKey: string;
		},
		actorId: string,
	): Promise<{ readonly id: string }>;
	listInboxBySenderExclusion(
		limit: number,
		actorId: string,
	): Promise<
		ReadonlyArray<{
			readonly participants: readonly string[];
			readonly message: {
				readonly id: string;
				readonly senderId: string;
				readonly threadId: string;
				readonly type: string;
				readonly payload: Record<string, unknown>;
			};
		}>
	>;
	findOrCreateDirectThread(recipientId: string, actorId: string): Promise<{ readonly id: string }>;
	getFirstThreadByHost(
		hostKind: string,
		hostId: string,
		actorId: string,
	): Promise<{ readonly id: string; readonly participants: readonly string[] } | undefined>;
	/**
	 * @lore AU21 §9 Increment 2 (org/routine/handoff wave): every former
	 * `ToolHandlersOrgAccessor`/`ToolHandlersRoutineAccessor`/
	 * `ToolHandlersPolicyAccessor.handoff` capability moved onto this seam
	 * (`edge-disposition.md`'s `org.{getTeam, getTeamMembers, createTeam,
	 * updateTeam}`, `routine.{getRoutine, insertRoutine, updateRoutine}`, and
	 * `policy.handoff` rows) — the agent acting on core "just like the user
	 * would", same as `work`/`users`/`conversation`'s earlier migrations.
	 */
	getTeamById(
		teamId: string,
		actorId: string,
	): Promise<{ readonly id: string; readonly name: string } | undefined>;
	getTeamMembersByTeamId(
		teamId: string,
		actorId: string,
	): Promise<{ readonly id: string } | undefined>;
	/** `team_members.id` -> the full row (incl. `teamId`, i.e. `teams.id`) — the AK4 two-hop resolution's second hop. */
	getTeamMembersById(
		teamMembersId: string,
		actorId: string,
	): Promise<{ readonly teamId: string } | undefined>;
	/** Atomically creates a `teams` row + its `teamMembers` companion (1:1 invariant). */
	createTeam(input: ToolHandlersCreateTeamInput, actorId: string): Promise<void>;
	/** Update team-owned columns (phase on `teams`, activeBets/leadAgentId on `teamMembers`). */
	updateTeam(
		teamId: string,
		patch: { phase?: string; activeBets?: number; leadAgentId?: string },
		actorId: string,
	): Promise<void>;
	/** Collapses `resolveReviewRecipients(db, ctx, {getUserById})` — see this file's top `@lore`. */
	resolveReviewRecipientsForItem(
		ctx: {
			readonly userId: string;
			readonly agentRole: string | undefined;
			readonly teamId: string | undefined;
		},
		actorId: string,
	): Promise<readonly string[]>;
	/** Collapses `persistScaffoldedAgents(db, {getUserById,insertUser}, teamMembersId, specs)` — see this file's top `@lore`. */
	persistScaffoldedAgents(
		teamMembersId: string | null,
		specs: readonly Record<string, unknown>[],
		actorId: string,
	): Promise<{ readonly agentIds: readonly string[]; readonly leadAgentId: string | null }>;
	insertRoutine(input: Record<string, unknown>, actorId: string): Promise<void>;
	getRoutineById(
		id: string,
		actorId: string,
	): Promise<
		{ readonly name: string; readonly state: string; readonly deletedAt: string | null } | undefined
	>;
	updateRoutineById(id: string, updates: Record<string, unknown>, actorId: string): Promise<void>;
	/** Bound `@hyperidle/policy`'s `handoff`, reached via `POST /tasks/:id/handoff`. */
	handoffTask(
		taskId: string,
		input: {
			readonly sessionId: string;
			readonly toAgent?: string;
			readonly toRole?: string;
			readonly toHuman?: boolean;
			readonly reason: string;
			readonly artifacts?: readonly string[];
			readonly remainingWork?: readonly string[];
			readonly contextId?: string;
			readonly status?: "completed" | "failed" | "blocked" | "in_progress";
			readonly error?: string;
		},
		actorId: string,
	): Promise<{
		readonly status: "success" | "escalated";
		readonly targetAgentId?: string;
		readonly escalationItemId?: string;
	}>;
	/**
	 * @lore AU21 §9 Increment 2 (knowledge wave): every former
	 * `ToolHandlersKnowledgeAccessor` capability moved onto this seam
	 * (`edge-disposition.md`'s `knowledge.{get, create, transition,
	 * findOpenConflict, recordConflict}` row) — the agent acting on core
	 * "just like the user would", same as every other Increment 2 migration.
	 *
	 * Returned search items are opaque (`Record<string, unknown>`) plus the
	 * one field `query_practice`'s handler filters on (`layer`, optional/
	 * nullable — a structural mirror, not a type import). The handler
	 * forwards the whole item back to its caller (`ok({ items })`) —
	 * narrowing the return shape to `{layer}` only would silently drop every
	 * other field (`id`/`title`/`body`/...) real callers need.
	 */
	search(
		query: string,
		opts: { readonly limit: number },
		actorId: string,
	): Promise<ReadonlyArray<Record<string, unknown> & { readonly layer?: string | null }>>;
	create(
		input: ToolHandlersCreateKnowledgeItemInput,
		actorId: string,
	): Promise<{ readonly id: string; readonly version: number }>;
	findKnowledgeItemVersionById(
		id: string,
		actorId: string,
	): Promise<{ readonly id: string; readonly version: number } | undefined>;
	findKnowledgeItemStatusById(
		id: string,
		actorId: string,
	): Promise<{ readonly status: string } | undefined>;
	findOpenConflictByItemAndProposer(
		itemId: string,
		proposedBy: string,
		actorId: string,
	): Promise<{ readonly id: string } | undefined>;
	createKnowledgeConflict(
		input: ToolHandlersCreateKnowledgeConflictInput,
		actorId: string,
	): Promise<void>;
	promoteKnowledgeItem(
		input: {
			readonly knowledgeItemId: string;
			readonly fromStatus: string;
			readonly toStatus: string;
			readonly reason: string | undefined;
			readonly editor: string;
		},
		actorId: string,
	): Promise<
		| { readonly ok: true; readonly fromStatus: string }
		| {
				readonly ok: false;
				readonly code: "CONFLICT_OPEN" | "CONCURRENT_MODIFICATION";
				readonly message: string;
		  }
	>;
	upsertKnowledgeAppProjectionAttentionScore(
		knowledgeItemId: string,
		attentionScore: string,
		actorId: string,
	): Promise<void>;
	/**
	 * Collapses `buildCreateReviewItemForKnowledge({conversation,work})` +
	 * `buildAttentionService({db,eventBus,work,review}).recomputeOne(id)` —
	 * see this file's top `@lore` (same shape `dispatch`'s own
	 * `recomputeAttentionForCandidates` collapse already established). The
	 * seam never threads a same-process `EventBus` handle over the HTTP
	 * boundary — dropped from this signature vs. the pre-migration raw
	 * `ToolHandlersKnowledgeAccessor.recomputeAttentionScoreForItem(db,
	 * eventBus, knowledgeItemId)`.
	 */
	recomputeAttentionScoreForItem(
		knowledgeItemId: string,
		actorId: string,
	): Promise<{ readonly current: number }>;
}

/** Every real outbound port this Service's source files need. */
export interface ToolHandlersPorts<TDb> {
	readonly work: ToolHandlersWorkAccessor;
	readonly agentSelection: ToolHandlersAgentSelectionAccessor<TDb>;
	readonly dispatch: ToolHandlersDispatchAccessor<TDb>;
	readonly coreApi: ToolHandlersCoreApiAccessor;
}
