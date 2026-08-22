/**
 * X7: Composable seeding library for eval scenarios.
 *
 * Provides composable helpers that insert realistic world state into an
 * ephemeral PGlite DB. Scenarios compose these helpers rather than each
 * reinventing DB seeding.
 *
 * @lore X7: We do NOT use seed() from @hyperidle/db. The existing seed()
 * reads from docs/system-prompts/ on disk (requires monorepo root CWD) and inserts
 * too many fixtures (practice facilitators, routines, etc.) irrelevant to
 * most eval scenarios. These helpers insert only what the scenario needs.
 */

import { randomUUID } from "node:crypto";
import {
	agentRunConfig,
	artifacts,
	bets,
	type HyperIdleDb,
	items,
	knowledgeAppProjection,
	knowledgeConflicts,
	knowledgeItems,
	messages,
	routines,
	sessions,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type {
	AgentCategory,
	BetStatus,
	ModelTier,
	ScopeKind,
	TaskState,
} from "@hyperidle/domain-model";
import { findRoleCatalogEntry } from "@hyperidle/domain-model";
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
): Promise<{ teamId: string }> {
	const teamId = opts?.teamId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(teams).values({
		id: teamId,
		name: opts?.teamName ?? "Eval Team",
		phase: opts?.phase ?? "alpha",
		createdAt: now,
	});

	return { teamId };
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

/** Create an AI agent with system prompt, role, tools, and optional harness preference. */
export async function seedAgent(
	db: HyperIdleDb,
	opts: {
		agentId?: string;
		name: string;
		role: string;
		teamId: string;
		systemPrompt?: string;
		harnessType?: string;
		modelTierPreference?: ModelTier;
		/** AB0: Agent category. Defaults to "team" for backward compat. */
		agentCategory?: AgentCategory;
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
		teamId: opts.teamId,
		agentCategory: opts.agentCategory ?? "team",
		createdAt: now,
	});
	// @lore AU26 G1 (architecture §D-L): the run config moved off `users` into
	// `agent_run_config`. `tools/eval` writes it directly for now; increment
	// D2b routes every `tools/eval/src` table access through the owning
	// Services, this one included.
	await db.insert(agentRunConfig).values({
		agentUserId: agentId,
		systemPrompt: opts.systemPrompt ?? null,
		harnessType: opts.harnessType ?? "builtin",
		modelTierPreference: opts.modelTierPreference ?? null,
	});

	return { agentId };
}

/** Create a bet. */
export async function seedBet(
	db: HyperIdleDb,
	opts: {
		betId?: string;
		teamId: string;
		description: string;
		doneCondition?: string;
		status?: BetStatus;
		/** W8: Deprecated appetite string that appears in composed prompt via bet.appetite field. */
		appetite?: string;
		hypothesis?: string;
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
		appetite: opts.appetite ?? null,
		hypothesis: opts.hypothesis ?? null,
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
 * knowledgeAppProjection (strategy extension). The fabric row is needed
 * for knowledge context assembly to work correctly during provisioning.
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
		/** Knowledge lifecycle status. Defaults to "active". Use "captured", "provisional", etc. for promotion pipeline scenarios. */
		status?: string;
	},
): Promise<{ knowledgeItemId: string }> {
	const itemId = opts.itemId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(knowledgeItems).values({
		id: itemId,
		scopeKind: opts.scopeKind,
		scopeId: opts.scopeId ?? null,
		title: opts.title,
		body: opts.body,
		format: "markdown",
		status: opts.status ?? "active",
		version: opts.status === "captured" ? 0 : 1,
		updatedBy: opts.updatedBy,
		createdAt: now,
		updatedAt: now,
	});

	// Always insert the strategy fabric row so assembleContext() can find it.
	await db.insert(knowledgeAppProjection).values({
		id: randomUUID(),
		knowledgeItemId: itemId,
		layer: opts.layer ?? "factory",
		scopeId: opts.scopeId ?? null,
		kind: opts.kind ?? "context",
	});

	return { knowledgeItemId: itemId };
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
		agentRole?: string;
		agentSystemPrompt?: string;
		taskTitle?: string;
		taskDescription?: string;
		betDescription?: string;
		betDoneCondition?: string;
	},
): Promise<
	ScenarioSeedResult & {
		founderId: string;
		teamId: string;
	}
