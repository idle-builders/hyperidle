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

export async function createTeam(
	db: HyperIdleDb,
	opts: CreateTeamMembersOpts,
): Promise<TeamMember> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	await db.insert(teamMembers).values({
		id,
		teamId: opts.teamId,
		capacity: opts.capacity,
		leadAgentId: opts.leadAgentId ?? null,
		activeBets: 0,
		formedAt: now,
	});

	for (const agentId of opts.agentIds) {
		await db.update(users).set({ teamId: id }).where(eq(users.id, agentId));
	}

	const [memberGroup] = await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
	if (!memberGroup) {
		throw new Error(`Failed to create team_members row ${id}`);
	}
	return memberGroup;
}

export async function addMember(
	db: HyperIdleDb,
	teamMembersId: string,
	agentId: string,
): Promise<void> {
	await db.update(users).set({ teamId: teamMembersId }).where(eq(users.id, agentId));
}

export async function removeMember(
	db: HyperIdleDb,
	teamMembersId: string,
	agentId: string,
): Promise<void> {
	const activeRoutines = await db
		.select()
		.from(routines)
		.where(and(eq(routines.ownerAgentId, agentId), eq(routines.active, true)));

	if (activeRoutines.length > 0) {
		// @lore AF4/§4g: ActiveRoutinesError owns its message; pass (agentId, count).
		throw new ActiveRoutinesError(agentId, activeRoutines.length);
	}

	await db
		.update(users)
		.set({ teamId: null })
		.where(and(eq(users.id, agentId), eq(users.teamId, teamMembersId)));
}

export async function getAvailableCapacity(
	db: HyperIdleDb,
	teamMembersId: string,
): Promise<number> {
	const [memberGroup] = await db
		.select()
		.from(teamMembers)
		.where(eq(teamMembers.id, teamMembersId))
		.limit(1);
	if (!memberGroup) {
		throw new Error(`TeamMembers ${teamMembersId} not found`);
	}
	return memberGroup.capacity - memberGroup.activeBets;
}

export async function dissolveTeam(db: HyperIdleDb, teamMembersId: string): Promise<void> {
	const now = new Date().toISOString();

	await db.update(teamMembers).set({ dissolvedAt: now }).where(eq(teamMembers.id, teamMembersId));

	await db.update(users).set({ teamId: null }).where(eq(users.teamId, teamMembersId));
}

export async function getTeamCost(
	db: HyperIdleDb,
	teamMembersId: string,
	_cycleStart: string,
): Promise<number> {
	const teamAgents = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.teamId, teamMembersId));

	if (teamAgents.length === 0) {
		return 0;
	}

	// @lore O2: sessions.cost column stripped (cost tracking is now strategy/fabric concern).
	// Return 0 — fabric will provide cost aggregation in O3 via extension tables.
	return 0;
}
