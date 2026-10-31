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
import { productionCliConfig } from "./production-cli-config.js";
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

	test("codex → locked model gpt-5.6-luna (tiny baseline; nano rejected by ChatGPT-account codex)", () => {
		expect(HARNESS_TEST_MODELS.codex.model).toBe("gpt-5.6-luna");
	});

	test("opencode → locked model openrouter/z-ai/glm-4.7-flash", () => {
		expect(HARNESS_TEST_MODELS.opencode.model).toBe("openrouter/z-ai/glm-4.7-flash");
	});

	test("cursor-agent → locked model auto (tiny baseline)", () => {
		expect(HARNESS_TEST_MODELS["cursor-agent"].model).toBe("auto");
	});

	test("an entry carries the model and nothing else", () => {
		for (const [harness, spec] of Object.entries(HARNESS_TEST_MODELS)) {
			expect(Object.keys(spec), `${harness} should lock only a model`).toEqual(["model"]);
		}
	});
});
// ── CliHarnessAdapter configs — model is argument-enforced ───────────────────

describe("CLI_TOOL_CONFIGS (claude, cursor-agent) — model is argument-enforced", () => {
	test("claude args contain --model immediately followed by {{model}}", () => {
		const args = productionCliConfig("claude").args;
		const modelFlagIdx = args.indexOf("--model");
		expect(modelFlagIdx).toBeGreaterThanOrEqual(0);
		expect(args[modelFlagIdx + 1]).toBe("{{model}}");
	});

	test("cursor-agent args contain --model immediately followed by {{model}}", () => {
		const args = productionCliConfig("cursor-agent").args;
		const modelFlagIdx = args.indexOf("--model");
		expect(modelFlagIdx).toBeGreaterThanOrEqual(0);
		expect(args[modelFlagIdx + 1]).toBe("{{model}}");
	});
});
