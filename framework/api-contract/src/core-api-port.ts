/**
 * AU21 — `CoreApiPort`: the location-transparent `agent-orchestration →
 * core-api` write seam (architecture.md §6 Decision A/C, §10, §11).
 *
 * TYPE-ONLY. `@hyperidle/api-contract` stays zero-runtime-deps
 * (`package.json` declares no `dependencies`) — every type below is a
 * hand-written mirror of a real core-api route, NOT generated from
 * `AppType` (bare `Hono`, `layers/core-api/src/app.ts:673` — no per-route
 * schema survives `app.route(path, sub)` mutation, per that file's own
 * `@lore AF4/§4g`). Because `AppType` carries no schema, `tsc` cannot verify
 * these mirrors against the real routes — fidelity is a TESTED obligation
 * (§11 contract tests: each `CoreApiPort` method gets a test that reaches
 * its real backing route through the in-process transport), never a
 * compiler guarantee.
 *
 * Later increments (§9 Increment 2) add the remaining `tool-handlers`
 * capabilities as more narrow methods on more `CoreApiPort` families —
 * never a generic pass-through, per Decision C's "narrow hand-typed method
 * groups" ruling.
 *
 * @lore BB1: `CreateBetRequest`, `CreateBetResponse`, `BetView`,
 * `UpdateBetRequest` DELETED — a bet is now a root task (`parentTaskId IS NULL`).
 * `TaskView.betId` → `parentTaskId: string | null`. The `/bets` route family
 * is gone; `createBet`/`getBetById`/`updateBetById` are removed from
 * `CoreApiWorkPort`.
 */

/** Mirrors `GET /tasks/:id`'s response — only the fields a `CoreApiPort` consumer relies on. */
export interface TaskView {
	readonly id: string;
	readonly parentTaskId: string | null;
	readonly teamId: string;
	readonly notes: string | null;
}

/**
 * Mirrors `GET /artifacts/:id`'s response — only the fields a `CoreApiPort`
 * consumer relies on. `submit_review` uses this to confirm a stored
 * `artifactRef` resolves to an artifact whose `producingTaskId` matches the
 * calling task before attaching it — a review may not claim proof it does
 * not have.
 */
export interface ArtifactView {
	readonly id: string;
	readonly producingTaskId: string;
	readonly kind: string;
}

// @lore BB1: UpdateBetRequest DELETED — bet fields are now task fields; PATCH /tasks/:id.

/** Mirrors `POST /tasks`'s validated request body (`createTaskSchema`, `routes/tasks.ts`). */
export interface CreateTaskRequest {
	readonly parentTaskId?: string | null;
	readonly title: string;
	readonly description?: string | null;
	readonly doneCondition?: string | null;
	readonly ownerAgentId?: string | null;
}

/** Mirrors `PATCH /tasks/:id`'s validated request body. */
export interface UpdateTaskRequest {
	readonly title?: string;
	readonly description?: string | null;
	readonly doneCondition?: string | null;
	readonly ownerAgentId?: string | null;
	readonly dependencies?: string | null;
	readonly parentTaskId?: string | null;
	readonly state?: string;
}

/** Mirrors `POST /tasks`'s 201 response body — the created task row. */
export interface CreateTaskResponse {
	readonly id: string;
	readonly parentTaskId: string | null;
	readonly teamId: string;
}

/** Mirrors `GET /conversations/items/:id`'s response — only the fields a consumer relies on. */
export interface ItemView {
	readonly id: string;
	readonly riskTier: string | null;
	readonly kind: string | null;
	readonly verb: string | null;
}

/** Mirrors `PATCH /conversations/items/:id`'s validated request body. */
export interface UpdateItemRequest {
	readonly riskTier?: string;
	readonly kind?: string;
	readonly verb?: string;
}

/**
 * Mirrors `POST /conversations/items`'s validated request body
 * (`createItemSchema`, `routes/conversations.ts`) — the FULL field set the
 * route accepts (not just what the §11 contract test exercises), since
 * `create_item`'s real tool handler relies on the full shape.
 */
export interface CreateItemRequest {
	readonly threadId: string;
	readonly title: string;
	readonly sourceAgentId?: string | null;
	readonly layer?: string | null;
	readonly verb?: string | null;
	readonly kind?: string | null;
	readonly body?: string | null;
	readonly attachments?: string | null;
	readonly proposedAction?: string | null;
	readonly options?: string | null;
	readonly riskTier?: string | null;
	readonly blocking?: boolean;
	readonly reasoning?: string | null;
}

