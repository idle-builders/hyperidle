import { describe, expect, it } from "vitest";
import { canTransitionTaskState, TASK_STATE_TRANSITIONS, TASK_STATES } from "../index.js";

describe("task transition contract", () => {
	it("represents every task state in the canonical grammar", () => {
		expect(Object.keys(TASK_STATE_TRANSITIONS).sort()).toEqual([...TASK_STATES].sort());
	});

	it("pins valid and invalid edges", () => {
		expect(canTransitionTaskState("proposed", "accepted")).toBe(true);
		expect(canTransitionTaskState("in_progress", "blocked")).toBe(true);
		expect(canTransitionTaskState("review", "done")).toBe(true);
		expect(canTransitionTaskState("done", "accepted")).toBe(false);
		expect(canTransitionTaskState("killed", "proposed")).toBe(false);
	});
});
// TaskInvalidTransitionError is tested in @hyperidle/work (layers/core-api/work/src/__tests__/errors.test.ts)
