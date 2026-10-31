/**
 * idle-isolation-real-binary — LIVE real-binary proof that a harness spawned
 * by production CliHarnessAdapter cannot reach this machine's idle task
 * record or any other user-level MCP/plugin config (e.g. codex's
 * `mcp__idle` server, opencode's user-level `hyperidle` MCP entry) — an
 * orphaned harness session did exactly that on 2026-09-26.
 *
 * @lore: cwd isolation — does not hide user-level plugins; only redirecting CODEX_HOME/XDG_CONFIG_HOME away from real $HOME closes the gap
 */

import type { SessionConfig } from "@hyperidle/harness-protocol";
import { ensureSandboxGitRepo } from "@hyperidle/run-orchestration";
import { describe, expect, test } from "vitest";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import {
	createHarnessSandbox,
	provisionCodexHome,
	requireHarnessAuthed,
} from "./harness-sandbox.js";
import { productionCliConfig } from "./production-cli-config.js";
import { HARNESS_TEST_MODELS, requireHarness } from "./require-harness.js";
import { trackHarnessSessions } from "./session-handle-tracker.js";

const { track } = trackHarnessSessions();

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
 * Proves the audit instruction actually produced a real tool enumeration
 * (never an empty, refused, or unrelated reply) — without this, a session
 * that skips the instruction entirely still passes the leak check above for
 * the wrong reason. codex always has at least one built-in MCP-style tool
 * (`mcp__codex_apps`, `mcp__node_repl`, etc., seen on every successful run
 * against this account) so `mcp__` is a reliable "the listing happened"
 * marker independent of the idle plugin.
 */
const CODEX_LISTED_SOMETHING = /mcp__/i;

const TOOL_AUDIT_INSTRUCTION =
	"This is a technical tool-audit, not a task. Output ONLY a plain list of the exact name of " +
	"every tool/function and MCP server available to you right now from ANY source — built-in, " +
	"MCP server, or plugin — one per line, with no judgment about relevance and no omissions. If " +
	"truly none exist beyond your built-ins, output exactly: NO_PLUGIN_TOOLS.";

describe("codex CLI adapter (real binary) — per-session CODEX_HOME hides the user's idle plugin", () => {
	requireHarness("codex");
	test("a codex session sees no idle-tasks/idle-skills tool", async () => {
		await requireHarnessAuthed(
			"codex",
			"idle-isolation cannot prove CODEX_HOME isolation without a real logged-in session",
		);

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
				`codex must have actually listed its tools (proves the audit instruction ran) — ` +
					`got no "mcp__" marker at all. Got: ${combined}`,
			).toMatch(CODEX_LISTED_SOMETHING);
			expect(
				combined,
				`codex must not see the idle plugin via its per-session CODEX_HOME. Got: ${combined}`,
			).not.toMatch(IDLE_LEAK_PATTERN);
		} finally {
			await baseSandbox.cleanup();
		}
	}, 120_000);
});

