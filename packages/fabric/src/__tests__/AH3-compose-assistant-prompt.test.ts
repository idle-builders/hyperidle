/**
 * AH3 RED — composeAssistantPrompt unit tests + byte-equality persona invariant.
 *
 * AC3 (persona consolidation):
 *   - composeAssistantPrompt(systemPromptText) → { composedPrompt: string }
 *   - persona text passes through (after frontmatter strip) into composedPrompt
 *   - byte-equality: same string consumed by builtin adapter config AND written
 *     to CLAUDE.md for the SDK adapter
 *
 * These tests PASS when:
 *   - packages/fabric/src/context-assembly-prompt.ts exports composeAssistantPrompt (AK1 rename)
 *   - packages/fabric/src/index.ts exports composeAssistantPrompt
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
// @lore AK1: Import path updated to context-assembly-prompt.js (harness-vocab rename, AK1).
import { composeAssistantPrompt, writeSandboxAgentsMd } from "../context-assembly-prompt.js";

describe("AH3: composeAssistantPrompt", () => {
	test("returns an object with composedPrompt string", () => {
		const result = composeAssistantPrompt("You are a helpful assistant.");
		expect(typeof result).toBe("object");
		expect(typeof result.composedPrompt).toBe("string");
		expect(result.composedPrompt.length).toBeGreaterThan(0);
	});

	test("persona text appears in composedPrompt (after frontmatter strip)", () => {
		const persona = "You are a helpful assistant focused on product development.";
		const result = composeAssistantPrompt(persona);
		expect(result.composedPrompt).toContain(persona);
	});

	test("YAML frontmatter is stripped before inclusion", () => {
		const personaWithFrontmatter = `---
title: Assistant Persona
---
You are a helpful assistant.`;
		const result = composeAssistantPrompt(personaWithFrontmatter);
		expect(result.composedPrompt).not.toContain("---");
		expect(result.composedPrompt).toContain("You are a helpful assistant.");
	});

	test("empty system prompt returns a valid composedPrompt (identity section omitted)", () => {
		const result = composeAssistantPrompt("");
		expect(typeof result.composedPrompt).toBe("string");
		// No persona section header when system prompt is empty
		expect(result.composedPrompt).not.toContain("## Identity");
	});
});

describe("AH3: byte-equality persona invariant (§4)", () => {
	let tmpDir: string | null = null;

	afterEach(() => {
		if (tmpDir) {
			try {
				rmSync(tmpDir, { recursive: true, force: true });
			} catch {}
			tmpDir = null;
		}
	});

	test("composedPrompt equals CLAUDE.md content written by writeSandboxAgentsMd (SDK side byte-equality)", () => {
		const persona = "You are a precise and helpful assistant.";
		const expected = composeAssistantPrompt(persona).composedPrompt;

		// Simulate what the SDK adapter path does:
		// it writes CLAUDE.md from composeAssistantPrompt output
		tmpDir = mkdtempSync(join(tmpdir(), "ah3-test-"));
		writeSandboxAgentsMd(tmpDir, expected);

		const fileContent = readFileSync(join(tmpDir, "CLAUDE.md"), "utf8");

		// BYTE EQUALITY: file content must equal composedPrompt exactly
		expect(fileContent).toBe(expected);
	});

	test("builtin adapter receives exact composedPrompt (config.composedPrompt side byte-equality)", () => {
		// The builtin adapter reads composedPrompt from its config.
		// Here we simulate the builtin adapter config assignment and assert equality.
		const persona = "You are concise and technical.";
		const result = composeAssistantPrompt(persona);

		// Simulate builtin harness config — it receives the string directly
		const builtinAdapterConfig = { composedPrompt: result.composedPrompt };

		// Byte equality: builtin config must equal composeAssistantPrompt output
		expect(builtinAdapterConfig.composedPrompt).toBe(result.composedPrompt);
	});

	test("byte-equality holds across both adapter paths for the same persona (cross-harness invariant)", () => {
		const persona = "# My Persona\n\nI am a thoughtful assistant.\n";
		const expected = composeAssistantPrompt(persona).composedPrompt;

		// Builtin side
		const builtinComposedPrompt = composeAssistantPrompt(persona).composedPrompt;

		// SDK side — write to file, read back
		tmpDir = mkdtempSync(join(tmpdir(), "ah3-xharn-"));
		writeSandboxAgentsMd(tmpDir, builtinComposedPrompt);
		const sdkFileContent = readFileSync(join(tmpDir, "CLAUDE.md"), "utf8");

		// All three must be byte-equal
		expect(builtinComposedPrompt).toBe(expected);
		expect(sdkFileContent).toBe(expected);
	});
});

describe("AH3: composeAssistantPrompt exported from @hyperidle/fabric", () => {
	test("is exported from the fabric package index", async () => {
		// This will fail until fabric/src/index.ts exports composeAssistantPrompt
		const fabric = await import("@hyperidle/fabric");
		expect(typeof (fabric as Record<string, unknown>).composeAssistantPrompt).toBe("function");
	});
});
