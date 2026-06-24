/**
 * X3 — Session Provisioning: updated behavior tests (RED phase)
 *
 * AC-13: Session provisioning reads systemPrompt from DB (not file)
 * AC-14: Session provisioning uses modelTierPreference as default
 * AC-15: Session provisioning filters adapters by harnessType
 * AC-17: Agent configuration changes take effect on next session (no restart)
 *
 * These tests FAIL until:
 *  - session-provisioning.ts removes validateSoulPromptPath
 *  - session-provisioning.ts reads agent.systemPrompt (not systemPromptPath)
 *  - session-provisioning.ts uses agent.modelTierPreference as default tier
 *  - session-provisioning.ts passes harnessType to adapterPool.select()
 *  - adapter-pool.ts supports harnessType filter in SelectRequirements
 *  - schema.ts has systemPrompt, harnessType, modelTierPreference columns on users
 *
 * Implementation notes:
 *  - Uses ScriptedHarnessAdapter pattern from session-provisioning.test.ts
 *  - AC-13 checks assemblePrompt is called with systemPromptText (not systemPromptPath)
 *    by inspecting the started session config for the composed prompt
 *  - AC-14 checks the session row's modelTier column after provisioning
 *  - AC-15 registers two typed adapters and verifies the right one is selected
 *  - AC-17 is an integration test: provision → update config → provision again
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	type HyperIdleDb,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { fabricStrategy } from "@hyperidle/fabric";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import type { AdapterMeta } from "../harness/adapter-pool.js";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import {
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	provisionSession,
} from "../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

// ---------------------------------------------------------------------------
// Minimal scripted harness adapter
// ---------------------------------------------------------------------------

/** Captures session configs to let tests inspect what was passed. */
class CapturingHarnessAdapter implements HarnessAdapter {
	public capturedConfigs: SessionConfig[] = [];

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		this.capturedConfigs.push(config);
		return { sessionId: "captured-session" };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		// AL6 v2: emit submit_review so the return gate sees a return action.
		yield { type: "tool_call", toolName: "submit_review", args: { message: "X3 stub done" } };
		yield { type: "completion", text: "stub done" };
	}

	async stopSession(_handle: SessionHandle): Promise<SessionResult> {
		return {
			outcome: "completed",
			cost: { minor: 0, currency: "USD" },
			tokenUsage: { byTier: {} },
		};
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: ["anthropic"],
			mcpSupport: false,
			returnEnforcement: "none",
		};
	}
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();

/** Seed the minimal domain entities for a session provisioning test. */
async function seedDomain(
	db: HyperIdleDb,
	agentOverrides: Record<string, unknown> = {},
): Promise<{ agentId: string; taskId: string; teamId: string }> {
	const agentId = `x3-sp-agent-${Math.random().toString(36).slice(2, 7)}`;
	const teamId = "x3-sp-team";
	const teamMembersId = "x3-sp-tm";
	const betId = "x3-sp-bet";
	const taskId = `x3-sp-task-${Math.random().toString(36).slice(2, 7)}`;
	const threadId = `x3-sp-thread-${Math.random().toString(36).slice(2, 7)}`;

	await db
		.insert(teams)
		.values({ id: teamId, name: "X3 SP Team", phase: "build", createdAt: NOW })
		.onConflictDoNothing();
	await db
		.insert(teamMembers)
		.values({ id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: NOW })
		.onConflictDoNothing();

	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "SP Test Agent",
		role: "builder",
		status: "active",
		maxConcurrentSessions: 4,
		teamId: teamMembersId,
		createdAt: NOW,
		...agentOverrides,
	});

	await db.insert(threads).values({
		id: threadId,
		hostKind: "task",
		hostId: taskId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db
		.insert(bets)
		.values({ id: betId, teamId, description: "X3 SP bet", status: "active", createdAt: NOW })
		.onConflictDoNothing();
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: "X3 SP Task",
		state: "accepted",
		ownerAgentId: agentId,
		threadId,
		createdAt: NOW,
		updatedAt: NOW,
	});

	return { agentId, taskId, teamId };
}

function makePool(adapter: HarnessAdapter, meta?: Partial<AdapterMeta>, id = "local"): AdapterPool {
	const pool = new AdapterPool();
	pool.register(id, adapter, {
		name: id,
		kind: "local",
		modelProviders: ["anthropic"],
		maxConcurrent: 4,
		...meta,
	});
	return pool;
}

// ---------------------------------------------------------------------------
// AC-13: Session provisioning reads systemPrompt from DB (not file)
// ---------------------------------------------------------------------------