/** Mirrors `POST /conversations/items`'s 201 response body — only `id` is relied on. */
export interface CreateItemResponse {
	readonly id: string;
}

/**
 * Mirrors `POST /artifacts`'s validated request body (`createArtifactSchema`,
 * `routes/artifacts.ts`). `preview` is opaque (Mechanism C: `tool-handlers`
 * never imports `@hyperidle/domain-model`'s `ArtifactPreview` union here) — the
 * route validates/serializes it; this seam only forwards it.
 */
export interface CreateArtifactRequest {
	readonly producingTaskId: string;
	readonly kind: string;
	readonly label?: string | null;
	readonly preview?: Record<string, unknown> | null;
}

/** Mirrors `POST /artifacts`'s 201 response body — only the fields a consumer relies on. */
export interface CreateArtifactResponse {
	readonly id: string;
	readonly producingTaskId: string;
	readonly kind: string;
}

/**
 * Mirrors `GET /users/:id` / `GET /users` — only the fields a `CoreApiPort`
 * consumer relies on. `teamId` is `users.teamId` — per the AK4 two-hop
 * lore AU44 B1: after the fold, this stores `teams.id` directly.
 */
export interface UserView {
	readonly id: string;
	readonly name: string;
	readonly role: string | null;
	readonly teamId: string | null;
}

/**
 * Mirrors `POST /tasks/:id/handoff`'s validated request body — extended
 * (Increment 2 org/routine/handoff wave) with `contextId`/`status`/`error` so
 * the seam carries `handoff_to`'s full metadata fidelity (the route
 * previously hardcoded `context_id: session.id` and `status: "completed"` and
 * dropped `error` entirely — all three are now caller-supplied, defaulting to
 * the route's original behavior when omitted).
 */
export interface HandoffTaskRequest {
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
}

/** Mirrors `POST /tasks/:id/handoff`'s response body (`@hyperidle/policy`'s `HandoffResult`). */
export interface HandoffTaskResponse {
	readonly status: "success" | "escalated";
	readonly targetAgentId?: string;
	readonly escalationItemId?: string;
}

/**
 * The agent's tool-facing `work` capability family (Decision C). Increment 2
 * adds reads/writes named in `edge-disposition.md`'s `work.{get, list, create,
 * update}` row, plus `handoffTask` (org/routine/handoff wave — the backing
 * route lives under `/tasks`). `routeItem` (a pure local computation, no DB,
 * no cross-layer read) was never a seam method — AU21 §6 Decision L3 later
 * deleted it outright as vestigial.
 *
 * @lore BB1: `createBet`, `getBetById`, `updateBetById` DELETED — a bet is
 * now a root task; use `createTask`/`getTaskById`/updateTask paths instead.
 */
export interface CoreApiWorkPort {
	getTaskById(id: string): Promise<TaskView | undefined>;
	createTask(input: CreateTaskRequest): Promise<CreateTaskResponse>;
	updateTaskById(id: string, updates: UpdateTaskRequest): Promise<void>;
	/** Atomic note append. Resolves `undefined` when the task does not exist (no throw). */
	appendTaskNote(taskId: string, entry: string): Promise<{ readonly id: string } | undefined>;
	getItemById(id: string): Promise<ItemView | undefined>;
	updateItemById(id: string, updates: UpdateItemRequest): Promise<void>;
	createItem(input: CreateItemRequest): Promise<CreateItemResponse>;
	findItemByReasoningMarker(marker: string): Promise<{ readonly id: string } | undefined>;
	createArtifact(input: CreateArtifactRequest): Promise<CreateArtifactResponse>;
	/** Over `GET /artifacts/:id`, the same shape as `getTaskById`. */
	getArtifactById(id: string): Promise<ArtifactView | undefined>;
	handoffTask(taskId: string, input: HandoffTaskRequest): Promise<HandoffTaskResponse>;
}

/**
 * The agent's tool-facing `users` capability family (Decision C, Increment 2)
 * — `edge-disposition.md`'s `users.{findUser, listUsers}` row.
 */
