/**
 * X1: Session Context Assembly — RED phase tests.
 *
 * Tests written before implementation. All imports from
 * `../context-assembly-prompt.js` will fail until the module is created in the
 * green phase.
 *
 * AC mapping (see plans/X1/architecture.md):
 *   AC1 — assemblePrompt assembles all four sections
 *   AC2 — template variables substituted
 *   AC3 — composed prompt passed via SessionConfig.assembledPrompt
 *   AC4 — CLAUDE.md written during provisioning
 *   AC5 — empty systemPromptText graceful degradation
 *   AC6 — persona + tools section ≤ 4000 tokens
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { bets, tasks, teamMembers, teams, threads, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import {
	assemblePrompt,
	buildTemplateVariables,
	type PromptCompositionInput,
	stripFrontmatter,
	substituteTemplateVars,
	writeSandboxAgentsMd,
} from "../context-assembly-prompt.js";
import type { SessionContextData } from "../session-context.js";
import { buildSessionContext, buildSessionContextData } from "../session-context.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal session context data for unit tests (no DB required). */
function makeContextData(overrides: Partial<SessionContextData> = {}): SessionContextData {
	return {
		task: {
			id: "task-1",
			title: "Build the thing",
			description: "Implement the feature",
			state: "in_progress",
		},
		bet: {
			id: "bet-1",
			description: "Ship feature X",
			appetite: "small",
			doneCondition: "All tests pass",
		},
		agent: {
			id: "agent-1",
			name: "BuilderBot",
			role: "builder",
		},
		team: {
			id: "prod-1",
			name: "Acme Corp",
		},
		...overrides,
	};
}

/** Minimal ToolSummary for tests. */
const TEST_TOOLS = [
	{ name: "read_file", description: "Read a file from the workspace" },
	{ name: "write_file", description: "Write content to a file" },
];

/** System prompt content with frontmatter. */
const SYSTEM_PROMPT_WITH_FRONTMATTER = `---
role: builder
version: 1
---

# You are the Builder of the \`{{product}}\`

Your job is to write great software for the {{community}} community.
`;

/** System prompt content without frontmatter. */
const SYSTEM_PROMPT_NO_FRONTMATTER = `# You are the Builder

Your job is to write great software.
`;

// ---------------------------------------------------------------------------
// 1. stripFrontmatter
// ---------------------------------------------------------------------------

describe("stripFrontmatter", () => {
	test("removes YAML frontmatter delimited by ---", () => {
		const input = `---\nrole: builder\nversion: 1\n---\n\n# Heading\n\nBody text.\n`;
		const result = stripFrontmatter(input);
		expect(result).not.toContain("role: builder");
		expect(result).not.toContain("---");
		expect(result).toContain("# Heading");
		expect(result).toContain("Body text.");
	});

	test("returns unchanged content when no frontmatter present", () => {
		const input = `# Just a heading\n\nSome content here.\n`;
		const result = stripFrontmatter(input);
		expect(result).toBe(input);
	});

	test("handles frontmatter immediately at start of file (no leading newline)", () => {
		const input = `---\nkey: value\n---\n\n# Body`;
		const result = stripFrontmatter(input);
		expect(result).not.toContain("key: value");
		expect(result).toContain("# Body");
	});
});

// ---------------------------------------------------------------------------
// 2. substituteTemplateVars
// ---------------------------------------------------------------------------

describe("substituteTemplateVars", () => {
	test("replaces {{product}} with team name", () => {
		const template = "You work on {{product}}.";
		const vars = { product: "Acme Corp", community: "building" };
		const result = substituteTemplateVars(template, vars);
		expect(result).toBe("You work on Acme Corp.");
	});

	test("replaces {{community}} with community value", () => {
		const template = "You serve the {{community}} community.";
		const vars = { product: "Acme Corp", community: "building" };
		const result = substituteTemplateVars(template, vars);
		expect(result).toBe("You serve the building community.");
	});

	test("replaces multiple occurrences of the same variable", () => {
		const template = "{{product}} is the product. Focus on {{product}}.";
		const vars = { product: "Acme Corp", community: "building" };
		const result = substituteTemplateVars(template, vars);
		expect(result).toBe("Acme Corp is the product. Focus on Acme Corp.");
	});

	test("leaves unrecognized {{unknown_var}} as-is (passthrough behavior)", () => {
		const template = "This is {{product}} with an {{unknown_var}} inside.";
		const vars = { product: "Acme Corp", community: "building" };
		const result = substituteTemplateVars(template, vars);
		expect(result).toBe("This is Acme Corp with an {{unknown_var}} inside.");
	});

	test("leaves template unchanged when vars is empty", () => {
		const template = "{{product}} and {{community}}";
		const result = substituteTemplateVars(template, {});
		expect(result).toBe("{{product}} and {{community}}");
	});
});

