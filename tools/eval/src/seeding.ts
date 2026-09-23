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
	documents,
	type HyperIdleDb,
	messages,
	sessions,
	subscriptions,
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

/**
 * Create a team.
 *
 * @lore BC5 T11: a team is an id and a name now (D-e3zm2j, migration 0090) —
 * `phase` is gone with the column that carried it.
 */
export async function seedTeam(
	db: HyperIdleDb,
	opts?: Partial<{
		teamId: string;
		teamName: string;
	}>,
): Promise<{ teamId: string }> {
	const teamId = opts?.teamId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(teams).values({
		id: teamId,
		name: opts?.teamName ?? "Eval Team",
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
): Promise<{ rootTaskId: string; threadId: string }> {
	const rootTaskId = opts.rootTaskId ?? randomUUID();
	const now = new Date().toISOString();
	// @lore BC3 architecture.md §5: every task owns a real thread now
	// (tasks.threadId is NOT NULL) — written before the task itself.
	const threadId = `thr-${rootTaskId}`;

	await db.insert(threads).values({
		id: threadId,
		hostKind: "team",
		hostId: opts.teamId,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});

	await db.insert(tasks).values({
		id: rootTaskId,
		threadId,
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

	return { rootTaskId, threadId };
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
): Promise<{ taskId: string; threadId: string }> {
	const taskId = opts.taskId ?? randomUUID();
	const now = new Date().toISOString();
	// @lore BC3 architecture.md §5: every task owns a real thread now
	// (tasks.threadId is NOT NULL) — written before the task itself.
	const threadId = `thr-${taskId}`;

	await db.insert(threads).values({
		id: threadId,
		hostKind: "team",
		hostId: opts.teamId,
		initiatorId: opts.ownerAgentId,
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});

	await db.insert(tasks).values({
		id: taskId,
		threadId,
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

	return { taskId, threadId };
}

/**
 * Seed a document.
 *
 * @lore BC4 §6.1/§6.2: the kernel row and the strategy extension row (the
 * former `knowledgeAppProjection`) are one row now — `confidence`/`meta`
 * live directly on `documents`. Callers that need context assembly to find
 * the seeded row no longer need a second insert.
 */
export async function seedDocument(
	db: HyperIdleDb,
	opts: {
		itemId?: string;
		scopeKind: ScopeKind;
		scopeId?: string;
		title: string;
		body: string;
		updatedBy: string;
		/** Document lifecycle status. Defaults to "active". Use "proposed" for triage scenarios. */
		status?: string;
		/** Parent entity kind, e.g. "task" or "thread". When omitted, the item has no parent. */
		parentKind?: string;
		/** Parent entity ID. Required when parentKind is provided. */
		parentId?: string;
	},
): Promise<{ documentId: string }> {
	const itemId = opts.itemId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(documents).values({
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

	return { documentId: itemId };
}

/**
 * Composite: seed a complete minimal world (team, founder, agent, bet, task,
 * factory settings, one document). Returns all IDs needed to trigger
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

	// Seed one factory-level document so the agent has context
	await seedDocument(db, {
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

/** Create a thread (conversation anchor). Used by send_message, read_inbox, submit-review scenarios. */
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

// @lore BC4 §6.4: `seedConflict` deleted — `knowledge_conflicts` is a dropped
// table (migration 0086). Its only callers, the `promote_knowledge` and
// `create_conflict_review` scenarios, are deleted in the same change.

/**
 * Create a subscription row.
 *
 * @lore BC5 T7b: renamed from `seedRoutine` — a subscription fires on
 * exactly one of `event`/`schedule` (`subscriptions_trigger_ck`, migration
 * 0088); there is no `heartbeat`/`continuous`/`humanReview`/`silent`
 * vocabulary left (those were routine-only concepts with no subscription
 * analogue — an agent subscriber always wakes, unconditionally).
 */
export async function seedSubscription(
	db: HyperIdleDb,
	opts: {
		subscriptionId?: string;
		userId: string;
		event?: string;
		schedule?: string;
		paused?: boolean;
		nextRunAt?: string;
	},
): Promise<{ subscriptionId: string }> {
	const subscriptionId = opts.subscriptionId ?? randomUUID();
	const now = new Date().toISOString();

	await db.insert(subscriptions).values({
		id: subscriptionId,
		userId: opts.userId,
		event: opts.event ?? null,
		schedule: opts.schedule ?? null,
		paused: opts.paused ?? false,
		nextRunAt: opts.nextRunAt ?? null,
		createdAt: now,
		updatedAt: now,
	});

	return { subscriptionId };
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
 * Used by: send_message, read_inbox, delegation, and handoff (edit_task) scenarios.
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
When asked to create documents, use the edit_document tool.`;
}
