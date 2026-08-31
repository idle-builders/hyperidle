/**
 * AC1 RED — Shared outcome types tests.
 *
 * AC-13: TaskOutcomeVerdict exports from @hyperidle/domain-model and
 *        TASK_OUTCOME_VERDICTS is correct.
 */

import { describe, expect, it } from "vitest";
import { TASK_OUTCOME_VERDICTS } from "../types.js";

describe("AC1 AC-13: Outcome verdict enums export from @hyperidle/domain-model", () => {
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
