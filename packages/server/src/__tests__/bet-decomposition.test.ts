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

import {
	type AgentSessionRequest,
	agentSessionRequests,
	bets,
	type HyperIdleDb,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { clearProvisionSessionFn, setAgentSessionRequestConsumerFn } from "@hyperidle/fabric";
import {
	type AgentSessionSourceKind,
	DECOMPOSITION_TURN_TIMEOUT_MS,
	type DecompositionBlockerReason,
	type DecompositionStatus,
	type DecompositionTaskInput,
	type ResolvedModel,
	type SelectAgentOutcome,
	type SelectAgentRequest,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import type { BetDecompositionDeps } from "../services/bet-decomposition.js";
import { runBetDecomposition } from "../services/bet-decomposition.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";
import { createTaskTool } from "../tools/create-task.js";

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
		formAssistant: vi.fn(async (): Promise<import("@hyperidle/shared").AssistantFormation> => {
			return { persona: null, assistantDraftSurface: "standard" };
		}),
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
// AU1: Decomposition domain boundary
// ---------------------------------------------------------------------------

describe("bet decomposition enters the agent runtime through requests", () => {
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
		clearProvisionSessionFn();
	});

	test("records a decomposition request and does not select/start a harness in domain code", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithAgent(db, { agentId: "builder-ac5" });
		await db.insert(bets).values(makeBet("bet-ac5", teamId, "active"));

		const select = vi.fn();
		const mockAdapterPool = {
			select,
			release(_id: string): void {
				/* no-op */
			},
		};

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

		expect(select).not.toHaveBeenCalled();
		const requests = await db.select().from(agentSessionRequests);
		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({
			sourceKind: "decomposition",
			sourceId: "bet-ac5",
			taskId: null,
			promptMode: "decomposition",
		});
		const [bet] = await db.select().from(bets);
		expect(bet?.decompositionStatus).toBe("blocked");
	});

	test("successful runtime request writeback creates proposed tasks and marks bet done", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithAgent(db, { agentId: "builder-runtime-writeback" });
		await db.insert(bets).values(makeBet("bet-runtime-writeback", teamId, "active"));

		setAgentSessionRequestConsumerFn(async (_deps: unknown, request: AgentSessionRequest) => {
			const result = await createTaskTool.handler(
				{ title: "Runtime proposed task" },
				{
					db,
					eventBus,
					agentId: request.agentId,
					sessionId: "session-runtime-writeback",
					taskId: "",
					teamId: request.teamId ?? undefined,
					requestContext: {
						requestId: request.id,
						sourceKind: request.sourceKind as AgentSessionSourceKind,
						sourceId: request.sourceId,
						sourceCorrelation: JSON.parse(request.sourceCorrelationJson),
					},
					sandboxPath: "/tmp/ac5-test",
					ingestion: { dispose: vi.fn() },
				},
			);
			expect(result.success).toBe(true);
			return {
				sessionId: "session-runtime-writeback",
				outcome: "completed",
				totalCostCents: 0,
				taskId: null,
				forceReturnCount: 0,
			};
		});

		const select = vi.fn();
		const deps: BetDecompositionDeps = {
			db,
			eventBus,
			adapterPool: {
				select,
				release(_id: string): void {
					/* no-op */
				},
			},
			sandbox: {
				create: vi.fn().mockResolvedValue({ sandboxPath: "/tmp/ac5-test" }),
				destroy: vi.fn(),
			} as unknown as BetDecompositionDeps["sandbox"],
			sandboxBasePath: "/tmp/ac5-test",
			resolveModel: vi.fn().mockResolvedValue({
				provider: "openrouter",
				model: "deepseek/deepseek-v4-flash",
				apiKey: "test-key",
				baseUrl: "https://openrouter.ai/api",
			} satisfies ResolvedModel),
		};

		await runBetDecomposition(deps, "bet-runtime-writeback");

		expect(select).not.toHaveBeenCalled();
		const taskRows = await db.select().from(tasks).where(eq(tasks.betId, "bet-runtime-writeback"));
		expect(taskRows).toHaveLength(1);
		expect(taskRows[0]).toMatchObject({
			title: "Runtime proposed task",
			state: "proposed",
			betId: "bet-runtime-writeback",
			teamId,
		});
		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-runtime-writeback")).limit(1);
		expect(bet?.decompositionStatus).toBe("done");
		expect(bet?.decompositionBlockerReason).toBeNull();
	});

	test("completed runtime request with no task writeback marks bet blocked empty", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithAgent(db, { agentId: "builder-runtime-empty" });
		await db.insert(bets).values(makeBet("bet-runtime-empty", teamId, "active"));

		setAgentSessionRequestConsumerFn(async () => ({
			sessionId: "session-runtime-empty",
			outcome: "completed",
			totalCostCents: 0,
			taskId: null,
			forceReturnCount: 0,
		}));

		await runBetDecomposition(
			{
				db,
				eventBus,
				adapterPool: {},
				sandbox: {
					create: vi.fn().mockResolvedValue({ sandboxPath: "/tmp/ac5-test" }),
					destroy: vi.fn(),
				} as unknown as BetDecompositionDeps["sandbox"],
				sandboxBasePath: "/tmp/ac5-test",
			},
			"bet-runtime-empty",
		);

		const taskRows = await db.select().from(tasks).where(eq(tasks.betId, "bet-runtime-empty"));
		expect(taskRows).toHaveLength(0);
		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-runtime-empty")).limit(1);
		expect(bet?.decompositionStatus).toBe("blocked");
		expect(bet?.decompositionBlockerReason).toBe("empty");
	});
});
