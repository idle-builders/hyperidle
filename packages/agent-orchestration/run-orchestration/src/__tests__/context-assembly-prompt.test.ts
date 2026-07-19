import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KnowledgeReader } from "../context-assembly-ports.js";
import {
	assemblePrompt,
	assembleRoutinePrompt,
	buildTemplateVariables,
	composeAssistantPrompt,
	EMITTED_ROOTS_AGENTS_MD,
	stripFrontmatter,
	substituteTemplateVars,
	writeSandboxAgentsMd,
} from "../context-assembly-prompt.js";
import type { RoutineSessionContextData, SessionContextData } from "../session-context.js";

/**
 * Fake `KnowledgeReader` — `assemblePrompt`/`assembleRoutinePrompt` only ever
 * call `countTokens` (a pure text-length estimate mirroring the real
 * `@hyperidle/knowledge` shape); `list`/`rankAndBudget` are unused by this
 * file's functions but implemented (not cast away) to keep the fake a real,
 * fully-typed `KnowledgeReader` — no unsafe cast needed.
 */
const fakeKnowledge: KnowledgeReader = {
	countTokens: (text: string) => (text.trim().length === 0 ? 0 : text.split(/\s+/).length),
	list: async () => [],
	rankAndBudget: async (_db, items) => items,
};

function sessionContext(): SessionContextData {
	return {
		task: { id: "t1", title: "Ship the thing", description: "Do the work", state: "in_progress" },
		bet: { id: "b1", description: "Ship it fast", appetite: "small", doneCondition: "It ships" },
		agent: { id: "a1", name: "Ada", role: "builder" },
		team: { id: "team1", name: "Alpha" },
	};
}

function routineContext(): RoutineSessionContextData {
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
		expect(stripFrontmatter(content)).toBe("Body text");
	});

	it("leaves content without frontmatter unchanged", () => {
		expect(stripFrontmatter("Just body")).toBe("Just body");
	});
});

describe("substituteTemplateVars", () => {
	it("substitutes known keys and leaves unknown keys as literal placeholders", () => {
		const result = substituteTemplateVars("Hello {{name}}, welcome to {{missing}}", {
			name: "Ada",
		});
		expect(result).toBe("Hello Ada, welcome to {{missing}}");
	});
});

describe("buildTemplateVariables", () => {
	it("maps team name to product and derives community from agent role", () => {
		const vars = buildTemplateVariables(sessionContext());
		expect(vars.product).toBe("Alpha");
		expect(typeof vars.community).toBe("string");
		expect(vars.community?.length).toBeGreaterThan(0);
	});
});

describe("assemblePrompt", () => {
	it("composes identity, task, tools, and workspace sections", async () => {
		const result = await assemblePrompt(
			{
				systemPromptText: "You are a builder agent.",
				context: sessionContext(),
				tools: [{ name: "write_memory", description: "Persist a knowledge item" }],
				sandboxPath: "/tmp/unused",
			},
			{ knowledge: fakeKnowledge },
		);

		expect(result.assembledPrompt).toContain("## Identity");
		expect(result.assembledPrompt).toContain("You are a builder agent.");
		expect(result.assembledPrompt).toContain("**Title:** Ship the thing");
		expect(result.assembledPrompt).toContain("write_memory");
		expect(result.assembledPrompt).toContain("## Workspace");
		expect(result.personaToolsTokens).toBeGreaterThan(0);
	});

	it("omits the Identity section when systemPromptText is empty", async () => {
		const result = await assemblePrompt(
			{
				systemPromptText: "",
				context: sessionContext(),
				tools: [],
				sandboxPath: "/tmp/unused",
			},
			{ knowledge: fakeKnowledge },
		);

		expect(result.assembledPrompt).not.toContain("## Identity");
		expect(result.assembledPrompt).toContain("No tools available for this session.");
	});

	it("truncates the persona when persona + tools exceed the token budget", async () => {
		const hugePersona = `# Persona\n\n${"word ".repeat(5000)}`;
		const result = await assemblePrompt(
			{
				systemPromptText: hugePersona,
				context: sessionContext(),
				tools: [],
				sandboxPath: "/tmp/unused",
			},
			{ knowledge: fakeKnowledge },
		);

		expect(result.assembledPrompt).toContain("(Persona truncated to fit token budget.)");
		expect(result.personaToolsTokens).toBeLessThan(5000);
	});
});

describe("assembleRoutinePrompt", () => {
	it("uses the routine section instead of the task section", async () => {
		const result = await assembleRoutinePrompt(
			{
				systemPromptText: "",
				context: routineContext(),
				tools: [],
				sandboxPath: "/tmp/unused",
			},
			{ knowledge: fakeKnowledge },
		);

		expect(result.assembledPrompt).toContain("## Routine");
		expect(result.assembledPrompt).toContain("**Name:** Daily digest");
		expect(result.assembledPrompt).toContain("This is the first run of this routine.");
		expect(result.assembledPrompt).not.toContain("## Task");
	});
});

describe("composeAssistantPrompt", () => {
	it("is pure — needs no ports — and composes an identity + conversation section", () => {
		const result = composeAssistantPrompt("You are a helpful assistant.");
		expect(result.composedPrompt).toContain("## Identity");
		expect(result.composedPrompt).toContain("You are a helpful assistant.");
		expect(result.composedPrompt).toContain("## Conversation");
	});

	it("omits Identity when systemPromptText is empty", () => {
		const result = composeAssistantPrompt("");
		expect(result.composedPrompt).not.toContain("## Identity");
	});
});

describe("writeSandboxAgentsMd", () => {
	let sandboxPath: string;

	beforeEach(() => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "context-assembly-prompt-test-"));
	});

	afterEach(() => {
		fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	it("dual-writes identical content to AGENTS.md and CLAUDE.md", () => {
		writeSandboxAgentsMd(sandboxPath, "# Session Instructions");

		for (const filename of EMITTED_ROOTS_AGENTS_MD) {
			const written = fs.readFileSync(path.join(sandboxPath, filename), "utf8");
			expect(written).toBe("# Session Instructions");
		}
	});
});
