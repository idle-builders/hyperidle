/**
 * BA9c — AC6: routine event context reaches the agent's running prompt.
 *
 * AC6: "The prompt an agent actually runs contains this context in a form it can
 *      act on — proven by an agent correctly naming the specific thing it woke
 *      up for."
 *
 * Proof method (each harness):
 *   1. Build a RoutineSessionContextData with a triggerEvent carrying a unique
 *      per-run task title (UUID-derived; cannot be confabulated).
 *   2. Call createContextAssembler().assembleRoutinePrompt() — the same function
 *      the provisioner calls in phase 8.5 — to get the assembled prompt text.
 *   3. Call writeSandboxAgentsMd(sandboxPath, assembledPrompt) — the same call
 *      the provisioner makes — to write AGENTS.md + CLAUDE.md.
 *   4. For builtin: assert AGENTS.md/CLAUDE.md contain the probe title. File
 *      presence is the sanity-break-sensitive assertion — if buildRoutineTaskSection
 *      doesn't render triggerEvent, the title is absent → RED.
 *   5. For binary harnesses: spawn the real CLI, ask "What was the title of the
 *      task that triggered this routine run?" Assert output contains probe title.
 *
 * Sanity-break proof (reproducible):
 *   Remove the triggerEvent rendering block from buildRoutineTaskSection in
 *   run-orchestration/src/context.ts. Re-run. All five lanes go RED: the file
 *   presence assertion fails (title absent from AGENTS.md), and binary harnesses
 *   produce no title. Restore before committing.
 *
 * Placement: layers/core-api/src/__tests__/ alongside other harness tests.
 *
 * HARNESS LANE: real binaries, real LLM calls, zero stubs.
 * Gate: requireHarness() — hard-fail (never skip) if binary/key absent.
 * Local-only: no CI job for this lane by design.
 *
 * @lore BA9c-probe-title: per-run UUID token prevents confabulation. Same
 *   principle as BA9b-probe-token. retry:0 — file presence assertions are
 *   deterministic; binary harness failures are conclusive at the first attempt.
 *
 * @lore BA9c-assembly-path: uses createContextAssembler directly (not
 *   runSession(mode:"assemble")). The assemble mode writes context/ and
 *   .fabric/ files but NOT AGENTS.md/CLAUDE.md — those are written by
 *   writeSandboxAgentsMd in the provisioner's phase 8.5. This test calls
 *   assembleRoutinePrompt + writeSandboxAgentsMd directly, matching
 *   what the provisioner does, with no DB required.
 *
 * @lore BA9c-opencode-model: follows BA9b-opencode-model precedent —
 *   openrouter/qwen/qwen3-8b, coordinator-authorized, for the opencode lane.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { harnessTestResolvedModel, requireHarness } from "@hyperidle/harness-registry/test-utils";
import {
	createContextAssembler,
	type RoutineSessionContextData,
} from "@hyperidle/run-orchestration";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

// ── Constants ────────────────────────────────────────────────────────────────

const ROUTINE_ID = "routine-ba9c-harness";
const AGENT_ID = "agent-ba9c-harness";
const TEAM_ID = "team-ba9c-harness";

/** Prompt for binary harnesses: unanswerable without the triggerEvent in AGENTS.md. */
const PROBE_PROMPT =
	"What was the title of the task that triggered this routine run? Reply with only the title, nothing else.";

/** Opencode variant: explicitly names the context to locate. */
const OPENCODE_PROBE_PROMPT =
	"Look at the routine section of your context. What was the title of the task that triggered this routine run? Reply with only the title.";

// ── Per-run state ─────────────────────────────────────────────────────────────

/**
 * Per-run unique task title. UUID-derived: cannot be confabulated because
 * it did not exist until test runtime.
 * @lore BA9c-probe-title
 */
let probeTitle: string;
let sandboxPath: string;

beforeEach(() => {
	const uuid = randomUUID().replace(/-/g, "").toUpperCase();
	probeTitle = `XROUTINE-${uuid.slice(0, 8)}-${uuid.slice(8, 16)}`;
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba9c-harness-"));
});

afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
});

// ── Assembly helper ───────────────────────────────────────────────────────────

/**
 * Call the same two functions the provisioner calls in phase 8.5:
 *   assembleRoutinePrompt → get the assembled prompt text
 *   writeSandboxAgentsMd → write AGENTS.md + CLAUDE.md
 *
 * Uses an inert filesystem adapter (no actual filesystem watcher needed).
 * No DB required: the context data is built in-memory from the probe values.
 *
 * @lore BA9c-assembly-path
 */
