/**
 * X7: Composable seeding library for eval scenarios.
 *
 * Provides composable helpers that insert realistic world state into an
 * ephemeral PGlite DB. Scenarios compose these helpers rather than each
 * reinventing DB seeding.
 *
 * @lore X7: We do NOT use seed() from @hyperidle/db. The existing seed()
 * reads from docs/souls/ on disk (requires monorepo root CWD) and inserts
 * too many fixtures (practice facilitators, routines, etc.) irrelevant to
 * most eval scenarios. These helpers insert only what the scenario needs.
 */

import { randomUUID } from "node:crypto";
import {
	bets,
	factorySettings,
	type HyperIdleDb,
	knowledgeItems,
	knowledgeStrategyFabric,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { BetStatus, ModelTier, ScopeKind, TaskState, UserRole } from "@hyperidle/shared";
import type { ScenarioSeedResult } from "./types.js";

// ---------------------------------------------------------------------------
// Individual helpers
// ---------------------------------------------------------------------------

/** Create a team (domain entity) + team members group. */
export async function seedTeam(
	db: HyperIdleDb,
	opts?: Partial<{
		teamId: string;
		teamName: string;
		phase: string;
	}>,
): Promise<{ teamId: string; teamMembersId: string }> {
	const teamId = opts?.teamId ?? randomUUID();
	const teamMembersId = randomUUID();
	const now = new Date().toISOString();

	await db.insert(teams).values({
		id: teamId,
		name: opts?.teamName ?? "Eval Team",
		phase: opts?.phase ?? "alpha",
		createdAt: now,
	});

	await db.insert(teamMembers).values({
		id: teamMembersId,
		teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: now,
	});

	return { teamId, teamMembersId };
}

/** Create a human founder user (required for auth middleware FK constraints). */
export async function seedFounder(
	db: HyperIdleDb,
	opts?: Partial<{
		founderId: string;
		name: string;
		email: string;
	}>,
): Promise<{ founderId: string }> {
	const founderId = opts?.founderId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(users).values({
		id: founderId,
		kind: "human",
		name: opts?.name ?? "Eval Founder",
		role: "product_manager",
		status: "active",
		email: opts?.email ?? `founder-${founderId}@eval.local`,
		createdAt: now,
	});

	return { founderId };
}

/** Create an AI agent with soul prompt, role, tools, and optional harness preference. */
export async function seedAgent(
	db: HyperIdleDb,
	opts: {
		agentId?: string;
		name: string;
		role: UserRole;
		teamMembersId: string;
		soulPrompt?: string;
		harnessType?: string;
		modelTierPreference?: ModelTier;
	},
): Promise<{ agentId: string }> {
	const agentId = opts.agentId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: opts.name,
		role: opts.role,
		status: "active",
		teamId: opts.teamMembersId,
		soulPrompt: opts.soulPrompt ?? null,
		harnessType: opts.harnessType ?? "builtin",
		modelTierPreference: opts.modelTierPreference ?? null,
		createdAt: now,
	});

	return { agentId };
}

/** Create a bet with cost appetite. */
export async function seedBet(
	db: HyperIdleDb,
	opts: {
		betId?: string;
		teamId: string;
		description: string;
		doneCondition?: string;
		status?: BetStatus;
		costAppetiteMinor?: number;
	},
): Promise<{ betId: string }> {
	const betId = opts.betId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(bets).values({
		id: betId,
		teamId: opts.teamId,
		description: opts.description,
		doneCondition: opts.doneCondition ?? null,
		status: opts.status ?? "active",
		costAppetiteMinor: opts.costAppetiteMinor ?? 1000,
		costAppetiteCurrency: "USD",
		createdAt: now,
	});

	return { betId };
}

/** Create a task assigned to an agent. */
export async function seedTask(
	db: HyperIdleDb,
	opts: {
		taskId?: string;
		betId: string;
		teamId: string;
		ownerAgentId: string;
		title: string;
		description?: string;
		doneCondition?: string;
		state?: TaskState;
	},
): Promise<{ taskId: string }> {
	const taskId = opts.taskId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(tasks).values({
		id: taskId,
		betId: opts.betId,
		teamId: opts.teamId,
		ownerAgentId: opts.ownerAgentId,
		title: opts.title,
		description: opts.description ?? null,
		doneCondition: opts.doneCondition ?? null,
		state: opts.state ?? "accepted",
		createdAt: now,
		updatedAt: now,
	});

	return { taskId };
}

