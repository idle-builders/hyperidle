/**
 * Bet decomposition integration tests (service).
 *
 * Tests cover:
 *   AC1  — Committing a bet produces ≥1 task breakdown (via runDecompositionTurn override)
 *   AC2  — Produced tasks owned by eligible team agents; flow into dispatch path
 *   AC4  — No eligible agent → explicit blocked status with reason='no_eligible_agent', zero tasks
 *   AC6  — Timeout/error in decomposition → blocked, never stuck on 'running'
 *   AC7  — Idempotent: CAS guard prevents double-decomposition (at service level via pre-set 'running')
 *   Crash-orphan recovery: resolveOrphanedDecompositions flips 'running' to blocked/failed at boot
 *   Round-robin fallback: growth-role task on builder-only team still lands on a builder (WARNING-7)
 *   GET /bets/:id returns decompositionStatus + decompositionBlockerReason (API shape)
 *
 * Uses the test-injectable runDecompositionTurn seam so NO real LLM calls are made.
 *
 * These tests FAIL until (in order):
 *   1. packages/shared exports DecompositionTaskInput, DecompositionStatus, DecompositionBlockerReason, DECOMPOSITION_TURN_TIMEOUT_MS
 *   2. packages/db/schema.ts adds bets.decompositionStatus + bets.decompositionBlockerReason
 *   3. packages/db/drizzle/ migration adds the columns
 *   4. packages/server/src/services/bet-decomposition.ts exports runBetDecomposition,
 *      findEligibleTeamAgents, insertProposedBetTasks, resolveOrphanedDecompositions, BetDecompositionDeps
 *   5. packages/server/src/routes/bets.ts returns decompositionStatus + decompositionBlockerReason
 *
 * @lore: The imports below reference modules that don't exist yet.
 * "Cannot find module" is the correct failure mode for the TDD red phase.
 * Once green-phase creates these modules, the imports resolve and tests assert behavior.
 */

import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import type { EventBus, SelectAgentOutcome, SelectAgentRequest } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import type { BetDecompositionDeps } from "../services/bet-decomposition.js";
import {
	findEligibleTeamAgents,
	insertProposedBetTasks,
	resolveOrphanedDecompositions,
	runBetDecomposition,
} from "../services/bet-decomposition.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "bet-decomposition-service-test-key";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

// ---------------------------------------------------------------------------
// Fabric-equivalent strategy fixture
//
// insertProposedBetTasks and runBetDecomposition now route per-task owner
// selection through selectOwner → getActiveStrategy().selectAgent. These
// describe blocks register a Fabric-equivalent selectAgent that reproduces
// round-robin behaviour byte-identically:
//   - bet_task: roleHint match → spread (candidates[spreadIndex % len])
//   - bet_decomposer: roleHint match → candidates[0]
// Assertions are frozen — only setup changes per code-review ruling.
// ---------------------------------------------------------------------------

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
		// AR4b: formAssistant stub — AK3 tests are not about assistant formation.
		formAssistant: vi.fn(
			async (): Promise<import("@hyperidle/shared").AssistantFormation> => ({
				persona: null,
				assistantDraftSurface: "standard",
			}),
		),
	};
}

// DecompositionTaskInput lives in @hyperidle/shared once exported.
// Declared locally so tests compile now; the import will replace this in the green phase.
type DecompositionTaskInput = {
	title: string;
	description?: string;
	doneCondition?: string;
	ownerRole?: string;
};

// ---------------------------------------------------------------------------
// Seed helpers
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
// Minimal test deps (no real LLM, no real sandbox)
// ---------------------------------------------------------------------------