async function assembleRoutineContextIntoSandbox(): Promise<void> {
	const assembler = createContextAssembler({
		filesystems: { startWatcher: () => ({ stop: () => {} }) },
	});

	const context: RoutineSessionContextData = {
		routine: {
			id: ROUTINE_ID,
			name: "BA9c event-triggered routine",
			prompt: "Report the task title that triggered this routine run.",
			lastRunSummary: null,
		},
		agent: { id: AGENT_ID, name: "BA9c Probe Agent", role: "builder" },
		team: { id: TEAM_ID, name: "BA9c Probe Team" },
		triggerEvent: {
			type: "task_state_changed",
			timestamp: Date.now(),
			transition: { from: "in_progress", to: "done" },
			subject: {
				kind: "task",
				task: {
					id: "task-ba9c-harness-probe",
					title: probeTitle,
					description: "A task that triggered the BA9c probe routine",
					state: "done",
				},
				bet: {
					id: "bet-ba9c-harness-probe",
					description: "Prove event context reaches the agent prompt",
					appetite: "",
					doneCondition: null,
				},
			},
		},
	};

	const { assembledPrompt } = await assembler.assembleRoutinePrompt({
		systemPromptText: "",
		context,
		tools: [],
		sandboxPath,
	});

	assembler.writeSandboxAgentsMd(sandboxPath, assembledPrompt);
}

// ── Spawn helper ──────────────────────────────────────────────────────────────

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

// ── Harness lanes ─────────────────────────────────────────────────────────────
//
// Each lane has two assertions:
//   1. File presence: AGENTS.md (and/or CLAUDE.md) contains the probe title.
//      Sanity-break-sensitive: if buildRoutineTaskSection doesn't render
//      triggerEvent, the title is absent → RED. Deterministic, no model.
//   2. For binary harnesses: model output contains the probe title. Proves the
//      harness READ the prompt and can act on the event context.
//
// Without #1: a bug in the rendering path could pass if the model guesses.
// Without #2: file presence proves rendering but not that the harness uses it.
// ─────────────────────────────────────────────────────────────────────────────

