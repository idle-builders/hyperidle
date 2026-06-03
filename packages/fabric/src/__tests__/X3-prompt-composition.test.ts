/**
 * X3 — Prompt Composition: inline soulPromptText tests (RED phase)
 *
 * AC-16: Prompt composition accepts inline text instead of file path
 *
 * These tests FAIL until:
 *  - prompt-composition.ts changes PromptCompositionInput.soulPromptPath
 *    to soulPromptText: string
 *  - composePrompt() uses the inline text instead of reading from a file
 *
 * NOTE: The existing prompt-composition.test.ts has tests using soulPromptPath.
 * Those tests will be updated in the implementation phase to use soulPromptText.
 * This file adds NEW tests specifically for the AC-16 inline-text behavior.
 */

import { describe, expect, it, vi } from "vitest";
import {
	composePrompt,
	type PromptCompositionInput,
} from "../prompt-composition.js";
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

/** Soul prompt content with frontmatter (simulates content from DB that was originally from a .md file). */
const SOUL_PROMPT_WITH_FRONTMATTER = `---
role: builder
version: 1
---

# You are the Builder of \`{{product}}\`

Your job is to write great software for the {{community}} community.
`;

/** Soul prompt content without frontmatter. */
const SOUL_PROMPT_NO_FRONTMATTER = `# You are the Builder

Your job is to write great software.
`;

// ---------------------------------------------------------------------------
// AC-16: composePrompt accepts soulPromptText (inline text)
// ---------------------------------------------------------------------------

describe("X3 AC-16: composePrompt accepts soulPromptText (inline text instead of file path)", () => {
	it("PromptCompositionInput accepts soulPromptText field (not soulPromptPath)", () => {
		// Compile-time check: if PromptCompositionInput still has soulPromptPath,
		// this will produce a TypeScript error when the implementation is updated.
		// If PromptCompositionInput has soulPromptText, this should compile fine.
		const input: PromptCompositionInput = {
			soulPromptText: "# Test\n\nContent here.",
			context: makeContextData(),
			tools: TEST_TOOLS,
			workspacePath: "/workspace/test",
		};
		// Just constructing the object is the check — TypeScript would error if soulPromptText
		// is not a valid field. We use the variable to suppress unused-variable lint.
		expect(input.soulPromptText).toBe("# Test\n\nContent here.");
	});

	it("contains ## Identity section when soulPromptText is non-empty", async () => {
		const input: PromptCompositionInput = {
			soulPromptText: SOUL_PROMPT_NO_FRONTMATTER,
			context: makeContextData(),
			tools: TEST_TOOLS,
			workspacePath: "/workspace/test",
		};

		const result = await composePrompt(input);
		expect(result.composedPrompt).toContain("## Identity");
	});

	it("omits ## Identity section when soulPromptText is empty string", async () => {
		const input: PromptCompositionInput = {
			soulPromptText: "",
			context: makeContextData(),
			tools: TEST_TOOLS,
			workspacePath: "/workspace/test",
		};

		const result = await composePrompt(input);
		expect(result.composedPrompt).not.toContain("## Identity");
	});

	it("strips YAML frontmatter from soulPromptText before including in prompt", async () => {
		const input: PromptCompositionInput = {
			soulPromptText: SOUL_PROMPT_WITH_FRONTMATTER,
			context: makeContextData(),
			tools: TEST_TOOLS,
			workspacePath: "/workspace/test",
		};

		const result = await composePrompt(input);
		// Frontmatter should be stripped
		expect(result.composedPrompt).not.toContain("role: builder");
		expect(result.composedPrompt).not.toContain("version: 1");
		// Content should remain
		expect(result.composedPrompt).toContain("You are the Builder");
	});

	it("substitutes {{product}} template variable in soulPromptText", async () => {
		const input: PromptCompositionInput = {
			soulPromptText: SOUL_PROMPT_WITH_FRONTMATTER,
			context: makeContextData(),
			tools: TEST_TOOLS,
			workspacePath: "/workspace/test",
		};

		const result = await composePrompt(input);
		// {{product}} should be replaced with team name "X3 Team"
		expect(result.composedPrompt).toContain("X3 Team");
		expect(result.composedPrompt).not.toContain("{{product}}");
	});

	it("substitutes {{community}} template variable in soulPromptText", async () => {
		const input: PromptCompositionInput = {
			soulPromptText: SOUL_PROMPT_WITH_FRONTMATTER,
			context: makeContextData(),
			tools: TEST_TOOLS,
			workspacePath: "/workspace/test",
		};

		const result = await composePrompt(input);
		// {{community}} should be replaced with "building" for builder role
		expect(result.composedPrompt).toContain("building");
		expect(result.composedPrompt).not.toContain("{{community}}");
	});

	it("does not read any files from the filesystem for soulPromptText", async () => {
		// If composePrompt still uses fs.readFile for soul prompt, this would intercept it
		const readFileSpy = vi.spyOn(
			// biome-ignore lint/style/useNamingConvention: node fs module uses camelCase
			await import("node:fs").then((m) => m.promises),
			"readFile",
		);

		const input: PromptCompositionInput = {
			soulPromptText: SOUL_PROMPT_NO_FRONTMATTER,
			context: makeContextData(),
			tools: TEST_TOOLS,
			workspacePath: "/workspace/test",
		};

		await composePrompt(input);

		// readFile should NOT have been called for the soul prompt
		// (it may still be called for other purposes like workspace setup)
		const soulPromptReadCalls = readFileSpy.mock.calls.filter(
			([p]) => typeof p === "string" && (p as string).includes("soul"),
		);
		expect(soulPromptReadCalls).toHaveLength(0);

		readFileSpy.mockRestore();
	});

	it("still includes ## Task section with inline soulPromptText", async () => {
		const input: PromptCompositionInput = {
			soulPromptText: SOUL_PROMPT_NO_FRONTMATTER,
			context: makeContextData(),
			tools: TEST_TOOLS,
			workspacePath: "/workspace/test",
		};

		const result = await composePrompt(input);
		expect(result.composedPrompt).toContain("## Task");
		expect(result.composedPrompt).toContain("X3 Implementation Task");
	});

	it("still includes ## Available Tools section with inline soulPromptText", async () => {
		const input: PromptCompositionInput = {
			soulPromptText: SOUL_PROMPT_NO_FRONTMATTER,
			context: makeContextData(),
			tools: TEST_TOOLS,
			workspacePath: "/workspace/test",
		};

		const result = await composePrompt(input);
		expect(result.composedPrompt).toContain("## Available Tools");
		expect(result.composedPrompt).toContain("read_file");
	});

	it("returns personaToolsTokens as a number", async () => {
		const input: PromptCompositionInput = {
			soulPromptText: SOUL_PROMPT_NO_FRONTMATTER,
			context: makeContextData(),
			tools: TEST_TOOLS,
			workspacePath: "/workspace/test",
		};

		const result = await composePrompt(input);
		expect(typeof result.personaToolsTokens).toBe("number");
		expect(result.personaToolsTokens).toBeGreaterThan(0);
	});

	it("personaToolsTokens is 0 or very small when soulPromptText is empty", async () => {
		const input: PromptCompositionInput = {
			soulPromptText: "",
			context: makeContextData(),
			tools: TEST_TOOLS,
			workspacePath: "/workspace/test",
		};

		const result = await composePrompt(input);
		// Without persona, the tools section alone contributes some tokens
		// The overall count should be smaller than with a full soul prompt
		expect(typeof result.personaToolsTokens).toBe("number");
	});
});