function makeTestDeps(
	db: HyperIdleDb,
	eventBus: EventBus,
	overrides: Partial<BetDecompositionDeps> = {},
): BetDecompositionDeps {
	return {
		db,
		eventBus,
		// adapterPool/sandbox are not called when runDecompositionTurn override is present
		adapterPool: {} as BetDecompositionDeps["adapterPool"],
		sandbox: {
			create: vi.fn(),
			destroy: vi.fn(),
		} as unknown as BetDecompositionDeps["sandbox"],
		sandboxBasePath: "/tmp/decomp-test",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Bet decomposition — eligible team agents", () => {
	test("returns active AI team-category agents for the bet team (AC2)", async ({ db }) => {
		const { teamId, membershipId } = await seedTeamWithAgent(db);
		const eligible = await findEligibleTeamAgents(db, teamId);
		expect(eligible.length).toBeGreaterThanOrEqual(1);
		for (const agent of eligible) {
			expect(agent.kind).toBe("ai");
			expect(agent.status).toBe("active");
			// agentCategory must be 'team' (not strategy / individual)
			expect(agent.agentCategory).toBe("team");
			// teamId on users references teamMembers.id
			expect(agent.teamId).toBe(membershipId);
		}
	});

	test("excludes strategy agents from eligibility (AC4)", async ({ db }) => {
		await db.insert(teams).values(makeTeam());
		await db.insert(teamMembers).values(makeMembership());
		// Insert a strategy agent — should NOT be eligible
		await db.insert(users).values(makeAiUser("strat-1", "strategy_lead", "tm-1", "strategy"));
		// Insert a team agent — should be eligible
		await db.insert(users).values(makeAiUser("builder-1", "builder", "tm-1", "team"));

		const eligible = await findEligibleTeamAgents(db, "team-1");
		const ids = eligible.map((u: { id: string }) => u.id);
		expect(ids).not.toContain("strat-1");
		expect(ids).toContain("builder-1");
	});

	test("excludes inactive agents (AC4)", async ({ db }) => {
		await db.insert(teams).values(makeTeam());
		await db.insert(teamMembers).values(makeMembership());
		// Inactive team agent
		await db.insert(users).values({
			...makeAiUser("inactive-1", "builder", "tm-1"),
			status: "inactive",
		});
		const eligible = await findEligibleTeamAgents(db, "team-1");
		expect(eligible.map((u: { id: string }) => u.id)).not.toContain("inactive-1");
	});

	test("returns empty array for team with no eligible agents (AC4)", async ({ db }) => {
		await db.insert(teams).values(makeTeam());
		await db.insert(teamMembers).values(makeMembership());
		// Only a strategy agent — no eligible team agents
		await db.insert(users).values(makeAiUser("strat-1", "strategy_lead", "tm-1", "strategy"));

		const eligible = await findEligibleTeamAgents(db, "team-1");
		expect(eligible).toHaveLength(0);
	});
});

describe("Bet decomposition — proposed task insertion", () => {
	// insertProposedBetTasks now routes through selectOwner →
	// getActiveStrategy(). Register the Fabric-equivalent strategy so calls resolve.
	// Assertions below are FROZEN (setup-only change per code-review ruling).
	beforeEach(() => setActiveStrategy(makeFabricLikeStrategy()));
	afterEach(() => clearActiveStrategy());

	test("inserts tasks and assigns eligible owners, returning accepted state (AC1, AC2)", async ({
		db,
		eventBus,
	}) => {
		const { teamId, agentId } = await seedTeamWithAgent(db);
		await db.insert(bets).values(makeBet("bet-1", teamId, "active"));

		const eligible = await findEligibleTeamAgents(db, teamId);
		const taskInputs: DecompositionTaskInput[] = [
			{ title: "Task A", description: "Do thing A" },
			{ title: "Task B", doneCondition: "B is done" },
		];

		const result = (await insertProposedBetTasks(
			{ db, eventBus },
			{ id: "bet-1", teamId },
			eligible,
			taskInputs,
		)) as { created: number };

		expect(result.created).toBe(2);

		const inserted = await db.select().from(tasks).where(eq(tasks.betId, "bet-1"));
		expect(inserted).toHaveLength(2);

		for (const task of inserted) {
			expect(task.betId).toBe("bet-1");
			expect(task.teamId).toBe(teamId);
			expect(task.ownerAgentId).toBe(agentId); // only one eligible agent
			// Tasks must reach 'accepted' so the dispatcher fires
			expect(task.state).toBe("accepted");
		}
	});

	test("round-robin fallback: growth-role task on builder-only team still gets a builder owner (AC2, WARNING-7)", async ({
		db,
		eventBus,
	}) => {
		// Team has only a builder — no growth agent
		const { teamId } = await seedTeamWithAgent(db, {
			agentId: "builder-1",
			role: "builder",
		});
		await db.insert(bets).values(makeBet("bet-rr", teamId, "active"));

		const eligible = await findEligibleTeamAgents(db, teamId);
		// PM proposes a growth-role task — but no growth agent exists
		const taskInputs: DecompositionTaskInput[] = [{ title: "Growth task", ownerRole: "growth" }];

		await insertProposedBetTasks({ db, eventBus }, { id: "bet-rr", teamId }, eligible, taskInputs);

		const [inserted] = await db.select().from(tasks).where(eq(tasks.betId, "bet-rr"));
		// Must NOT be null/undefined — round-robin fallback assigns the builder
		expect(inserted?.ownerAgentId).toBe("builder-1");
		expect(inserted?.state).toBe("accepted");
	});

	test("betId is always bound from the bet, never from task input (security / AC1)", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithAgent(db);
		await db.insert(bets).values(makeBet("bet-sec", teamId, "active"));

		const eligible = await findEligibleTeamAgents(db, teamId);
		const taskInputs: DecompositionTaskInput[] = [{ title: "Secure task" }];

		await insertProposedBetTasks({ db, eventBus }, { id: "bet-sec", teamId }, eligible, taskInputs);

		const inserted = await db.select().from(tasks).where(eq(tasks.betId, "bet-sec"));
		for (const task of inserted) {
			expect(task.betId).toBe("bet-sec");
		}
	});
});

