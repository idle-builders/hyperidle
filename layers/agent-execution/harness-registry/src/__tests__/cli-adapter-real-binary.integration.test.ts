/**
 * cli-adapter-real-binary — LIVE real-binary CliHarnessAdapter integration tests.
 *
 * ⚠️  LOCAL-ONLY LANE — runs via test:integration's serial `harness` project. CI
 *     runs the unit and service-integration lanes, but NOT this one: it needs real
 *     CLI binaries and real LLM credentials. Nothing records that it ran, so a
 *     human running it is the only evidence it passed.
 *
 * These tests close the test-coverage seam: the existing real-harness lanes
 * (return-enforcement, AL7) prove the real binaries behave, but spawn them
 * DIRECTLY (hand-rolled spawn).
 * The existing mock-adapter test (claude-cli-adapter.test.ts) drives the REAL adapter
 * against a MOCK spawn. This file exercises both together:
 *
 *   REAL production CliHarnessAdapter → REAL binary → REAL LLM turn
 *
 * What is proven here but was unproven before:
 *   1. preMapClaudeEvent correctly translates the REAL binary's stream-json output
 *      into canonical HarnessEvent types (no error pollution from system/result lines).
 *   2. Real token_usage is captured from the REAL result line's usage block.
 *   3. The full adapter flow (startSession → streamEvents → stopSession) works end-to-end
 *      with each installed binary.
 *
 * @lore AU21 (harness-telemetry narrowing): this file used to also assert a
 * real `cost_update` event captured from the real result line's
 * `total_cost_usd`. Founder ruling narrowed harness telemetry to token usage
 * only — "very few harness can actually report cost" (confirmed here: codex
 * never emitted `total_cost_usd` in this lane's runs). No cost_update event
 * is emitted by the adapter anymore, on any harness.
 *
 * Per project rule: "e2e/expensive/live-LLM tests run locally only; never a GitHub
 * Actions job." Runs via `npm run test:integration` (serial harness project).
 *
 * @lore cli-adapter-real-binary: This test gates each binary with requireHarness(<name>)
 * (hard-fail, never skip) + an inner auth check. The key difference vs the
 * return-enforcement/AL7 lanes: instead of spawning
 * `claude -p ...` directly, we drive `new CliHarnessAdapter(CLAUDE_CLI_CONFIG)` so every
 * line of the production adapter (parseStdoutLine, buildResult, wireStdout) is exercised
 * against real binary output.
 *
 * @lore cli-adapter-real-binary claude-env-allowlist: The CLAUDE_CLI_CONFIG envAllowlist
 * is [PATH, HOME, LANG, USER, LOGNAME]. It does NOT forward CLAUDECODE,
 * CLAUDE_CODE_ENTRYPOINT, etc. — these are NOT in the allowlist, so the adapter's
 * buildSandboxedEnv naturally excludes them. The nested-session detection in the claude
 * binary does not fire because none of the CC session vars are forwarded. This is the
 * production behavior (not a workaround): the allowlist is the correct sandbox boundary.
 *
 * @lore cli-adapter-real-binary macOS-keychain: claude authenticates via the macOS
 * Keychain (claude.ai OAuth). The adapter forwards HOME + USER + LOGNAME from the
 * envAllowlist, which is sufficient for the Security framework to resolve the keychain
 * user. Historically proven via a real completed turn (the CLAUDE_CLI_CONFIG lore
 * comment records this using the era's total_cost_usd>0 signal — cost is no longer
 * captured; token_usage>0 is the current equivalent proof).
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { HarnessEvent, SessionConfig } from "@hyperidle/harness-protocol";
import { ensureSandboxGitRepo } from "@hyperidle/run-orchestration";
import { describe, expect, test } from "vitest";
import { productionCliConfig } from "./production-cli-config.js";

const CLAUDE_CLI_CONFIG = productionCliConfig("claude");
const CURSOR_AGENT_CLI_CONFIG = productionCliConfig("cursor-agent");

import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import { requireHarness } from "./require-harness.js";
import { trackHarnessSessions } from "./session-handle-tracker.js";

// @lore process-group kill only helps once stopSession runs. `track` stops any
// handle a test leaves unstopped — timeout or thrown assertion included — in
// afterEach. See session-handle-tracker.ts.
const { track } = trackHarnessSessions();

const execFileAsync = promisify(execFile);

async function rmSandboxWithRetry(sandboxPath: string): Promise<void> {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		try {
			fs.rmSync(sandboxPath, { recursive: true, force: true });
			return;
		} catch (err) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code !== "ENOTEMPTY" && code !== "EBUSY") throw err;
			// @lore AV3-ship: real CLI harnesses can leave a just-exited helper touching
			// the temp sandbox for a tick on macOS. The proof already passed; cleanup retries
			// prevent a non-product ENOTEMPTY race from failing the run.
			await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
		}
	}
	fs.rmSync(sandboxPath, { recursive: true, force: true });
}

// ── Binary detection (same pattern as the return-enforcement/AL7 lanes) ──────

async function claudeAuthed(): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync("claude", ["auth", "status"], { timeout: 10_000 });
		const parsed = JSON.parse(stdout.trim()) as { loggedIn?: boolean };
		return parsed.loggedIn === true;
	} catch {
		return false;
	}
}

async function codexAuthed(): Promise<boolean> {
	try {
		const { stdout, stderr } = await execFileAsync("codex", ["login", "status"], {
			timeout: 10_000,
		});
		const out = (stdout + stderr).trim();
		return out.startsWith("Logged in");
	} catch {
		return false;
	}
}

async function opencodeAuthed(): Promise<boolean> {
	try {
		// opencode's own auth: it reads OPENROUTER_API_KEY from its environment.
		// Nothing here supplies it — HyperIdle holds no model credential.
		const key = process.env.OPENROUTER_API_KEY;
		if (!key) return false;
		const { stdout } = await execFileAsync("opencode", ["providers", "list"], { timeout: 10_000 });
		return /\d+\s+credentials/.test(stdout) || stdout.includes("environment variable");
	} catch {
		return false;
	}
}

async function cursorAgentAuthed(): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync("cursor-agent", ["status"], { timeout: 10_000 });
		return stdout.includes("Logged in");
	} catch {
		return false;
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Provision the sandbox files that CLAUDE_CLI_CONFIG args reference. */
function provisionClaudeSandbox(sandboxPath: string): void {
	// --mcp-config .mcp.json: dead URL is fine; claude marks it pending and proceeds.
	fs.writeFileSync(
		path.join(sandboxPath, ".mcp.json"),
		JSON.stringify({
			mcpServers: { hyperidle: { type: "http", url: "http://localhost:9/api/mcp/x" } },
		}),
		"utf-8",
	);
	// --settings .claude/settings.json: empty object = no Stop hook → no re-prompt loop.
	fs.mkdirSync(path.join(sandboxPath, ".claude"), { recursive: true });
	fs.writeFileSync(path.join(sandboxPath, ".claude", "settings.json"), JSON.stringify({}), "utf-8");
}

