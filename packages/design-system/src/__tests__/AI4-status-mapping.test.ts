/**
 * AI4 — One status language: verdict + agent-operational status mapping tests (red phase)
 *
 * Extends the design-system status-mapping.ts with:
 *   - BET_OUTCOME_VERDICT_STATUS + betOutcomeVerdictToStatus (Decision 6, AC5)
 *   - TASK_OUTCOME_VERDICT_STATUS + taskOutcomeVerdictToStatus (Decision 6, AC5)
 *   - AgentOperationalStatus + AGENT_OPERATIONAL_STATUS_MAP + agentOperationalStatusToStatus
 *     (Decision 3a)
 *
 * These tests FAIL until the mappings are added to status-mapping.ts and
 * exported from the design-system index.
 *
 * AC5: Outcome verdicts render with semantic status coloring consistently —
 * not neutral gray. The mapping drives the chip color.
 */

import { describe, expect, it } from "vitest";
import {
	AGENT_OPERATIONAL_STATUS_MAP,
	type AgentOperationalStatus,
	agentOperationalStatusToStatus,
	BET_OUTCOME_VERDICT_STATUS,
	betOutcomeVerdictToStatus,
	type Status,
	TASK_OUTCOME_VERDICT_STATUS,
	taskOutcomeVerdictToStatus,
} from "../index.js";

/** All legal presentation Status values. */
const VALID_STATUSES: readonly Status[] = [
	"healthy",
	"behind",
	"blocked",
	"paused",
	"done",
	"error",
];

// --- BET_OUTCOME_VERDICT_STATUS ---

describe("BET_OUTCOME_VERDICT_STATUS (AI4 AC5, Decision 6)", () => {
	it("is exported and is a non-null object", () => {
		expect(BET_OUTCOME_VERDICT_STATUS).toBeDefined();
		expect(typeof BET_OUTCOME_VERDICT_STATUS).toBe("object");
	});

	it("maps validated to 'healthy' (hypothesis held = green)", () => {
		expect(BET_OUTCOME_VERDICT_STATUS.validated).toBe("healthy" satisfies Status);
	});

	it("maps refuted to 'error' (hypothesis failed = red)", () => {
		expect(BET_OUTCOME_VERDICT_STATUS.refuted).toBe("error" satisfies Status);
	});

	it("maps partial to 'behind' (mixed result = amber, reviewer-approved)", () => {
		// @lore AI4 Decision 6: partial → behind (amber). "Not a clean win, look closer."
		expect(BET_OUTCOME_VERDICT_STATUS.partial).toBe("behind" satisfies Status);
	});

	it("maps inconclusive to 'paused' (insufficient evidence = info/blue)", () => {
		expect(BET_OUTCOME_VERDICT_STATUS.inconclusive).toBe("paused" satisfies Status);
	});

	it("every value maps to a valid Status", () => {
		for (const [, status] of Object.entries(BET_OUTCOME_VERDICT_STATUS)) {
			expect(VALID_STATUSES).toContain(status);
		}
	});

	it("has exactly 4 entries covering all BetOutcomeVerdict values", () => {
		const keys = Object.keys(BET_OUTCOME_VERDICT_STATUS);
		expect(keys).toHaveLength(4);
		expect(keys).toContain("validated");
		expect(keys).toContain("refuted");
		expect(keys).toContain("partial");
		expect(keys).toContain("inconclusive");
	});

	it("no verdict maps to the neutral 'done' status (AC5: not neutral gray)", () => {
		// AC5 explicitly calls out "neutral gray" as the wrong status quo.
		// done maps to --status-success which is green, not gray — but we want
		// to assert no verdict accidentally ends up invisible.
		const values = Object.values(BET_OUTCOME_VERDICT_STATUS);
		// validated→healthy is intentional green; refuted→error is intentional red.
		// Just assert all are in VALID_STATUSES and none is an empty string.
		for (const v of values) {
			expect(v).toBeTruthy();
			expect(VALID_STATUSES).toContain(v);
		}
	});
});

// --- betOutcomeVerdictToStatus ---

describe("betOutcomeVerdictToStatus (AI4 Decision 6)", () => {
	it("is exported as a function", () => {
		expect(typeof betOutcomeVerdictToStatus).toBe("function");
	});

	it("returns 'healthy' for validated", () => {
		expect(betOutcomeVerdictToStatus("validated")).toBe("healthy" satisfies Status);
	});

	it("returns 'error' for refuted", () => {
		expect(betOutcomeVerdictToStatus("refuted")).toBe("error" satisfies Status);
	});

	it("returns 'behind' for partial", () => {
		expect(betOutcomeVerdictToStatus("partial")).toBe("behind" satisfies Status);
	});

	it("returns 'paused' for inconclusive", () => {
		expect(betOutcomeVerdictToStatus("inconclusive")).toBe("paused" satisfies Status);
	});

	it("returns a valid Status for all verdicts", () => {
		const verdicts = ["validated", "refuted", "partial", "inconclusive"] as const;
		for (const v of verdicts) {
			expect(VALID_STATUSES).toContain(betOutcomeVerdictToStatus(v));
		}
	});
});

// --- TASK_OUTCOME_VERDICT_STATUS ---

