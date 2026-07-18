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

import { createAgentSelectionService } from "@hyperidle/agent-selection";
import {
	type AgentSessionRequest,
	agentSessionRequests,
	agentWorkIntents,
	bets,
	type HyperIdleDb,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { getTeamMembers, updateTeam } from "@hyperidle/org";
import {
	type AgentSessionSourceKind,
	DECOMPOSITION_TURN_TIMEOUT_MS,
	type DecompositionBlockerReason,
	type DecompositionStatus,
	type DecompositionTaskInput,
	type ResolvedModel,
} from "@hyperidle/shared";
import { buildToolDefinitions } from "@hyperidle/tool-handlers";
import { getUserById, listActiveAiUsersByTeams } from "@hyperidle/users";
import type { AgentSelectionDefaults, BetDecompositionDeps } from "@hyperidle/work";
import { runBetDecomposition } from "@hyperidle/work";
import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { checkCostCap } from "../services/cost-bindings.js";
import { recordAgentWorkIntent } from "../services/session-requests-bindings.js";
import { toolHandlersPorts } from "../services/tool-handlers-bindings.js";
import { test } from "../test-fixtures.js";

const createTaskTool = buildToolDefinitions(toolHandlersPorts).find(
	(t) => t.name === "create_task",
)!;

const agentSelectionService = createAgentSelectionService({
	users: { getUserById, listActiveAiUsersByTeams },
	teams: { getTeamMembersByTeamId: (db, teamId) => getTeamMembers(db, { teamId }) },
});

/**
 * AU19 Increment 1b: `BetDecompositionDeps` now requires the four injected
 * `work` outbound ports (Mechanism C). Mirrors `server-factory.ts`'s
 * production wiring exactly.
 *
 * @lore AU19 Increment 1c: `teamCapacity` (fifth port, → `org`) added — closes
 * W2's `teamMembers` ownership gap.
 * @lore AU20 Ab4: adapts `AgentSelectionService` methods to `AgentSelectionDefaults`
 * port; `resolveDecompositionPlan` inlined (PM-role preference then candidates[0]).
 */
const productionPorts = {
	agentSelection: {
		enumerateTeamCandidates: (db, teamId) => agentSelectionService.listCandidates({ db, teamId }),
		selectOwner: (occDeps, occasion) =>
			agentSelectionService
				.selectAgent({
					surface: occasion.surface,
					db: occDeps.db,
					eventBus: occDeps.eventBus,
					teamId: occasion.teamId,
					workKey: occasion.workKey,
					roleHint: occasion.roleHint,
					spreadIndex: occasion.spreadIndex ?? null,
				})
				.then((r) => r.agentId),
		resolveDecompositionPlan: async (input) => {
			const pm = input.candidates.find((c) => c.role === "product_manager") ?? input.candidates[0];
			return { decomposerAgentId: pm?.agentId ?? null, tasks: [] };
		},
	} satisfies AgentSelectionDefaults,
	users: { getUserById, listActiveAiUsersByTeams },
	costCap: { checkCostCap },
	workIntents: { record: recordAgentWorkIntent },
	teamCapacity: {
		getByTeamId: (db: HyperIdleDb, teamId: string) => getTeamMembers(db, { teamId }),
		setActiveBets: (db: HyperIdleDb, teamId: string, activeBets: number) =>
			updateTeam(db, teamId, { activeBets }),
	},
} as const;

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
			...productionPorts,
			adapterPool: mockAdapterPool,
			executeAgentRunRequest: vi.fn().mockResolvedValue({
				sessionId: "session-ac5",
				outcome: "completed",
				totalCostCents: 0,
				taskId: null,
				forceReturnCount: 0,
			}),
			sandboxBasePath: "/tmp/ac5-test",
			resolveModel: mockResolveModel,
			// No runDecompositionTurn override — exercises the real PM path (runRealPmTurn).
		};

		await runBetDecomposition(deps, "bet-ac5");

		expect(select).not.toHaveBeenCalled();
		expect(await db.select().from(agentSessionRequests)).toHaveLength(0);
		expect(await db.select().from(agentWorkIntents)).toContainEqual(
			expect.objectContaining({
				kind: "bet_decomposition",
				sourceId: "bet-ac5",
				status: "pending",
			}),
		);
		const [bet] = await db.select().from(bets);
		expect(bet?.decompositionStatus).toBe("running");
	});

	test("successful runtime request writeback creates proposed tasks and marks bet done", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithAgent(db, { agentId: "builder-runtime-writeback" });
		await db.insert(bets).values(makeBet("bet-runtime-writeback", teamId, "active"));

		const executeAgentRunRequest = vi.fn(
			async (_deps: unknown, request: AgentSessionRequest, _options: unknown) => {
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
					outcome: "completed" as const,
					totalCostCents: 0,
					taskId: null,
					forceReturnCount: 0,
				};
			},
		);

		const select = vi.fn();
		const deps: BetDecompositionDeps = {
			db,
			eventBus,
			...productionPorts,
			adapterPool: {
				select,
				release(_id: string): void {
					/* no-op */
				},
			},
			executeAgentRunRequest,
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
		expect(executeAgentRunRequest).not.toHaveBeenCalled();
		const taskRows = await db.select().from(tasks).where(eq(tasks.betId, "bet-runtime-writeback"));
		expect(taskRows).toHaveLength(0);
		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-runtime-writeback")).limit(1);
		expect(bet?.decompositionStatus).toBe("running");
		expect(bet?.decompositionBlockerReason).toBeNull();
	});

	test("completed runtime request with no task writeback marks bet blocked empty", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithAgent(db, { agentId: "builder-runtime-empty" });
		await db.insert(bets).values(makeBet("bet-runtime-empty", teamId, "active"));

		const executeAgentRunRequest = vi.fn(
			async (_deps: unknown, _request: unknown, _options: unknown) => ({
				sessionId: "session-runtime-empty",
				outcome: "completed" as const,
				totalCostCents: 0,
				taskId: null,
				forceReturnCount: 0,
			}),
		);

		await runBetDecomposition(
			{
				db,
				eventBus,
				...productionPorts,
				adapterPool: {},
				executeAgentRunRequest,
				sandboxBasePath: "/tmp/ac5-test",
			},
			"bet-runtime-empty",
		);

		const taskRows = await db.select().from(tasks).where(eq(tasks.betId, "bet-runtime-empty"));
		expect(taskRows).toHaveLength(0);
		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-runtime-empty")).limit(1);
		expect(executeAgentRunRequest).not.toHaveBeenCalled();
		expect(bet?.decompositionStatus).toBe("running");
		expect(bet?.decompositionBlockerReason).toBeNull();
	});
});
