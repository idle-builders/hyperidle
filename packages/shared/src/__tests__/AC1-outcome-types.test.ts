/**
 * AC1 RED — Shared outcome types tests.
 *
 * AC-13: BetOutcomeVerdict and TaskOutcomeVerdict types export from @hyperidle/shared.
 *        BET_OUTCOME_VERDICTS and TASK_OUTCOME_VERDICTS consts are correct.
 */

import { describe, expect, it } from "vitest";
import { BET_OUTCOME_VERDICTS, TASK_OUTCOME_VERDICTS } from "../types.js";

describe("AC1 AC-13: Outcome verdict enums export from @hyperidle/shared", () => {
	it("BET_OUTCOME_VERDICTS exports exactly 4 values", () => {
		expect(BET_OUTCOME_VERDICTS).toHaveLength(4);
	});

	it("BET_OUTCOME_VERDICTS contains validated, refuted, partial, inconclusive", () => {
		const verdicts = BET_OUTCOME_VERDICTS as readonly string[];
		expect(verdicts).toContain("validated");
		expect(verdicts).toContain("refuted");
		expect(verdicts).toContain("partial");
		expect(verdicts).toContain("inconclusive");
	});

	it("BET_OUTCOME_VERDICTS is a readonly const tuple", () => {
		expect(Array.isArray(BET_OUTCOME_VERDICTS)).toBe(true);
	});

	it("TASK_OUTCOME_VERDICTS exports exactly 4 values", () => {
		expect(TASK_OUTCOME_VERDICTS).toHaveLength(4);
	});

	it("TASK_OUTCOME_VERDICTS contains met, met_with_rework, partially_met, not_met", () => {
		const verdicts = TASK_OUTCOME_VERDICTS as readonly string[];
		expect(verdicts).toContain("met");
		expect(verdicts).toContain("met_with_rework");
		expect(verdicts).toContain("partially_met");
		expect(verdicts).toContain("not_met");
	});

	it("TASK_OUTCOME_VERDICTS is a readonly const tuple", () => {
		expect(Array.isArray(TASK_OUTCOME_VERDICTS)).toBe(true);
	});
});
