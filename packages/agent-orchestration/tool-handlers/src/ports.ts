/**
 * `tool-handlers` Service (agent-orchestration) — outbound composition-
 * boundary (Mechanism C) DI ports, per architecture §10.2's census (the
 * merged `tools` census row, §7.5's C1 split). Real outbound edges (`work`,
 * `users`, `conversation`, `knowledge`, `org`, `agent-selection`, `routine`,
 * `dispatch`) are ordinary downward-or-same-layer DI, wired by the
 * composition root (`packages/server/src/services/tool-handlers-bindings.ts`)
 * to each target's real exported functions. `policy` is also ordinary
 * same-layer DI.
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
 */

import type { UserRole } from "@hyperidle/shared";

export interface ToolHandlersWorkAccessor<TDb> {
	getTaskById(
		db: TDb,
		id: string,
	): Promise<
		{ readonly betId: string; readonly teamId: string; readonly notes: string | null } | undefined
	>;
	getBetById(db: TDb, id: string): Promise<{ readonly status: string } | undefined>;
	createBet(
		db: TDb,
		input: {
			readonly id: string;
			readonly teamId: string;
			readonly description: string;
			readonly doneCondition: string | null;
			readonly hypothesis: string | null;
			readonly status: "draft";
			readonly createdAt: string;
		},
	): Promise<void>;
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

export interface ToolHandlersUsersAccessor<TDb> {
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

export interface ToolHandlersConversationAccessor<TDb> {
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
 * `org`'s `createTeam` reads these specific fields (`db.insert(teams)
 * .values(input)`), so (unlike the spread/forward `Record<string,unknown>`
 * inputs elsewhere in this file) an opaque type would fail the composition
 * root's function-assignment check (`Record<string, unknown>` and a
 * concrete-fielded interface do not sufficiently overlap for a single
 * audited `as` cast — see `design/no-unknown-cast`, which bans the
 * `X as unknown as T` escape hatch this file must not reach for).
 */
export interface ToolHandlersCreateTeamInput {
	readonly id: string;
	readonly name: string;
	readonly phase: string;
	readonly functions: string | null;
	readonly factoryDbPath: string | null;
	readonly createdAt: string;
}

/** Structural mirror of `org`'s own `CreateTeamMembersGroupInput` — same reasoning as {@link ToolHandlersCreateTeamInput}. */
export interface ToolHandlersCreateTeamMembersGroupInput {
	readonly id: string;
	readonly teamId: string;
	readonly capacity: number;
	readonly activeBets: number;
	readonly formedAt: string;
}

export interface ToolHandlersOrgAccessor<TDb> {
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
	createTeam(db: TDb, input: ToolHandlersCreateTeamInput): Promise<void>;
	createTeamMembersGroup(db: TDb, input: ToolHandlersCreateTeamMembersGroupInput): Promise<void>;
	setTeamMembersLeadAgent(db: TDb, teamMembersId: string, leadAgentId: string): Promise<void>;
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

export interface ToolHandlersAgentSelectionAccessor<TDb> {
	resolveAgentScaffoldSpecs(input: {
		readonly db: TDb;
		/** Narrowed to `agent-selection`'s own `ScaffoldRequest.trigger` literal union (structural mirror, not a type import — same reasoning as `role` below). */
		readonly trigger: "team_scaffold" | "agent_added" | "user_assistant";
		readonly teamId: string;
		readonly teamMembersId: string | null;
		readonly teamName: string;
		readonly functions: readonly string[] | null;
		/** Narrowed from `string | null` to `@hyperidle/shared`'s `UserRole | null` — `agent-selection`'s real `resolveAgentScaffoldSpecs` requires the exact role union, not an arbitrary string. `UserRole` is a `shared` leaf type, not a domain-Service import, so importing it here does not violate Mechanism C. */
		readonly role: UserRole | null;
		readonly name: string | null;
		readonly ownerUserId: string | null;
		readonly ownerUserName: string | null;
	}): Promise<readonly Record<string, unknown>[]>;
}

export interface ToolHandlersRoutineAccessor<TDb> {
	insertRoutine(db: TDb, input: Record<string, unknown>): Promise<void>;
	getRoutineById(
		db: TDb,
		id: string,
	): Promise<
		{ readonly name: string; readonly state: string; readonly deletedAt: string | null } | undefined
	>;
	updateRoutineById(db: TDb, id: string, updates: Record<string, unknown>): Promise<void>;
}

export interface ToolHandlersDispatchAccessor<TDb> {
	nextCronMatch(parsed: unknown, from: Date): Date;
	parseCron(expr: string): unknown;
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
 * {@link ToolHandlersCreateTeamInput}: `knowledge.create` reads these
 * specific fields, so this cannot stay the opaque `Record<string, unknown>`
 * shape. `KnowledgeLayer`/`KnowledgeKind`/`KnowledgeStatus` literal unions
 * widen to `string` (Mechanism C: never importing `knowledge`'s own types).
 */
export interface ToolHandlersCreateKnowledgeItemInput {
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
export interface ToolHandlersCreateKnowledgeConflictInput {
	readonly id: string;
	readonly itemId: string;
	readonly versionBase: number;
	readonly versionCurrent: number;
	readonly proposedBody: string;
	readonly proposedMeta: string | null;
	readonly proposedBy: string;
	readonly createdAt: string;
}

export interface ToolHandlersKnowledgeAccessor<TDb> {
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
export interface ToolHandlersHandoffMetadata {
	// biome-ignore lint/style/useNamingConvention: agent handoff protocol wire format uses snake_case
	context_id: string;
	status: "completed" | "failed" | "blocked" | "in_progress";
	reason: string;
	artifacts: string[];
	// biome-ignore lint/style/useNamingConvention: agent handoff protocol wire format uses snake_case
	remaining_work: string[];
	error?: string;
}

export interface ToolHandlersSessionContext {
	sessionId: string;
	agentId: string;
	taskId: string;
	sandboxPath: string;
	ingestion: { dispose(): void };
	traceId: string;
}

export interface ToolHandlersHandoffParams {
	sessionContext: ToolHandlersSessionContext;
	toAgent?: string;
	toRole?: string;
	toHuman?: boolean;
	metadata: ToolHandlersHandoffMetadata;
}

export interface ToolHandlersHandoffResult {
	status: "success" | "escalated";
	targetAgentId?: string;
	escalationItemId?: string;
}

export interface ToolHandlersPolicyAccessor<TDb> {
	/** Bound `@hyperidle/policy`'s `handoff` — wired at the composition root, same idiom `dispatch-bindings.ts` already established. */
	handoff(
		db: TDb,
		eventBus: unknown,
		params: ToolHandlersHandoffParams,
	): Promise<ToolHandlersHandoffResult>;
}

/** Every real outbound port this Service's 24 source files need. */
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
}
