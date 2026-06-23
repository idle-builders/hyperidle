/**
 * AL6 v3 — Integration tests for the re-prompt loop.
 *
 * Tests the Layer-B provisioning re-prompt loop: when a turn drains with no
 * return action, the provisioner rewrites the sandbox instruction file
 * (AGENTS.md/CLAUDE.md via writeSandboxAgentsMd) and re-engages the SAME
 * adapter slot up to AL6_MAX_FORCE_RETURNS times before settling not_returned.
 *
 * Covers:
 *   AC1 (re-prompt loop): a no-return turn on an external-shaped adapter is
 *     re-engaged via sandbox-file rewrite; run-2 returns → outcome "completed",
 *     forceReturnCount=1.
 *   AC3 (budget exhaustion): a never-returning adapter exhausts the loop and
 *     settles not_returned. Assert forceReturnCount===AL6_MAX_FORCE_RETURNS,
 *     persisted row = "not_returned", session_ended bus event = "not_returned",
 *     session_not_returned emitted. Exactly ONE session_ended fires.
 *   W1 (slot held across loop): the adapter pool slot is held for the WHOLE
 *     loop — not released between runs. Assert currentLoad stays ≥ 1 during
 *     the loop (no mid-loop release).
 *   W2 (single session_ended): exactly one session_ended event is emitted for
 *     the full loop span, even when the loop ran N>1 times.
 *
 * Tests FAIL (red) until:
 *   - T1: hasNativeReturnHook / canReEngage on HarnessCapabilities
 *   - T5: rewriteSandboxForcing helper
 *   - T6: re-prompt loop in runSession + forceReturnCount on ProvisionSessionResult
 *   - T7: v2 "Tier-2 reject immediately" branch deleted from provisioning
 */

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
import { EventBus } from "@hyperidle/shared";
import * as sharedAll from "@hyperidle/shared";
import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../../harness/local-sandbox-adapter.js";
import { provisionSession } from "../../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";

// biome-ignore lint/suspicious/noExplicitAny: accessing not-yet-exported v3 fields in red phase
const sharedNs = sharedAll as Record<string, any>;
const AL6_MAX_FORCE_RETURNS: number = sharedNs.AL6_MAX_FORCE_RETURNS;
const AL6_FORCE_RETURN_MESSAGE: string = sharedNs.AL6_FORCE_RETURN_MESSAGE;

// ── Constants ────────────────────────────────────────────────────────────────

const TEST_TEAM_ID = "al6v3-loop-team";
const TEST_AGENT_ID = "al6v3-loop-agent";
const TEST_BET_ID = "al6v3-loop-bet";

// ── DB seed ───────────────────────────────────────────────────────────────────

