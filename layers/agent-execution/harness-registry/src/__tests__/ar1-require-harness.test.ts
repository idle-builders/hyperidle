/**
 * AR1 — requireHarness unit tests (TDD red phase).
 *
 * Tests runtime behavior of the requireHarness() hard-fail helper against the
 * STRICT harness model (plans/AR/concept.md):
 *
 *   HarnessName = "claude" | "codex" | "opencode" | "cursor-agent" | "builtin"
 *     - claude/codex/opencode/cursor-agent → binary-on-PATH (keychain/inherited login, NO API key)
 *     - builtin                  → OPENROUTER_API_KEY present (.env). The ONLY key. Never
 *                                  OpenAI, never Anthropic.
 *
 * Hard prohibitions enforced here:
 *   - NO "anthropic-key" / "openai-key" / "any-gateway-key" token is a valid HarnessName.
 *   - ANTHROPIC_API_KEY / OPENAI_API_KEY are NOT honored as a presence gate by ANY name.
 *   - builtin's presence is OPENROUTER_API_KEY and nothing else.
 *
 * Behavior:
 *   - absent harness → THROWS (never skips), message names the missing harness +
 *     "cannot complete"; message never echoes a raw secret value.
 *   - present harness → does not throw.
 *
 * The module under test does not exist yet — these tests are intentionally RED.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { requireBinary } from "./require-binary.js";
import { requireHarness } from "./require-harness.js";

// ── binary-backed harnesses: absent (PATH shadowed so `which` fails) ──────────

describe("requireHarness — binary absent (claude/codex/opencode/cursor-agent)", () => {
	beforeEach(() => {
		vi.stubEnv("PATH", "/dev/null");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("throws when 'claude' binary missing", () => {
		expect(() => requireHarness("claude")).toThrow();
	});

	test("throw message names the missing harness (claude)", () => {
		expect(() => requireHarness("claude")).toThrowError(/claude/i);
	});

	test("throw message says the work cannot complete", () => {
		expect(() => requireHarness("claude")).toThrowError(/cannot complete/i);
	});

	test("throw message references requireHarness", () => {
		expect(() => requireHarness("claude")).toThrowError(/requireHarness/i);
	});

	test("throws and names 'codex' when codex missing", () => {
		expect(() => requireHarness("codex")).toThrowError(/codex/i);
	});

	test("throws and names 'opencode' when opencode missing", () => {
		expect(() => requireHarness("opencode")).toThrowError(/opencode/i);
	});

	test("throws and names 'cursor-agent' when cursor-agent missing", () => {
		expect(() => requireHarness("cursor-agent")).toThrowError(/cursor-agent/i);
	});

	test("'gh' is NOT a harness — Ruling 15", () => {
		// @ts-expect-error — `gh` is the GitHub CLI, never a harness name.
		expect(() => requireHarness("gh")).toThrow();
	});

	test("names ALL missing harnesses when several are absent", () => {
		let msg = "";
		try {
			requireHarness("claude", "codex");
		} catch (e) {
			if (e instanceof Error) msg = e.message;
		}
		expect(msg).toMatch(/claude/i);
		expect(msg).toMatch(/codex/i);
	});

	test("does NOT echo a raw secret value (only harness/key-class names)", () => {
		// Set a sentinel secret; the message must never contain its value.
		vi.stubEnv("OPENROUTER_API_KEY", "sk-or-SENTINEL-SECRET-VALUE");
		let msg = "";
		try {
			requireHarness("claude");
		} catch (e) {
			if (e instanceof Error) msg = e.message;
		}
		expect(msg).not.toBe("");
		expect(msg).not.toContain("SENTINEL-SECRET-VALUE");
	});
});

// ── builtin: OPENROUTER_API_KEY presence is the ONLY gate ─────────────────────

describe("requireHarness — builtin gates on OPENROUTER_API_KEY only", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("throws when OPENROUTER_API_KEY absent", () => {
		vi.stubEnv("OPENROUTER_API_KEY", "");
		expect(() => requireHarness("builtin")).toThrow();
	});

	test("throw message names 'builtin' when absent", () => {
		vi.stubEnv("OPENROUTER_API_KEY", "");
		expect(() => requireHarness("builtin")).toThrowError(/builtin/i);
	});

	test("does NOT throw when OPENROUTER_API_KEY is set", () => {
		vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-value");
		expect(() => requireHarness("builtin")).not.toThrow();
	});

	test("ANTHROPIC_API_KEY does NOT satisfy builtin (OpenRouter is the only key)", () => {
		vi.stubEnv("OPENROUTER_API_KEY", "");
		vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-present");
		expect(() => requireHarness("builtin")).toThrow();
	});

	test("OPENAI_API_KEY does NOT satisfy builtin", () => {
		vi.stubEnv("OPENROUTER_API_KEY", "");
		vi.stubEnv("OPENAI_API_KEY", "sk-openai-present");
		expect(() => requireHarness("builtin")).toThrow();
	});
});

// ── STRICT VOCABULARY: forbidden key-named tokens are NOT valid HarnessNames ──
//
// These assert the reverted bug (requireHarness("anthropic-key") etc.) cannot return.
// Passing a forbidden token must NOT silently pass: with the strict model these are
// not HarnessNames at all. We assert via runtime behavior — a forbidden token (set up
// so any key it might have keyed off IS present) must STILL throw, proving the helper
// does not honor a key-named gate. Type-level exhaustiveness is enforced by `npm run check`.

describe("requireHarness — forbidden key-named tokens never pass", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("'anthropic-key' is not honored even when ANTHROPIC_API_KEY is set", () => {
		vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-present");
		// @ts-expect-error — "anthropic-key" is NOT a HarnessName in the strict model.
		expect(() => requireHarness("anthropic-key")).toThrow();
	});

	test("'openai-key' is not honored even when OPENAI_API_KEY is set", () => {
		vi.stubEnv("OPENAI_API_KEY", "sk-openai-present");
		// @ts-expect-error — "openai-key" is NOT a HarnessName in the strict model.
		expect(() => requireHarness("openai-key")).toThrow();
	});

	test("'any-gateway-key' is not honored even when all gateway keys are set", () => {
		vi.stubEnv("ANTHROPIC_API_KEY", "a");
		vi.stubEnv("OPENAI_API_KEY", "b");
		vi.stubEnv("OPENROUTER_API_KEY", "c");
		// @ts-expect-error — "any-gateway-key" is NOT a HarnessName in the strict model.
		expect(() => requireHarness("any-gateway-key")).toThrow();
	});
});

// ── multiple harnesses, partial presence ──────────────────────────────────────

describe("requireHarness — partial presence still throws", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("throws when one of two required is absent (builtin present, claude binary absent)", () => {
		vi.stubEnv("OPENROUTER_API_KEY", "sk-or-value");
		vi.stubEnv("PATH", "/dev/null");
		expect(() => requireHarness("builtin", "claude")).toThrow();
	});

	test("message names the absent harness, not the present one", () => {
		vi.stubEnv("OPENROUTER_API_KEY", "sk-or-value");
		vi.stubEnv("PATH", "/dev/null");
		let msg = "";
		try {
			requireHarness("builtin", "claude");
		} catch (e) {
			if (e instanceof Error) msg = e.message;
		}
		expect(msg).toMatch(/claude/i);
	});
});

// ── requireBinary: the same hard-fail gate for a plain CLI (Ruling 15) ────────

describe("requireBinary — a CLI a test needs, with no harness vocabulary", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("throws when the binary is absent from PATH", () => {
		vi.stubEnv("PATH", "/dev/null");
		expect(() => requireBinary("gh")).toThrow();
	});

	test("throw message names the missing binary and says the test cannot complete", () => {
		vi.stubEnv("PATH", "/dev/null");
		expect(() => requireBinary("gh")).toThrowError(/gh/);
		expect(() => requireBinary("gh")).toThrowError(/cannot complete/i);
	});

	test("names every missing binary when several are absent", () => {
		vi.stubEnv("PATH", "/dev/null");
		let msg = "";
		try {
			requireBinary("gh", "definitely-not-a-real-binary");
		} catch (e) {
			if (e instanceof Error) msg = e.message;
		}
		expect(msg).toMatch(/gh/);
		expect(msg).toMatch(/definitely-not-a-real-binary/);
	});

	test("does not throw for a binary POSIX guarantees is present", () => {
		expect(() => requireBinary("sh")).not.toThrow();
	});

	test("no API key satisfies it — a binary gate is a binary gate", () => {
		vi.stubEnv("PATH", "/dev/null");
		vi.stubEnv("OPENROUTER_API_KEY", "sk-or-present");
		expect(() => requireBinary("gh")).toThrow();
	});
});