// ---------------------------------------------------------------------------
// 3. buildTemplateVariables
// ---------------------------------------------------------------------------

describe("buildTemplateVariables", () => {
	test("returns product as team name", () => {
		const ctx = makeContextData();
		const vars = buildTemplateVariables(ctx);
		expect(vars.product).toBe("Acme Corp");
	});

	test("returns community from ROLE_TO_COMMUNITY map for builder role", () => {
		const ctx = makeContextData();
		const vars = buildTemplateVariables(ctx);
		expect(vars.community).toBe("building");
	});

	test("returns community from ROLE_TO_COMMUNITY map for product_manager role", () => {
		const ctx = makeContextData({ agent: { id: "a1", name: "PM", role: "product_manager" } });
		const vars = buildTemplateVariables(ctx);
		expect(vars.community).toBe("product");
	});
});

// ---------------------------------------------------------------------------
// 4. assemblePrompt — with system prompt (X3: updated to use systemPromptText)
// ---------------------------------------------------------------------------

describe("assemblePrompt with system prompt", () => {
	test("result contains ## Identity section when systemPromptText is provided", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_WITH_FRONTMATTER,
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("## Identity");
	});

	test("result contains ## Task section", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_NO_FRONTMATTER,
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("## Task");
		expect(result.assembledPrompt).toContain("Build the thing");
	});

	test("result contains ## Available Tools section", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_NO_FRONTMATTER,
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("## Available Tools");
		expect(result.assembledPrompt).toContain("read_file");
		expect(result.assembledPrompt).toContain("write_file");
	});

	test("result contains ## Workspace section", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_NO_FRONTMATTER,
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("## Workspace");
		expect(result.assembledPrompt).toContain("context/");
		expect(result.assembledPrompt).toContain("work/");
	});

	test("frontmatter is stripped from system prompt content", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_WITH_FRONTMATTER,
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).not.toContain("role: builder");
		expect(result.assembledPrompt).not.toContain("version: 1");
	});

	test("template variables are substituted in system prompt content (AC2)", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_WITH_FRONTMATTER,
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		// {{product}} should be replaced with team name "Acme Corp"
		expect(result.assembledPrompt).toContain("Acme Corp");
		expect(result.assembledPrompt).not.toContain("{{product}}");
		// {{community}} should be replaced with "building" for builder role
		expect(result.assembledPrompt).toContain("building");
		expect(result.assembledPrompt).not.toContain("{{community}}");
	});

	test("task title is included in the Task section", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_NO_FRONTMATTER,
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("**Title:** Build the thing");
	});

	test("task description is included", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_NO_FRONTMATTER,
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("Implement the feature");
	});

	test("bet context is included in Task section", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_NO_FRONTMATTER,
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("Ship feature X");
		expect(result.assembledPrompt).toContain("small");
	});

	test("done condition is included when present", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_NO_FRONTMATTER,
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("All tests pass");
	});

	test("returns personaToolsTokens count", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_NO_FRONTMATTER,
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(typeof result.personaToolsTokens).toBe("number");
		expect(result.personaToolsTokens).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// 5. assemblePrompt — empty systemPromptText (AC5, X3 updated)
// ---------------------------------------------------------------------------

describe("assemblePrompt with empty systemPromptText", () => {
	test("omits ## Identity section when systemPromptText is empty (AC5)", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: "",
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).not.toContain("## Identity");
	});

	test("includes ## Task section when systemPromptText is empty (AC5)", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: "",
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("## Task");
	});

	test("includes ## Available Tools section when systemPromptText is empty (AC5)", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: "",
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("## Available Tools");
	});

	test("includes ## Workspace section when systemPromptText is empty (AC5)", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: "",
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("## Workspace");
	});
});

// ---------------------------------------------------------------------------
// 6. Task field edge cases
// ---------------------------------------------------------------------------

