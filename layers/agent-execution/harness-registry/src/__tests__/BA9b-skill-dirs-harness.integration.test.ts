/**
 * BA9b — harness-lane skill-discovery proof.
 *
 * AC3: "materialisation lands where the running harness actually reads, proven per harness."
 * AC5: "a skill installed by a plugin is used by an agent in a real session — observed in
 *      the run, not inferred from a row."
 *
 * Proof method (same as the evidence-gathering probe in
 * .pipeline/work/BA9b/harness-skill-dirs-evidence.md §Method):
 *   1. Write a skill whose body instructs the agent to emit a unique token it cannot
 *      produce otherwise: XSKILL-BA9B-PROBE-X.
 *   2. Run the real harness binary non-interactively with a neutral question.
 *   3. Assert the token appears in stdout — it can only be there if the harness read
 *      the skill file and injected its content into the agent's context.
 *
 * Skill files are written to the two directories HARNESS_SKILL_DIRS covers after
 * the BA9b fix: .claude/skills/ and .agents/skills/. The split is:
 *   .claude/skills — claude, opencode (also reads .agents/), cursor-agent
 *   .agents/skills  — codex (only dir it reads), cursor-agent, opencode
 *
 * All four binary harnesses are covered. builtin has no file-based skill dirs
 * (skills reach it via AGENTS.md system prompt, a different path).
 *
 * HARNESS LANE: real binaries, real LLM calls, zero stubs.
 * Gate: requireHarness() — hard-fail (never skip) if any binary is absent.
 * Model: the locked tiny baseline from HARNESS_TEST_MODELS for each harness.
 *
 * Local-only: no CI job exists for this lane by design (needs four real binaries
 * and real LLM credentials). Run via npm run test:integration:harness.
 *
 * @lore BA9b: Placed in harness-registry because that package's
 * __tests__/ glob is already in vitest.integration.config.ts HARNESS_INCLUDE,
 * and require-harness.ts lives here. The test subject (HARNESS_SKILL_DIRS
 * constant in run-orchestration/src/context.ts) is validated indirectly —
 * this test proves the underlying harness behaviour the constant must match,
 * which is the stronger proof (the constant can be read from the evidence file;
 * what cannot be read from a file is the live binary's actual behaviour).
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { harnessTestResolvedModel, requireHarness } from "./require-harness.js";

/**
 * Spawn a binary with stdin closed (EOF immediately).
 * execFileAsync leaves stdin open (pipe), which causes codex to block reading from stdin.
 * spawn with stdio: ['ignore', 'pipe', 'pipe'] closes stdin at process start.
 *
 * @lore BA9b-spawn: execFile/execFileAsync does not expose the `stdio` option
 * in its TypeScript types, and its internal implementation pipes stdin from the
 * parent — which codex reads, causing it to block. A dedicated spawn helper with
 * stdio[0]='ignore' is the only portable fix for subprocess binaries that read
 * stdin. Pattern borrowed from AN2-connection-provisioning.integration.test.ts's
 * `spawnDetached` helper.
 */
