/**
 * Concept-review gate-decision helper tests.
 *
 * The pure stakes mapping `(DESIGN-CLASS, DOC-CLASS) → run | skip`. Human
 * concept review fires when EITHER signal is high-stakes — a novel design OR a
 * significant guide rewrite. `park` is the orchestrator's mode-conditioned
 * outcome of `run`, NOT a return value here.
 */

import { describe, expect, it } from "vitest";
import { conceptReviewDecision } from "../concept-review-decision.js";

describe("conceptReviewDecision maps (DESIGN-CLASS, DOC-CLASS) to the human-concept-review action", () => {
	it("novel design → run regardless of doc impact", () => {
		expect(conceptReviewDecision("novel", "none")).toBe("run");
		expect(conceptReviewDecision("novel", "minor")).toBe("run");
		expect(conceptReviewDecision("novel", "significant")).toBe("run");
	});

	it("significant guide rewrite → run regardless of design class", () => {
		expect(conceptReviewDecision("routine", "significant")).toBe("run");
		expect(conceptReviewDecision("routine-low-conf", "significant")).toBe("run");
	});

	it("routine design + non-significant docs → skip (proceed straight to build)", () => {
		expect(conceptReviewDecision("routine", "minor")).toBe("skip");
		expect(conceptReviewDecision("routine", "none")).toBe("skip");
		expect(conceptReviewDecision("routine-low-conf", "minor")).toBe("skip");
		expect(conceptReviewDecision("routine-low-conf", "none")).toBe("skip");
	});

	it("never returns park — park is the orchestrator's mode-conditioned outcome of run", () => {
		const designs = ["novel", "routine", "routine-low-conf"] as const;
		const docs = ["significant", "minor", "none"] as const;
		for (const d of designs) {
			for (const doc of docs) {
				expect(conceptReviewDecision(d, doc)).not.toBe("park");
			}
		}
	});
});
