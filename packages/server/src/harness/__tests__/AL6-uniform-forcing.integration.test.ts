/**
 * AL6 v4-final — RE-AUTHORED from v3.
 *
 * v3 tested "uniform forcing" via the universal re-prompt loop (hasNativeReturnHook +
 * canReEngage + sandbox-file rewrite). v4-final: "uniform" means every adapter has a
 * PROVISIONED enforcement channel, not a universal loop.
 *
 * This file now tests:
 *   AC4: per-adapter returnEnforcement channel is declared and non-undefined (type forced)
 *   AC4 (mock channel override): WARN-F4 — mock adapter supports channel override for
 *         multi-channel testing (constructor arg or setter)
 *   AC5: mid-turn non-terminal tools unaffected
 *   v4 v1-regression guard: no-return → never outcome="completed"
 *   provisionReturnHook per-channel dispatch: one adapter per channel, asserts the right
 *         artifact is written (or no-op) for each declared channel.
 *
 * What was deleted from v3:
 *   - makeSandboxCarrierMock (reads AGENTS.md) — v3 mechanism dead
 *   - makeLayerAMock (getForceReturnCount Layer-A) — dead in v4
 *   - "Unified forceReturnCount = loopCount + nativeCount" — dead (no loop in v4)
 *   - hasNativeReturnHook / canReEngage assertions — removed from interface
 *
 * Tests FAIL (red) until:
 *   - returnEnforcement field on HarnessCapabilities (Task 1)
 *   - mock adapter supports channel override (WARN-F4 / Task 1)
 *   - provisionReturnHook dispatches per channel (Task 4)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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
// FAILS red: module does not exist yet
import type { ReturnEnforcementChannel } from "../../harness/provision-return-hook.js";
import { provisionReturnHook } from "../../harness/provision-return-hook.js";
import { provisionSession } from "../../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";

// ── Constants ────────────────────────────────────────────────────────────────

const TEST_TEAM_ID = "al6v4-unif-team";
const TEST_AGENT_ID = "al6v4-unif-agent";
const TEST_BET_ID = "al6v4-unif-bet";

// ── DB seed ───────────────────────────────────────────────────────────────────

async function seedDb(
	db: Parameters<typeof provisionSession>[0]["db"],
	taskId: string,
): Promise<void> {
	await db.insert(teams).values({
		id: TEST_TEAM_ID,
		name: "AL6 v4 Uniform Team",
		phase: "build",
		createdAt: new Date().toISOString(),
	});
	await db.insert(teamMembers).values({
		id: "al6v4-unif-tm",
		teamId: TEST_TEAM_ID,
		capacity: 3,
		activeBets: 0,
		formedAt: new Date().toISOString(),
	});
	await db.insert(users).values({
		id: TEST_AGENT_ID,
		name: "AL6 v4 Uniform Agent",
		role: "builder",
		status: "idle",
		teamId: "al6v4-unif-tm",
		createdAt: new Date().toISOString(),
		harnessType: "builtin",
		modelProvider: "openrouter",
		modelId: "deepseek/deepseek-chat-v3-0324:nitro",
	});
	await db.insert(bets).values({
		id: TEST_BET_ID,
		teamId: TEST_TEAM_ID,
		description: "AL6 v4 Uniform Test Bet",
		appetite: "small",
		status: "active",
		createdAt: new Date().toISOString(),
	});
	await db.insert(tasks).values({
		id: taskId,
		betId: TEST_BET_ID,
		teamId: TEST_TEAM_ID,
		title: "AL6 v4 Uniform Test Task",
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

// ── v4 mock adapter with channel override (WARN-F4) ──────────────────────────
//
// WARN-F4: the mock adapter's returnEnforcement is non-optional.
// But to test multiple channels through one mock class, it must support a
// constructor-arg or setter override.
// FAILS red until mock-harness-adapter.ts exposes a channel override mechanism.

function makeV4MockAdapter(
	channel: ReturnEnforcementChannel,
	events: HarnessEvent[],
): HarnessAdapter {
	return {
		async startSession(config: SessionConfig): Promise<SessionHandle> {
			return { sessionId: config.sessionId };
		},
		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
			for (const ev of events) {
				yield ev;
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
			// FAILS red: returnEnforcement field not yet on HarnessCapabilities
			return {
				preCompactionTrigger: false,
				subAgents: false,
				modelProviders: ["anthropic", "openrouter"],
				mcpSupport: false,
				returnEnforcement: channel,
			} as unknown as HarnessCapabilities;
		},
	};
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
		name: `AL6 v4 Uniform (${adapterName})`,
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

	return { result, emittedEventTypes };
}

// ── Lifecycle setup ───────────────────────────────────────────────────────────

describe("AL6 v4-final — uniform enforcement (re-authored from v3)", () => {
	let sandboxBasePath: string;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "al6v4-unif-test-key");
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "al6v4-unif-cred-key-32chars!!");
		vi.stubEnv("HYPERIDLE_PROFILE", "laptop");
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "al6v4-unif-"));
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		vi.unstubAllEnvs();
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
	});

	// ── WARN-F4: mock adapter channel override ────────────────────────────
	//
	// The mock adapter's returnEnforcement is non-optional but tests need to
	// exercise multiple channels through one adapter class. The green phase must
	// add a constructor arg or setter.

	describe("WARN-F4: mock adapter supports channel override", () => {
		test("MockHarnessAdapter accepts a channel override for settings-claude", async () => {
			// FAILS red: MockHarnessAdapter doesn't support channel override yet.
			// After Task 1, the mock must expose a constructor/setter for channel.
			const { MockHarnessAdapter } = await import("@hyperidle/shared");

			// This must compile with a channel override.
			// The green phase chooses the exact API (constructor arg, withChannel(), etc.)
			let adapter: HarnessAdapter;
			try {
				// Try constructor override first
				adapter = new MockHarnessAdapter({ returnEnforcement: "settings-claude" });
			} catch {
				// If constructor doesn't support it, check for a withChannel method
				adapter = new MockHarnessAdapter();
				if ("withReturnEnforcement" in adapter) {
					(
						adapter as unknown as { withReturnEnforcement: (c: string) => void }
					).withReturnEnforcement("settings-claude");
				}
			}

			const caps = adapter.getCapabilities() as unknown as Record<string, unknown>;
			// FAILS red: no channel override implemented yet
			expect(caps.returnEnforcement).toBe("settings-claude");
		});

		test("MockHarnessAdapter default channel is declared (non-undefined)", async () => {
			const { MockHarnessAdapter } = await import("@hyperidle/shared");
			const adapter = new MockHarnessAdapter();
			const caps = adapter.getCapabilities() as unknown as Record<string, unknown>;

			// Non-optional: must have a declared default.
			// FAILS red until Task 1 adds returnEnforcement to MockHarnessAdapter.
			expect(caps.returnEnforcement).toBeDefined();
		});
	});

	// ── AC4: per-adapter returnEnforcement channel + provisionReturnHook dispatch ──

	describe("AC4: provisionReturnHook dispatches correctly per channel", () => {
		const testCases: Array<{
			channel: ReturnEnforcementChannel;
			expectsFile: boolean;
			filePath?: string;
		}> = [
			{ channel: "settings-claude", expectsFile: true, filePath: ".claude/settings.json" },
			{ channel: "settings-codex", expectsFile: true, filePath: ".codex/hooks.json" },
			{
				channel: "process-reengage",
				expectsFile: true,
				filePath: ".opencode/plugins/return-signal.ts",
			},
			{ channel: "sdk-inprocess", expectsFile: false },
			{ channel: "builtin-loop", expectsFile: false },
			{ channel: "none", expectsFile: false },
			{ channel: "soft-continue", expectsFile: false },
		];

		for (const tc of testCases) {
			test(`channel="${tc.channel}": ${tc.expectsFile ? `writes ${tc.filePath}` : "no file (no-op)"}`, async () => {
				const channelSandbox = fs.mkdtempSync(
					path.join(os.tmpdir(), `al6v4-ch-${tc.channel.replace(/-/g, "")}-`),
				);
				try {
					// FAILS red: provisionReturnHook does not exist yet
					await provisionReturnHook({
						sandboxPath: channelSandbox,
						channel: tc.channel,
						bridgeToken: "test-token-12345",
						mcpUrl: "http://localhost:3001/api/mcp/test-token-12345",
						forceBudget: 2,
					});

					if (tc.expectsFile && tc.filePath) {
						const expectedPath = path.join(channelSandbox, tc.filePath);
						expect(fs.existsSync(expectedPath)).toBe(true);
					} else {
						// No file should be written for in-process channels
						expect(fs.existsSync(path.join(channelSandbox, ".claude"))).toBe(false);
						expect(fs.existsSync(path.join(channelSandbox, ".codex"))).toBe(false);
						expect(fs.existsSync(path.join(channelSandbox, ".opencode"))).toBe(false);
					}
				} finally {
					fs.rmSync(channelSandbox, { recursive: true, force: true });
				}
			});
		}
	});

	// ── AC4 v1 regression guard: never completed-without-return ──────────
	//
	// Kept from v3 (still valid in v4).

	describe("AC4 — v1 regression guard: never completed-without-return", () => {
		test("no-return adapter with builtin-loop channel → outcome=not_returned, never completed", async ({
			db,
		}) => {
			const taskId = "al6v4-ac4-v1guard-1";
			await seedDb(db, taskId);

			const adapter = makeV4MockAdapter("builtin-loop", [
				{ type: "tool_call", toolName: "write_memory", args: {} },
				{ type: "completion", text: "No return ever." },
			]);

			const { result } = await runWithAdapter(
				db,
				taskId,
				adapter,
				"al6v4-v1guard-stub",
				sandboxBasePath,
			);

			// v1 regression guard: NEVER "completed" without a return.
			expect(result.outcome).not.toBe("completed");
			expect(result.outcome).toBe("not_returned");
		});
	});

	// ── AC5: mid-turn non-terminal tools are unaffected ──────────────────
	//
	// Kept from v3 (still valid in v4).

	describe("AC5 — mid-turn non-terminal tools are unaffected", () => {
		test("read_inbox + write_memory mid-turn, then submit_review → completed, no forcing", async ({
			db,
		}) => {
			const taskId = "al6v4-ac5-unif-1";
			await seedDb(db, taskId);

			const eventBus = new EventBus();
			const toolCallsRecorded: string[] = [];
			eventBus.on("tool_call_recorded", (ev) => {
				toolCallsRecorded.push(ev.toolName);
			});

			const midTurnAdapter = makeV4MockAdapter("builtin-loop", [
				{ type: "tool_call", toolName: "read_inbox", args: {} },
				{ type: "tool_call", toolName: "write_memory", args: { key: "k", value: "v" } },
				{ type: "tool_call", toolName: "submit_review", args: { message: "Done" } },
				{ type: "completion", text: "Done." },
			]);

			const pool = new AdapterPool();
			pool.register("al6v4-ac5-stub", midTurnAdapter, {
				name: "AL6 v4 AC5 Stub",
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

			expect(toolCallsRecorded).toContain("read_inbox");
			expect(toolCallsRecorded).toContain("write_memory");
			expect(toolCallsRecorded).toContain("submit_review");

			expect(result.outcome).toBe("completed");
			expect(result.returnVerdict).toBe("returned");
		});
	});
});