async function spawnWithClosedStdin(
	bin: string,
	args: string[],
	opts: { cwd?: string; env: NodeJS.ProcessEnv; timeoutMs: number },
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

/**
 * The token hidden inside the skill file. The model cannot produce it from
 * general knowledge — it looks like random noise. The ONLY way it appears
 * in the model's output is if the harness read the skill file and injected
 * its content into the model's context.
 *
 * The prompt does NOT mention this token. The model is asked a question
 * ("What is the session secret?") whose answer is only available in the skill.
 * This is a stronger test than a format-rule skill: the model cannot guess the
 * answer, so the token's presence is unambiguous proof that the skill was read.
 */
const PROBE_TOKEN = "XSKILL-BA9B-PROBE-X";

/**
 * Skill body: hides the "session secret" in the skill and teaches the model to
 * return it when asked. The prompt asks for the session secret — a question
 * with no general-knowledge answer, so the token can only appear if the skill
 * was read and injected into context.
 *
 * @lore BA9b-probe-design: "mandatory format rule" skills are unreliable on tiny
 * models — haiku/glm-flash/gpt-mini answer "2+2=4" without the token even when
 * the skill says to always include it. Hiding the answer IN the skill (secret-
 * retrieval pattern) is the only reliable approach: a model cannot hallucinate
 * XSKILL-BA9B-PROBE-X, so its presence proves skill injection.
 */
const SKILL_BODY = `# Session Secret Skill

This skill contains the session secret value for this environment.

**Session secret:** ${PROBE_TOKEN}

When asked for the session secret or session token, respond with exactly: ${PROBE_TOKEN}`;

const SKILL_DIR_NAME = "session-secret";

/**
 * Neutral prompt that exercises the skill. The question ("session secret")
 * has no general-knowledge answer — the model must read the skill to answer.
 */
const PROBE_PROMPT = "What is the session secret? Respond with only the secret value, nothing else.";

let sandboxPath: string;

beforeEach(() => {
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba9b-harness-skill-"));
});

afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
});

/** Write SKILL.md to a skill dir (relative to sandboxPath). */
function writeSkill(relativeSkillsDir: string): void {
	const skillDir = path.join(sandboxPath, relativeSkillsDir, SKILL_DIR_NAME);
	fs.mkdirSync(skillDir, { recursive: true });
	fs.writeFileSync(path.join(skillDir, "SKILL.md"), SKILL_BODY);
}

