/**
 * AI4 — One status language: label registry unit tests (red phase)
 *
 * AC2: Labels derive from shared registries; adding a new state surfaces as a
 * type error until every rendering path handles it.
 *
 * These tests will FAIL until the label registries are added to
 * `framework/domain-model/src/types.ts` and exported from `index.ts`.
 */

import { describe, expect, it } from "vitest";
import {
	AGENT_OPERATIONAL_STATUS_LABEL,
	TASK_OUTCOME_VERDICT_LABEL,
	TASK_OUTCOME_VERDICTS,
	TASK_STATE_LABEL,
	TASK_STATES,
	type TaskOutcomeVerdict,
	type TaskState,
} from "../types.js";

// @lore BB1: BET_STATUS_LABEL, BET_STATUSES, BetStatus removed — task vocabulary only.

// --- TASK_STATE_LABEL ---

describe("TASK_STATE_LABEL (AI4 AC2)", () => {
	it("is exported as a non-null object", () => {
		expect(TASK_STATE_LABEL).toBeDefined();
		expect(typeof TASK_STATE_LABEL).toBe("object");
	});

	it("covers all 8 TaskState values with non-empty strings", () => {
		for (const state of TASK_STATES) {
			const label = TASK_STATE_LABEL[state];
			expect(label, `TASK_STATE_LABEL["${state}"] must be a non-empty string`).toBeTruthy();
			expect(typeof label).toBe("string");
		}
	});

	it("maps proposed to 'Planned'", () => {
		expect(TASK_STATE_LABEL["proposed"]).toBe("Planned");
	});

	it("maps accepted to 'Accepted', distinctly from proposed", () => {
		// @lore BB1: these both read "Planned", so the State dropdown listed
		// "Planned" twice and the two states could not be told apart. They are
		// different states — `proposed` is drafted and unclaimed, `accepted` is
		// committed to an owner and counts against the concurrent-task limit.
		expect(TASK_STATE_LABEL["accepted"]).toBe("Accepted");
		expect(TASK_STATE_LABEL["accepted"]).not.toBe(TASK_STATE_LABEL["proposed"]);
	});

	it("gives every state a DISTINCT label", () => {
		// @lore BB1: the duplicate that made this worth asserting was
		// proposed/accepted both reading "Planned". A shared label is not a
		// cosmetic issue — it makes two states indistinguishable in the State
		// dropdown, so picking one silently sets the other.
		const labels = Object.values(TASK_STATE_LABEL);
		expect(new Set(labels).size).toBe(labels.length);
	});

	it("maps hold to 'On hold'", () => {
		expect(TASK_STATE_LABEL["hold"]).toBe("On hold");
	});

	it("maps in_progress to 'In progress'", () => {
		expect(TASK_STATE_LABEL["in_progress"]).toBe("In progress");
	});

	it("maps blocked to 'Blocked'", () => {
		expect(TASK_STATE_LABEL["blocked"]).toBe("Blocked");
	});

	it("maps review to 'In review'", () => {
		expect(TASK_STATE_LABEL["review"]).toBe("In review");
	});

	it("maps done to 'Done'", () => {
		expect(TASK_STATE_LABEL["done"]).toBe("Done");
	});

	it("maps killed to 'Killed'", () => {
		expect(TASK_STATE_LABEL["killed"]).toBe("Killed");
	});

	it("has exactly 8 entries (one per TASK_STATES value)", () => {
		expect(Object.keys(TASK_STATE_LABEL)).toHaveLength(TASK_STATES.length);
	});

	it("exhaustively covers all TASK_STATES runtime values", () => {
		const keys = Object.keys(TASK_STATE_LABEL) as TaskState[];
		for (const state of TASK_STATES) {
			expect(keys).toContain(state);
		}
	});
});

// @lore BB1: BET_STATUS_LABEL tests removed — BET_STATUSES/BetStatus/BET_STATUS_LABEL deleted.

describe("TASK_OUTCOME_VERDICT_LABEL (AI4 AC2, AC5)", () => {
	it("is exported as a non-null object", () => {
		expect(TASK_OUTCOME_VERDICT_LABEL).toBeDefined();
	});

	it("covers all 4 TaskOutcomeVerdict values with non-empty strings", () => {
		for (const verdict of TASK_OUTCOME_VERDICTS) {
			const label = TASK_OUTCOME_VERDICT_LABEL[verdict];
			expect(
				label,
				`TASK_OUTCOME_VERDICT_LABEL["${verdict}"] must be a non-empty string`,
			).toBeTruthy();
		}
	});

	it("maps met to 'Met'", () => {
		expect(TASK_OUTCOME_VERDICT_LABEL["met"]).toBe("Met");
	});

	it("maps met_with_rework to 'Rework' (preserving WorkBet abbreviation)", () => {
		// @lore AC1: abbreviated to match the pre-existing WorkBet rendering
		expect(TASK_OUTCOME_VERDICT_LABEL["met_with_rework"]).toBe("Rework");
	});

	it("maps partially_met to 'Partial' (preserving WorkBet abbreviation)", () => {
		// @lore AC1: abbreviated to match the pre-existing WorkBet rendering
		expect(TASK_OUTCOME_VERDICT_LABEL["partially_met"]).toBe("Partial");
	});

	it("maps not_met to 'Not met'", () => {
		expect(TASK_OUTCOME_VERDICT_LABEL["not_met"]).toBe("Not met");
	});

	it("exhaustively covers all TASK_OUTCOME_VERDICTS values", () => {
		const keys = Object.keys(TASK_OUTCOME_VERDICT_LABEL) as TaskOutcomeVerdict[];
		for (const verdict of TASK_OUTCOME_VERDICTS) {
			expect(keys).toContain(verdict);
		}
	});
});

// --- AGENT_OPERATIONAL_STATUS_LABEL ---

describe("AGENT_OPERATIONAL_STATUS_LABEL (AI4 AC2, Decision 3a)", () => {
	it("is exported as a non-null object", () => {
		expect(AGENT_OPERATIONAL_STATUS_LABEL).toBeDefined();
	});

	it("covers all 3 AgentOperationalStatus values: active, error, idle", () => {
		const agentStatuses = ["active", "error", "idle"] as const;
		for (const s of agentStatuses) {
			const label = AGENT_OPERATIONAL_STATUS_LABEL[s];
			expect(
				label,
				`AGENT_OPERATIONAL_STATUS_LABEL["${s}"] must be a non-empty string`,
			).toBeTruthy();
		}
	});

	it("maps active to 'Active'", () => {
		expect(AGENT_OPERATIONAL_STATUS_LABEL["active"]).toBe("Active");
	});

	it("maps error to 'Error'", () => {
		expect(AGENT_OPERATIONAL_STATUS_LABEL["error"]).toBe("Error");
	});

	it("maps idle to 'Idle'", () => {
		expect(AGENT_OPERATIONAL_STATUS_LABEL["idle"]).toBe("Idle");
	});

	it("has exactly 3 entries", () => {
		expect(Object.keys(AGENT_OPERATIONAL_STATUS_LABEL)).toHaveLength(3);
	});
});
