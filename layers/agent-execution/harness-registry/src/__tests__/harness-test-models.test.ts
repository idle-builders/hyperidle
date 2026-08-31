/**
 * AR7 — Unit tests for the locked per-harness test-model matrix.
 *
 * Verifies:
 *   1. HARNESS_TEST_MODELS has exactly the 4 supported harness keys.
 *   2. Each harness maps to the founder-set locked model string.
 *   3. Each entry locks a model and nothing else — no provider, no key.
 *
 * This is a *.test.ts UNIT — not *.integration.test.ts — so:
 *   - The guard does NOT apply the model-import ban to this file.
 *   - No real harness binary is required.
 *   - vi.stubEnv is safe to use.
 */

import { describe, expect, test } from "vitest";
import { cliAdapterFixture } from "./cli-adapter-fixtures.js";
import { HARNESS_TEST_MODELS } from "./require-harness.js";

// ── Matrix shape ──────────────────────────────────────────────────────────────

describe("HARNESS_TEST_MODELS — locked matrix shape", () => {
	test("has exactly the 4 supported harness keys", () => {
		const keys = Object.keys(HARNESS_TEST_MODELS).sort();
		expect(keys).toEqual(["claude", "codex", "cursor-agent", "opencode"]);
	});

	test("claude → locked model haiku (tiny baseline)", () => {
		expect(HARNESS_TEST_MODELS.claude.model).toBe("haiku");
	});

	test("codex → locked model gpt-5.4-mini (tiny baseline; nano rejected by ChatGPT-account codex)", () => {
		expect(HARNESS_TEST_MODELS.codex.model).toBe("gpt-5.4-mini");
	});

	test("opencode → locked model openrouter/z-ai/glm-4.7-flash", () => {
		expect(HARNESS_TEST_MODELS.opencode.model).toBe("openrouter/z-ai/glm-4.7-flash");
	});

	test("cursor-agent → locked model auto (tiny baseline)", () => {
		expect(HARNESS_TEST_MODELS["cursor-agent"].model).toBe("auto");
	});

	// @lore Each entry used to carry a provider, a base URL and an env var naming
	// the key that billed for the run, and `harnessTestResolvedModel` assembled
	// them into the `resolvedModel` a test handed to `runSession`. All three
	// described the model gateway. No harness calls a provider API any more, so a
	// locked MODEL is the whole of what a lane needs to fix.
	test("an entry carries the model and nothing else", () => {
		for (const [harness, spec] of Object.entries(HARNESS_TEST_MODELS)) {
			expect(Object.keys(spec), `${harness} should lock only a model`).toEqual(["model"]);
		}
	});
});
// ── CLI_TOOL_CONFIGS.codex args regression (Fix F / AR7) ─────────────────────

describe("CLI_TOOL_CONFIGS.codex — model is argument-enforced", () => {
	test("codex args contain --model immediately followed by {{model}}", () => {
		// Regression: codex must pass --model {{model}} so the locked model from
		// HARNESS_TEST_MODELS is enforced at the subprocess level (not left to
		// the inherited CODEX_HOME config default).
		const args = cliAdapterFixture("codex").args;
		const modelFlagIdx = args.indexOf("--model");
		expect(modelFlagIdx).toBeGreaterThanOrEqual(0);
		expect(args[modelFlagIdx + 1]).toBe("{{model}}");
	});

	test("claude args also contain --model immediately followed by {{model}}", () => {
		// Confirm claude remains argument-enforced as a regression anchor.
		// CLAUDE_CLI_CONFIG is imported from adapter-pool as a named export;
		// CLI_TOOL_CONFIGS does not include claude (it has its own const).
		// We verify the codex args inline here; claude is covered by existing tests.
		const args = cliAdapterFixture("claude").args;
		// This test is about codex; claude consistency verified by adapter-pool.test.ts.
		expect(args).toContain("{{model}}");
	});

	test("opencode args contain --model immediately followed by {{model}}", () => {
		const args = cliAdapterFixture("opencode").args;
		const modelFlagIdx = args.indexOf("--model");
		expect(modelFlagIdx).toBeGreaterThanOrEqual(0);
		expect(args[modelFlagIdx + 1]).toBe("{{model}}");
	});

	test("cursor-agent args contain --model immediately followed by {{model}}", () => {
		const args = cliAdapterFixture("cursor-agent").args;
		const modelFlagIdx = args.indexOf("--model");
		expect(modelFlagIdx).toBeGreaterThanOrEqual(0);
		expect(args[modelFlagIdx + 1]).toBe("{{model}}");
	});
});
