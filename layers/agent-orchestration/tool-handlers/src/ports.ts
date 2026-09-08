/**
 * `tool-handlers` Service (agent-orchestration) — outbound composition-
 * boundary (Mechanism C) DI ports, per architecture §10.2's census (the
 * merged `tools` census row, §7.5's C1 split). The one remaining real
 * outbound edge (`routine`, renamed from `dispatch` in AU21 §9 Increment 9 —
 * `dispatch` no longer offers `provisionTeamRoutines` at all) is ordinary
 * composition-root DI, wired by the composition root
 * (`layers/core-api/src/services/tool-handlers-bindings.ts`) directly to
 * `@hyperidle/routine`'s real exported function. `coreApi` (AU21 §9 Increment 1, `work`; Increment
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
 * The one import below is `@hyperidle/db`, which is a framework leaf rather
 * than a Service — the rule above forbids importing another SERVICE's types,
 * and the db handle is the one type both sides of every port already name.
 *
 * @lore AU20 Stage 2: All 16 sub-interface type exports removed — they are
 * now structurally internal under `ToolHandlersPorts`. External code that
 * holds a `ToolHandlersPorts` accesses each sub-port structurally
 * without needing to import the named interface. `parseCron`/`nextCronMatch`
 * removed from `ToolHandlersDispatchAccessor` — relocated to
 * `@hyperidle/cron` so tool implementations import them directly (2 of 3
 * dispatch back-edges deleted; only `provisionTeamRoutines` remains).
 *
 * @lore AU21 §6 Decision F1: the `agentSelection` port
 * (`resolveScaffoldSpecs`) is REMOVED — traced to be pure (never reads its
 * own injected deps, never reads `db`/`teamId`/`teamMembersId`), it folded
 * into `@hyperidle/db`'s `resolveAgentScaffoldSpecs`, a leaf function this
 * Service now imports directly (Mechanism C: `@hyperidle/db` is a leaf every
 * Service may import).
 */

/**
 * @lore AU21 §6 Decision L3: `ToolHandlersWorkAccessor`/`routeItem` — the
 * last standalone same-process `work` DI capability — is DELETED, not
 * relocated. Traced to be vestigial: its `view` output was consumed by
 * nothing (no persisted column, no display reader, no downstream tool),
 * and core-api itself already abandoned inline routing at item creation
 * (`@lore O2` in `routes/conversations.ts`). Every `work` read/write now
 * crosses the `CoreApiPort` seam (`ToolHandlersCoreApiAccessor` below) —
 * there is no longer a standalone `work` accessor at all.
 */

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
	readonly factoryDbPath: string | null;
	readonly createdAt: string;
	/** The `teamMembers.id` for the companion row (1:1 invariant). */
	readonly teamMembersId: string;
	readonly capacity?: number;
	// @lore BB1: activeBets removed — WIP limit is capacity counted live.
	readonly formedAt?: string;
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
	readonly layer?: string;
	/** Required, mirroring `CreateKnowledgeItemRequest` — see the note there. */
	readonly scopeKind: string;
	readonly scopeId?: string | null;
	/**
	 * Where the item hangs. A produced item — what used to be an artifact — is
	 * parented to the task or the conversation that produced it.
	 */
	readonly parentKind?: "task" | "thread";
	readonly parentId?: string;
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
 * via the seam's transport (a real route call through the SAME door core-ui
 * uses, architecture.md §6 Decision A/C), not a same-process DB handle.
 * `actorId` carries the calling agent's own identity as the route actor (§12)
 * — the composition root threads it onto the request, never a hardcoded/
 * founder constant.
 *
 * @lore BB1: `createBet`/`getBetById`/`updateBetById` removed — the `bets`
 * table is gone; tasks are one recursive primitive. `createTask` now takes
 * `parentTaskId` (nullable). `getTaskById` returns `parentTaskId` instead of
 * `betId`/`rootTaskId`. `updateTaskById` is added as the one edit door for
 * agents, mirroring `PATCH /api/tasks/:id` with no actor or role gate.
 */
