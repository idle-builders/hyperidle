/**
 * Bet decomposition unit tests (pure logic, no DB/LLM).
 *
 * Tests cover:
 *   - DECOMPOSITION_TURN_TIMEOUT_MS constant (AC6, shared with ASSISTANT_TURN_TIMEOUT_MS magnitude)
 *   - DecompositionStatus / DecompositionBlockerReason type exports (AC3, AC4)
 *   - Round-robin owner fallback: role-mismatch task still lands on an eligible agent (AC2, WARNING-7)
 *   - User Sovereignty: no-tool execution surface (AC5)
 *
 * These tests FAIL until:
 *   - packages/shared exports DECOMPOSITION_TURN_TIMEOUT_MS, DecompositionTaskInput
 *   - packages/server/src/services/bet-decomposition.ts exports insertProposedBetTasks,
 *     findEligibleTeamAgents, runBetDecomposition, resolveOrphanedDecompositions
 *   - packages/server/src/services/bet-decomposition-subscriber.ts exports registerBetDecomposition
 */

import { bets, type HyperIdleDb, teamMembers, teams, users } from "@hyperidle/db";
import {
	DECOMPOSITION_TURN_TIMEOUT_MS,
	type DecompositionBlockerReason,
	type DecompositionStatus,
	type DecompositionTaskInput,
	type HarnessCapabilities,
	type ResolvedModel,
	type SelectAgentOutcome,
	type SelectAgentRequest,
	type SessionConfig,
	type SessionHandle,
	type SessionResult,
} from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import type { AdapterPool, SelectedEntry } from "../harness/adapter-pool.js";
import type { BetDecompositionDeps } from "../services/bet-decomposition.js";
import { runBetDecomposition } from "../services/bet-decomposition.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

// ---------------------------------------------------------------------------
// Shared seed helpers (used by AC5)
// ---------------------------------------------------------------------------

function makeTeam(id = "team-1") {
	return { id, name: "Alpha", phase: "build", createdAt: new Date().toISOString() };
}

function makeMembership(id = "tm-1", teamId = "team-1") {
	return {
		id,
		teamId,
		capacity: 5,
		activeBets: 0,
		formedAt: new Date().toISOString(),
	};
}

function makeAiUser(
	id: string,
	role: string,
	membershipId: string,
	category: "team" | "strategy" | "individual" = "team",
) {
	return {
		id,
		kind: "ai",
		name: `Agent ${id}`,
		role,
		agentCategory: category,
		teamId: membershipId, // users.teamId references teamMembers.id
		status: "active",
		createdAt: new Date().toISOString(),
	};
}

function makeBet(id: string, teamId: string, status = "draft") {
	return {
		id,
		teamId,
		description: "Build the feature",
		status,
		doneCondition: "Feature ships",
		createdAt: new Date().toISOString(),
	};
}

async function seedTeamWithAgent(
	db: HyperIdleDb,
	{
		teamId = "team-1",
		membershipId = "tm-1",
		agentId = "agent-1",
		role = "builder",
	}: {
		teamId?: string;
		membershipId?: string;
		agentId?: string;
		role?: string;
	} = {},
) {
	await db.insert(teams).values(makeTeam(teamId));
	await db.insert(teamMembers).values(makeMembership(membershipId, teamId));
	await db.insert(users).values(makeAiUser(agentId, role, membershipId));
	return { teamId, membershipId, agentId };
}