/**
 * Copy codex auth (auth.json + config.toml only, no SQLite) into .codex-home/.
 *
 * @lore BA2 ruling 18 (kept under ruling 22): this test drives `CliHarnessAdapter` directly against
 * `CLI_TOOL_CONFIGS.codex` with the git-repo-check bypass flag removed, so the
 * sandbox's own trust declaration (production's job — `writeCliMcpConfig`'s
 * codex-toml dialect) is not exercised here; this harness-adapter-level test
 * has no bridge/mcpUrl/token to call it with. Declare trust for the ephemeral
 * sandbox directly, in the same shape codex itself writes (`codex mcp add` /
 * accepting a trust prompt): `[projects."<path>"] trust_level = "trusted"`.
 * The home config.toml this test copies in has this same block for the
 * developer's real, durable directories — never for an mkdtemp path, which is
 * why the block is appended here rather than relied upon from the copy.
 */
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

// ── CLAUDE-CODE CLI adapter (production path, real binary) ───────────────────
//
// MANDATORY: This is the primary test. The PR added `CLAUDE_CLI_CONFIG` +
// `eventDialect: "claude-stream-json"` + `preMapClaudeEvent`. This test proves
// the full production adapter pipeline against the real binary.
//
// Key assertions:
//   1. completion event containing "ADAPTER_OK" — proves preMapClaudeEvent translated
//      the real binary's stream-json output correctly.
//   2. token_usage with real (>0) input/output tokens — proves usage captured from the
//      real result line.
//   3. No UnknownHarnessEvent errors — proves preMapClaudeEvent handled ALL stream-json
//      line types (system, assistant, result, user) without falling through to error.
//   4. result.outcome === "completed" + no cost field on SessionResult — proves
//      buildResult + stopSession, and confirms the $-cost narrowing.
//
// @lore cli-adapter-real-binary sandbox-files: The sandbox must contain:
//   - .mcp.json: CLAUDE_CLI_CONFIG passes `--mcp-config .mcp.json`. A dead MCP URL is
//     fine — claude marks the server pending and continues. We're testing parse+usage.
//   - .claude/settings.json: CLAUDE_CLI_CONFIG passes `--settings .claude/settings.json`.
//     The file must exist (even as {}) — if absent, claude errors on the --settings flag.
//     An empty object means no Stop hook → no re-prompt loop (correct for this test).
//
// @lore cli-adapter-real-binary apiKey-empty: SessionConfig.resolvedModel.apiKey is ""
// on purpose. CLAUDE_CLI_CONFIG.envMap is {} so nothing is injected. The adapter
// forwards only [PATH,HOME,LANG,USER,LOGNAME] and claude authenticates via the macOS
// keychain (oauth token stored in ~/Library/Keychains). The allowlist excludes CLAUDECODE
// and all CC session vars — so claude's nested-session detection does not fire even
// when this test runs inside Claude Code.

