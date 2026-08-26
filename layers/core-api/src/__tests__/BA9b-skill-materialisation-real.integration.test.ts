/**
 * BA9b — production-path skill materialisation proof.
 *
 * AC3: "materialisation lands where the running harness actually reads, proven per harness."
 * AC5: "a skill installed by a plugin is used by an agent in a real session — observed in
 *      the run, not inferred from a row."
 *
 * Proof method:
 *   1. Insert a skill knowledge item into the real PGlite DB (role='skill',
 *      scopeKind='factory', status='active').
 *   2. Call the production assembleSessionKnowledge path to fetch the item.
 *   3. Build a BakedContextBundle and call buildTestRunOrchestrationComposition()
 *      .runSession(mode:'assemble') — this is the SAME path admitSession calls.
 *      writeSkillItem is invoked internally, writing SKILL.md to HARNESS_SKILL_DIRS.
 *   4. For each binary harness: spawn the real CLI with the sandbox CWD, ask for the
 *      session secret (only answerable from the skill body). PROBE_TOKEN in output proves
 *      the harness read the skill file from the materialised path.
 *   5. For builtin: assert SKILL.md exists on disk in both HARNESS_SKILL_DIRS entries —
 *      builtin reads skills via system-prompt injection (AGENTS.md), not file-based
 *      discovery; the file-presence proof is what is available without a full session.
 *
 * Sanity-break proof that this test is NOT a passenger:
 *   Temporarily change HARNESS_SKILL_DIRS in run-orchestration/src/context.ts to point
 *   at a dead directory (e.g. [".dead/skills"]) and re-run this file. The builtin lane's
 *   fs.existsSync assertion and the binary lanes' output assertions both go RED. Restore
 *   the constant to ["[.claude/skills", ".agents/skills"] before committing.
 *
 * @lore BA9b: placed in layers/core-api/src/__tests__/ (matches HARNESS_INCLUDE glob
 *   `*-real.integration.test.ts`) so it can import from run-orchestration-test-runtime.ts
 *   in the same directory. The old passenger test in harness-registry/__tests__/ could not
 *   import run-orchestration (governance boundary) and therefore could not call writeSkillItem
 *   via the production path.
 *
 * @lore BA9b-opencode-model: the coordinator authorized using openrouter/qwen/qwen3-8b
 *   for the opencode lane (test-specific override). The locked baseline model
 *   (glm-4.7-flash) cannot drive skill selection — it neither auto-injects skill content
 *   nor responds reliably to explicit "use skill X" prompts, verified 2026-08-26.
 *   qwen3-8b handles YAML-frontmatter skills and explicit skill invocation requests.
 *
 * HARNESS LANE: real binaries, real LLM calls, zero stubs.
 * Gate: requireHarness() — hard-fail (never skip) if any binary/key is absent.
 * Local-only: no CI job exists for this lane by design.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { knowledgeAppProjection, knowledgeItems } from "@hyperidle/db";
import { test as dbTest } from "@hyperidle/db/test-fixtures";
import { type BakedContextBundle, toBakedContextKnowledgeItems } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { harnessTestResolvedModel, requireHarness } from "@hyperidle/harness-registry/test-utils";
import { assembleSessionKnowledge } from "@hyperidle/knowledge";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { buildTestRunOrchestrationComposition } from "./run-orchestration-test-runtime.js";

// ---------------------------------------------------------------------------
// Probe constants
// ---------------------------------------------------------------------------

/**
 * The secret hidden inside the skill body. A model cannot produce it from
 * general knowledge — it is noise. The ONLY way it appears in output is if the
 * harness read the skill file and injected its content into the model's context.
 *
 * @lore BA9b-probe-design: "mandatory format rule" skills are unreliable on tiny
 *   models. Hiding the answer IN the skill (secret-retrieval pattern) is the only
 *   reliable approach: a model cannot hallucinate XSKILL-BA9B-PROD-XFKJ, so its
 *   presence in output proves skill injection.
 */
const PROBE_TOKEN = "XSKILL-BA9B-PROD-XFKJ";

