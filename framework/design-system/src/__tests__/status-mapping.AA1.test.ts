/**
 * AA1 — routineStateToStatus mapping tests (Task 3).
 *
 * Verifies the RoutineState -> Status mapping function added for AA1.
 */

import { routineStateToStatus } from "@hyperidle/design-system";
import type { RoutineState } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";

describe("routineStateToStatus (AA1)", () => {
	it('maps "active" to "healthy"', () => {
		expect(routineStateToStatus("active")).toBe("healthy");
	});

	it('maps "paused" to "paused"', () => {
		expect(routineStateToStatus("paused")).toBe("paused");
	});

	it('maps "error" to "error"', () => {
		expect(routineStateToStatus("error")).toBe("error");
	});

	it("maps all RoutineState values to valid Status values", () => {
		const validStatuses = ["healthy", "behind", "blocked", "paused", "done", "error"];
		const allStates: RoutineState[] = ["active", "paused", "error"];
		for (const state of allStates) {
			const result = routineStateToStatus(state);
			expect(validStatuses).toContain(result);
		}
	});
});