describe("claude-code CLI adapter (real binary, production CliHarnessAdapter path)", () => {
	requireHarness("claude");
	test("drives CliHarnessAdapter(CLAUDE_CLI_CONFIG) against real claude → parsed completion + real token usage + no error pollution", async ({
		skip,
	}) => {
		const authed = await claudeAuthed();
		if (!authed) {
			skip();
			return;
		}

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "cli-adapter-real-"));

		try {
			provisionClaudeSandbox(sandboxPath);

			const config: SessionConfig = {
				sessionId: `cli-adapter-real-${Math.random().toString(36).slice(2, 10)}`,
				sandboxPath,
				assembledPrompt: "Reply with exactly the token ADAPTER_OK and nothing else.",
				instruction: "Reply with exactly the token ADAPTER_OK and nothing else.",
				modelTier: "workhorse" as const,
				tools: [],
				selectedModel: "haiku",
				mcpConnectionInfo: undefined,
			};

			// NO spawnFn → REAL spawn.
			const adapter = new CliHarnessAdapter(CLAUDE_CLI_CONFIG);

			const handle = await adapter.startSession(config);
			track(adapter, handle);

			const events: HarnessEvent[] = [];
			for await (const ev of adapter.streamEvents(handle)) {
				events.push(ev);
			}

			const result = await adapter.stopSession(handle);

			// ── Assertion 1: completion event containing "ADAPTER_OK" ─────────────
			// Proves preMapClaudeEvent translated the real binary's stream-json output.
			// The real binary emits assistant-block JSON; preMapClaudeEvent converts it
			// to { type: "completion", text: "ADAPTER_OK" } before normalizeHarnessEvent.
			const hasCompletion = events.some(
				(e) =>
					e.type === "completion" &&
					typeof (e as { text?: string }).text === "string" &&
					(e as { text: string }).text.includes("ADAPTER_OK"),
			);
			if (!hasCompletion) {
				const completions = events
					.filter((e) => e.type === "completion")
					.map((e) => (e as { text?: string }).text ?? "")
					.join(" | ");
				throw new Error(
					`ADAPTER PROOF FAILED: no completion event with 'ADAPTER_OK'. ` +
						`events: ${events.map((e) => e.type).join(",")}. ` +
						`completion texts: "${completions}"`,
				);
			}
			expect(hasCompletion).toBe(true);

			// ── Assertion 2: real token_usage with real (>0) input/output tokens ──
			// Proves usage captured from the real result line's usage block.
			// The real `claude` binary emits a terminal {"type":"result","usage":{...}}
			// line; parseStdoutLine captures it → streamEvents emits one token_usage.
			// @lore AU21 (harness-telemetry narrowing): this used to assert a real
			// cost_update from total_cost_usd — removed, no cost_update is emitted anymore.
			expect(events.some((e) => (e.type as string) === "cost_update")).toBe(false);
			const tokenEvent = events.find((e) => e.type === "token_usage");
			expect(
				tokenEvent,
				"Expected a token_usage event from the real result line's usage block",
			).toBeDefined();
			if (tokenEvent !== undefined && tokenEvent.type === "token_usage") {
				expect(
					tokenEvent.inputTokens,
					"token_usage.inputTokens must be > 0 (real LLM turn consumed tokens)",
				).toBeGreaterThan(0);
				expect(
					tokenEvent.outputTokens,
					"token_usage.outputTokens must be > 0 (real LLM turn consumed tokens)",
				).toBeGreaterThan(0);
			}

			// ── Assertion 3: no UnknownHarnessEvent errors ────────────────────────
			// Proves preMapClaudeEvent handled ALL stream-json line types without
			// falling through to the error path.
			// system/assistant/result/user lines must NOT produce UnknownHarnessEvent.
			const hasUnknownError = events.some(
				(e) =>
					e.type === "error" &&
					"code" in e &&
					(e as { code: string }).code === "UnknownHarnessEvent",
			);
			if (hasUnknownError) {
				const errorEvents = events.filter(
					(e) => e.type === "error" && (e as { code?: string }).code === "UnknownHarnessEvent",
				);
				throw new Error(
					`ADAPTER PROOF FAILED: preMapClaudeEvent produced UnknownHarnessEvent errors. ` +
						`Errors: ${JSON.stringify(errorEvents.slice(0, 3))}`,
				);
			}
			expect(hasUnknownError).toBe(false);

			// ── Assertion 4: result.outcome + no cost field on SessionResult ──────
			expect(result.outcome).toBe("completed");
			expect(result).not.toHaveProperty("cost");
		} finally {
			await rmSandboxWithRetry(sandboxPath);
		}
	}, 90_000);
});