export interface CoreApiUsersPort {
	getUserById(id: string): Promise<UserView | undefined>;
	listUsersByTeam(teamMembersId: string): Promise<ReadonlyArray<UserView>>;
	/**
	 * AU27 Increment 1b — `reply`'s no-calling-thread fallback (routine_run
	 * and any future thread-less kind): the sole human user in the system,
	 * the same `findUser(db, { kind: "human" })` idiom
	 * `calling-thread-bindings.ts` already uses for a task thread's
	 * participants. `undefined` when no human row exists (never true in a
	 * real seeded team).
	 */
	findSoleHumanUser(): Promise<UserView | undefined>;
}

/**
 * Mirrors `GET /threads/:id` (and `GET /threads?host_kind=&host_id=`)'s
 * thread view — only the fields a `CoreApiPort` consumer relies on.
 * `participants` is the ROUTE's own parsed `string[]` (`rowToThread`'s
 * output), never the raw JSON-string DB column.
 */
export interface ConversationThreadView {
	readonly id: string;
	readonly participants: readonly string[];
}

/**
 * Mirrors `POST /threads/scaffold`'s validated request body — a bare thread
 * with no initial message (unlike `POST /threads`, which always requires
 * one via `createThreadBodySchema`).
 */
export interface InsertThreadRequest {
	readonly hostKind: string;
	readonly hostId: string;
	readonly participants: readonly string[];
	readonly pinned?: boolean;
}

/** Mirrors `POST /threads/scaffold`'s 201 response body. */
export interface InsertThreadResponse {
	readonly id: string;
}

/**
 * Mirrors `PATCH /threads/:id`'s validated request body — the narrow field
 * set real call sites set today (not a general thread-patch surface).
 */
export interface UpdateThreadRequest {
	readonly participants?: readonly string[];
	readonly lastActiveAt?: string;
	readonly pinned?: boolean;
}

/** The message-type union `POST /threads/:id/messages` accepts (mirrors `messageInputSchema`'s discriminant). */
export type ConversationMessageType = "plain" | "review" | "questionnaire" | "verdict";

/**
 * Mirrors `POST /threads/:id/messages`'s validated request body. The route
 * derives `senderId` from the authenticated actor (`c.get("userId")`), never
 * from the request body — `id`/`senderId` are never accepted here.
 */
export interface InsertMessageRequest {
	readonly threadId: string;
	readonly type: ConversationMessageType;
	readonly payload: Record<string, unknown>;
	readonly clientKey: string;
}

/** Mirrors `POST /threads/:id/messages`'s 201 response body — only the server-generated `id` is relied on. */
export interface InsertMessageResponse {
	readonly id: string;
}

/** One inbox message's fields a `CoreApiPort` consumer relies on (mirrors the route's `rowToMessage` output). */
export interface ConversationInboxMessageView {
	readonly id: string;
	readonly senderId: string;
	readonly threadId: string;
	readonly type: string;
	readonly payload: Record<string, unknown>;
}

/** One inbox row — mirrors `GET /threads/inbox`'s response element. */
export interface ConversationInboxRowView {
	readonly participants: readonly string[];
	readonly message: ConversationInboxMessageView;
}

/** Mirrors `POST /threads/direct`'s response body. */
export interface DirectThreadResponse {
	readonly id: string;
}

/**
 * The agent's tool-facing `conversation` capability family (Decision C,
 * Increment 2's conversation wave) — `edge-disposition.md`'s
 * `conversation.{findThread, insertThread, insertMessage, updateThread,
 * findOrCreateDirectThread, listInbox}` row, plus `dispatch`'s own
 * assistant-turn `insertMessage`/`updateThread` writes (same two methods,
 * reused — see `core-api-port-composition.ts`'s `buildCoreApiPort`).
 */
export interface CoreApiConversationPort {
	getThreadById(id: string): Promise<ConversationThreadView | undefined>;
	insertThread(input: InsertThreadRequest): Promise<InsertThreadResponse>;
	updateThread(id: string, updates: UpdateThreadRequest): Promise<void>;
	insertMessage(input: InsertMessageRequest): Promise<InsertMessageResponse>;
	listInboxBySenderExclusion(limit: number): Promise<ReadonlyArray<ConversationInboxRowView>>;
	findOrCreateDirectThread(recipientId: string): Promise<DirectThreadResponse>;
	getFirstThreadByHost(
		hostKind: string,
		hostId: string,
	): Promise<ConversationThreadView | undefined>;
}

/** Mirrors `GET /org/teams/:teamId`'s response — only the fields a `CoreApiPort` consumer relies on. */
export interface OrgTeamView {
	readonly id: string;
	readonly name: string;
}

