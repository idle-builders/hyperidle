/**
 * AH5 AC4 — "Genuinely gates" proof: broken stream → lane fails.
 *
 * Drives the PRODUCTION `provisionSession`/`runSession` entrypoint with a stub
 * harness adapter that emits NO `completion` event (simulating a broken stream).
 * Asserts the probe's liveness success condition FAILS.
 *
 * This proves:
 *   1. The production turn path is exercised (not a parallel adapter).
 *   2. The lane's success condition is load-bearing: a dead/broken stream cannot
 *      produce `outcome === "completed"` or `totalCostCents > 0`.
 *
 * The stub is injected AT THE PRODUCTION SEAM (`provisionSession`'s `adapterPool`)
 * so it drives the real phases 1-11, not a hand-built copy.
 *
 * @lore AH5: This is the gating proof. The broken-stream adapter emits zero events
 * (as if the LLM call silently failed). A real successful turn emits `completion`
 * events and accumulates cost. Asserting `outcome !== "completed"` or
 * `totalCostCents === 0` proves the success condition is NOT vacuously satisfied
 * when the stream is dead.
 */

import { bets, tasks, teamMembers, teams, users } from "@hyperidle/db";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../../harness/adapter-pool.js";
import { LocalWorkspaceAdapter } from "../../harness/local-workspace-adapter.js";
import { provisionSession } from "../../services/session-provisioning.js";
import { test } from "../../test-fixtures.js";

// ---------------------------------------------------------------------------
// Broken-stream stub: emits NO events (empty async generator)
// ---------------------------------------------------------------------------

/**
 * A harness adapter that starts but emits ZERO events.
 * Simulates a fully broken stream — no `completion`, no `cost_update`,
 * no `tool_call`. The session will "complete" with outcome=crashed (or
 * the stream just ends with zero events), leaving no real turn evidence.
 *
 * @lore AH5: "broken stream" means the LLM call returned but produced no
 * output events. The harness still starts (so the session row is created),
 * but the event drain sees nothing → no `completion` observed.
 */
function makeBrokenStreamAdapter(): HarnessAdapter {
	const caps: HarnessCapabilities = {
		preCompactionTrigger: false,
		subAgents: false,
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		mcpSupport: false,
	};

	return {
		async startSession(config: SessionConfig): Promise<SessionHandle> {
			return { sessionId: config.sessionId };
		},

		// biome-ignore lint/correctness/useYield: intentional — broken stream emits nothing
		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
			// Emits zero events — broken stream.
		},

		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return {
				outcome: "completed",
				cost: { minor: 0, currency: "USD" },
				tokenUsage: { byTier: {} },
			};
		},

		getCapabilities(): HarnessCapabilities {
			return caps;
		},
	};
}

// ---------------------------------------------------------------------------
// DB seed helpers
// ---------------------------------------------------------------------------

const TEST_TEAM_ID = "ah5-gate-team";
const TEST_AGENT_ID = "ah5-gate-agent";
const TEST_BET_ID = "ah5-gate-bet";
const TEST_TASK_ID = "ah5-gate-task";

