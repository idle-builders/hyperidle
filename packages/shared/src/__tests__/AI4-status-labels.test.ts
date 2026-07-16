/**
 * AI4 — One status language: label registry unit tests (red phase)
 *
 * AC2: Labels derive from shared registries; adding a new state surfaces as a
 * type error until every rendering path handles it.
 *
 * These tests will FAIL until the label registries are added to
 * `packages/shared/src/types.ts` and exported from `index.ts`.
 */

import { describe, expect, it } from "vitest";
import {
	AGENT_OPERATIONAL_STATUS_LABEL,
	BET_OUTCOME_VERDICT_LABEL,
	BET_OUTCOME_VERDICTS,
	BET_STATUS_LABEL,
	BET_STATUSES,
	type BetOutcomeVerdict,
	type BetStatus,
	TASK_OUTCOME_VERDICT_LABEL,
	TASK_OUTCOME_VERDICTS,
	TASK_STATE_LABEL,
	TASK_STATES,
	type TaskOutcomeVerdict,
	type TaskState,
} from "../index.js";

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
		expect(TASK_STATE_LABEL.proposed).toBe("Planned");
	});

	it("maps accepted to 'Planned'", () => {
		// Both proposed+accepted are pre-work states that read "Planned"
		expect(TASK_STATE_LABEL.accepted).toBe("Planned");
	});

	it("maps hold to 'On hold'", () => {
		expect(TASK_STATE_LABEL.hold).toBe("On hold");
	});

	it("maps in_progress to 'In progress'", () => {
		expect(TASK_STATE_LABEL.in_progress).toBe("In progress");
	});

	it("maps blocked to 'Blocked'", () => {
		expect(TASK_STATE_LABEL.blocked).toBe("Blocked");
	});

	it("maps review to 'In review'", () => {
		expect(TASK_STATE_LABEL.review).toBe("In review");
	});

	it("maps done to 'Done'", () => {
		expect(TASK_STATE_LABEL.done).toBe("Done");
	});

	it("maps killed to 'Killed'", () => {
		expect(TASK_STATE_LABEL.killed).toBe("Killed");
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

// --- BET_STATUS_LABEL ---

describe("BET_STATUS_LABEL (AI4 AC2)", () => {
	it("is exported as a non-null object", () => {
		expect(BET_STATUS_LABEL).toBeDefined();
	});

	it("covers all 4 BetStatus values with non-empty strings", () => {
		for (const status of BET_STATUSES) {
			const label = BET_STATUS_LABEL[status];
			expect(label, `BET_STATUS_LABEL["${status}"] must be a non-empty string`).toBeTruthy();
		}
	});

	it("maps draft to 'Draft'", () => {
		expect(BET_STATUS_LABEL.draft).toBe("Draft");
	});

	it("maps active to 'Active'", () => {
		expect(BET_STATUS_LABEL.active).toBe("Active");
	});

	it("maps completed to 'Completed'", () => {
		expect(BET_STATUS_LABEL.completed).toBe("Completed");
	});

	it("maps killed to 'Killed'", () => {
		expect(BET_STATUS_LABEL.killed).toBe("Killed");
	});

	it("has exactly 4 entries (one per BET_STATUSES value)", () => {
		expect(Object.keys(BET_STATUS_LABEL)).toHaveLength(BET_STATUSES.length);
	});

	it("exhaustively covers all BET_STATUSES runtime values", () => {
		const keys = Object.keys(BET_STATUS_LABEL) as BetStatus[];
		for (const status of BET_STATUSES) {
			expect(keys).toContain(status);
		}
	});
});

// --- BET_OUTCOME_VERDICT_LABEL ---

describe("BET_OUTCOME_VERDICT_LABEL (AI4 AC2, AC5)", () => {
	it("is exported as a non-null object", () => {
		expect(BET_OUTCOME_VERDICT_LABEL).toBeDefined();
	});

	it("covers all 4 BetOutcomeVerdict values with non-empty strings", () => {
		for (const verdict of BET_OUTCOME_VERDICTS) {
			const label = BET_OUTCOME_VERDICT_LABEL[verdict];
			expect(
				label,
				`BET_OUTCOME_VERDICT_LABEL["${verdict}"] must be a non-empty string`,
			).toBeTruthy();
		}
	});

	it("maps validated to 'Validated'", () => {
		expect(BET_OUTCOME_VERDICT_LABEL.validated).toBe("Validated");
	});

	it("maps refuted to 'Refuted'", () => {
		expect(BET_OUTCOME_VERDICT_LABEL.refuted).toBe("Refuted");
	});

	it("maps partial to 'Partial'", () => {
		expect(BET_OUTCOME_VERDICT_LABEL.partial).toBe("Partial");
	});

	it("maps inconclusive to 'Inconclusive'", () => {
		expect(BET_OUTCOME_VERDICT_LABEL.inconclusive).toBe("Inconclusive");
	});

	it("exhaustively covers all BET_OUTCOME_VERDICTS values", () => {
		const keys = Object.keys(BET_OUTCOME_VERDICT_LABEL) as BetOutcomeVerdict[];
		for (const verdict of BET_OUTCOME_VERDICTS) {
			expect(keys).toContain(verdict);
		}
	});
});

// --- TASK_OUTCOME_VERDICT_LABEL ---

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
		expect(TASK_OUTCOME_VERDICT_LABEL.met).toBe("Met");
	});

	it("maps met_with_rework to 'Rework' (preserving WorkBet abbreviation)", () => {
		// @lore AC1: abbreviated to match the pre-existing WorkBet rendering
		expect(TASK_OUTCOME_VERDICT_LABEL.met_with_rework).toBe("Rework");
	});

	it("maps partially_met to 'Partial' (preserving WorkBet abbreviation)", () => {
		// @lore AC1: abbreviated to match the pre-existing WorkBet rendering
		expect(TASK_OUTCOME_VERDICT_LABEL.partially_met).toBe("Partial");
	});

	it("maps not_met to 'Not met'", () => {
		expect(TASK_OUTCOME_VERDICT_LABEL.not_met).toBe("Not met");
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
		expect(AGENT_OPERATIONAL_STATUS_LABEL.active).toBe("Active");
	});

	it("maps error to 'Error'", () => {
		expect(AGENT_OPERATIONAL_STATUS_LABEL.error).toBe("Error");
	});

	it("maps idle to 'Idle'", () => {
		expect(AGENT_OPERATIONAL_STATUS_LABEL.idle).toBe("Idle");
	});

	it("has exactly 3 entries", () => {
		expect(Object.keys(AGENT_OPERATIONAL_STATUS_LABEL)).toHaveLength(3);
	});
});
