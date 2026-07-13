/**
 * `work` Service (core-api) — outbound composition-boundary (Mechanism C) DI
 * ports, per architecture §10.2's census: `work`'s four real outbound edges
 * (`session-requests`, `agent-selection`, `cost`, `users`) become injected
 * ports here, wired by the caller in `packages/server` (the not-yet-split
 * `agent-orchestration`/Application composition root) until those Services
 * migrate.
 *
 * Structural ports, same idiom as `@hyperidle/knowledge`'s
 * `AttentionServiceDeps` (`ReasoningMarkerFinder`/`KnowledgeReviewWriter`,
 * Increment 1a): each port mirrors the real target function's signature so
 * the concrete caller (still in `packages/server`) can pass its existing
 * function reference unchanged — zero behavior change.
 *
 * @lore AU19 Increment 1b — §10.3 "against-grain" classification: three of
 * these four edges (`AgentWorkIntentRecorder` → session-requests,
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
 */

import type { WriteExecutor } from "@hyperidle/db";
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
// cost — CostCapChecker (§10.3 against-grain — Inc 3 rewires to EventBus)
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

/** Port for `users`' read surface `work` calls directly today (`user-store.ts`). */
export interface UserStoreReader {
	getUserById(db: WriteExecutor, id: string): Promise<WorkUserRow | undefined>;
	listActiveAiUsersByTeams(
		db: WriteExecutor,
		teamMembersIds: string[],
	): Promise<readonly WorkUserRow[]>;
}
