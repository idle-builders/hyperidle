/**
 * idle-isolation-real-binary — LIVE real-binary proof that a harness spawned
 * by production CliHarnessAdapter cannot reach this machine's idle task
 * record or any other user-level MCP/plugin config (e.g. codex's
 * `mcp__idle` server, opencode's user-level `hyperidle` MCP entry) — an
 * orphaned harness session did exactly that on 2026-09-26.
 *
 * @lore root cause: cwd isolation alone (a temp sandbox outside any git
 * repo, already the case for every real-binary test) does NOT close this —
 * a CLI's global, HOME/config-scoped plugins load regardless of cwd.
 * Verified live: a cursor-agent spawned with a fresh temp cwd still reported
 * a `plugin-idle-tasks-idle` tool namespace via its own GetDynamicTools
 * call; a codex session with no per-session CODEX_HOME redirect listed
 * `mcp__idle__decision` and friends; an opencode session with no per-session
 * XDG_CONFIG_HOME redirect reads this machine's real
 * `~/.config/opencode/opencode.jsonc`, which has a live `hyperidle` MCP
 * entry with a bearer token — only redirecting the harness's *config*
 * directory away from the real $HOME/config closes it.
 *
 * codex and opencode close this for free from EXISTING production wiring:
 * CliHarnessAdapter injects a per-session CODEX_HOME (when the sandbox has a
 * `.codex-home/`) and, for opencode, an UNCONDITIONAL per-session
 * XDG_CONFIG_HOME — so neither ever reads the real $HOME/.codex or
 * $HOME/.config/opencode config. This file proves that isolation holds
 * against both installed binaries, and that removing either redirect makes
 * it observably fail (see each case's own sanity-break note below its
 * assertion).
 *
 * claude and cursor-agent have no equivalent per-session config-dir seam in
 * production and forward the real $HOME for their keychain-based auth, so a
 * session on either still sees its plugin surface. Fixing that means moving
 * the idle plugin from user level to repo level (tracked separately,
 * founder decision, D-v5z4br); this file proves isolation only for the two
 * mechanisms this repo already owns and controls today — codex's
 * CODEX_HOME redirect and opencode's XDG_CONFIG_HOME redirect — and
 * hard-fails (never skips) when it cannot prove that, including when the
 * binary itself is unauthenticated: an untested "isolation" claim is not a
 * passing test.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SessionConfig } from "@hyperidle/harness-protocol";
import { ensureSandboxGitRepo } from "@hyperidle/run-orchestration";
import { describe, expect, test } from "vitest";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import { createHarnessSandbox, provisionCodexHome } from "./harness-sandbox.js";
import { productionCliConfig } from "./production-cli-config.js";
import { HARNESS_TEST_MODELS, requireHarness } from "./require-harness.js";
import { trackHarnessSessions } from "./session-handle-tracker.js";

const { track } = trackHarnessSessions();
const execFileAsync = promisify(execFile);

/**
 * Matches the idle plugin's own tool/namespace vocabulary across harness
 * dialects: cursor-agent exposes it as a `plugin-idle-tasks-idle` namespace;
 * codex exposes it as an `mcp__idle` server with tools prefixed
 * `mcp__idle__` (e.g. `mcp__idle__decision`). Sanity-broken 2026-09-26: with
 * CliHarnessAdapter's CODEX_HOME injection locally disabled (`--skip-git-
 * repo-check` swapped in so the real, unredirected `~/.codex` still runs
 * against the ephemeral sandbox), codex listed `mcp__idle` and
 * `mcp__idle__decision`/`list`/`show`/`task`, and this pattern caught it —
 * the assertion failed on all 3 retries. Change reverted; assertion passes
 * again against the real production CODEX_HOME injection.
 */
const IDLE_LEAK_PATTERN = /idle-tasks|idle-skills|plugin-idle|mcp__idle/i;

/**
 * Matches this machine's real user-level opencode MCP server name
 * (`~/.config/opencode/opencode.jsonc` → `mcp.hyperidle`, a bearer token
 * pointed at a dead local URL). Sanity-broken 2026-09-26: with
 * CliHarnessAdapter's unconditional XDG_CONFIG_HOME injection for opencode
 * locally disabled, `opencode mcp list` (run via the MCP_LIST_INSTRUCTION
 * probe below) reported the real `hyperidle` entry (marked "failed" — it
 * cannot connect, but it IS configured) instead of "No MCP servers
 * configured", and this pattern caught it on the first attempt. Change
 * reverted; assertion passes again against the real production
 * XDG_CONFIG_HOME injection.
 */
