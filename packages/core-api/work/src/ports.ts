/**
 * `work` Service (core-api) — outbound composition-boundary (Mechanism C) DI
 * ports, per architecture §10.2's census: `work`'s five real outbound edges
 * (`session-requests`, `agent-selection`, `cost`, `users`, `org`) become
 * injected ports here, wired by the caller in `packages/server` (the
 * not-yet-split `agent-orchestration`/Application composition root) until
 * those Services migrate.
 *
 * Structural ports, same idiom as `@hyperidle/knowledge`'s
 * `AttentionServiceDeps` (`ReasoningMarkerFinder`/`KnowledgeReviewWriter`,
 * Increment 1a): each port mirrors the real target function's signature so
 * the concrete caller (still in `packages/server`) can pass its existing
 * function reference unchanged — zero behavior change.
 *
 * @lore AU19 Increment 1b — §10.3 "against-grain" classification: three of
 * these five edges (`AgentWorkIntentRecorder` → session-requests,
 * `AgentSelectionDefaults` → agent-selection, `CostCapChecker` → cost) are
 * `core-api → agent-orchestration`, which runs AGAINST the downward
 * dependency grain (orchestration is meant to depend on core-api, not the
 * reverse). Per §10.3 their PERMANENT end-state wiring is an EventBus
 * inversion (the lower Service — here, `work` — emits a domain event;
 * the orchestration Service subscribes), not a permanent DI port. These are
 * wired as ordinary DI ports for THIS increment only (interim, matching how
 * `knowledge`'s `work`/`review` edges were handled in Increment 1a) —
 * Increment 3 rewires all three to the EventBus subscription pattern
 * (`bet-decomposition-subscriber.ts`'s existing idiom) once `session-requests`,
 * `agent-selection`, and `cost` are real Service packages. The fourth port
 * (`UserStoreReader` → `users`) is an ordinary same-layer core-api→core-api
 * edge (`users` just hasn't migrated yet) — no Inc-3 event-bus rewrite is
 * needed for it, only a straight DI-target swap once `users` exists.
 *
 * @lore AU19 Increment 1c — `TeamCapacityReader` (→ `org`, now a REAL migrated
 * package, not an interim stub) closes W2: `bet-state-machine.ts`/
 * `bet-decomposition.ts` used to import the `teamMembers` table directly
 * (an interim `table-ownership-guard.ts` `UNOWNED_SHARED_TABLES` exemption,
 * now removed — `org` is the real `TABLE_OWNER`). This is also an ordinary
 * same-layer core-api→core-api edge, NOT against-grain — wired directly to
 * `@hyperidle/org`'s real exported functions (`getTeamMembersByTeamId`/
 * `setTeamMembersActiveBets`), no interim indirection needed since `org`
 * migrated in the same Increment this port was introduced.
 *
 * @lore AU19 Increment 1d — `UserStoreReader` (→ `users`, now a REAL migrated
 * package): the straight DI-target swap anticipated above landed. Every real
 * call site (`server-factory.ts`, `__tests__/bet-decomposition.test.ts`)
 * now wires it to `@hyperidle/users`' real exported `getUserById`/
 * `listActiveAiUsersByTeams` instead of `packages/server`'s (now-deleted)
 * `user-store.ts` copy. Still an ordinary same-layer core-api→core-api edge,
 * no EventBus rewrite needed (only the three §10.3 against-grain ports above
 * get that treatment in Increment 3).
 *
 * @lore AU19 Increment 3e — `AgentSelectionDefaults` (→ `agent-selection`,
 * now a REAL migrated package): the straight DI-target swap landed —
 * `server-factory.ts` wires it to `@hyperidle/agent-selection`'s real
 * `createAgentSelectionOps(...)`-bound exports instead of the deleted
 * `services/select-agent.ts`/`services/agent-defaults/resolvers.ts` flat
 * modules. The EventBus-inversion rewire this port's top comment describes
 * is explicitly OUT OF SCOPE for that migration (per its own item
 * description — a later, separate item once `cost` also lands) — this port
 * stays an ordinary interim DI port for now, unchanged shape.
 *
 * @lore AU19 Increment 3g — `CostCapChecker` (→ `cost`, now a REAL migrated
 * package): RULED PERMANENT, not inverted. §10.3's amendment atomicity test
 * (`policy ⚠ session-requests`/`review ⚠ session-requests` precedent,
 * `plans/AU19/architecture.md` line 528) generalizes past literal
 * same-transaction writes to synchronous read-then-branch control flow that
 * an async, fire-and-forget EventBus emit structurally cannot serve.
 * `bet-decomposition.ts`'s `runBetDecomposition` calls
 * `deps.costCap.checkCostCap(...)` synchronously and branches on its
 * `allowed` return value in the SAME code path (`if (!capResult.allowed) {
 * markTerminal(...); return; }`) — a pre-flight budget QUERY, not a
 * fire-and-forget domain-event notification. `checkCostCap` itself performs
 * zero writes (pure SELECT reads via `CostUserAccessor`/`CostTeamAccessor`),
 * so this is not even a borderline "same transaction" case — it fails the
 * more fundamental test §10.3's own reasoning already established: an
 * EventBus has no synchronous response channel, so any port whose return
 * value gates the caller's next branch cannot be inverted without a genuine
 * control-flow redesign. `server-factory.ts` repoints this port's concrete
 * wiring to `@hyperidle/cost`'s real `createCostOps(...)`-bound
 * `checkCostCap` (via `packages/server/src/services/cost-bindings.ts`)
 * instead of the deleted `services/cost-cap.ts` flat module — mechanical,
 * zero behavior change. `AgentWorkIntentRecorder`/`AgentSelectionDefaults`
 * (the other two `work` §10.3 ports) are UNAFFECTED by this ruling — each
 * needs its own same-transaction-or-synchronous-read check when its own
 * target Service's EventBus-inversion item comes up; do not assume either
 * inherits `CostCapChecker`'s permanence.
 */