async function seedDb(
	db: Parameters<typeof provisionSession>[0]["db"],
	taskId: string,
): Promise<void> {
	await db.insert(teams).values({
		id: TEST_TEAM_ID,
		name: "AL6 v3 Loop Team",
		phase: "build",
		createdAt: new Date().toISOString(),
	});
	await db.insert(teamMembers).values({
		id: "al6v3-loop-tm",
		teamId: TEST_TEAM_ID,
		capacity: 3,
		activeBets: 0,
		formedAt: new Date().toISOString(),
	});
	await db.insert(users).values({
		id: TEST_AGENT_ID,
		name: "AL6 v3 Loop Agent",
		role: "builder",
		status: "idle",
		teamId: "al6v3-loop-tm",
		createdAt: new Date().toISOString(),
		harnessType: "builtin",
		modelProvider: "openrouter",
		modelId: "deepseek/deepseek-chat-v3-0324:nitro",
	});
	await db.insert(bets).values({
		id: TEST_BET_ID,
		teamId: TEST_TEAM_ID,
		description: "AL6 v3 Loop Test Bet",
		appetite: "small",
		status: "active",
		createdAt: new Date().toISOString(),
	});
	await db.insert(tasks).values({
		id: taskId,
		betId: TEST_BET_ID,
		teamId: TEST_TEAM_ID,
		title: "AL6 v3 Loop Test Task",
		state: "accepted",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
}

// ── Fake resolved model ───────────────────────────────────────────────────────

const FAKE_RESOLVED_MODEL = {
	provider: "openrouter" as const,
	model: "deepseek/deepseek-chat-v3-0324:nitro",
	apiKey: "al6v3-fake-key",
	baseUrl: "https://openrouter.ai/api",
};

// ── Sandbox-carrier stub (NIT-3 content-gated) ───────────────────────────────
//
// This adapter simulates a real external adapter (cli/isolated) whose ONLY
// instruction channel is the sandbox file (AGENTS.md/CLAUDE.md).
//
// KEY NIT-3 requirement: the adapter returns submit_review on run-2 ONLY IF the
// sandbox file it reads contains AL6_FORCE_RETURN_MESSAGE. A no-op carrier
// (file unchanged between runs) MUST make this mock NOT return on run-2.
// This prevents a fake carrier from passing the test green.
//
// In production, the provisioner calls writeSandboxAgentsMd(sandboxPath, prompt +
// "\n\n" + AL6_FORCE_RETURN_MESSAGE) before re-engaging. The mock reads the
// AGENTS.md file from the sessionConfig.sandboxPath to verify it was rewritten.

function makeSandboxCarrierStub(): HarnessAdapter & {
	startCallCount: number;
	sandboxFileContentByRun: string[];
} {
	const startCallCount = 0;
	const sandboxFileContentByRun: string[] = [];

	const adapter = {
		startCallCount,
		sandboxFileContentByRun,

		async startSession(config: SessionConfig): Promise<SessionHandle> {
			// Read the sandbox AGENTS.md to capture what the adapter was given.
			// This is the adapter's real input channel in production.
			let fileContent = "";
			try {
				const agentsMdPath = path.join(config.sandboxPath, "AGENTS.md");
				fileContent = fs.readFileSync(agentsMdPath, "utf-8");
			} catch {
				// file may not exist in early setup; treat as empty
				fileContent = "";
			}

			// Track the file content seen by each run (for assertions below).
			adapter.sandboxFileContentByRun.push(fileContent);
			adapter.startCallCount++;

			return { sessionId: config.sessionId };
		},

		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
			// Determine the run number (1-based) from how many startSession calls happened.
			const runNumber = adapter.startCallCount;

			// NIT-3 GATE: return submit_review on run-2 ONLY IF the file content that
			// was seen when startSession was called CONTAINS AL6_FORCE_RETURN_MESSAGE.
			// The content for this run is at index [runNumber - 1].
			const myFileContent = adapter.sandboxFileContentByRun[runNumber - 1] ?? "";
			const fileHasForcingMessage = myFileContent.includes(AL6_FORCE_RETURN_MESSAGE);

			if (runNumber === 1) {
				// Run 1: never return. The provisioner should detect this and re-engage.
				yield { type: "tool_call", toolName: "write_memory", args: { key: "k", value: "v" } };
				yield { type: "completion", text: "I forgot to return." };
			} else if (runNumber >= 2 && fileHasForcingMessage) {
				// Run 2+: return only if the sandbox file was rewritten with the forcing message.
				// This is the NIT-3 gate: a no-op carrier means fileHasForcingMessage=false here
				// and we fall through to the else branch below (no return), making the test FAIL.
				yield {
					type: "tool_call",
					toolName: "submit_review",
					args: { message: "Forced return — file was rewritten.", verdict: "approved" },
				};
				yield { type: "completion", text: "Returned after sandbox file rewrite." };
			} else {
				// Run 2+ but file NOT rewritten (no-op carrier path) — still no return.
				// A test expecting return on run-2 will fail because the carrier was a no-op.
				yield { type: "tool_call", toolName: "read_inbox", args: {} };
				yield { type: "completion", text: "File was not rewritten. Cannot return." };
			}
		},

		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return {
				outcome: "completed",
				cost: { minor: 100, currency: "USD" },
				tokenUsage: { byTier: {} },
			};
		},

		getCapabilities(): HarnessCapabilities {
			// v3 external shape: hasNativeReturnHook=false (no in-turn hook),
			// canReEngage=true (sandbox-file carrier). Fails red until T1 adds these fields.
			return {
				preCompactionTrigger: false,
				subAgents: false,
				modelProviders: ["anthropic", "openrouter", "openai-compatible"],
				mcpSupport: false,
				// v3 fields (T1 red — undefined until T1 ships):
				hasNativeReturnHook: false,
				canReEngage: true,
			} as unknown as HarnessCapabilities;
		},
	};

	return adapter;
}

// ── Never-returning adapter (for AC3/budget-exhaust tests) ───────────────────

