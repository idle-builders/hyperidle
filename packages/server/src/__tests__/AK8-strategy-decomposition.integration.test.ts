/**
 * AK8 RED — Strategy-owned decomposition integration tests.
 *
 * Tests cover:
 *   AC1 — Committing a bet emits `work_decompose_requested` AND the Kernel calls
 *          `decomposeBet` on the active Strategy (spy proves the decision came from
 *          the Strategy, not a Kernel constant — WARNING 4).
 *          Post-CAS emit: duplicate `bet_state_changed(active)` → exactly one emit
 *          and one `decomposeBet` call.
 *   AC2 — Minimal Strategy: ≥1 task, owned by eligible team agent, accepted (AK3 parity).
 *          Fabric Strategy: tasks created, owned by eligible agents, accepted — AK3 parity
 *          (NOT a knowledge-derived breakdown; Fabric v1 returns tasks:[] per plan §Fabric).
 *   AC3 — All AK3 guarantees hold under any Strategy:
 *          • no-eligible-agent → blocked/no_eligible_agent
 *          • invalid decomposerAgentId (off-team/inactive) → blocked/no_eligible_agent
 *            (inline validation guard — WARNING 1)
 *          • Strategy.decomposeBet throws → blocked/failed (no false promise)
 *          • duplicate `bet_state_changed(active)` → exactly one decomposition, one emit (CAS)
 *   AC4 — Runtime strategy-swap proof: same committed bet under Minimal vs the
 *          divergent-decomposer fixture → DIFFERENT decomposerAgentId used in the
 *          dispatched work (NOT vacuous Minimal-vs-Fabric which both pick the same PM).
 *
 * These tests FAIL until:
 *   1. `packages/shared/src/events.ts` adds `WorkDecomposeRequestedEvent` to `KernelEvent`.
 *   2. `packages/shared/src/strategy-port.ts` adds `decomposeBet` method to `Strategy<TDb>`.
 *   3. `packages/server/src/services/bet-decomposition.ts` is rewired through the port
 *      (`work_decompose_requested` emit + `getActiveStrategy().decomposeBet(...)` call +
 *      inline `decomposerAgentId` validation + 3-way turn-source precedence).
 *
 * The `makeFabricLikeStrategy()` fixture in AK3 tests is extended here with
 * `decomposeBet` so it typechecks once T1 adds the 5th method (T1/W3 — fixture
 * shape grows; frozen assertions stay byte-identical).
 *
 * @lore AK8: The test-level strategy-swap (setActiveStrategy) is the runtime proof
 * of AC4 — the Kernel never references a concrete Strategy; only the registered
 * Strategy's `decomposeBet` response changes the observed behaviour.
 */

import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import type {
	DecomposeBetRequest,
	DecompositionPlan,
	EventBus,
	SelectAgentOutcome,
	SelectAgentRequest,
	SelectionCandidate,
	WorkDecomposeRequestedEvent,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, vi } from "vitest";
import type { BetDecompositionDeps } from "../services/bet-decomposition.js";
import { findEligibleTeamAgents, runBetDecomposition } from "../services/bet-decomposition.js";
import { registerBetDecomposition } from "../services/bet-decomposition-subscriber.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();

function makeTeam(id: string) {
	return { id, name: `Team ${id}`, phase: "build", createdAt: NOW };
}

function makeMembership(id: string, teamId: string) {
	return { id, teamId, capacity: 5, activeBets: 0, formedAt: NOW };
}

function makeAiUser(
	id: string,
	role: string,
	membershipId: string,
	opts: { status?: string; agentCategory?: "team" | "strategy" | "individual" } = {},
) {
	return {
		id,
		kind: "ai",
		name: `Agent ${id}`,
		role,
		agentCategory: opts.agentCategory ?? "team",
		teamId: membershipId,
		status: opts.status ?? "active",
		createdAt: NOW,
	};
}

function makeBet(id: string, teamId: string, status = "draft") {
	return {
		id,
		teamId,
		description: "Build the feature",
		status,
		doneCondition: "Feature ships",
		createdAt: NOW,
	};
}

