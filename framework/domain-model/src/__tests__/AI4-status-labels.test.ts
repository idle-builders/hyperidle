/**
 * Every state/verdict/status value shown in the UI must resolve to a real, non-empty label, and no
 * two TaskState values may share a label — a shared label makes two states indistinguishable in the
 * State dropdown (proposed/accepted both read "Planned" once).
 */

import { describe, expect, it } from "vitest";
import {
	AGENT_OPERATIONAL_STATUS_LABEL,
	TASK_OUTCOME_VERDICT_LABEL,
	TASK_OUTCOME_VERDICTS,
	TASK_STATE_LABEL,
	TASK_STATES,
} from "../types.js";

describe("TASK_STATE_LABEL", () => {
	it("maps every TaskState to its exact label, one per state, all distinct", () => {
		expect(TASK_STATE_LABEL).toEqual({
			proposed: "Planned",
			accepted: "Accepted",
			hold: "On hold",
			in_progress: "In progress",
			blocked: "Blocked",
			review: "In review",
			done: "Done",
			killed: "Killed",
		});
		expect(Object.keys(TASK_STATE_LABEL).sort()).toEqual([...TASK_STATES].sort());
		const labels = Object.values(TASK_STATE_LABEL);
		expect(new Set(labels).size).toBe(labels.length);
	});
});

describe("TASK_OUTCOME_VERDICT_LABEL", () => {
	it("maps every TaskOutcomeVerdict to its exact label", () => {
		expect(TASK_OUTCOME_VERDICT_LABEL).toEqual({
			met: "Met",
			// abbreviated to match the pre-existing WorkBet rendering
			met_with_rework: "Rework",
			partially_met: "Partial",
			not_met: "Not met",
		});
		expect(Object.keys(TASK_OUTCOME_VERDICT_LABEL).sort()).toEqual(
			[...TASK_OUTCOME_VERDICTS].sort(),
		);
	});
});

describe("AGENT_OPERATIONAL_STATUS_LABEL", () => {
	it("maps every AgentOperationalStatus to its exact label", () => {
		expect(AGENT_OPERATIONAL_STATUS_LABEL).toEqual({
			active: "Active",
			error: "Error",
			idle: "Idle",
		});
	});
});
