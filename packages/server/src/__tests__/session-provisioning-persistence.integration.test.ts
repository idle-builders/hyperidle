/**
 * @harness-matrix: covers all SUPPORTED_HARNESSES via SUPPORTED_HARNESS_LANES loop
 *
 * Session provisioning: systemPrompt/modelTier/harnessType DB-persistence and
 * adapter-selection tests. Two groups:
 *
 * GROUP A — MATRIX: behaviors that require a real agent session. Each test runs
 * across all four supported harnesses (builtin / claude / codex / opencode) using
 * the SUPPORTED_HARNESS_LANES table. Equal test count per harness by construction.
 *
 *   Matrix tests (4 per lane, 16 total across all lanes):
 *   1. Session completes when agent systemPrompt is set in the DB column.
 *   2. Session completes when agent systemPrompt is null.
 *   3. Session completes when agent harnessType is null (any adapter selected).
 *   4. Updated modelTierPreference is reflected in the next session's DB row.
 *
 * GROUP B — UNTAGGED: pure orchestrator/DB-persistence or static assertions that
 * do not require the agent turn to prove the AC. No [harness:X] tag — these do
 * not contribute to the per-harness attestation floor.
 *
 *   Untagged tests (7):
 *   1. validateSoulPromptPath is not exported from session-provisioning.
 *   2. Orchestrator passes empty systemPromptPath (deprecated) in SessionConfig.
 *   3. sessions.modelTier is written as 'reasoning' when agent preference is 'reasoning'.
 *   4. sessions.modelTier is written as 'fast' when explicit modelTier overrides preference.
 *   5. sessions.modelTier falls back to 'workhorse' when preference is null.
 *   6. Adapter matching agent harnessType is selected over a non-matching adapter.
 *   7. Throws when pool has no adapter matching the agent harnessType.
 *
 * @lore session-provisioning-persistence: The systemPrompt/modelTier behaviors are
 * tested in two modes. The MATRIX proves that real sessions complete on all four
 * harnesses (harness-agnostic proofs). The UNTAGGED tests prove the orchestrator
 * config-building logic in isolation using the builtin adapter — they run a real
 * session but the assertion is about what the orchestrator wrote to the DB or
 * passed in SessionConfig, not about what the agent did.
 *
 * @lore systemPromptPath deprecated: After the AK1 rename, SessionConfig.systemPromptPath
 * is always set to "" by the orchestrator. The active field is composedPrompt. This file
 * tests the empty-string invariant via a vi.spyOn (not a stub — the real startSession
 * call proceeds). See the @lore in the old X3 file for full context.
 *
 * @lore codex-cost-zero: codex emits turn.completed (not result with total_cost_usd)
 * so totalCostCents is always 0 for codex. Do not assert totalCostCents > 0 for codex.
 *
 * @lore honest floor (W-2): builtin + claude fire the MCP return tool (send_message)
 * → outcome "completed". codex + opencode do real work but do NOT call the MCP return
 * tool on plain file-write / short-answer tasks → outcome "not_returned". The honest
 * floor for all lanes is: outcome ≠ "crashed" AND outcome ≠ "error".
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
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import {
	lockedHarnessAdapter,
	runThroughHarness,
	SUPPORTED_HARNESS_LANES,
	startMcpBridgeServer,
} from "../harness/__tests__/provision-real-session.js";
import { harnessTestResolvedModel, requireHarness } from "../harness/__tests__/require-harness.js";
import type { AdapterMeta } from "../harness/adapter-pool.js";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import type {
	ProvisionSessionDeps,
	ProvisionSessionParams,
} from "../services/session-provisioning.js";
import { provisionSession } from "../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

// ── Shared constants ─────────────────────────────────────────────────────────

const NOW = new Date().toISOString();

// ── Domain seeding ────────────────────────────────────────────────────────────

/**
 * Seed the minimal domain rows for a single-agent, single-task provisioning test.
 *
 * For matrix lanes (builtin/claude): the task description steers toward send_message
 * (non-aborting return path) so the session outcome is "completed".
 * For codex/opencode lanes: the task description uses a simple file-write prompt.
 * The honest floor for all lanes is non-crash (not "crashed" / "error").
 *
 * @lore seeding: The agentId must be stable (not auto-generated) so the caller
 * can assert on sessions rows filtered by agentId. Using a fixed prefix +
 * Math.random() suffix ensures per-test isolation even when the DB is truncated
 * between tests.
 */