// ── CODEX CLI adapter (production path, real binary) ─────────────────────────
//
// Codex requires a git repo + CODEX_HOME setup (auth.json + config.toml, no SQLite).
// The adapter detects .codex-home/ and sets CODEX_HOME automatically.
//
// @lore AU21 (harness-telemetry narrowing): codex never emits total_cost_usd —
// this lane's runs are the direct empirical confirmation of the founder's stated
// rationale ("very few harness can actually report cost"). No cost assertion here
// anymore; token_usage is asserted instead (codex reports usage on turn.completed).
//
// @lore cli-adapter-real-binary codex: Codex uses CLI_TOOL_CONFIGS.codex which has
// args: ["exec", "{{prompt}}", "--json"]. The adapter injects CODEX_HOME if .codex-home/
// exists and appends --dangerously-bypass-hook-trust. Auth: copy auth.json + config.toml
// from ~/.codex (NOT SQLite files — they lock and cause codex to exit before LLM call).
//
// @lore cli-adapter-real-binary codex-stdin-fix: Previously, the production CliHarnessAdapter
// spawned with stdio: ["pipe","pipe","pipe"] but never closed stdin — codex would emit
// "Reading additional input from stdin..." and block until EOF. Fixed 2026-06-28 by
// calling child.stdin?.end() immediately after spawn in CliHarnessAdapter.startSession
// (and the re-engage spawn). This test now runs against the real binary to prove the fix.

