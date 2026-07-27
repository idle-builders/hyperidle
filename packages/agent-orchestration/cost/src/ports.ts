import type { HyperIdleDb, TeamMember, User } from "@hyperidle/db";

export interface CostScope {
	readonly level: "agent" | "team" | "factory";
	readonly id?: string;
}

export interface CostVerdict {
	readonly allowed: boolean;
	readonly level?: "agent" | "team" | "factory";
	readonly currentSpend?: number;
	readonly cap?: number;
}

export interface CostCheckParams {
	readonly agentId: string;
	readonly teamId?: string;
	readonly factoryCap?: number;
	readonly factorySpend?: number;
}

export interface CostRecordParams {
	readonly sessionId: string;
	readonly costMinor?: number;
	readonly currency?: string;
	readonly agentId: string;
	readonly teamId?: string;
	readonly taskId?: string;
	readonly factoryCap?: number;
	readonly factorySpend?: number;
	readonly reviewThreadId?: string;
}

/** Table-owner ports used by the table-less cost policy. */
export interface CostDeps {
	readonly users: {
		getUserById(
			db: HyperIdleDb,
			id: string,
		): Promise<Pick<User, "id" | "costActual" | "costCap" | "costCapMinor"> | undefined>;
		incrementUserCost(db: HyperIdleDb, id: string, deltaMinor: number): Promise<void>;
		resetAllUserCost(db: HyperIdleDb): Promise<void>;
		sumAllUserCost(db: HyperIdleDb): Promise<number>;
		updateUser(db: HyperIdleDb, id: string, patch: { costActual: number }): Promise<void>;
	};
	readonly org: {
		getTeamMembersById(
			db: HyperIdleDb,
			id: string,
		): Promise<Pick<TeamMember, "id" | "costActual" | "costCap" | "costCapMinor"> | undefined>;
		incrementTeamMembersCost(db: HyperIdleDb, id: string, deltaMinor: number): Promise<void>;
		resetTeamMembersCost(db: HyperIdleDb, id: string): Promise<void>;
		resetAllTeamMembersCost(db: HyperIdleDb): Promise<void>;
	};
	readonly work: {
		getTaskById(
			db: HyperIdleDb,
			id: string,
		): Promise<{ readonly betId: string | null } | undefined>;
		incrementBetCost(
			db: HyperIdleDb,
			id: string,
			deltaMinor: number,
			currency: string,
		): Promise<void>;
		createItem(
			db: HyperIdleDb,
			values: {
				readonly id: string;
				readonly sourceAgentId: string | null;
				readonly kind: string;
				readonly title: string;
				readonly body: string;
				readonly threadId: string;
				readonly riskTier: string;
				readonly blocking: boolean;
				readonly createdAt: string;
			},
		): Promise<void>;
	};
	readonly settings: {
		readServerConfig(db: HyperIdleDb): Promise<{
			readonly cost: { readonly capMinor: number };
			readonly internal: {
				readonly costSentinelLastLevel: "ok" | "warning" | "breach" | null;
			};
		}>;
		updateServerConfig(
			db: HyperIdleDb,
			patch: {
				readonly internal?: {
					readonly costSentinelLastLevel?: "ok" | "warning" | "breach";
				};
			},
		): Promise<void>;
	};
}
