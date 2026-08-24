/**
 * AH2 — NoEligibleHarnessError unit tests.
 *
 * @lore AU44-b8: moved from framework/domain-model/src/__tests__/AH2-errors.test.ts
 * when NoEligibleHarnessError moved to layers/agent-orchestration/run-orchestration/src/errors.ts.
 */

import { describe, expect, it } from "vitest";
import { NoEligibleHarnessError } from "../errors.js";

describe("AH2: NoEligibleHarnessError", () => {
	it("is an Error instance", () => {
		const err = new NoEligibleHarnessError("builtin");
		expect(err).toBeInstanceOf(Error);
	});

	it("has name NoEligibleHarnessError", () => {
		const err = new NoEligibleHarnessError("claude-code");
		expect(err.name).toBe("NoEligibleHarnessError");
	});

	it("stores harnessType on the instance", () => {
		const err = new NoEligibleHarnessError("aider");
		expect(err.harnessType).toBe("aider");
	});

	it("message includes the harnessType string", () => {
		const err = new NoEligibleHarnessError("my-harness");
		expect(err.message).toContain("my-harness");
	});

	it("message mentions Settings → Agents or registration", () => {
		const err = new NoEligibleHarnessError("builtin");
		expect(err.message.toLowerCase()).toMatch(/settings|register|adapter/i);
	});
});