async function runCodexAdapterTest({ skip }: { skip: () => void }): Promise<void> {
	const authed = await codexAuthed();
	if (!authed) {
		// codex not authenticated — skip with explicit log.
		// If the return-enforcement codex real-harness tests pass in this env, this skip is suspicious.
		// Run `codex login status` to debug.
		process.stdout.write(
			"[cli-adapter-real-binary codex] SKIP: codex not authenticated (codex login status returned not logged in)\n",
		);
		skip();
		return;
	}

	// @lore BA2 ruling 22 (corrects a prior version of this test): the sandbox
	// here MUST come from production's own provisioning path, not a hand-rolled
	// `git init` — a hand-rolled init proves nothing about whether production
	// actually initializes the sandbox; it passes for the wrong reason even if
	// the real fix is deleted. `LocalSandboxAdapter.spawn()` is the exact
	// adapter run-orchestration's provisioner uses to create a session sandbox;
	// `ensureSandboxGitRepo` is the exact function it calls afterwards (Phase
	// 4.5, after filesystem mounting — there is none to mount here). Same two
	// calls, same order, as the real session-provisioning flow.
	const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "cli-adapter-codex-base-"));
	const sandboxAdapter = new LocalSandboxAdapter();
	const sandboxHandle = await sandboxAdapter.spawn(baseDir);
	const sandboxPath = sandboxHandle.path;

	try {
		ensureSandboxGitRepo(sandboxPath);

		// Provision .codex-home/ (auth.json + config.toml only — no SQLite).
		// The adapter detects this dir and sets CODEX_HOME automatically.
		// @lore Codex-home: Copy ONLY auth.json + config.toml.
		// SQLite files lock and cause codex to exit before making an LLM call.
		const authFound = provisionCodexHome(sandboxPath);
		if (!authFound) {
			skip();
			return;
		}

		const codexConfig = productionCliConfig("codex");

		const config: SessionConfig = {
			sessionId: `cli-adapter-codex-${Math.random().toString(36).slice(2, 10)}`,
			sandboxPath,
			assembledPrompt: "Reply with exactly the token ADAPTER_OK and nothing else.",
			instruction: "Reply with exactly the token ADAPTER_OK and nothing else.",
			modelTier: "workhorse" as const,
			tools: [],
			selectedModel: "gpt-5.6-luna",
			mcpConnectionInfo: undefined,
		};

		// NO spawnFn → REAL spawn.
		const adapter = new CliHarnessAdapter(codexConfig);

		const handle = await adapter.startSession(config);
		track(adapter, handle);

		const events: HarnessEvent[] = [];
		for await (const ev of adapter.streamEvents(handle)) {
			events.push(ev);
		}

		const result = await adapter.stopSession(handle);

		// Assert: completion event present (codex JSONL → events).
		const hasCompletion = events.some((e) => e.type === "completion");
		if (!hasCompletion) {
			throw new Error(
				`ADAPTER PROOF FAILED: no completion event from codex. ` +
					`events: ${events.map((e) => e.type).join(",")}`,
			);
		}
		expect(hasCompletion).toBe(true);

		// Assert: no UnknownHarnessEvent errors — proves codex JSONL lines are all handled.
		const hasUnknownError = events.some(
			(e) =>
				e.type === "error" && "code" in e && (e as { code: string }).code === "UnknownHarnessEvent",
		);
		if (hasUnknownError) {
			const errorEvents = events.filter(
				(e) => e.type === "error" && (e as { code?: string }).code === "UnknownHarnessEvent",
			);
			throw new Error(
				`ADAPTER PROOF FAILED: UnknownHarnessEvent errors from codex output. ` +
					`Errors: ${JSON.stringify(errorEvents.slice(0, 3))}`,
			);
		}
		expect(hasUnknownError).toBe(false);

		// Assert: result.outcome "completed".
		expect(result.outcome).toBe("completed");

		// Assert: no cost_update event, ever — codex never emits total_cost_usd, and
		// even where a harness does (claude/opencode), the adapter no longer surfaces
		// it (@lore AU21 harness-telemetry narrowing). No cost field on SessionResult.
		expect(events.some((e) => (e.type as string) === "cost_update")).toBe(false);
		expect(result).not.toHaveProperty("cost");

		// Assert: token_usage event — proves preMapCodexEvent's turn.completed branch (Fix B).
		// codex emits turn.completed with usage.input_tokens/output_tokens when a turn ends.
		// If present, both fields must be >= 0 (a real LLM turn consumes tokens).
		// If absent, log it — codex may not emit usage in all versions/configs.
		const tokenUsageEvent = events.find((e) => e.type === "token_usage");
		if (tokenUsageEvent !== undefined && tokenUsageEvent.type === "token_usage") {
			expect(
				tokenUsageEvent.inputTokens,
				"token_usage.inputTokens must be >= 0 when codex emits turn.completed usage",
			).toBeGreaterThanOrEqual(0);
			expect(
				tokenUsageEvent.outputTokens,
				"token_usage.outputTokens must be >= 0 when codex emits turn.completed usage",
			).toBeGreaterThanOrEqual(0);
		} else {
			// Honest absence: log so we know whether this codex version/config emits turn.completed.
			process.stdout.write(
				"[cli-adapter-real-binary codex] INFO: no token_usage event observed — codex may not have emitted turn.completed with usage in this run.\n",
			);
		}
	} finally {
		await rmSandboxWithRetry(baseDir);
	}
}

