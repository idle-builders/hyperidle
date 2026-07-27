import type { HyperIdleDb, TeamMember, User } from "@hyperidle/db";

export interface AgentSelectionDeps {
	readonly users: {
		getUserById(db: HyperIdleDb, id: string): Promise<User | undefined>;
		/** Returns active AI users in stable ascending id order. */
		listActiveAiUsersByTeams(db: HyperIdleDb, teamMembersIds: string[]): Promise<User[]>;
	};
	readonly teams: {
		getTeamMembersByTeamId(db: HyperIdleDb, teamId: string): Promise<TeamMember | undefined>;
	};
}
