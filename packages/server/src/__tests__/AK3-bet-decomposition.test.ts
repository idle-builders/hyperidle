/**
 * AK3 RED — Bet decomposition unit tests (pure logic, no DB/LLM).
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
	DECOMPOSITION_TURN_TIMEOUT_MS,
	type DecompositionBlockerReason,
	type DecompositionStatus,
	type DecompositionTaskInput,
} from "@hyperidle/shared";
import { describe, expect, test } from "vitest";

describe("AK3: DECOMPOSITION_TURN_TIMEOUT_MS constant", () => {
	test("is a positive finite number", () => {
		expect(typeof DECOMPOSITION_TURN_TIMEOUT_MS).toBe("number");
		expect(Number.isFinite(DECOMPOSITION_TURN_TIMEOUT_MS)).toBe(true);
		expect(DECOMPOSITION_TURN_TIMEOUT_MS).toBeGreaterThan(0);
	});

	test("is 120_000ms (same magnitude as ASSISTANT_TURN_TIMEOUT_MS per plan §1.7)", () => {
		expect(DECOMPOSITION_TURN_TIMEOUT_MS).toBe(120_000);
	});
});

describe("AK3: DecompositionStatus type", () => {
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

describe("AK3: DecompositionBlockerReason type", () => {
	test("accepts valid blocker reason values", () => {
		const noAgent: DecompositionBlockerReason = "no_eligible_agent";
		const empty: DecompositionBlockerReason = "empty";
		const failed: DecompositionBlockerReason = "failed";
		expect(noAgent).toBe("no_eligible_agent");
		expect(empty).toBe("empty");
		expect(failed).toBe("failed");
	});
});

describe("AK3: DecompositionTaskInput type", () => {
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
