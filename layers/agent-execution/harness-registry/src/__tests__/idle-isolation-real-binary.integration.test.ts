/**
 * idle-isolation-real-binary — LIVE real-binary proof that a harness spawned
 * by production CliHarnessAdapter cannot reach this machine's idle task
 * record (its own personal MCP/plugin tools, e.g. `decision`/`list`/`show`/
 * `task`), the way one did on 2026-09-26 (see T-f46a6x).
 *
 * @lore T-f46a6x root cause: cwd isolation alone (a temp sandbox outside any
 * git repo, already the case for every real-binary test) does NOT close this
 * — cursor-agent, claude and codex all load personal plugins from $HOME
 * regardless of cwd. Verified live: a cursor-agent spawned with a fresh temp
 * cwd and CURSOR_AGENT_CLI_CONFIG's real envAllowlist (which forwards HOME
 * for keychain auth) still reports a `plugin-idle-tasks-idle` tool namespace
 * with `decision`/`list`/`show`/`task` tools via its own GetDynamicTools call
 * — only redirecting the harness's *config* directory away from the real
 * $HOME closes it.
 *
 * codex and opencode close it for free from EXISTING production wiring:
 * CliHarnessAdapter injects a per-session CODEX_HOME (when the sandbox has a
 * `.codex-home/`) and a per-session XDG_CONFIG_HOME for opencode, so neither
 * ever reads the real $HOME/.codex or $HOME/.config/opencode plugin dirs.
 * This file proves that isolation holds against the installed binaries.
 *
 * claude and cursor-agent have NO equivalent per-session config-dir seam in
 * production today — CliHarnessAdapter forwards the real $HOME for both,
 * needed for their keychain-based auth (claude: `CLAUDE_CLI_CONFIG`
 * macOS-keychain lore; cursor-agent: cli-config.json + keychain). Verified
 * live that `CLAUDE_CONFIG_DIR` redirection alone hides claude's plugins
 * (`"plugins":[]` in its own system/init line) but also breaks its login
 * state (`apiKeySource:"none"`) — the auth state claude needs lives partly
 * outside `~/.claude/` (`~/.claude.json`), not only in the keychain. Closing
 * this for claude/cursor-agent needs a production adapter change (find and
 * inject the config-dir redirection each CLI supports, while keeping the
 * exact files/keychain access their login needs) — a security-relevant call
 * on what a real HyperIdle session forwards to a spawned CLI, left for the
 * founder's decision per T-f46a6x's own acceptance criterion. This file does
 * NOT assert isolation for claude/cursor-agent; it only proves + guards what
 * production already fixes today.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { SessionConfig } from "@hyperidle/harness-protocol";
import { ensureSandboxGitRepo } from "@hyperidle/run-orchestration";
import { describe, expect, test } from "vitest";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import { createHarnessSandbox } from "./harness-sandbox.js";
import { productionCliConfig } from "./production-cli-config.js";
import { HARNESS_TEST_MODELS, requireHarness } from "./require-harness.js";
import { trackHarnessSessions } from "./session-handle-tracker.js";

const { track } = trackHarnessSessions();
const execFileAsync = promisify(execFile);

/** No literal name from the idle plugin's own tool/namespace vocabulary. */
const IDLE_LEAK_PATTERN = /idle-tasks|idle-skills|plugin-idle/i;

async function codexAuthed(): Promise<boolean> {
	try {
		const { stdout, stderr } = await execFileAsync("codex", ["login", "status"], {
			timeout: 10_000,
		});
		return (stdout + stderr).trim().startsWith("Logged in");
	} catch {
		return false;
	}
}

async function opencodeAuthed(): Promise<boolean> {
	try {
		const key = process.env.OPENROUTER_API_KEY;
		if (!key) return false;
		const { stdout } = await execFileAsync("opencode", ["providers", "list"], { timeout: 10_000 });
		return /\d+\s+credentials/.test(stdout) || stdout.includes("environment variable");
	} catch {
		return false;
	}
}

/** Copies ONLY auth.json + config.toml into a per-session .codex-home/ (no plugins/). */
function provisionCodexHome(sandboxPath: string): boolean {
	const codexHomeDir = path.join(sandboxPath, ".codex-home");
	fs.mkdirSync(codexHomeDir, { recursive: true });
	const homeCodexDir = path.join(os.homedir(), ".codex");
	let authFound = false;
	for (const fname of ["auth.json", "config.toml"]) {
		const src = path.join(homeCodexDir, fname);
		if (fs.existsSync(src)) {
			fs.copyFileSync(src, path.join(codexHomeDir, fname));
			if (fname === "auth.json") authFound = true;
		}
	}
	fs.appendFileSync(
		path.join(codexHomeDir, "config.toml"),
		`\n[projects."${sandboxPath}"]\ntrust_level = "trusted"\n`,
		"utf-8",
	);
	return authFound;
}

