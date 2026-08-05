/**
 * AU21 — `CoreApiPort`: the location-transparent `agent-orchestration →
 * core-api` write seam (architecture.md §6 Decision A/C, §10, §11).
 *
 * TYPE-ONLY. `@hyperidle/api-contract` stays zero-runtime-deps
 * (`package.json` declares no `dependencies`) — every type below is a
 * hand-written mirror of a real core-api route, NOT generated from
 * `AppType` (bare `Hono`, `packages/core-api/src/app.ts:673` — no per-route
 * schema survives `app.route(path, sub)` mutation, per that file's own
 * `@lore AF4/§4g`). Because `AppType` carries no schema, `tsc` cannot verify
 * these mirrors against the real routes — fidelity is a TESTED obligation
 * (§11 contract tests: each `CoreApiPort` method gets a test that reaches
 * its real backing route through the in-process transport), never a
 * compiler guarantee.
 *
 * Seeded (Increment 1) with `work.createBet`, mirroring `POST /bets`'s
 * validated request body (`createBetSchema`, `routes/bets.ts:53-75`) and
 * 201 response body (`routes/bets.ts:609-638`). Later increments (§9
 * Increment 2) add the remaining `tool-handlers` capabilities as more
 * narrow methods on more `CoreApiPort` families — never a generic
 * pass-through, per Decision C's "narrow hand-typed method groups" ruling.
 */

/** Mirrors `POST /bets`'s validated request body (`createBetSchema`, `routes/bets.ts:53-75`). */
export interface CreateBetRequest {
	readonly teamId: string;
	readonly description: string;
	readonly doneCondition?: string;
	readonly hypothesis?: string;
	readonly sourceKnowledgeItemId?: string;
}

/**
 * Mirrors `POST /bets`'s 201 response body — the created bet row
 * (`work.get(db,"bet",id)`). Not an exhaustive column-for-column mirror of
 * the `bets` table (per this file's top `@lore`, only the fields a
 * `CoreApiPort` consumer relies on are declared) — the real response may
 * carry additional raw columns this type does not name.
 *
 * @lore AU21 Increment 14a: the structured `costAppetite` field this
 * response used to also carry is deleted along with the rest of the cost
 * feature (the column is dropped), no replacement.
 */
export interface CreateBetResponse {
	readonly id: string;
	readonly teamId: string;
	readonly description: string;
	readonly doneCondition: string | null;
	readonly hypothesis: string | null;
	readonly status: string;
	readonly createdAt: string;
	readonly revisionLog: string | null;
	readonly sourceKnowledgeItemId: string | null;
}

/** Mirrors `GET /tasks/:id`'s response — only the fields a `CoreApiPort` consumer relies on. */
export interface TaskView {
	readonly id: string;
	readonly betId: string;
	readonly teamId: string;
	readonly notes: string | null;
}

/** Mirrors `GET /bets/:id`'s response — only the fields a `CoreApiPort` consumer relies on. */
export interface BetView {
	readonly id: string;
	readonly status: string;
	readonly description?: string;
	readonly doneCondition?: string | null;
	readonly hypothesis?: string | null;
}

/**
 * Mirrors the fields `PATCH /bets/:id` accepts across its discriminated-union
 * wire shape (`field`/`value`/`reason`, `routes/bets.ts`). `buildCoreApiPort`
 * issues one PATCH per present field — the route accepts exactly one field
 * per call.
 */
export interface UpdateBetRequest {
	readonly description?: string;
	readonly doneCondition?: string | null;
	readonly hypothesis?: string | null;
}

/** Mirrors `POST /tasks`'s validated request body (`createTaskSchema`, `routes/tasks.ts`). */
export interface CreateTaskRequest {
	readonly betId: string;
	readonly title: string;
	readonly description?: string | null;
	readonly doneCondition?: string | null;
	readonly ownerAgentId?: string | null;
}