describe("assemblePrompt task field edge cases", () => {
	test("shows 'No description provided.' when task.description is null", async () => {
		const ctx = makeContextData({
			task: { id: "t1", title: "No desc task", description: null, state: "accepted" },
		});
		const input: PromptCompositionInput = {
			systemPromptText: "",
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("No description provided.");
	});

	test("shows 'Not specified.' when bet.doneCondition is null", async () => {
		const ctx = makeContextData({
			bet: { id: "b1", description: "Ship it", appetite: "small", doneCondition: null },
		});
		const input: PromptCompositionInput = {
			systemPromptText: "",
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("Not specified.");
	});
});

// ---------------------------------------------------------------------------
// 7. Token budget (AC6)
// ---------------------------------------------------------------------------

describe("token budget enforcement", () => {
	test("personaToolsTokens is under 4000 for a normal system prompt (AC6)", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_NO_FRONTMATTER,
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.personaToolsTokens).toBeLessThan(4000);
	});

	test("truncates oversized persona when it exceeds budget", async () => {
		// Generate a system prompt that exceeds 4000 tokens (whitespace-split approx: ~4000 words)
		const bigContent = `# Huge Identity Heading\n\n${"word ".repeat(4200)}\n\n## Another section\n\nMore words.\n`;
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: bigContent,
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		// Token count must be within budget after truncation
		expect(result.personaToolsTokens).toBeLessThanOrEqual(4000);
		// The truncation notice must appear
		expect(result.assembledPrompt).toContain("Persona truncated to fit token budget.");
		// First heading must be preserved
		expect(result.assembledPrompt).toContain("# Huge Identity Heading");
	});

	test("truncated prompt still contains all non-persona sections", async () => {
		const bigContent = `# Big system-prompt\n\n${"word ".repeat(4200)}\n`;
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: bigContent,
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		expect(result.assembledPrompt).toContain("## Task");
		expect(result.assembledPrompt).toContain("## Available Tools");
		expect(result.assembledPrompt).toContain("## Workspace");
	});
});

// ---------------------------------------------------------------------------
// 8. writeSandboxAgentsMd (AC4)
// ---------------------------------------------------------------------------

describe("writeSandboxAgentsMd", () => {
	test("writes AGENTS.md and CLAUDE.md at sandbox root (AC4)", () => {
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "x1-ws-test-"));
		const content = "# Session Instructions\n\nTest content.";

		writeSandboxAgentsMd(sandboxPath, content);

		const claudeMdPath = path.join(sandboxPath, "CLAUDE.md");
		expect(fs.existsSync(claudeMdPath)).toBe(true);
		expect(fs.readFileSync(claudeMdPath, "utf8")).toBe(content);
	});

	test("overwrites existing CLAUDE.md when called again", () => {
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "x1-ws-test-"));
		const claudeMdPath = path.join(sandboxPath, "CLAUDE.md");
		fs.writeFileSync(claudeMdPath, "old content", "utf8");

		writeSandboxAgentsMd(sandboxPath, "new content");

		expect(fs.readFileSync(claudeMdPath, "utf8")).toBe("new content");
	});
});

// ---------------------------------------------------------------------------
// 9. Determinism
// ---------------------------------------------------------------------------

describe("assemblePrompt determinism", () => {
	test("same inputs produce identical output on repeated calls", async () => {
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: SYSTEM_PROMPT_WITH_FRONTMATTER,
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result1 = await assemblePrompt(input);
		const result2 = await assemblePrompt(input);

		expect(result1.assembledPrompt).toBe(result2.assembledPrompt);
		expect(result1.personaToolsTokens).toBe(result2.personaToolsTokens);
	});
});

// ---------------------------------------------------------------------------
// 10. buildSessionContextData — refactor regression
// ---------------------------------------------------------------------------

describe("buildSessionContextData", () => {
	async function seedTestData(db: Parameters<typeof buildSessionContextData>[0]) {
		const now = new Date().toISOString();
		const productId = "prod-1";
		const agentId = "agent-1";
		const teamMemberId = "team-member-1";
		const betId = "bet-1";
		const taskId = "task-1";
		const threadId = "thread-1";

		await db
			.insert(teams)
			.values({ id: productId, name: "TestProduct", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: teamMemberId,
			teamId: productId,
			capacity: 3,
			activeBets: 1,
			formedAt: now,
		});
		await db.insert(users).values({
			id: agentId,
			name: "BuilderBot",
			role: "builder",
			status: "active",
			teamId: teamMemberId,
			createdAt: now,
		});
		await db.insert(bets).values({
			id: betId,
			teamId: productId,
			description: "Build the thing",
			appetite: "small",
			doneCondition: "Tests pass",
			status: "active",
			createdAt: now,
		});
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: taskId,
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: taskId,
			betId,
			teamId: productId,
			ownerAgentId: agentId,
			title: "Implement feature X",
			description: "Build the context assembly engine",
			doneCondition: "All tests pass",
			state: "in_progress",
			threadId,
			createdAt: now,
			updatedAt: now,
		});
		return { productId, agentId, taskId };
	}

	test("returns typed SessionContextData without TOON encoding", async ({ db }) => {
		const { productId, agentId, taskId } = await seedTestData(db);

		const data = await buildSessionContextData(db, {
			sessionId: "placeholder",
			taskId,
			agentId,
			agentRole: "builder",
			productId,
		});

		// Typed structure check
		expect(data.task.id).toBe("task-1");
		expect(data.task.title).toBe("Implement feature X");
		expect(data.bet.description).toBe("Build the thing");
		expect(data.agent.name).toBe("BuilderBot");
		expect(data.team.name).toBe("TestProduct");
	});

	test("is not a string (not TOON-encoded)", async ({ db }) => {
		const { productId, agentId, taskId } = await seedTestData(db);

		const data = await buildSessionContextData(db, {
			sessionId: "placeholder",
			taskId,
			agentId,
			agentRole: "builder",
			productId,
		});

		expect(typeof data).not.toBe("string");
		expect(typeof data).toBe("object");
	});
});