describe("codex CLI adapter (real binary, production CliHarnessAdapter path)", () => {
	requireHarness("codex");
	test("drives CliHarnessAdapter(CLI_TOOL_CONFIGS.codex) against real codex → completion + outcome completed", async ({
		skip,
	}) => {
		await runCodexAdapterTest({ skip });
	}, 90_000);
});

// ── OPENCODE CLI adapter (production path, real binary) ───────────────────────
//
// opencode is driven through its OpenRouter provider, authenticating itself from
// OPENROUTER_API_KEY in its own environment. The model id is provider-prefixed.
//
// @lore cli-adapter-real-binary opencode: Uses CLI_TOOL_CONFIGS.opencode which has
// args: ["run", "{{prompt}}", "--dir", "{{sandbox}}", "--format", "json", "--pure",
// "--model", "{{model}}"]. The model must be provider-prefixed.
// @lore AR1 opencode-key: opencode authenticates from OPENROUTER_API_KEY in its own
// environment. HyperIdle injects nothing — it holds no model credential to inject.

describe("opencode CLI adapter (real binary, production CliHarnessAdapter path)", () => {
	requireHarness("opencode");
	test("drives CliHarnessAdapter(CLI_TOOL_CONFIGS.opencode) against real opencode → completion + outcome completed", async ({
		skip,
	}) => {
		// opencode's own key, read from its environment — never fabricated here.
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

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "cli-adapter-opencode-"));

		try {
			const opencodeConfig = productionCliConfig("opencode");

			const config: SessionConfig = {
				sessionId: `cli-adapter-opencode-${Math.random().toString(36).slice(2, 10)}`,
				sandboxPath,
				assembledPrompt: "Reply with exactly the token ADAPTER_OK and nothing else.",
				instruction: "Reply with exactly the token ADAPTER_OK and nothing else.",
				modelTier: "workhorse" as const,
				tools: [],
				selectedModel: "openrouter/openai/gpt-4o-mini",
				mcpConnectionInfo: undefined,
			};

			// NO spawnFn → REAL spawn.
			const adapter = new CliHarnessAdapter(opencodeConfig);

			const handle = await adapter.startSession(config);
			track(adapter, handle);

			const events: HarnessEvent[] = [];
			for await (const ev of adapter.streamEvents(handle)) {
				events.push(ev);
			}

			const result = await adapter.stopSession(handle);

			// Assert: completion event present.
			expect(events.some((e) => e.type === "completion")).toBe(true);

			// Assert: result.outcome "completed".
			expect(result.outcome).toBe("completed");
		} finally {
			await rmSandboxWithRetry(sandboxPath);
		}
	}, 90_000);
});

// ── CURSOR-AGENT CLI adapter (production path, real binary) ──────────────────

describe("cursor-agent CLI adapter (real binary, production CliHarnessAdapter path)", () => {
	requireHarness("cursor-agent");
	test("drives CliHarnessAdapter(CURSOR_AGENT_CLI_CONFIG) against real cursor-agent → parsed completion + outcome completed", async ({
		skip,
	}) => {
		const authed = await cursorAgentAuthed();
		if (!authed) {
			skip();
			return;
		}

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "cli-adapter-cursor-"));

		try {
			const config: SessionConfig = {
				sessionId: `cli-adapter-cursor-${Math.random().toString(36).slice(2, 10)}`,
				sandboxPath,
				assembledPrompt: "Reply with exactly the token ADAPTER_OK and nothing else.",
				instruction: "Reply with exactly the token ADAPTER_OK and nothing else.",
				modelTier: "workhorse" as const,
				tools: [],
				selectedModel: "auto",
				mcpConnectionInfo: undefined,
			};

			const adapter = new CliHarnessAdapter(CURSOR_AGENT_CLI_CONFIG);
			const handle = await adapter.startSession(config);
			track(adapter, handle);

			const events: HarnessEvent[] = [];
			for await (const ev of adapter.streamEvents(handle)) {
				events.push(ev);
			}

			const result = await adapter.stopSession(handle);

			expect(events.some((e) => e.type === "completion")).toBe(true);
			expect(events.some((e) => e.type === "completion" && e.text.includes("ADAPTER_OK"))).toBe(
				true,
			);
			expect(result.outcome).toBe("completed");
		} finally {
			await rmSandboxWithRetry(sandboxPath);
		}
	}, 120_000);
});
