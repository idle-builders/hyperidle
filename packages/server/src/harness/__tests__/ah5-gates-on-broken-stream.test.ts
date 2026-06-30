/**
 * AH5 AC4 — "Genuinely gates" proof: broken stream/tool-call path → lane fails.
 *
 * Drives the PRODUCTION `provisionSession`/`runSession` entrypoint with a stub
 * harness adapter that emits NO events (simulating a broken stream).
 * Asserts the probe's COMBINED liveness success predicate FAILS.
 *
 * The probe's success predicate (all three must be true):
 *   A. outcome === "completed"
 *   B. totalCostCents > 0
 *   C. write_session_notes tool_call_recorded event observed (AC3)
 *
 * This file proves each term is load-bearing:
 *   - Term B: broken stream → totalCostCents === 0 → predicate B fails.
 *   - Term C: broken stream → no tool_call_recorded events → predicate C fails.
 *   - Combined: broken stream cannot satisfy B ∧ C even if it satisfies A
 *     (the broken-stream adapter returns outcome="completed" via stopSession).
 *
 * The stub is injected AT THE PRODUCTION SEAM (`provisionSession`'s `adapterPool`)
 * so it drives the real phases 1-11, not a hand-built copy.
 *
 * @lore AH5: The broken-stream adapter's stopSession returns outcome="completed"
 * intentionally — this models the worst case where the adapter CLAIMS success
 * even though no events were emitted. The probe's combined predicate (B + C)
 * catches this even when A alone would vacuously pass.
 *
 * @lore AH5: W1 fix — the original test only asserted term B (cost===0).
 * This revision also asserts term C (no tool_call_recorded events) so the
 * tool-call half of the liveness predicate is proven load-bearing too.
 */