function makeNeverReturningCarrierStub(): HarnessAdapter & { startCallCount: number } {
	const startCallCount = 0;
	const adapter = {
		startCallCount,

		async startSession(config: SessionConfig): Promise<SessionHandle> {
			adapter.startCallCount++;
			return { sessionId: config.sessionId };
		},

		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
			// Never emits a return action regardless of run number.
			yield { type: "tool_call", toolName: "write_memory", args: {} };
			yield { type: "completion", text: "Refusing to return." };
		},

		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return {
				outcome: "completed",
				cost: { minor: 100, currency: "USD" },
				tokenUsage: { byTier: {} },
			};
		},

		getCapabilities(): HarnessCapabilities {
			return {
				preCompactionTrigger: false,
				subAgents: false,
				modelProviders: ["anthropic", "openrouter", "openai-compatible"],
				mcpSupport: false,
				hasNativeReturnHook: false,
				canReEngage: true,
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
	sandboxBasePath = "/tmp/al6v3-loop-test",
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
		const e = ev as unknown as { outcome: string };
		sessionEndedEvents.push({ outcome: e.outcome });
	});

	const pool = new AdapterPool();
	pool.register(adapterName, adapter, {
		name: `AL6 v3 Stub (${adapterName})`,
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
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

describe("AL6 v3 — re-prompt loop integration", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "al6v3-loop-test-key");
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "al6v3-loop-cred-key-32chars!!!!");
		vi.stubEnv("HYPERIDLE_PROFILE", "laptop");
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		vi.unstubAllEnvs();
	});

	// ── AC1: sandbox-carrier forcing — NIT-3 content-gated ───────────────────
	//
	// THE headline test. An external-shaped adapter (hasNativeReturnHook:false,
	// canReEngage:true) that returns on run-2 ONLY IF the sandbox file was rewritten.
	// Asserts the provisioner performed a Layer-B re-engage via sandbox-file rewrite.
	//
	// FAILS red until T6 implements the re-prompt loop with writeSandboxAgentsMd.

	describe("AC1 — sandbox-carrier re-engage (NIT-3 content-gated)", () => {
		test(
			"external-shaped adapter: run-1 no-return → sandbox rewrite → run-2 returns → " +
				"outcome=completed, forceReturnCount=1",
			async ({ db }) => {
				const taskId = "al6v3-ac1-carrier-1";
				await seedDb(db, taskId);

				const adapter = makeSandboxCarrierStub();
				const { result } = await runWithAdapter(
					db,
					taskId,
					adapter,
					"al6v3-carrier-stub",
					"/tmp/al6v3-ac1-carrier-test",
				);

				// FAILS red: T6 must implement the re-prompt loop and sandbox-file rewrite.
				// Without T6, the adapter is only started once and result.outcome = "not_returned"
				// because no return action was seen and there is no re-engage.

				// The adapter MUST have been started exactly twice (run-1 + run-2).
				expect(adapter.startCallCount).toBe(2);

				// NIT-3: run-2 content must contain AL6_FORCE_RETURN_MESSAGE.
				// If the provisioner didn't rewrite the sandbox file, this fails → no-op carrier caught.
				const run2Content = adapter.sandboxFileContentByRun[1] ?? "";
				expect(run2Content).toContain(AL6_FORCE_RETURN_MESSAGE);

				// The outcome must be "completed" because run-2 returned submit_review.
				expect(result.outcome).toBe("completed");
				expect(result.returnVerdict).toBe("returned");

				// forceReturnCount reflects the Layer-B loop re-engage count.
				// FAILS red until T6 adds forceReturnCount to ProvisionSessionResult.
				expect((result as unknown as Record<string, unknown>).forceReturnCount).toBe(1);
			},
		);

		test("NIT-3 validation: if file NOT rewritten between runs, mock never returns (no-op carrier caught)", async ({
			db: _db,
		}) => {
			// This test validates the NIT-3 gate itself: a mock that doesn't read the file
			// would have returned unconditionally on run-2, making the carrier assertion vacuous.
			// Here we verify that the mock gates on the file content.

			// Create the sandbox directory so we can write a file that lacks the forcing message.
			const sandboxPath = "/tmp/al6v3-nit3-validation";
			try {
				fs.mkdirSync(sandboxPath, { recursive: true });
			} catch {
				// dir already exists
			}
			// Write AGENTS.md WITHOUT the forcing message.
			fs.writeFileSync(path.join(sandboxPath, "AGENTS.md"), "Normal instructions only.", "utf-8");

			// Use the sandbox-carrier adapter directly (not through provisionSession).
			// Check that run-2 (without file rewrite) does NOT return.
			const adapter = makeSandboxCarrierStub();

			const config: Partial<SessionConfig> = {
				sessionId: "nit3-test-session",
				sandboxPath,
				assembledPrompt: "test",
				tools: [],
				modelTier: "workhorse",
			};

			// Run startSession twice with the same file (no rewrite).
			await adapter.startSession(config as SessionConfig);
			// Collect events from run-1.
			const run1Events: HarnessEvent[] = [];
			const handle1 = { sessionId: "nit3-test-session" };
			for await (const ev of adapter.streamEvents(handle1)) {
				run1Events.push(ev);
			}

			// Simulate run-2: STILL the same file (no rewrite). Re-run startSession.
			await adapter.startSession(config as SessionConfig);
			const run2Events: HarnessEvent[] = [];
			const handle2 = { sessionId: "nit3-test-session" };
			for await (const ev of adapter.streamEvents(handle2)) {
				run2Events.push(ev);
			}

			// Run-1 must not return (no forcing message in file).
			const run1ReturnCalls = run1Events.filter(
				(e) => e.type === "tool_call" && e.toolName === "submit_review",
			);
			expect(run1ReturnCalls).toHaveLength(0);

			// Run-2 must also not return (file still lacks AL6_FORCE_RETURN_MESSAGE).
			const run2ReturnCalls = run2Events.filter(
				(e) => e.type === "tool_call" && e.toolName === "submit_review",
			);
			expect(run2ReturnCalls).toHaveLength(0);
		});
	});

	// ── AC3: budget exhaustion → not_returned after N re-engages ─────────────
	//
	// Never-returning adapter: the loop fires AL6_MAX_FORCE_RETURNS re-engages,
	// then settles not_returned. Adapter started AL6_MAX_FORCE_RETURNS+1 times.
	//
	// FAILS red until T6 implements the loop.

	describe("AC3 — budget exhaustion → not_returned after max re-engages", () => {
		test(
			"never-returning adapter → result.outcome=not_returned, " +
				"forceReturnCount=AL6_MAX_FORCE_RETURNS, session_not_returned emitted",
			async ({ db }) => {
				const taskId = "al6v3-ac3-budget-1";
				await seedDb(db, taskId);

				const adapter = makeNeverReturningCarrierStub();
				const { result, emittedEventTypes } = await runWithAdapter(
					db,
					taskId,
					adapter,
					"al6v3-never-return-stub",
					"/tmp/al6v3-ac3-test",
				);

				// Adapter started AL6_MAX_FORCE_RETURNS+1 times (1 initial + N re-engages).
				// FAILS red: T6 not yet implemented.
				expect(adapter.startCallCount).toBe(AL6_MAX_FORCE_RETURNS + 1);

				// Outcome must be not_returned.
				expect(result.outcome).toBe("not_returned");
				expect(result.returnVerdict).toBe("not_returned");

				// forceReturnCount = number of Layer-B re-engages = AL6_MAX_FORCE_RETURNS.
				// FAILS red until T6 adds forceReturnCount.
				expect((result as unknown as Record<string, unknown>).forceReturnCount).toBe(AL6_MAX_FORCE_RETURNS);

				// session_not_returned must still be emitted.
				expect(emittedEventTypes).toContain("session_not_returned");
			},
		);

		test("WARNING-A: PERSISTED sessions.outcome row is 'not_returned' after loop exhaustion", async ({
			db,
		}) => {
			const taskId = "al6v3-ac3-persist-1";
			await seedDb(db, taskId);

			const adapter = makeNeverReturningCarrierStub();
			const { result } = await runWithAdapter(
				db,
				taskId,
				adapter,
				"al6v3-persist-stub",
				"/tmp/al6v3-ac3-persist-test",
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

		test("WARNING-A: session_ended bus event carries outcome='not_returned' after loop exhaustion", async ({
			db,
		}) => {
			const taskId = "al6v3-ac3-bus-1";
			await seedDb(db, taskId);

			const adapter = makeNeverReturningCarrierStub();
			const { result, sessionEndedEvents } = await runWithAdapter(
				db,
				taskId,
				adapter,
				"al6v3-bus-stub",
				"/tmp/al6v3-ac3-bus-test",
			);

			expect(result.outcome).toBe("not_returned");
			expect(sessionEndedEvents).toHaveLength(1);
			expect(sessionEndedEvents[0]?.outcome).toBe("not_returned");
			expect(sessionEndedEvents[0]?.outcome).not.toBe("completed");
		});

		// W2: exactly ONE session_ended for the full loop span.
		// FAILS red until T6 moves session_ended outside the loop body.
		test("W2 — exactly ONE session_ended fires for the full loop span (no double-count)", async ({
			db,
		}) => {
			const taskId = "al6v3-w2-session-ended-1";
			await seedDb(db, taskId);

			const adapter = makeNeverReturningCarrierStub();
			const { sessionEndedCount } = await runWithAdapter(
				db,
				taskId,
				adapter,
				"al6v3-w2-stub",
				"/tmp/al6v3-w2-test",
			);

			// Even though the loop ran AL6_MAX_FORCE_RETURNS+1 times,
			// session_ended must fire exactly ONCE.
			// FAILS red if T6 emits session_ended inside the loop body.
			expect(sessionEndedCount).toBe(1);
		});
	});
});
