/**
 * BA9b: Unit tests for capability item materialisation.
 * Proves that skill/rule/agent_file items are written to the correct sandbox locations.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createContextAssembler } from "../context.js";

const assembler = createContextAssembler({
	filesystems: {
		startWatcher: () => ({ stop: () => {} }),
	},
});

function makeBundle(
	agentId: string,
	knowledge: Array<{
		id: string;
		title: string;
		body: string;
		format?: string;
		version?: number;
		layer?: string | null;
		role?: string;
		agentBindingId?: string | null;
	}>,
) {
	return {
		kind: "task" as const,
		task: { id: "t-ba9b", title: "Test", description: null, state: "in_progress" },
		ancestors: [],
		agent: { id: agentId, name: "Tester", role: "builder" },
		team: { id: "team-ba9b", name: "Test Team" },
		knowledge: knowledge.map((k) => ({
			id: k.id,
			title: k.title,
			body: k.body,
			format: k.format ?? "markdown",
			version: k.version ?? 1,
			layer: k.layer ?? null,
			role: k.role ?? "ordinary",
			agentBindingId: k.agentBindingId ?? null,
		})),
	};
}

let sandboxPath: string;

beforeEach(() => {
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba9b-test-"));
});

afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
});

describe("BA9b: skill items materialise to harness skill dirs", () => {
	it("writes SKILL.md to .claude/skills/<dirName>/SKILL.md", async () => {
		const bundle = makeBundle("agent-1", [
			{ id: "skill-1", title: "write-tests", body: "# Write Tests\nDo TDD.", role: "skill" },
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-1",
			taskId: "t-ba9b",
			agentId: "agent-1",
			agentRole: "builder",
			teamId: "team-ba9b",
			isRoutine: false,
			sourceKind: null,
			sourceId: null,
			sourceCorrelation: null,
			contextBundle: bundle,
		});

		const skillPath = path.join(sandboxPath, ".claude/skills/write-tests/SKILL.md");
		expect(fs.existsSync(skillPath)).toBe(true);
		expect(fs.readFileSync(skillPath, "utf-8")).toBe("# Write Tests\nDo TDD.");
	});

	it("writes SKILL.md to .agents/skills/ (for codex and cursor-agent)", async () => {
		// .agents/skills covers codex (only dir it reads) and cursor-agent.
		// .opencode/skills is omitted — opencode also reads .claude/skills.
		// .codex-home/skills is dead — nothing reads it (see BA9b plan.md, "As built").
		const bundle = makeBundle("agent-1", [
			{ id: "skill-2", title: "my-skill", body: "Body.", role: "skill" },
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-2",
			taskId: "t-ba9b",
			agentId: "agent-1",
			agentRole: "builder",
			teamId: "team-ba9b",
			isRoutine: false,
			sourceKind: null,
			sourceId: null,
			sourceCorrelation: null,
			contextBundle: bundle,
		});

		expect(fs.existsSync(path.join(sandboxPath, ".agents/skills/my-skill/SKILL.md"))).toBe(true);
		// .opencode/skills and .codex-home/skills must NOT be written (dead paths).
		expect(fs.existsSync(path.join(sandboxPath, ".opencode/skills/my-skill/SKILL.md"))).toBe(false);
		expect(fs.existsSync(path.join(sandboxPath, ".codex-home/skills/my-skill/SKILL.md"))).toBe(
			false,
		);
	});

	it("skills do NOT appear in knowledge/ or context/", async () => {
		const bundle = makeBundle("agent-1", [
			{ id: "skill-3", title: "plan", body: "Planning skill.", role: "skill", layer: "L4" },
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-3",
			taskId: "t-ba9b",
			agentId: "agent-1",
			agentRole: "builder",
			teamId: "team-ba9b",
			isRoutine: false,
			sourceKind: null,
			sourceId: null,
			sourceCorrelation: null,
			contextBundle: bundle,
		});

		// skill must NOT be written to context/factory even though layer=L4
		const factoryDir = path.join(sandboxPath, "context/factory");
		const factoryFiles = fs.existsSync(factoryDir) ? fs.readdirSync(factoryDir) : [];
		expect(factoryFiles).toHaveLength(0);
	});
});

describe("BA9b: rule items materialise to knowledge/rules/", () => {
	it("writes rule body as a markdown file under knowledge/rules/", async () => {
		const bundle = makeBundle("agent-1", [
			{ id: "rule-1", title: "no-console", body: "Never use console.log.", role: "rule" },
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-4",
			taskId: "t-ba9b",
			agentId: "agent-1",
			agentRole: "builder",
			teamId: "team-ba9b",
			isRoutine: false,
			sourceKind: null,
			sourceId: null,
			sourceCorrelation: null,
			contextBundle: bundle,
		});

		const rulesDir = path.join(sandboxPath, "knowledge/rules");
		expect(fs.existsSync(rulesDir)).toBe(true);
		const files = fs.readdirSync(rulesDir);
		expect(files.length).toBeGreaterThan(0);
		const ruleFile = files.find((f) => f.includes("no-console") || f.includes("no_console"));
		expect(ruleFile).toBeDefined();
		expect(fs.readFileSync(path.join(rulesDir, ruleFile!), "utf-8")).toBe("Never use console.log.");
	});
});

describe("BA9b: agent_file items are bound to a specific agent", () => {
	// @lore BA9f: the agent file bound to THIS agent is its identity, and its home
	// in the sandbox is the "## Identity" section of AGENTS.md — baked at emit and
	// assembled by the provisioner. Materialising it into `knowledge/rules/` too
	// would put the same text in the sandbox twice, so it is deliberately absent
	// from there. The other two cases below are unchanged: an agent file bound to
	// someone else never arrives, and an unbound one reaches every session.
	it("does not re-materialise the bound agent's own identity", async () => {
		const bundle = makeBundle("agent-alpha", [
			{
				id: "af-1",
				title: "agent-alpha-instructions",
				body: "Special instructions for alpha.",
				role: "agent_file",
				agentBindingId: "agent-alpha",
			},
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-5",
			taskId: "t-ba9b",
			agentId: "agent-alpha",
			agentRole: "builder",
			teamId: "team-ba9b",
			isRoutine: false,
			sourceKind: null,
			sourceId: null,
			sourceCorrelation: null,
			contextBundle: bundle,
		});

		const rulesDir = path.join(sandboxPath, "knowledge/rules");
		const files = fs.existsSync(rulesDir) ? fs.readdirSync(rulesDir) : [];
		expect(files).toHaveLength(0);
	});

	it("does NOT write agent_file for a different agent", async () => {
		const bundle = makeBundle("agent-beta", [
			{
				id: "af-1",
				title: "agent-alpha-instructions",
				body: "Special instructions for alpha.",
				role: "agent_file",
				agentBindingId: "agent-alpha",
			},
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-6",
			taskId: "t-ba9b",
			agentId: "agent-beta",
			agentRole: "builder",
			teamId: "team-ba9b",
			isRoutine: false,
			sourceKind: null,
			sourceId: null,
			sourceCorrelation: null,
			contextBundle: bundle,
		});

		const rulesDir = path.join(sandboxPath, "knowledge/rules");
		const files = fs.existsSync(rulesDir) ? fs.readdirSync(rulesDir) : [];
		// The agent_file is bound to agent-alpha, not agent-beta, so it must NOT appear
		expect(files).toHaveLength(0);
	});

	it("writes unbound agent_file (agentBindingId=null) to all sessions", async () => {
		const bundle = makeBundle("any-agent", [
			{
				id: "af-2",
				title: "universal-guide",
				body: "Applies to all agents.",
				role: "agent_file",
				agentBindingId: null,
			},
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-7",
			taskId: "t-ba9b",
			agentId: "any-agent",
			agentRole: "builder",
			teamId: "team-ba9b",
			isRoutine: false,
			sourceKind: null,
			sourceId: null,
			sourceCorrelation: null,
			contextBundle: bundle,
		});

		const rulesDir = path.join(sandboxPath, "knowledge/rules");
		const files = fs.existsSync(rulesDir) ? fs.readdirSync(rulesDir) : [];
		expect(files.length).toBeGreaterThan(0);
	});
});

describe("BA9b: ordinary items are unaffected", () => {
	it("ordinary item with L4 layer still goes to context/factory", async () => {
		const bundle = makeBundle("agent-1", [
			{
				id: "ord-1",
				title: "Factory Guideline",
				body: "A factory-wide rule.",
				role: "ordinary",
				layer: "L4",
			},
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-8",
			taskId: "t-ba9b",
			agentId: "agent-1",
			agentRole: "builder",
			teamId: "team-ba9b",
			isRoutine: false,
			sourceKind: null,
			sourceId: null,
			sourceCorrelation: null,
			contextBundle: bundle,
		});

		const factoryDir = path.join(sandboxPath, "context/factory");
		expect(fs.existsSync(factoryDir)).toBe(true);
		const files = fs.readdirSync(factoryDir);
		expect(files.length).toBeGreaterThan(0);
	});
});
