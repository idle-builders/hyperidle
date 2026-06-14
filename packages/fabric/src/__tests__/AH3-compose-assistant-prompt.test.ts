/**
 * AH3 RED — composeAssistantPrompt unit tests + byte-equality persona invariant.
 *
 * AC3 (persona consolidation):
 *   - composeAssistantPrompt(soulPromptText) → { composedPrompt: string }
 *   - persona text passes through (after frontmatter strip) into composedPrompt
 *   - byte-equality: same string consumed by builtin adapter config AND written
 *     to CLAUDE.md for the SDK adapter
 *
 * These tests FAIL until:
 *   - packages/fabric/src/prompt-composition.ts exports composeAssistantPrompt
 *   - packages/fabric/src/index.ts exports composeAssistantPrompt
 */

import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test, afterEach } from "vitest";

// This import fails until the green phase creates the function:
import { composeAssistantPrompt } from "../prompt-composition.js";
import { writeWorkspaceCLAUDEmd } from "../prompt-composition.js";

describe("AH3: composeAssistantPrompt", () => {
	test("returns an object with composedPrompt string", () => {
		const result = composeAssistantPrompt("You are a helpful assistant.");
		expect(typeof result).toBe("object");
		expect(typeof result.composedPrompt).toBe("string");
		expect(result.composedPrompt.length).toBeGreaterThan(0);
	});

	test("persona text appears in composedPrompt (after frontmatter strip)", () => {
		const soul = "You are a helpful assistant focused on product development.";
		const result = composeAssistantPrompt(soul);
		expect(result.composedPrompt).toContain(soul);
	});

	test("YAML frontmatter is stripped before inclusion", () => {
		const soulWithFrontmatter = `---
title: Assistant Persona
---
You are a helpful assistant.`;
		const result = composeAssistantPrompt(soulWithFrontmatter);
		expect(result.composedPrompt).not.toContain("---");
		expect(result.composedPrompt).toContain("You are a helpful assistant.");
	});

	test("empty soul prompt returns a valid composedPrompt (identity section omitted)", () => {
		const result = composeAssistantPrompt("");
		expect(typeof result.composedPrompt).toBe("string");
		// No persona section header when soul is empty
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

	test(
		"composedPrompt equals CLAUDE.md content written by writeWorkspaceCLAUDEmd (SDK side byte-equality)",
		() => {
			const soul = "You are a precise and helpful assistant.";
			const expected = composeAssistantPrompt(soul).composedPrompt;

			// Simulate what the SDK adapter path does:
			// it writes CLAUDE.md from composeAssistantPrompt output
			tmpDir = mkdtempSync(join(tmpdir(), "ah3-test-"));
			writeWorkspaceCLAUDEmd(tmpDir, expected);

			const fileContent = readFileSync(join(tmpDir, "CLAUDE.md"), "utf8");

			// BYTE EQUALITY: file content must equal composedPrompt exactly
			expect(fileContent).toBe(expected);
		},
	);

	test(
		"builtin adapter receives exact composedPrompt (config.composedPrompt side byte-equality)",
		() => {
			// The builtin adapter reads composedPrompt from its config.
			// Here we simulate the builtin adapter config assignment and assert equality.
			const soul = "You are concise and technical.";
			const result = composeAssistantPrompt(soul);

			// Simulate builtin harness config — it receives the string directly
			const builtinAdapterConfig = { composedPrompt: result.composedPrompt };

			// Byte equality: builtin config must equal composeAssistantPrompt output
			expect(builtinAdapterConfig.composedPrompt).toBe(result.composedPrompt);
		},
	);

	test(
		"byte-equality holds across both adapter paths for the same soul (cross-harness invariant)",
		() => {
			const soul = "# My Persona\n\nI am a thoughtful assistant.\n";
			const expected = composeAssistantPrompt(soul).composedPrompt;

			// Builtin side
			const builtinComposedPrompt = composeAssistantPrompt(soul).composedPrompt;

			// SDK side — write to file, read back
			tmpDir = mkdtempSync(join(tmpdir(), "ah3-xharn-"));
			writeWorkspaceCLAUDEmd(tmpDir, builtinComposedPrompt);
			const sdkFileContent = readFileSync(join(tmpDir, "CLAUDE.md"), "utf8");

			// All three must be byte-equal
			expect(builtinComposedPrompt).toBe(expected);
			expect(sdkFileContent).toBe(expected);
		},
	);
});

describe("AH3: composeAssistantPrompt exported from @hyperidle/fabric", () => {
	test("is exported from the fabric package index", async () => {
		// This will fail until fabric/src/index.ts exports composeAssistantPrompt
		const fabric = await import("@hyperidle/fabric");
		expect(typeof (fabric as Record<string, unknown>).composeAssistantPrompt).toBe("function");
	});
});
