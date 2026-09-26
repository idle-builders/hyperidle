/**
 * Task-owned transition/capacity errors, shared with policy via
 * @hyperidle/domain-model so `instanceof` works across both throwers — no
 * test elsewhere in this scope covers the classes themselves.
 */
import { describe, expect, it } from "vitest";
import {
	CapacityExceededError,
	InvalidTransitionError,
	TaskInvalidTransitionError,
} from "../errors.js";

describe("InvalidTransitionError", () => {
	it("carries from/to state", () => {
		const err = new InvalidTransitionError("draft", "killed");
		expect(err.name).toBe("InvalidTransitionError");
		expect(err.from).toBe("draft");
		expect(err.to).toBe("killed");
	});
});

describe("CapacityExceededError", () => {
	it("carries teamId/capacity", () => {
		const err = new CapacityExceededError("team-1", 5);
		expect(err.name).toBe("CapacityExceededError");
		expect(err.teamId).toBe("team-1");
		expect(err.capacity).toBe(5);
	});
});

describe("TaskInvalidTransitionError", () => {
	it("preserves task-specific conflict context and is a subclass of InvalidTransitionError", () => {
		const error = new TaskInvalidTransitionError("task-1", "done", "accepted");
		expect(error).toMatchObject({
			name: "InvalidTransitionError",
			taskId: "task-1",
			fromState: "done",
			toState: "accepted",
		});
		expect(error).toBeInstanceOf(InvalidTransitionError);
	});
});
