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
 * `CoreApiPort` — a per-core-Service family of narrow hand-typed method
 * groups, each Application-adapted onto the `hc<AppType>` client
 * (`buildCoreApiPort`, `packages/core-api/src/services/
 * core-api-port-composition.ts`).
 */
export interface CoreApiPort {
	readonly work: CoreApiWorkPort;
	readonly users: CoreApiUsersPort;
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