describe("Bet decomposition — no eligible agent blocks decomposition (AC4)", () => {
	test("sets decomposition_status=blocked, reason=no_eligible_agent, zero tasks inserted", async ({
		db,
		eventBus,
	}) => {
		// Team exists but has NO eligible team agents (only a strategy agent)
		await db.insert(teams).values(makeTeam("team-nea"));
		await db.insert(teamMembers).values(makeMembership("tm-nea", "team-nea"));
		await db.insert(users).values(makeAiUser("strat-1", "strategy_lead", "tm-nea", "strategy"));
		await db.insert(bets).values(makeBet("bet-nea", "team-nea", "active"));

		const deps = makeTestDeps(db, eventBus);

		await runBetDecomposition(deps, "bet-nea");

		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-nea"));
		// biome-ignore lint/suspicious/noExplicitAny: decompositionStatus column added in green phase
		expect((bet as any)?.decompositionStatus).toBe("blocked");
		// biome-ignore lint/suspicious/noExplicitAny: decompositionBlockerReason column added in green phase
		expect((bet as any)?.decompositionBlockerReason).toBe("no_eligible_agent");

		const createdTasks = await db.select().from(tasks).where(eq(tasks.betId, "bet-nea"));
		expect(createdTasks).toHaveLength(0);
	});
});

describe("Bet decomposition — happy path produces tasks (AC1, AC2)", () => {
	// runBetDecomposition routes PM pick + per-task owner through selectOwner.
	// Register Fabric-equivalent strategy; assertions below are FROZEN.
	beforeEach(() => setActiveStrategy(makeFabricLikeStrategy()));
	afterEach(() => clearActiveStrategy());

	test("injected turn returns 2 tasks → decomposition_status=done, ≥1 task in DB", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithAgent(db, { agentId: "builder-happy" });
		await db.insert(bets).values(makeBet("bet-happy", teamId, "active"));

		// Stub turn: returns 2 tasks deterministically, no LLM call
		const stubTurn = vi.fn().mockResolvedValue([
			{ title: "Task 1", description: "First task" },
			{ title: "Task 2", doneCondition: "Done when merged" },
		] as DecompositionTaskInput[]);

		const deps = makeTestDeps(db, eventBus, {
			runDecompositionTurn: stubTurn,
		});

		await runBetDecomposition(deps, "bet-happy");

		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-happy"));
		// biome-ignore lint/suspicious/noExplicitAny: decompositionStatus column added in green phase
		expect((bet as any)?.decompositionStatus).toBe("done");
		// biome-ignore lint/suspicious/noExplicitAny: decompositionBlockerReason column added in green phase
		expect((bet as any)?.decompositionBlockerReason).toBeNull();

		const created = await db.select().from(tasks).where(eq(tasks.betId, "bet-happy"));
		expect(created.length).toBeGreaterThanOrEqual(1);
		// All tasks must have an owner and be accepted
		for (const task of created) {
			expect(task.ownerAgentId).toBeTruthy();
			expect(task.state).toBe("accepted");
		}
		expect(stubTurn).toHaveBeenCalledOnce();
	});
});