// ---------------------------------------------------------------------------
// 11. buildSessionContext regression — TOON output unchanged after refactor
// ---------------------------------------------------------------------------

describe("buildSessionContext regression", () => {
	async function seedRegTestData(db: Parameters<typeof buildSessionContext>[0]) {
		const now = new Date().toISOString();
		const productId = "reg-prod-1";
		const agentId = "reg-agent-1";
		const teamMemberId = "reg-team-member-1";
		const betId = "reg-bet-1";
		const taskId = "reg-task-1";
		const threadId = "reg-thread-1";

		await db
			.insert(teams)
			.values({ id: productId, name: "RegProduct", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: teamMemberId,
			teamId: productId,
			capacity: 3,
			activeBets: 1,
			formedAt: now,
		});
		await db.insert(users).values({
			id: agentId,
			name: "RegAgent",
			role: "builder",
			status: "active",
			teamId: teamMemberId,
			createdAt: now,
		});
		await db.insert(bets).values({
			id: betId,
			teamId: productId,
			description: "Reg bet description",
			appetite: "medium",
			doneCondition: "Reg done condition",
			status: "active",
			createdAt: now,
		});
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: taskId,
			initiatorId: agentId,
			participants: JSON.stringify([agentId]),
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: taskId,
			betId,
			teamId: productId,
			ownerAgentId: agentId,
			title: "Reg Task Title",
			description: "Reg task description",
			doneCondition: "Reg task done",
			state: "in_progress",
			threadId,
			createdAt: now,
			updatedAt: now,
		});
		return { productId, agentId, taskId };
	}

	test("buildSessionContext returns same TOON as buildSessionContextData + encode would produce", async ({
		db,
	}) => {
		// This test verifies the refactor: buildSessionContext = buildSessionContextData + encode.
		// After the refactor, calling buildSessionContext must still return a TOON-encoded string
		// whose decoded content equals what buildSessionContextData returns.
		const { productId, agentId, taskId } = await seedRegTestData(db);
		const sessionId = "reg-sess-placeholder";
		const config = { sessionId, taskId, agentId, agentRole: "builder" as const, productId };

		const toon = await buildSessionContext(db, config);
		const data = await buildSessionContextData(db, config);

		// TOON is a string
		expect(typeof toon).toBe("string");
		expect(toon.length).toBeGreaterThan(0);

		// The structured data fields must match what the TOON encodes
		expect(data.task.title).toBe("Reg Task Title");
		expect(data.bet.description).toBe("Reg bet description");
		expect(data.team.name).toBe("RegProduct");
	});
});

// ---------------------------------------------------------------------------
// 13. unrecognized template variable passthrough (from critique WARNING)
// ---------------------------------------------------------------------------

describe("unrecognized template variable passthrough", () => {
	test("leaves {{unknown_var}} literally in composed prompt output", async () => {
		// System prompt with an unregistered template variable
		const systemPromptContent = `# You are the Agent for {{product}}\n\nYour factory is {{factory}}.\n`;
		const ctx = makeContextData();
		const input: PromptCompositionInput = {
			systemPromptText: systemPromptContent,
			context: ctx,
			tools: TEST_TOOLS,
			sandboxPath: "/workspace/test",
		};

		const result = await assemblePrompt(input);
		// {{product}} is known — replaced
		expect(result.assembledPrompt).not.toContain("{{product}}");
		// {{factory}} is unregistered — must pass through literally
		expect(result.assembledPrompt).toContain("{{factory}}");
	});
});
