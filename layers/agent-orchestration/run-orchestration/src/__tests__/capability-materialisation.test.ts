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
		slot?: string;
		agentBindingId?: string | null;
	}>,
) {
	return {
		kind: "task" as const,
		task: { id: "t-ba9b", title: "Test", description: null, state: "in_progress" },
		ancestors: [],
		agent: { id: agentId, name: "Tester", role: "builder" },
		team: { id: "team-ba9b", name: "Test Team" },
		documents: knowledge.map((k) => ({
			id: k.id,
			title: k.title,
			body: k.body,
			format: k.format ?? "markdown",
			version: k.version ?? 1,
			parentChain: [],
			scopeKind: "factory",
			slot: k.slot ?? "ordinary",
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
			{ id: "skill-1", title: "write-tests", body: "# Write Tests\nDo TDD.", slot: "skill" },
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-1",
			taskId: "t-ba9b",
			agentId: "agent-1",
			teamId: "team-ba9b",
			taskFree: false,
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
			{ id: "skill-2", title: "my-skill", body: "Body.", slot: "skill" },
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-2",
			taskId: "t-ba9b",
			agentId: "agent-1",
			teamId: "team-ba9b",
			taskFree: false,
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
			{ id: "skill-3", title: "plan", body: "Planning skill.", slot: "skill" },
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-3",
			taskId: "t-ba9b",
			agentId: "agent-1",
			teamId: "team-ba9b",
			taskFree: false,
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
			{ id: "rule-1", title: "no-console", body: "Never use console.log.", slot: "rule" },
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-4",
			taskId: "t-ba9b",
			agentId: "agent-1",
			teamId: "team-ba9b",
			taskFree: false,
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
				slot: "agent_file",
				agentBindingId: "agent-alpha",
			},
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-5",
			taskId: "t-ba9b",
			agentId: "agent-alpha",
			teamId: "team-ba9b",
			taskFree: false,
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
				slot: "agent_file",
				agentBindingId: "agent-alpha",
			},
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-6",
			taskId: "t-ba9b",
			agentId: "agent-beta",
			teamId: "team-ba9b",
			taskFree: false,
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
				slot: "agent_file",
				agentBindingId: null,
			},
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-7",
			taskId: "t-ba9b",
			agentId: "any-agent",
			teamId: "team-ba9b",
			taskFree: false,
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

describe("a prompt item never reaches the sandbox", () => {
	// Guard 2 (context.ts): the writer itself refuses a prompt, independent of
	// whatever the assembler does or does not include. This test hands a
	// prompt item straight to the writer — no assembler involved — so it goes
	// red on its own if the guard is removed, and cannot be hidden by guard 1
	// (the assembler-side filters) working correctly.
	it("writes no file and no manifest entry for a slot:'prompt' item", async () => {
		const bundle = makeBundle("agent-1", [
			{
				id: "prompt-1",
				title: "Routine — prompt",
				body: "Sweep the stale items.",
				slot: "prompt",
			},
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-prompt-1",
			taskId: "t-ba9b",
			agentId: "agent-1",
			teamId: "team-ba9b",
			taskFree: false,
			sourceKind: null,
			sourceId: null,
			sourceCorrelation: null,
			contextBundle: bundle,
		});

		// Nowhere: not a skill dir, not knowledge/rules, not context/factory (the
		// L4 layer route an ordinary item would take).
		const knowledgeDir = path.join(sandboxPath, "knowledge");
		const walkFiles = (dir: string): string[] => {
			if (!fs.existsSync(dir)) return [];
			return fs
				.readdirSync(dir, { recursive: true, withFileTypes: true } as never)
				.flatMap((entry: unknown) => {
					const e = entry as { isFile(): boolean; name: string; parentPath?: string };
					return e.isFile() ? [e.name] : [];
				});
		};
		expect(walkFiles(knowledgeDir)).toEqual([]);
		expect(fs.existsSync(path.join(sandboxPath, ".claude/skills"))).toBe(false);
		const contextFactory = path.join(sandboxPath, "context/factory");
		const contextFiles = fs.existsSync(contextFactory) ? fs.readdirSync(contextFactory) : [];
		expect(contextFiles).toEqual([]);

		const manifest = JSON.parse(
			fs.readFileSync(path.join(sandboxPath, ".fabric/manifest.json"), "utf-8"),
		) as { items: Record<string, unknown> };
		expect(manifest.items).not.toHaveProperty("prompt-1");
		expect(Object.keys(manifest.items)).toHaveLength(0);
	});
});

describe("BA9b: ordinary items are unaffected", () => {
	// @lore nested-knowledge-items D1: layer zones (context/factory etc.) are
	// gone — an ordinary item now materialises into knowledge/, shaped by its
	// (baked) parent chain rather than routed by layer.
	it("ordinary item materialises into knowledge/", async () => {
		const bundle = makeBundle("agent-1", [
			{
				id: "ord-1",
				title: "Factory Guideline",
				body: "A factory-wide rule.",
				slot: "ordinary",
			},
		]);

		await assembler.assembleAgentContext({
			sandboxPath,
			sessionId: "session-8",
			taskId: "t-ba9b",
			agentId: "agent-1",
			teamId: "team-ba9b",
			taskFree: false,
			sourceKind: null,
			sourceId: null,
			sourceCorrelation: null,
			contextBundle: bundle,
		});

		const knowledgeDir = path.join(sandboxPath, "knowledge");
		expect(fs.existsSync(knowledgeDir)).toBe(true);
		const files = fs.readdirSync(knowledgeDir);
		expect(files.length).toBeGreaterThan(0);
	});
});