/** Mirrors `GET /org/teams/:teamId/membership`'s response (`teamMembers` row keyed by `teams.id`). */
export interface OrgTeamMembershipView {
	readonly id: string;
}

/** Mirrors `GET /org/team-members/:teamMembersId`'s response — the AK4 two-hop resolution's second hop. */
export interface OrgTeamMembersByIdView {
	readonly teamId: string;
}

/**
 * Mirrors `POST /org/teams`'s validated request body — the atomic
 * `teams`+`teamMembers` insert only (never the heavier `POST /teams` UI flow,
 * which also scaffolds agents/routines/org-edges/welcome-message).
 */
export interface CreateOrgTeamRequest {
	readonly id: string;
	readonly name: string;
	readonly phase: string;
	readonly factoryDbPath: string | null;
	readonly createdAt: string;
	readonly teamMembersId: string;
	readonly capacity?: number;
	// @lore BB1: activeBets removed — WIP limit is capacity counted live.
	readonly formedAt?: string;
}

/**
 * Mirrors `PATCH /teams/:teamId`'s validated request body — extended
 * (Increment 2) to accept `leadAgentId` (previously only `phase`).
 */
export interface UpdateOrgTeamRequest {
	readonly phase?: string;
	// @lore BB1: activeBets removed — WIP limit is capacity counted live.
	readonly leadAgentId?: string;
}

/** Mirrors `GET /org/review-recipients`'s query params. */
export interface ReviewRecipientsQuery {
	readonly userId: string;
	readonly agentRole: string | undefined;
	readonly teamId: string | undefined;
}

/** Mirrors `POST /org/scaffolded-agents`'s 201 response body. */
export interface PersistScaffoldedAgentsResponse {
	readonly agentIds: readonly string[];
	readonly leadAgentId: string | null;
}

/**
 * Mirrors `POST /org/scaffold-request`'s validated request body.
 *
 * @lore AU44 AU20-fd: widens the scaffold seam so agent-orchestration hands
 * over a request instead of pre-resolved specs. `resolveAgentScaffoldSpecs`
 * now runs inside core-api, keeping agent-identity logic in the owning service.
 * `systemPromptOverride` absent = use role default; string = override all specs.
 */
export interface ScaffoldFromRequestInput {
	readonly teamMembersId: string | null;
	readonly trigger: "team_scaffold" | "agent_added" | "user_assistant";
	readonly teamName: string | null;
	readonly role: string | null;
	readonly name: string | null;
	readonly ownerUserId: string | null;
	readonly ownerUserName: string | null;
	readonly systemPromptOverride?: string;
}

/**
 * The agent's tool-facing `org` capability family (Decision C, Increment 2's
 * org/routine/handoff wave).
 * @lore BA9d: ProvisionTeamRoutinesRequest and provisionTeamRoutines() removed —
 * POST /org/team-routines existed only to seed builtin routines, which are gone.
 * The create_team tool no longer seeds routines; any routines a team needs come
 * from plugins installed by the team.
 */
export interface CoreApiOrgPort {
	getTeamById(teamId: string): Promise<OrgTeamView | undefined>;
	getTeamMembersByTeamId(teamId: string): Promise<OrgTeamMembershipView | undefined>;
	getTeamMembersById(teamMembersId: string): Promise<OrgTeamMembersByIdView | undefined>;
	createTeam(input: CreateOrgTeamRequest): Promise<void>;
	updateTeam(teamId: string, patch: UpdateOrgTeamRequest): Promise<void>;
	resolveReviewRecipientsForItem(ctx: ReviewRecipientsQuery): Promise<readonly string[]>;
	/** @lore AU44 AU20-fd: replaces `persistScaffoldedAgents` — seam now accepts the request; core-api resolves internally. */
	scaffoldFromRequest(input: ScaffoldFromRequestInput): Promise<PersistScaffoldedAgentsResponse>;
}

/**
 * Mirrors `POST /routines`'s validated request body — extended (Increment 2)
 * with an optional client-supplied `id` so `create_routine`'s pre-computed
 * routine id round-trips through the seam (the route otherwise generates its
 * own id server-side, per its real UI caller `RoutineCreateDialog.tsx`, which
 * never supplies one).
 */
