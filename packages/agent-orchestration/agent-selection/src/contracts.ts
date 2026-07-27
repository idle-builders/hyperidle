import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus, UserRole } from "@hyperidle/shared";

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

export type SelectionOccasion =
	| {
			readonly surface: "bet_task";
			readonly db: HyperIdleDb;
			readonly eventBus: EventBus;
			readonly teamId: string;
			readonly workKey: string;
			readonly roleHint: UserRole | null;
			readonly spreadIndex: number;
	  }
	| {
			readonly surface: "bet_decomposer";
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

export interface CandidateFilter {
	readonly db: HyperIdleDb;
	readonly teamId: string;
}