/** Mirrors `POST /tasks`'s 201 response body — the created task row. */
export interface CreateTaskResponse {
	readonly id: string;
	readonly betId: string;
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
 * never imports `@hyperidle/shared`'s `ArtifactPreview` union here) — the
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
 * lore, this actually stores `teamMembers.id`, not `teams.id`.
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
 * The agent's tool-facing `work` capability family (Decision C). Seeded
 * (Increment 1) with `createBet`; Increment 2 adds the remaining
 * `tool-handlers` reads/writes named in `edge-disposition.md`'s
 * `work.{get, list, create, update}` row, plus `handoffTask` (org/routine/
 * handoff wave — the backing route lives under `/tasks`). `routeItem` (a
 * pure local computation, no DB, no cross-layer read) was never a seam
 * method — AU21 §6 Decision L3 later deleted it outright as vestigial.
 */
export interface CoreApiWorkPort {
	createBet(input: CreateBetRequest): Promise<CreateBetResponse>;
	getTaskById(id: string): Promise<TaskView | undefined>;
	getBetById(id: string): Promise<BetView | undefined>;
	updateBetById(id: string, updates: UpdateBetRequest): Promise<void>;
	createTask(input: CreateTaskRequest): Promise<CreateTaskResponse>;
	/** Atomic note append. Resolves `undefined` when the task does not exist (no throw). */
	appendTaskNote(taskId: string, entry: string): Promise<{ readonly id: string } | undefined>;
	getItemById(id: string): Promise<ItemView | undefined>;
	updateItemById(id: string, updates: UpdateItemRequest): Promise<void>;
	createItem(input: CreateItemRequest): Promise<CreateItemResponse>;
	findItemByReasoningMarker(marker: string): Promise<{ readonly id: string } | undefined>;
	createArtifact(input: CreateArtifactRequest): Promise<CreateArtifactResponse>;
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
	readonly functions: string | null;
	readonly factoryDbPath: string | null;
	readonly createdAt: string;
	readonly teamMembersId: string;
	readonly capacity?: number;
	readonly activeBets?: number;
	readonly formedAt?: string;
}

/**
 * Mirrors `PATCH /teams/:teamId`'s validated request body — extended
 * (Increment 2) to accept `leadAgentId` (previously only `phase`).
 */
export interface UpdateOrgTeamRequest {
	readonly phase?: string;
	readonly activeBets?: number;
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
 * Mirrors `POST /org/team-routines`'s validated request body — seeds the
 * four builtin-routine definitions for a team (`@hyperidle/routine`'s
 * `provisionTeamRoutines`). No 1:1 UI route (same shape as
 * `persistScaffoldedAgents`/`resolveReviewRecipientsForItem` below) — a
 * narrowly-scoped route built specifically for this seam method.
 */
export interface ProvisionTeamRoutinesRequest {
	readonly teamId: string;
	readonly ownerByRole: Readonly<Record<string, string | undefined>>;
	readonly leadAgentId: string;
}

/**
 * The agent's tool-facing `org` capability family (Decision C, Increment 2's
 * org/routine/handoff wave) — `edge-disposition.md`'s `org.{getTeam,
 * getTeamMembers, createTeam, updateTeam}` row. `resolveReviewRecipientsForItem`/
 * `persistScaffoldedAgents`/`provisionTeamRoutines` back collapsed multi-step
 * `tool-handlers`-only helpers (no 1:1 UI route) — new narrowly-scoped routes.
 *
 * @lore AU21 §9 Increment 9 (forensic-triage wave, second pass):
 * `provisionTeamRoutines` added here — `create_team`'s tool handler used to
 * reach it via an opaque `ToolHandlersPorts.routine`/`.dispatch` pass-through
 * satisfied by direct same-process DI in the composition root
 * (`tool-handlers-bindings.ts` importing `@hyperidle/routine` directly),
 * which the anti-regrowth guard's composition-bundle detector correctly
 * flagged as a hidden `tool-handlers -> routine` edge once that wiring named
 * a real `@hyperidle/routine` export. Decision C's own rule ("the running
 * agent's MCP tool calls — both reads and writes — route through
 * CoreApiPort, because they are the agent acting like the UI") already
 * covers this exactly; `create_team`'s OTHER steps
 * (`createTeam`/`persistScaffoldedAgents`/`updateTeam`) already went through
 * this seam — `provisionTeamRoutines` was the one piece that hadn't.
 */
export interface CoreApiOrgPort {
	getTeamById(teamId: string): Promise<OrgTeamView | undefined>;
	getTeamMembersByTeamId(teamId: string): Promise<OrgTeamMembershipView | undefined>;
	getTeamMembersById(teamMembersId: string): Promise<OrgTeamMembersByIdView | undefined>;
	createTeam(input: CreateOrgTeamRequest): Promise<void>;
	updateTeam(teamId: string, patch: UpdateOrgTeamRequest): Promise<void>;
	resolveReviewRecipientsForItem(ctx: ReviewRecipientsQuery): Promise<readonly string[]>;
	persistScaffoldedAgents(
		teamMembersId: string | null,
		specs: readonly Record<string, unknown>[],
	): Promise<PersistScaffoldedAgentsResponse>;
	provisionTeamRoutines(input: ProvisionTeamRoutinesRequest): Promise<void>;
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
	readonly description?: string | null;
	readonly teamId: string;
	readonly ownerAgentId: string;
	readonly triggerType: string;
	readonly triggerConfig: string;
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
 */
export interface UpdateRoutineRequest {
	readonly name?: string;
	readonly description?: string;
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
	insertRoutine(input: InsertRoutineRequest): Promise<void>;
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
 * (`buildCoreApiPort`, `packages/core-api/src/services/
 * core-api-port-composition.ts`).
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
