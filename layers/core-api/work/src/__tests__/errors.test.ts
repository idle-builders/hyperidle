/**
 * Work-owned error class tests.
 *
 * @lore AU44: InvalidTransitionError, CapacityExceededError, TaskInvalidTransitionError
 * moved to framework/domain-model/src/errors.ts and re-exported from
 * layers/core-api/work/src/errors.ts. The cross-boundary instanceof test below
 * proves that an error constructed via the work re-export is the same class as
 * the one exported directly from @hyperidle/domain-model — which is the property
 * that makes the error-handler's `instanceof` check work for errors thrown by
 * either the work or the policy service.
 */

import { InvalidTransitionError as DomainModelError } from "@hyperidle/domain-model";
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

describe("cross-boundary instanceof", () => {
	it("work re-export is the same class reference as @hyperidle/domain-model export", () => {
		// Both work and policy import from domain-model, so any error thrown by
		// either service is catchable via instanceof on the other side.
		const err = new InvalidTransitionError("proposed", "done");
		expect(err).toBeInstanceOf(DomainModelError);
	});

	it("TaskInvalidTransitionError is instanceof InvalidTransitionError (inheritance preserved)", () => {
		const err = new TaskInvalidTransitionError("task-1", "accepted", "done");
		expect(err).toBeInstanceOf(InvalidTransitionError);
		expect(err).toBeInstanceOf(DomainModelError);
	});
});
