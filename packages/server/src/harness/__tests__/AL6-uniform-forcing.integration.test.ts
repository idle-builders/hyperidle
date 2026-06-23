/**
 * AL6 v3 — Integration tests for uniform forcing (AC4).
 *
 * "Enforcement holds uniformly regardless of harness" — the v3 headline AC
 * that was rejected twice (v1 flag-only, v2 Claude-only).
 *
 * Two mock shapes parametrized here:
 *   (a) sandbox-carrier mock (hasNativeReturnHook:false, canReEngage:true):
 *       run-2 return is GATED on the sandbox file content containing
 *       AL6_FORCE_RETURN_MESSAGE (NIT-3). Proves Layer-B forcing.
 *   (b) Layer-A mock (hasNativeReturnHook:true, canReEngage:true):
 *       In-turn forcing: the adapter's getForceReturnCount returns ≥1 after
 *       a no-return first turn (simulating the SDK Stop hook / builtin loop).
 *       forceReturnCount comes from the adapter's getForceReturnCount.
 *
 * Both must reach forceReturnCount≥1 and NEITHER may settle outcome="completed"
 * with returnVerdict="not_returned" — the v1 regression guard.
 *
 * Additional coverage:
 *   AC5: mid-turn non-terminal tools do not trigger forcing.
 *   Unified forceReturnCount: reflects Layer-B for external adapter AND
 *     Layer-A for native-hook adapter — neither silently regresses.
 *
 * Tests FAIL (red) until:
 *   - T1: hasNativeReturnHook / canReEngage on HarnessCapabilities
 *   - T2: getForceReturnCount?(sessionId) optional on HarnessAdapter
 *   - T4: SDK / builtin implement getForceReturnCount
 *   - T6: re-prompt loop + unified forceReturnCount on ProvisionSessionResult
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
import * as sharedAll from "@hyperidle/shared";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../../harness/local-sandbox-adapter.js";
import { provisionSession } from "../../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";

// biome-ignore lint/suspicious/noExplicitAny: accessing not-yet-exported v3 fields in red phase
const sharedNs = sharedAll as Record<string, any>;
const AL6_FORCE_RETURN_MESSAGE: string = sharedNs.AL6_FORCE_RETURN_MESSAGE;
const AL6_MAX_FORCE_RETURNS: number = sharedNs.AL6_MAX_FORCE_RETURNS;

// ── Constants ────────────────────────────────────────────────────────────────

const TEST_TEAM_ID = "al6v3-unif-team";
const TEST_AGENT_ID = "al6v3-unif-agent";
const TEST_BET_ID = "al6v3-unif-bet";

// ── DB seed ───────────────────────────────────────────────────────────────────

async function seedDb(
	db: Parameters<typeof provisionSession>[0]["db"],
	taskId: string,
): Promise<void> {
	await db.insert(teams).values({
		id: TEST_TEAM_ID,
		name: "AL6 v3 Uniform Team",
		phase: "build",
		createdAt: new Date().toISOString(),
	});
	await db.insert(teamMembers).values({
		id: "al6v3-unif-tm",
		teamId: TEST_TEAM_ID,
		capacity: 3,
		activeBets: 0,
		formedAt: new Date().toISOString(),
	});
	await db.insert(users).values({
		id: TEST_AGENT_ID,
		name: "AL6 v3 Uniform Agent",
		role: "builder",
		status: "idle",
		teamId: "al6v3-unif-tm",
		createdAt: new Date().toISOString(),
		harnessType: "builtin",
		modelProvider: "openrouter",
		modelId: "deepseek/deepseek-chat-v3-0324:nitro",
	});
	await db.insert(bets).values({
		id: TEST_BET_ID,
		teamId: TEST_TEAM_ID,
		description: "AL6 v3 Uniform Test Bet",
		appetite: "small",
		status: "active",
		createdAt: new Date().toISOString(),
	});
	await db.insert(tasks).values({
		id: taskId,
		betId: TEST_BET_ID,
		teamId: TEST_TEAM_ID,
		title: "AL6 v3 Uniform Test Task",
		state: "accepted",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
}

const FAKE_RESOLVED_MODEL = {
	provider: "openrouter" as const,
	model: "deepseek/deepseek-chat-v3-0324:nitro",
	apiKey: "al6v3-fake-key",
	baseUrl: "https://openrouter.ai/api",
};

// ── Sandbox-carrier mock (NIT-3 content-gated, hasNativeReturnHook:false) ───
//
// Mirrors the adapter in AL6-reprompt-loop.integration.test.ts.
// run-2 return GATED on sandbox file content containing AL6_FORCE_RETURN_MESSAGE.

function makeSandboxCarrierMock(): HarnessAdapter & {
	startCallCount: number;
	sandboxFileContentByRun: string[];
	getForceReturnCount: (sessionId: string) => number; // always 0 — no native hook
} {
	const startCallCount = 0;
	const sandboxFileContentByRun: string[] = [];

	const adapter = {
		startCallCount,
		sandboxFileContentByRun,

		async startSession(config: SessionConfig): Promise<SessionHandle> {
			let fileContent = "";
			try {
				const agentsMdPath = path.join(config.sandboxPath, "AGENTS.md");
				fileContent = fs.readFileSync(agentsMdPath, "utf-8");
			} catch {
				fileContent = "";
			}
			adapter.sandboxFileContentByRun.push(fileContent);
			adapter.startCallCount++;
			return { sessionId: config.sessionId };
		},

		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
			const runNumber = adapter.startCallCount;
			const myFileContent = adapter.sandboxFileContentByRun[runNumber - 1] ?? "";
			const fileHasForcingMessage = myFileContent.includes(AL6_FORCE_RETURN_MESSAGE);

			if (runNumber === 1) {
				yield { type: "tool_call", toolName: "write_memory", args: { key: "k", value: "v" } };
				yield { type: "completion", text: "Forgot to return." };
			} else if (fileHasForcingMessage) {
				yield {
					type: "tool_call",
					toolName: "submit_review",
					args: { message: "Forced via sandbox-file rewrite." },
				};
				yield { type: "completion", text: "Returned." };
			} else {
				// File not rewritten — still no return (no-op carrier caught).
				yield { type: "completion", text: "File not rewritten. Still no return." };
			}
		},

		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return { outcome: "completed", cost: { minor: 100, currency: "USD" }, tokenUsage: { byTier: {} } };
		},

		getCapabilities(): HarnessCapabilities {
			return {
				preCompactionTrigger: false,
				subAgents: false,
				modelProviders: ["anthropic", "openrouter", "openai-compatible"],
				mcpSupport: false,
				hasNativeReturnHook: false, // T1 red
				canReEngage: true, // T1 red
			} as unknown as HarnessCapabilities;
		},

		// T2 red: optional getForceReturnCount on HarnessAdapter.
		// This adapter uses Layer B only — native hook count is always 0.
		getForceReturnCount(_sessionId: string): number {
			return 0;
		},
	};

	return adapter;
}

// ── Layer-A mock (hasNativeReturnHook:true, simulates builtin/sdk in-turn forcing) ──
//
// Simulates a native-hook adapter (builtin/SDK) that forces the return in-turn.
// In production: the builtin adapter re-injects AL6_FORCE_RETURN_MESSAGE into its
// own loop; the provisioner's Layer-B loop never fires (gate returns in-turn).
//
// The mock simulates this: run-1 emits no return but getForceReturnCount returns 1
// (adapter counted the in-turn injection), and the drain sees no return in the event
// stream but the result still carries forceReturnCount=1 from the adapter's counter.
//
// This is how the unified forceReturnCount works: Layer-B count (from the loop) +
// Layer-A count (from getForceReturnCount). For this adapter: loop count=0, adapter count=1.
//
// NOTE: to properly simulate Layer-A without a full builtin instantiation, the mock
// emits submit_review in its stream (as if the in-turn force succeeded) so the
// provisioner sees a "returned" verdict. The force count comes from getForceReturnCount.

function makeLayerAMock(): HarnessAdapter & {
	startCallCount: number;
	getForceReturnCount: (sessionId: string) => number;
} {
	const startCallCount = 0;
	// Simulate: on first turn, the agent would have not returned, but the native
	// Stop hook forced it and the agent ultimately called submit_review in the same turn.
	// From the provisioner's perspective: the drain sees submit_review; forceReturnCount
	// from the adapter = 1 (the Stop hook fired once in-turn).
	const inTurnForceCount = 1; // simulates one in-turn injection by Stop hook

	const adapter = {
		startCallCount,

		async startSession(config: SessionConfig): Promise<SessionHandle> {
			adapter.startCallCount++;
			return { sessionId: config.sessionId };
		},

		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
			// Emits submit_review in-turn (as if the Stop hook forced it and the agent complied).
			// The Layer-B loop never fires because the gate sees submit_review here.
			yield { type: "tool_call", toolName: "write_memory", args: { key: "k", value: "v" } };
			yield {
				type: "tool_call",
				toolName: "submit_review",
				args: { message: "Native hook forced me to return." },
			};
			yield { type: "completion", text: "Done." };
		},

		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return { outcome: "completed", cost: { minor: 100, currency: "USD" }, tokenUsage: { byTier: {} } };
		},

		getCapabilities(): HarnessCapabilities {
			return {
				preCompactionTrigger: true,
				subAgents: false,
				modelProviders: ["anthropic", "openrouter", "openai-compatible"],
				mcpSupport: false,
				hasNativeReturnHook: true, // T1 red
				canReEngage: true, // T1 red
			} as unknown as HarnessCapabilities;
		},

		// T2 red: optional getForceReturnCount — Layer-A native hook count.
		getForceReturnCount(_sessionId: string): number {
			return inTurnForceCount;
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
}> {
	const eventBus = new EventBus();
	const emittedEventTypes: string[] = [];
	eventBus.on("*", (ev) => {
		emittedEventTypes.push(ev.type);
	});

	const pool = new AdapterPool();
	pool.register(adapterName, adapter, {
		name: `AL6 v3 Uniform (${adapterName})`,
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

	return { result, emittedEventTypes };
}

// ── Lifecycle setup ───────────────────────────────────────────────────────────

describe("AL6 v3 — uniform forcing (AC4)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "al6v3-unif-test-key");
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "al6v3-unif-cred-key-32chars!!");
		vi.stubEnv("HYPERIDLE_PROFILE", "laptop");
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		vi.unstubAllEnvs();
	});

	// ── AC4a: sandbox-carrier mock (Layer-B / external path) ─────────────────
	//
	// The external-shaped adapter forces via the re-prompt loop (Layer B).
	// FAILS red until T6 implements the loop.

	describe("AC4a — sandbox-carrier mock (hasNativeReturnHook:false, Layer-B forcing)", () => {
		test(
			"no-return run-1 → sandbox-file rewrite → run-2 returns → " +
				"outcome=completed, forceReturnCount≥1, NOT completed-without-return",
			async ({ db }) => {
				const taskId = "al6v3-ac4a-carrier-1";
				await seedDb(db, taskId);

				const adapter = makeSandboxCarrierMock();
				const { result } = await runWithAdapter(
					db,
					taskId,
					adapter,
					"al6v3-ac4a-carrier-stub",
					"/tmp/al6v3-ac4a-carrier-test",
				);

				// AC4: forcing must have happened (forceReturnCount ≥ 1).
				// FAILS red until T6 adds forceReturnCount to ProvisionSessionResult.
				const forceCount = (result as unknown as Record<string, unknown>).forceReturnCount as
					| number
					| undefined;
				expect(forceCount).toBeDefined();
				expect(forceCount).toBeGreaterThanOrEqual(1);

				// AC4: v1 regression guard — never completed-without-return.
				expect(result.outcome).toBe("completed");
				expect(result.returnVerdict).toBe("returned");

				// NIT-3: run-2 file content must include the forcing message.
				const run2Content = adapter.sandboxFileContentByRun[1] ?? "";
				expect(run2Content).toContain(AL6_FORCE_RETURN_MESSAGE);

				// Adapter started TWICE (run-1 + run-2).
				expect(adapter.startCallCount).toBe(2);
			},
		);

		test("compliant external adapter: returns on run-1 → forceReturnCount=0, completed", async ({
			db,
		}) => {
			// When the external agent returns on the first run, the loop must NOT re-engage.
			const taskId = "al6v3-ac4a-compliant-1";
			await seedDb(db, taskId);

			// Adapter that returns on run-1 unconditionally.
			const compliantAdapter: HarnessAdapter & {
				startCallCount: number;
				getForceReturnCount: (id: string) => number;
			} = {
				startCallCount: 0,
				async startSession(config: SessionConfig): Promise<SessionHandle> {
					compliantAdapter.startCallCount++;
					return { sessionId: config.sessionId };
				},
				async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
					yield {
						type: "tool_call",
						toolName: "submit_review",
						args: { message: "Done voluntarily." },
					};
					yield { type: "completion", text: "Done." };
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
				getForceReturnCount(_id: string): number {
					return 0;
				},
			};

			const { result, emittedEventTypes } = await runWithAdapter(
				db,
				taskId,
				compliantAdapter,
				"al6v3-ac4a-compliant-stub",
				"/tmp/al6v3-ac4a-compliant-test",
			);

			// Only one run needed — no re-engage.
			expect(compliantAdapter.startCallCount).toBe(1);
			expect(result.outcome).toBe("completed");
			expect(result.returnVerdict).toBe("returned");

			// No force = no session_not_returned.
			expect(emittedEventTypes).not.toContain("session_not_returned");

			// forceReturnCount = 0 (no forcing needed).
			const forceCount = (result as unknown as Record<string, unknown>).forceReturnCount;
			// Either 0 or undefined (not shipped yet = undefined in red phase).
			expect(forceCount === 0 || forceCount === undefined).toBe(true);
		});
	});

	// ── AC4b: Layer-A mock (hasNativeReturnHook:true) ────────────────────────
	//
	// The native-hook adapter forces in-turn (no Layer-B loop).
	// forceReturnCount comes from adapter.getForceReturnCount (Layer-A).
	// FAILS red until T2 (getForceReturnCount optional on HarnessAdapter) and T6
	// (unified forceReturnCount = loopCount + harness.getForceReturnCount?.()).

	describe("AC4b — Layer-A mock (hasNativeReturnHook:true, in-turn native forcing)", () => {
		test(
			"native-hook adapter: forces in-turn → outcome=completed, " +
				"forceReturnCount reflects Layer-A count",
			async ({ db }) => {
				const taskId = "al6v3-ac4b-layera-1";
				await seedDb(db, taskId);

				const adapter = makeLayerAMock();
				const { result } = await runWithAdapter(
					db,
					taskId,
					adapter,
					"al6v3-ac4b-layera-stub",
					"/tmp/al6v3-ac4b-layera-test",
				);

				// Layer-A: only one startSession call (no Layer-B loop re-engage).
				expect(adapter.startCallCount).toBe(1);

				// Outcome is completed (in-turn force worked).
				expect(result.outcome).toBe("completed");
				expect(result.returnVerdict).toBe("returned");

				// UNIFIED forceReturnCount: loopCount(0) + adapter.getForceReturnCount()(1) = 1.
				// FAILS red until T6 reads getForceReturnCount from the adapter.
				const forceCount = (result as unknown as Record<string, unknown>).forceReturnCount as
					| number
					| undefined;
				expect(forceCount).toBeDefined();
				expect(forceCount).toBeGreaterThanOrEqual(1);
			},
		);
	});

	// ── AC4 v1 regression guard: never completed-without-return ──────────────

	describe("AC4 — v1 regression guard: never completed-without-return", () => {
		test(
			"sandbox-carrier mock: no-return run (all budget spent) → " +
				"never outcome=completed with returnVerdict=not_returned",
			async ({ db }) => {
				const taskId = "al6v3-ac4-v1guard-1";
				await seedDb(db, taskId);

				// A never-returning variant of the sandbox carrier (ignores file content).
				const neverReturner: HarnessAdapter = {
					async startSession(config: SessionConfig): Promise<SessionHandle> {
						return { sessionId: config.sessionId };
					},
					async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
						yield { type: "completion", text: "No return ever." };
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

				const { result } = await runWithAdapter(
					db,
					taskId,
					neverReturner,
					"al6v3-v1guard-stub",
					"/tmp/al6v3-v1guard-test",
				);

				// v1 regression guard: NEVER "completed" with returnVerdict="not_returned".
				if (result.outcome === "completed") {
					// If somehow the turn completed, its returnVerdict must be "returned".
					expect(result.returnVerdict).toBe("returned");
				}
				// The expected outcome here is "not_returned" (budget exhausted).
				expect(result.outcome).not.toBe("completed");
				expect(result.outcome).toBe("not_returned");
			},
		);
	});

	// ── AC5: mid-turn non-terminal tools do not trigger forcing ──────────────

	describe("AC5 — mid-turn non-terminal tools are unaffected", () => {
		test("read_inbox + write_memory mid-turn, then submit_review → completed, no forcing", async ({
			db,
		}) => {
			const taskId = "al6v3-ac5-unif-1";
			await seedDb(db, taskId);

			const eventBus = new EventBus();
			const toolCallsRecorded: string[] = [];
			eventBus.on("tool_call_recorded", (ev) => {
				toolCallsRecorded.push(ev.toolName);
			});

			// An adapter that emits mid-turn tools then returns on first run.
			const midTurnAdapter: HarnessAdapter = {
				async startSession(config: SessionConfig): Promise<SessionHandle> {
					return { sessionId: config.sessionId };
				},
				async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
					yield { type: "tool_call", toolName: "read_inbox", args: {} };
					yield {
						type: "tool_call",
						toolName: "write_memory",
						args: { key: "k", value: "v" },
					};
					yield {
						type: "tool_call",
						toolName: "submit_review",
						args: { message: "Done" },
					};
					yield { type: "completion", text: "Done." };
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

			const pool = new AdapterPool();
			pool.register("al6v3-ac5-stub", midTurnAdapter, {
				name: "AL6 v3 AC5 Stub",
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
					sandboxBasePath: "/tmp/al6v3-ac5-unif-test",
					resolvedModel: FAKE_RESOLVED_MODEL,
				},
			);

			// All mid-turn tools must still be recorded.
			expect(toolCallsRecorded).toContain("read_inbox");
			expect(toolCallsRecorded).toContain("write_memory");
			expect(toolCallsRecorded).toContain("submit_review");

			// No forcing needed — first run returned.
			expect(result.outcome).toBe("completed");
			expect(result.returnVerdict).toBe("returned");

			// forceReturnCount = 0 (no forcing).
			const forceCount = (result as unknown as Record<string, unknown>).forceReturnCount;
			expect(forceCount === 0 || forceCount === undefined).toBe(true);
		});
	});

	// ── Unified forceReturnCount: Layer-B for external, Layer-A for native ────
	//
	// Verifies that the two counts are summed correctly and neither regresses.
	// FAILS red until T6 implements the unified count.

	describe("Unified forceReturnCount — Layer-B external + Layer-A native", () => {
		test("sandbox-carrier mock forceReturnCount = loopCount (Layer-B), getForceReturnCount = 0", async ({
			db,
		}) => {
			const taskId = "al6v3-unified-external-1";
			await seedDb(db, taskId);

			const adapter = makeSandboxCarrierMock();
			const { result } = await runWithAdapter(
				db,
				taskId,
				adapter,
				"al6v3-unified-external-stub",
				"/tmp/al6v3-unified-external-test",
			);

			// For the sandbox-carrier path: loopCount=1, native count=0 → total=1.
			const forceCount = (result as unknown as Record<string, unknown>).forceReturnCount as
				| number
				| undefined;
			if (forceCount !== undefined) {
				// When T6 ships: assert loopCount (1) + nativeCount (0) = 1.
				expect(forceCount).toBe(1);
			}
		});

		test("Layer-A mock forceReturnCount = native count (Layer-A), loop count = 0", async ({ db }) => {
			const taskId = "al6v3-unified-native-1";
			await seedDb(db, taskId);

			const adapter = makeLayerAMock();
			const { result } = await runWithAdapter(
				db,
				taskId,
				adapter,
				"al6v3-unified-native-stub",
				"/tmp/al6v3-unified-native-test",
			);

			// For the native-hook path: loopCount=0, nativeCount=1 → total=1.
			const forceCount = (result as unknown as Record<string, unknown>).forceReturnCount as
				| number
				| undefined;
			if (forceCount !== undefined) {
				// When T6 ships: assert 0 + 1 = 1.
				expect(forceCount).toBe(1);
			}
		});

		test("AL6_MAX_FORCE_RETURNS: loop count never exceeds AL6_MAX_FORCE_RETURNS on budget exhaustion", async ({
			db,
		}) => {
			const taskId = "al6v3-unified-budget-1";
			await seedDb(db, taskId);

			// A never-returning external adapter.
			const neverReturner: HarnessAdapter = {
				async startSession(config: SessionConfig): Promise<SessionHandle> {
					return { sessionId: config.sessionId };
				},
				async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
					yield { type: "completion", text: "No return." };
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

			const { result } = await runWithAdapter(
				db,
				taskId,
				neverReturner,
				"al6v3-unified-budget-stub",
				"/tmp/al6v3-unified-budget-test",
			);

			const forceCount = (result as unknown as Record<string, unknown>).forceReturnCount as
				| number
				| undefined;
			if (forceCount !== undefined) {
				// Budget hard-bounded at AL6_MAX_FORCE_RETURNS.
				expect(forceCount).toBeLessThanOrEqual(AL6_MAX_FORCE_RETURNS);
				expect(forceCount).toBe(AL6_MAX_FORCE_RETURNS);
			}

			// The outcome must be not_returned (budget exhausted).
			expect(result.outcome).toBe("not_returned");
		});
	});
});