import type { TeamMember, WriteExecutor } from "@hyperidle/db";
import type { EventBus, UserRole } from "@hyperidle/shared";

// ---------------------------------------------------------------------------
// session-requests — AgentWorkIntentRecorder (§10.3 against-grain — Inc 3 rewires to EventBus)
// ---------------------------------------------------------------------------

/**
 * The two `agent_work_intents` kinds `work` records today (`bet-decomposition.ts`,
 * `task-state-machine.ts`). Narrower than session-requests' full
 * `AgentWorkIntentKind` union — `work` only ever writes these two.
 */
export type WorkAgentWorkIntentKind = "bet_decomposition" | "task_run";

export interface WorkAgentWorkIntentInput {
	readonly kind: WorkAgentWorkIntentKind;
	readonly sourceKind: string;
	readonly sourceId: string;
	readonly requestedBy?: string;
	readonly idempotencyKey: string;
}

export interface WorkAgentWorkIntentRecord {
	readonly id: string;
	readonly idempotencyKey: string;
}

/** Port for `session-requests`' durable `agent_work_intents` writer (Mechanism C). */
export interface AgentWorkIntentRecorder {
	record(tx: WriteExecutor, input: WorkAgentWorkIntentInput): Promise<WorkAgentWorkIntentRecord>;
}

// ---------------------------------------------------------------------------
// agent-selection — AgentSelectionDefaults (§10.3 against-grain — Inc 3 rewires to EventBus)
// ---------------------------------------------------------------------------

export interface WorkSelectionCandidate {
	readonly agentId: string;
	readonly role: UserRole;
}

export interface WorkDecompositionPlan {
	readonly decomposerAgentId: string | null;
	readonly tasks: readonly import("@hyperidle/shared").DecompositionTaskInput[];
}

export interface ResolveDecompositionPlanInput {
	readonly db: WriteExecutor;
	readonly teamId: string;
	readonly betId: string;
	readonly betDescription: string;
	readonly betDoneCondition: string | null;
	readonly candidates: readonly WorkSelectionCandidate[];
}