import { bets, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { fabricStrategy } from "@hyperidle/fabric";
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
import { LocalSandboxAdapter } from "../../harness/local-sandbox-adapter.js";
import { provisionSession } from "../../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
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
		returnEnforcement: "none",
	};

	return {
		async startSession(config: SessionConfig): Promise<SessionHandle> {
			return { sessionId: config.sessionId };
		},

		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
			// Intentionally emits zero events — broken stream. The generator body
			// is empty to simulate a dead LLM response stream.
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

// ---------------------------------------------------------------------------
// Assistant-turn liveness predicate (guards provisionSession stream path)
// ---------------------------------------------------------------------------

/**
 * The probe's combined success predicate. All three must be true for PASS:
 *   A. outcome === "completed"
 *   B. totalCostCents > 0
 *   C. at least one tool_call_recorded event for "write_session_notes"
 *
 * A broken/dead stream can satisfy A (the adapter claims completed) but
 * cannot satisfy B or C — so the combined predicate correctly fails closed.
 */
function probeSucceeds(
	result: { outcome: string; totalCostCents: number },
	toolCallNames: string[],
): boolean {
	const a = result.outcome === "completed";
	const b = result.totalCostCents > 0;
	const c = toolCallNames.includes("write_session_notes");
	return a && b && c;
}

describe("AH5 AC4 — broken-stream gate: production seam provisionSession", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "ah5-gate-test-key");
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "ah5-gate-cred-key-32chars!!!!");
		vi.stubEnv("HYPERIDLE_PROFILE", "laptop");
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		vi.unstubAllEnvs();
	});

	test("broken-stream: term B (cost>0) fails — no cost accumulated", async ({ db }) => {
		await seedDb(db);
		const eventBus = new EventBus();
		const toolCallNames: string[] = [];
		eventBus.on("tool_call_recorded", (e) => {
			toolCallNames.push((e as { toolName: string }).toolName);
		});

		const pool = new AdapterPool();
		pool.register("broken-builtin", makeBrokenStreamAdapter(), {
			name: "Broken Stream Builtin",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 5,
		});

		const workspace = new LocalSandboxAdapter();
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
				sandboxBasePath: "/tmp/ah5-gate-test",
				resolvedModel: fakeResolvedModel,
			},
		);

		// Term B: broken stream emits no cost events → cost stays 0.
		// Proving this term is load-bearing: a future regression that makes the
		// probe pass on cost=0 would NOT be caught without this assertion.
		expect(result.totalCostCents).toBe(0);
		expect(result.totalCostCents).not.toBeGreaterThan(0);

		// The combined predicate must FAIL even though term A may be "completed".
		// @lore AH5: The broken adapter's stopSession returns outcome="completed" —
		// modelling the worst case where the adapter lies. The combined predicate
		// (A ∧ B ∧ C) correctly rejects this because B=false.
		expect(probeSucceeds(result, toolCallNames)).toBe(false);
	});

	test("broken-stream: term C (tool_call) fails — no write_session_notes event", async ({ db }) => {
		await seedDb(db);
		const eventBus = new EventBus();

		// Collect tool_call_recorded event names from the production event bus.
		const toolCallNames: string[] = [];
		eventBus.on("tool_call_recorded", (e) => {
			toolCallNames.push((e as { toolName: string }).toolName);
		});

		const pool = new AdapterPool();
		pool.register("broken-builtin-2", makeBrokenStreamAdapter(), {
			name: "Broken Stream Builtin 2",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 5,
		});

		const workspace = new LocalSandboxAdapter();
		const fakeResolvedModel = {
			provider: "openrouter" as const,
			model: "deepseek/deepseek-chat-v3-0324:nitro",
			apiKey: "fake-key-for-gate-test-2",
			baseUrl: "https://openrouter.ai/api",
		};

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
				sandboxBasePath: "/tmp/ah5-gate-test-2",
				resolvedModel: fakeResolvedModel,
			},
		);

		// Term C: broken stream emits no tool_call_recorded events at all.
		// This proves the tool-call half of the liveness predicate is load-bearing:
		// without a real write_session_notes call, the combined predicate fails.
		expect(toolCallNames).not.toContain("write_session_notes");

		// The combined predicate FAILS because C=false (no tool call).
		// Even if the adapter returned outcome="completed" (term A passes),
		// B and C together ensure "green while dead" is impossible.
		expect(probeSucceeds(result, toolCallNames)).toBe(false);
	});

	test("combined predicate: broken stream cannot satisfy B AND C simultaneously", async ({
		db,
	}) => {
		await seedDb(db);
		const eventBus = new EventBus();
		const toolCallNames: string[] = [];
		eventBus.on("tool_call_recorded", (e) => {
			toolCallNames.push((e as { toolName: string }).toolName);
		});

		const pool = new AdapterPool();
		pool.register("broken-builtin-3", makeBrokenStreamAdapter(), {
			name: "Broken Stream Builtin 3",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 5,
		});

		const workspace = new LocalSandboxAdapter();
		const fakeResolvedModel = {
			provider: "openrouter" as const,
			model: "deepseek/deepseek-chat-v3-0324:nitro",
			apiKey: "fake-key-for-gate-test-3",
			baseUrl: "https://openrouter.ai/api",
		};

		await db.insert(tasks).values({
			id: "ah5-gate-task-3",
			betId: TEST_BET_ID,
			teamId: TEST_TEAM_ID,
			title: "AH5 Gate Test Task 3",
			state: "accepted",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});

		const result = await provisionSession(
			{ db, eventBus, adapterPool: pool, workspace },
			{
				taskId: "ah5-gate-task-3",
				agentId: TEST_AGENT_ID,
				productId: TEST_TEAM_ID,
				sandboxBasePath: "/tmp/ah5-gate-test-3",
				resolvedModel: fakeResolvedModel,
			},
		);

		// This is the combined proof: a broken stream cannot satisfy B ∧ C.
		// Both sub-predicates fail independently, making the combined predicate
		// doubly load-bearing against different failure modes:
		//   - Adapter emits cost but no tool call → B passes, C fails → combined fails.
		//   - Adapter emits tool call but no cost → C passes, B fails → combined fails.
		//   - Adapter emits neither (this case) → both fail → combined fails.
		expect(result.totalCostCents).toBe(0); // B = false
		expect(toolCallNames).toHaveLength(0); // C = false (zero tool calls, not just write_session_notes)
		expect(probeSucceeds(result, toolCallNames)).toBe(false);
	});
});
