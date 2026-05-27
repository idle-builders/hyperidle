import { type HyperIdleDb, routines, type Team, teams, users } from "@hyperidle/db";
import { ActiveRoutinesError } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";

interface CreateTeamOpts {
	productId: string;
	capacity: number;
	leadAgentId?: string;
	agentIds: string[];
}

export async function createTeam(db: HyperIdleDb, opts: CreateTeamOpts): Promise<Team> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	await db.insert(teams).values({
		id,
		productId: opts.productId,
		capacity: opts.capacity,
		leadAgentId: opts.leadAgentId ?? null,
		activeBets: 0,
		formedAt: now,
	});

	for (const agentId of opts.agentIds) {
		await db.update(users).set({ teamId: id }).where(eq(users.id, agentId));
	}

	const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
	if (!team) {
		throw new Error(`Failed to create team ${id}`);
	}
	return team;
}

export async function addMember(db: HyperIdleDb, teamId: string, agentId: string): Promise<void> {
	await db.update(users).set({ teamId }).where(eq(users.id, agentId));
}

export async function removeMember(
	db: HyperIdleDb,
	teamId: string,
	agentId: string,
): Promise<void> {
	const activeRoutines = await db
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
		.where(and(eq(users.id, agentId), eq(users.teamId, teamId)));
}

export async function getAvailableCapacity(
	db: HyperIdleDb,
	teamId: string,
): Promise<number> {
	const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
	if (!team) {
		throw new Error(`Team ${teamId} not found`);
	}
	return team.capacity - team.activeBets;
}

export async function dissolveTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	const now = new Date().toISOString();

	await db.update(teams).set({ dissolvedAt: now }).where(eq(teams.id, teamId));

	await db.update(users).set({ teamId: null }).where(eq(users.teamId, teamId));
}

export async function getTeamCost(
	db: HyperIdleDb,
	teamId: string,
	_cycleStart: string,
): Promise<number> {
	const teamAgents = await db.select({ id: users.id }).from(users).where(eq(users.teamId, teamId));

	if (teamAgents.length === 0) {
		return 0;
	}

	const _agentIds = teamAgents.map((a) => a.id);

	// @lore O2: sessions.cost column stripped (cost tracking is now strategy/fabric concern).
	// Return 0 — fabric will provide cost aggregation in O3 via extension tables.
	return 0;
}
