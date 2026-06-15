/**
 * AJ3 — design-review gate-decision helper tests.
 *
 * The pure stakes mapping `DESIGN-CLASS → run | skip`. This is the single
 * automated proof of the gate rule (the one mechanical thing testable
 * without an LLM run). `park` is the orchestrator's mode-conditioned
 * outcome of `run`, NOT a return value here — see plans/AJ3/architecture.md §5.5.
 */

import { describe, expect, it } from "vitest";
import { designReviewDecision } from "../design-review-decision.js";

describe("AJ3: designReviewDecision maps DESIGN-CLASS to the human-design-review action", () => {
	it("novel → run (high-stakes design needs human review or park)", () => {
		expect(designReviewDecision("novel")).toBe("run");
	});

	it("routine → skip (proceed straight to build)", () => {
		expect(designReviewDecision("routine")).toBe("skip");
	});

	it("routine-low-conf → skip (does not rise to a large redesign / new base component)", () => {
		expect(designReviewDecision("routine-low-conf")).toBe("skip");
	});

	it("never returns park — park is the orchestrator's mode-conditioned outcome of run", () => {
		const allInputs = ["novel", "routine", "routine-low-conf"] as const;
		for (const input of allInputs) {
			expect(designReviewDecision(input)).not.toBe("park");
		}
	});
});
