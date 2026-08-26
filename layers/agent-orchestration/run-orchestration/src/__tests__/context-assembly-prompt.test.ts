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

function routineContext(prompt: string | null = "Summarize activity") {
	return {
		routine: {
			id: "r1",
			name: "Daily digest",
			prompt,
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

	// BA1 D3: one column, one rendering — `**Purpose:**` becomes `### Instruction`.
	it("renders a non-null prompt under a `### Instruction` heading, not `**Purpose:**`", async () => {
		const result = await assembler.assembleRoutinePrompt({
			systemPromptText: "",
			context: routineContext("Summarize activity"),
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("### Instruction");
		expect(result.assembledPrompt).toContain("Summarize activity");
		expect(result.assembledPrompt).not.toContain("**Purpose:**");
	});

	it("omits the Instruction block entirely when the prompt is null", async () => {
		const result = await assembler.assembleRoutinePrompt({
			systemPromptText: "",
			context: routineContext(null),
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).not.toContain("### Instruction");
		expect(result.assembledPrompt).not.toContain("**Purpose:**");
	});

	// BA9c: trigger event rendering
	it("renders ### Trigger Event section when context has a task triggerEvent", async () => {
		const context = {
			...routineContext(),
			triggerEvent: {
				type: "task_state_changed",
				timestamp: 1_700_000_000_000,
				transition: { from: "in_progress", to: "completed" },
				subject: {
					kind: "task" as const,
					task: {
						id: "t-x",
						title: "BA9c-PROBE-TITLE",
						description: "probe desc",
						state: "completed",
					},
					bet: {
						id: "b-x",
						description: "BA9c-PROBE-BET",
						appetite: "1 week",
						doneCondition: "Ships to prod",
					},
				},
			},
		};
		const result = await assembler.assembleRoutinePrompt({
			systemPromptText: "",
			context,
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("### Trigger Event");
		expect(result.assembledPrompt).toContain("BA9c-PROBE-TITLE");
		expect(result.assembledPrompt).toContain("BA9c-PROBE-BET");
		expect(result.assembledPrompt).toContain("in_progress → completed");
		// B3: timestamp rendered
		expect(result.assembledPrompt).toContain("**When:**");
		// appetite + doneCondition rendered (B1)
		expect(result.assembledPrompt).toContain("1 week");
		expect(result.assembledPrompt).toContain("Ships to prod");
	});

	it("renders ### Trigger Event section when context has a bet triggerEvent", async () => {
		const context = {
			...routineContext(),
			triggerEvent: {
				type: "bet_state_changed",
				timestamp: 1_700_000_000_000,
				subject: {
					kind: "bet" as const,
					bet: {
						id: "b-y",
						description: "BA9c-BET-SUBJECT",
						appetite: "2 weeks",
						doneCondition: "All tests green",
					},
				},
			},
		};
		const result = await assembler.assembleRoutinePrompt({
			systemPromptText: "",
			context,
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("### Trigger Event");
		expect(result.assembledPrompt).toContain("BA9c-BET-SUBJECT");
		expect(result.assembledPrompt).not.toContain("Task that triggered");
		expect(result.assembledPrompt).toContain("**When:**");
		expect(result.assembledPrompt).toContain("2 weeks");
		expect(result.assembledPrompt).toContain("All tests green");
	});

	// After BA9c: thread events now produce kind:"thread" (rich shape), not kind:"generic".
	// kind:"generic" is kept for event kinds with no core entity (e.g. "routine").
	it("renders generic subject when entityKind has no rich shape (e.g. routine)", async () => {
		const context = {
			...routineContext(),
			triggerEvent: {
				type: "routine_fired",
				timestamp: 1_700_000_000_000,
				subject: {
					kind: "generic" as const,
					entityKind: "routine",
					entityId: "routine-abc-123",
					actorId: "agent-456",
				},
			},
		};
		const result = await assembler.assembleRoutinePrompt({
			systemPromptText: "",
			context,
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("### Trigger Event");
		expect(result.assembledPrompt).toContain("routine-abc-123");
		expect(result.assembledPrompt).toContain("agent-456");
		expect(result.assembledPrompt).toContain("**When:**");
	});

	// BA9c: 7 new rich subject kind rendering tests

	it("renders thread subject with hostKind, hostId, and state", async () => {
		const context = {
			...routineContext(),
			triggerEvent: {
				type: "thread_message_appended",
				timestamp: 1_700_000_000_000,
				subject: {
					kind: "thread" as const,
					thread: {
						id: "thread-ba9c-probe",
						hostKind: "task",
						hostId: "task-host-ba9c",
						resolvedAt: null,
					},
					actorId: "user-sender-ba9c",
				},
			},
		};
		const result = await assembler.assembleRoutinePrompt({
			systemPromptText: "",
			context,
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("### Trigger Event");
		expect(result.assembledPrompt).toContain("task");
		expect(result.assembledPrompt).toContain("task-host-ba9c");
		expect(result.assembledPrompt).toContain("**When:**");
		expect(result.assembledPrompt).toContain("user-sender-ba9c");
	});

	it("renders item (work item) subject with title", async () => {
		const context = {
			...routineContext(),
			triggerEvent: {
				type: "item_created",
				timestamp: 1_700_000_000_000,
				subject: {
					kind: "item" as const,
					item: {
						id: "item-ba9c-probe",
						title: "BA9c-ITEM-PROBE-TITLE",
						kind: "review",
						body: "Item body content",
					},
					actorId: "agent-creator-ba9c",
				},
			},
		};
		const result = await assembler.assembleRoutinePrompt({
			systemPromptText: "",
			context,
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("### Trigger Event");
		expect(result.assembledPrompt).toContain("BA9c-ITEM-PROBE-TITLE");
		expect(result.assembledPrompt).toContain("**When:**");
	});

	it("renders knowledge-item subject with title and format", async () => {
		const context = {
			...routineContext(),
			triggerEvent: {
				type: "knowledge_created",
				timestamp: 1_700_000_000_000,
				subject: {
					kind: "knowledge-item" as const,
					item: {
						id: "ki-ba9c-probe",
						title: "BA9c-KI-PROBE-TITLE",
						body: "Knowledge body",
						format: "markdown",
						version: 1,
					},
					actorId: "user-ki-actor",
				},
			},
		};
		const result = await assembler.assembleRoutinePrompt({
			systemPromptText: "",
			context,
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("### Trigger Event");
		expect(result.assembledPrompt).toContain("BA9c-KI-PROBE-TITLE");
		expect(result.assembledPrompt).toContain("markdown");
		expect(result.assembledPrompt).toContain("**When:**");
	});

	it("renders artifact subject with kind and producingTaskId", async () => {
		const context = {
			...routineContext(),
			triggerEvent: {
				type: "artifact_created",
				timestamp: 1_700_000_000_000,
				subject: {
					kind: "artifact" as const,
					artifact: {
						id: "artifact-ba9c-probe",
						kind: "document",
						label: "BA9c Artifact Label",
						producingTaskId: "task-producing-ba9c",
					},
					actorId: "agent-artifact-actor",
				},
			},
		};
		const result = await assembler.assembleRoutinePrompt({
			systemPromptText: "",
			context,
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("### Trigger Event");
		expect(result.assembledPrompt).toContain("document");
		expect(result.assembledPrompt).toContain("task-producing-ba9c");
		expect(result.assembledPrompt).toContain("**When:**");
	});

	it("renders team subject with name", async () => {
		const context = {
			...routineContext(),
			triggerEvent: {
				type: "team_created",
				timestamp: 1_700_000_000_000,
				subject: {
					kind: "team" as const,
					team: {
						id: "team-ba9c-probe",
						name: "BA9c-TEAM-PROBE-NAME",
					},
					actorId: "user-team-actor",
				},
			},
		};
		const result = await assembler.assembleRoutinePrompt({
			systemPromptText: "",
			context,
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("### Trigger Event");
		expect(result.assembledPrompt).toContain("BA9c-TEAM-PROBE-NAME");
		expect(result.assembledPrompt).toContain("**When:**");
	});

	it("renders session subject with state and agentId", async () => {
		const context = {
			...routineContext(),
			triggerEvent: {
				type: "session_ended",
				timestamp: 1_700_000_000_000,
				subject: {
					kind: "session" as const,
					session: {
						id: "session-ba9c-probe",
						state: "ended",
						agentId: "agent-session-ba9c",
						outcome: "success",
					},
				},
			},
		};
		const result = await assembler.assembleRoutinePrompt({
			systemPromptText: "",
			context,
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("### Trigger Event");
		expect(result.assembledPrompt).toContain("ended");
		expect(result.assembledPrompt).toContain("agent-session-ba9c");
		expect(result.assembledPrompt).toContain("**When:**");
	});

	it("renders agent subject with name and role", async () => {
		const context = {
			...routineContext(),
			triggerEvent: {
				type: "agent_added",
				timestamp: 1_700_000_000_000,
				subject: {
					kind: "agent" as const,
					agent: {
						id: "agent-ba9c-probe",
						name: "BA9c-AGENT-PROBE-NAME",
						role: "builder",
					},
					actorId: "user-actor-ba9c",
				},
			},
		};
		const result = await assembler.assembleRoutinePrompt({
			systemPromptText: "",
			context,
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("### Trigger Event");
		expect(result.assembledPrompt).toContain("BA9c-AGENT-PROBE-NAME");
		expect(result.assembledPrompt).toContain("builder");
		expect(result.assembledPrompt).toContain("**When:**");
	});

	it("renders 'no identifiable entity' when subject is absent", async () => {
		const context = {
			...routineContext(),
			triggerEvent: {
				type: "notification",
				timestamp: 1_700_000_000_000,
			},
		};
		const result = await assembler.assembleRoutinePrompt({
			systemPromptText: "",
			context,
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("### Trigger Event");
		expect(result.assembledPrompt).toContain("no identifiable entity");
	});

	it("omits ### Trigger Event section when no triggerEvent (clock-fired path)", async () => {
		const result = await assembler.assembleRoutinePrompt({
			systemPromptText: "",
			context: routineContext(),
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).not.toContain("### Trigger Event");
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
