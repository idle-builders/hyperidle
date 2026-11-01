/**
 * idle-isolation-real-binary — LIVE real-binary proof that a harness spawned
 * by the production adapter cannot reach this machine's idle task record or
 * any other user-level MCP/plugin config — an orphaned harness session did
 * exactly that on 2026-09-26.
 *
 * @lore: cwd isolation — does not hide user-level plugins; only redirecting CODEX_HOME/XDG_CONFIG_HOME away from real $HOME closes the gap
 */

import type { HarnessAdapter, SessionConfig } from "@hyperidle/harness-protocol";
import { ensureSandboxGitRepo } from "@hyperidle/run-orchestration";
import { describe, expect, test } from "vitest";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import {
	createHarnessSandbox,
	provisionCodexHome,
	requireHarnessAuthed,
} from "./harness-sandbox.js";
import { productionHarnessAdapter } from "./production-cli-config.js";
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
 * the wrong reason. CodexAppServerAdapter (app-server --stdio) exposes native
 * tools WITHOUT the mcp__ prefix: `codex_apps`, `node_repl`, `apply_patch`,
 * etc. — these are always present so one of them is a reliable marker.
 */
const CODEX_LISTED_SOMETHING = /codex_apps|node_repl|apply_patch/i;

const TOOL_AUDIT_INSTRUCTION =
	"This is a technical tool-audit, not a task. Output ONLY a plain list of the exact name of " +
	"every tool/function and MCP server available to you right now from ANY source — built-in, " +
	"MCP server, or plugin — one per line, with no judgment about relevance and no omissions. If " +
	"truly none exist beyond your built-ins, output exactly: NO_PLUGIN_TOOLS.";

async function drainCompletionTexts(
	adapter: HarnessAdapter,
	handle: Awaited<ReturnType<HarnessAdapter["startSession"]>>,
): Promise<string[]> {
	const texts: string[] = [];
	for await (const ev of adapter.streamEvents(handle)) {
		if (ev.type === "completion" && typeof (ev as { text?: string }).text === "string") {
			texts.push((ev as { text: string }).text);
		}
	}
	return texts;
}

describe("codex app-server adapter (real binary) — per-session CODEX_HOME hides the user's idle plugin", () => {
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

			const adapter = productionHarnessAdapter("codex");
			const handle = await adapter.startSession(config);
			track(adapter, handle);

			const texts = await drainCompletionTexts(adapter, handle);
			await adapter.stopSession(handle);

			// Join with "" not "\n": streaming adapters emit one token per completion event,
			// so joining with newlines would split "codex_apps" → "cod\nex\n_apps" and break
			// word-level regex matches. Joining with "" reassembles the streamed tokens.
			const combined = texts.join("");
			expect(
				combined,
				`codex must have actually listed its tools (proves the audit instruction ran) — ` +
					`got no known native tool in output. Got: ${combined}`,
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

describe("opencode serve adapter (real binary) — XDG_CONFIG_HOME isolation hides the user's idle plugin", () => {
	requireHarness("opencode");
	test("an opencode session sees no idle-tasks/idle-skills tool", async () => {
		await requireHarnessAuthed(
			"opencode",
			"idle-isolation cannot prove XDG_CONFIG_HOME isolation without a real logged-in session",
		);

		const sandbox = createHarnessSandbox("idle-isolation-opencode");

		try {
			const config: SessionConfig = {
				sessionId: `idle-isolation-opencode-${Math.random().toString(36).slice(2, 10)}`,
				sandboxPath: sandbox.path,
				assembledPrompt: TOOL_AUDIT_INSTRUCTION,
				instruction: TOOL_AUDIT_INSTRUCTION,
				modelTier: "workhorse" as const,
				tools: [],
				selectedModel: HARNESS_TEST_MODELS.opencode.model,
				mcpConnectionInfo: undefined,
			};

			// OpenCodeServeAdapter starts opencode serve with a fresh XDG_CONFIG_HOME so
			// the user's ~/.config/opencode/ plugins (including the idle plugin) cannot
			// load into this session.
			const adapter = productionHarnessAdapter("opencode");
			const handle = await adapter.startSession(config);
			track(adapter, handle);

			const texts = await drainCompletionTexts(adapter, handle);
			await adapter.stopSession(handle);

			// Join with "" not "\n": same streaming-token reassembly rationale as codex.
			const combined = texts.join("");
			// Proof the audit instruction ran: the model produced non-empty output.
			// (opencode with an isolated XDG_CONFIG_HOME has no plugins, so the model
			// may output "NO_PLUGIN_TOOLS" or list built-ins — either is a valid audit.)
			expect(
				combined.length,
				`opencode must produce non-empty output (proves the audit instruction ran). ` +
					`Got empty string — session may have crashed silently.`,
			).toBeGreaterThan(0);
			expect(
				combined,
				`opencode must not see the idle plugin via its isolated XDG_CONFIG_HOME. Got: ${combined}`,
			).not.toMatch(IDLE_LEAK_PATTERN);
		} finally {
			await sandbox.cleanup();
		}
	}, 120_000);
});
