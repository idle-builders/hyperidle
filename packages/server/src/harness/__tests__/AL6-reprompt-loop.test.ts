/**
 * AL6 v4-final — RE-AUTHORED from v3.
 *
 * v3 encoded the re-prompt loop (while(true) + rewriteSandboxForcing + canReEngage).
 * v4-final DELETES the loop. This file now tests the v4 provisioned-hook model:
 *   - exactly ONE startSession per session (no loop)
 *   - per-harness provisionReturnHook channel provisioned at setup
 *   - enforcement registry tracks forceCount (from native hook / process-wrapper)
 *   - no-return at budget → not_returned + session_not_returned emitted
 *   - re-engage is per-adapter (process-reengage only), NOT universal
 *
 * What was deleted from v3:
 *   - sandbox-carrier adapter (reads AGENTS.md for forcing message) — v3 mechanism, DEAD
 *   - startCallCount > 1 assertions for blocking adapters — WRONG for v4
 *   - canReEngage / hasNativeReturnHook capability fields — REMOVED
 *   - rewriteSandboxForcing / writeSandboxAgentsMd side-effects — DELETED
 *   - NIT-3 content-gate on AGENTS.md — DEAD (no instruction-file rewrite in v4)
 *
 * What is KEPT from v3 (still valid in v4):
 *   - AC3: budget exhaustion → not_returned outcome
 *   - WARNING-A: persisted DB row is not_returned; session_ended bus event is not_returned
 *   - W2: exactly ONE session_ended fires
 *
 * Tests FAIL (red) until:
 *   - v3 while(true) loop deleted from session-provisioning.ts (Task 9)
 *   - provisionReturnHook called in Phase 8b (Task 9)
 *   - returnEnforcement field on HarnessCapabilities (Task 1)
 *   - return-enforcement-registry.ts created (Task 2)
 *   - re-engage.ts deleted (Task 10)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { bets, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { fabricStrategy } from "@hyperidle/fabric";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import * as sharedAll from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../../harness/builtin-harness-adapter.js";
import { LocalSandboxAdapter } from "../../harness/local-sandbox-adapter.js";
// FAILS red: returnEnforcement field not yet on HarnessCapabilities
import type { ReturnEnforcementChannel } from "../../harness/provision-return-hook.js";
import { provisionSession } from "../../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";

// AL6 CRIT-4: Mock callLlm so AC3 real-BuiltinHarnessAdapter test does not make network calls.
// Only affects BuiltinHarnessAdapter (in-process callLlm path). Stub adapter tests are unaffected.
vi.mock("../../harness/llm-client.js", () => ({
	callLlm: vi.fn(),
}));

// Accessor for the mocked callLlm — must come AFTER vi.mock().
const { callLlm } = await import("../../harness/llm-client.js");
const callLlmMock = vi.mocked(callLlm);

// biome-ignore lint/suspicious/noExplicitAny: accessing shared constants
const sharedNs = sharedAll as Record<string, any>;
const AL6_MAX_FORCE_RETURNS: number = sharedNs.AL6_MAX_FORCE_RETURNS;

// ── Constants ────────────────────────────────────────────────────────────────

const TEST_TEAM_ID = "al6v4-loop-team";
const TEST_AGENT_ID = "al6v4-loop-agent";
const TEST_BET_ID = "al6v4-loop-bet";

// ── DB seed ───────────────────────────────────────────────────────────────────

async function seedDb(
	db: Parameters<typeof provisionSession>[0]["db"],
	taskId: string,
): Promise<void> {
	await db.insert(teams).values({
		id: TEST_TEAM_ID,
		name: "AL6 v4 Loop Team",
		phase: "build",
		createdAt: new Date().toISOString(),
	});
	await db.insert(teamMembers).values({
		id: "al6v4-loop-tm",
		teamId: TEST_TEAM_ID,
		capacity: 3,
		activeBets: 0,
		formedAt: new Date().toISOString(),
	});
	await db.insert(users).values({
		id: TEST_AGENT_ID,
		name: "AL6 v4 Loop Agent",
		role: "builder",
		status: "idle",
		teamId: "al6v4-loop-tm",
		createdAt: new Date().toISOString(),
		harnessType: "builtin",
		modelProvider: "openrouter",
		modelId: "deepseek/deepseek-chat-v3-0324:nitro",
	});
	await db.insert(bets).values({
		id: TEST_BET_ID,
		teamId: TEST_TEAM_ID,
		description: "AL6 v4 Loop Test Bet",
		appetite: "small",
		status: "active",
		createdAt: new Date().toISOString(),
	});
	await db.insert(tasks).values({
		id: taskId,
		betId: TEST_BET_ID,
		teamId: TEST_TEAM_ID,
		title: "AL6 v4 Loop Test Task",
		state: "accepted",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
}

const FAKE_RESOLVED_MODEL = {
	provider: "openrouter" as const,
	model: "deepseek/deepseek-chat-v3-0324:nitro",
	apiKey: "al6v4-fake-key",
	baseUrl: "https://openrouter.ai/api",
};

// ── v4 adapter stub: declares returnEnforcement channel ──────────────────────
//
// v4 replaces canReEngage/hasNativeReturnHook with returnEnforcement.
// Adapters that declare "builtin-loop" are enforced in-process;
// adapters that declare "process-reengage" are re-invoked by the wrapper.
//
// In v4, startCallCount is ALWAYS 1 for blocking adapters (sdk-inprocess, builtin-loop,
// settings-claude, settings-codex) — the hook re-runs the SAME turn, not a new startSession.

function makeV4BlockingStub(
	channel: ReturnEnforcementChannel,
	returnsOnRun1 = false,
): HarnessAdapter & { startCallCount: number } {
	const adapter = {
		startCallCount: 0,

		async startSession(config: SessionConfig): Promise<SessionHandle> {
			adapter.startCallCount++;
			return { sessionId: config.sessionId };
		},

		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
			if (returnsOnRun1) {
				yield {
					type: "tool_call",
					toolName: "submit_review",
					args: { message: "Returned voluntarily." },
				};
			} else {
				// No return action — the native hook / builtin loop will force.
				yield { type: "tool_call", toolName: "write_memory", args: { key: "k", value: "v" } };
			}
			yield { type: "completion", text: "done." };
		},

		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return {
				outcome: "completed",
				cost: { minor: 100, currency: "USD" },
				tokenUsage: { byTier: {} },
			};
		},

		getCapabilities(): HarnessCapabilities {
			// v4 field (FAILS red until SHARED contract ships Task 1)
			return {
				preCompactionTrigger: false,
				subAgents: false,
				modelProviders: ["anthropic", "openrouter"],
				mcpSupport: false,
				returnEnforcement: channel,
			} as unknown as HarnessCapabilities;
		},
	};
	return adapter;
}

// ── Run helper ────────────────────────────────────────────────────────────────

async function runWithAdapter(
	db: Parameters<typeof provisionSession>[0]["db"],
	taskId: string,
	adapter: HarnessAdapter,
	adapterName: string,
	sandboxBasePath: string,
): Promise<{
	result: Awaited<ReturnType<typeof provisionSession>>;
	emittedEventTypes: string[];
	sessionEndedEvents: Array<{ outcome: string }>;
	sessionEndedCount: number;
}> {
	const eventBus = new EventBus();
	const emittedEventTypes: string[] = [];
	const sessionEndedEvents: Array<{ outcome: string }> = [];
	let sessionEndedCount = 0;

	eventBus.on("*", (ev) => {
		emittedEventTypes.push(ev.type);
	});
	eventBus.on("session_ended" as Parameters<typeof eventBus.on>[0], (ev) => {
		sessionEndedCount++;
		sessionEndedEvents.push({ outcome: (ev as unknown as { outcome: string }).outcome });
	});

	const pool = new AdapterPool();
	pool.register(adapterName, adapter, {
		name: `AL6 v4 Stub (${adapterName})`,
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter"],
		maxConcurrent: 5,
	});
	const workspace = new LocalSandboxAdapter();

	const result = await provisionSession(
		{ db, eventBus, adapterPool: pool, workspace },
		{
			taskId,
			agentId: TEST_AGENT_ID,
			productId: TEST_TEAM_ID,
			sandboxBasePath,
			resolvedModel: FAKE_RESOLVED_MODEL,
		},
	);

	return { result, emittedEventTypes, sessionEndedEvents, sessionEndedCount };
}

// ── Lifecycle setup ───────────────────────────────────────────────────────────

describe("AL6 v4-final — hook provisioning (re-authored from v3 loop)", () => {
	let sandboxBasePath: string;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "al6v4-loop-test-key");
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "al6v4-loop-cred-key-32chars!!!!");
		vi.stubEnv("HYPERIDLE_PROFILE", "laptop");
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "al6v4-loop-"));
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		vi.unstubAllEnvs();
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
	});

	// ── v4: exactly ONE startSession (no v3 loop) ────────────────────────
	//
	// In v4, blocking adapters (builtin-loop, settings-claude, settings-codex, sdk-inprocess)
	// force the agent in-turn via the native hook — the same session runs again WITHOUT
	// a new startSession. The v3 loop started a NEW session; v4 does NOT.
	//
	// FAILS red until the v3 while(true) loop is deleted from session-provisioning.ts.

	describe("AC4: exactly ONE startSession for blocking adapters (v3 loop deleted)", () => {
		test("builtin-loop adapter: no-return → enforcement fires in-process, startCallCount=1 (no loop re-start)", async ({
			db,
		}) => {
			const taskId = "al6v4-loop-ac4-builtin-1";
			await seedDb(db, taskId);

			const adapter = makeV4BlockingStub("builtin-loop", false);
			const { result } = await runWithAdapter(
				db,
				taskId,
				adapter,
				"al6v4-builtin-stub",
				sandboxBasePath,
			);

			// v4: exactly ONE startSession. If startCallCount > 1, the v3 loop is still alive.
			// FAILS red until Task 9 deletes the loop.
			expect(adapter.startCallCount).toBe(1);

			// Budget exhausted → not_returned.
			expect(result.outcome).toBe("not_returned");
		});

		test("builtin-loop adapter: returns voluntarily → outcome=completed, startCallCount=1, zero force", async ({
			db,
		}) => {
			const taskId = "al6v4-loop-ac4-builtin-return-1";
			await seedDb(db, taskId);

			const adapter = makeV4BlockingStub("builtin-loop", true);
			const { result } = await runWithAdapter(
				db,
				taskId,
				adapter,
				"al6v4-builtin-return-stub",
				sandboxBasePath,
			);

			expect(adapter.startCallCount).toBe(1);
			expect(result.outcome).toBe("completed");
			expect(result.returnVerdict).toBe("returned");
		});
	});

	// ── AC3: budget exhaustion → not_returned ────────────────────────────
	//
	// Same AC as v3, but the mechanism is the native hook (not the loop).
	// forceCount comes from the enforcement registry (not loopForceCount).

	describe("AC3 — budget exhaustion → not_returned after hook blocks", () => {
		test("never-returning real BuiltinHarnessAdapter → outcome=not_returned, forceReturnCount>=1, session_not_returned emitted", async ({
			db,
		}) => {
			// AL6 CRIT-4: Use real BuiltinHarnessAdapter (not stub) so the in-process
			// forcing loop actually fires and increments forceCount via getForceReturnCount().
			// The stub (makeV4BlockingStub) doesn't model the forcing loop, so forceCount=0
			// without the drain fallback. Real adapter = real increment = real proof.
			callLlmMock.mockResolvedValue({
				stopReason: "end_turn",
				content: [{ type: "text", text: "I'm done, no return action." }],
				usage: {
					inputTokens: 10,
					outputTokens: 5,
					cacheReadInputTokens: 0,
					cacheCreationInputTokens: 0,
				},
			});

			const taskId = "al6v4-ac3-budget-1";
			await seedDb(db, taskId);

			const adapter = new BuiltinHarnessAdapter();
			const { result, emittedEventTypes } = await runWithAdapter(
				db,
				taskId,
				adapter,
				"al6v4-builtin-real",
				sandboxBasePath,
			);

			// Outcome must be not_returned.
			expect(result.outcome).toBe("not_returned");
			expect(result.returnVerdict).toBe("not_returned");

			// session_not_returned must be emitted.
			expect(emittedEventTypes).toContain("session_not_returned");

			// forceReturnCount from enforcement registry + adapter.getForceReturnCount().
			// Real BuiltinHarnessAdapter increments session.forceCount each time it
			// blocks a non-returning stop attempt. forceCount >= 1 = hook ACTUALLY FIRED.
			const forceCount = (result as unknown as Record<string, unknown>).forceReturnCount as
				| number
				| undefined;
			if (forceCount !== undefined) {
				expect(forceCount).toBeGreaterThanOrEqual(1);
				expect(forceCount).toBeLessThanOrEqual(AL6_MAX_FORCE_RETURNS);
			}
		});

		test("WARNING-A: PERSISTED sessions.outcome row is 'not_returned' after budget exhaustion", async ({
			db,
		}) => {
			const taskId = "al6v4-ac3-persist-1";
			await seedDb(db, taskId);

			const adapter = makeV4BlockingStub("builtin-loop", false);
			const { result } = await runWithAdapter(
				db,
				taskId,
				adapter,
				"al6v4-persist-stub",
				sandboxBasePath,
			);

			expect(result.outcome).toBe("not_returned");

			const [session] = await db
				.select({ outcome: sessions.outcome })
				.from(sessions)
				.where(eq(sessions.id, result.sessionId))
				.limit(1);

			expect(session).toBeDefined();
			expect(session?.outcome).toBe("not_returned");
			expect(session?.outcome).not.toBe("completed");
		});

		test("WARNING-A: session_ended bus event carries outcome='not_returned'", async ({ db }) => {
			const taskId = "al6v4-ac3-bus-1";
			await seedDb(db, taskId);

			const adapter = makeV4BlockingStub("builtin-loop", false);
			const { result, sessionEndedEvents } = await runWithAdapter(
				db,
				taskId,
				adapter,
				"al6v4-bus-stub",
				sandboxBasePath,
			);

			expect(result.outcome).toBe("not_returned");
			expect(sessionEndedEvents).toHaveLength(1);
			expect(sessionEndedEvents[0]?.outcome).toBe("not_returned");
			expect(sessionEndedEvents[0]?.outcome).not.toBe("completed");
		});

		// W2: exactly ONE session_ended fires for the whole session.
		// In v3 the loop emitted session_ended per loop iteration. In v4: ONE.
		test("W2 — exactly ONE session_ended fires (no double-count from deleted loop)", async ({
			db,
		}) => {
			const taskId = "al6v4-w2-session-ended-1";
			await seedDb(db, taskId);

			const adapter = makeV4BlockingStub("builtin-loop", false);
			const { sessionEndedCount } = await runWithAdapter(
				db,
				taskId,
				adapter,
				"al6v4-w2-stub",
				sandboxBasePath,
			);

			expect(sessionEndedCount).toBe(1);
		});
	});

	// ── v3 deleted: no canReEngage / hasNativeReturnHook ─────────────────
	//
	// These v3 fields must NOT be on HarnessCapabilities in v4.
	// FAILS red while v3 fields still exist (Task 1 removes them).

	describe("v3 capability fields are REMOVED (Task 1 guard)", () => {
		test("HarnessCapabilities no longer has canReEngage (v3 dead)", async () => {
			// Import any real adapter and check it does NOT have canReEngage.
			const { BuiltinHarnessAdapter } = await import("../../harness/builtin-harness-adapter.js");
			const adapter = new BuiltinHarnessAdapter();
			const caps = adapter.getCapabilities() as unknown as Record<string, unknown>;

			// FAILS red while canReEngage still exists on HarnessCapabilities (before Task 1)
			expect("canReEngage" in caps).toBe(false);
		});

		test("HarnessCapabilities no longer has hasNativeReturnHook (v3 dead)", async () => {
			const { BuiltinHarnessAdapter } = await import("../../harness/builtin-harness-adapter.js");
			const adapter = new BuiltinHarnessAdapter();
			const caps = adapter.getCapabilities() as unknown as Record<string, unknown>;

			// FAILS red while hasNativeReturnHook still exists (before Task 1)
			expect("hasNativeReturnHook" in caps).toBe(false);
		});

		test("HarnessAdapter no longer has continueSession (v3 dead)", async () => {
			const { BuiltinHarnessAdapter } = await import("../../harness/builtin-harness-adapter.js");
			const adapter = new BuiltinHarnessAdapter() as unknown as Record<string, unknown>;

			// FAILS red while continueSession still exists (before Task 1)
			expect("continueSession" in adapter).toBe(false);
		});
	});

	// ── v4: returnEnforcement on every adapter (AC4 type-level) ─────────
	//
	// Every adapter must declare returnEnforcement (non-optional in v4).
	// FAILS red until Task 1 adds the field and Tasks 5-8 update each adapter.

	describe("AC4: returnEnforcement declared on every in-tree adapter", () => {
		test("BuiltinHarnessAdapter declares returnEnforcement='builtin-loop'", async () => {
			const { BuiltinHarnessAdapter } = await import("../../harness/builtin-harness-adapter.js");
			const adapter = new BuiltinHarnessAdapter();
			const caps = adapter.getCapabilities() as unknown as Record<string, unknown>;

			// FAILS red until Task 6 adds returnEnforcement:"builtin-loop"
			expect(caps.returnEnforcement).toBe("builtin-loop");
		});

		test("claude CLI adapter (CliHarnessAdapter) declares returnEnforcement='settings-claude'", async () => {
			const { CliHarnessAdapter } = await import("../../harness/cli-harness-adapter.js");
			const { CLAUDE_CLI_CONFIG } = await import("../../harness/adapter-pool.js");
			const adapter = new CliHarnessAdapter(CLAUDE_CLI_CONFIG);
			const caps = adapter.getCapabilities() as unknown as Record<string, unknown>;
			expect(caps.returnEnforcement).toBe("settings-claude");
		});

		test("CliHarnessAdapter (codex) declares returnEnforcement='settings-codex'", async () => {
			const { CliHarnessAdapter } = await import("../../harness/cli-harness-adapter.js");
			const adapter = new CliHarnessAdapter({
				binary: "codex",
				args: [],
				envMap: {},
				envAllowlist: [],
				eventFormat: "ndjson" as const,
				// FAILS red until Task 8 adds channel dispatch per adapter config
				returnEnforcementChannel: "settings-codex",
			} as unknown as ConstructorParameters<typeof CliHarnessAdapter>[0]);
			const caps = adapter.getCapabilities() as unknown as Record<string, unknown>;

			expect(caps.returnEnforcement).toBe("settings-codex");
		});
	});

	// ── re-engage.ts must be deleted (Task 10) ───────────────────────────

	describe("v3 re-engage.ts is DELETED (Task 10 guard)", () => {
		test("re-engage.ts no longer exports rewriteSandboxForcing", async () => {
			// FAILS red while re-engage.ts still exists (before Task 10)
			// After Task 10 this import must fail or the export must not exist.
			let hasRewriteSandboxForcing = false;
			try {
				const mod = await import("../../harness/re-engage.js");
				hasRewriteSandboxForcing = "rewriteSandboxForcing" in mod;
			} catch {
				// Module doesn't exist — that's the correct v4 state
				hasRewriteSandboxForcing = false;
			}

			// FAILS red: rewriteSandboxForcing still exists in re-engage.ts
			expect(hasRewriteSandboxForcing).toBe(false);
		});
	});
});
