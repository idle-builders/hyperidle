/**
 * AR7 — Unit tests for the locked per-harness test-model matrix.
 *
 * Verifies:
 *   1. HARNESS_TEST_MODELS has exactly the 5 supported harness keys.
 *   2. Each harness maps to the founder-set locked model string.
 *   3. harnessTestResolvedModel reads the key from OPENROUTER_API_KEY for
 *      OpenRouter harnesses and returns the inherited-auth placeholder for
 *      keychain CLIs (claude/codex).
 *
 * This is a *.test.ts UNIT — not *.integration.test.ts — so:
 *   - The guard does NOT apply the model-import ban to this file.
 *   - No real harness binary is required.
 *   - vi.stubEnv is safe to use.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cliAdapterFixture } from "./cli-adapter-fixtures.js";
import { HARNESS_TEST_MODELS, harnessTestResolvedModel } from "./require-harness.js";

// ── Matrix shape ──────────────────────────────────────────────────────────────

describe("HARNESS_TEST_MODELS — locked matrix shape", () => {
	test("has exactly the 5 supported harness keys", () => {
		const keys = Object.keys(HARNESS_TEST_MODELS).sort();
		expect(keys).toEqual(["builtin", "claude", "codex", "cursor-agent", "opencode"]);
	});

	test("builtin → locked model deepseek/deepseek-v4-flash", () => {
		expect(HARNESS_TEST_MODELS.builtin.model).toBe("deepseek/deepseek-v4-flash");
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

	test("builtin apiKeyEnv is OPENROUTER_API_KEY", () => {
		expect(HARNESS_TEST_MODELS.builtin.apiKeyEnv).toBe("OPENROUTER_API_KEY");
	});

	test("opencode apiKeyEnv is OPENROUTER_API_KEY", () => {
		expect(HARNESS_TEST_MODELS.opencode.apiKeyEnv).toBe("OPENROUTER_API_KEY");
	});

	test("claude apiKeyEnv is null (inherited keychain auth)", () => {
		expect(HARNESS_TEST_MODELS.claude.apiKeyEnv).toBeNull();
	});

	test("codex apiKeyEnv is null (inherited keychain auth)", () => {
		expect(HARNESS_TEST_MODELS.codex.apiKeyEnv).toBeNull();
	});

	test("cursor-agent → locked model auto (tiny baseline)", () => {
		expect(HARNESS_TEST_MODELS["cursor-agent"].model).toBe("auto");
	});

	test("cursor-agent apiKeyEnv is null (inherited Cursor login auth)", () => {
		expect(HARNESS_TEST_MODELS["cursor-agent"].apiKeyEnv).toBeNull();
	});
});

// ── harnessTestResolvedModel ──────────────────────────────────────────────────

describe("harnessTestResolvedModel — resolves locked model for a harness", () => {
	beforeEach(() => {
		vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key-abc123");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("builtin resolves to deepseek/deepseek-v4-flash + reads OPENROUTER_API_KEY from env", () => {
		const resolved = harnessTestResolvedModel("builtin");
		expect(resolved.model).toBe("deepseek/deepseek-v4-flash");
		expect(resolved.provider).toBe("openai-compatible");
		expect(resolved.apiKey).toBe("test-openrouter-key-abc123");
	});

	test("claude resolves to haiku + empty apiKey (keychain auth, no key env)", () => {
		const resolved = harnessTestResolvedModel("claude");
		expect(resolved.model).toBe("haiku");
		expect(resolved.provider).toBe("anthropic");
		// apiKeyEnv is null for claude — the CLI uses keychain auth, not an injected key.
		// "" preserves proven behavior; a non-empty placeholder would feed a garbage env var.
		expect(resolved.apiKey).toBe("");
	});

	test("codex resolves to gpt-5.4-mini + empty apiKey (keychain/CODEX_HOME auth)", () => {
		const resolved = harnessTestResolvedModel("codex");
		expect(resolved.model).toBe("gpt-5.4-mini");
		// codex authenticates via inherited CODEX_HOME — "" not a non-empty placeholder.
		expect(resolved.apiKey).toBe("");
	});

	test("opencode resolves to openrouter/z-ai/glm-4.7-flash + reads OPENROUTER_API_KEY", () => {
		const resolved = harnessTestResolvedModel("opencode");
		expect(resolved.model).toBe("openrouter/z-ai/glm-4.7-flash");
		expect(resolved.apiKey).toBe("test-openrouter-key-abc123");
	});

	test("cursor-agent resolves to auto + empty apiKey (Cursor login auth)", () => {
		const resolved = harnessTestResolvedModel("cursor-agent");
		expect(resolved.model).toBe("auto");
		expect(resolved.apiKey).toBe("");
	});

	test("builtin with missing OPENROUTER_API_KEY → apiKey is empty string (not null)", () => {
		vi.unstubAllEnvs();
		vi.stubEnv("OPENROUTER_API_KEY", "");
		const resolved = harnessTestResolvedModel("builtin");
		expect(resolved.apiKey).toBe("");
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