async function seedTeamWithTwoAgents(
	db: HyperIdleDb,
	{
		teamId = "team-ak8",
		membershipId = "tm-ak8",
		pmAgentId = "pm-agent",
		builderAgentId = "builder-agent",
	}: {
		teamId?: string;
		membershipId?: string;
		pmAgentId?: string;
		builderAgentId?: string;
	} = {},
) {
	await db.insert(teams).values(makeTeam(teamId));
	await db.insert(teamMembers).values(makeMembership(membershipId, teamId));
	// PM agent with product_manager role (Minimal/Fabric pick this first via role-match)
	await db.insert(users).values(makeAiUser(pmAgentId, "product_manager", membershipId));
	// Builder agent (the divergent strategy picks this — different from PM)
	await db.insert(users).values(makeAiUser(builderAgentId, "builder", membershipId));
	return { teamId, membershipId, pmAgentId, builderAgentId };
}

// ---------------------------------------------------------------------------
// Strategy fixture helpers
// ---------------------------------------------------------------------------

/**
 * AK8 T2: Fabric-like strategy fixture — extends the AK3 makeFabricLikeStrategy
 * with `decomposeBet` returning { decomposerAgentId: role-match PM, tasks: [] }.
 * Landing on override branch (turn-source precedence branch 2) so protected AK3
 * assertions stay frozen.
 *
 * @lore AK8 T1/W3: Adding decomposeBet to satisfy the Strategy<TDb> 5-method
 * interface. Fixture shape grows; frozen assertions byte-identical.
 */
function makeFabricLikeStrategyWithDecompose(_pmAgentId?: string) {
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
				return { agentId: null };
			},
		),
		/**
		 * AK8: decomposeBet — role-match PM on candidates (AK3 fallback identical).
		 * Returns tasks:[] so the override branch runs (protected tests stay green).
		 */
		decomposeBet: vi.fn(
			async (req: DecomposeBetRequest<HyperIdleDb>): Promise<DecompositionPlan> => {
				const pm =
					req.candidates.find((c: SelectionCandidate) => c.role === "product_manager") ??
					req.candidates[0];
				return { decomposerAgentId: pm?.agentId ?? null, tasks: [] };
			},
		),
		// AR4b: formAssistant stub — AK8 tests are not about assistant formation.
		formAssistant: vi.fn().mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
	};
}

/**
 * AK8 T2 / AC4: Divergent-decomposer fixture.
 * Returns the FIRST candidate (not the PM role-match) as the decomposer.
 * On a team with [builder-agent (builder), pm-agent (product_manager)] ordered by users.id
 * (alphabetically "builder-ac4" < "pm-ac4"), this picks builder-agent — provably different
 * from Minimal's PM role-match pick.
 *
 * @lore AK8: "divergent" = different decomposer from the Minimal default (PM role-match).
 * Minimal picks pm-agent via role-match; this fixture picks candidates[0] (the first
 * candidate by users.id ordering). With IDs "builder-ac4" < "pm-ac4" alphabetically,
 * candidates[0] = builder-ac4 ≠ pm-ac4.
 * WARNING 2 / CRITICAL 2 resolved: NOT vacuous Minimal-vs-Fabric (both pick same PM).
 *
 * @lore AK8: candidates are ordered by users.id (enumerateTeamCandidates uses
 * orderBy(users.id)). The seed IDs "pm-ac4" / "builder-ac4" yield order
 * [builder-ac4 (0), pm-ac4 (1)] — so first = builder, last = pm.
 * This fixture picks first (builder); Minimal picks by role (pm). Provably different.
 */