/**
 * Skill body with YAML frontmatter. The frontmatter `description` field is what
 * opencode's model sees when deciding whether to invoke the skill. The body
 * (after the frontmatter) is what all harnesses inject into context when the skill
 * is active.
 *
 * @lore BA9b-frontmatter: YAML frontmatter is harmless for claude/codex/cursor-agent
 *   (they read the full SKILL.md body including frontmatter). For opencode, the
 *   description tells the model to invoke this skill when asked for the session secret,
 *   which then exposes the body (and the PROBE_TOKEN).
 */
const SKILL_BODY = `---
name: ba9b-session-secret
description: "Contains the session secret value. Use this skill when asked for the session secret or probe token."
---
# Session Secret Skill

This skill contains the session secret value for this environment.

**Session secret:** ${PROBE_TOKEN}

When asked for the session secret, respond with exactly: ${PROBE_TOKEN}`;

/** Slug from toSkillDirName("ba9b-session-secret") — all chars are valid, no change. */
const SKILL_DIR_NAME = "ba9b-session-secret";

/** Prompt for claude/codex/cursor-agent: no answer is possible without the skill. */
const PROBE_PROMPT =
	"What is the session secret? Respond with only the secret value, nothing else.";

/** Prompt for opencode: explicitly names the skill to trigger on-demand invocation. */
const OPENCODE_PROBE_PROMPT = `Use the ${SKILL_DIR_NAME} skill and tell me the session secret it specifies.`;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEAM_ID = "team-ba9b-skill";
const AGENT_ID = "agent-ba9b-skill";

let sandboxPath: string;

beforeEach(() => {
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba9b-skill-"));
});

afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Production-path assembly helper
//
// Shared by all harness lanes: inserts the skill into the DB, calls the full
// production assembly chain (assembleSessionKnowledge → toBakedContextKnowledgeItems
// → runSession(mode:'assemble')), and returns the sandboxPath where SKILL.md was
// written by writeSkillItem. Both .claude/skills/ and .agents/skills/ entries exist
// after this call — writeSkillItem writes to all HARNESS_SKILL_DIRS.
// ---------------------------------------------------------------------------

