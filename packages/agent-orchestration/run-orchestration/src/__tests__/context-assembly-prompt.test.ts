import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createContextAssembler } from "../context.js";

/**
 * AU21 §9 Increment 12 (Decision H3), Wave C: `assemblePrompt`/
 * `assembleRoutinePrompt` are pure now (token counting is a local
 * `approxTokenCount`, no `knowledge` port) — `ContextAssemblyPorts` is just
 * `filesystems`, unused by any function this file exercises.
 */
const assembler = createContextAssembler({
	filesystems: {
		startWatcher: () => ({ stop: () => {} }),
	},
});

function sessionContext() {
	return {
		task: { id: "t1", title: "Ship the thing", description: "Do the work", state: "in_progress" },
		bet: { id: "b1", description: "Ship it fast", appetite: "small", doneCondition: "It ships" },
		agent: { id: "a1", name: "Ada", role: "builder" },
		team: { id: "team1", name: "Alpha" },
	};
}

function routineContext() {
	return {
		routine: {
			id: "r1",
			name: "Daily digest",
			description: "Summarize activity",
			lastRunSummary: null,
		},
		agent: { id: "a1", name: "Ada", role: "builder" },
		team: { id: "team1", name: "Alpha" },
	};
}

describe("stripFrontmatter", () => {
	it("removes leading YAML frontmatter", () => {
		const content = "---\ntitle: X\n---\nBody text";
		expect(assembler.stripFrontmatter(content)).toBe("Body text");
	});

	it("leaves content without frontmatter unchanged", () => {
		expect(assembler.stripFrontmatter("Just body")).toBe("Just body");
	});
});

describe("substituteTemplateVars", () => {
	it("substitutes known keys and leaves unknown keys as literal placeholders", () => {
		const result = assembler.substituteTemplateVars("Hello {{name}}, welcome to {{missing}}", {
			name: "Ada",
		});
		expect(result).toBe("Hello Ada, welcome to {{missing}}");
	});
});

describe("buildTemplateVariables", () => {
	it("maps team name to product and derives community from agent role", () => {
		const vars = assembler.buildTemplateVariables(sessionContext());
		expect(vars.product).toBe("Alpha");
		expect(typeof vars.community).toBe("string");
		expect(vars.community?.length).toBeGreaterThan(0);
	});
});

describe("assemblePrompt", () => {
	it("composes identity, task, tools, and workspace sections", async () => {
		const result = await assembler.assemblePrompt({
			systemPromptText: "You are a builder agent.",
			context: sessionContext(),
			tools: [{ name: "write_memory", description: "Persist a knowledge item" }],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("## Identity");
		expect(result.assembledPrompt).toContain("You are a builder agent.");
		expect(result.assembledPrompt).toContain("**Title:** Ship the thing");
		expect(result.assembledPrompt).toContain("write_memory");
		expect(result.assembledPrompt).toContain("## Workspace");
		expect(result.personaToolsTokens).toBeGreaterThan(0);
	});

	it("omits the Identity section when systemPromptText is empty", async () => {
		const result = await assembler.assemblePrompt({
			systemPromptText: "",
			context: sessionContext(),
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).not.toContain("## Identity");
		expect(result.assembledPrompt).toContain("No tools available for this session.");
	});

	it("truncates the persona when persona + tools exceed the token budget", async () => {
		const hugePersona = `# Persona\n\n${"word ".repeat(5000)}`;
		const result = await assembler.assemblePrompt({
			systemPromptText: hugePersona,
			context: sessionContext(),
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("(Persona truncated to fit token budget.)");
		expect(result.personaToolsTokens).toBeLessThan(5000);
	});
});

describe("assembleRoutinePrompt", () => {
	it("uses the routine section instead of the task section", async () => {
		const result = await assembler.assembleRoutinePrompt({
			systemPromptText: "",
			context: routineContext(),
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("## Routine");
		expect(result.assembledPrompt).toContain("**Name:** Daily digest");
		expect(result.assembledPrompt).toContain("This is the first run of this routine.");
		expect(result.assembledPrompt).not.toContain("## Task");
	});
});

// Every session goes through the generic `assembleTaskFreePrompt` path,
// whose `## Conversation` section is covered by
// `generic-transcript-prompt-assembly.integration.test.ts`.

describe("writeSandboxAgentsMd", () => {
	let sandboxPath: string;

	beforeEach(() => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "context-assembly-prompt-test-"));
	});

	afterEach(() => {
		fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	it("dual-writes identical content to AGENTS.md and CLAUDE.md", () => {
		assembler.writeSandboxAgentsMd(sandboxPath, "# Session Instructions");

		for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
			const written = fs.readFileSync(path.join(sandboxPath, filename), "utf8");
			expect(written).toBe("# Session Instructions");
		}
	});
});
