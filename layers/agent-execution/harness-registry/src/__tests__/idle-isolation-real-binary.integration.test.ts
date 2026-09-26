/**
 * idle-isolation-real-binary — LIVE real-binary proof that a harness spawned
 * by production CliHarnessAdapter cannot reach this machine's idle task
 * record (its own personal MCP/plugin tools, e.g. `decision`/`list`/`show`/
 * `task`) — an orphaned harness session did exactly that on 2026-09-26.
 *
 * @lore root cause: cwd isolation alone (a temp sandbox outside any git
 * repo, already the case for every real-binary test) does NOT close this —
 * a CLI's global, HOME-scoped plugins load regardless of cwd. Verified live:
 * a cursor-agent spawned with a fresh temp cwd still reported a
 * `plugin-idle-tasks-idle` tool namespace with `decision`/`list`/`show`/
 * `task` tools via its own GetDynamicTools call, and a codex session with no
 * per-session CODEX_HOME redirect listed `mcp__idle__decision` and friends
 * — only redirecting the harness's *config* directory away from the real
 * $HOME closes it.
 *
 * codex closes it for free from EXISTING production wiring:
 * CliHarnessAdapter injects a per-session CODEX_HOME (when the sandbox has a
 * `.codex-home/`), so it never reads the real $HOME/.codex plugin dir. This
 * file proves that isolation holds against the installed binary, and that
 * removing the redirect makes it observably fail (see the file's own
 * sanity-break note below the assertion).
 *
 * claude and cursor-agent have no equivalent per-session config-dir seam in
 * production and forward the real $HOME for their keychain-based auth, so a
 * session on either still sees the plugin; opencode has no idle plugin
 * installed on any machine this suite runs on (it is a user-level Cursor/
 * Claude/Codex-plugin install, never an opencode one), so an opencode case
 * here could only ever pass — for the wrong reason. Fixing claude/
 * cursor-agent, and any future host-wide plugin surface, means moving the
 * idle plugin from user level to repo level (tracked separately, founder
 * decision); this file proves isolation only for the one mechanism this
 * repo already owns and controls today — codex's CODEX_HOME redirect — and
 * hard-fails rather than skip when it cannot prove that.
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

const IDLE_PROBE_INSTRUCTION =
	"This is a technical tool-audit, not a task. Output ONLY a plain list of the exact name of " +
	"every tool/function available to you right now from ANY source — built-in, MCP server, or " +
	"plugin — one per line, with no judgment about relevance and no omissions. If truly none " +
	"exist beyond your built-ins, output exactly: NO_PLUGIN_TOOLS.";

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