const OPENCODE_LEAK_PATTERN = /\bhyperidle\b/i;

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
		const { stdout } = await execFileAsync("opencode", ["providers", "list"], { timeout: 10_000 });
		return /\d+\s+credentials/.test(stdout) || stdout.includes("environment variable");
	} catch {
		return false;
	}
}

const TOOL_AUDIT_INSTRUCTION =
	"This is a technical tool-audit, not a task. Output ONLY a plain list of the exact name of " +
	"every tool/function and MCP server available to you right now from ANY source — built-in, " +
	"MCP server, or plugin — one per line, with no judgment about relevance and no omissions. If " +
	"truly none exist beyond your built-ins, output exactly: NO_PLUGIN_TOOLS.";

/**
 * opencode-specific probe: asking the model to self-report its MCP servers
 * (like TOOL_AUDIT_INSTRUCTION) is unreliable here because the real
 * user-level `hyperidle` entry points at a dead local URL — an unreachable
 * MCP server is silently dropped from the model's own tool list whether or
 * not it is isolated, so that framing can't distinguish the two states. `opencode
 * mcp list` (run via opencode's own bash tool) reports every CONFIGURED
 * entry regardless of whether it connects, so it is the deterministic,
 * connectivity-independent signal: real config → the `hyperidle` entry
 * (marked failed); isolated config → "No MCP servers configured".
 */
const MCP_LIST_INSTRUCTION =
	"Run the shell command: opencode mcp list  (using your bash tool), and output its exact raw " +
	"result verbatim, with no commentary, no summary, no formatting changes.";

describe("codex CLI adapter (real binary) — per-session CODEX_HOME hides the user's idle plugin", () => {
	requireHarness("codex");
	test("a codex session sees no idle-tasks/idle-skills tool", async () => {
		const authed = await codexAuthed();
		if (!authed) {
			throw new Error(
				"codex is not authenticated (`codex login status` did not report Logged in) — " +
					"idle-isolation cannot prove CODEX_HOME isolation without it. Run `codex login`. " +
					"(never skip to green.)",
			);
		}

		const baseSandbox = createHarnessSandbox("idle-isolation-codex-base");
		const sandboxAdapter = new LocalSandboxAdapter();
		const sandboxHandle = await sandboxAdapter.spawn(baseSandbox.path);
		const sandboxPath = sandboxHandle.path;

		try {
			ensureSandboxGitRepo(sandboxPath);
			const authFound = provisionCodexHome(sandboxPath);
			if (!authFound) {
				throw new Error(
					"codex has no ~/.codex/auth.json to copy into the per-session sandbox — idle-" +
						"isolation cannot prove CODEX_HOME isolation without real credentials. Run " +
						"`codex login`. (never skip to green.)",
				);
			}

			const config: SessionConfig = {
				sessionId: `idle-isolation-codex-${Math.random().toString(36).slice(2, 10)}`,
				sandboxPath,
				assembledPrompt: TOOL_AUDIT_INSTRUCTION,
				instruction: TOOL_AUDIT_INSTRUCTION,
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

describe("opencode CLI adapter (real binary) — per-session XDG_CONFIG_HOME hides the user's opencode MCP config", () => {
	requireHarness("opencode");
	test("an opencode session sees no user-level hyperidle MCP server", async () => {
		const authed = await opencodeAuthed();
		if (!authed) {
			throw new Error(
				"opencode is not authenticated (`opencode providers list` found no configured " +
					"provider) — idle-isolation cannot prove XDG_CONFIG_HOME isolation without it. " +
					"Run `opencode auth login`. (never skip to green.)",
			);
		}

		const sandbox = createHarnessSandbox("idle-isolation-opencode");
		const sandboxPath = sandbox.path;

		try {
			const config: SessionConfig = {
				sessionId: `idle-isolation-opencode-${Math.random().toString(36).slice(2, 10)}`,
				sandboxPath,
				assembledPrompt: MCP_LIST_INSTRUCTION,
				instruction: MCP_LIST_INSTRUCTION,
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
				`opencode must not see the user-level hyperidle MCP server via its per-session ` +
					`XDG_CONFIG_HOME. Got: ${combined}`,
			).not.toMatch(OPENCODE_LEAK_PATTERN);
		} finally {
			await sandbox.cleanup();
		}
	}, 120_000);
});