export interface InsertRoutineRequest {
	readonly id?: string;
	readonly name: string;
	/** BA1 D1: renamed from `description`. */
	readonly prompt?: string | null;
	readonly ownerAgentId: string;
	readonly triggerType: string;
	/** Required for `triggerType:"calendar"` only. */
	readonly triggerConfig?: string;
	/** BA1 D8: required for `triggerType:"event"` only. */
	readonly eventType?: string;
}

/**
 * Mirrors `GET /routines/:id`'s `RoutineDetail.routine` fields a `CoreApiPort`
 * consumer relies on. The route 404s a soft-deleted routine, so a found
 * result never carries a real `deletedAt` — always `null` here.
 */
export interface RoutineView {
	readonly name: string;
	readonly state: string;
	readonly deletedAt: string | null;
}

/**
 * Mirrors `PATCH /routines/:id`'s validated request body — the field subset
 * `update_routine` sets (the route's own `updateRoutineSchema` covers every
 * one of these already).
 *
 * @lore BA1 review N5: this used to declare `description`, from before D1
 * renamed the column to `prompt` — the route's `.strict()` schema only ever
 * knew `prompt`, so a caller following this type's declared shape got a 400,
 * and the one real caller (`update_routine`'s tool handler) only survived
 * because `tool-handlers-bindings.ts`'s `widenUpdateRoutineInput` is an
 * unchecked `as UpdateRoutineRequest` cast off a `Record<string, unknown>` —
 * `prompt` was never checked against this type at all. Renamed to match the
 * schema field-for-field so the cast has something real to check against.
 */
export interface UpdateRoutineRequest {
	readonly name?: string;
	readonly prompt?: string;
	readonly state?: string;
	/** `update_routine`'s tool handler always sets this alongside `state` (backward-compat sync). */
	readonly active?: boolean;
	readonly triggerConfig?: string;
}

/**
 * The agent's tool-facing `routine` capability family (Decision C, Increment
 * 2's org/routine/handoff wave) — `edge-disposition.md`'s `routine.{getRoutine,
 * insertRoutine, updateRoutine}` row.
 */
export interface CoreApiRoutinePort {
	/** Returns the owner-computed nextRunAt (AU44 B3: computation moved into service). */
	insertRoutine(input: InsertRoutineRequest): Promise<string | null>;
	getRoutineById(id: string): Promise<RoutineView | undefined>;
	updateRoutineById(id: string, updates: UpdateRoutineRequest): Promise<void>;
}

/**
 * Mirrors `POST /knowledge`'s validated request body — extended (Increment 2
 * knowledge wave) with optional `kind` and an optional explicit `layer`
 * override. The pre-existing route always derived `layer` from
 * `scopeToLayer(scopeKind)` and silently dropped any `kind` field; `write_memory`'s
 * real call needs both fields to round-trip verbatim (an agent tool caller DOES
 * have a `kind`/explicit-`layer` concept the HTTP UI caller never needed).
 */
export interface CreateKnowledgeItemRequest {
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
}

/** Mirrors `POST /knowledge`'s 201 response body — only the fields a `CoreApiPort` consumer relies on. */
export interface CreateKnowledgeItemResponse {
	readonly id: string;
	readonly version: number;
}

/**
 * AU31 §2.7 — mirrors `PATCH /knowledge/:id`'s validated request body,
 * narrowed to the fields the agent-orchestration writeback processor needs
 * (`body` content + optimistic-lock version) — the route's other optional
 * fields (`title`/`topic`/`format`/`status`) are left unset, unchanged from
 * today's byte-identical PATCH behavior.
 */
export interface UpdateKnowledgeItemContentRequest {
	readonly body: string;
	readonly updatedBy: string;
	readonly expectedVersion: number;
}

/** Mirrors `PATCH /knowledge/:id`'s 200 response body — only the fields the writeback processor reads. */
export interface UpdateKnowledgeItemContentResponse {
	readonly id: string;
	readonly version: number;
	readonly format: string;
}

/**
 * AU31 §2.7 — the writeback processor's own optimistic-lock outcome, crossing
 * the seam as a discriminated result instead of a thrown error: `PATCH
 * /knowledge/:id`'s 409 response (`details.currentVersion`) becomes `{ok:
 * false, currentVersion}`, its 200 response becomes `{ok: true, item}` — same
 * shape `@hyperidle/knowledge`'s `update()` + `VersionConflictError` gave the
 * Application before this leaf moved the wire onto the port.
 */
