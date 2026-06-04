import {
	bets,
	type HyperIdleDb,
	knowledgeItems,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { EvalSeedData } from "./types.js";

const SEED_TIMESTAMP = "2026-06-01T00:00:00.000Z";

/**
 * Insert the eval scenario's world state into an ephemeral DB.
 *
 * Inserts team, teamMember, agents, bet, tasks, and optional knowledge items.
 * Caller is responsible for opening and closing the TestDbHandle.
 */
export async function seedWorld(db: HyperIdleDb, seed: EvalSeedData): Promise<void> {
	// Team
	await db.insert(teams).values({
		id: seed.team.id,
		name: seed.team.name,
		phase: "build",
		createdAt: SEED_TIMESTAMP,
	});

	// Team member group (1:1 with team)
	await db.insert(teamMembers).values({
		id: seed.teamMember.id,
		teamId: seed.team.id,
		capacity: 10,
		activeBets: 1,
		formedAt: SEED_TIMESTAMP,
	});

	// Agents
	for (const agent of seed.agents) {
		await db.insert(users).values({
			id: agent.id,
			name: agent.name,
			role: agent.role,
			status: "active",
			teamId: seed.teamMember.id,
			maxConcurrentSessions: 1,
			createdAt: SEED_TIMESTAMP,
			soulPrompt: agent.soulPrompt ?? null,
			costCapMinor: agent.costCapMinor ?? null,
		});
	}

	// Bet
	await db.insert(bets).values({
		id: seed.bet.id,
		teamId: seed.team.id,
		description: seed.bet.description,
		status: "active",
		createdAt: SEED_TIMESTAMP,
		costAppetiteMinor: seed.bet.costAppetiteMinor ?? null,
	});

	// Tasks
	for (const task of seed.tasks) {
		await db.insert(tasks).values({
			id: task.id,
			betId: seed.bet.id,
			teamId: seed.team.id,
			title: task.title,
			description: task.description ?? null,
			state: task.state,
			ownerAgentId: task.ownerAgentId ?? seed.agents[0]?.id ?? null,
			createdAt: SEED_TIMESTAMP,
			updatedAt: SEED_TIMESTAMP,
		});
	}

	// Knowledge items (optional)
	if (seed.knowledgeItems) {
		for (const ki of seed.knowledgeItems) {
			await db.insert(knowledgeItems).values({
				id: ki.id,
				title: ki.title,
				body: ki.body,
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "system",
				scopeKind: ki.scopeKind ?? "factory",
				scopeId: ki.scopeId ?? null,
				createdAt: SEED_TIMESTAMP,
				updatedAt: SEED_TIMESTAMP,
			});
		}
	}
}
