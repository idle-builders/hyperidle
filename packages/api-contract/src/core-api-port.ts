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
	readonly costAppetite?: { readonly minor: number; readonly currency: string } | null;
	readonly sourceKnowledgeItemId?: string;
}

/**
 * Mirrors `POST /bets`'s 201 response body — the created bet row
 * (`work.get(db,"bet",id)`) plus the structured `costAppetite` override
 * (`routes/bets.ts:623-638`). Not an exhaustive column-for-column mirror of
 * the `bets` table (per this file's top `@lore`, only the fields a
 * `CoreApiPort` consumer relies on are declared) — the real response may
 * carry additional raw columns this type does not name.
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
	readonly costAppetite: { readonly minor: number; readonly currency: string } | null;
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
 * The agent's tool-facing `work` capability family (Decision C). Seeded
 * (Increment 1) with `createBet`; Increment 2 adds the remaining
 * `tool-handlers` reads/writes named in `edge-disposition.md`'s
 * `work.{get, list, create, update}` row. `routeItem` stays a pure local
 * computation (no DB, no cross-layer read) — never a seam method.
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
}

/**
 * The agent's tool-facing `users` capability family (Decision C, Increment 2)
 * — `edge-disposition.md`'s `users.{findUser, listUsers}` row.
 */
export interface CoreApiUsersPort {
	getUserById(id: string): Promise<UserView | undefined>;
	listUsersByTeam(teamMembersId: string): Promise<ReadonlyArray<UserView>>;
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