interface ToolHandlersCoreApiAccessor {
	/** Structural mirror of `@hyperidle/api-contract`'s `TaskView` (Mechanism C: no import). */
	getTaskById(
		id: string,
		actorId: string,
	): Promise<
		| {
				readonly parentTaskId: string | null;
				readonly teamId: string;
				readonly notes: string | null;
		  }
		| undefined
	>;
	createTask(
		input: {
			readonly parentTaskId: string | null;
			readonly teamId: string;
			readonly title: string;
			readonly description: string | null;
			readonly doneCondition: string | null;
			readonly ownerAgentId: string | null;
			/** When true, finishing this task sends it to `review` rather than `done`. */
			readonly needsReview?: boolean;
		},
		actorId: string,
	): Promise<{ readonly id: string; readonly teamId: string }>;
	/**
	 * One edit door for agents: mirrors `PATCH /api/tasks/:id`.
	 * No actor gate, no role gate — humans and agents use the same endpoint.
	 * `state` routes through `transitionTask` server-side; all other fields
	 * are plain writes plus `updatedAt`.
	 */
	updateTaskById(
		id: string,
		updates: {
			readonly title?: string;
			readonly description?: string | null;
			readonly doneCondition?: string | null;
			readonly ownerAgentId?: string | null;
			readonly dependencies?: string | null;
			readonly parentTaskId?: string | null;
			readonly state?: string;
			/** Moves the task within its sibling list; siblings are renumbered 0..n-1. */
			readonly position?: number;
			/** Flip whether finishing this task routes to `review` (true) or `done` (false). */
			readonly needsReview?: boolean;
		},
		actorId: string,
	): Promise<void>;
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
	 * AU27 Increment 1b — `reply`'s no-calling-thread fallback: the sole
	 * human user in the system, so a routine_run (or any other thread-less
	 * kind) can still land its reply in a direct thread with a real person.
	 */
	findSoleHumanUser(actorId: string): Promise<{ readonly id: string } | undefined>;
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
	/** Update team-owned columns (phase on `teams`, leadAgentId on `teamMembers`). */
	// @lore BB1: activeBets removed from patch — WIP limit is capacity counted live.
	updateTeam(
		teamId: string,
		patch: { phase?: string; leadAgentId?: string },
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
	/**
	 * @lore AU44 AU20-fd: replaces `persistScaffoldedAgents` — seam now accepts the scaffold
	 * request; core-api resolves via `resolveAgentScaffoldSpecs` then persists.
	 * Mirrors `POST /org/scaffold-request`.
	 */
	scaffoldFromRequest(
		teamMembersId: string | null,
		trigger: "team_scaffold" | "agent_added" | "user_assistant",
		teamName: string | null,
		role: string | null,
		name: string | null,
		ownerUserId: string | null,
		ownerUserName: string | null,
		systemPromptOverride: string | undefined,
		actorId: string,
	): Promise<{ readonly agentIds: readonly string[]; readonly leadAgentId: string | null }>;
	insertRoutine(input: Record<string, unknown>, actorId: string): Promise<string | null>;
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
	/**
	 * Returns parentKind and parentId for the item, or undefined if not found.
	 * Used by submit_review to enforce the producedItemId invariant: the named
	 * item must exist and be parented to the calling task.
	 */
	findKnowledgeItemParentById(
		id: string,
		actorId: string,
	): Promise<{ readonly parentKind: string | null; readonly parentId: string | null } | undefined>;
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
	/**
	 * Run a knowledge sweep.
	 * kind="autoPromotion" promotes provisional items meeting the repetition threshold.
	 * kind="stale" marks active items not referenced recently as stale.
	 * @lore BA9d: replaces the dead builtin-routine sweep path; exposed as an agent tool
	 * so the Librarian can trigger sweeps from plugin routines.
	 */
	runKnowledgeSweep(
		kind: "autoPromotion" | "stale",
		actorId: string,
	): Promise<{ readonly kind: string; readonly processed: number }>;
	/**
	 * Merge sourceId into targetId: appends source body to target, archives source.
	 * @lore BA9d D9: restored agent-reachable door (AU44 scope breach, rows 58-59).
	 */
	mergeKnowledgeItem(
		targetId: string,
		sourceId: string,
		updatedBy: string,
		actorId: string,
	): Promise<{ readonly id: string }>;
	/**
	 * Split itemId into two or more new items, archiving the original.
	 * @lore BA9d D9: restored agent-reachable door (AU44 scope breach, rows 58-59).
	 */
	splitKnowledgeItem(
		itemId: string,
		newItems: ReadonlyArray<{
			readonly title: string;
			readonly body: string;
			readonly topic?: string;
		}>,
		updatedBy: string,
		actorId: string,
	): Promise<ReadonlyArray<{ readonly id: string }>>;
}

/**
 * How `submit_review` records which session filed a review.
 *
 * @lore BA2: One call, and deliberately not a question the agent can answer —
 * the session comes from the tool context, never from the tool's arguments, so
 * an agent cannot file its way to resuming a session that is not its own.
 */
export interface ToolHandlersReviewAccessor {
	/** Record that this session filed this review, so a verdict knows what to resume. */
	linkReviewToSession(sessionId: string, reviewMessageId: string): Promise<void>;
}

/** Every real outbound port this Service's source files need. */
export interface ToolHandlersPorts {
	readonly coreApi: ToolHandlersCoreApiAccessor;
	readonly gate: ToolHandlersReviewAccessor;
}