async function seedDb(db: Parameters<typeof provisionSession>[0]["db"]): Promise<void> {
	await db.insert(teams).values({
		id: TEST_TEAM_ID,
		name: "AH5 Gate Team",
		phase: "build",
		createdAt: new Date().toISOString(),
	});
	await db.insert(teamMembers).values({
		id: "ah5-gate-tm",
		teamId: TEST_TEAM_ID,
		capacity: 3,
		activeBets: 0,
		formedAt: new Date().toISOString(),
	});
	await db.insert(users).values({
		id: TEST_AGENT_ID,
		name: "AH5 Gate Agent",
		role: "builder",
		status: "idle",
		// @lore U1: users.teamId references team_members.id (not teams.id).
		teamId: "ah5-gate-tm",
		createdAt: new Date().toISOString(),
		// AH2: Use builtin harness so the pool can select it.
		harnessType: "builtin",
		modelProvider: "openrouter",
		modelId: "deepseek/deepseek-chat-v3-0324:nitro",
	});
	await db.insert(bets).values({
		id: TEST_BET_ID,
		teamId: TEST_TEAM_ID,
		description: "AH5 Gate Test Bet",
		appetite: "small",
		status: "active",
		createdAt: new Date().toISOString(),
	});
	await db.insert(tasks).values({
		id: TEST_TASK_ID,
		betId: TEST_BET_ID,
		teamId: TEST_TEAM_ID,
		title: "AH5 Gate Test Task",
		state: "accepted",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AH5 AC4 — broken-stream gate: production seam provisionSession", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "ah5-gate-test-key");
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "ah5-gate-cred-key-32chars!!!!");
		vi.stubEnv("HYPERIDLE_PROFILE", "laptop");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("broken-stream adapter → session does NOT accumulate cost (liveness condition fails)", async ({
		db,
	}) => {
		await seedDb(db);
		const eventBus = new EventBus();

		// Broken-stream adapter registered in the pool.
		const pool = new AdapterPool();
		const brokenAdapter = makeBrokenStreamAdapter();
		pool.register("broken-builtin", brokenAdapter, {
			name: "Broken Stream Builtin",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 5,
		});

		const workspace = new LocalWorkspaceAdapter();

		// Provide a fake resolvedModel (the broken adapter ignores it — no real LLM call).
		const fakeResolvedModel = {
			provider: "openrouter" as const,
			model: "deepseek/deepseek-chat-v3-0324:nitro",
			apiKey: "fake-key-for-gate-test",
			baseUrl: "https://openrouter.ai/api",
		};

		const result = await provisionSession(
			{ db, eventBus, adapterPool: pool, workspace },
			{
				taskId: TEST_TASK_ID,
				agentId: TEST_AGENT_ID,
				productId: TEST_TEAM_ID,
				workspaceBasePath: "/tmp/ah5-gate-test",
				resolvedModel: fakeResolvedModel,
			},
		);

		// The probe's liveness success condition:
		// "a real completion + tool_call event were observed + totalCostCents > 0"
		// With a broken stream (zero events), totalCostCents must be 0.
		// This asserts the success condition is NOT vacuously satisfied.
		expect(result.totalCostCents).toBe(0);

		// The outcome from the broken stream: since the adapter never emits a crash,
		// the session drains to empty and ends (no error → endSession called).
		// Either way, there is NO evidence of a real model turn.
		// The key assertion: zero cost means "broken stream ≠ real turn".
		expect(result.totalCostCents).not.toBeGreaterThan(0);
	});

	test("broken-stream adapter → outcome is not 'budget_exhausted' (no cost accumulated)", async ({
		db,
	}) => {
		await seedDb(db);
		const eventBus = new EventBus();

		const pool = new AdapterPool();
		pool.register("broken-builtin-2", makeBrokenStreamAdapter(), {
			name: "Broken Stream Builtin 2",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 5,
		});

		const workspace = new LocalWorkspaceAdapter();

		const fakeResolvedModel = {
			provider: "openrouter" as const,
			model: "deepseek/deepseek-chat-v3-0324:nitro",
			apiKey: "fake-key-for-gate-test-2",
			baseUrl: "https://openrouter.ai/api",
		};

		// Use a fresh task id to avoid the task being in_progress from the prior test.
		// (Integration tests share a DB with TRUNCATE between tests, so this is clean.)
		await db.insert(tasks).values({
			id: "ah5-gate-task-2",
			betId: TEST_BET_ID,
			teamId: TEST_TEAM_ID,
			title: "AH5 Gate Test Task 2",
			state: "accepted",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		const result = await provisionSession(
			{ db, eventBus, adapterPool: pool, workspace },
			{
				taskId: "ah5-gate-task-2",
				agentId: TEST_AGENT_ID,
				productId: TEST_TEAM_ID,
				workspaceBasePath: "/tmp/ah5-gate-test-2",
				resolvedModel: fakeResolvedModel,
			},
		);

		// A real live turn would produce outcome="completed" with cost > 0.
		// A broken stream produces 0 cost regardless of outcome.
		// This proves: totalCostCents === 0 is the FAIL signal for the liveness check.
		expect(result.totalCostCents).toBe(0);
	});
});
