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
import type { DecompositionTaskInput, UserRole } from "@hyperidle/shared";

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
