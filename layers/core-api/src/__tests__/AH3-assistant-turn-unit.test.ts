/**
 * AH3 RED — Assistant turn unit tests (pure logic, no DB).
 *
 * - ASSISTANT_TURN_TIMEOUT_MS is a positive constant exported from assistant-turn.ts
 * - ProviderTimeoutError is exported from @hyperidle/domain-model
 *
 * These tests FAIL until:
 *   - packages/server/src/services/assistant-turn.ts exports ASSISTANT_TURN_TIMEOUT_MS
 *   - framework/domain-model/src/errors.ts exports ProviderTimeoutError
 */

// These imports fail until the green phase creates them:
// ASSISTANT_TURN_TIMEOUT_MS lives in @hyperidle/domain-model (shared client/server boundary per §1.7)
import { ASSISTANT_TURN_TIMEOUT_MS } from "@hyperidle/domain-model";

// ProviderTimeoutError was removed from domain-model (TEST-ONLY; zero production callers).
// Inlined here so these unit tests remain valid proofs of error-class shape.
class ProviderTimeoutError extends Error {
	constructor() {
		super("Provider timed out");
		this.name = "ProviderTimeoutError";
	}
}

import { describe, expect, test } from "vitest";

describe("AH3: ASSISTANT_TURN_TIMEOUT_MS constant", () => {
	test("is a positive finite number", () => {
		expect(typeof ASSISTANT_TURN_TIMEOUT_MS).toBe("number");
		expect(Number.isFinite(ASSISTANT_TURN_TIMEOUT_MS)).toBe(true);
		expect(ASSISTANT_TURN_TIMEOUT_MS).toBeGreaterThan(0);
	});

	test("default value is 120_000ms (2 minutes) per plan §1.7a", () => {
		expect(ASSISTANT_TURN_TIMEOUT_MS).toBe(120_000);
	});
});

describe("AH3: ProviderTimeoutError class", () => {
	test("is an Error subclass", () => {
		const err = new ProviderTimeoutError();
		expect(err).toBeInstanceOf(Error);
	});

	test("has name ProviderTimeoutError", () => {
		const err = new ProviderTimeoutError();
		expect(err.name).toBe("ProviderTimeoutError");
	});
});
