/**
 * Design-system status-mapping tests.
 *
 * L19: Extends with SessionOutcome → Status mapping coverage.
 */

import { type Status, sessionOutcomeToStatus } from "@hyperidle/design-system";
import type { SessionOutcome } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";

/** All legal presentation Status values. */
const VALID_STATUSES: readonly Status[] = [
	"healthy",
	"behind",
	"blocked",
	"paused",
	"done",
	"error",
];

describe("sessionOutcomeToStatus (L19)", () => {
	it('maps "completed" to "done"', () => {
		expect(sessionOutcomeToStatus("completed")).toBe("done" satisfies Status);
	});

	it('maps "crashed" to "error"', () => {
		expect(sessionOutcomeToStatus("crashed")).toBe("error" satisfies Status);
	});

	it('maps "stopped" to "paused"', () => {
		expect(sessionOutcomeToStatus("stopped")).toBe("paused" satisfies Status);
	});

	it("maps all SessionOutcome values to valid Status values", () => {
		const allOutcomes: SessionOutcome[] = ["completed", "crashed", "stopped"];
		for (const outcome of allOutcomes) {
			const result = sessionOutcomeToStatus(outcome);
			expect(VALID_STATUSES).toContain(result);
		}
	});
});
