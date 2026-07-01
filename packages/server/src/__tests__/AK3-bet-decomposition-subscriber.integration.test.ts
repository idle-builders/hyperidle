/**
 * AK3 RED — Bet decomposition subscriber integration tests.
 *
 * Tests cover:
 *   AC7  — Idempotency: subscriber CAS guard prevents double-decomposition on duplicate events
 *   AC2  — After subscriber fires, tasks reach 'accepted' so the existing dispatcher picks them up
 *
 * These tests FAIL until:
 *   - packages/server/src/services/bet-decomposition-subscriber.ts exports registerBetDecomposition
 *   - packages/server/src/services/bet-decomposition.ts is implemented
 *   - DB schema has decomposition columns
 *
 * @lore AK3: "Cannot find module" on the subscriber import is the correct red-phase failure.
 */

import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import type { EventBus, SelectAgentOutcome, SelectAgentRequest } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import type { BetDecompositionDeps } from "../services/bet-decomposition.js";
import { registerBetDecomposition } from "../services/bet-decomposition-subscriber.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

// AK3 red phase: DecompositionTaskInput will be in @hyperidle/shared after green phase
type DecompositionTaskInput = {
	title: string;
	description?: string;
	doneCondition?: string;
	ownerRole?: string;
};

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function makeTeam(id: string) {
	return { id, name: `Team ${id}`, phase: "build", createdAt: new Date().toISOString() };
}
function makeMembership(id: string, teamId: string) {
	return { id, teamId, capacity: 5, activeBets: 0, formedAt: new Date().toISOString() };
}
function makeAiUser(id: string, role: string, membershipId: string) {
	return {
		id,
		kind: "ai",
		name: `Agent ${id}`,
		role,
		agentCategory: "team",
		teamId: membershipId,
		status: "active",
		createdAt: new Date().toISOString(),
	};
}
function makeBet(id: string, teamId: string, status = "active") {
	return {
		id,
		teamId,
		description: "Build it",
		status,
		doneCondition: "Done",
		createdAt: new Date().toISOString(),
	};
}

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
		sandboxBasePath: "/tmp/decomp-sub-test",
		...overrides,
	};
}

function emitBetActive(eventBus: EventBus, betId: string, teamId: string): void {
	// BetStateChangedEvent requires timestamp
	eventBus.emit({
		type: "bet_state_changed",
		streamId: teamId,
		betId,
		fromState: "draft" as const,
		toState: "active" as const,
		timestamp: Date.now(),
	});
}

// ---------------------------------------------------------------------------
// Fabric-equivalent strategy fixture (AK7 Phase-4 fix)
//
// runBetDecomposition now routes PM pick + per-task owner through selectOwner →
// getActiveStrategy(). These describe blocks register a Fabric-equivalent strategy
// that reproduces AK3 behaviour byte-identically. Assertions are FROZEN.
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
		 * AK8 T1/W3: decomposeBet added to satisfy Strategy<TDb> 5-method interface.
		 * Returns role-match PM and tasks:[] so tests land on override branch.
		 *
		 * @lore AK8: fixture shape grows; frozen assertions byte-identical.
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AK3: registerBetDecomposition subscriber — idempotency (AC7)", () => {
	// AK7 Phase-4: runBetDecomposition routes PM pick through selectOwner.
	// Register Fabric-equivalent strategy. Assertions frozen.
	beforeEach(() => setActiveStrategy(makeFabricLikeStrategy()));
	afterEach(() => clearActiveStrategy());

	test("emitting bet_state_changed(active) twice runs decomposition only once (CAS guard)", async ({
		db,
		eventBus,
	}) => {
		const teamId = "team-sub-idem";
		const membershipId = "tm-sub-idem";
		await db.insert(teams).values(makeTeam(teamId));
		await db.insert(teamMembers).values(makeMembership(membershipId, teamId));
		await db.insert(users).values(makeAiUser("builder-idem", "builder", membershipId));
		await db.insert(bets).values(makeBet("bet-sub-idem", teamId));

		const stubTurn = vi
			.fn()
			.mockResolvedValue([{ title: "Task from stub" } as DecompositionTaskInput]);

		const deps = makeTestDeps(db, eventBus, { runDecompositionTurn: stubTurn });
		const dispose = registerBetDecomposition(deps);

		// Emit the event TWICE — the CAS guard must deduplicate
		emitBetActive(eventBus, "bet-sub-idem", teamId);
		emitBetActive(eventBus, "bet-sub-idem", teamId);

		// Wait for async decomposition to settle
		await new Promise<void>((resolve) => setTimeout(resolve, 200));

		// The stub must have been called at most once (CAS deduplication)
		expect(stubTurn.mock.calls.length).toBeLessThanOrEqual(1);

		// No duplicate tasks
		const created = await db.select().from(tasks).where(eq(tasks.betId, "bet-sub-idem"));
		expect(created.length).toBeLessThanOrEqual(1);

		dispose();
	});

	test("subscriber ignores bet_state_changed events that are NOT toState=active", async ({
		db,
		eventBus,
	}) => {
		const teamId = "team-sub-skip";
		await db.insert(teams).values(makeTeam(teamId));
		await db.insert(teamMembers).values(makeMembership("tm-sub-skip", teamId));
		await db.insert(bets).values(makeBet("bet-sub-skip", teamId, "draft"));

		const stubTurn = vi.fn();
		const deps = makeTestDeps(db, eventBus, { runDecompositionTurn: stubTurn });
		const dispose = registerBetDecomposition(deps);

		// Emit a completed transition — should NOT trigger decomposition
		eventBus.emit({
			type: "bet_state_changed",
			streamId: teamId,
			betId: "bet-sub-skip",
			fromState: "active" as const,
			toState: "completed" as const,
			timestamp: Date.now(),
		});

		await new Promise<void>((resolve) => setTimeout(resolve, 50));
		expect(stubTurn).not.toHaveBeenCalled();

		dispose();
	});
});

describe("AK3: subscriber → dispatch path (AC2)", () => {
	// AK7 Phase-4: runBetDecomposition routes PM pick + task selection through selectOwner.
	beforeEach(() => setActiveStrategy(makeFabricLikeStrategy()));
	afterEach(() => clearActiveStrategy());

	test("after decomposition, tasks are in accepted state (dispatcher-ready)", async ({
		db,
		eventBus,
	}) => {
		const teamId = "team-dispatch";
		const membershipId = "tm-dispatch";
		await db.insert(teams).values(makeTeam(teamId));
		await db.insert(teamMembers).values(makeMembership(membershipId, teamId));
		await db.insert(users).values(makeAiUser("builder-dispatch", "builder", membershipId));
		await db.insert(bets).values(makeBet("bet-dispatch", teamId));

		const stubTurn = vi
			.fn()
			.mockResolvedValue([
				{ title: "Dispatchable task", ownerRole: "builder" } as DecompositionTaskInput,
			]);

		const deps = makeTestDeps(db, eventBus, { runDecompositionTurn: stubTurn });
		const dispose = registerBetDecomposition(deps);

		emitBetActive(eventBus, "bet-dispatch", teamId);
		await new Promise<void>((resolve) => setTimeout(resolve, 300));

		const created = await db.select().from(tasks).where(eq(tasks.betId, "bet-dispatch"));
		expect(created.length).toBeGreaterThanOrEqual(1);

		for (const task of created) {
			// Must be 'accepted' so task_state_changed(accepted) fires → dispatcher picks it up
			expect(task.state).toBe("accepted");
			// Must have an owner set
			expect(task.ownerAgentId).toBeTruthy();
		}

		dispose();
	});
});