/**
 * Seed a knowledge item with its strategy fabric row.
 *
 * @lore X7: Two inserts are required: knowledgeItems (kernel) +
 * knowledgeStrategyFabric (strategy extension). The fabric row is needed
 * for knowledge materialization to work correctly during provisioning.
 * See arch critique WARNING #3 and schema.ts lines 478-501.
 */
export async function seedKnowledge(
	db: HyperIdleDb,
	opts: {
		itemId?: string;
		scopeKind: ScopeKind;
		scopeId?: string;
		title: string;
		body: string;
		layer?: string;
		kind?: string;
		updatedBy: string;
	},
): Promise<{ itemId: string }> {
	const itemId = opts.itemId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(knowledgeItems).values({
		id: itemId,
		scopeKind: opts.scopeKind,
		scopeId: opts.scopeId ?? null,
		title: opts.title,
		body: opts.body,
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: opts.updatedBy,
		createdAt: now,
		updatedAt: now,
	});

	// Always insert the strategy fabric row so materialize() can find it.
	await db.insert(knowledgeStrategyFabric).values({
		id: randomUUID(),
		knowledgeItemId: itemId,
		layer: opts.layer ?? "factory",
		scopeId: opts.scopeId ?? null,
		kind: opts.kind ?? "context",
	});

	return { itemId };
}

/** Seed factory settings (e.g. cost cap). */
export async function seedFactorySettings(
	db: HyperIdleDb,
	settings: Record<string, string>,
): Promise<void> {
	const now = new Date().toISOString();
	for (const [key, value] of Object.entries(settings)) {
		await db
			.insert(factorySettings)
			.values({ key, value, updatedAt: now })
			.onConflictDoUpdate({ target: factorySettings.key, set: { value, updatedAt: now } });
	}
}

/**
 * Composite: seed a complete minimal world (team, founder, agent, bet, task,
 * factory settings, one knowledge item). Returns all IDs needed to trigger
 * a provisioning session.
 *
 * This is the 80% case: creates the minimum viable world state for a
 * single-agent session.
 */
export async function seedMinimalWorld(
	db: HyperIdleDb,
	opts?: {
		agentRole?: UserRole;
		agentSoulPrompt?: string;
		taskTitle?: string;
		taskDescription?: string;
		betDescription?: string;
		betDoneCondition?: string;
	},
): Promise<
	ScenarioSeedResult & {
		founderId: string;
		teamMembersId: string;
	}
> {
	const workspaceBasePath = `/tmp/eval-workspace-${randomUUID()}`;

	const { teamId, teamMembersId } = await seedTeam(db);
	const { founderId } = await seedFounder(db);
	const { agentId } = await seedAgent(db, {
		name: "Eval Agent",
		role: opts?.agentRole ?? "builder",
		teamMembersId,
		soulPrompt: opts?.agentSoulPrompt ?? buildDefaultSoulPrompt(opts?.agentRole ?? "builder"),
		harnessType: "builtin",
	});

	const { betId } = await seedBet(db, {
		teamId,
		description: opts?.betDescription ?? "Eval scenario bet",
		doneCondition: opts?.betDoneCondition ?? "Scenario objectives completed.",
		costAppetiteMinor: 5000,
	});

	const { taskId } = await seedTask(db, {
		betId,
		teamId,
		ownerAgentId: agentId,
		title: opts?.taskTitle ?? "Eval task",
		description: opts?.taskDescription ?? "Complete the assigned task.",
		doneCondition: opts?.betDoneCondition ?? "Task objectives completed.",
		state: "accepted",
	});

	// Seed factory settings: cost cap high enough not to block eval
	await seedFactorySettings(db, {
		factory_cost_cap_minor: "100000",
		factory_cost_cap_currency: "USD",
	});

	// Seed one factory-level knowledge item so the agent has context
	await seedKnowledge(db, {
		scopeKind: "factory",
		title: "Eval Context",
		body: "This is an automated evaluation scenario. Complete the task as described.",
		layer: "factory",
		kind: "context",
		updatedBy: `user:${founderId}`,
	});

	return {
		teamId,
		teamMembersId,
		founderId,
		agentId,
		betId,
		taskId,
		workspaceBasePath,
	};
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildDefaultSoulPrompt(role: UserRole): string {
	return `You are an AI ${role} agent in an agentic operating system.
Your job is to complete assigned tasks using the available tools.
Be thorough, accurate, and document your work with session notes.
Always write session notes when you complete a task.
When asked to create knowledge items, use the write_memory tool.`;
}
