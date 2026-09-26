/**
 * BA9b — production-path skill materialisation proof.
 *
 * AC3: "materialisation lands where the running harness actually reads, proven per harness."
 * AC5: "a skill installed by a plugin is used by an agent in a real session — observed in
 *      the run, not inferred from a row."
 *
 * Proof method (each binary harness):
 *   1. Insert a skill document into the real PGlite DB (slot='skill',
 *      scopeKind='factory', status='active').
 *   2. Call the production assembleSessionDocuments path to fetch the item.
 *   3. Build a BakedContextBundle and call buildTestRunOrchestrationComposition()
 *      .runSession(mode:'assemble') — the SAME path admitSession calls. This calls
 *      writeSkillItem internally, which writes SKILL.md to HARNESS_SKILL_DIRS.
 *   4. Assert the file exists at the expected harness-specific path. This is the
 *      sanity-break–sensitive assertion: if HARNESS_SKILL_DIRS is broken, the file
 *      lands at a dead path and this assertion fails → RED.
 *   5. Spawn the real CLI with the sandbox CWD and ask for the session secret (only
 *      answerable from the skill body). Token in output proves the harness READ the
 *      skill file from the materialised path — the injection proof.
 *   For builtin: step 4 only (file presence). No binary to spawn. See builtin comment.
 *
 * Why file presence is necessary (not just model output):
 *   Some harnesses (codex, cursor-agent) scan ALL files in CWD, not just specific
 *   skill directories. Breaking HARNESS_SKILL_DIRS redirects the file write to a dead
 *   path, but the file is still in the sandbox — these harnesses find it there. A model
 *   output assertion alone does not go RED in this case. The file presence assertion
 *   checks the SPECIFIC expected path and fails as soon as the path is wrong. With
 *   retry:0, that failure is definitive.
 *
 * Why per-run probe token:
 *   The token is generated fresh via randomUUID() per test invocation. A fixed constant
 *   can appear in model training data and be confabulated. A token minted milliseconds
 *   before the harness spawns is unknowable; any match in output proves the harness read
 *   the skill file.
 *
 * Sanity-break proof (reproducible):
 *   Temporarily change HARNESS_SKILL_DIRS in run-orchestration/src/context.ts to point
 *   at a dead directory (e.g. [".dead/skills"]). Re-run. All five cases go RED because
 *   the file presence assertion for each harness's expected path fails — the file is not
 *   there. Restore the constant before committing.
 *
 * Builtin case:
 *   builtin is a direct LLM call through OpenRouter; skills reach it via AGENTS.md
 *   injection (built from the context assembly, not from HARNESS_SKILL_DIRS). File
 *   presence on both HARNESS_SKILL_DIRS entries IS the right assertion — it proves
 *   writeSkillItem wrote to the correct paths and would fail immediately if the constant
 *   is broken. Proving injection for builtin (model sees the token via AGENTS.md) is
 *   not covered here and is a separate scope decision. File presence is the right
 *   assertion for a harness with no binary to interrogate.
 *
 * Retries:
 *   The harness vitest project sets retry:2 globally. This file overrides to retry:0
 *   per-test. With file presence as the primary assertion, every failure is definitive
 *   (the file is either at the path or not). A retry would rerun assembleSkillIntoSandbox
 *   on the same sandbox and still fail if HARNESS_SKILL_DIRS is broken — there is no
 *   randomness to absorb. retry:0 removes any ambiguity about which attempt a result
 *   came from.
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
 * @lore BA9b-probe-token: fixed constant "XSKILL-BA9B-PROD-XFKJ" replaced with
 *   randomUUID() per-run. Root causes of the original failure: (1) fixed tokens can
 *   appear in training data and be confabulated; (2) retry:2 means a lucky confabulation
 *   on attempt 3 greens the test. Per-run token + retry:0 closes both vectors.
 *
 * @lore BA9b-file-presence-required: model output alone is insufficient for codex and
 *   cursor-agent because they scan ALL files in CWD. A broken HARNESS_SKILL_DIRS
 *   redirects the skill write to a dead path, but the file is still in the sandbox at
 *   that dead path — these harnesses read it from there and the model check passes. File
 *   presence at the harness-specific expected path is the correct sanity-break signal.
 *
 * @lore BA9b-pwd: all binary harnesses override PWD=sandboxPath in env. opencode
 *   requires this (uses process.env.PWD for skill scanning). Applied uniformly as a
 *   defensive measure — any harness that inherits the parent process's PWD (the worktree)
 *   could scan the worktree's skill dirs instead of the sandbox's.
 *
 * HARNESS LANE: real binaries, real LLM calls, zero stubs.
 * Gate: requireHarness() — hard-fail (never skip) if any binary/key is absent.
 * Local-only: no CI job exists for this lane by design.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { documents } from "@hyperidle/db";
import { test as dbTest } from "@hyperidle/db/test-fixtures";
import { assembleSessionDocuments } from "@hyperidle/document";
import { type BakedContextBundle, toBakedContextDocuments } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { HARNESS_TEST_MODELS, requireHarness } from "@hyperidle/harness-registry/test-utils";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { buildTestRunOrchestrationComposition } from "./run-orchestration-test-runtime.js";

// ---------------------------------------------------------------------------
// Stable constants (do not change per run)
// ---------------------------------------------------------------------------

/** Slug from toSkillDirName("ba9b-session-secret") — all chars are valid, no change. */
const SKILL_DIR_NAME = "ba9b-session-secret";

