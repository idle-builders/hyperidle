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

// `TaskView`/`CreateTaskRequest`/`UpdateTaskRequest`/`CreateTaskResponse`
// DELETED — the task action list (`search_tasks`/`open_task`/`edit_task`,
// `@hyperidle/domain-model`) replaces this hand-mirrored seam entirely.
// the architecture doc §3, §8.

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

// `HandoffTaskRequest`/`HandoffTaskResponse` DELETED — handoff is now
// `edit_task({ ownerAgentId })`; role targeting, human escalation and the
// escalation thread go with `handoff-protocol.ts`
// (the architecture doc §8 B4).

/**
 * The agent's tool-facing `users` capability family (Decision C, Increment 2)
 * `edge-disposition.md`'s `users.{findUser, listUsers}` row.
 */
export interface CoreApiUsersPort {
	getUserById(id: string): Promise<UserView | undefined>;
	listUsersByTeam(teamMembersId: string): Promise<ReadonlyArray<UserView>>;
	// This port has no sole-human-user lookup; `soleHumanForAgent` resolves
	// it team-scoped, in-process, inside the thread module.
}

// This port carries no thread routes; `send_message`/`adjust_thread` cover
// every one of those capabilities as an action.

/** Mirrors `GET /org/teams/:teamId`'s response — only the fields a `CoreApiPort` consumer relies on. */
export interface OrgTeamView {
	readonly id: string;
	readonly name: string;
}

/** Mirrors `GET /org/teams/:teamId/membership`'s response (`teamMembers` row keyed by `teams.id`). */
export interface OrgTeamMembershipView {
	readonly id: string;
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
	createTeam(input: CreateOrgTeamRequest): Promise<void>;
	updateTeam(teamId: string, patch: UpdateOrgTeamRequest): Promise<void>;
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
	readonly users: CoreApiUsersPort;
	readonly org: CoreApiOrgPort;
	readonly routine: CoreApiRoutinePort;
}

/**
 * AU31 §12: the actor-override header name for the `CoreApiPort` write seam
 * moved here from core-api's `services/actor-transport-header.ts` because
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
