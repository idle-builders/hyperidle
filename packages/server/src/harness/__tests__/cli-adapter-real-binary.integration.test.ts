/**
 * cli-adapter-real-binary — LIVE real-binary CliHarnessAdapter integration tests.
 *
 * ⚠️  LOCAL-ONLY LANE — runs via test:integration's serial `harness` project; the
 *     signed attestation carries the result. No test suite runs in GitHub Actions.
 *
 * These tests close the test-coverage seam: the existing real-harness lane (AL6/AL7)
 * proves the real binaries behave, but spawns them DIRECTLY (hand-rolled spawn).
 * The existing mock-adapter test (claude-cli-adapter.test.ts) drives the REAL adapter
 * against a MOCK spawn. This file exercises both together:
 *
 *   REAL production CliHarnessAdapter → REAL binary → REAL LLM turn
 *
 * What is proven here but was unproven before:
 *   1. preMapClaudeEvent correctly translates the REAL binary's stream-json output
 *      into canonical HarnessEvent types (no error pollution from system/result lines).
 *   2. Real cost_update events are captured from the REAL result line's total_cost_usd.
 *   3. The full adapter flow (startSession → streamEvents → stopSession) works end-to-end
 *      with each installed binary.
 *
 * Per project rule: "e2e/expensive/live-LLM tests run locally only; never a GitHub
 * Actions job." Runs via `npm run test:integration` (serial harness project).
 *
 * @lore cli-adapter-real-binary: This test gates each binary with requireHarness(<name>)
 * (hard-fail, never skip) + an inner auth check. The key difference vs AL6/AL7: instead of spawning
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
 * user. Proven in CLAUDE_CLI_CONFIG lore comment: "adding USER+LOGNAME → real turn
 * completes (total_cost_usd>0)".
 */

import { execFile, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { HarnessEvent, SessionConfig } from "@hyperidle/shared";
import { describe, expect, test } from "vitest";
import { CLAUDE_CLI_CONFIG, CLI_TOOL_CONFIGS } from "../adapter-pool.js";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { requireHarness } from "./require-harness.js";

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
			// prevent a non-product ENOTEMPTY race from failing attestation.
			await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
		}
	}
	fs.rmSync(sandboxPath, { recursive: true, force: true });
}

// ── Binary detection (same pattern as AL6/AL7) ────────────────────────────────

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
		// The builtin/OpenRouter key is the only key in the strict harness model.
		const key = process.env.OPENROUTER_API_KEY;
		if (!key) return false;
		const { stdout } = await execFileAsync("opencode", ["providers", "list"], { timeout: 10_000 });
		return /\d+\s+credentials/.test(stdout) || stdout.includes("environment variable");
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