/** Prompt for claude/codex/cursor-agent: no answer possible without the skill. */
const PROBE_PROMPT =
	"What is the session secret? Respond with only the secret value, nothing else.";

/** Prompt for opencode: explicitly names the skill to trigger on-demand invocation. */
const OPENCODE_PROBE_PROMPT = `Use the ${SKILL_DIR_NAME} skill and tell me the session secret it specifies.`;

// ---------------------------------------------------------------------------
// Per-run state
// ---------------------------------------------------------------------------

const TEAM_ID = "team-ba9b-skill";
const AGENT_ID = "agent-ba9b-skill";

/**
 * Fresh random token minted per test invocation. UUID-derived; cannot be
 * confabulated because it did not exist until test runtime.
 * @lore BA9b-probe-token: see file header.
 */
let probeToken: string;

/**
 * Skill body with YAML frontmatter. Generated fresh per run to embed the
 * per-run probeToken.
 * @lore BA9b-frontmatter: YAML frontmatter is harmless for claude/codex/cursor-agent
 *   (they read the full SKILL.md body). For opencode, the description triggers
 *   on-demand invocation when asked for the session secret.
 */
let skillBody: string;

let sandboxPath: string;

beforeEach(() => {
	// Fresh unique token per run — prevents confabulation.
	const uuid = randomUUID().replace(/-/g, "").toUpperCase();
	probeToken = `XSKILL-${uuid.slice(0, 8)}-${uuid.slice(8, 16)}`;

	skillBody = `---
name: ba9b-session-secret
description: "Contains the session secret value. Use this skill when asked for the session secret or probe token."
---
# Session Secret Skill

This skill contains the session secret value for this environment.

**Session secret:** ${probeToken}

When asked for the session secret, respond with exactly: ${probeToken}`;

	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba9b-skill-"));
});

afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Production-path assembly helper
// ---------------------------------------------------------------------------