async function assembleSkillIntoSandbox(db: import("@hyperidle/db").HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	const skillId = `ba9b-skill-${Math.random().toString(36).slice(2, 10)}`;

	// 1. Insert factory-scoped skill — mirrors the production writer which always
	//    inserts knowledgeItems + knowledgeAppProjection together (governance rule).
	//    Skills are routed by role (not layer) so projection.layer is null.
	await db.insert(knowledgeItems).values({
		id: skillId,
		scopeKind: "factory",
		scopeId: null,
		topic: null,
		title: SKILL_DIR_NAME,
		body: SKILL_BODY,
		format: "markdown",
		status: "active",
		role: "skill",
		version: 1,
		updatedBy: "ba9b-test",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(knowledgeAppProjection).values({
		id: `${skillId}-proj`,
		knowledgeItemId: skillId,
		layer: null,
		scopeId: null,
		kind: null,
		attentionScore: null,
		confidence: null,
		meta: null,
	});

	// 2. Fetch via production assembleSessionKnowledge (agentId required since B1 fix).
	const knowledge = await assembleSessionKnowledge(db, {
		teamId: TEAM_ID,
		agentRole: "builder",
		taskDescription: "Probe task",
		agentId: AGENT_ID,
	});

	// 3. Convert to baked items and build minimal BakedContextBundle (kind:'task').
	const contextBundle: BakedContextBundle = {
		kind: "task",
		task: {
			id: "task-ba9b-probe",
			title: "BA9b Probe Task",
			description: "Probe task for skill materialisation test",
			state: "active",
		},
		bet: {
			id: "bet-ba9b-probe",
			description: "Prove skill materialisation via production path",
			appetite: "small",
			doneCondition: "PROBE_TOKEN in harness output",
		},
		agent: { id: AGENT_ID, name: "BA9b Probe Agent", role: "builder" },
		team: { id: TEAM_ID, name: "BA9b Probe Team" },
		knowledge: toBakedContextKnowledgeItems(knowledge),
	};

	// 4. Production assembly path — calls createContextAssembler(ports).assembleAgentContext
	//    which calls writeBundleKnowledge → writeSkillItem → writes SKILL.md to HARNESS_SKILL_DIRS.
	const assembled = await buildTestRunOrchestrationComposition().runSession(
		{ db, eventBus: new EventBus() },
		{
			mode: "assemble",
			input: {
				sandboxPath,
				sessionId: "session-ba9b-probe",
				taskId: "task-ba9b-probe",
				agentId: AGENT_ID,
				agentRole: "builder",
				teamId: TEAM_ID,
				isRoutine: false,
				sourceKind: null,
				sourceId: null,
				sourceCorrelation: null,
				contextBundle,
			},
		},
	);

	if (assembled.mode !== "assembled") {
		throw new Error(`Expected assembled mode, got: ${assembled.mode}`);
	}
}

// ---------------------------------------------------------------------------
// Spawn helper (closes stdin — codex blocks if stdin is left open)
// ---------------------------------------------------------------------------

/**
 * @lore BA9b-spawn: same pattern as the old passenger test's spawnWithClosedStdin.
 *   execFile leaves stdin open (pipe), which causes codex to block reading from it.
 *   spawn with stdio: ['ignore', 'pipe', 'pipe'] closes stdin at process start.
 */
async function spawnWithClosedStdin(
	bin: string,
	args: string[],
	opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, {
			cwd: opts.cwd,
			env: opts.env,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		const guard = setTimeout(() => {
			child.kill("SIGTERM");
			reject(
				new Error(
					`Command timed out after ${opts.timeoutMs}ms: ${bin} ${args.join(" ")}\n` +
						`stdout so far: ${stdout.slice(0, 200)}\nstderr so far: ${stderr.slice(0, 200)}`,
				),
			);
		}, opts.timeoutMs);

		child.on("exit", (code) => {
			clearTimeout(guard);
			if (code !== 0) {
				reject(
					new Error(
						`Command failed (exit ${code}): ${bin} ${args.join(" ")}\n` +
							`stdout: ${stdout.slice(0, 400)}\nstderr: ${stderr.slice(0, 200)}`,
					),
				);
			} else {
				resolve({ stdout, stderr });
			}
		});

		child.on("error", (err) => {
			clearTimeout(guard);
			reject(err);
		});
	});
}

// ---------------------------------------------------------------------------
// Harness lanes
// ---------------------------------------------------------------------------

describe("BA9b: skill materialisation via production writeSkillItem — real harnesses", () => {
	// ── builtin ──────────────────────────────────────────────────────────────
	describe("builtin — file-presence proof (no binary; skill reaches model via AGENTS.md)", () => {
		requireHarness("builtin");

		dbTest(
			"writeSkillItem writes SKILL.md to both HARNESS_SKILL_DIRS after production assembly",
			async ({ db }) => {
				// Pre-condition: skill files do NOT exist before assembly.
				const claudeSkillPath = path.join(
					sandboxPath,
					".claude/skills",
					SKILL_DIR_NAME,
					"SKILL.md",
				);
				const agentsSkillPath = path.join(
					sandboxPath,
					".agents/skills",
					SKILL_DIR_NAME,
					"SKILL.md",
				);
				expect(fs.existsSync(claudeSkillPath)).toBe(false);
				expect(fs.existsSync(agentsSkillPath)).toBe(false);

				// Production assembly path → writeSkillItem → HARNESS_SKILL_DIRS.
				await assembleSkillIntoSandbox(db);

				// Post-condition: both paths exist with the correct body content.
				expect(fs.existsSync(claudeSkillPath)).toBe(true);
				expect(fs.existsSync(agentsSkillPath)).toBe(true);
				expect(fs.readFileSync(claudeSkillPath, "utf8")).toContain(PROBE_TOKEN);
				expect(fs.readFileSync(agentsSkillPath, "utf8")).toContain(PROBE_TOKEN);
			},
		);
	});

	// ── claude ───────────────────────────────────────────────────────────────
	describe("claude — reads from .claude/skills/", () => {
		requireHarness("claude");

		dbTest("skill body token appears in response after production assembly", async ({ db }) => {
			await assembleSkillIntoSandbox(db);

			const { model } = harnessTestResolvedModel("claude");
			const { stdout } = await spawnWithClosedStdin(
				"claude",
				[
					"-p",
					PROBE_PROMPT,
					"--dangerously-skip-permissions",
					"--output-format",
					"text",
					"--model",
					model,
				],
				{
					cwd: sandboxPath,
					env: {
						...process.env,
						// @lore real-claude-full-binary: zero these so claude does not
						// detect it is running inside claude-code (would skip the run).
						CLAUDECODE: "",
						CLAUDE_CODE_ENTRYPOINT: "",
						CLAUDE_CODE_EXECPATH: "",
						CLAUDE_CODE_SESSION_ID: "",
						AI_AGENT: "",
						CLAUDE_EFFORT: "",
					},
					timeoutMs: 60_000,
				},
			);

			expect(stdout).toContain(PROBE_TOKEN);
		});
	});

	// ── codex ────────────────────────────────────────────────────────────────
	describe("codex — reads from .agents/skills/ only", () => {
		requireHarness("codex");

		dbTest("skill body token appears in response after production assembly", async ({ db }) => {
			await assembleSkillIntoSandbox(db);

			const { model } = harnessTestResolvedModel("codex");
			const { stdout } = await spawnWithClosedStdin(
				"codex",
				[
					"exec",
					"--skip-git-repo-check",
					PROBE_PROMPT,
					"--model",
					model,
					"--json",
					"--dangerously-bypass-approvals-and-sandbox",
				],
				{
					cwd: sandboxPath,
					env: { ...process.env },
					timeoutMs: 90_000,
				},
			);

			expect(stdout).toContain(PROBE_TOKEN);
		});
	});

	// ── opencode ─────────────────────────────────────────────────────────────
	describe("opencode — reads from .claude/skills/, .opencode/skills/, .agents/skills/", () => {
		requireHarness("opencode");

		dbTest(
			"skill body token appears in response after production assembly (qwen3-8b override)",
			async ({ db }) => {
				await assembleSkillIntoSandbox(db);

				const { apiKey } = harnessTestResolvedModel("opencode");
				// @lore BA9b-opencode-model: coordinator-authorized override; glm-4.7-flash
				// (the locked baseline) cannot drive skill selection. qwen3-8b understands
				// YAML frontmatter and explicit skill invocation requests.
				const opencodeModel = "openrouter/qwen/qwen3-8b";

				const { stdout, stderr } = await spawnWithClosedStdin(
					"opencode",
					["run", OPENCODE_PROBE_PROMPT, "--pure", "--model", opencodeModel],
					{
						cwd: sandboxPath,
						env: {
							...process.env,
							OPENROUTER_API_KEY: apiKey,
							// @lore BA9b-opencode-pwd: opencode uses process.env.PWD (not
							// process.cwd()) for project-root skill scanning. Without this,
							// it inherits the parent's PWD (the worktree) and scans the
							// worktree's skill dirs instead of the sandbox's.
							PWD: sandboxPath,
						},
						timeoutMs: 180_000,
					},
				);

				expect(stdout + stderr).toContain(PROBE_TOKEN);
			},
		);
	});

	// ── cursor-agent ──────────────────────────────────────────────────────────
	describe("cursor-agent — reads from .claude/skills/ and .agents/skills/", () => {
		requireHarness("cursor-agent");

		dbTest("skill body token appears in response after production assembly", async ({ db }) => {
			await assembleSkillIntoSandbox(db);

			const { model } = harnessTestResolvedModel("cursor-agent");
			const { stdout } = await spawnWithClosedStdin(
				"cursor-agent",
				["-p", PROBE_PROMPT, "--print", "--model", model, "--trust"],
				{
					cwd: sandboxPath,
					env: { ...process.env },
					timeoutMs: 90_000,
				},
			);

			expect(stdout).toContain(PROBE_TOKEN);
		});
	});
});