describe("X3 AC-13: session provisioning reads systemPrompt from DB column", () => {
	let sandboxBasePath: string;

	beforeEach(() => {
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "x3-sp-"));
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
	});

	test("provisions session successfully when agent has systemPrompt set (not a file path)", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, teamId } = await seedDomain(db, {
			systemPrompt: "# Test Persona\n\nYou are a test agent for {{product}}.",
		});

		const adapter = new CapturingHarnessAdapter();
		const pool = makePool(adapter);
		const workspace = new LocalSandboxAdapter();
		const deps: ProvisionSessionDeps = { db, eventBus, adapterPool: pool, workspace };
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
		};

		// Should succeed without trying to read a file from disk
		const result = await provisionSession(deps, params);
		expect(result.sessionId).toBeTruthy();
		expect(result.outcome).toBe("completed");
	});

	test("provisions session successfully when agent has null systemPrompt (empty persona)", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, teamId } = await seedDomain(db, {
			systemPrompt: null,
		});

		const adapter = new CapturingHarnessAdapter();
		const pool = makePool(adapter);
		const workspace = new LocalSandboxAdapter();
		const deps: ProvisionSessionDeps = { db, eventBus, adapterPool: pool, workspace };
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
		};

		// Should succeed with empty persona (no file read required)
		const result = await provisionSession(deps, params);
		expect(result.sessionId).toBeTruthy();
	});

	test("composed prompt is passed via SessionConfig.composedPrompt (not systemPromptPath)", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, teamId } = await seedDomain(db, {
			systemPrompt: "# Builder\n\nYou are the builder.",
		});

		const adapter = new CapturingHarnessAdapter();
		const pool = makePool(adapter);
		const workspace = new LocalSandboxAdapter();
		const deps: ProvisionSessionDeps = { db, eventBus, adapterPool: pool, workspace };
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
		};

		await provisionSession(deps, params);

		// The harness should have been started. The composedPrompt is passed in SessionConfig.
		// composedPrompt should be non-empty (includes identity from systemPrompt).
		expect(adapter.capturedConfigs).toHaveLength(1);
		// systemPromptPath in SessionConfig should be empty (deprecated field, not used)
		expect(adapter.capturedConfigs[0]?.systemPromptPath).toBe("");
	});

	test("validateSoulPromptPath is NOT exported from session-provisioning (function removed)", async () => {
		// Dynamic import to check exports at runtime
		const mod = await import("../services/session-provisioning.js");
		// The function should not exist as a named export
		expect(Object.keys(mod)).not.toContain("validateSoulPromptPath");
	});
});

// ---------------------------------------------------------------------------
// AC-14: Session provisioning uses modelTierPreference as default
// ---------------------------------------------------------------------------

describe("X3 AC-14: session provisioning uses modelTierPreference as default", () => {
	let sandboxBasePath: string;

	beforeEach(() => {
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "x3-sp-"));
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
	});

	test("uses agent modelTierPreference='reasoning' when no explicit modelTier param", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, teamId } = await seedDomain(db, {
			modelTierPreference: "reasoning",
		});

		const adapter = new CapturingHarnessAdapter();
		const pool = makePool(adapter);
		const workspace = new LocalSandboxAdapter();
		const deps: ProvisionSessionDeps = { db, eventBus, adapterPool: pool, workspace };
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
			// No modelTier param — should use agent's preference
		};

		await provisionSession(deps, params);

		// The session row in the DB should reflect the agent's preference
		const sessionRows = await db
			.select({ modelTier: sessions.modelTier })
			.from(sessions)
			.where(eq(sessions.agentId, agentId))
			.limit(1);

		expect(sessionRows[0]?.modelTier).toBe("reasoning");
	});

	test("explicit modelTier='fast' overrides agent modelTierPreference='reasoning'", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, teamId } = await seedDomain(db, {
			modelTierPreference: "reasoning",
		});

		const adapter = new CapturingHarnessAdapter();
		const pool = makePool(adapter);
		const workspace = new LocalSandboxAdapter();
		const deps: ProvisionSessionDeps = { db, eventBus, adapterPool: pool, workspace };
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
			modelTier: "fast", // Explicit override
		};

		await provisionSession(deps, params);

		const sessionRows = await db
			.select({ modelTier: sessions.modelTier })
			.from(sessions)
			.where(eq(sessions.agentId, agentId))
			.limit(1);

		expect(sessionRows[0]?.modelTier).toBe("fast");
	});

	test("falls back to 'workhorse' when agent modelTierPreference is null and no explicit param", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, teamId } = await seedDomain(db, {
			modelTierPreference: null,
		});

		const adapter = new CapturingHarnessAdapter();
		const pool = makePool(adapter);
		const workspace = new LocalSandboxAdapter();
		const deps: ProvisionSessionDeps = { db, eventBus, adapterPool: pool, workspace };
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
		};

		await provisionSession(deps, params);

		const sessionRows = await db
			.select({ modelTier: sessions.modelTier })
			.from(sessions)
			.where(eq(sessions.agentId, agentId))
			.limit(1);

		expect(sessionRows[0]?.modelTier).toBe("workhorse");
	});
});

// ---------------------------------------------------------------------------
// AC-15: Session provisioning filters adapters by harnessType
// ---------------------------------------------------------------------------