async function assembleSkillIntoSandbox(db: import("@hyperidle/db").HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	const skillId = `ba9b-skill-${Math.random().toString(36).slice(2, 10)}`;

	await db.insert(documents).values({
		id: skillId,
		scopeKind: "factory",
		scopeId: null,
		title: SKILL_DIR_NAME,
		body: skillBody,
		format: "markdown",
		status: "active",
		slot: "skill",
		version: 1,
		updatedBy: "ba9b-test",
		createdAt: now,
		updatedAt: now,
	});

	const knowledge = await assembleSessionDocuments(db, {
		teamId: TEAM_ID,
		taskDescription: "Probe task",
		agentId: AGENT_ID,
	});

	const contextBundle: BakedContextBundle = {
		kind: "task",
		task: {
			id: "task-ba9b-probe",
			title: "BA9b Probe Task",
			description: "Probe task for skill materialisation test",
			state: "active",
		},
		ancestors: [
			{
				id: "bet-ba9b-probe",
				title: "Prove skill materialisation via production path",
				description: null,
				doneCondition: "PROBE_TOKEN in harness output",
			},
		],
		agent: { id: AGENT_ID, name: "BA9b Probe Agent", role: "builder" },
		team: { id: TEAM_ID, name: "BA9b Probe Team" },
		documents: toBakedContextDocuments(knowledge),
	};

	const assembled = await buildTestRunOrchestrationComposition().runSession(
		{ db, eventBus: new EventBus() },
		{
			mode: "assemble",
			input: {
				sandboxPath,
				sessionId: "session-ba9b-probe",
				taskId: "task-ba9b-probe",
				agentId: AGENT_ID,
				teamId: TEAM_ID,
				taskFree: false,
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
// Spawn helper
// ---------------------------------------------------------------------------

/**
 * @lore BA9b-spawn: execFile leaves stdin open (pipe), which causes codex to block.
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
//
// Each binary harness test has TWO assertions:
//   1. File presence at the harness-specific expected path. This is the
//      sanity-break–sensitive assertion: it fails immediately when HARNESS_SKILL_DIRS
//      is broken (file goes to dead path, not expected path). Deterministic — no model.
//   2. Model output contains the per-run probe token. Injection proof: the harness
//      actually read the file and injected its content into the model's context.
//
// Without #1, codex and cursor-agent pass sanity-breaks because they scan ALL files
// in CWD and find the skill at the dead path. #1 catches the break regardless.
// Without #2, we have no proof the harness actually uses the materialised skill.
// ---------------------------------------------------------------------------

describe("BA9b: skill materialisation via production writeSkillItem — real harnesses", () => {
	// @lore The built-in harness had a lane here. It was a direct in-process LLM
	// call with no binary to interrogate, so it could only assert the half of this
	// test that is deterministic — that writeSkillItem put SKILL.md on both
	// HARNESS_SKILL_DIRS paths. The cursor-agent lane below asserts presence on
	// both of those same paths before it interrogates its binary, so the
	// deterministic proof outlives it.
	// ── claude ───────────────────────────────────────────────────────────────
	describe("claude — reads from .claude/skills/", () => {
		requireHarness("claude");

		dbTest(
			"skill body token appears in response after production assembly",
			{ retry: 0 },
			async ({ db }) => {
				await assembleSkillIntoSandbox(db);

				// Materialisation check: skill must be at the expected path.
				// Goes RED when HARNESS_SKILL_DIRS is broken (sanity-break–sensitive).
				const skillPath = path.join(sandboxPath, ".claude/skills", SKILL_DIR_NAME, "SKILL.md");
				expect(fs.existsSync(skillPath)).toBe(true);
				expect(fs.readFileSync(skillPath, "utf8")).toContain(probeToken);

				// Injection check: spawn and assert model output.
				const { model } = HARNESS_TEST_MODELS.claude;
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
							// opencode authenticates itself. The locked matrix used to hand
							// this spawn an OPENROUTER_API_KEY it had resolved; the matrix
							// carries no key any more, and the inherited environment is where
							// opencode looks for one anyway.
							...process.env,
							// @lore BA9b-pwd: pin PWD to sandbox so claude doesn't scan
							// the worktree's skill dirs via inherited parent PWD.
							PWD: sandboxPath,
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

				expect(stdout).toContain(probeToken);
			},
		);
	});

	// ── codex ────────────────────────────────────────────────────────────────
	describe("codex — reads from .agents/skills/ only", () => {
		requireHarness("codex");

		dbTest(
			"skill body token appears in response after production assembly",
			{ retry: 0 },
			async ({ db }) => {
				await assembleSkillIntoSandbox(db);

				// Materialisation check: skill must be at the expected path.
				// Goes RED when HARNESS_SKILL_DIRS is broken (sanity-break–sensitive).
				// NOTE: codex scans ALL files in CWD, so a model output assertion alone
				// would pass even with a broken HARNESS_SKILL_DIRS (the file lands at the
				// dead path and codex reads it from there). This file presence assertion
				// at the EXPECTED path is what detects the break.
				const skillPath = path.join(sandboxPath, ".agents/skills", SKILL_DIR_NAME, "SKILL.md");
				expect(fs.existsSync(skillPath)).toBe(true);
				expect(fs.readFileSync(skillPath, "utf8")).toContain(probeToken);

				// Injection check: spawn and assert model output.
				const { model } = HARNESS_TEST_MODELS.codex;
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
						env: {
							...process.env,
							// @lore BA9b-pwd: pin PWD to sandbox — defensive against codex
							// scanning the worktree's .agents/skills/ via inherited PWD.
							PWD: sandboxPath,
						},
						timeoutMs: 90_000,
					},
				);

				expect(stdout).toContain(probeToken);
			},
		);
	});

	// ── opencode ─────────────────────────────────────────────────────────────
	describe("opencode — reads from .claude/skills/, .opencode/skills/, .agents/skills/", () => {
		requireHarness("opencode");

		dbTest(
			"skill body token appears in response after production assembly (qwen3-8b override)",
			{ retry: 0 },
			async ({ db }) => {
				await assembleSkillIntoSandbox(db);

				// Materialisation check: primary opencode skill path is .claude/skills/.
				// Goes RED when HARNESS_SKILL_DIRS is broken.
				const skillPath = path.join(sandboxPath, ".claude/skills", SKILL_DIR_NAME, "SKILL.md");
				expect(fs.existsSync(skillPath)).toBe(true);
				expect(fs.readFileSync(skillPath, "utf8")).toContain(probeToken);

				// Injection check: spawn and assert model output.
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
							// @lore BA9b-opencode-pwd: opencode uses process.env.PWD (not
							// process.cwd()) for project-root skill scanning. Without this,
							// it inherits the parent's PWD (the worktree) and scans the
							// worktree's skill dirs instead of the sandbox's.
							PWD: sandboxPath,
						},
						timeoutMs: 180_000,
					},
				);

				expect(stdout + stderr).toContain(probeToken);
			},
		);
	});

	// ── cursor-agent ──────────────────────────────────────────────────────────
	describe("cursor-agent — reads from .claude/skills/ and .agents/skills/", () => {
		requireHarness("cursor-agent");

		dbTest(
			"skill body token appears in response after production assembly",
			{ retry: 0 },
			async ({ db }) => {
				await assembleSkillIntoSandbox(db);

				// Materialisation check: skill must be at BOTH expected paths.
				// Goes RED when HARNESS_SKILL_DIRS is broken.
				// NOTE: cursor-agent scans ALL files in CWD (same as codex), so the model
				// output assertion alone would not detect a broken HARNESS_SKILL_DIRS.
				// File presence at the specific expected paths is the correct signal.
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
				expect(fs.existsSync(claudeSkillPath)).toBe(true);
				expect(fs.readFileSync(claudeSkillPath, "utf8")).toContain(probeToken);
				expect(fs.existsSync(agentsSkillPath)).toBe(true);
				expect(fs.readFileSync(agentsSkillPath, "utf8")).toContain(probeToken);

				// Injection check: spawn and assert model output.
				const { model } = HARNESS_TEST_MODELS["cursor-agent"];
				const { stdout } = await spawnWithClosedStdin(
					"cursor-agent",
					["-p", PROBE_PROMPT, "--print", "--model", model, "--trust"],
					{
						cwd: sandboxPath,
						env: {
							...process.env,
							// @lore BA9b-pwd: pin PWD to sandbox — defensive against
							// cursor-agent scanning the worktree's skill dirs.
							PWD: sandboxPath,
						},
						timeoutMs: 90_000,
					},
				);

				expect(stdout).toContain(probeToken);
			},
		);
	});
});