export interface SelectOwnerOccasion {
	readonly surface: "bet_task" | "bet_decomposer";
	readonly teamId: string;
	readonly workKey: string;
	readonly roleHint: UserRole | null;
	readonly spreadIndex?: number | null;
}

/**
 * Port for `agent-selection`'s three functions `work` calls directly today
 * (`enumerateTeamCandidates`/`selectOwner` from `select-agent.ts`,
 * `resolveDecompositionPlan` from `agent-defaults/resolvers.ts`) — all three
 * are agent-selection's seed files per architecture §4.
 */
export interface AgentSelectionDefaults {
	enumerateTeamCandidates(
		db: WriteExecutor,
		teamId: string,
	): Promise<readonly WorkSelectionCandidate[]>;
	selectOwner(
		deps: { readonly db: WriteExecutor; readonly eventBus: EventBus },
		occasion: SelectOwnerOccasion,
	): Promise<string | null>;
	resolveDecompositionPlan(input: ResolveDecompositionPlanInput): Promise<WorkDecompositionPlan>;
}

// ---------------------------------------------------------------------------
// cost — CostCapChecker (§10.3 against-grain — RULED PERMANENT at Increment 3g,
// synchronous read-then-branch control flow; see top `@lore`)
// ---------------------------------------------------------------------------

export interface WorkCostCapResult {
	readonly allowed: boolean;
	readonly level?: "agent" | "team" | "factory";
	readonly currentSpend?: number;
	readonly cap?: number;
}

export interface WorkCheckCostCapParams {
	readonly agentId: string;
	readonly teamId?: string;
}

/** Port for `cost`'s pre-flight budget check (`checkCostCap`, Mechanism C). */
export interface CostCapChecker {
	checkCostCap(
		db: WriteExecutor,
		eventBus: EventBus,
		params: WorkCheckCostCapParams,
	): Promise<WorkCostCapResult>;
}

// ---------------------------------------------------------------------------
// users — UserStoreReader (ordinary downward core-api edge, NOT against-grain)
// ---------------------------------------------------------------------------

export interface WorkUserRow {
	readonly id: string;
	readonly kind: string;
	readonly status: string;
	readonly role: string;
}

/**
 * Port for `users`' read surface `work` calls directly today.
 *
 * @lore AU19 Increment 1d: `users` migrated for real. Wired at every real
 * call site (`server-factory.ts`, `__tests__/bet-decomposition.test.ts`'s
 * production-mirroring `productionPorts`) to `@hyperidle/users`' real
 * exported `getUserById`/`listActiveAiUsersByTeams` — no more
 * forward-reference to `packages/server`'s (now-deleted) `user-store.ts`
 * copy; the DI port abstraction itself is unchanged (zero behavior change).
 */
export interface UserStoreReader {
	getUserById(db: WriteExecutor, id: string): Promise<WorkUserRow | undefined>;
	listActiveAiUsersByTeams(
		db: WriteExecutor,
		teamMembersIds: string[],
	): Promise<readonly WorkUserRow[]>;
}

// ---------------------------------------------------------------------------
// org — TeamCapacityReader (ordinary downward core-api edge, NOT against-grain)
// ---------------------------------------------------------------------------

/**
 * Port for `org`'s team-capacity read/write surface `work` calls directly
 * today (`team-lookup.ts`'s `getTeamMembersByTeamId`/`setTeamMembersActiveBets`).
 * Types off `@hyperidle/db`'s `TeamMember` row directly (`work` keeps
 * `@hyperidle/db` — architecture §7.3 W4, core-api Services may type ports
 * off `@hyperidle/db` row types directly) — no narrower `Work*` row type is
 * needed since `org` already owns the canonical row shape.
 */
export interface TeamCapacityReader {
	getByTeamId(db: WriteExecutor, teamId: string): Promise<TeamMember | undefined>;
	setActiveBets(db: WriteExecutor, teamMembersId: string, activeBets: number): Promise<void>;
}
