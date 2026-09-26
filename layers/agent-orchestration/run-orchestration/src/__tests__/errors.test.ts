/**
 * `NoEligibleHarnessError.name` is a real behavior other code branches on
 * (the durable error_code derives from it, `start-runtime.ts` switches on it).
 */

import { describe, expect, it } from "vitest";
import { NoEligibleHarnessError } from "../errors.js";

describe("NoEligibleHarnessError", () => {
	it("names itself and carries the harness type in both field and message", () => {
		const err = new NoEligibleHarnessError("aider");

		expect(err.name).toBe("NoEligibleHarnessError");
		expect(err.harnessType).toBe("aider");
		expect(err.message).toContain("aider");
	});
});
