import { type HyperIdleDb, routines, type TeamMember, teamMembers, users } from "@hyperidle/db";
import { ActiveRoutinesError } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";

/**
 * @lore U1: This service manages the agent-membership group (teamMembers, formerly teams).
 * The `teamId` parameter here refers to the teamMembers.id (the agent group id),
 * NOT the teams.id (the domain entity id).
 */
interface CreateTeamMembersOpts {
	/** The domain team id (teams.id, formerly product id) this group belongs to. */
	teamId: string;
	capacity: number;
	leadAgentId?: string;
	agentIds: string[];
}

export function createTeam(db: HyperIdleDb, opts: CreateTeamMembersOpts): TeamMember {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	db.insert(teamMembers)
		.values({
			id,
			teamId: opts.teamId,
			capacity: opts.capacity,
			leadAgentId: opts.leadAgentId ?? null,
			activeBets: 0,
			formedAt: now,
		})
		.run();

	for (const agentId of opts.agentIds) {
		await db.update(users).set({ teamId: id }).where(eq(users.id, agentId));
	}

	const memberGroup = db.select().from(teamMembers).where(eq(teamMembers.id, id)).get();
	if (!memberGroup) {
		throw new Error(`Failed to create team_members row ${id}`);
	}
	return memberGroup;
}

export function addMember(db: HyperIdleDb, teamMembersId: string, agentId: string): void {
	db.update(users).set({ teamId: teamMembersId }).where(eq(users.id, agentId)).run();
}

export function removeMember(db: HyperIdleDb, teamMembersId: string, agentId: string): void {
	const activeRoutines = db
		.select()
		.from(routines)
		.where(and(eq(routines.ownerAgentId, agentId), eq(routines.active, true)));

	if (activeRoutines.length > 0) {
		throw new ActiveRoutinesError(
			`Agent ${agentId} has ${activeRoutines.length} active routine(s). Reassign before removing.`,
		);
	}

	await db
		.update(users)
		.set({ teamId: null })
		.where(and(eq(users.id, agentId), eq(users.teamId, teamMembersId)))
		.run();
}

export function getAvailableCapacity(db: HyperIdleDb, teamMembersId: string): number {
	const memberGroup = db.select().from(teamMembers).where(eq(teamMembers.id, teamMembersId)).get();
	if (!memberGroup) {
		throw new Error(`TeamMembers ${teamMembersId} not found`);
	}
	return memberGroup.capacity - memberGroup.activeBets;
}

export function dissolveTeam(db: HyperIdleDb, teamMembersId: string): void {
	const now = new Date().toISOString();

	db.update(teamMembers).set({ dissolvedAt: now }).where(eq(teamMembers.id, teamMembersId)).run();

	db.update(users).set({ teamId: null }).where(eq(users.teamId, teamMembersId)).run();
}

export function getTeamCost(db: HyperIdleDb, teamMembersId: string, _cycleStart: string): number {
	const teamAgents = db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.teamId, teamMembersId))
		.all();

	if (teamAgents.length === 0) {
		return 0;
	}

	const _agentIds = teamAgents.map((a) => a.id);

	// @lore O2: sessions.cost column stripped (cost tracking is now strategy/fabric concern).
	// Return 0 — fabric will provide cost aggregation in O3 via extension tables.
	return 0;
}