export type UpdateKnowledgeItemContentResult =
	| { readonly ok: true; readonly item: UpdateKnowledgeItemContentResponse }
	| { readonly ok: false; readonly currentVersion: number };

/** Mirrors `GET /knowledge/:id`'s response — only `id`/`version` (used by the version-lookup reuse of this route). */
export interface KnowledgeItemVersionView {
	readonly id: string;
	readonly version: number;
}

/** Mirrors `GET /knowledge/:id`'s response — only `status` (used by the status-lookup reuse of this route). */
export interface KnowledgeItemStatusView {
	readonly status: string;
}

/** Mirrors the new `GET /knowledge/:id/conflicts?proposedBy=`'s response — only `id` is relied on. */
export interface KnowledgeConflictView {
	readonly id: string;
}

/** Mirrors the new `POST /knowledge/:id/conflicts`'s validated request body. */
export interface CreateKnowledgeConflictRequest {
	readonly id: string;
	readonly itemId: string;
	readonly versionBase: number;
	readonly versionCurrent: number;
	readonly proposedBody: string;
	readonly proposedMeta: string | null;
	readonly proposedBy: string;
	readonly createdAt: string;
}

/** Mirrors the new `POST /knowledge/:id/promote`'s validated request body. */
export interface PromoteKnowledgeItemRequest {
	readonly knowledgeItemId: string;
	readonly fromStatus: string;
	readonly toStatus: string;
	readonly reason: string | undefined;
	readonly editor: string;
}

/**
 * Mirrors the new `POST /knowledge/:id/promote`'s response body — the real
 * `PromoteTransitionResult` discriminated union, forwarded as-is at HTTP 200
 * either way (a domain-level "blocked" outcome is not a transport failure).
 */
export type PromoteKnowledgeItemResult =
	| { readonly ok: true; readonly fromStatus: string }
	| {
			readonly ok: false;
			readonly code: "CONFLICT_OPEN" | "CONCURRENT_MODIFICATION";
			readonly message: string;
	  };

/**
 * The agent's tool-facing `knowledge` capability family (Decision C,
 * Increment 2's knowledge wave) — `edge-disposition.md`'s
 * `knowledge.{get, create, transition, findOpenConflict, recordConflict}` row.
 */
export interface CoreApiKnowledgePort {
	/**
	 * Returned items are opaque (`Record<string, unknown>`) plus the one field
	 * `query_practice`'s handler filters on (`layer`) — same reasoning as
	 * `ToolHandlersKnowledgeAccessor.search`'s own doc comment (mirrored here).
	 */
	search(
		query: string,
		opts: { readonly limit: number },
	): Promise<ReadonlyArray<Record<string, unknown> & { readonly layer?: string | null }>>;
	create(input: CreateKnowledgeItemRequest): Promise<CreateKnowledgeItemResponse>;
	/** AU31 §2.7 — the writeback processor's optimistic-lock update, backed by the same `PATCH /knowledge/:id` route `create`'s sibling routes ride. */
	updateKnowledgeItemContent(
		id: string,
		input: UpdateKnowledgeItemContentRequest,
	): Promise<UpdateKnowledgeItemContentResult>;
	findKnowledgeItemVersionById(id: string): Promise<KnowledgeItemVersionView | undefined>;
	findKnowledgeItemStatusById(id: string): Promise<KnowledgeItemStatusView | undefined>;
	findOpenConflictByItemAndProposer(
		itemId: string,
		proposedBy: string,
	): Promise<KnowledgeConflictView | undefined>;
	createKnowledgeConflict(input: CreateKnowledgeConflictRequest): Promise<void>;
	promoteKnowledgeItem(input: PromoteKnowledgeItemRequest): Promise<PromoteKnowledgeItemResult>;
	upsertKnowledgeAppProjectionAttentionScore(
		knowledgeItemId: string,
		attentionScore: string,
	): Promise<void>;
	/**
	 * Collapses `buildCreateReviewItemForKnowledge({conversation,work})` +
	 * `buildAttentionService({db,eventBus,work,review}).recomputeOne(id)` on
	 * the core-api side of the seam (`POST /knowledge/:id/recompute-attention`)
	 * — the seam itself never threads a same-process `EventBus` handle over
	 * the HTTP boundary.
	 */
	recomputeAttentionScoreForItem(knowledgeItemId: string): Promise<{ readonly current: number }>;
	mergeKnowledgeItem(
		targetId: string,
		sourceId: string,
		updatedBy: string,
	): Promise<{ readonly id: string }>;
	splitKnowledgeItem(
		itemId: string,
		newItems: ReadonlyArray<{
			readonly title: string;
			readonly body: string;
			readonly topic?: string;
		}>,
		updatedBy: string,
	): Promise<ReadonlyArray<{ readonly id: string }>>;
	/**
	 * Run a knowledge sweep.
	 * kind="autoPromotion" promotes provisional items meeting the repetition threshold.
	 * kind="stale" marks active items not referenced recently as stale.
	 * @lore BA9d: replaces the dead builtin-routine sweep path; exposed as an agent tool
	 * so the Librarian can trigger sweeps from plugin routines.
	 */
	runKnowledgeSweep(
		kind: "autoPromotion" | "stale",
	): Promise<{ readonly kind: string; readonly processed: number }>;
}

