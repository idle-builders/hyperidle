import { agents, type HyperIdleDb, routines, type Team, teams } from "@hyperidle/db";
import { ActiveRoutinesError } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";

interface CreateTeamOpts {
	productId: string;
	capacity: number;
	leadAgentId?: string;
	agentIds: string[];
}

export function createTeam(db: HyperIdleDb, opts: CreateTeamOpts): Team {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	db.insert(teams)
		.values({
			id,
			productId: opts.productId,
			capacity: opts.capacity,
			leadAgentId: opts.leadAgentId ?? null,
			activeBets: 0,
			formedAt: now,
		})
		.run();

	for (const agentId of opts.agentIds) {
		db.update(agents).set({ teamId: id }).where(eq(agents.id, agentId)).run();
	}

	const team = db.select().from(teams).where(eq(teams.id, id)).get();
	if (!team) {
		throw new Error(`Failed to create team ${id}`);
	}
	return team;
}

export function addMember(db: HyperIdleDb, teamId: string, agentId: string): void {
	db.update(agents).set({ teamId }).where(eq(agents.id, agentId)).run();
}

export function removeMember(db: HyperIdleDb, teamId: string, agentId: string): void {
	const activeRoutines = db
		.select()
		.from(routines)
		.where(and(eq(routines.ownerAgentId, agentId), eq(routines.active, 1)))
		.all();

	if (activeRoutines.length > 0) {
		throw new ActiveRoutinesError(
			`Agent ${agentId} has ${activeRoutines.length} active routine(s). Reassign before removing.`,
		);
	}

	db.update(agents)
		.set({ teamId: null })
		.where(and(eq(agents.id, agentId), eq(agents.teamId, teamId)))
		.run();
}

export function getAvailableCapacity(db: HyperIdleDb, teamId: string): number {
	const team = db.select().from(teams).where(eq(teams.id, teamId)).get();
	if (!team) {
		throw new Error(`Team ${teamId} not found`);
	}
	return team.capacity - team.activeBets;
}

export function dissolveTeam(db: HyperIdleDb, teamId: string): void {
	const now = new Date().toISOString();

	db.update(teams).set({ dissolvedAt: now }).where(eq(teams.id, teamId)).run();

	db.update(agents).set({ teamId: null }).where(eq(agents.teamId, teamId)).run();
}

export function getTeamCost(db: HyperIdleDb, teamId: string, _cycleStart: string): number {
	const teamAgents = db
		.select({ id: agents.id })
		.from(agents)
		.where(eq(agents.teamId, teamId))
		.all();

	if (teamAgents.length === 0) {
		return 0;
	}

	const _agentIds = teamAgents.map((a) => a.id);

	// @lore O2: sessions.cost column stripped (cost tracking is now strategy/fabric concern).
	// Return 0 — fabric will provide cost aggregation in O3 via extension tables.
	return 0;
}
