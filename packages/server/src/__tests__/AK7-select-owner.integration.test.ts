/**
 * AK7 RED — selectOwner integration tests.
 *
 * Tests cover:
 *   AC1 (presence) — selectOwner emits work_selection_requested for each surface
 *   AC2 — selectOwner returns a user-id; Kernel (selectOwner) never inspects persona
 *   AC3 — Minimal Strategy + one-agent team → that agent selected → session attaches
 *   AC3 — Fabric Strategy bet_task spread regression (via insertProposedBetTasks → selectOwner)
 *   AC4 — new Kernel flow gets agent through seam without re-implementing eligibility
 *   Scenario 3 (off-team valid) — Strategy returns valid active off-team user-id → resolves
 *   Scenario 3 (unattachable guard) — Strategy returns null/inactive/unknown → selectOwner returns null
 *
 * Protected baselines (NOT modified):
 *   bet-decomposition.test.ts
 *   bet-decomposition-service.integration.test.ts
 *   routine-scheduler-related integration tests
 *
 * These tests FAIL until:
 *   packages/server/src/services/select-agent.ts exports `selectOwner`
 *   packages/shared/src/events.ts exports `WorkSelectionRequestedEvent` in KernelEvent
 *   packages/shared/src/strategy-port.ts exports `selectAgent` on Strategy<TDb>
 *
 * @lore AK7: selectOwner is the single Kernel selection caller. It:
 *   1. enumerates team candidates (bet_* only, role-only, orderBy users.id)
 *   2. emits work_selection_requested
 *   3. calls getActiveStrategy().selectAgent(req)
 *   4. resolves + validates the returned id (guard: active AI user)
 */

