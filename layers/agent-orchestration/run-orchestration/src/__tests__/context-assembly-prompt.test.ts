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
		ancestors: [
			{ id: "b1", title: "Root goal", description: "Ship it fast", doneCondition: "It ships" },
		],
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
					ancestors: [
						{
							id: "b-x",
							title: "Root goal",
							description: "BA9c-PROBE-ANCESTOR",
							doneCondition: "Ships to prod",
						},
					],
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
		expect(result.assembledPrompt).toContain("BA9c-PROBE-ANCESTOR");
		expect(result.assembledPrompt).toContain("in_progress → completed");
		// B3: timestamp rendered
		expect(result.assembledPrompt).toContain("**When:**");
		expect(result.assembledPrompt).toContain("Ancestor tasks");
	});

	// After BA9c: thread events now produce kind:"thread" (rich shape), not kind:"generic".
	// kind:"generic" is the fallback used when the DB lookup for the entity misses
	// (e.g. a "team" subject whose team row is gone by fire time).
	it("renders generic subject when entityKind has no rich shape (e.g. team)", async () => {
		const context = {
			...routineContext(),
			triggerEvent: {
				type: "team_created",
				timestamp: 1_700_000_000_000,
				subject: {
					kind: "generic" as const,
					entityKind: "team",
					entityId: "team-abc-123",
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
		expect(result.assembledPrompt).toContain("team-abc-123");
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

	// @lore BC3 architecture.md §5: it("renders item (work item) subject with
	// title") DELETED — the kind:"item"/item_created subject variant no
	// longer exists (the `items` table is gone).
	//
	// @lore B22 (architecture.md §0 A1): it("renders knowledge-item subject
	// with title and format") DELETED — `kind:"knowledge-item"` and the three
	// `knowledge_*` events it rendered are gone (never authorable in
	// practice: no seed or plugin ever created a routine on one). The
	// rendering path itself (a subject arm in the same if/else-if ladder as
	// "thread"/"team"/"session"/"agent" below) is proven by those siblings.

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

	it("renders user subject for user events", async () => {
		const context = {
			...routineContext(),
			triggerEvent: {
				type: "user_created",
				timestamp: 1_700_000_000_000,
				subject: {
					kind: "user" as const,
					user: {
						id: "user-ba9c-probe",
						name: "BA9c-USER-PROBE-NAME",
						role: "member",
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
		expect(result.assembledPrompt).toContain("BA9c-USER-PROBE-NAME");
		expect(result.assembledPrompt).toContain("member");
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

describe("assembleSubscriptionPrompt", () => {
	it("uses the subscription section instead of the task or routine section", async () => {
		const result = await assembler.assembleSubscriptionPrompt({
			systemPromptText: "",
			context: subscriptionContext(),
			tools: [],
			sandboxPath: "/tmp/unused",
		});

		expect(result.assembledPrompt).toContain("## Subscription");
		expect(result.assembledPrompt).toContain("**Subscribed to:** task.changed");
		expect(result.assembledPrompt).not.toContain("## Task");
		expect(result.assembledPrompt).not.toContain("## Routine");
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