/**
 * AU21 §9 Increment 12 follow-up (F2 gap closure): `FilesystemProvisioningView`/
 * `CoreApiFilesystemsPort` (Decision F2, AU21 §9 Increment 8) are DELETED, and
 * nothing grows back here. AU26 F2 finished the job: `filesystems` /
 * `filesystem_injections` are agent-orchestration's own tables now, so the
 * spawn reads them live and in-layer through
 * `@hyperidle/filesystems`' `listInjectedFilesystemsForProvisioning` — no seam,
 * and no emit-time bake either. The plain `GET /filesystems?agentUserId=` ROUTE
 * stays (the Settings UI calls it directly, not through this port); it is just
 * served by the other app now.
 *
 * AU21 §9 Increment 12 follow-up part 2 (Decision K1 — connections):
 * `HeldConnectionProvisioningView`/`ListHeldConnectionsForProvisioningResponse`/
 * `CoreApiConnectionsPort` (Decision F2, AU21 §9 Increment 8) are likewise
 * DELETED, along with the `GET /connections/provisioning` route that backed
 * them (zero other consumers, unlike filesystems' still-used plain route).
 *
 * @lore AU26 E3: and the emit-time bake K1 replaced them with is deleted too.
 * `service_connections` now belongs to `agent-orchestration`, so a spawn reads
 * it live from its own Layer — no seam, no bake, nothing on this port. This
 * comment records that there is no connections family here and no reason to
 * grow one back.
 */

/**
 * `CoreApiPort` — a per-core-Service family of narrow hand-typed method
 * groups, each Application-adapted onto the `hc<AppType>` client
 * (`buildCoreApiPort`, `layers/agent-orchestration/src/services/
 * core-api-port-composition.ts` — AU31 §2.5/§5: the client construction
 * moved here from `core-api` with the tool stack that is its only
 * consumer).
 */
export interface CoreApiPort {
	readonly work: CoreApiWorkPort;
	readonly users: CoreApiUsersPort;
	readonly conversation: CoreApiConversationPort;
	readonly org: CoreApiOrgPort;
	readonly routine: CoreApiRoutinePort;
	readonly knowledge: CoreApiKnowledgePort;
}

/**
 * AU31 §12: the actor-override header name for the `CoreApiPort` write seam
 * — moved here from core-api's `services/actor-transport-header.ts` because
 * BOTH sides of the seam need it (core-api's `middleware/auth.ts` consults
 * it server-side; agent-orchestration's `core-api-port-composition.ts` sets
 * it client-side via `withActorTransport`), and a wire-protocol constant
 * both layers must agree on belongs in the contract package, not inside
 * either layer.
 */
export const CORE_API_ACTOR_OVERRIDE_HEADER = "x-hyperidle-actor-id";

/**
 * The seam's injectable transport. Deliberately the single-`Request`
 * fetch-HANDLER shape (`(req: Request) => Promise<Response>` — Hono's own
 * `app.fetch` signature), NOT the two-argument `(url, init) => Promise<Response>`
 * shape `hc`'s own `fetch` option expects. `buildCoreApiPort` adapts one to
 * the other at its boundary — this is what makes the SAME transport type
 * usable both in-process (`app.fetch`, ignores host/port, routes on
 * pathname only) and over a real network (a real remote core-api's fetch
 * handler) with zero call-site change (architecture.md §10 — "=== hc's
 * injectable fetch").
 */
export type CoreApiTransport = (req: Request) => Promise<Response>;