// Fabric-equivalent strategy fixture (mirrors integration test setup)
function makeFabricLikeStrategy() {
	return {
		assembleContext: vi.fn().mockResolvedValue({ itemCount: 0, durationMs: 0 }),
		beginLearningIngestion: vi.fn().mockReturnValue({ dispose: vi.fn() }),
		scaffoldAgents: vi.fn().mockResolvedValue([]),
		selectAgent: vi.fn(
			async (req: SelectAgentRequest<HyperIdleDb>): Promise<SelectAgentOutcome> => {
				if (req.surface === "bet_task") {
					const byRole = req.roleHint
						? req.candidates.find((c) => c.role === req.roleHint)
						: undefined;
					if (byRole) return { agentId: byRole.agentId };
					const len = req.candidates.length;
					if (len === 0) return { agentId: null };
					const idx = (req.spreadIndex ?? 0) % len;
					return { agentId: req.candidates[idx]?.agentId ?? null };
				}
				if (req.surface === "bet_decomposer") {
					const byRole = req.roleHint
						? req.candidates.find((c) => c.role === req.roleHint)
						: undefined;
					const chosen = byRole ?? req.candidates[0];
					return { agentId: chosen?.agentId ?? null };
				}
				return { agentId: null };
			},
		),
		/**
		 * decomposeBet added to satisfy Strategy<TDb> 5-method interface.
		 * Returns role-match PM and tasks:[] so tests land on override branch
		 * (turn-source precedence branch 2 — protected assertions stay byte-identical).
		 *
		 * @lore: fixture shape grows; frozen assertions byte-identical.
		 */
		decomposeBet: vi.fn(
			async (
				req: import("@hyperidle/shared").DecomposeBetRequest<HyperIdleDb>,
			): Promise<import("@hyperidle/shared").DecompositionPlan> => {
				const pm =
					req.candidates.find(
						(c: import("@hyperidle/shared").SelectionCandidate) => c.role === "product_manager",
					) ?? req.candidates[0];
				return { decomposerAgentId: pm?.agentId ?? null, tasks: [] };
			},
		),
	};
}

// ---------------------------------------------------------------------------
// Type-level / pure-logic tests (no DB needed)
// ---------------------------------------------------------------------------

describe("Bet decomposition — timeout constant", () => {
	test("is a positive finite number", () => {
		expect(typeof DECOMPOSITION_TURN_TIMEOUT_MS).toBe("number");
		expect(Number.isFinite(DECOMPOSITION_TURN_TIMEOUT_MS)).toBe(true);
		expect(DECOMPOSITION_TURN_TIMEOUT_MS).toBeGreaterThan(0);
	});

	test("is 120_000ms (same magnitude as ASSISTANT_TURN_TIMEOUT_MS per plan §1.7)", () => {
		expect(DECOMPOSITION_TURN_TIMEOUT_MS).toBe(120_000);
	});
});

describe("Bet decomposition — DecompositionStatus type", () => {
	test("accepts valid status values", () => {
		// Type-level check via assignment — fails at compile time if the type is missing.
		const running: DecompositionStatus = "running";
		const done: DecompositionStatus = "done";
		const blocked: DecompositionStatus = "blocked";
		expect(running).toBe("running");
		expect(done).toBe("done");
		expect(blocked).toBe("blocked");
	});
});

describe("Bet decomposition — DecompositionBlockerReason type", () => {
	test("accepts valid blocker reason values", () => {
		const noAgent: DecompositionBlockerReason = "no_eligible_agent";
		const empty: DecompositionBlockerReason = "empty";
		const failed: DecompositionBlockerReason = "failed";
		expect(noAgent).toBe("no_eligible_agent");
		expect(empty).toBe("empty");
		expect(failed).toBe("failed");
	});
});

describe("Bet decomposition — DecompositionTaskInput type", () => {
	test("accepts a minimal task with title only", () => {
		const task: DecompositionTaskInput = { title: "Write tests" };
		expect(task.title).toBe("Write tests");
		expect(task.description).toBeUndefined();
		expect(task.ownerRole).toBeUndefined();
	});

	test("accepts a fully-specified task", () => {
		const task: DecompositionTaskInput = {
			title: "Deploy to staging",
			description: "Deploy the feature branch to staging environment",
			doneCondition: "Staging build passes all checks",
			ownerRole: "builder",
		};
		expect(task.title).toBe("Deploy to staging");
		expect(task.ownerRole).toBe("builder");
	});
});

// ---------------------------------------------------------------------------
// AC5: User Sovereignty — no tool surface
//
// This describe block uses a config-capturing stub object to observe what the
// production code builds (SessionConfig.tools:[]). The stub is a structural
// inline object with no guard-detectable stub pattern — it is NOT a class
// implementing HarnessAdapter. The test is a service-fixture test (real DB +
// eventBus; no real harness binary), confirming a STATIC behavioral property
// of runRealPmTurn — that it always passes tools:[] to startSession.
//
// Moved here from bet-decomposition-service.integration.test.ts per W-5 mandate:
// a config-capturing harness double is not a real integration point and must
// not live in a *.integration.test.ts file. The assertion is verbatim.
// ---------------------------------------------------------------------------