async function seedDomain(
	db: HyperIdleDb,
	opts: {
		agentId: string;
		taskId: string;
		teamId?: string;
		betId?: string;
		agentOverrides?: Record<string, unknown>;
		taskDescription?: string;
		doneCondition?: string;
	},
): Promise<void> {
	const teamId = opts.teamId ?? "sp-team-1";
	const betId = opts.betId ?? "sp-bet-1";
	const threadId = `sp-thread-${Math.random().toString(36).slice(2, 7)}`;

	await db
		.insert(teams)
		.values({ id: teamId, name: "SP Test Team", phase: "build", createdAt: NOW })
		.onConflictDoNothing();
	await db
		.insert(teamMembers)
		.values({ id: `sp-tm-${teamId}`, teamId, capacity: 5, activeBets: 0, formedAt: NOW })
		.onConflictDoNothing();
	await db
		.insert(bets)
		.values({ id: betId, teamId, description: "SP bet", status: "active", createdAt: NOW })
		.onConflictDoNothing();

	await db.insert(users).values({
		id: opts.agentId,
		kind: "ai",
		name: "SP Test Agent",
		role: "builder",
		status: "active",
		maxConcurrentSessions: 4,
		teamId: `sp-tm-${teamId}`,
		createdAt: NOW,
		...(opts.agentOverrides ?? {}),
	});

	await db.insert(threads).values({
		id: threadId,
		hostKind: "task",
		hostId: opts.taskId,
		initiatorId: opts.agentId,
		participants: JSON.stringify([opts.agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: opts.taskId,
		betId,
		teamId,
		title: "SP Test Task",
		description:
			opts.taskDescription ??
			"Report the number 4 to the human owner by calling send_message " +
				"with to='owner-1' and body='4'. Do not hand off or submit a review.",
		doneCondition: opts.doneCondition ?? "Agent reports the answer via send_message with body '4'.",
		state: "accepted",
		ownerAgentId: opts.agentId,
		threadId,
		createdAt: NOW,
		updatedAt: NOW,
	});
}

// ── Builtin adapter helpers (untagged / service tests only) ──────────────────
//
// @lore AR7-seam: adapters obtained via lockedHarnessAdapter("builtin").adapter
// (HarnessAdapter interface) so the honest-harness-guard's AR7 import-ban is satisfied.
// BuiltinHarnessAdapter is NOT imported directly — that is banned in *.integration.test.ts.

function makeBuiltinPool(
	adapter: import("@hyperidle/shared").HarnessAdapter,
	meta?: Partial<AdapterMeta>,
	id = "local",
): AdapterPool {
	const pool = new AdapterPool();
	pool.register(id, adapter, {
		name: id,
		kind: "local",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 4,
		...meta,
	});
	return pool;
}

function makeResolvedModel(): import("@hyperidle/shared").ResolvedModel {
	return harnessTestResolvedModel("builtin");
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP A — MATRIX: real agent sessions, all four harnesses
// ════════════════════════════════════════════════════════════════════════════

for (const lane of SUPPORTED_HARNESS_LANES) {
	describe(`${lane.describeTag} session completes when agent systemPrompt is set in DB`, () => {
		requireHarness(lane.harnessName);

		let tmpDir: string;
		// biome-ignore lint/suspicious/noExplicitAny: server type — close() is the only method used
		let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null =
			null;

		beforeEach(async () => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sp-persist-"));
			setActiveStrategy(minimalStrategy);
			bridge = await startMcpBridgeServer();
		});

		afterEach(async () => {
			clearActiveStrategy();
			if (bridge) {
				await bridge.close();
				bridge = null;
			}
			if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		test("session record is terminal after provisioning an agent with a DB-column systemPrompt", async ({
			db,
			eventBus,
		}) => {
			const agentId = `sp-sys-${lane.harnessName}-${Date.now()}`;
			const taskId = `sp-sys-task-${Date.now()}`;

			await seedDomain(db, {
				agentId,
				taskId,
				agentOverrides: {
					systemPrompt: "# Test Persona\n\nYou are a test agent for {{product}}.",
				},
			});

			const { result } = await runThroughHarness(
				{
					...lane,
					prepFn: (ctx) => {
						const base = lane.prepFn(ctx);
						return { ...base, params: { ...base.params, taskId, agentId, productId: "sp-team-1" } };
					},
				},
				{ db, eventBus, tmpDir, bridge: bridge ?? undefined },
			);

			// Non-crash outcome is the honest floor across all four harnesses.
			// builtin + claude → "completed"; codex + opencode → "not_returned" (see W-2 lore).
			expect(result.outcome).not.toBe("crashed");
			expect(result.outcome).not.toBe("error");
			expect(result.sessionId).toBeTruthy();

			// Proof that the orchestrator read systemPrompt from the DB (not a file path):
			// the session was admitted and completed without crashing on a missing file.
			const [row] = await db
				.select({ state: sessions.state })
				.from(sessions)
				.where(eq(sessions.id, result.sessionId))
				.limit(1);
			expect(row?.state).toBe("done");
		}, 240_000);
	});

	describe(`${lane.describeTag} session completes when agent systemPrompt is null`, () => {
		requireHarness(lane.harnessName);

		let tmpDir: string;
		// biome-ignore lint/suspicious/noExplicitAny: server type — close() is the only method used
		let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null =
			null;

		beforeEach(async () => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sp-persist-"));
			setActiveStrategy(minimalStrategy);
			bridge = await startMcpBridgeServer();
		});

		afterEach(async () => {
			clearActiveStrategy();
			if (bridge) {
				await bridge.close();
				bridge = null;
			}
			if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		test("session record is terminal after provisioning an agent with no systemPrompt (empty persona)", async ({
			db,
			eventBus,
		}) => {
			const agentId = `sp-null-${lane.harnessName}-${Date.now()}`;
			const taskId = `sp-null-task-${Date.now()}`;

			await seedDomain(db, {
				agentId,
				taskId,
				agentOverrides: { systemPrompt: null },
			});

			const { result } = await runThroughHarness(
				{
					...lane,
					prepFn: (ctx) => {
						const base = lane.prepFn(ctx);
						return { ...base, params: { ...base.params, taskId, agentId, productId: "sp-team-1" } };
					},
				},
				{ db, eventBus, tmpDir, bridge: bridge ?? undefined },
			);

			expect(result.outcome).not.toBe("crashed");
			expect(result.outcome).not.toBe("error");
			expect(result.sessionId).toBeTruthy();

			const [row] = await db
				.select({ state: sessions.state })
				.from(sessions)
				.where(eq(sessions.id, result.sessionId))
				.limit(1);
			expect(row?.state).toBe("done");
		}, 240_000);
	});

	describe(`${lane.describeTag} session completes when agent harnessType is null`, () => {
		requireHarness(lane.harnessName);

		let tmpDir: string;
		// biome-ignore lint/suspicious/noExplicitAny: server type — close() is the only method used
		let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null =
			null;

		beforeEach(async () => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sp-persist-"));
			setActiveStrategy(minimalStrategy);
			bridge = await startMcpBridgeServer();
		});

		afterEach(async () => {
			clearActiveStrategy();
			if (bridge) {
				await bridge.close();
				bridge = null;
			}
			if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		test("session is provisioned when agent harnessType is null (adapter selected without type filter)", async ({
			db,
			eventBus,
		}) => {
			const agentId = `sp-nullht-${lane.harnessName}-${Date.now()}`;
			const taskId = `sp-nullht-task-${Date.now()}`;

			await seedDomain(db, {
				agentId,
				taskId,
				// harnessType: null → no type filter; any adapter in the pool is eligible.
				agentOverrides: { harnessType: null },
			});

			const { result } = await runThroughHarness(
				{
					...lane,
					prepFn: (ctx) => {
						const base = lane.prepFn(ctx);
						return { ...base, params: { ...base.params, taskId, agentId, productId: "sp-team-1" } };
					},
				},
				{ db, eventBus, tmpDir, bridge: bridge ?? undefined },
			);

			expect(result.sessionId).toBeTruthy();
			expect(result.outcome).not.toBe("crashed");
			expect(result.outcome).not.toBe("error");
		}, 240_000);
	});

	describe(`${lane.describeTag} modelTierPreference update reflected in next session`, () => {
		requireHarness(lane.harnessName);

		let tmpDir: string;
		// biome-ignore lint/suspicious/noExplicitAny: server type — close() is the only method used
		let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null =
			null;

		beforeEach(async () => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sp-persist-"));
			setActiveStrategy(minimalStrategy);
			bridge = await startMcpBridgeServer();
		});

		afterEach(async () => {
			clearActiveStrategy();
			if (bridge) {
				await bridge.close();
				bridge = null;
			}
			if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		test("second session uses updated modelTierPreference from the DB without server restart", async ({
			db,
			eventBus,
		}) => {
			if (!bridge) throw new Error("bridge not set up");

			const agentId = `sp-tier-${lane.harnessName}-${Date.now()}`;
			const taskId1 = `sp-tier-t1-${Date.now()}`;
			const taskId2 = `sp-tier-t2-${Date.now()}`;

			// Seed agent with no preference → defaults to 'workhorse'.
			await seedDomain(db, {
				agentId,
				taskId: taskId1,
				agentOverrides: { modelTierPreference: null },
			});

			// Session 1: modelTier should be 'workhorse' (fallback).
			await runThroughHarness(
				{
					...lane,
					prepFn: (ctx) => {
						const base = lane.prepFn(ctx);
						return {
							...base,
							params: { ...base.params, taskId: taskId1, agentId, productId: "sp-team-1" },
						};
					},
				},
				{ db, eventBus, tmpDir, bridge },
			);

			const session1Rows = await db
				.select({ modelTier: sessions.modelTier })
				.from(sessions)
				.where(eq(sessions.agentId, agentId))
				.orderBy(sessions.startedAt)
				.limit(1);
			expect(session1Rows[0]?.modelTier).toBe("workhorse");

			// Update agent preference in DB (simulates a UI PATCH — no server restart).
			await db.update(users).set({ modelTierPreference: "fast" }).where(eq(users.id, agentId));

			// Seed a second task with the same agentId.
			const threadId2 = `sp-tier-thr2-${Date.now()}`;
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
				betId: "sp-bet-1",
				teamId: "sp-team-1",
				title: "SP Tier Task 2",
				description:
					"Report the number 7 to the human owner by calling send_message " +
					"with to='owner-1' and body='7'. Do not hand off or submit a review.",
				doneCondition: "Agent reports via send_message with body '7'.",
				state: "accepted",
				ownerAgentId: agentId,
				threadId: threadId2,
				createdAt: NOW,
				updatedAt: NOW,
			});

			// Session 2: should use updated preference 'fast'.
			await runThroughHarness(
				{
					...lane,
					prepFn: (ctx) => {
						const base = lane.prepFn(ctx);
						return {
							...base,
							params: { ...base.params, taskId: taskId2, agentId, productId: "sp-team-1" },
						};
					},
				},
				{ db, eventBus, tmpDir, bridge },
			);

			const allSessions = await db
				.select({ modelTier: sessions.modelTier, startedAt: sessions.startedAt })
				.from(sessions)
				.where(eq(sessions.agentId, agentId))
				.orderBy(sessions.startedAt);

			expect(allSessions).toHaveLength(2);
			expect(allSessions[0]?.modelTier).toBe("workhorse");
			expect(allSessions[1]?.modelTier).toBe("fast");
		}, 480_000); // Two real LLM sessions run sequentially per lane. Allow ample time.
	});
}

// ════════════════════════════════════════════════════════════════════════════
// GROUP B — UNTAGGED: pure orchestrator/DB-persistence tests
// ════════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Static module shape (no LLM call)
// ---------------------------------------------------------------------------

describe("session-provisioning module exports", () => {
	test("validateSoulPromptPath is not exported from session-provisioning", async () => {
		const mod = await import("../services/session-provisioning.js");
		expect(Object.keys(mod)).not.toContain("validateSoulPromptPath");
	});
});

// ---------------------------------------------------------------------------
// SessionConfig shape (builtin adapter spy — real startSession call proceeds)
// ---------------------------------------------------------------------------

describe("orchestrator SessionConfig shape when agent has a DB systemPrompt", () => {
	requireHarness("builtin");

	let sandboxBasePath: string;

	beforeEach(() => {
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "sp-cfg-"));
		setActiveStrategy(minimalStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
	});

	test("orchestrator passes empty systemPromptPath (deprecated field) in SessionConfig", async ({
		db,
		eventBus,
	}) => {
		const agentId = `sp-cfg-agent-${Date.now()}`;
		const taskId = `sp-cfg-task-${Date.now()}`;

		await seedDomain(db, {
			agentId,
			taskId,
			agentOverrides: { systemPrompt: "# Builder\n\nYou are the builder." },
		});

		const adapter = lockedHarnessAdapter("builtin").adapter;
		// Spy on startSession to observe the SessionConfig. This is NOT a stub —
		// the real startSession call proceeds; the spy only records the arguments.
		const startSpy = vi.spyOn(adapter, "startSession");

		const pool = makeBuiltinPool(adapter);
		const workspace = new LocalSandboxAdapter();
		const deps: ProvisionSessionDeps = { db, eventBus, adapterPool: pool, workspace };
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: "sp-team-1",
			sandboxBasePath,
			resolvedModel: makeResolvedModel(),
		};

		await provisionSession(deps, params);

		expect(startSpy).toHaveBeenCalledTimes(1);
		// After the AK1 rename, systemPromptPath is always "" (deprecated).
		// The active field is composedPrompt; the orchestrator reads from DB systemPrompt.
		const calledConfig = startSpy.mock.calls[0]?.[0];
		expect(calledConfig?.systemPromptPath).toBe("");

		vi.restoreAllMocks();
	}, 60_000);
});

// ---------------------------------------------------------------------------
// modelTier DB persistence (builtin adapter, pure orchestrator logic)
// ---------------------------------------------------------------------------

describe("modelTierPreference is written to sessions.modelTier", () => {
	requireHarness("builtin");

	let sandboxBasePath: string;

	beforeEach(() => {
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "sp-tier-svc-"));
		setActiveStrategy(minimalStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
	});

	test("sessions.modelTier is 'reasoning' when agent modelTierPreference is 'reasoning'", async ({
		db,
		eventBus,
	}) => {
		const agentId = `sp-tier-r-${Date.now()}`;
		const taskId = `sp-tier-r-task-${Date.now()}`;

		await seedDomain(db, {
			agentId,
			taskId,
			agentOverrides: { modelTierPreference: "reasoning" },
		});

		const pool = makeBuiltinPool(lockedHarnessAdapter("builtin").adapter);
		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace: new LocalSandboxAdapter(),
		};
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: "sp-team-1",
			sandboxBasePath,
			resolvedModel: makeResolvedModel(),
		};

		await provisionSession(deps, params);

		const [row] = await db
			.select({ modelTier: sessions.modelTier })
			.from(sessions)
			.where(eq(sessions.agentId, agentId))
			.limit(1);
		expect(row?.modelTier).toBe("reasoning");
	}, 60_000);

	test("sessions.modelTier is 'fast' when explicit modelTier overrides agent preference of 'reasoning'", async ({
		db,
		eventBus,
	}) => {
		const agentId = `sp-tier-ov-${Date.now()}`;
		const taskId = `sp-tier-ov-task-${Date.now()}`;

		await seedDomain(db, {
			agentId,
			taskId,
			agentOverrides: { modelTierPreference: "reasoning" },
		});

		const pool = makeBuiltinPool(lockedHarnessAdapter("builtin").adapter);
		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace: new LocalSandboxAdapter(),
		};
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: "sp-team-1",
			sandboxBasePath,
			modelTier: "fast", // explicit override
			resolvedModel: makeResolvedModel(),
		};

		await provisionSession(deps, params);

		const [row] = await db
			.select({ modelTier: sessions.modelTier })
			.from(sessions)
			.where(eq(sessions.agentId, agentId))
			.limit(1);
		expect(row?.modelTier).toBe("fast");
	}, 60_000);

	test("sessions.modelTier falls back to 'workhorse' when agent modelTierPreference is null", async ({
		db,
		eventBus,
	}) => {
		const agentId = `sp-tier-fb-${Date.now()}`;
		const taskId = `sp-tier-fb-task-${Date.now()}`;

		await seedDomain(db, {
			agentId,
			taskId,
			agentOverrides: { modelTierPreference: null },
		});

		const pool = makeBuiltinPool(lockedHarnessAdapter("builtin").adapter);
		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace: new LocalSandboxAdapter(),
		};
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: "sp-team-1",
			sandboxBasePath,
			resolvedModel: makeResolvedModel(),
		};

		await provisionSession(deps, params);

		const [row] = await db
			.select({ modelTier: sessions.modelTier })
			.from(sessions)
			.where(eq(sessions.agentId, agentId))
			.limit(1);
		expect(row?.modelTier).toBe("workhorse");
	}, 60_000);
});