function makeDivergentDecomposerStrategy() {
	return {
		assembleContext: vi.fn().mockResolvedValue({ itemCount: 0, durationMs: 0 }),
		beginLearningIngestion: vi.fn().mockReturnValue({ dispose: vi.fn() }),
		scaffoldAgents: vi.fn().mockResolvedValue([]),
		selectAgent: vi.fn(
			async (req: SelectAgentRequest<HyperIdleDb>): Promise<SelectAgentOutcome> => {
				if (req.surface === "bet_task") {
					// Assign all tasks to the first candidate (mirrors divergent decomposer pick)
					const first = req.candidates[0];
					return { agentId: first?.agentId ?? null };
				}
				return { agentId: null };
			},
		),
		/**
		 * Deliberately picks the FIRST candidate (not the PM role-match).
		 * With orderBy(users.id) and IDs "builder-ac4" < "pm-ac4", candidates[0] = builder-ac4.
		 */
		decomposeBet: vi.fn(
			async (req: DecomposeBetRequest<HyperIdleDb>): Promise<DecompositionPlan> => {
				const first = req.candidates[0];
				return { decomposerAgentId: first?.agentId ?? null, tasks: [] };
			},
		),
		// AR4b: formAssistant stub — AK8 tests are not about assistant formation.
		formAssistant: vi.fn().mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
	};
}

/**
 * Minimal strategy fixture with spy on decomposeBet for AC1 assertions.
 */
function makeMinimalStrategyWithDecomposeSpy() {
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
				return { agentId: null };
			},
		),
		/**
		 * AK8 Minimal: role-match PM else first candidate, tasks:[].
		 * Matches minimal-strategy.ts decomposeBet spec (plan §Minimal).
		 */
		decomposeBet: vi.fn(
			async (req: DecomposeBetRequest<HyperIdleDb>): Promise<DecompositionPlan> => {
				const pm =
					req.candidates.find((c: SelectionCandidate) => c.role === "product_manager") ??
					req.candidates[0];
				return { decomposerAgentId: pm?.agentId ?? null, tasks: [] };
			},
		),
		// AR4b: formAssistant stub — AK8 tests are not about assistant formation.
		formAssistant: vi.fn().mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
	};
}

// ---------------------------------------------------------------------------
// makeTestDeps helper
// ---------------------------------------------------------------------------