const IDLE_PROBE_INSTRUCTION =
	"List every MCP server and tool name you currently have access to, beyond your own " +
	"built-in file/shell tools. Do not guess — report only tools actually available in this " +
	"session. If you have none besides your built-ins, reply exactly: NO_PLUGIN_TOOLS.";

describe("codex CLI adapter (real binary) — per-session CODEX_HOME hides the user's idle plugin", () => {
	requireHarness("codex");
	test("a codex session sees no idle-tasks/idle-skills tool", async ({ skip }) => {
		const authed = await codexAuthed();
		if (!authed) {
			skip();
			return;
		}

		const baseSandbox = createHarnessSandbox("idle-isolation-codex-base");
		const sandboxAdapter = new LocalSandboxAdapter();
		const sandboxHandle = await sandboxAdapter.spawn(baseSandbox.path);
		const sandboxPath = sandboxHandle.path;

		try {
			ensureSandboxGitRepo(sandboxPath);
			const authFound = provisionCodexHome(sandboxPath);
			if (!authFound) {
				skip();
				return;
			}

			const config: SessionConfig = {
				sessionId: `idle-isolation-codex-${Math.random().toString(36).slice(2, 10)}`,
				sandboxPath,
				assembledPrompt: IDLE_PROBE_INSTRUCTION,
				instruction: IDLE_PROBE_INSTRUCTION,
				modelTier: "workhorse" as const,
				tools: [],
				selectedModel: HARNESS_TEST_MODELS.codex.model,
				mcpConnectionInfo: undefined,
			};

			const adapter = new CliHarnessAdapter(productionCliConfig("codex"));
			const handle = await adapter.startSession(config);
			track(adapter, handle);

			const texts: string[] = [];
			for await (const ev of adapter.streamEvents(handle)) {
				if (ev.type === "completion" && typeof (ev as { text?: string }).text === "string") {
					texts.push((ev as { text: string }).text);
				}
			}
			await adapter.stopSession(handle);

			const combined = texts.join("\n");
			expect(
				combined,
				`codex must not see the idle plugin via its per-session CODEX_HOME. Got: ${combined}`,
			).not.toMatch(IDLE_LEAK_PATTERN);
		} finally {
			await baseSandbox.cleanup();
		}
	}, 120_000);
});

describe("opencode CLI adapter (real binary) — per-session XDG_CONFIG_HOME hides the user's idle plugin", () => {
	requireHarness("opencode");
	test("an opencode session sees no idle-tasks/idle-skills tool", async ({ skip }) => {
		const apiKey = process.env.OPENROUTER_API_KEY ?? "";
		if (!apiKey) {
			skip();
			return;
		}
		const authed = await opencodeAuthed();
		if (!authed) {
			skip();
			return;
		}

		const sandbox = createHarnessSandbox("idle-isolation-opencode");
		const sandboxPath = sandbox.path;

		try {
			const config: SessionConfig = {
				sessionId: `idle-isolation-opencode-${Math.random().toString(36).slice(2, 10)}`,
				sandboxPath,
				assembledPrompt: IDLE_PROBE_INSTRUCTION,
				instruction: IDLE_PROBE_INSTRUCTION,
				modelTier: "workhorse" as const,
				tools: [],
				selectedModel: HARNESS_TEST_MODELS.opencode.model,
				mcpConnectionInfo: undefined,
			};

			const adapter = new CliHarnessAdapter(productionCliConfig("opencode"));
			const handle = await adapter.startSession(config);
			track(adapter, handle);

			const texts: string[] = [];
			for await (const ev of adapter.streamEvents(handle)) {
				if (ev.type === "completion" && typeof (ev as { text?: string }).text === "string") {
					texts.push((ev as { text: string }).text);
				}
			}
			await adapter.stopSession(handle);

			const combined = texts.join("\n");
			expect(
				combined,
				`opencode must not see the idle plugin via its per-session XDG_CONFIG_HOME. Got: ${combined}`,
			).not.toMatch(IDLE_LEAK_PATTERN);
		} finally {
			await sandbox.cleanup();
		}
	}, 120_000);
});