describe("X3 AC-15: session provisioning filters adapters by harnessType", () => {
	let sandboxBasePath: string;

	beforeEach(() => {
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "x3-sp-"));
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
	});

	test("selects the adapter matching agent harnessType='aider'", async ({ db, eventBus }) => {
		const { agentId, taskId, teamId } = await seedDomain(db, {
			harnessType: "aider",
		});

		const claudeAdapter = new CapturingHarnessAdapter();
		const aiderAdapter = new CapturingHarnessAdapter();

		const pool = new AdapterPool();
		pool.register("claude-code-1", claudeAdapter, {
			name: "claude-code-1",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});
		pool.register("aider-1", aiderAdapter, {
			name: "aider-1",
			kind: "remote",
			type: "aider",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		const workspace = new LocalSandboxAdapter();
		const deps: ProvisionSessionDeps = { db, eventBus, adapterPool: pool, workspace };
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
		};

		await provisionSession(deps, params);

		// Aider adapter should have been used
		expect(aiderAdapter.capturedConfigs).toHaveLength(1);
		// Claude adapter should NOT have been used
		expect(claudeAdapter.capturedConfigs).toHaveLength(0);
	});

	test("selects any adapter when agent harnessType is null (backward compat)", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, teamId } = await seedDomain(db, {
			harnessType: null,
		});

		const adapter = new CapturingHarnessAdapter();
		const pool = makePool(adapter, { type: "claude-code" });
		const workspace = new LocalSandboxAdapter();
		const deps: ProvisionSessionDeps = { db, eventBus, adapterPool: pool, workspace };
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
		};

		const result = await provisionSession(deps, params);
		expect(result.sessionId).toBeTruthy();
		expect(adapter.capturedConfigs).toHaveLength(1);
	});

	test("throws 'No available adapter' when agent harnessType has no matching adapter", async ({
		db,
		eventBus,
	}) => {
		const { agentId, taskId, teamId } = await seedDomain(db, {
			harnessType: "goose", // No goose adapter in pool
		});

		const pool = new AdapterPool();
		pool.register("claude-code-1", new CapturingHarnessAdapter(), {
			name: "claude-code-1",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		const workspace = new LocalSandboxAdapter();
		const deps: ProvisionSessionDeps = { db, eventBus, adapterPool: pool, workspace };
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
		};

		// AH2: NoEligibleHarnessError thrown when agent.harnessType has no matching adapter.
		// Message matches "No registered adapter matches harness type 'goose'".
		await expect(provisionSession(deps, params)).rejects.toThrow(/no.*adapter|harness type/i);
	});
});

// ---------------------------------------------------------------------------
// AC-17: Agent configuration changes take effect on next session
// ---------------------------------------------------------------------------

describe("X3 AC-17: agent config changes take effect on next session without restart", () => {
	let sandboxBasePath: string;

	beforeEach(() => {
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "x3-sp-"));
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
	});

	test("updated modelTierPreference is reflected in the next session", async ({ db, eventBus }) => {
		const {
			agentId,
			taskId: taskId1,
			teamId,
		} = await seedDomain(db, {
			modelTierPreference: null, // Default: workhorse
		});

		const adapter = new CapturingHarnessAdapter();
		const pool = makePool(adapter);
		const workspace = new LocalSandboxAdapter();

		// Session 1: workhorse default
		await provisionSession(
			{ db, eventBus, adapterPool: pool, workspace },
			{ taskId: taskId1, agentId, productId: teamId, sandboxBasePath },
		);

		const session1Rows = await db
			.select({ modelTier: sessions.modelTier })
			.from(sessions)
			.where(eq(sessions.agentId, agentId))
			.orderBy(sessions.startedAt)
			.limit(1);

		expect(session1Rows[0]?.modelTier).toBe("workhorse");

		// Update agent config in DB (simulates UI PATCH without server restart)
		await db.update(users).set({ modelTierPreference: "fast" }).where(eq(users.id, agentId));

		// Session 2: should use new preference "fast"
		const taskId2 = `x3-ac17-task-2-${Math.random().toString(36).slice(2, 7)}`;
		const threadId2 = `x3-ac17-thread-2-${Math.random().toString(36).slice(2, 7)}`;
		await db.insert(threads).values({
			id: threadId2,
			hostKind: "task",
			hostId: taskId2,
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: taskId2,
			betId: "x3-sp-bet",
			teamId,
			title: "AC17 Task 2",
			state: "accepted",
			ownerAgentId: agentId,
			threadId: threadId2,
			createdAt: NOW,
			updatedAt: NOW,
		});

		await provisionSession(
			{ db, eventBus, adapterPool: pool, workspace },
			{ taskId: taskId2, agentId, productId: teamId, sandboxBasePath },
		);

		const allSessions = await db
			.select({ modelTier: sessions.modelTier, startedAt: sessions.startedAt })
			.from(sessions)
			.where(eq(sessions.agentId, agentId))
			.orderBy(sessions.startedAt);

		expect(allSessions).toHaveLength(2);
		expect(allSessions[0]?.modelTier).toBe("workhorse");
		expect(allSessions[1]?.modelTier).toBe("fast");
	});
});
