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

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import {
	agentRunConfig,
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
import type { AgentCategory, ScopeKind, TaskState } from "@hyperidle/domain-model";
import { evalHarnessModel, evalHarnessType } from "./eval-harness.js";
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
		// The run's harness and model, so the session the provisioner admits is
		// the harness the run was asked to measure — `harnessType` picks the
		// adapter, `modelId` becomes `SessionConfig.selectedModel`.
		harnessType: opts.harnessType ?? evalHarnessType(),
		modelId: evalHarnessModel(),
	});

	return { agentId };
}

/**
 * Create a root task (parentTaskId = null). Formerly `seedBet`.
 *
 * @lore BB1: bets table dropped. Root tasks (parentTaskId: null) replace bets
 * as the top-level work container. Eval scenarios that previously seeded a bet
 * now seed a root task instead.
 */
export async function seedRootTask(
	db: HyperIdleDb,
	opts: {
		rootTaskId?: string;
		teamId: string;
		description: string;
		doneCondition?: string;
		state?: TaskState;
	},
): Promise<{ rootTaskId: string }> {
	const rootTaskId = opts.rootTaskId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(tasks).values({
		id: rootTaskId,
		parentTaskId: null,
		teamId: opts.teamId,
		title:
			opts.description.length > 120 ? `${opts.description.slice(0, 117)}...` : opts.description,
		description: opts.description,
		doneCondition: opts.doneCondition ?? null,
		state: opts.state ?? "in_progress",
		createdAt: now,
		updatedAt: now,
	});

	return { rootTaskId };
}

/** Create a task assigned to an agent. */
export async function seedTask(
	db: HyperIdleDb,
	opts: {
		taskId?: string;
		/** @lore BB1: formerly betId — now parentTaskId (the root task or any ancestor). */
		parentTaskId: string;
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
		parentTaskId: opts.parentTaskId,
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
		updatedBy: string;
		/** Knowledge lifecycle status. Defaults to "active". Use "proposed" for promotion pipeline scenarios. */
		status?: string;
		/** Parent entity kind, e.g. "task" or "thread". When omitted, the item has no parent. */
		parentKind?: string;
		/** Parent entity ID. Required when parentKind is provided. */
		parentId?: string;
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
		version: opts.status === "proposed" ? 0 : 1,
		updatedBy: opts.updatedBy,
		parentKind: opts.parentKind ?? null,
		parentId: opts.parentId ?? null,
		createdAt: now,
		updatedAt: now,
	});

	// Always insert the strategy fabric row so assembleContext() can find it.
	await db.insert(knowledgeAppProjection).values({
		id: randomUUID(),
		knowledgeItemId: itemId,
		scopeId: opts.scopeId ?? null,
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
	// Harness CLIs (especially codex) require the sandbox cwd to be a git repo.
	// Create the directory and git-init it, mirroring what the harness
	// integration test does in beforeEach.
	mkdirSync(sandboxBasePath, { recursive: true });
	execFileSync("git", ["init"], { cwd: sandboxBasePath, stdio: "ignore" });

	const { teamId } = await seedTeam(db);
	const { founderId } = await seedFounder(db);
	const agentRole = opts?.agentRole ?? "builder";
	// AB0: derive agentCategory from role catalog so seeded agents match production behavior.
	// @lore BA9g: the role catalog is gone — a role is a string on an agent. An
	// eval's agents are team agents.
	const agentCategory: AgentCategory = "team";
	const { agentId } = await seedAgent(db, {
		name: "Eval Agent",
		role: agentRole,
		teamId,
		agentCategory,
		systemPrompt: opts?.agentSystemPrompt ?? buildDefaultSystemPrompt(agentRole),
	});

	const { rootTaskId } = await seedRootTask(db, {
		teamId,
		description: opts?.betDescription ?? "Eval scenario root task",
		doneCondition: opts?.betDoneCondition ?? "Scenario objectives completed.",
	});

	const { taskId } = await seedTask(db, {
		parentTaskId: rootTaskId,
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
		updatedBy: `user:${founderId}`,
	});

	return {
		teamId,
		founderId,
		agentId,
		rootTaskId,
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

/** Create an item (human interface surface). */
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
 * Create a routine row.
 *
 * `dispatchOps.fireRoutine` reads scheduling/event fields from `triggerConfig`; a
 * `taskId` is scenario data only and is not required by the dispatch contract.
 */
export async function seedRoutine(
	db: HyperIdleDb,
	opts: {
		routineId?: string;
		ownerAgentId: string;
		triggerType: "heartbeat" | "calendar" | "event" | "continuous";
		triggerConfig?: Record<string, unknown>;
		/** BA1 D2/D8: `triggerType:"event"`'s event name — a real column, not part of `triggerConfig`. */
		eventType?: string;
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
		ownerAgentId: opts.ownerAgentId,
		triggerType: opts.triggerType,
		triggerConfig: opts.triggerConfig ? JSON.stringify(opts.triggerConfig) : null,
		eventType: opts.eventType ?? null,
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
	const secondAgentCategory: AgentCategory = "team";
	const { agentId: secondAgentId } = await seedAgent(db, {
		name: opts?.secondAgentName ?? "Eval Agent 2",
		role: secondRole,
		teamId: base.teamId,
		agentCategory: secondAgentCategory,
		systemPrompt: opts?.secondAgentSystemPrompt ?? buildDefaultSystemPrompt(secondRole),
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
