/**
 * AB1 — Agent Profile API: integration tests (RED phase)
 *
 * AC coverage:
 * AC-1: GET /api/agents/:id/profile returns 200 with correct shape for a valid agent
 * AC-2: Returns 404 for non-existent agent
 * AC-3: Returns 404 for human users (kind='human')
 * AC-4: Returns active session when agent has running session
 * AC-5: Returns recent sessions (last 10, newest first)
 * AC-6: Returns performance aggregates (total sessions, success count, success rate)
 * AC-7: Health signal: failure rate warning when >50% in 7 days
 * AC-8: Health signal: failure rate OK when ≤50%
 * AC-9: Health signal: last session crash warning
 * AC-10: Health signal: harness available (warning when type not in pool)
 * AC-11 (AD4 rewrite): reviewTrackRecord replaces skills in profile response
 *
 * @lore AU21 Increment 14a: AC-12 (returns null cost for sessions) is
 * HARD-DELETED — `AgentSessionSummary.cost` no longer exists on the type at
 * all, no replacement.
 *
 * These tests FAIL until:
 * - framework/domain-model/src/agent-profile.ts is created with 7 wire types
 * - packages/server/src/routes/agent-profile.ts is created with the handler
 * - packages/server/src/routes/agents.ts mounts the profile route
 * - packages/server/src/app.ts passes adapterPool to agent routes
 */

import {
	agentRunConfig,
	bets,
	type HyperIdleDb,
	items,
	messages,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { AdapterPool } from "@hyperidle/harness-registry";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";
import { createTestApp } from "../../__testing__/test-utils.js";

const TEST_API_KEY = "test-key-ab1-agent-profile";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

const NOW = new Date().toISOString();
// 3 days ago
// 10 days ago (outside 7-day health window)

/** Seed the minimum required prerequisite rows for agent profile tests. */
async function seedPrereqs(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "ab1-team", name: "AB1 Test Team", phase: "build", createdAt: NOW });

	// Seed the human founder (required for auth middleware)
	await db.insert(users).values({
		id: "u-founder-ab1",
		kind: "human",
		name: "AB1 Founder",
		role: "founder",
		status: "active",
		email: "ab1-founder@hyperidle.com",
		createdAt: NOW,
	});
	// @lore AU26 G1: the run config left `users` for `agent_run_config`.
	await db.insert(agentRunConfig).values({
		agentUserId: "u-founder-ab1",
		maxConcurrentSessions: 0,
	});

	// Seed a configurable AI agent (builder role)
	await db.insert(users).values({
		id: "ab1-agent-builder",
		kind: "ai",
		name: "AB1 Builder Bot",
		role: "builder",
		status: "active",
		teamId: "ab1-team",
		createdAt: NOW,
	});
	// @lore AU26 G1: the run config left `users` for `agent_run_config`.
	await db.insert(agentRunConfig).values({
		agentUserId: "ab1-agent-builder",
		maxConcurrentSessions: 2,
		harnessType: "claude-code",
		systemPrompt: "You are a builder agent.",
		modelTierPreference: "workhorse",
	});

	// Seed a human user (to test 404 path)
	await db.insert(users).values({
		id: "ab1-human-user",
		kind: "human",
		name: "AB1 Human",
		role: "founder",
		status: "active",
		email: "ab1-human@hyperidle.com",
		createdAt: NOW,
	});
	// @lore AU26 G1: the run config left `users` for `agent_run_config`.
	await db.insert(agentRunConfig).values({
		agentUserId: "ab1-human-user",
		maxConcurrentSessions: 0,
	});

	// Seed a bet and task for sessions
	await db.insert(bets).values({
		id: "ab1-bet-1",
		teamId: "ab1-team",
		description: "Test bet",
		status: "active",
		createdAt: NOW,
	});

	await db.insert(tasks).values({
		id: "ab1-task-1",
		betId: "ab1-bet-1",
		teamId: "ab1-team",
		title: "Test task 1",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

// ---------------------------------------------------------------------------
// AC-1: GET /api/agents/:id/profile returns 200 with correct shape
// ---------------------------------------------------------------------------

describe("AB1 AC-1: GET /api/agents/:id/profile returns 200 with correct shape", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 200 with correct top-level shape", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(200);

		const body = (await res.json()) as Record<string, unknown>;
		// Identity fields
		expect(body).toHaveProperty("id");
		expect(body).toHaveProperty("name");
		expect(body).toHaveProperty("role");
		expect(body).toHaveProperty("teamName");
		expect(body).toHaveProperty("createdAt");
		// Config fields
		expect(body).toHaveProperty("systemPrompt");
		expect(body).toHaveProperty("harnessType");
		expect(body).toHaveProperty("modelTierPreference");
		expect(body).toHaveProperty("maxConcurrentSessions");
		// @lore AU26 J4: `activeSession`, `recentSessions`, `performance` and
		// `healthSignals` are GONE — every one was derived here from
		// `agent-orchestration`'s `sessions` table, and the profile page fetches
		// the runs from that Layer and derives them itself. Their derivation is
		// covered by `framework/domain-model/src/__tests__/health-signals.test.ts`; the
		// run rows they derive from by
		// `agent-orchestration-run-reads.integration.test.ts`.
		for (const gone of ["activeSession", "recentSessions", "performance", "healthSignals"]) {
			expect(body).not.toHaveProperty(gone);
		}
		// Harness availability — NOT run state; a fact about this process's
		// adapter pool, and the one health input the browser cannot compute.
		expect(body).toHaveProperty("harnessAvailable");
		// Capabilities
		expect(body).toHaveProperty("harnessCapabilities");
		// Review track record (AD4: replaces skills)
		expect(body).toHaveProperty("reviewTrackRecord");
	});

	test("returns correct identity values for the builder agent", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;

		expect(body.id).toBe("ab1-agent-builder");
		expect(body.name).toBe("AB1 Builder Bot");
		expect(body.role).toBe("builder");
		expect(body.harnessType).toBe("claude-code");
		expect(body.systemPrompt).toBe("You are a builder agent.");
		expect(body.modelTierPreference).toBe("workhorse");
		expect(body.maxConcurrentSessions).toBe(2);
	});

	test("returns 401 without auth header", async ({ db, requestWithoutAuth }) => {
		await seedPrereqs(db);
		const res = await requestWithoutAuth("/api/agents/ab1-agent-builder/profile");
		expect(res.status).toBe(401);
	});

	test("harnessCapabilities shape has required fields", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const caps = body.harnessCapabilities as Record<string, unknown>;

		expect(caps).toHaveProperty("toolUse");
		expect(caps).toHaveProperty("mcpSupport");
		expect(caps).toHaveProperty("fileEditing");
		expect(caps).toHaveProperty("subAgents");
	});

	test("reviewTrackRecord is present and has recentVerdicts array (AD4: replaces skills)", async ({
		db,
		app,
	}) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const trackRecord = body.reviewTrackRecord as Record<string, unknown>;
		expect(trackRecord).toBeDefined();
		expect(Array.isArray(trackRecord.recentVerdicts)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// AC-2: GET /api/agents/:id/profile returns 404 for non-existent agent
// ---------------------------------------------------------------------------

describe("AB1 AC-2: GET /api/agents/:id/profile returns 404 for non-existent agent", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 404 for a non-existent agent id", async ({ db, app }) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/nonexistent-agent-id/profile", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body).toHaveProperty("code");
		expect(body.code).toBe("NOT_FOUND");
	});
});

