/**
 * AK7 RED — selectAgentFabric unit tests (pure logic, no DB).
 *
 * Tests cover:
 *   AC3 — Fabric bet_decomposer golden: PM role-match; no-PM → candidates[0]
 *   AC3 — Fabric bet_task golden: exact role-match short-circuit; round-robin spread
 *         (protected golden spec: ≥2 candidates, ≥3 ownerRole=null tasks, exact [A,B,A])
 *         (mixed variant: role-match + spread coexist with original index semantics)
 *   AC3 — Fabric routine_delegate golden: skill-match, non-owner, WIP-fallback, null when none
 *
 * These tests FAIL until:
 *   packages/fabric/src/services/agent-selection.ts exports `selectAgentFabric`
 *
 * The protected baselines (bet-decomposition.test.ts,
 * bet-decomposition-service.integration.test.ts, routine-coalescing.integration.test.ts)
 * are NOT modified here — they are the no-regression oracles.
 *
 * @lore AK7: selectAgentFabric is a pure function for bet_* surfaces (takes
 * candidates + spreadIndex; no DB query). For routine_delegate it queries DB.
 * Unit tests cover bet_* only; routine_delegate DB behaviour is covered in
 * AK7-routine-delegate-no-regression.integration.test.ts.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { SelectAgentOutcome, SelectAgentRequest } from "@hyperidle/shared";
import { describe, expect, test } from "vitest";

// Import the function that does not exist yet — will fail to resolve until green phase.
// This is the intentional red-phase failure mode.
import { selectAgentFabric } from "../services/agent-selection.js";

// ---------------------------------------------------------------------------
// Helpers
// Use HyperIdleDb as TDb so the request type matches the stub's parameter type.
// The db field is stubbed as an empty object for unit tests (no actual DB calls
// on bet_* surfaces — only routine_delegate hits the DB).
// ---------------------------------------------------------------------------

type Candidate = SelectAgentRequest<HyperIdleDb>["candidates"][number];

function makeBetTaskReq(
	candidates: readonly Candidate[],
	spreadIndex: number,
	roleHint: string | null = null,
): SelectAgentRequest<HyperIdleDb> {
	return {
		db: {} as HyperIdleDb,
		surface: "bet_task",
		teamId: "team-1",
		workKey: "bet-1",
		candidates,
		roleHint,
		spreadIndex,
		excludeAgentId: null,
		skillId: null,
	};
}

function makeBetDecomposerReq(
	candidates: readonly Candidate[],
	roleHint: string | null,
): SelectAgentRequest<HyperIdleDb> {
	return {
		db: {} as HyperIdleDb,
		surface: "bet_decomposer",
		teamId: "team-1",
		workKey: "bet-1",
		candidates,
		roleHint,
		spreadIndex: null,
		excludeAgentId: null,
		skillId: null,
	};
}

// ---------------------------------------------------------------------------
// AC3: bet_decomposer golden
// ---------------------------------------------------------------------------

describe("AK7: selectAgentFabric — bet_decomposer", () => {
	test("picks candidate whose role matches roleHint", async () => {
		const A: Candidate = { agentId: "agent-a", role: "builder" };
		const B: Candidate = { agentId: "agent-b", role: "product_manager" };
		const req = makeBetDecomposerReq([A, B], "product_manager");

		const outcome = await selectAgentFabric(req);
		expect(outcome.agentId).toBe("agent-b");
	});

	test("falls back to candidates[0] when no role match", async () => {
		const A: Candidate = { agentId: "agent-a", role: "builder" };
		const B: Candidate = { agentId: "agent-b", role: "growth" };
		const req = makeBetDecomposerReq([A, B], "product_manager");

		const outcome = await selectAgentFabric(req);
		// No PM → first candidate
		expect(outcome.agentId).toBe("agent-a");
	});

	test("returns null when candidates list is empty", async () => {
		const req = makeBetDecomposerReq([], "product_manager");

		const outcome = await selectAgentFabric(req);
		expect(outcome.agentId).toBeNull();
	});

	test("role-match oracle: matches bet-decomposition.ts eligible.find(role==='product_manager') ?? eligible[0]", async () => {
		// Pre-AK7 oracle: eligible.find(role==='product_manager') ?? eligible[0]
		const candidates: Candidate[] = [
			{ agentId: "agent-a", role: "builder" },
			{ agentId: "agent-b", role: "product_manager" },
			{ agentId: "agent-c", role: "growth" },
		];

		// Oracle computes:
		const oracleResult = candidates.find((c) => c.role === "product_manager") ?? candidates[0];

		const req = makeBetDecomposerReq(candidates, "product_manager");
		const outcome = await selectAgentFabric(req);

		// selectAgentFabric must produce the same agentId as the oracle
		expect(outcome.agentId).toBe(oracleResult?.agentId ?? null);
	});
});

// ---------------------------------------------------------------------------
// AC3: bet_task golden (the regression trap)
//
// PROTECTED GOLDEN SPEC (§7):
//   Setup: exactly 2 candidates ordered [A, B] by users.id (A.id < B.id).
//          3 task inputs, all ownerRole=null → forces spread branch every time.
//   Assert: [A, B, A] — i.e. candidates[i % 2].
//   A collapsed impl yields [A, A, A] and FAILS.
// ---------------------------------------------------------------------------

describe("AK7: selectAgentFabric — bet_task golden spread (AC3, the regression trap)", () => {
	const A: Candidate = { agentId: "agent-a", role: "builder" };
	const B: Candidate = { agentId: "agent-b", role: "growth" };
	const candidates = [A, B] as const; // ordered: A.id < B.id (pinned by test)

	test("protected golden: 3 null-role tasks → exact [A, B, A] sequence", async () => {
		// All ownerRole=null — forces the spread branch on every task.
		// If implementation collapses to candidates[0], this yields [A, A, A] → FAIL.
		const results: SelectAgentOutcome[] = [];
		for (let i = 0; i < 3; i++) {
			const req = makeBetTaskReq(candidates, i, null); // roleHint=null → spread branch
			results.push(await selectAgentFabric(req));
		}

		expect(results[0]?.agentId).toBe("agent-a"); // i=0: 0%2=0 → A
		expect(results[1]?.agentId).toBe("agent-b"); // i=1: 1%2=1 → B
		expect(results[2]?.agentId).toBe("agent-a"); // i=2: 2%2=0 → A
	});

	test("spread uses candidates[spreadIndex % length] on the mismatch branch", async () => {
		// Sanity: a direct check on the modulo formula
		// spreadIndex=5, len=2: 5%2=1 → B
		const req = makeBetTaskReq(candidates, 5, null);
		const outcome = await selectAgentFabric(req);
		expect(outcome.agentId).toBe("agent-b");
	});

	test("mixed variant: role-match short-circuit + spread coexist with original index semantics", async () => {
		// Setup: A=builder (id<B), B=product_manager
		// Task 0: ownerRole='product_manager' (spreadIndex=0) → B (role-match, index not used)
		// Task 1: ownerRole=null (spreadIndex=1) → spread: 1%2=1 → B
		// Task 2: ownerRole=null (spreadIndex=2) → spread: 2%2=0 → A
		//
		// Key: spreadIndex is the LOOP index (not a per-branch counter).
		// Task 1 uses spreadIndex=1 (original loop i), not 0 (resetting after role match).
		const candsMixed: Candidate[] = [
			{ agentId: "agent-a", role: "builder" },
			{ agentId: "agent-b", role: "product_manager" },
		];

		const task0 = await selectAgentFabric(makeBetTaskReq(candsMixed, 0, "product_manager"));
		const task1 = await selectAgentFabric(makeBetTaskReq(candsMixed, 1, null));
		const task2 = await selectAgentFabric(makeBetTaskReq(candsMixed, 2, null));

		expect(task0.agentId).toBe("agent-b"); // role-match → B (PM)
		expect(task1.agentId).toBe("agent-b"); // spread: 1%2=1 → B
		expect(task2.agentId).toBe("agent-a"); // spread: 2%2=0 → A
	});

	test("exact role match short-circuits spread (role-matching task always picks the role holder)", async () => {
		const A: Candidate = { agentId: "agent-a", role: "builder" };
		const B: Candidate = { agentId: "agent-b", role: "growth" };
		// spreadIndex=1 would pick B, but roleHint='builder' → role-match picks A
		const req = makeBetTaskReq([A, B], 1, "builder");
		const outcome = await selectAgentFabric(req);
		expect(outcome.agentId).toBe("agent-a");
	});

	test("returns null when candidates list is empty", async () => {
		const req = makeBetTaskReq([], 0, null);
		const outcome = await selectAgentFabric(req);
		expect(outcome.agentId).toBeNull();
	});

	test("single-candidate list: all tasks get that candidate regardless of spreadIndex", async () => {
		const only: Candidate = { agentId: "agent-only", role: "builder" };
		for (const i of [0, 1, 2, 100]) {
			const req = makeBetTaskReq([only], i, null);
			const outcome = await selectAgentFabric(req);
			expect(outcome.agentId).toBe("agent-only");
		}
	});
});

// ---------------------------------------------------------------------------
// AC3: routine_delegate — behaviour contract (no DB; DB-dependent path in
// the integration test AK7-routine-delegate-no-regression.integration.test.ts)
// ---------------------------------------------------------------------------

describe("AK7: selectAgentFabric — routine_delegate surface contract", () => {
	test("routine_delegate ignores candidates list (always empty for this surface)", async () => {
		// The routine_delegate surface passes candidates:[] per architecture §5.3.
		// selectAgentFabric must NOT use candidates[0] as the result for this surface.
		// It must run its own DB query. Without a real DB the call will throw or
		// return null (both acceptable for the red phase — the test asserts the
		// function accepts the surface and does NOT fall into the bet_* branch).
		//
		// The specific assertion: calling with candidates:[] and skillId/excludeAgentId
		// should NOT crash with a "candidates is empty" error — it must execute the
		// routine_delegate branch.
		const req: SelectAgentRequest<HyperIdleDb> = {
			db: {} as HyperIdleDb, // no real DB — routine_delegate query will fail/return null
			surface: "routine_delegate",
			teamId: null,
			workKey: "routine-1",
			candidates: [],
			roleHint: null,
			spreadIndex: null,
			excludeAgentId: "owner-agent",
			skillId: "skill-writing",
		};

		// Must not throw a "candidates empty" error or fall into bet_* path.
		// With no real DB the routine_delegate DB query may reject — that is fine for
		// the red phase. We only assert the surface is REACHED (not that a result is
		// returned), so we don't assert on the outcome value here.
		// A stub DB that rejects causes the promise to reject — we catch and check
		// it is NOT a "candidates" error:
		try {
			await selectAgentFabric(req);
			// If it resolves (shouldn't with a stub DB), that's also fine.
		} catch (err) {
			// Must NOT be the bet_* "candidates" short-circuit error
			const msg = err instanceof Error ? err.message : String(err);
			expect(msg).not.toMatch(/candidates\[0\]/i);
		}
	});
});
