/**
 * `agent-selection` Service (agent-orchestration) — request/response contract
 * types for the app-owned scaffolding/selection/formation/decomposition
 * surfaces (moved verbatim from `packages/server/src/services/contracts.ts`
 * at AU19 Increment 3e migration).
 *
 * @lore AU19 Increment 3e: `contracts.ts` in `packages/server` was a SHARED
 * file mixing these agent-selection-owned types with `IngestionHandle`
 * (owned by the not-yet-migrated `session-lifecycle`/`context-assembly`/
 * `tool-handlers` domains). Only the agent-selection-owned subset moved here;
 * `IngestionHandle` stays in `packages/server/src/services/contracts.ts`
 * until its own owning Service migrates.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { DecompositionTaskInput, EventBus, UserRole } from "@hyperidle/shared";

export interface ScaffoldRequest {
	readonly db: HyperIdleDb;
	readonly trigger: "team_scaffold" | "agent_added" | "user_assistant";
	readonly teamId: string | null;
	readonly teamMembersId: string | null;
	readonly teamName: string | null;
	readonly functions: readonly string[] | null;
	readonly role: UserRole | null;
	readonly name: string | null;
	readonly ownerUserId: string | null;
	readonly ownerUserName: string | null;
}

export interface AgentScaffoldSpec {
	readonly role: UserRole;
	readonly name: string;
	readonly agentCategory: "team" | "strategy" | "individual";
	readonly systemPrompt: string | null;
	readonly idHint?: string;
}

export interface SelectionCandidate {
	readonly agentId: string;
	readonly role: UserRole;
}

export interface SelectAgentRequest {
	readonly db: HyperIdleDb;
	readonly surface: "bet_task" | "bet_decomposer" | "routine_delegate";
	readonly teamId: string | null;
	readonly workKey: string;
	readonly candidates: readonly SelectionCandidate[];
	readonly roleHint: UserRole | null;
	readonly spreadIndex: number | null;
	readonly excludeAgentId: string | null;
	readonly skillId: string | null;
}

export interface SelectAgentOutcome {
	readonly agentId: string | null;
}

export interface DecomposeBetRequest {
	readonly db: HyperIdleDb;
	readonly teamId: string;
	readonly betId: string;
	readonly betDescription: string;
	readonly betDoneCondition: string | null;
	readonly candidates: readonly SelectionCandidate[];
}

export interface DecompositionPlan {
	readonly decomposerAgentId: string | null;
	readonly tasks: readonly DecompositionTaskInput[];
}

export interface AssistantFormationRequest {
	readonly db: HyperIdleDb;
	readonly userId: string;
	readonly threadId: string;
}

export interface AssistantFormation {
	readonly persona: string | null;
	readonly assistantDraftSurface: "standard";
}

// ---------------------------------------------------------------------------
// AU20 Ab4 — new collapsed types
// ---------------------------------------------------------------------------

/**
 * Parameterised selection occasion — discriminated union over `surface`.
 *
 * Subsumes `SelectAgentRequest` (routine_delegate / bet surface with pre-built
 * candidates) and the `AgentSelectionSelectOwnerOccasion` shape (bet surfaces
 * with internal enumeration + event emission). The service's `selectAgent`
 * dispatches internally: bet surfaces enumerate candidates + emit the occasion
 * event; routine_delegate runs the userSkills delegate query directly.
 *
 * @lore AU20 Ab4: replaces `SelectAgentRequest`, `DecomposeBetRequest`, and
 * `AgentSelectionSelectOwnerOccasion` — three request types for three surfaces
 * of the same question. New surface = new union arm + one `case` in
 * `selectAgent`. `eventBus` is required only for bet surfaces (event emission
 * is not part of routine_delegate).
 */
export type SelectionOccasion =
	| {
			readonly surface: "bet_task" | "bet_decomposer";
			readonly db: HyperIdleDb;
			readonly eventBus: EventBus;
			readonly teamId: string;
			readonly workKey: string;
			readonly roleHint: UserRole | null;
			readonly spreadIndex: number | null;
	  }
	| {
			readonly surface: "routine_delegate";
			readonly db: HyperIdleDb;
			readonly teamId: string | null;
			readonly workKey: string;
			readonly skillId: string;
			readonly excludeAgentId: string;
	  };

/**
 * Filter for the `listCandidates` read surface.
 *
 * @lore AU20 Ab4: replaces the bare `(db, teamId)` parameter tuple of
 * `enumerateTeamCandidates`. `category` is reserved for future narrowing
 * (e.g. skill-filtered or availability-filtered candidate sets) without
 * adding a new method.
 */
export interface CandidateFilter {
	readonly db: HyperIdleDb;
	readonly teamId: string;
	readonly category?: string;
}
