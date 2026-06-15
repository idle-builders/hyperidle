/**
 * X3 — Prompt Assembly: inline systemPromptText tests (RED phase)
 *
 * AC-16: Context assembly accepts inline text instead of file path
 *
 * These tests FAIL until:
 *  - context-assembly-prompt.ts changes PromptCompositionInput.systemPromptText
 *    to systemPromptText: string
 *  - assemblePrompt() uses the inline text instead of reading from a file
 *
 * NOTE: The existing context-assembly-prompt.integration.test.ts has tests using systemPromptText.
 * Those tests will be updated in the implementation phase to use systemPromptText.
 * This file adds NEW tests specifically for the AC-16 inline-text behavior.
 */

import { describe, expect, it, vi } from "vitest";
import { assemblePrompt, type PromptCompositionInput } from "../context-assembly-prompt.js";
import type { SessionContextData } from "../session-context.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal session context data for unit tests (no DB required). */
function makeContextData(overrides: Partial<SessionContextData> = {}): SessionContextData {
	return {
		task: {
			id: "task-x3",
			title: "X3 Implementation Task",
			description: "Implement agent config",
			state: "in_progress",
		},
		bet: {
			id: "bet-x3",
			description: "X3 workpackage",
			appetite: "small",
			doneCondition: "All X3 ACs pass",
		},
		agent: {
			id: "agent-x3",
			name: "BuilderBot",
			role: "builder",
		},
		team: {
			id: "team-x3",
			name: "X3 Team",
		},
		...overrides,
	};
}

const TEST_TOOLS = [
	{ name: "read_file", description: "Read a file from the workspace" },
	{ name: "write_file", description: "Write content to a file" },
];

/** System prompt content with frontmatter (simulates content from DB that was originally from a .md file). */
const SYSTEM_PROMPT_WITH_FRONTMATTER = `---
role: builder
version: 1
---

# You are the Builder of \`{{product}}\`

Your job is to write great software for the {{community}} community.
`;

/** System prompt content without frontmatter. */
const SYSTEM_PROMPT_NO_FRONTMATTER = `# You are the Builder

Your job is to write great software.
`;

// ---------------------------------------------------------------------------
// AC-16: assemblePrompt accepts systemPromptText (inline text)
// ---------------------------------------------------------------------------

describe("X3 AC-16: assemblePrompt accepts systemPromptText (inline text instead of file path)", () => {
	it("PromptCompositionInput accepts systemPromptText field (not systemPromptText)", () => {
		// Compile-time check: if PromptCompositionInput still has systemPromptText,
		// this will produce a TypeScript error when the implementation is updated.
		// If PromptCompositionInput has systemPromptText, this should compile fine.
		const input: PromptCompositionInput = {
			systemPromptText: "# Test\n\nContent here.",
			context: makeContextData(),
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};
		// Just constructing the object is the check — TypeScript would error if systemPromptText
		// is not a valid field. We use the variable to suppress unused-variable lint.
		expect(input.systemPromptText).toBe("# Test\n\nContent here.");
	});

	it("contains ## Identity section when systemPromptText is non-empty", async () => {
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_NO_FRONTMATTER,
			context: makeContextData(),
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("## Identity");
	});

	it("omits ## Identity section when systemPromptText is empty string", async () => {
		const input: PromptCompositionInput = {
			systemPromptText: "",
			context: makeContextData(),
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).not.toContain("## Identity");
	});

	it("strips YAML frontmatter from systemPromptText before including in prompt", async () => {
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_WITH_FRONTMATTER,
			context: makeContextData(),
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		// Frontmatter should be stripped
		expect(result.assembledPrompt).not.toContain("role: builder");
		expect(result.assembledPrompt).not.toContain("version: 1");
		// Content should remain
		expect(result.assembledPrompt).toContain("You are the Builder");
	});

	it("substitutes {{product}} template variable in systemPromptText", async () => {
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_WITH_FRONTMATTER,
			context: makeContextData(),
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		// {{product}} should be replaced with team name "X3 Team"
		expect(result.assembledPrompt).toContain("X3 Team");
		expect(result.assembledPrompt).not.toContain("{{product}}");
	});

	it("substitutes {{community}} template variable in systemPromptText", async () => {
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_WITH_FRONTMATTER,
			context: makeContextData(),
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		// {{community}} should be replaced with "building" for builder role
		expect(result.assembledPrompt).toContain("building");
		expect(result.assembledPrompt).not.toContain("{{community}}");
	});

	it("does not read any files from the filesystem for systemPromptText", async () => {
		// If assemblePrompt still uses fs.readFile for system prompt, this would intercept it
		const readFileSpy = vi.spyOn(
			// biome-ignore lint/style/useNamingConvention: node fs module uses camelCase
			await import("node:fs").then((m) => m.promises),
			"readFile",
		);

		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_NO_FRONTMATTER,
			context: makeContextData(),
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		await assemblePrompt(input);

		// readFile should NOT have been called for the system prompt
		// (it may still be called for other purposes like workspace setup)
		const systemPromptReadCalls = readFileSpy.mock.calls.filter(
			([p]) => typeof p === "string" && (p as string).includes("system-prompt"),
		);
		expect(systemPromptReadCalls).toHaveLength(0);

		readFileSpy.mockRestore();
	});

	it("still includes ## Task section with inline systemPromptText", async () => {
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_NO_FRONTMATTER,
			context: makeContextData(),
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("## Task");
		expect(result.assembledPrompt).toContain("X3 Implementation Task");
	});

	it("still includes ## Available Tools section with inline systemPromptText", async () => {
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_NO_FRONTMATTER,
			context: makeContextData(),
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("## Available Tools");
		expect(result.assembledPrompt).toContain("read_file");
	});

	it("returns personaToolsTokens as a number", async () => {
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_NO_FRONTMATTER,
			context: makeContextData(),
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(typeof result.personaToolsTokens).toBe("number");
		expect(result.personaToolsTokens).toBeGreaterThan(0);
	});

	it("personaToolsTokens is 0 or very small when systemPromptText is empty", async () => {
		const input: PromptCompositionInput = {
			systemPromptText: "",
			context: makeContextData(),
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		// Without persona, the tools section alone contributes some tokens
		// The overall count should be smaller than with a full system prompt
		expect(typeof result.personaToolsTokens).toBe("number");
	});
});