// ---------------------------------------------------------------------------
// Adapter selection by harnessType (builtin adapter spy + pure error path)
// ---------------------------------------------------------------------------

describe("adapter pool selects by agent harnessType", () => {
	requireHarness("builtin");

	let sandboxBasePath: string;

	beforeEach(() => {
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "sp-ht-"));
		setActiveStrategy(minimalStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
	});

	test("adapter matching agent harnessType is called; non-matching adapter is not", async ({
		db,
		eventBus,
	}) => {
		const agentId = `sp-ht-sel-${Date.now()}`;
		const taskId = `sp-ht-sel-task-${Date.now()}`;

		// Agent has harnessType 'aider' — only the 'aider'-typed adapter should be selected.
		await seedDomain(db, {
			agentId,
			taskId,
			agentOverrides: { harnessType: "aider" },
		});

		const claudeAdapter = lockedHarnessAdapter("builtin").adapter;
		const aiderAdapter = lockedHarnessAdapter("builtin").adapter;

		// Spy on both (NOT stubs — real calls proceed; spies observe selection).
		const claudeSpy = vi.spyOn(claudeAdapter, "startSession");
		const aiderSpy = vi.spyOn(aiderAdapter, "startSession");

		const pool = new AdapterPool();
		pool.register("claude-code-1", claudeAdapter, {
			name: "claude-code-1",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 4,
		});
		pool.register("aider-1", aiderAdapter, {
			name: "aider-1",
			kind: "remote",
			type: "aider",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 4,
		});

		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace: new LocalSandboxAdapter(),
		};
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: "sp-team-1",
			sandboxBasePath,
			resolvedModel: makeResolvedModel(),
		};

		await provisionSession(deps, params);

		expect(aiderSpy).toHaveBeenCalledTimes(1);
		expect(claudeSpy).not.toHaveBeenCalled();

		vi.restoreAllMocks();
	}, 60_000);
});