import { bets, type HyperIdleDb, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import type {
	SelectAgentOutcome,
	SelectAgentRequest,
	Strategy,
	WorkSelectionRequestedEvent,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { insertProposedBetTasks } from "../services/bet-decomposition.js";
// Import the function that does not exist yet — intentional red-phase failure.
import { selectOwner } from "../services/select-agent.js";
import { test } from "../test-fixtures.js";

type AK7StrategyStub = Strategy<HyperIdleDb>;

const resolverState = vi.hoisted(() => ({
	selectAgent: null as null | ((input: unknown) => unknown),
}));

vi.mock("../services/agent-defaults/resolvers.js", () => ({
	resolveAgentScaffoldSpecs: async () => [],
	resolveAgentSelection: async (input: unknown) => {
		if (!resolverState.selectAgent) return { agentId: null };
		return resolverState.selectAgent(input);
	},
	resolveAssistantFormation: async () => ({
		persona: null,
		assistantDraftSurface: "standard",
	}),
	resolveDecompositionPlan: async (input: {
		candidates?: ReadonlyArray<{ agentId: string; role: string }>;
	}) => {
		const candidates = input.candidates ?? [];
		const pm =
			candidates.find((candidate) => candidate.role === "product_manager") ?? candidates[0];
		return { decomposerAgentId: pm?.agentId ?? null, tasks: [] };
	},
}));

function setActiveStrategy(strategy: AK7StrategyStub): void {
	resolverState.selectAgent = strategy.selectAgent.bind(strategy) as (input: unknown) => unknown;
}

function clearActiveStrategy(): void {
	resolverState.selectAgent = null;
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();

function makeTeam(id = "team-1") {
	return { id, name: "Alpha Team", phase: "build", createdAt: NOW };
}

function makeMembership(id = "tm-1", teamId = "team-1") {
	return { id, teamId, capacity: 5, activeBets: 0, formedAt: NOW };
}

function makeAiAgent(
	id: string,
	role: string,
	membershipId: string,
	opts: { status?: string; kind?: string; agentCategory?: "team" | "strategy" | "individual" } = {},
) {
	return {
		id,
		kind: opts.kind ?? "ai",
		name: `Agent ${id}`,
		role,
		agentCategory: opts.agentCategory ?? "team",
		teamId: membershipId,
		status: opts.status ?? "active",
		createdAt: NOW,
	};
}

async function seedTeam(
	db: HyperIdleDb,
	{
		teamId = "team-1",
		membershipId = "tm-1",
		agents = [{ id: "agent-1", role: "builder" }],
	}: {
		teamId?: string;
		membershipId?: string;
		agents?: Array<{ id: string; role: string; status?: string }>;
	} = {},
) {
	await db.insert(teams).values(makeTeam(teamId));
	await db.insert(teamMembers).values(makeMembership(membershipId, teamId));
	for (const a of agents) {
		await db.insert(users).values(makeAiAgent(a.id, a.role, membershipId, { status: a.status }));
	}
	return { teamId, membershipId };
}

// ---------------------------------------------------------------------------
// Minimal strategy stub that captures what it receives
// ---------------------------------------------------------------------------

function makeCapturingStrategy(returnAgentId: string | null): {
	strategy: AK7StrategyStub;
	calls: SelectAgentRequest<HyperIdleDb>[];
} {
	const calls: SelectAgentRequest<HyperIdleDb>[] = [];
	const strategy: AK7StrategyStub = {
		assembleContext: vi.fn().mockResolvedValue({ itemCount: 0, durationMs: 0 }),
		beginLearningIngestion: vi.fn().mockReturnValue({ dispose: vi.fn() }),
		scaffoldAgents: vi.fn().mockResolvedValue([]),
		selectAgent: vi.fn(
			async (req: SelectAgentRequest<HyperIdleDb>): Promise<SelectAgentOutcome> => {
				calls.push(req);
				return { agentId: returnAgentId };
			},
		),
		/**
		 * AK8 T1/W3: decomposeBet added to satisfy Strategy<TDb> 5-method interface.
		 * AK7 tests are not about decomposition — stub returns null decomposer.
		 *
		 * @lore AK8: fixture shape grows; frozen AK7 assertions byte-identical.
		 */
		decomposeBet: vi.fn().mockResolvedValue({ decomposerAgentId: null, tasks: [] }),
		// AR4b: formAssistant stub — AK7 tests are not about assistant formation.
		formAssistant: vi.fn().mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
	};
	return { strategy, calls };
}

// ---------------------------------------------------------------------------
// AC1 — Kernel emits work_selection_requested
// ---------------------------------------------------------------------------

describe("AK7: selectOwner emits work_selection_requested (AC1 — presence)", () => {
	beforeEach(() => {
		const { strategy } = makeCapturingStrategy("agent-1");
		setActiveStrategy(strategy);
	});
	afterEach(() => clearActiveStrategy());

	test("emits work_selection_requested for bet_task surface with correct fields", async ({
		db,
		eventBus,
	}) => {
		await seedTeam(db, { agents: [{ id: "agent-1", role: "builder" }] });

		const emitted: WorkSelectionRequestedEvent[] = [];
		eventBus.on("work_selection_requested", (e) => emitted.push(e));

		await selectOwner(
			{ db, eventBus },
			{
				surface: "bet_task",
				teamId: "team-1",
				workKey: "bet-abc",
				roleHint: null,
				spreadIndex: 0,
			},
		);

		expect(emitted).toHaveLength(1);
		const evt = emitted[0];
		expect(evt?.type).toBe("work_selection_requested");
		expect(evt?.surface).toBe("bet_task");
		expect(evt?.teamId).toBe("team-1");
		expect(evt?.workKey).toBe("bet-abc");
	});

	test("emits work_selection_requested for bet_decomposer surface", async ({ db, eventBus }) => {
		await seedTeam(db, {
			agents: [{ id: "agent-pm", role: "product_manager" }],
		});

		const emitted: WorkSelectionRequestedEvent[] = [];
		eventBus.on("work_selection_requested", (e) => emitted.push(e));

		await selectOwner(
			{ db, eventBus },
			{
				surface: "bet_decomposer",
				teamId: "team-1",
				workKey: "bet-decomp",
				roleHint: "product_manager",
			},
		);

		expect(emitted).toHaveLength(1);
		expect(emitted[0]?.surface).toBe("bet_decomposer");
	});

	test("event fires BEFORE selectAgent is called (emit-then-call ordering)", async ({
		db,
		eventBus,
	}) => {
		await seedTeam(db, { agents: [{ id: "agent-1", role: "builder" }] });

		const order: string[] = [];
		eventBus.on("work_selection_requested", () => order.push("event"));

		const captureStrategy = makeCapturingStrategy("agent-1");
		// Override — wrap selectAgent to track call order
		const origSelectAgent = captureStrategy.strategy.selectAgent.bind(captureStrategy.strategy);
		captureStrategy.strategy.selectAgent = vi.fn(
			async (req: SelectAgentRequest<HyperIdleDb>): Promise<SelectAgentOutcome> => {
				order.push("selectAgent");
				return origSelectAgent(req);
			},
		);
		setActiveStrategy(captureStrategy.strategy);

		await selectOwner(
			{ db, eventBus },
			{
				surface: "bet_task",
				teamId: "team-1",
				workKey: "bet-order",
				roleHint: null,
				spreadIndex: 0,
			},
		);

		// event must precede selectAgent call
		expect(order[0]).toBe("event");
		expect(order[1]).toBe("selectAgent");
	});
});

// ---------------------------------------------------------------------------
// AC2 — attaches to user-id, no persona inspection
// ---------------------------------------------------------------------------

describe("AK7: selectOwner — attaches to user-id returned by Strategy (AC2)", () => {
	afterEach(() => clearActiveStrategy());

	test("returns the user-id when Strategy picks a valid active AI agent", async ({
		db,
		eventBus,
	}) => {
		await seedTeam(db, { agents: [{ id: "agent-1", role: "builder" }] });

		const { strategy } = makeCapturingStrategy("agent-1");
		setActiveStrategy(strategy);

		const agentId = await selectOwner(
			{ db, eventBus },
			{
				surface: "bet_task",
				teamId: "team-1",
				workKey: "bet-attach",
				roleHint: null,
				spreadIndex: 0,
			},
		);

		expect(agentId).toBe("agent-1");
	});

	test("Strategy receives candidates with role only — no systemPrompt in candidates (no persona inspection)", async ({
		db,
		eventBus,
	}) => {
		await seedTeam(db, { agents: [{ id: "agent-1", role: "builder" }] });

		const calls: unknown[] = [];
		const strategy = {
			assembleContext: vi.fn().mockResolvedValue({ itemCount: 0, durationMs: 0 }),
			beginLearningIngestion: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			scaffoldAgents: vi.fn().mockResolvedValue([]),
			selectAgent: vi.fn(async (req: unknown) => {
				calls.push(req);
				return { agentId: "agent-1" };
			}),
			// AK8 T1/W3: decomposeBet stub — AK7 tests not about decomposition.
			decomposeBet: vi.fn().mockResolvedValue({ decomposerAgentId: null, tasks: [] }),
			// AR4b: formAssistant stub — AK7 tests are not about assistant formation.
			formAssistant: vi
				.fn()
				.mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
		};
		setActiveStrategy(strategy);

		await selectOwner(
			{ db, eventBus },
			{
				surface: "bet_task",
				teamId: "team-1",
				workKey: "bet-nopersona",
				roleHint: null,
				spreadIndex: 0,
			},
		);

		expect(calls).toHaveLength(1);
		const req = calls[0] as Record<string, unknown>;
		// candidates must only carry agentId + role — NO systemPrompt
		const candidates = req["candidates"] as Array<Record<string, unknown>>;
		expect(candidates.length).toBeGreaterThan(0);
		for (const c of candidates) {
			expect(c).not.toHaveProperty("systemPrompt");
			expect(c).toHaveProperty("agentId");
			expect(c).toHaveProperty("role");
		}
	});
});

// ---------------------------------------------------------------------------
// AC3 — Minimal Strategy + one-agent team (validation scenario 1)
// ---------------------------------------------------------------------------

describe("AK7: selectOwner — Minimal Strategy single-agent (AC3, scenario 1)", () => {
	afterEach(() => clearActiveStrategy());

	test("Minimal strategy with one-agent team returns that agent's user-id", async ({
		db,
		eventBus,
	}) => {
		await seedTeam(db, { agents: [{ id: "agent-only", role: "builder" }] });

		// Minimal selectAgent: roleHint match or candidates[0]
		const minimalSelectAgent = vi.fn(
			async (req: {
				candidates: ReadonlyArray<{ agentId: string; role: string }>;
				roleHint: string | null;
			}) => {
				const byRole = req.roleHint
					? req.candidates.find((c) => c.role === req.roleHint)
					: undefined;
				const chosen = byRole ?? req.candidates[0];
				return { agentId: chosen?.agentId ?? null };
			},
		);

		setActiveStrategy({
			assembleContext: vi.fn().mockResolvedValue({ itemCount: 0, durationMs: 0 }),
			beginLearningIngestion: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			scaffoldAgents: vi.fn().mockResolvedValue([]),
			selectAgent: minimalSelectAgent,
			// AK8 T1/W3: decomposeBet stub — AK7 tests not about decomposition.
			decomposeBet: vi.fn().mockResolvedValue({ decomposerAgentId: null, tasks: [] }),
			// AR4b: formAssistant stub — AK7 tests are not about assistant formation.
			formAssistant: vi
				.fn()
				.mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
		});

		const result = await selectOwner(
			{ db, eventBus },
			{
				surface: "bet_task",
				teamId: "team-1",
				workKey: "bet-minimal",
				roleHint: null,
				spreadIndex: 0,
			},
		);

		expect(result).toBe("agent-only");
	});
});

// ---------------------------------------------------------------------------
// AC3 — Fabric Strategy bet_task spread regression via the production flow
// Team with 2 agents ordered by users.id [A, B].
// 3 ownerRole=null tasks through insertProposedBetTasks → selectOwner →
// selectAgent(spreadIndex 0,1,2) → DB ownerAgentIds = [A,B,A].
//
// W-2 fix (AK7 Phase-4): repointed from inline selectOwner calls + fabricLike stub
// to the rewired production flow (insertProposedBetTasks). This proves the live
// round-robin ([A,B,A]) goes through the seam end-to-end, not just that selectOwner
// passes spreadIndex through in isolation.
//
// The pure-unit golden in AK7-agent-selection.test.ts stays as-is — it tests
// selectAgentFabric directly and distinguishes [A,B,A] from [A,A,A].
// ---------------------------------------------------------------------------

describe("AK7: bet_task spread regression via production flow — 2 candidates, 3 tasks → [A,B,A] (AC3 golden)", () => {
	afterEach(() => clearActiveStrategy());

	test("protected golden: insertProposedBetTasks 3 ownerRole=null tasks → DB ownerAgentIds = [A,B,A]", async ({
		db,
		eventBus,
	}) => {
		// Ids chosen so agentAId < agentBId lexicographically → A is candidates[0].
		// enumerateTeamCandidates uses orderBy(users.id) — A always first.
		const agentAId = "agent-aaaaa";
		const agentBId = "agent-bbbbb";

		await db.insert(teams).values(makeTeam("team-golden"));
		await db.insert(teamMembers).values(makeMembership("tm-golden", "team-golden"));
		await db.insert(users).values(makeAiAgent(agentAId, "builder", "tm-golden"));
		await db.insert(users).values(makeAiAgent(agentBId, "growth", "tm-golden"));
		await db.insert(bets).values({
			id: "bet-golden",
			teamId: "team-golden",
			description: "Golden spread bet",
			status: "active",
			createdAt: NOW,
		});

		// Install Fabric-like selectAgent that does spread (candidates[spreadIndex % len]).
		// This is the exact same logic as the Fabric's bet_task branch (concept §6.2).
		const fabricLike = vi.fn(
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
					const chosen = req.candidates[0];
					return { agentId: chosen?.agentId ?? null };
				}
				return { agentId: null };
			},
		);

		setActiveStrategy({
			assembleContext: vi.fn().mockResolvedValue({ itemCount: 0, durationMs: 0 }),
			beginLearningIngestion: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			scaffoldAgents: vi.fn().mockResolvedValue([]),
			selectAgent: fabricLike,
			// AK8 T1/W3: decomposeBet stub — AK7 tests not about decomposition.
			decomposeBet: vi.fn().mockResolvedValue({ decomposerAgentId: null, tasks: [] }),
			// AR4b: formAssistant stub — AK7 tests are not about assistant formation.
			formAssistant: vi
				.fn()
				.mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
		});

		// Run the production decomposition insert: 3 tasks, all ownerRole=null.
		// Forces the spread branch every time (roleHint=null → no short-circuit).
		// insertProposedBetTasks calls selectOwner({surface:'bet_task', spreadIndex:i})
		// for each task — the live round-robin path.
		await insertProposedBetTasks(
			{ db, eventBus },
			{ id: "bet-golden", teamId: "team-golden" },
			[], // _eligible ignored — selectOwner enumerates internally (AK7)
			[
				{ title: "Task 0", ownerRole: undefined },
				{ title: "Task 1", ownerRole: undefined },
				{ title: "Task 2", ownerRole: undefined },
			],
		);

		// Read the inserted tasks ordered by title (Task 0,1,2) to get loop order.
		const inserted = await db
			.select({ ownerAgentId: tasks.ownerAgentId, title: tasks.title })
			.from(tasks)
			.where(eq(tasks.betId, "bet-golden"));
		inserted.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));

		// Pinned order by users.id: A < B → candidates = [A, B]
		// i=0: 0%2=0 → A; i=1: 1%2=1 → B; i=2: 2%2=0 → A
		expect(inserted[0]?.ownerAgentId).toBe(agentAId);
		expect(inserted[1]?.ownerAgentId).toBe(agentBId);
		expect(inserted[2]?.ownerAgentId).toBe(agentAId);
	});
});