describe("Bet decomposition — timeout and error handling (AC6)", () => {
	// PM pick goes through selectOwner; register strategy so it resolves.
	// Assertions frozen — setup only.
	beforeEach(() => setActiveStrategy(makeFabricLikeStrategy()));
	afterEach(() => clearActiveStrategy());

	test("turn that rejects → decomposition_status=blocked, reason=failed, never stuck on running", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithAgent(db, { agentId: "builder-fail" });
		await db.insert(bets).values(makeBet("bet-fail", teamId, "active"));

		const failingTurn = vi.fn().mockRejectedValue(new Error("LLM provider error"));

		const deps = makeTestDeps(db, eventBus, {
			runDecompositionTurn: failingTurn,
			turnTimeoutMs: 50, // fast timeout
		});

		await runBetDecomposition(deps, "bet-fail");

		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-fail"));
		// Must resolve to a terminal state — never left on 'running'
		// biome-ignore lint/suspicious/noExplicitAny: decompositionStatus column added in green phase
		expect((bet as any)?.decompositionStatus).toBe("blocked");
		// biome-ignore lint/suspicious/noExplicitAny: decompositionBlockerReason column added in green phase
		expect((bet as any)?.decompositionBlockerReason).toBe("failed");
	});

	test("turn that returns empty list → decomposition_status=blocked, reason=empty", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithAgent(db, { agentId: "builder-empty" });
		await db.insert(bets).values(makeBet("bet-empty", teamId, "active"));

		const emptyTurn = vi.fn().mockResolvedValue([]);

		const deps = makeTestDeps(db, eventBus, {
			runDecompositionTurn: emptyTurn,
		});

		await runBetDecomposition(deps, "bet-empty");

		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-empty"));
		// biome-ignore lint/suspicious/noExplicitAny: decompositionStatus column added in green phase
		expect((bet as any)?.decompositionStatus).toBe("blocked");
		// biome-ignore lint/suspicious/noExplicitAny: decompositionBlockerReason column added in green phase
		expect((bet as any)?.decompositionBlockerReason).toBe("empty");

		const created = await db.select().from(tasks).where(eq(tasks.betId, "bet-empty"));
		expect(created).toHaveLength(0);
	});
});

describe("Bet decomposition — idempotency CAS guard (AC7)", () => {
	test("runBetDecomposition with status already 'running' does NOT produce duplicate tasks", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithAgent(db, { agentId: "builder-idem" });
		// Pre-set the bet as already 'running' (CAS should block a second decomposition)
		// Pre-seeds decompositionStatus="running" via explicit any — column exists in the schema migration.
		// biome-ignore lint/suspicious/noExplicitAny: schema migration adds this column; test pre-seeds it to test CAS guard
		const idemBetRow: any = {
			...makeBet("bet-idem", teamId, "active"),
			decompositionStatus: "running",
		};
		await db.insert(bets).values(idemBetRow);

		const stubTurn = vi
			.fn()
			.mockResolvedValue([{ title: "Duplicate task" } as DecompositionTaskInput]);

		const deps = makeTestDeps(db, eventBus, {
			runDecompositionTurn: stubTurn,
		});

		// The CAS guard should see status is NOT NULL — skip work and return early
		await runBetDecomposition(deps, "bet-idem");

		// The stub should NOT have been called — CAS blocked it
		expect(stubTurn).not.toHaveBeenCalled();
		// No tasks created
		const created = await db.select().from(tasks).where(eq(tasks.betId, "bet-idem"));
		expect(created).toHaveLength(0);
	});
});