describe("BA9c AC6: routine event context reaches the agent's running prompt — real harnesses", () => {
	// ── builtin ───────────────────────────────────────────────────────────────
	//
	// builtin is a direct LLM call through OpenRouter; context reaches it via
	// AGENTS.md injection (system-prompt assembly). File presence on AGENTS.md
	// and CLAUDE.md is the right assertion — goes RED when buildRoutineTaskSection
	// omits the triggerEvent block. No binary to spawn.
	describe("builtin — triggerEvent rendering proof (file-presence; no binary to interrogate)", () => {
		requireHarness("builtin");

		test("AGENTS.md and CLAUDE.md contain the probe task title after routine assembly", {
			retry: 0,
		}, async () => {
			const agentsMdPath = path.join(sandboxPath, "AGENTS.md");
			const claudeMdPath = path.join(sandboxPath, "CLAUDE.md");
			expect(fs.existsSync(agentsMdPath)).toBe(false);
			expect(fs.existsSync(claudeMdPath)).toBe(false);

			await assembleRoutineContextIntoSandbox();

			expect(fs.existsSync(agentsMdPath)).toBe(true);
			expect(fs.existsSync(claudeMdPath)).toBe(true);
			expect(fs.readFileSync(agentsMdPath, "utf8")).toContain(probeTitle);
			expect(fs.readFileSync(claudeMdPath, "utf8")).toContain(probeTitle);
		});
	});

	// ── claude ────────────────────────────────────────────────────────────────
	describe("claude — reads AGENTS.md + CLAUDE.md, names the trigger task", () => {
		requireHarness("claude");

		test("agent output contains probe task title after routine event context assembly", {
			retry: 0,
		}, async () => {
			await assembleRoutineContextIntoSandbox();

			// File presence: sanity-break-sensitive assertion.
			const claudeMdPath = path.join(sandboxPath, "CLAUDE.md");
			expect(fs.existsSync(claudeMdPath)).toBe(true);
			expect(fs.readFileSync(claudeMdPath, "utf8")).toContain(probeTitle);

			// Injection check: spawn and assert model output contains probe title.
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
						// @lore BA9b-pwd: pin PWD to sandbox.
						PWD: sandboxPath,
						// @lore real-claude-full-binary: zero these so claude doesn't
						// detect it is running inside claude-code.
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

			expect(stdout).toContain(probeTitle);
		});
	});

	// ── codex ─────────────────────────────────────────────────────────────────
	describe("codex — reads AGENTS.md + all files in CWD, names the trigger task", () => {
		requireHarness("codex");

		test("agent output contains probe task title after routine event context assembly", {
			retry: 0,
		}, async () => {
			await assembleRoutineContextIntoSandbox();

			// File presence: sanity-break-sensitive assertion.
			// NOTE: codex scans ALL files in CWD, so model output alone would pass
			// even with broken rendering (it finds the file at whatever path it landed).
			// This checks the specific AGENTS.md path.
			const agentsMdPath = path.join(sandboxPath, "AGENTS.md");
			expect(fs.existsSync(agentsMdPath)).toBe(true);
			expect(fs.readFileSync(agentsMdPath, "utf8")).toContain(probeTitle);

			// Injection check: spawn and assert model output.
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
					env: {
						...process.env,
						// @lore BA9b-pwd: pin PWD to sandbox.
						PWD: sandboxPath,
					},
					timeoutMs: 90_000,
				},
			);

			expect(stdout).toContain(probeTitle);
		});
	});

	// ── opencode ──────────────────────────────────────────────────────────────
	describe("opencode — reads AGENTS.md + CLAUDE.md, names the trigger task", () => {
		requireHarness("opencode");

		test("agent output contains probe task title after routine event context assembly (qwen3-8b)", {
			retry: 0,
		}, async () => {
			await assembleRoutineContextIntoSandbox();

			// File presence: sanity-break-sensitive assertion.
			const agentsMdPath = path.join(sandboxPath, "AGENTS.md");
			expect(fs.existsSync(agentsMdPath)).toBe(true);
			expect(fs.readFileSync(agentsMdPath, "utf8")).toContain(probeTitle);

			// Injection check: spawn and assert model output.
			const { apiKey } = harnessTestResolvedModel("opencode");
			// @lore BA9c-opencode-model: follows BA9b-opencode-model precedent.
			// qwen3-8b handles explicit context lookup requests reliably.
			const opencodeModel = "openrouter/qwen/qwen3-8b";

			const { stdout, stderr } = await spawnWithClosedStdin(
				"opencode",
				["run", OPENCODE_PROBE_PROMPT, "--pure", "--model", opencodeModel],
				{
					cwd: sandboxPath,
					env: {
						...process.env,
						OPENROUTER_API_KEY: apiKey,
						// @lore BA9b-opencode-pwd: opencode uses process.env.PWD for
						// project-root skill scanning.
						PWD: sandboxPath,
					},
					timeoutMs: 180_000,
				},
			);

			expect(stdout + stderr).toContain(probeTitle);
		});
	});

	// ── cursor-agent ──────────────────────────────────────────────────────────
	describe("cursor-agent — reads AGENTS.md + CLAUDE.md + all CWD files, names the trigger task", () => {
		requireHarness("cursor-agent");

		test("agent output contains probe task title after routine event context assembly", {
			retry: 0,
		}, async () => {
			await assembleRoutineContextIntoSandbox();

			// File presence: sanity-break-sensitive assertion.
			// NOTE: cursor-agent scans ALL files in CWD. Same reasoning as codex.
			const claudeMdPath = path.join(sandboxPath, "CLAUDE.md");
			expect(fs.existsSync(claudeMdPath)).toBe(true);
			expect(fs.readFileSync(claudeMdPath, "utf8")).toContain(probeTitle);
			const agentsMdPath = path.join(sandboxPath, "AGENTS.md");
			expect(fs.existsSync(agentsMdPath)).toBe(true);
			expect(fs.readFileSync(agentsMdPath, "utf8")).toContain(probeTitle);

			// Injection check: spawn and assert model output.
			const { model } = harnessTestResolvedModel("cursor-agent");
			const { stdout } = await spawnWithClosedStdin(
				"cursor-agent",
				["-p", PROBE_PROMPT, "--print", "--model", model, "--trust"],
				{
					cwd: sandboxPath,
					env: {
						...process.env,
						// @lore BA9b-pwd: pin PWD to sandbox.
						PWD: sandboxPath,
					},
					timeoutMs: 90_000,
				},
			);

			expect(stdout).toContain(probeTitle);
		});
	});
});