// ---------------------------------------------------------------------------
// AC-3: GET /api/agents/:id/profile returns 404 for human users
// ---------------------------------------------------------------------------

describe("AB1 AC-3: GET /api/agents/:id/profile returns 404 for human users", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns 404 when querying a human user's profile", async ({ db, app }) => {
		await seedPrereqs(db);
		// ab1-human-user is kind='human' — not an AI agent
		const res = await app.request("/api/agents/ab1-human-user/profile", {
			headers: authHeaders(),
		});
		expect(res.status).toBe(404);

		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("NOT_FOUND");
	});
});

// ---------------------------------------------------------------------------
// AC-4: Returns active session when agent has running session
// ---------------------------------------------------------------------------

// @lore AU26 J4: `harnessAvailable` is now a TOP-LEVEL field on the profile
// response instead of a member of the (removed) `healthSignals` block. Same
// value, same three cases — the browser feeds it straight back into its own
// `computeHealthSignals` call.
describe("AB1 AC-10: Harness availability", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("sets harnessAvailable=true when agent harnessType is registered in pool", async ({
		db,
		eventBus,
	}) => {
		await seedPrereqs(db);
		// Create a pool with 'claude-code' adapter registered
		const adapterPool = new AdapterPool();
		adapterPool.register("local-claude-code", makeMockAdapter(), {
			name: "Claude Code",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		const app = await createTestApp({ db, eventBus, adapterPool });

		// ab1-agent-builder has harnessType: 'claude-code'
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.harnessAvailable).toBe(true);
	});

	test("sets harnessAvailable=false when agent harnessType is not in pool", async ({
		db,
		eventBus,
	}) => {
		await seedPrereqs(db);
		// Empty pool — no adapters registered
		const adapterPool = new AdapterPool();

		const app = await createTestApp({ db, eventBus, adapterPool });

		// ab1-agent-builder has harnessType: 'claude-code' but it's not in the empty pool
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.harnessAvailable).toBe(false);
	});

	test("sets harnessAvailable=true when agent has no harnessType preference", async ({
		db,
		eventBus,
	}) => {
		await seedPrereqs(db);
		const adapterPool = new AdapterPool();
		// Register any adapter
		adapterPool.register("local-builtin", makeMockAdapter(), {
			name: "Built-in",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		const app = await createTestApp({ db, eventBus, adapterPool });

		// Insert an agent without a harnessType preference
		await db.insert(users).values({
			id: "ab1-agent-no-harness",
			kind: "ai",
			name: "No Harness Agent",
			role: "builder",
			status: "active",
			createdAt: NOW,
			// no harnessType,
		});

		const res = await app.request("/api/agents/ab1-agent-no-harness/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		// No harnessType preference — any adapter will do, and pool has one
		expect(body.harnessAvailable).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// AC-11 (AD4 rewrite): reviewTrackRecord replaces skills in profile response
// ---------------------------------------------------------------------------

describe("AB1 AC-11 (AD4): reviewTrackRecord — approval rate from verdict history", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns reviewTrackRecord with required field shapes (AD4: replaces skills)", async ({
		db,
		app,
	}) => {
		await seedPrereqs(db);
		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const trackRecord = body.reviewTrackRecord as Record<string, unknown>;

		expect(trackRecord).toBeDefined();
		expect(typeof trackRecord.approvalRate).toBe("number");
		expect(typeof trackRecord.totalVerdicts).toBe("number");
		expect(Array.isArray(trackRecord.recentVerdicts)).toBe(true);
		expect(typeof trackRecord.windowDays).toBe("number");
	});

	test("reviewTrackRecord entry has decision, threadId, createdAt shape when verdicts exist", async ({
		db,
		app,
	}) => {
		await seedPrereqs(db);
		// Seed a verdict by inserting directly
		const threadId = crypto.randomUUID();
		const itemId = crypto.randomUUID();
		const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-ac11",
			initiatorId: "ab1-agent-builder",
			participants: JSON.stringify(["ab1-agent-builder"]),
			lastActiveAt: fiveDaysAgo,
			createdAt: fiveDaysAgo,
		});
		await db.insert(items).values({
			id: itemId,
			sourceAgentId: "ab1-agent-builder",
			kind: "approval",
			title: "AC-11 test item",
			riskTier: "low",
			threadId,
			createdAt: fiveDaysAgo,
		});
		await db.insert(messages).values({
			id: crypto.randomUUID(),
			senderId: "u-founder-ab1",
			threadId,
			type: "verdict",
			payload: JSON.stringify({ decision: "approve" }),
			clientKey: `verdict-ac11-${crypto.randomUUID()}`,
			legacyItemId: itemId,
			createdAt: fiveDaysAgo,
		});

		const res = await app.request("/api/agents/ab1-agent-builder/profile", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const trackRecord = body.reviewTrackRecord as Record<string, unknown>;
		const verdicts = trackRecord.recentVerdicts as Array<Record<string, unknown>>;

		expect(verdicts.length).toBeGreaterThanOrEqual(1);
		const v = verdicts[0];
		expect(v).toHaveProperty("decision");
		expect(v).toHaveProperty("threadId");
		expect(v).toHaveProperty("createdAt");
	});
});

// ---------------------------------------------------------------------------
// @lore AU21 Increment 14a: "AB1 AC-12: Returns null cost for sessions (no
// cost data)" is HARD-DELETED — `AgentSessionSummary.cost` (the always-null
// placeholder this AC asserted) no longer exists on the type at all, no
// replacement.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AC: Idle duration in health signals (per F3/A3 reviewer finding)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/harness-protocol";

function makeMockAdapter(): HarnessAdapter {
	return {
		async startSession(_config: SessionConfig): Promise<SessionHandle> {
			return { sessionId: "mock" };
		},
		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {},
		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return {
				outcome: "completed",
				tokenUsage: { byTier: {} },
			};
		},
		getCapabilities(): HarnessCapabilities {
			return {
				preCompactionTrigger: true,
				subAgents: true,
				modelProviders: ["anthropic"],
				mcpSupport: false,
				returnEnforcement: "none",
			};
		},
	};
}
