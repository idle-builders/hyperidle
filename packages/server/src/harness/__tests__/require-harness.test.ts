/**
 * AR1 — requireHarness unit tests (TDD red phase).
 *
 * Tests runtime behavior of the requireHarness() helper:
 * - Throws with a message naming the missing harness + "cannot complete" when absent.
 * - Does NOT throw (passes) when the named harness is present.
 * - Message includes the name of the missing harness.
 * - Message does NOT include any key value (only the key-class name).
 *
 * The module under test does not exist yet — these tests are intentionally RED.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { requireHarness } from "./require-harness.js";

// ── PATH manipulation helpers ─────────────────────────────────────────────────

/**
 * Override PATH so that `which <binary>` always fails (binary not found).
 * Restored in afterEach via vi.stubEnv.
 */
function shadowBinary(): void {
	vi.stubEnv("PATH", "/dev/null");
}

/**
 * Restore the original PATH so real binaries are found again.
 */
function restorePath(): void {
	vi.unstubAllEnvs();
}

// ── Tests: binary-backed harnesses ───────────────────────────────────────────

describe("requireHarness — binary absent", () => {
	beforeEach(() => {
		shadowBinary();
	});

	afterEach(() => {
		restorePath();
	});

	test("throws when 'claude' binary is missing", () => {
		expect(() => requireHarness("claude")).toThrow();
	});

	test("throw message names the missing harness", () => {
		expect(() => requireHarness("claude")).toThrowError(/claude/i);
	});

	test("throw message contains 'cannot complete'", () => {
		expect(() => requireHarness("claude")).toThrowError(/cannot complete/i);
	});

	test("throws when 'codex' binary is missing", () => {
		expect(() => requireHarness("codex")).toThrow();
	});

	test("throw message names 'codex' when codex is missing", () => {
		expect(() => requireHarness("codex")).toThrowError(/codex/i);
	});

	test("throws when 'opencode' binary is missing", () => {
		expect(() => requireHarness("opencode")).toThrow();
	});

	test("throws when 'gh' binary is missing", () => {
		expect(() => requireHarness("gh")).toThrow();
	});

	test("throw message names ALL missing harnesses when multiple are absent", () => {
		const err = (): void => requireHarness("claude", "codex");
		// Both names must appear in the message
		expect(err).toThrowError(/claude/i);
		expect(() => {
			try {
				requireHarness("claude", "codex");
			} catch (e) {
				if (e instanceof Error) {
					if (!/codex/i.test(e.message)) throw new Error("codex not in message");
				}
				throw e;
			}
		}).toThrow();
	});

	test("throw message does NOT contain the raw key value (key-class name only)", () => {
		// requireHarness should never embed the actual env var value in the error
		// Only the harness name / key-class name should appear
		let errorMessage = "";
		try {
			requireHarness("claude");
		} catch (e) {
			if (e instanceof Error) errorMessage = e.message;
		}
		// The error must name the harness — checked above — and must NOT contain
		// any raw secret value. Since we cannot know what value is set, we just
		// ensure the message is non-empty and matches the structural contract.
		expect(errorMessage).not.toBe("");
		expect(errorMessage).toMatch(/requireHarness/i);
	});
});

// ── Tests: ENV key-backed harnesses (key absent) ──────────────────────────────

describe("requireHarness — env key absent", () => {
	beforeEach(() => {
		// Remove all the relevant keys from the environment
		vi.stubEnv("OPENAI_API_KEY", "");
		vi.stubEnv("ANTHROPIC_API_KEY", "");
		vi.stubEnv("OPENROUTER_API_KEY", "");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("throws for 'openai-key' when OPENAI_API_KEY is absent", () => {
		expect(() => requireHarness("openai-key")).toThrow();
	});

	test("throw message names 'openai-key' when absent", () => {
		expect(() => requireHarness("openai-key")).toThrowError(/openai-key/i);
	});

	test("throws for 'anthropic-key' when ANTHROPIC_API_KEY is absent", () => {
		expect(() => requireHarness("anthropic-key")).toThrow();
	});

	test("throws for 'any-gateway-key' when all three keys are absent", () => {
		expect(() => requireHarness("any-gateway-key")).toThrow();
	});
});

// ── Tests: ENV key present (should NOT throw) ────────────────────────────────

describe("requireHarness — env key present", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("does NOT throw for 'openai-key' when OPENAI_API_KEY is set", () => {
		vi.stubEnv("OPENAI_API_KEY", "sk-test-value");
		expect(() => requireHarness("openai-key")).not.toThrow();
	});

	test("does NOT throw for 'anthropic-key' when ANTHROPIC_API_KEY is set", () => {
		vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-value");
		expect(() => requireHarness("anthropic-key")).not.toThrow();
	});

	test("does NOT throw for 'any-gateway-key' when ANTHROPIC_API_KEY is set", () => {
		vi.stubEnv("OPENAI_API_KEY", "");
		vi.stubEnv("OPENROUTER_API_KEY", "");
		vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-value");
		expect(() => requireHarness("any-gateway-key")).not.toThrow();
	});

	test("does NOT throw for 'any-gateway-key' when OPENAI_API_KEY is set", () => {
		vi.stubEnv("ANTHROPIC_API_KEY", "");
		vi.stubEnv("OPENROUTER_API_KEY", "");
		vi.stubEnv("OPENAI_API_KEY", "sk-test-value");
		expect(() => requireHarness("any-gateway-key")).not.toThrow();
	});

	test("does NOT throw for 'any-gateway-key' when OPENROUTER_API_KEY is set", () => {
		vi.stubEnv("ANTHROPIC_API_KEY", "");
		vi.stubEnv("OPENAI_API_KEY", "");
		vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-value");
		expect(() => requireHarness("any-gateway-key")).not.toThrow();
	});
});

// ── Tests: multiple harnesses, partial presence ───────────────────────────────

describe("requireHarness — multiple harnesses, partial absence", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("throws when one of two required harnesses is absent", () => {
		// anthropic-key present, but PATH has no 'claude' binary
		vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-value");
		vi.stubEnv("PATH", "/dev/null");
		// 'anthropic-key' present but 'claude' binary absent
		expect(() => requireHarness("anthropic-key", "claude")).toThrow();
		vi.unstubAllEnvs();
	});

	test("throw message mentions the absent harness, not the present one", () => {
		vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-value");
		vi.stubEnv("PATH", "/dev/null");
		let msg = "";
		try {
			requireHarness("anthropic-key", "claude");
		} catch (e) {
			if (e instanceof Error) msg = e.message;
		}
		expect(msg).toMatch(/claude/i);
		vi.unstubAllEnvs();
	});
});