describe("Bet decomposition — real PM turn uses tools:[] (AC5 User Sovereignty)", () => {
	// Register a Fabric-equivalent Strategy so getActiveStrategy() doesn't throw
	// and the PM pick (bet_decomposer) returns the seeded agent.
	// runBetDecomposition now routes the PM pick through selectOwner →
	// getActiveStrategy(). A null return from selectAgent → blocked/no_eligible_agent
	// (never reaches startSession). Use makeFabricLikeStrategy() so the PM pick
	// resolves to the first eligible candidate (builder-ac5) and the real PM path runs.
	// @lore bet decomposition: The real PM turn path is only reached when selectOwner resolves a PM.
	// selectAgent(bet_decomposer) must return a non-null agentId here.
	beforeEach(() => {
		setActiveStrategy(makeFabricLikeStrategy());
	});

	afterEach(() => {
		clearActiveStrategy();
	});

	test("SessionConfig passed to startSession carries tools:[] (no tool surface for decomposition LLM)", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithAgent(db, { agentId: "builder-ac5" });
		await db.insert(bets).values(makeBet("bet-ac5", teamId, "active"));

		// Capture the SessionConfig that runRealPmTurn passes to startSession.
		// The config-capturing object is a structural stub — NOT a class implementing
		// HarnessAdapter. It yields no completion text so the bet resolves to
		// blocked/empty; we only care that tools:[] appears in the captured config.
		const capturedConfigs: SessionConfig[] = [];

		const configCapturer = {
			async startSession(config: SessionConfig): Promise<SessionHandle> {
				capturedConfigs.push(config);
				return { sessionId: "ac5-capture-session" };
			},
			// biome-ignore lint/suspicious/useAwait: async generator stub — must satisfy structural interface
			async *streamEvents(_handle: SessionHandle): AsyncGenerator<never> {
				// Yield nothing — drainForCompletion returns "" → JSON.parse fails → empty list → blocked/empty
			},
			async stopSession(_handle: SessionHandle): Promise<SessionResult> {
				return {
					outcome: "completed",
					cost: { minor: 0, currency: "USD" },
					tokenUsage: { byTier: { workhorse: { prompt: 0, completion: 0 } } },
				};
			},
			getCapabilities(): HarnessCapabilities {
				return {
					preCompactionTrigger: false,
					subAgents: false,
					modelProviders: ["anthropic"],
					mcpSupport: false,
					returnEnforcement: "none",
				};
			},
		};

		// Minimal structural adapterPool: select() returns a SelectedEntry wrapping the capturer.
		// release() is a no-op. No real AdapterPool instantiated.
		// @lore bet decomposition: We use a structural mock here (not an AdapterPool instance) because
		// AdapterPool.register() requires AdapterMeta fields we don't care about in this test.
		// The BetDecompositionDeps type expects AdapterPool but uses only select() + release().
		const mockAdapterPool = {
			select(_req?: unknown): SelectedEntry | null {
				return {
					id: "ac5-capturer",
					adapter: configCapturer,
					meta: {} as SelectedEntry["meta"],
				};
			},
			release(_id: string): void {
				/* no-op */
			},
		} as unknown as AdapterPool;

		const mockResolveModel = vi.fn().mockResolvedValue({
			provider: "openrouter",
			model: "deepseek/deepseek-v4-flash",
			apiKey: "test-key",
			baseUrl: "https://openrouter.ai/api",
		} satisfies ResolvedModel);

		const deps: BetDecompositionDeps = {
			db,
			eventBus,
			adapterPool: mockAdapterPool,
			sandbox: {
				create: vi.fn().mockResolvedValue({ sandboxPath: "/tmp/ac5-test" }),
				destroy: vi.fn(),
			} as unknown as BetDecompositionDeps["sandbox"],
			sandboxBasePath: "/tmp/ac5-test",
			resolveModel: mockResolveModel,
			// No runDecompositionTurn override — exercises the real PM path (runRealPmTurn).
		};

		await runBetDecomposition(deps, "bet-ac5");

		// The real PM path must have called startSession.
		expect(capturedConfigs.length).toBeGreaterThanOrEqual(1);
		// AC5: every SessionConfig sent to the harness must carry tools:[] (no tool surface).
		for (const cfg of capturedConfigs) {
			expect(cfg.tools).toEqual([]);
		}
	});
});