describe("adapter pool throws when no adapter matches agent harnessType", () => {
	let sandboxBasePath: string;

	beforeEach(() => {
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "sp-ht-miss-"));
		setActiveStrategy(minimalStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		if (fs.existsSync(sandboxBasePath))
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
	});

	test("provisioning throws when pool has no adapter matching the agent harnessType", async ({
		db,
		eventBus,
	}) => {
		const agentId = `sp-ht-miss-${Date.now()}`;
		const taskId = `sp-ht-miss-task-${Date.now()}`;

		await seedDomain(db, {
			agentId,
			taskId,
			// 'goose' has no adapter in the pool — throws before any LLM call.
			agentOverrides: { harnessType: "goose" },
		});

		// Pool has only a claude-code adapter; no goose adapter.
		// The pool throws before startSession is called → no OPENROUTER_API_KEY needed.
		const pool = new AdapterPool();
		pool.register("claude-code-1", lockedHarnessAdapter("builtin").adapter, {
			name: "claude-code-1",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 4,
		});

		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace: new LocalSandboxAdapter(),
		};
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: "sp-team-1",
			sandboxBasePath,
			resolvedModel: {
				provider: "openai-compatible",
				model: "any-model",
				// No real API key needed — throws before any LLM call.
				// @lore AR3: baseUrl uses a placeholder; provisionSession throws on
				// adapter mismatch before any network call, so the value is irrelevant.
				apiKey: "unused",
				baseUrl: "https://openrouter.ai/api/v1",
			},
		};

		await expect(provisionSession(deps, params)).rejects.toThrow(/no.*adapter|harness type/i);
	});
});
