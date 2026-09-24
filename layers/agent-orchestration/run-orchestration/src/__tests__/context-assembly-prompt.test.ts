import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createContextAssembler } from "../context.js";

/**
 * AU21 §9 Increment 12 (Decision H3), Wave C: `assemblePrompt`/
 * `assembleSubscriptionPrompt` are pure now (token counting is a local
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
		ancestors: [
			{ id: "b1", title: "Root goal", description: "Ship it fast", doneCondition: "It ships" },
		],
		agent: { id: "a1", name: "Ada", role: "builder" },
		team: { id: "team1", name: "Alpha" },
	};
}

function subscriptionContext(
	overrides: {
		prompt?: string | null;
		change?: {
			id: string;
			object: "task" | "thread" | "document" | "user";
			objectId: string;
			kind: "created" | "changed" | "message";
			actor: string;
			before: Record<string, unknown> | null;
			after: Record<string, unknown>;
			at: string;
		} | null;
	} = {},
) {
	return {
		subscription: { id: "sub1", event: "task.changed", schedule: null },
		prompt: overrides.prompt === undefined ? "Watch for scope changes" : overrides.prompt,
		change:
			overrides.change === undefined
				? {
						id: "change1",
						object: "task" as const,
						objectId: "task1",
						kind: "changed" as const,
						actor: "user1",
						before: { state: "todo" },
						after: { state: "in_progress" },
						at: "2026-09-23T00:00:00.000Z",
					}
				: overrides.change,
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
			tools: [{ name: "write_memory", description: "Persist a document" }],
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

// Every session goes through the generic `assembleTaskFreePrompt` path,
// whose `## Conversation` section is covered by
// `generic-transcript-prompt-assembly.integration.test.ts`.

describe("assembleSubscriptionPrompt", () => {
	it("uses the subscription section instead of the task section", async () => {
		const result = await assembler.assembleSubscriptionPrompt({
			systemPromptText: "",
			context: subscriptionContext(),
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("## Subscription");
		expect(result.assembledPrompt).toContain("**Subscribed to:** task.changed");
		expect(result.assembledPrompt).not.toContain("## Task");
	});

	it("renders a non-null prompt under a `### Instruction` heading", async () => {
		const result = await assembler.assembleSubscriptionPrompt({
			systemPromptText: "",
			context: subscriptionContext({ prompt: "Watch for scope changes" }),
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("### Instruction");
		expect(result.assembledPrompt).toContain("Watch for scope changes");
	});

	it("omits the Instruction block entirely when the prompt is null", async () => {
		const result = await assembler.assembleSubscriptionPrompt({
			systemPromptText: "",
			context: subscriptionContext({ prompt: null }),
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).not.toContain("### Instruction");
	});

	it("renders the change under a `### What happened` heading, with object/kind/actor and before/after", async () => {
		const result = await assembler.assembleSubscriptionPrompt({
			systemPromptText: "",
			context: subscriptionContext(),
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("### What happened");
		expect(result.assembledPrompt).toContain("**Object:** task task1");
		expect(result.assembledPrompt).toContain("**Kind:** changed");
		expect(result.assembledPrompt).toContain("**Actor:** user1");
		expect(result.assembledPrompt).toContain('"state": "todo"');
		expect(result.assembledPrompt).toContain('"state": "in_progress"');
	});

	it("cuts a change value over 2,000 characters with a pointer back to the object", async () => {
		const hugeAfter = { note: "x".repeat(3000) };
		const result = await assembler.assembleSubscriptionPrompt({
			systemPromptText: "",
			context: subscriptionContext({
				change: {
					id: "change1",
					object: "document",
					objectId: "doc1",
					kind: "changed",
					actor: "user1",
					before: null,
					after: hugeAfter,
					at: "2026-09-23T00:00:00.000Z",
				},
			}),
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("(open the object for the rest)");
		expect(result.assembledPrompt).not.toContain("x".repeat(3000));
	});

	it("notes a schedule tick instead of a change when the wake carries none", async () => {
		const result = await assembler.assembleSubscriptionPrompt({
			systemPromptText: "",
			context: subscriptionContext({ change: null }),
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("This run was woken by a schedule, not a change.");
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
		assembler.writeSandboxAgentsMd(sandboxPath, "# Session Instructions");

		for (const filename of ["AGENTS.md", "CLAUDE.md"]) {
			const written = fs.readFileSync(path.join(sandboxPath, filename), "utf8");
			expect(written).toBe("# Session Instructions");
		}
	});
});