function makeTestDeps(
	db: HyperIdleDb,
	eventBus: EventBus,
	overrides: Partial<BetDecompositionDeps> = {},
): BetDecompositionDeps {
	return {
		db,
		eventBus,
		adapterPool: {} as BetDecompositionDeps["adapterPool"],
		sandbox: {
			create: vi.fn(),
			destroy: vi.fn(),
		} as unknown as BetDecompositionDeps["sandbox"],
		sandboxBasePath: "/tmp/ak8-test",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// AC1: Kernel emits work_decompose_requested + calls Strategy.decomposeBet
// ---------------------------------------------------------------------------

describe("AK8 AC1: work_decompose_requested emitted, Strategy.decomposeBet called", () => {
	afterEach(() => clearActiveStrategy());

	test("runBetDecomposition emits work_decompose_requested for the betId", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithTwoAgents(db);
		await db.insert(bets).values(makeBet("bet-ac1-emit", teamId, "active"));

		const strategy = makeMinimalStrategyWithDecomposeSpy();
		setActiveStrategy(strategy);

		const emitted: WorkDecomposeRequestedEvent[] = [];
		// Subscribe via wildcard and filter by type string — work_decompose_requested is
		// not yet in EventType (added in T1); wildcard subscription works regardless.
		eventBus.on("*", (ev) => {
			if (ev.type === "work_decompose_requested") {
				emitted.push(ev as unknown as WorkDecomposeRequestedEvent);
			}
		});

		const stubTurn = vi
			.fn()
			.mockResolvedValue([{ title: "Task from AC1", ownerRole: "product_manager" }]);

		const deps = makeTestDeps(db, eventBus, { runDecompositionTurn: stubTurn });
		await runBetDecomposition(deps, "bet-ac1-emit");

		expect(emitted.length).toBeGreaterThanOrEqual(1);
		expect(emitted[0]?.betId).toBe("bet-ac1-emit");
		expect(emitted[0]?.teamId).toBe(teamId);
		expect(emitted[0]?.type).toBe("work_decompose_requested");
	});

	test("runBetDecomposition calls Strategy.decomposeBet with the betId (AC1 spy — WARNING 4)", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithTwoAgents(db);
		await db.insert(bets).values(makeBet("bet-ac1-spy", teamId, "active"));

		const strategy = makeMinimalStrategyWithDecomposeSpy();
		setActiveStrategy(strategy);

		const stubTurn = vi.fn().mockResolvedValue([{ title: "Spy task" }]);
		const deps = makeTestDeps(db, eventBus, { runDecompositionTurn: stubTurn });
		await runBetDecomposition(deps, "bet-ac1-spy");

		// The spy MUST have been called with the betId — proves Kernel asked Strategy
		// (not a Kernel hard-coded constant). A test asserting only "≥1 task created"
		// would pass even if the Kernel ignored the Strategy (WARNING 4).
		expect(strategy.decomposeBet).toHaveBeenCalledWith(
			expect.objectContaining({ betId: "bet-ac1-spy" }),
		);
	});

	test("duplicate bet_state_changed(active) → exactly one work_decompose_requested emitted (CAS post-emit)", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithTwoAgents(db);
		await db.insert(bets).values(makeBet("bet-ac1-dup", teamId, "active"));

		const strategy = makeMinimalStrategyWithDecomposeSpy();
		setActiveStrategy(strategy);

		const emitted: WorkDecomposeRequestedEvent[] = [];
		// Use wildcard subscription — work_decompose_requested not yet in EventType (T1 adds it).
		eventBus.on("*", (ev) => {
			if (ev.type === "work_decompose_requested") {
				emitted.push(ev as unknown as WorkDecomposeRequestedEvent);
			}
		});

		const stubTurn = vi.fn().mockResolvedValue([{ title: "Dup task" }]);
		const deps = makeTestDeps(db, eventBus, { runDecompositionTurn: stubTurn });

		// Call runBetDecomposition twice — only the CAS winner should emit the event
		// and call decomposeBet.
		await Promise.all([
			runBetDecomposition(deps, "bet-ac1-dup"),
			runBetDecomposition(deps, "bet-ac1-dup"),
		]);

		// Exactly one event emitted (CAS guarantees only the winner reaches the emit site)
		expect(emitted.length).toBe(1);
		// Exactly one decomposeBet call
		expect(strategy.decomposeBet).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// AC2: Minimal Strategy → AK3 parity; Fabric Strategy → AK3 parity
// ---------------------------------------------------------------------------

describe("AK8 AC2: Strategy produces task breakdown — AK3 parity", () => {
	afterEach(() => clearActiveStrategy());

	test("Minimal Strategy: ≥1 task created, owned by eligible agent, state=accepted", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithTwoAgents(db);
		await db.insert(bets).values(makeBet("bet-ac2-min", teamId, "active"));

		const strategy = makeFabricLikeStrategyWithDecompose();
		setActiveStrategy(strategy);

		const stubTurn = vi.fn().mockResolvedValue([
			{ title: "Minimal task 1", ownerRole: "product_manager" },
			{ title: "Minimal task 2", ownerRole: "builder" },
		]);

		const deps = makeTestDeps(db, eventBus, { runDecompositionTurn: stubTurn });
		await runBetDecomposition(deps, "bet-ac2-min");

		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-ac2-min"));
		expect(bet?.decompositionStatus).toBe("done");

		const createdTasks = await db.select().from(tasks).where(eq(tasks.betId, "bet-ac2-min"));
		expect(createdTasks.length).toBeGreaterThanOrEqual(1);

		const eligible = await findEligibleTeamAgents(db, teamId);
		const eligibleIds = eligible.map((u) => u.id);

		for (const task of createdTasks) {
			expect(task.ownerAgentId).toBeTruthy();
			expect(eligibleIds).toContain(task.ownerAgentId);
			expect(task.state).toBe("accepted");
		}
	});

	test("Fabric-like Strategy: AK3 parity — tasks created, eligible owners, accepted (NOT knowledge breakdown)", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithTwoAgents(db);
		await db.insert(bets).values(makeBet("bet-ac2-fab", teamId, "active"));

		// Fabric-like: decomposeBet returns tasks:[], Kernel runs override turn
		// Same as AK3 parity — no knowledge-derived task list (plan §Fabric v1)
		const strategy = makeFabricLikeStrategyWithDecompose();
		setActiveStrategy(strategy);

		const stubTurn = vi
			.fn()
			.mockResolvedValue([{ title: "Fabric task A" }, { title: "Fabric task B" }]);

		const deps = makeTestDeps(db, eventBus, { runDecompositionTurn: stubTurn });
		await runBetDecomposition(deps, "bet-ac2-fab");

		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-ac2-fab"));
		expect(bet?.decompositionStatus).toBe("done");

		const createdTasks = await db.select().from(tasks).where(eq(tasks.betId, "bet-ac2-fab"));
		expect(createdTasks.length).toBeGreaterThanOrEqual(1);

		const eligible = await findEligibleTeamAgents(db, teamId);
		const eligibleIds = eligible.map((u) => u.id);

		for (const task of createdTasks) {
			expect(task.ownerAgentId).toBeTruthy();
			expect(eligibleIds).toContain(task.ownerAgentId);
			expect(task.state).toBe("accepted");
		}
	});
});

// ---------------------------------------------------------------------------
// AC3: All AK3 guarantees hold under any Strategy
// ---------------------------------------------------------------------------

describe("AK8 AC3: AK3 guarantees hold under Strategy (no regression)", () => {
	afterEach(() => clearActiveStrategy());

	test("no eligible agents → blocked/no_eligible_agent (AK3 guarantee preserved)", async ({
		db,
		eventBus,
	}) => {
		// Team with only a strategy agent — no eligible team agents
		await db.insert(teams).values(makeTeam("team-nea-ak8"));
		await db.insert(teamMembers).values(makeMembership("tm-nea-ak8", "team-nea-ak8"));
		await db
			.insert(users)
			.values(
				makeAiUser("strat-ak8", "strategy_lead", "tm-nea-ak8", { agentCategory: "strategy" }),
			);
		await db.insert(bets).values(makeBet("bet-nea-ak8", "team-nea-ak8", "active"));

		const strategy = makeMinimalStrategyWithDecomposeSpy();
		setActiveStrategy(strategy);

		const deps = makeTestDeps(db, eventBus);
		await runBetDecomposition(deps, "bet-nea-ak8");

		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-nea-ak8"));
		expect(bet?.decompositionStatus).toBe("blocked");
		expect(bet?.decompositionBlockerReason).toBe("no_eligible_agent");

		// decomposeBet should NOT have been called (no eligible agents)
		expect(strategy.decomposeBet).not.toHaveBeenCalled();

		const createdTasks = await db.select().from(tasks).where(eq(tasks.betId, "bet-nea-ak8"));
		expect(createdTasks).toHaveLength(0);
	});

	test("invalid decomposerAgentId (off-team id) → blocked/no_eligible_agent (inline guard — WARNING 1)", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithTwoAgents(db);
		await db.insert(bets).values(makeBet("bet-invalid-decomposer", teamId, "active"));

		// Strategy returns an off-team agent id that is NOT in the candidates list.
		// The Kernel must call decomposeBet, get the off-team id, then the inline
		// validation guard (candidates.some check) rejects it → blocked/no_eligible_agent.
		// WARNING 1: this guard must be re-implemented inline since selectOwner's internal
		// guard no longer runs once selectOwner(bet_decomposer) is removed.
		const offTeamAgentId = "off-team-agent-xyz";
		const badStrategy = {
			assembleContext: vi.fn().mockResolvedValue({ itemCount: 0, durationMs: 0 }),
			beginLearningIngestion: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			scaffoldAgents: vi.fn().mockResolvedValue([]),
			// selectAgent returns null for all surfaces (not used in AK8 decomposition flow)
			selectAgent: vi.fn().mockResolvedValue({ agentId: null }),
			decomposeBet: vi.fn().mockResolvedValue({
				decomposerAgentId: offTeamAgentId, // off-team — not in candidates
				tasks: [],
			}),
			// AR4b: formAssistant stub — AK8 tests are not about assistant formation.
			formAssistant: vi
				.fn()
				.mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
		};
		setActiveStrategy(badStrategy);

		const deps = makeTestDeps(db, eventBus);
		await runBetDecomposition(deps, "bet-invalid-decomposer");

		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-invalid-decomposer"));
		expect(bet?.decompositionStatus).toBe("blocked");
		expect(bet?.decompositionBlockerReason).toBe("no_eligible_agent");

		// decomposeBet MUST have been called — the Kernel asked the Strategy before
		// the inline guard rejected the off-team id. If this fails, the Kernel either
		// didn't call decomposeBet at all (red phase — proves the test correctly fails)
		// or short-circuited before asking the Strategy (regression).
		expect(badStrategy.decomposeBet).toHaveBeenCalledWith(
			expect.objectContaining({ betId: "bet-invalid-decomposer" }),
		);
	});

	test("Strategy.decomposeBet throws → blocked/failed (no false promise — AK3 guarantee)", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithTwoAgents(db);
		await db.insert(bets).values(makeBet("bet-throw-decompose", teamId, "active"));

		const throwingStrategy = {
			assembleContext: vi.fn().mockResolvedValue({ itemCount: 0, durationMs: 0 }),
			beginLearningIngestion: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			scaffoldAgents: vi.fn().mockResolvedValue([]),
			selectAgent: vi.fn().mockResolvedValue({ agentId: null }),
			decomposeBet: vi.fn().mockRejectedValue(new Error("Knowledge service unavailable")),
			// AR4b: formAssistant stub — AK8 tests are not about assistant formation.
			formAssistant: vi
				.fn()
				.mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
		};
		setActiveStrategy(throwingStrategy);

		const deps = makeTestDeps(db, eventBus);
		// runBetDecomposition NEVER throws — always writes terminal status
		await expect(runBetDecomposition(deps, "bet-throw-decompose")).resolves.toBeUndefined();

		const [bet] = await db.select().from(bets).where(eq(bets.id, "bet-throw-decompose"));
		expect(bet?.decompositionStatus).toBe("blocked");
		expect(bet?.decompositionBlockerReason).toBe("failed");
	});

	test("duplicate bet_state_changed(active) via subscriber → exactly one decomposition (CAS idempotency)", async ({
		db,
		eventBus,
	}) => {
		const { teamId } = await seedTeamWithTwoAgents(db);
		await db.insert(bets).values(makeBet("bet-sub-dup-ak8", teamId, "active"));

		const strategy = makeMinimalStrategyWithDecomposeSpy();
		setActiveStrategy(strategy);

		const stubTurn = vi.fn().mockResolvedValue([{ title: "Idempotent task" }]);
		const deps = makeTestDeps(db, eventBus, { runDecompositionTurn: stubTurn });
		const dispose = registerBetDecomposition(deps);

		// Emit bet_state_changed(active) twice — subscriber fires twice
		eventBus.emit({
			type: "bet_state_changed",
			streamId: teamId,
			betId: "bet-sub-dup-ak8",
			fromState: "draft",
			toState: "active",
			timestamp: Date.now(),
		});
		eventBus.emit({
			type: "bet_state_changed",
			streamId: teamId,
			betId: "bet-sub-dup-ak8",
			fromState: "draft",
			toState: "active",
			timestamp: Date.now(),
		});

		await new Promise<void>((resolve) => setTimeout(resolve, 300));

		// CAS: exactly one decomposeBet call
		expect(strategy.decomposeBet).toHaveBeenCalledTimes(1);

		// Exactly one task set (not doubled)
		const createdTasks = await db.select().from(tasks).where(eq(tasks.betId, "bet-sub-dup-ak8"));
		expect(createdTasks.length).toBe(1);

		dispose();
	});
});