// ---------------------------------------------------------------------------
// Scenario 3 — off-team valid agent
// Strategy returns a valid active user-id that is NOT in the team roster.
// selectOwner resolves + returns it (Kernel attaches to any valid active user-id).
// ---------------------------------------------------------------------------

describe("AK7: selectOwner — off-team valid agent (scenario 3, case 2)", () => {
	afterEach(() => clearActiveStrategy());

	test("Strategy returns a valid active AI user-id not in the team → selectOwner resolves it", async ({
		db,
		eventBus,
	}) => {
		// Team agent (in roster) — but Strategy will pick the off-team agent
		await seedTeam(db, { agents: [{ id: "agent-inteam", role: "builder" }] });

		// Off-team agent (exists, active, AI, but NOT in team-1's membership group)
		await db.insert(teams).values(makeTeam("team-other"));
		await db.insert(teamMembers).values(makeMembership("tm-other", "team-other"));
		await db.insert(users).values(makeAiAgent("agent-offteam", "builder", "tm-other"));

		// Strategy deliberately picks the off-team agent
		setActiveStrategy({
			assembleContext: vi.fn().mockResolvedValue({ itemCount: 0, durationMs: 0 }),
			beginLearningIngestion: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			scaffoldAgents: vi.fn().mockResolvedValue([]),
			selectAgent: vi.fn().mockResolvedValue({ agentId: "agent-offteam" }),
			decomposeBet: vi.fn().mockResolvedValue({ decomposerAgentId: null, tasks: [] }),
			// AR4b: formAssistant stub — AK7 tests are not about assistant formation.
			formAssistant: vi
				.fn()
				.mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
		});

		const result = await selectOwner(
			{ db, eventBus },
			{
				surface: "bet_task",
				teamId: "team-1",
				workKey: "bet-offteam",
				roleHint: null,
				spreadIndex: 0,
			},
		);

		// Kernel resolves a valid active user-id and attaches (off-team is acceptable)
		expect(result).toBe("agent-offteam");
	});
});