/** Copy codex auth (auth.json + config.toml only, no SQLite) into .codex-home/. */
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
//   2. cost_update with totalCost > 0 — proves total_cost_usd captured from the real
//      result line.
//   3. No UnknownHarnessEvent errors — proves preMapClaudeEvent handled ALL stream-json
//      line types (system, assistant, result, user) without falling through to error.
//   4. result.outcome === "completed" + cost.minor > 0 — proves buildResult + stopSession.
//
// @lore cli-adapter-real-binary sandbox-files: The sandbox must contain:
//   - .mcp.json: CLAUDE_CLI_CONFIG passes `--mcp-config .mcp.json`. A dead MCP URL is
//     fine — claude marks the server pending and continues. We're testing parse+cost.
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
	test("drives CliHarnessAdapter(CLAUDE_CLI_CONFIG) against real claude → parsed completion + real cost + no error pollution", async ({
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
				systemPromptPath: "",
				assembledPrompt: "Reply with exactly the token ADAPTER_OK and nothing else.",
				modelTier: "workhorse" as const,
				tools: [],
				resolvedModel: {
					provider: "anthropic" as const,
					// apiKey is intentionally empty: CLAUDE_CLI_CONFIG.envMap is {} so nothing
					// is injected. claude authenticates via the macOS keychain through the
					// forwarded HOME/USER/LOGNAME env vars (envAllowlist).
					// The allowlist excludes CLAUDECODE etc — no nested-session detection fires.
					model: "claude-haiku-4-5",
					apiKey: "",
					baseUrl: "https://api.anthropic.com",
				},
				mcpConnectionInfo: undefined,
			};

			// NO spawnFn → REAL spawn.
			const adapter = new CliHarnessAdapter(CLAUDE_CLI_CONFIG);

			const handle = await adapter.startSession(config);

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

			// ── Assertion 2: real cost_update with totalCost > 0 ─────────────────
			// Proves total_cost_usd captured from the real result line.
			// The real `claude` binary emits a terminal {"type":"result","total_cost_usd":X}
			// line; parseStdoutLine captures it → streamEvents emits one cost_update.
			const costEvent = events.find((e) => e.type === "cost_update");
			expect(
				costEvent,
				"Expected a cost_update event from the real result line's total_cost_usd",
			).toBeDefined();
			if (costEvent !== undefined && costEvent.type === "cost_update") {
				expect(
					costEvent.totalCost,
					"cost_update.totalCost must be > 0 (real LLM turn consumed tokens)",
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

			// ── Assertion 4: result.outcome + cost.minor ──────────────────────────
			expect(result.outcome).toBe("completed");
			expect(
				result.cost.minor,
				"result.cost.minor must be > 0 (real session cost captured from terminal result line)",
			).toBeGreaterThan(0);
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
// Cost assertion: only assert cost>0 if codex emits total_cost_usd (it may not).
// If not present, assert cost.minor >= 0 and log that codex didn't report cost.
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
		// If the AL6 codex real-harness tests pass in this env, this skip is suspicious.
		// Run `codex login status` to debug.
		process.stdout.write(
			"[cli-adapter-real-binary codex] SKIP: codex not authenticated (codex login status returned not logged in)\n",
		);
		skip();
		return;
	}

	const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "cli-adapter-codex-"));

	try {
		// Codex requires a git repo in the working directory.
		execFileSync("git", ["init"], { cwd: sandboxPath, stdio: "ignore" });
		execFileSync("git", ["commit", "--allow-empty", "-m", "init"], {
			cwd: sandboxPath,
			stdio: "ignore",
			env: {
				...process.env,
				GIT_AUTHOR_NAME: "test",
				GIT_AUTHOR_EMAIL: "test@test.com",
				GIT_COMMITTER_NAME: "test",
				GIT_COMMITTER_EMAIL: "test@test.com",
			},
		});

		// Provision .codex-home/ (auth.json + config.toml only — no SQLite).
		// The adapter detects this dir and sets CODEX_HOME automatically.
		// @lore AL6 codex-codex-home: Copy ONLY auth.json + config.toml.
		// SQLite files lock and cause codex to exit before making an LLM call.
		const authFound = provisionCodexHome(sandboxPath);
		if (!authFound) {
			skip();
			return;
		}

		const codexConfig = CLI_TOOL_CONFIGS.codex;
		if (!codexConfig) {
			throw new Error("CLI_TOOL_CONFIGS.codex is not defined");
		}

		const config: SessionConfig = {
			sessionId: `cli-adapter-codex-${Math.random().toString(36).slice(2, 10)}`,
			sandboxPath,
			systemPromptPath: "",
			assembledPrompt: "Reply with exactly the token ADAPTER_OK and nothing else.",
			modelTier: "workhorse" as const,
			tools: [],
			resolvedModel: {
				// codex uses OpenAI API — "openai-compatible" is the correct provider.
				// CLI_TOOL_CONFIGS.codex.envMap injects OPENAI_API_KEY from apiKey.
				// The codex binary reads its own auth from CODEX_HOME/auth.json (not apiKey).
				provider: "openai-compatible" as const,
				// AR7: codex now receives --model {{model}}, so this must be a model the
				// ChatGPT-account codex login accepts. "codex-mini-latest" is rejected (400);
				// gpt-5.4-mini is the valid floor (matches HARNESS_TEST_MODELS.codex).
				model: "gpt-5.4-mini",
				apiKey: "",
				baseUrl: "https://api.openai.com",
			},
			mcpConnectionInfo: undefined,
		};

		// NO spawnFn → REAL spawn.
		const adapter = new CliHarnessAdapter(codexConfig);

		const handle = await adapter.startSession(config);

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

		// Assert: cost — only require >= 0 (codex may not emit total_cost_usd).
		// If codex DID emit cost, it must be > 0 (real LLM turn consumed tokens).
		const costEvent = events.find((e) => e.type === "cost_update");
		if (costEvent !== undefined && costEvent.type === "cost_update") {
			expect(
				costEvent.totalCost,
				"cost_update.totalCost must be > 0 when codex reports cost",
			).toBeGreaterThan(0);
		}
		// When codex does not emit total_cost_usd, no cost_update event is present.
		// result.cost.minor will be 0 in that case — assert >= 0 (both cases handled below).
		// result.cost.minor >= 0 regardless (codex may not report cost).
		expect(result.cost.minor).toBeGreaterThanOrEqual(0);

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
		await rmSandboxWithRetry(sandboxPath);
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
// opencode is driven through its OpenRouter (openai-compatible) provider — the only
// key in the strict harness model is OPENROUTER_API_KEY. The model id is provider-
// prefixed for OpenRouter.
//
// @lore cli-adapter-real-binary opencode: Uses CLI_TOOL_CONFIGS.opencode which has
// args: ["run", "{{prompt}}", "--dir", "{{sandbox}}", "--format", "json", "--pure",
// "--model", "{{model}}"]. The model must be provider-prefixed.
// @lore AR1 opencode-key: the strict harness model forbids ANTHROPIC_API_KEY entirely;
// opencode here is keyed from OPENROUTER_API_KEY (the single allowed key) through the
// openai-compatible OpenRouter endpoint.

describe("opencode CLI adapter (real binary, production CliHarnessAdapter path)", () => {
	requireHarness("opencode");
	test("drives CliHarnessAdapter(CLI_TOOL_CONFIGS.opencode) against real opencode → completion + outcome completed", async ({
		skip,
	}) => {
		// The builtin/OpenRouter key is the only key — do NOT fabricate a key.
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
			const opencodeConfig = CLI_TOOL_CONFIGS.opencode;
			if (!opencodeConfig) {
				throw new Error("CLI_TOOL_CONFIGS.opencode is not defined");
			}

			const config: SessionConfig = {
				sessionId: `cli-adapter-opencode-${Math.random().toString(36).slice(2, 10)}`,
				sandboxPath,
				systemPromptPath: "",
				assembledPrompt: "Reply with exactly the token ADAPTER_OK and nothing else.",
				modelTier: "workhorse" as const,
				tools: [],
				resolvedModel: {
					provider: "openai-compatible" as const,
					// Provider-prefixed model id required by opencode (OpenRouter route).
					// @lore AL6 opencode-model-format: opencode uses provider-prefixed model IDs.
					model: "openrouter/openai/gpt-4o-mini",
					apiKey,
					baseUrl: "https://openrouter.ai/api",
				},
				mcpConnectionInfo: undefined,
			};

			// NO spawnFn → REAL spawn.
			const adapter = new CliHarnessAdapter(opencodeConfig);

			const handle = await adapter.startSession(config);

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