// ---------------------------------------------------------------------------
// AC4: Runtime strategy-swap proof (divergent-decomposer fixture)
// ---------------------------------------------------------------------------

describe("AK8 AC4: Runtime strategy-swap changes decomposer — no Kernel code change", () => {
	afterEach(() => clearActiveStrategy());

	test("Minimal Strategy picks PM as decomposer; divergent Strategy picks first candidate — different decomposers, no Kernel edit", async ({
		db,
		eventBus,
	}) => {
		// Team with two agents: pm-agent (product_manager) and builder-agent (builder).
		// Minimal picks pm-agent (role-match PM).
		// Divergent picks builder-agent (first candidate by users.id — "builder-ac4" < "pm-ac4").
		// BOTH use the same Kernel code (runBetDecomposition unchanged).
		// This is the RUNTIME AC4 proof — WARNING 2 / CRITICAL 2 resolved.
		const { teamId, pmAgentId, builderAgentId } = await seedTeamWithTwoAgents(db, {
			teamId: "team-ac4",
			membershipId: "tm-ac4",
			pmAgentId: "pm-ac4",
			builderAgentId: "builder-ac4",
		});

		// --- Run 1: Minimal Strategy ---
		await db.insert(bets).values(makeBet("bet-ac4-min", teamId, "active"));
		const minimalStrategy = makeMinimalStrategyWithDecomposeSpy();
		setActiveStrategy(minimalStrategy);

		const minStubTurn = vi.fn().mockResolvedValue([{ title: "Minimal decomp task" }]);
		const minDeps = makeTestDeps(db, eventBus, { runDecompositionTurn: minStubTurn });
		await runBetDecomposition(minDeps, "bet-ac4-min");
		clearActiveStrategy();

		// The stub receives pmAgentId from the runDecompositionTurn ctx.pmAgentId
		// (the decomposerAgentId the Kernel uses after plan validation).
		// Assert Minimal's decomposeBet was called and returned PM as decomposer.
		expect(minimalStrategy.decomposeBet).toHaveBeenCalledWith(
			expect.objectContaining({ betId: "bet-ac4-min" }),
		);
		const minPlan = (await minimalStrategy.decomposeBet.mock.results[0]
			?.value) as DecompositionPlan;
		expect(minPlan.decomposerAgentId).toBe(pmAgentId);

		// --- Run 2: Divergent Strategy (picks first = builder) ---
		await db.insert(bets).values(makeBet("bet-ac4-div", teamId, "active"));
		const divergentStrategy = makeDivergentDecomposerStrategy();
		setActiveStrategy(divergentStrategy);

		const divStubTurn = vi.fn().mockResolvedValue([{ title: "Divergent decomp task" }]);
		const divDeps = makeTestDeps(db, eventBus, { runDecompositionTurn: divStubTurn });
		await runBetDecomposition(divDeps, "bet-ac4-div");

		expect(divergentStrategy.decomposeBet).toHaveBeenCalledWith(
			expect.objectContaining({ betId: "bet-ac4-div" }),
		);
		const divPlan = (await divergentStrategy.decomposeBet.mock.results[0]
			?.value) as DecompositionPlan;
		expect(divPlan.decomposerAgentId).toBe(builderAgentId);

		// AC4 proof: the two decomposer ids differ — behaviour changed with no Kernel edit.
		expect(minPlan.decomposerAgentId).not.toBe(divPlan.decomposerAgentId);

		// The stub turns were called with the respective decomposer agent ids
		// (Kernel passes plan.decomposerAgentId to the override turn — 3-way precedence branch 2)
		expect(minStubTurn).toHaveBeenCalledWith(expect.objectContaining({ pmAgentId: pmAgentId }));
		expect(divStubTurn).toHaveBeenCalledWith(
			expect.objectContaining({ pmAgentId: builderAgentId }),
		);

		void pmAgentId;
		void builderAgentId;
	});
});