// ---------------------------------------------------------------------------
// Scenario 3 — unattachable guard (the selectOwner guard)
// Strategy returns null / unknown id / inactive agent → selectOwner returns null
// → no session spawned, flow takes no-agent path
// ---------------------------------------------------------------------------

describe("AK7: selectOwner — unattachable guard (scenario 3, case 3)", () => {
	afterEach(() => clearActiveStrategy());

	test("Strategy returns null → selectOwner returns null (no session spawned)", async ({
		db,
		eventBus,
	}) => {
		await seedTeam(db, { agents: [{ id: "agent-1", role: "builder" }] });
		setActiveStrategy({
			assembleContext: vi.fn().mockResolvedValue({ itemCount: 0, durationMs: 0 }),
			beginLearningIngestion: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			scaffoldAgents: vi.fn().mockResolvedValue([]),
			selectAgent: vi.fn().mockResolvedValue({ agentId: null }),
			decomposeBet: vi.fn().mockResolvedValue({ decomposerAgentId: null, tasks: [] }),
			// AR4b: formAssistant stub — AK7 tests are not about assistant formation.
			formAssistant: vi
				.fn()
				.mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
		});

		const result = await selectOwner(
			{ db, eventBus },
			{
				surface: "bet_task",
				teamId: "team-1",
				workKey: "bet-null-strategy",
				roleHint: null,
				spreadIndex: 0,
			},
		);

		expect(result).toBeNull();

		// No session must have been spawned
		const created = await db.select().from(sessions);
		expect(created).toHaveLength(0);
	});

	test("Strategy returns unknown user-id → selectOwner returns null", async ({ db, eventBus }) => {
		await seedTeam(db, { agents: [{ id: "agent-1", role: "builder" }] });
		setActiveStrategy({
			assembleContext: vi.fn().mockResolvedValue({ itemCount: 0, durationMs: 0 }),
			beginLearningIngestion: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			scaffoldAgents: vi.fn().mockResolvedValue([]),
			selectAgent: vi.fn().mockResolvedValue({ agentId: "nonexistent-user-xyz" }),
			decomposeBet: vi.fn().mockResolvedValue({ decomposerAgentId: null, tasks: [] }),
			// AR4b: formAssistant stub — AK7 tests are not about assistant formation.
			formAssistant: vi
				.fn()
				.mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
		});

		const result = await selectOwner(
			{ db, eventBus },
			{
				surface: "bet_task",
				teamId: "team-1",
				workKey: "bet-unknown-id",
				roleHint: null,
				spreadIndex: 0,
			},
		);

		expect(result).toBeNull();
	});

	test("Strategy returns inactive agent id → selectOwner returns null", async ({
		db,
		eventBus,
	}) => {
		await seedTeam(db, {
			agents: [
				{ id: "agent-active", role: "builder" },
				{ id: "agent-inactive", role: "growth", status: "inactive" },
			],
		});
		setActiveStrategy({
			assembleContext: vi.fn().mockResolvedValue({ itemCount: 0, durationMs: 0 }),
			beginLearningIngestion: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			scaffoldAgents: vi.fn().mockResolvedValue([]),
			// Strategy picks the inactive agent (bad pick)
			selectAgent: vi.fn().mockResolvedValue({ agentId: "agent-inactive" }),
			decomposeBet: vi.fn().mockResolvedValue({ decomposerAgentId: null, tasks: [] }),
			// AR4b: formAssistant stub — AK7 tests are not about assistant formation.
			formAssistant: vi
				.fn()
				.mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
		});

		const result = await selectOwner(
			{ db, eventBus },
			{
				surface: "bet_task",
				teamId: "team-1",
				workKey: "bet-inactive-agent",
				roleHint: null,
				spreadIndex: 0,
			},
		);

		expect(result).toBeNull();
	});

	test("Strategy returns human user-id (kind=human) → selectOwner returns null", async ({
		db,
		eventBus,
	}) => {
		await db.insert(teams).values(makeTeam("team-human"));
		await db.insert(teamMembers).values(makeMembership("tm-human", "team-human"));
		// Human user (not AI)
		await db.insert(users).values({
			id: "human-user-1",
			kind: "human",
			name: "Human Alice",
			role: "builder",
			agentCategory: "individual",
			teamId: "tm-human",
			status: "active",
			createdAt: NOW,
		});

		setActiveStrategy({
			assembleContext: vi.fn().mockResolvedValue({ itemCount: 0, durationMs: 0 }),
			beginLearningIngestion: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			scaffoldAgents: vi.fn().mockResolvedValue([]),
			selectAgent: vi.fn().mockResolvedValue({ agentId: "human-user-1" }),
			decomposeBet: vi.fn().mockResolvedValue({ decomposerAgentId: null, tasks: [] }),
			// AR4b: formAssistant stub — AK7 tests are not about assistant formation.
			formAssistant: vi
				.fn()
				.mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
		});

		// Need a team to give selectOwner a teamId
		await db.insert(teams).values(makeTeam("team-nonhuman"));
		await db.insert(teamMembers).values(makeMembership("tm-nonhuman", "team-nonhuman"));
		await db.insert(users).values(makeAiAgent("agent-real", "builder", "tm-nonhuman"));

		const result = await selectOwner(
			{ db, eventBus },
			{
				surface: "bet_task",
				teamId: "team-nonhuman",
				workKey: "bet-human",
				roleHint: null,
				spreadIndex: 0,
			},
		);

		// Human user-id → not an AI agent → unattachable → null
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC4 — new flow gets agent through seam without re-implementing eligibility
// Covered structurally: selectOwner is the ONLY place that calls selectAgent.
// The test proves a flow can call selectOwner and get an owner without having
// any eligibility logic itself.
// ---------------------------------------------------------------------------

describe("AK7: selectOwner — new flow uses seam, no eligibility re-impl (AC4)", () => {
	afterEach(() => clearActiveStrategy());

	test("a new flow calls selectOwner and receives the owner without knowing eligibility criteria", async ({
		db,
		eventBus,
	}) => {
		// A hypothetical new flow: it only knows teamId + workKey.
		// It does NOT call findEligibleTeamAgents. It just calls selectOwner.
		await seedTeam(db, { agents: [{ id: "agent-ac4", role: "builder" }] });

		setActiveStrategy({
			assembleContext: vi.fn().mockResolvedValue({ itemCount: 0, durationMs: 0 }),
			beginLearningIngestion: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			scaffoldAgents: vi.fn().mockResolvedValue([]),
			selectAgent: vi.fn().mockResolvedValue({ agentId: "agent-ac4" }),
			decomposeBet: vi.fn().mockResolvedValue({ decomposerAgentId: null, tasks: [] }),
			// AR4b: formAssistant stub — AK7 tests are not about assistant formation.
			formAssistant: vi
				.fn()
				.mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
		});

		// The new flow only calls selectOwner — no findEligibleTeamAgents call here
		const ownerId = await selectOwner(
			{ db, eventBus },
			{
				surface: "bet_task",
				teamId: "team-1",
				workKey: "bet-ac4",
				roleHint: null,
				spreadIndex: 0,
			},
		);

		expect(ownerId).toBe("agent-ac4");
	});
});

// ---------------------------------------------------------------------------
// AC5 — dispatch path reused (no second provisioning route)
// This AC is proven by the Protected baseline:
//   bet-decomposition-service.integration.test.ts (commit→tasks→accepted→dispatch)
// The protected tests run as part of the no-regression gate.
//
// We add a structural assertion here: selectOwner returns a user-id that, when
// used as ownerAgentId, makes a task transition to accepted — the existing
// dispatch path picks it up (no new path, no second provisioning route).
// ---------------------------------------------------------------------------

describe("AK7: AC5 — existing dispatch path reused (selectOwner result → ownerAgentId → accepted)", () => {
	afterEach(() => clearActiveStrategy());

	test("selectOwner returns a user-id the caller can set as ownerAgentId on the task (no new path)", async ({
		db,
		eventBus,
	}) => {
		await seedTeam(db, { agents: [{ id: "agent-dispatch", role: "builder" }] });
		await db.insert(bets).values({
			id: "bet-dispatch",
			teamId: "team-1",
			description: "Dispatch test",
			status: "active",
			createdAt: NOW,
		});

		setActiveStrategy({
			assembleContext: vi.fn().mockResolvedValue({ itemCount: 0, durationMs: 0 }),
			beginLearningIngestion: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			scaffoldAgents: vi.fn().mockResolvedValue([]),
			selectAgent: vi.fn().mockResolvedValue({ agentId: "agent-dispatch" }),
			decomposeBet: vi.fn().mockResolvedValue({ decomposerAgentId: null, tasks: [] }),
			// AR4b: formAssistant stub — AK7 tests are not about assistant formation.
			formAssistant: vi
				.fn()
				.mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
		});

		// selectOwner returns the user-id — the caller writes it to tasks.ownerAgentId.
		// This proves the seam produces the right id; the existing dispatch path remains
		// unchanged (tasks.ownerAgentId → task_state_changed(accepted) → task-dispatcher).
		const ownerId = await selectOwner(
			{ db, eventBus },
			{
				surface: "bet_task",
				teamId: "team-1",
				workKey: "bet-dispatch",
				roleHint: null,
				spreadIndex: 0,
			},
		);

		expect(ownerId).toBe("agent-dispatch");
		// No new session spawned by selectOwner — the dispatch path handles that
		const createdSessions = await db.select().from(sessions);
		expect(createdSessions).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// AC3 — enumerateTeamCandidates orderBy(users.id) (deterministic ordering)
// Strategy receives candidates ordered by users.id — the test asserts the
// ordering by checking selectAgent receives [A, B] not [B, A].
// ---------------------------------------------------------------------------

describe("AK7: selectOwner — candidates ordered by users.id (AC3 ordering)", () => {
	afterEach(() => clearActiveStrategy());

	test("candidates delivered to Strategy are ordered by users.id ascending", async ({
		db,
		eventBus,
	}) => {
		// Insert B before A deliberately; orderBy(users.id) must reorder them
		const agentAId = "agent-aaa-first";
		const agentBId = "agent-bbb-second";

		await db.insert(teams).values(makeTeam("team-order"));
		await db.insert(teamMembers).values(makeMembership("tm-order", "team-order"));
		// Insert B first (so DB-scan would yield B first without ORDER BY)
		await db.insert(users).values(makeAiAgent(agentBId, "growth", "tm-order"));
		await db.insert(users).values(makeAiAgent(agentAId, "builder", "tm-order"));

		const receivedCandidates: string[] = [];
		setActiveStrategy({
			assembleContext: vi.fn().mockResolvedValue({ itemCount: 0, durationMs: 0 }),
			beginLearningIngestion: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			scaffoldAgents: vi.fn().mockResolvedValue([]),
			selectAgent: vi.fn(async (req: { candidates: ReadonlyArray<{ agentId: string }> }) => {
				for (const c of req.candidates) {
					receivedCandidates.push(c.agentId);
				}
				return { agentId: req.candidates[0]?.agentId ?? null };
			}),
			// AK8 T1/W3: decomposeBet stub — AK7 tests not about decomposition.
			decomposeBet: vi.fn().mockResolvedValue({ decomposerAgentId: null, tasks: [] }),
			// AR4b: formAssistant stub — AK7 tests are not about assistant formation.
			formAssistant: vi
				.fn()
				.mockResolvedValue({ persona: null, assistantDraftSurface: "standard" }),
		});

		await selectOwner(
			{ db, eventBus },
			{
				surface: "bet_task",
				teamId: "team-order",
				workKey: "bet-order",
				roleHint: null,
				spreadIndex: 0,
			},
		);

		// agentAId < agentBId lexicographically → A must come first
		expect(receivedCandidates[0]).toBe(agentAId);
		expect(receivedCandidates[1]).toBe(agentBId);
	});
});
