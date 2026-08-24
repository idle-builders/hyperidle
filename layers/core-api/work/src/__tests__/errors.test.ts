/**
 * Work-owned error class tests.
 *
 * @lore AU44-b8: InvalidTransitionError, CapacityExceededError, TaskInvalidTransitionError
 * moved from framework/domain-model/src/errors.ts (and task-transition.ts) to
 * layers/core-api/work/src/errors.ts.
 */

import { describe, expect, it } from "vitest";
import {
	CapacityExceededError,
	InvalidTransitionError,
	TaskInvalidTransitionError,
} from "../errors.js";

describe("InvalidTransitionError", () => {
	it("is an Error instance with from/to", () => {
		const err = new InvalidTransitionError("draft", "killed");
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("InvalidTransitionError");
		expect(err.from).toBe("draft");
		expect(err.to).toBe("killed");
	});
});

describe("CapacityExceededError", () => {
	it("is an Error instance with teamId/capacity", () => {
		const err = new CapacityExceededError("team-1", 5);
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("CapacityExceededError");
		expect(err.teamId).toBe("team-1");
		expect(err.capacity).toBe(5);
	});
});

describe("TaskInvalidTransitionError", () => {
	it("preserves task-specific conflict context", () => {
		const error = new TaskInvalidTransitionError("task-1", "done", "accepted");
		expect(error).toMatchObject({
			name: "InvalidTransitionError",
			taskId: "task-1",
			fromState: "done",
			toState: "accepted",
		});
	});
});