describe("Bet decomposition — orphan recovery on boot (AC3)", () => {
	test("flips any 'running' bet to blocked/failed", async ({ db }) => {
		await db.insert(teams).values(makeTeam("team-orphan"));
		await db.insert(teamMembers).values(makeMembership("tm-orphan", "team-orphan"));
		// Bet stuck on 'running' — simulates a crash. decompositionStatus column added via migration.
		// biome-ignore lint/suspicious/noExplicitAny: schema migration adds decompositionStatus; test pre-seeds it
		const orphanBetRow: any = {
			...makeBet("bet-orphan", "team-orphan", "active"),
			decompositionStatus: "running",
		};
		await db.insert(bets).values(orphanBetRow);

		const affected = await resolveOrphanedDecompositions(db);
		expect(affected).toBe(1);

		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-orphan"));
		// biome-ignore lint/suspicious/noExplicitAny: decompositionStatus column added in green phase
		expect((bet as any)?.decompositionStatus).toBe("blocked");
		// biome-ignore lint/suspicious/noExplicitAny: decompositionBlockerReason column added in green phase
		expect((bet as any)?.decompositionBlockerReason).toBe("failed");
	});

	test("leaves bets with terminal status untouched", async ({ db }) => {
		await db.insert(teams).values(makeTeam("team-clean"));
		await db.insert(teamMembers).values(makeMembership("tm-clean", "team-clean"));
		// decompositionStatus column added via migration.
		// biome-ignore lint/suspicious/noExplicitAny: schema migration adds decompositionStatus; test pre-seeds it
		const doneBetRow: any = {
			...makeBet("bet-done", "team-clean", "active"),
			decompositionStatus: "done",
		};
		await db.insert(bets).values(doneBetRow);

		const affected = await resolveOrphanedDecompositions(db);
		expect(affected).toBe(0);

		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-done"));
		// biome-ignore lint/suspicious/noExplicitAny: decompositionStatus column added in green phase
		expect((bet as any)?.decompositionStatus).toBe("done");
	});

	test("clean boot: zero orphans → 0 rows affected", async ({ db }) => {
		await db.insert(teams).values(makeTeam("team-fresh"));
		await db.insert(teamMembers).values(makeMembership("tm-fresh", "team-fresh"));
		await db.insert(bets).values(makeBet("bet-fresh", "team-fresh", "draft"));

		const affected = await resolveOrphanedDecompositions(db);
		expect(affected).toBe(0);
	});
});

describe("Bet decomposition — GET /bets/:id returns decomposition fields (API shape)", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	test("response includes decompositionStatus and decompositionBlockerReason fields", async ({
		db,
		app,
	}) => {
		await db.insert(teams).values(makeTeam());
		await db.insert(teamMembers).values(makeMembership());
		// decomposition columns added via migration.
		// biome-ignore lint/suspicious/noExplicitAny: schema migration adds decomposition columns; test pre-seeds them
		const apiBetRow: any = {
			...makeBet("bet-api", "team-1", "active"),
			decompositionStatus: "blocked",
			decompositionBlockerReason: "no_eligible_agent",
		};
		await db.insert(bets).values(apiBetRow);

		const res = await app.request("/api/bets/bet-api", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;

		// The API must expose these fields so the web surface can render the four-state UI
		expect(body).toHaveProperty("decompositionStatus");
		expect(body.decompositionStatus).toBe("blocked");
		expect(body).toHaveProperty("decompositionBlockerReason");
		expect(body.decompositionBlockerReason).toBe("no_eligible_agent");
	});

	test("decompositionStatus is null for a bet that has never been decomposed", async ({
		db,
		app,
	}) => {
		await db.insert(teams).values(makeTeam("team-null"));
		await db.insert(teamMembers).values(makeMembership("tm-null", "team-null"));
		await db.insert(bets).values(makeBet("bet-null", "team-null", "draft"));

		const res = await app.request("/api/bets/bet-null", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		// null or absent — either way the field must not be missing from the shape
		expect("decompositionStatus" in body).toBe(true);
	});
});