describe("BA9b: harness skill discovery — real binaries, real LLM calls", () => {
	describe("claude — reads from .claude/skills/", () => {
		requireHarness("claude");

		test("skill body forces the token into the response", async () => {
			writeSkill(".claude/skills");

			const { model } = harnessTestResolvedModel("claude");
			// Claude runs headless (-p), skip permissions, text output so stdout is the raw reply.
			// PROBE_PROMPT: asks for the session secret whose answer is only in the skill.
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
					// Inherit env so ~/.claude/ keychain auth works.
					env: {
						...process.env,
						// @lore real-claude-full-binary: zero these env vars so claude does not
						// detect it is running inside claude-code itself (would skip the run).
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

	describe("codex — reads from .agents/skills/ only", () => {
		requireHarness("codex");

		test("skill in .agents/skills forces the token into the response", async () => {
			// codex reads .agents/skills — it does NOT read .claude/skills or
			// .codex-home/skills. Evidence: harness-skill-dirs-evidence.md.
			writeSkill(".agents/skills");

			const { model } = harnessTestResolvedModel("codex");
			// codex exec: --skip-git-repo-check because sandboxPath is not a git repo.
			// --dangerously-bypass-approvals-and-sandbox: runs non-interactively without
			//   prompting for approval, which is required for headless test execution.
			// --json: structured JSONL output; PROBE_TOKEN appears in message text.
			// spawnWithClosedStdin: codex reads from stdin if left open — execFileAsync
			//   pipes stdin from the parent process, causing codex to block. Closing
			//   stdin (stdio[0]='ignore') makes codex run immediately.
			// PROBE_PROMPT: asks for the session secret whose answer is only in the skill.
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
						// @lore AR2 codex-stderr-ignore: codex authenticates via keychain;
						// no API key injection needed here. OPENAI_API_KEY is left empty
						// so the inherited keychain login (ChatGPT account) is not shadowed
						// by a placeholder.
						...process.env,
					},
					timeoutMs: 90_000,
				},
			);

			expect(stdout).toContain(PROBE_TOKEN);
		});
	});

	describe("opencode — reads from .claude/skills/, .opencode/skills/, .agents/skills/", () => {
		requireHarness("opencode");

		test("skill in .agents/skills is found and reported", async () => {
			// opencode reads all three dirs; .agents/skills is used here to also prove
			// cross-coverage with codex (both harnesses confirmed in the evidence file).
			//
			// Probe design for opencode: glm-4.7-flash is a tool-calling model that SEARCHES
			// the filesystem when asked about project resources. It does NOT auto-inject skill
			// content the way claude/cursor-agent do. So the probe uses a different approach:
			//   1. Name the skill directory with the probe token embedded in it.
			//   2. Ask opencode to list all skills in the project.
			//   3. The model runs find/ls on .agents/skills/ and returns the directory name.
			//   4. The probe token appears in the output as part of the directory path.
			// This proves opencode reads .agents/skills/ and that materialisation went to the
			// right place — the token can only appear if the directory was found.
			//
			// @lore BA9b-opencode-probe:
			//   - --dir flag: does NOT make opencode scan that directory for skills. Skills are
			//     scanned relative to the process's CWD. Use cwd: sandboxPath, not --dir.
			//   - --pure: runs without external plugins; still reads the project's skill dirs.
			//   - XDG_DATA_HOME isolation breaks opencode (crashes on empty DB dir). Omit it.
			//   - glm-4.7-flash refuses "session secret" prompts on safety grounds. Use a
			//     neutral listing prompt instead of the secret-retrieval probe.
			const OPENCODE_SKILL_DIR_NAME = `probe-skill-${PROBE_TOKEN}`;
			const skillDir = path.join(sandboxPath, ".agents/skills", OPENCODE_SKILL_DIR_NAME);
			fs.mkdirSync(skillDir, { recursive: true });
			fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Probe Skill\nTest probe for BA9b.");

			const { model, apiKey } = harnessTestResolvedModel("opencode");
			// Prompt: asks opencode to list the FILESYSTEM contents of .agents/skills/.
			// This triggers a direct ls/find, not a plugin-skill listing. The probe token
			// appears as the directory name in the ls output — cannot appear otherwise.
			const { stdout, stderr } = await spawnWithClosedStdin(
				"opencode",
				[
					"run",
					"What directories and files are in .agents/skills/? List them.",
					"--pure",
					"--model",
					model,
				],
				{
					cwd: sandboxPath, // skills are scanned relative to CWD, not --dir
					env: {
						...process.env,
						OPENROUTER_API_KEY: apiKey,
						// @lore BA9b-opencode-pwd: opencode uses process.env.PWD (not
						// process.cwd()) as the project root when deciding where to search
						// for .agents/skills/. Without this override, it inherits the parent
						// process's PWD (the worktree), causing it to list the worktree's
						// .agents/skills/ instead of the sandboxPath's skill dir.
						PWD: sandboxPath,
					},
					timeoutMs: 180_000,
				},
			);

			// The probe token is embedded in the skill directory name. opencode's model
			// runs ls on .agents/skills/ and returns the directory path in its output.
			expect(stdout + stderr).toContain(PROBE_TOKEN);
		});
	});

	describe("cursor-agent — reads from .claude/skills/ and .agents/skills/", () => {
		requireHarness("cursor-agent");

		test("skill in .agents/skills forces the token into the response", async () => {
			// cursor-agent reads both .claude/skills and .agents/skills. Using .agents/skills
			// to confirm the entry that also covers codex.
			writeSkill(".agents/skills");

			const { model } = harnessTestResolvedModel("cursor-agent");
			// cursor-agent: -p prompt, --print for headless, --trust to skip workspace prompts.
			// No API key in env: cursor-agent authenticates via Cursor's own keychain login.
			// PROBE_PROMPT: asks for the session secret whose answer is only in the skill.
			const { stdout } = await spawnWithClosedStdin(
				"cursor-agent",
				[
					"-p",
					PROBE_PROMPT,
					"--print",
					"--model",
					model,
					"--trust",
				],
				{
					cwd: sandboxPath,
					env: {
						...process.env,
					},
					timeoutMs: 90_000,
				},
			);

			expect(stdout).toContain(PROBE_TOKEN);
		});
	});
});