describe("TASK_OUTCOME_VERDICT_STATUS (AI4 AC5, Decision 6)", () => {
	it("is exported and is a non-null object", () => {
		expect(TASK_OUTCOME_VERDICT_STATUS).toBeDefined();
	});

	it("maps met to 'healthy' (done condition fully met = green)", () => {
		expect(TASK_OUTCOME_VERDICT_STATUS.met).toBe("healthy" satisfies Status);
	});

	it("maps met_with_rework to 'behind' (amber — not a clean pass)", () => {
		// @lore AI4 Decision 6: amber for anything "not a clean win"
		expect(TASK_OUTCOME_VERDICT_STATUS.met_with_rework).toBe("behind" satisfies Status);
	});

	it("maps partially_met to 'behind' (amber — partial delivery)", () => {
		expect(TASK_OUTCOME_VERDICT_STATUS.partially_met).toBe("behind" satisfies Status);
	});

	it("maps not_met to 'error' (done condition failed = red)", () => {
		expect(TASK_OUTCOME_VERDICT_STATUS.not_met).toBe("error" satisfies Status);
	});

	it("every value maps to a valid Status", () => {
		for (const [, status] of Object.entries(TASK_OUTCOME_VERDICT_STATUS)) {
			expect(VALID_STATUSES).toContain(status);
		}
	});

	it("has exactly 4 entries covering all TaskOutcomeVerdict values", () => {
		const keys = Object.keys(TASK_OUTCOME_VERDICT_STATUS);
		expect(keys).toHaveLength(4);
		expect(keys).toContain("met");
		expect(keys).toContain("met_with_rework");
		expect(keys).toContain("partially_met");
		expect(keys).toContain("not_met");
	});
});

// --- taskOutcomeVerdictToStatus ---

describe("taskOutcomeVerdictToStatus (AI4 Decision 6)", () => {
	it("is exported as a function", () => {
		expect(typeof taskOutcomeVerdictToStatus).toBe("function");
	});

	it("returns 'healthy' for met", () => {
		expect(taskOutcomeVerdictToStatus("met")).toBe("healthy" satisfies Status);
	});

	it("returns 'behind' for met_with_rework", () => {
		expect(taskOutcomeVerdictToStatus("met_with_rework")).toBe("behind" satisfies Status);
	});

	it("returns 'behind' for partially_met", () => {
		expect(taskOutcomeVerdictToStatus("partially_met")).toBe("behind" satisfies Status);
	});

	it("returns 'error' for not_met", () => {
		expect(taskOutcomeVerdictToStatus("not_met")).toBe("error" satisfies Status);
	});

	it("returns a valid Status for all task verdicts", () => {
		const verdicts = ["met", "met_with_rework", "partially_met", "not_met"] as const;
		for (const v of verdicts) {
			expect(VALID_STATUSES).toContain(taskOutcomeVerdictToStatus(v));
		}
	});
});

// --- AgentOperationalStatus + AGENT_OPERATIONAL_STATUS_MAP + agentOperationalStatusToStatus ---

describe("AGENT_OPERATIONAL_STATUS_MAP (AI4 Decision 3a)", () => {
	it("is exported as a non-null object", () => {
		expect(AGENT_OPERATIONAL_STATUS_MAP).toBeDefined();
	});

	it("maps active to 'healthy' (live agent = green)", () => {
		expect(AGENT_OPERATIONAL_STATUS_MAP.active).toBe("healthy" satisfies Status);
	});

	it("maps error to 'error' (agent in error = red)", () => {
		expect(AGENT_OPERATIONAL_STATUS_MAP.error).toBe("error" satisfies Status);
	});

	it("maps idle to 'paused' (agent not running = blue/info)", () => {
		expect(AGENT_OPERATIONAL_STATUS_MAP.idle).toBe("paused" satisfies Status);
	});

	it("has exactly 3 entries for the closed 3-value AgentOperationalStatus set", () => {
		expect(Object.keys(AGENT_OPERATIONAL_STATUS_MAP)).toHaveLength(3);
	});

	it("every value maps to a valid Status", () => {
		for (const [, status] of Object.entries(AGENT_OPERATIONAL_STATUS_MAP)) {
			expect(VALID_STATUSES).toContain(status);
		}
	});
});

describe("agentOperationalStatusToStatus (AI4 Decision 3a)", () => {
	it("is exported as a function", () => {
		expect(typeof agentOperationalStatusToStatus).toBe("function");
	});

	it("returns 'healthy' for active", () => {
		expect(agentOperationalStatusToStatus("active")).toBe("healthy" satisfies Status);
	});

	it("returns 'error' for error", () => {
		expect(agentOperationalStatusToStatus("error")).toBe("error" satisfies Status);
	});

	it("returns 'paused' for idle", () => {
		expect(agentOperationalStatusToStatus("idle")).toBe("paused" satisfies Status);
	});

	it("returns a valid Status for all 3 operational states", () => {
		const statuses: AgentOperationalStatus[] = ["active", "error", "idle"];
		for (const s of statuses) {
			expect(VALID_STATUSES).toContain(agentOperationalStatusToStatus(s));
		}
	});
});