> {
	const sandboxBasePath = `/tmp/eval-workspace-${randomUUID()}`;

	const { teamId } = await seedTeam(db);
	const { founderId } = await seedFounder(db);
	const agentRole = opts?.agentRole ?? "builder";
	// AB0: derive agentCategory from role catalog so seeded agents match production behavior.
	const catalogEntry = findRoleCatalogEntry(agentRole);
	const agentCategory: AgentCategory = catalogEntry?.category ?? "team";
	const { agentId } = await seedAgent(db, {
		name: "Eval Agent",
		role: agentRole,
		teamId,
		agentCategory,
		systemPrompt: opts?.agentSystemPrompt ?? buildDefaultSystemPrompt(agentRole),
		harnessType: "builtin",
	});

	const { betId } = await seedBet(db, {
		teamId,
		description: opts?.betDescription ?? "Eval scenario bet",
		doneCondition: opts?.betDoneCondition ?? "Scenario objectives completed.",
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
		founderId,
		agentId,
		betId,
		taskId,
		sandboxBasePath,
	};
}

// ---------------------------------------------------------------------------
// X8 seeding additions
// ---------------------------------------------------------------------------

/** Create a thread (conversation anchor). Used by send_message, read_inbox, submit_review, create_item scenarios. */
export async function seedThread(
	db: HyperIdleDb,
	opts: {
		threadId?: string;
		hostKind: string;
		hostId: string;
		initiatorId: string;
		participants: string[];
	},
): Promise<{ threadId: string }> {
	const threadId = opts.threadId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(threads).values({
		id: threadId,
		hostKind: opts.hostKind,
		hostId: opts.hostId,
		initiatorId: opts.initiatorId,
		participants: JSON.stringify(opts.participants),
		lastActiveAt: now,
		createdAt: now,
	});

	return { threadId };
}

/** Create a message in a thread. Used by read_inbox scenarios (need pre-existing messages to read). */
export async function seedMessage(
	db: HyperIdleDb,
	opts: {
		messageId?: string;
		senderId: string;
		threadId: string;
		type?: string;
		payload: string;
	},
): Promise<{ messageId: string }> {
	const messageId = opts.messageId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(messages).values({
		id: messageId,
		senderId: opts.senderId,
		threadId: opts.threadId,
		type: opts.type ?? "plain",
		payload: opts.payload,
		clientKey: randomUUID(),
		createdAt: now,
	});

	return { messageId };
}

/** Create an item (human interface surface). Used by score_attention scenarios. */
export async function seedItem(
	db: HyperIdleDb,
	opts: {
		itemId?: string;
		sourceAgentId: string;
		title: string;
		threadId: string;
		kind?: string;
		verb?: string;
		riskTier?: string;
		body?: string;
	},
): Promise<{ itemId: string }> {
	const itemId = opts.itemId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(items).values({
		id: itemId,
		sourceAgentId: opts.sourceAgentId,
		title: opts.title,
		threadId: opts.threadId,
		kind: opts.kind ?? null,
		verb: opts.verb ?? null,
		riskTier: opts.riskTier ?? null,
		body: opts.body ?? null,
		createdAt: now,
	});

	return { itemId };
}

/** Create an artifact. Used by submit_review scenarios (need existing artifact for artifactRef). */
export async function seedArtifact(
	db: HyperIdleDb,
	opts: {
		artifactId?: string;
		producingTaskId: string;
		kind: string;
		previewJson?: string;
	},
): Promise<{ artifactId: string }> {
	const artifactId = opts.artifactId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(artifacts).values({
		id: artifactId,
		producingTaskId: opts.producingTaskId,
		kind: opts.kind,
		previewJson: opts.previewJson ?? null,
		createdAt: now,
	});

	return { artifactId };
}

/** Create a knowledge conflict. Used by promote_knowledge scenarios (conflict gate blocks validated promotion). */
export async function seedConflict(
	db: HyperIdleDb,
	opts: {
		conflictId?: string;
		itemId: string;
		proposedBy: string;
		proposedBody: string;
		versionBase: number;
		versionCurrent: number;
		status?: string;
	},
): Promise<{ conflictId: string }> {
	const conflictId = opts.conflictId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(knowledgeConflicts).values({
		id: conflictId,
		itemId: opts.itemId,
		proposedBy: opts.proposedBy,
		proposedBody: opts.proposedBody,
		versionBase: opts.versionBase,
		versionCurrent: opts.versionCurrent,
		status: opts.status ?? "open",
		createdAt: now,
	});

	return { conflictId };
}

/**
 * Seed the three builtin agent stubs that `provisionTeamRoutines()` (`@hyperidle/routine`) references via
 * owner role resolution (`seed-agent-cos`, `seed-agent-pf-facilitation`, `demo-agent-pm`).
 * Must be called before `provisionTeamRoutines()` (`@hyperidle/routine`) in any eval scenario that exercises
 * the builtin routine subsystem.
 *
 * @lore X8 BUILTIN-FK: `provisionTeamRoutines` (`@hyperidle/routine`) resolves ownerByRole to users.id.
 * The eval ephemeral PGlite DB does NOT run the production seed, so FK constraints
 * on `routines.ownerAgentId → users.id` fail unless we pre-insert these three stubs.
 * We use `onConflictDoNothing` so this is idempotent.
 *
 * @lore AF17: Updated from the old `seedBuiltinRoutines` shim (deleted) to
 * `provisionTeamRoutines` (`@hyperidle/routine`). The owner agent ids remain the same stable factory stubs.
 */
export async function seedBuiltinAgents(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();

	// @lore AD8a: name renamed "Chief of Staff" → "System Agent" (display string purge).
	// agentCategory: "individual" (was "personal" — AD8a renamed the value).
	await db
		.insert(users)
		.values({
			id: "seed-agent-cos",
			kind: "ai",
			name: "System Agent (eval stub)",
			role: "assistant",
			status: "active",
			// @lore AD8a: role string "assistant" renamed in AD8b. AB0: chief_of_staff is an individual-category agent (factory-wide, per-founder).
			agentCategory: "individual",
			createdAt: now,
		})
		.onConflictDoNothing();

	await db
		.insert(users)
		.values({
			id: "seed-agent-pf-facilitation",
			kind: "ai",
			// @lore AD8c: renamed from "Practice Facilitator" to "Facilitator"
			name: "Facilitator - Facilitation (eval stub)",
			// @lore AD8c: role renamed from practice_facilitator to facilitator
			role: "facilitator",
			status: "active",
			// @lore AD8c: facilitator is a strategy-category agent (factory-wide, no team binding).
			agentCategory: "strategy",
			createdAt: now,
		})
		.onConflictDoNothing();

	await db
		.insert(users)
		.values({
			id: "demo-agent-pm",
			kind: "ai",
			name: "Acme Product Manager (eval stub)",
			role: "product_manager",
			status: "active",
			// AB0: product_manager is a team-category agent.
			agentCategory: "team",
			createdAt: now,
		})
		.onConflictDoNothing();
}

/**
 * Create a routine row.
 *
 * `dispatchOps.fireRoutine` reads scheduling/event fields from `triggerConfig`; a
 * `taskId` is scenario data only and is not required by the dispatch contract.
 */
export async function seedRoutine(
	db: HyperIdleDb,
	opts: {
		routineId?: string;
		teamId: string;
		ownerAgentId: string;
		triggerType: "heartbeat" | "calendar" | "event" | "continuous";
		triggerConfig?: Record<string, unknown>;
		skillId?: string;
		doneCondition?: string;
		delegationAllowed?: boolean;
		humanReview?: boolean;
		autonomyLevel?: number;
		silent?: boolean;
		active?: boolean;
		lastRunAt?: string;
		nextRunAt?: string;
	},
): Promise<{ routineId: string }> {
	const routineId = opts.routineId ?? randomUUID();

	await db.insert(routines).values({
		id: routineId,
		teamId: opts.teamId,
		ownerAgentId: opts.ownerAgentId,
		triggerType: opts.triggerType,
		triggerConfig: opts.triggerConfig ? JSON.stringify(opts.triggerConfig) : null,
		skillId: opts.skillId ?? null,
		doneCondition: opts.doneCondition ?? null,
		delegationAllowed: opts.delegationAllowed ?? false,
		humanReview: opts.humanReview ?? false,
		autonomyLevel: opts.autonomyLevel ?? null,
		silent: opts.silent ?? false,
		active: opts.active ?? true,
		lastRunAt: opts.lastRunAt ?? null,
		nextRunAt: opts.nextRunAt ?? null,
	});

	return { routineId };
}

/** Create an active session (for WIP-limit testing in delegation scenarios). */
export async function seedActiveSession(
	db: HyperIdleDb,
	opts: {
		sessionId?: string;
		taskId: string;
		agentId: string;
	},
): Promise<{ sessionId: string }> {
	const sessionId = opts.sessionId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(sessions).values({
		id: sessionId,
		taskId: opts.taskId,
		agentId: opts.agentId,
		modelTier: "workhorse",
		startedAt: now,
		state: "active",
	});

	return { sessionId };
}

/**
 * Composite: seed a complete world with two agents on the same team.
 * Extends seedMinimalWorld with a second agent.
 * Used by: send_message, handoff_to, read_inbox, delegation scenarios.
 */
export async function seedMultiAgentWorld(
	db: HyperIdleDb,
	opts?: {
		agentRole?: string;
		agentSystemPrompt?: string;
		secondAgentRole?: string;
		secondAgentName?: string;
		secondAgentSystemPrompt?: string;
		taskTitle?: string;
		taskDescription?: string;
		betDescription?: string;
		betDoneCondition?: string;
	},
): Promise<
	ScenarioSeedResult & {
		founderId: string;
		teamId: string;
		secondAgentId: string;
	}
> {
	const base = await seedMinimalWorld(db, {
		agentRole: opts?.agentRole,
		agentSystemPrompt: opts?.agentSystemPrompt,
		taskTitle: opts?.taskTitle,
		taskDescription: opts?.taskDescription,
		betDescription: opts?.betDescription,
		betDoneCondition: opts?.betDoneCondition,
	});

	const secondRole = opts?.secondAgentRole ?? "product_manager";
	// AB0: derive agentCategory from role catalog for second agent.
	const secondCatalogEntry = findRoleCatalogEntry(secondRole);
	const secondAgentCategory: AgentCategory = secondCatalogEntry?.category ?? "team";
	const { agentId: secondAgentId } = await seedAgent(db, {
		name: opts?.secondAgentName ?? "Eval Agent 2",
		role: secondRole,
		teamId: base.teamId,
		agentCategory: secondAgentCategory,
		systemPrompt: opts?.secondAgentSystemPrompt ?? buildDefaultSystemPrompt(secondRole),
		harnessType: "builtin",
	});

	return {
		...base,
		secondAgentId,
	};
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildDefaultSystemPrompt(role: string): string {
	return `You are an AI ${role} agent in an agentic operating system.
Your job is to complete assigned tasks using the available tools.
Be thorough, accurate, and document your work with session notes.
Always write session notes when you complete a task.
When asked to create knowledge items, use the write_memory tool.`;
}
