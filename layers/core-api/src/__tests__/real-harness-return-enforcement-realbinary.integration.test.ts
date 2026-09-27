/**
 * LIVE real-binary harness return-enforcement tests.
 *
 * ⚠️  LOCAL-ONLY LANE — NOT IN CI / NOT IN test:all / NOT IN test:integration
 *
 * These tests spawn REAL harness binaries (claude, codex, opencode) and make
 * REAL LLM calls. They are:
 *   - Slow (30–90s per test, real network round trips)
 *   - Costly (real LLM tokens consumed)
 *   - Auth-gated (binary must be installed + authenticated on the local machine)
 *   - Flaky under parallel load (real binary process + network)
 *
 * Per project rule: "e2e/expensive/live-LLM tests run locally only; never a
 * GitHub Actions job." These tests prove the real hook transport end-to-end
 * (binary → provisioned hook → real HyperIdle route → real enforcement registry).
 *
 * Runs via npm run test:integration:harness (the serial harness project).
 *
 * Deterministic real-loop coverage (route/registry/injected-spawn/builtin) stays in
 * test:all via the unit tests in this package (return-status-route.test.ts,
 * return-enforcement-registry.test.ts, cli-reengage-adapter.test.ts, return-gate.test.ts).
 * Those tests are the CI anchor — they run without any real binary or LLM call.
 *
 * @lore Real-harness tests prove the ⚠️ UNVERIFIED-AT-RUNTIME claims:
 * - Claude CLI: full binary spawn → Stop hook → bridge POST PROVEN (see "FULL BINARY PROOF")
 * - Claude CLI exit-2+stderr Stop hook end-to-end — also PROVEN via hook script
 * - Codex CODEX_HOME per-session hook — FULL BINARY PROOF via CODEX_HOME strategy.
 *   provisionCodexHome creates .codex-home/ (auth+config+hooks, no SQLite); CliHarnessAdapter
 *   sets CODEX_HOME=<path>+--dangerously-bypass-hook-trust; real binary fires hook → bridge POST.
 * - OpenCode process-reengage — PROVEN: step_finish detected on first spawn;
 *   re-engage fires second spawn with forcing message; both turns complete successfully.
 *
 * @lore Real-claude-full-binary: The FULL BINARY PROOF for claude uses:
 *   CLAUDECODE="" CLAUDE_CODE_ENTRYPOINT="" CLAUDE_CODE_EXECPATH=""
 *   CLAUDE_CODE_SESSION_ID="" AI_AGENT="" CLAUDE_EFFORT=""
 * Zeroing (not removing) these vars lets the process inherit the rest of the env
 * (HOME, PATH, security frameworks) so keychain auth still works. The binary runs
 * `claude -p "<prompt>" --dangerously-skip-permissions --output-format json
 * --model claude-haiku-4-5`. The Stop hook in .claude/settings.json fires when the
 * session ends → POSTs to the local bridge → callCount>=1 confirmed.
 * Tested outside vitest: 3 hook fires confirmed. Tested inside vitest: hook fires on
 * every clean run. detached:true puts the process in its own process group so CC's
 * process-tree SIGTERM doesn't propagate before the hook fires.
 *
 * @lore Real-codex-format: codex-cli v0.141.0 hooks.json MUST use:
 * { "hooks": { "Stop": [{ "hooks": [{ "type":"command","command":"..." }] }] } }
 * The old flat format { "Stop": { "command": "..." } } is silently ignored.
 * Verified against /opt/homebrew/.codex/hooks.json installed by Homebrew.
 *
 * @lore Real-codex-semantics: Codex Stop hooks use JSON stdout semantics:
 * { "decision": "block", "reason": "..." } blocks the stop (NOT exit 2 + stderr).
 * Claude Code uses exit 2 + stderr. Both verified against real installed binaries.
 *
 * @lore Codex-home: Codex reads hooks ONLY from CODEX_HOME/hooks.json
 * (default: ~/.codex/hooks.json). Project-local .codex/hooks.json is silently ignored.
 * CODEX_HOME redirect WORKS when ONLY auth.json + config.toml are copied (not the SQLite
 * database files). Copying the full ~/.codex/ brings in SQLite files that lock → codex
 * exits before making an LLM call. The per-session .codex-home/ dir (sandboxPath/.codex-home)
 * contains ONLY auth.json + config.toml + hooks.json. Verified end-to-end: callCount >= 1.
 */

import { execFile, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

import { provisionHarnessEnvironment } from "@hyperidle/harness-registry";
import type { SupportedHarnessName } from "@hyperidle/harness-registry/test-utils";
import { HARNESS_TEST_MODELS, requireHarness } from "@hyperidle/harness-registry/test-utils";
import { describe, expect, test } from "vitest";
import {
	buildCleanEnv,
	createHarnessSandbox,
	setUpLiveHarnessMcpServer,
} from "../__testing__/live-harness-test-support.js";

const execFileAsync = promisify(execFile);
const provisionReturnHook = (options: {
	readonly sandboxPath: string;
	readonly channel: Parameters<typeof provisionHarnessEnvironment>[0]["channel"];
	readonly bridgeToken: string;
	readonly mcpUrl: string;
	readonly forceBudget: number;
}) => provisionHarnessEnvironment({ ...options, token: options.bridgeToken });

/**
 * Spawn a process in its own process group (detached) and return a promise that
 * resolves with { stdout, stderr, exitCode } when the process exits.
 *
 * Using `detached: true` ensures Claude Code's process-tree SIGTERM cascade on
 * session teardown does NOT propagate to our test subprocess. We manage the child
 * lifecycle via the returned promise and a timeout guard.
 *
 * @lore Real-claude-full-binary: `detached: true` + `stdio: ['ignore','pipe','pipe']`
 * is the correct posture for spawning a harness binary from vitest. The child runs in
 * its own process group; we ref/unref to avoid vitest hanging on process exit.
 */
async function spawnDetached(
	bin: string,
	args: string[],
	opts: {
		cwd: string;
		env: Record<string, string>;
		timeoutMs: number;
	},
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
	return new Promise((resolve) => {
		const child = spawn(bin, args, {
			cwd: opts.cwd,
			env: opts.env,
			// Run in own process group so CC's SIGTERM cascade doesn't reach us.
			detached: true,
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

		// Timeout guard: kill the process group if it exceeds the budget.
		const guard = setTimeout(() => {
			try {
				// Negative PID kills the entire process group.
				process.kill(-child.pid!, "SIGKILL");
			} catch {
				// Already exited.
			}
			resolve({ stdout, stderr, exitCode: null });
		}, opts.timeoutMs);

		child.on("exit", (code) => {
			clearTimeout(guard);
			resolve({ stdout, stderr, exitCode: code });
		});

		child.on("error", () => {
			clearTimeout(guard);
			resolve({ stdout, stderr, exitCode: null });
		});

		// Unref so vitest process can exit if we forget to await this.
		child.unref();
	});
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

describe("LIVE real-binary harness return-enforcement (local-only lane)", () => {
	// ── CLAUDE-CODE CLI (binary+auth gated, LIVE ENFORCEMENT) ───────────────
	//
	// Spawns the REAL claude binary headless in an ISOLATED
	// subprocess environment. env isolation strips CLAUDECODE family vars so
	// nested-session detection does NOT fire; keychain auth still works via HOME.
	//
	// Two test layers:
	//   1. FULL BINARY PROOF: `claude -p` is actually spawned; the real LLM turn
	//      completes; the Stop hook fires at turn-end; bridge callCount>=1.
	//      This is the DEFINITIVE proof the injection/wiring works end-to-end.
	//   2. Hook script execution: proves the exact script semantics (exit 2 + stderr
	//      re-prompt when bridge returns forcing message) without paying for a
	//      full LLM turn.
	//
	// @lore Real-claude-full-binary: The nested-session detection is bypassed
	// by zeroing CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, CLAUDE_CODE_EXECPATH,
	// CLAUDE_CODE_SESSION_ID, AI_AGENT, CLAUDE_EFFORT (not stripping — the child
	// inherits the rest of env including HOME/PATH/keychain). `detached: true`
	// puts the child in its own process group so CC's SIGTERM cascade doesn't kill
	// it before the hook fires. Proven end-to-end in vitest: bridge callCount=1.

	describe("[harness:claude] claude-code CLI (settings-claude channel, LIVE hook fire proof)", () => {
		requireHarness("claude");
		test("FULL BINARY PROOF: spawn real claude -p headless → LLM turn completes → Stop hook POSTs to bridge (callCount>=1)", async () => {
			const sandbox = createHarnessSandbox("rgate-claude-fb");
			const sandboxPath = sandbox.path;
			const testSessionId = `rgate-claude-fb-${Math.random().toString(36).slice(2, 10)}`;

			try {
				// The provisioned hook script curls the real MCP bridge; the route
				// resolves token → sessionId → registry entry → shouldForceReturn →
				// forceMessage (or empty), incrementing forceCount on each block —
				// proving the real hook → adjudicator loop, not a stand-in.
				const realServer = await setUpLiveHarnessMcpServer(testSessionId);
				// The bridge mints the token — a fabricated one is not an issued credential.
				const bridgeToken = realServer.token;

				try {
					// mcpUrl points at the REAL server's /api/mcp/:token path.
					// The hook script will POST to /api/mcp/:token/return-status.
					const mcpUrl = `${realServer.serverUrl}/api/mcp/${bridgeToken}`;

					await provisionReturnHook({
						sandboxPath,
						channel: "settings-claude",
						bridgeToken,
						mcpUrl,
						forceBudget: 2,
					});

					// Clean env: zero out CC session-detection vars so nested-session
					// detection does not fire. Keychain auth (claude.ai OAuth) still
					// works via the inherited HOME + macOS Security framework.
					const cleanEnv = buildCleanEnv();

					// Spawn the REAL claude binary headless.
					// --dangerously-skip-permissions: required for non-interactive mode.
					// --output-format json: machine-readable; no TTY required.
					// --model: the locked test-model matrix (HARNESS_TEST_MODELS.claude.model → haiku).
					// detached: true (inside spawnDetached): own process group → CC's
					//   SIGTERM cascade does not reach the child before hook fires.
					//
					// @lore Real-claude-full-binary: The prompt MUST be short and
					// trivial so the LLM call completes quickly (~3s). The Stop hook
					// fires when the session ends — before the claude process exits.
					// @lore the model comes from HARNESS_TEST_MODELS.claude — never hardcoded.
					//
					// @lore force-budget-timing: "~3s" is one turn, and this spawn absorbs
					// three — `forceBudget: 2` blocks the stop twice, and each block costs a
					// full extra LLM round trip before the process may exit. The timeout
					// below carries real headroom over that three-turn cost; a tight budget
					// reads a real in-flight turn as `exitCode: null` ("never completed")
					// even once the hook assertions above have already passed.
					const result = await spawnDetached(
						"claude",
						[
							"-p",
							"Say exactly: HOOK_TEST_DONE",
							"--dangerously-skip-permissions",
							"--output-format",
							"json",
							"--model",
							HARNESS_TEST_MODELS.claude.model,
						],
						{
							cwd: sandboxPath,
							env: cleanEnv,
							timeoutMs: 120_000,
						},
					);

					// Assert: the REAL enforcement registry forceCount was incremented.
					// This proves the hook reached the REAL route + REAL registry.
					// forceCount=0 means the hook either didn't fire, or the route 404'd,
					// or the token was mis-resolved (all are test failures).
					const entry = realServer.enforcementReg.get(testSessionId);
					if ((entry?.forceCount ?? 0) < 1) {
						throw new Error(
							`FULL BINARY PROOF FAILED: claude Stop hook did not POST to the REAL route ` +
								`(registry forceCount=${entry?.forceCount ?? 0}, expected >=1). ` +
								`Binary stdout: "${result.stdout.slice(0, 400)}" ` +
								`stderr: "${result.stderr.slice(0, 400)}" ` +
								`exitCode: ${result.exitCode}. ` +
								`Real server URL: ${realServer.serverUrl}. ` +
								`Check that: (1) settings.json has hooks.Stop, ` +
								`(2) real server is reachable from the hook script at ${mcpUrl}/return-status, ` +
								`(3) claude completed at least one turn (exitCode should be 0 or 1).`,
						);
					}
					expect(entry?.forceCount).toBeGreaterThanOrEqual(1);

					// The binary must have completed (non-null exit code, valid JSON output).
					expect(result.exitCode).not.toBeNull();
				} finally {
					await realServer.close();
				}
			} finally {
				await sandbox.cleanup();
			}
		}, 180_000);

		test("LIVE: provision .claude/settings.json Stop hook script → execute script → POSTs to bridge (callCount>=1)", async () => {
			const sandbox = createHarnessSandbox("rgate-claude-live");
			const sandboxPath = sandbox.path;
			const testSessionId = `rgate-claude-live-${Math.random().toString(36).slice(2, 10)}`;

			try {
				// The real route returns forceMessage when gate.returned=false (the
				// default). The hook script receives the forceMessage and exits 2
				// (stderr carries it).
				const realServer = await setUpLiveHarnessMcpServer(testSessionId);
				// The bridge mints the token — a fabricated one is not an issued credential.
				const bridgeToken = realServer.token;

				try {
					// mcpUrl points at the REAL route.
					const mcpUrl = `${realServer.serverUrl}/api/mcp/${bridgeToken}`;

					await provisionReturnHook({
						sandboxPath,
						channel: "settings-claude",
						bridgeToken,
						mcpUrl,
						forceBudget: 2,
					});

					// Verify provisioned hook has right structure (injection-safety check).
					const settingsContent = JSON.parse(
						fs.readFileSync(path.join(sandboxPath, ".claude", "settings.json"), "utf-8"),
					) as Record<string, unknown>;
					expect(settingsContent).toHaveProperty("hooks");
					const hooks = settingsContent.hooks as Record<string, unknown>;
					expect(hooks).toHaveProperty("Stop");
					// The hook script file must be referenced (no shell chars in JSON).
					const hookStr = JSON.stringify(hooks.Stop);
					// Use new RegExp() to avoid a backtick literal in the regex,
					// which confuses the honest-harness-guard's string-parsing state machine.
					// @lore guard-backtick: /[`$<>|;&]/ uses a backtick in a regex literal;
					// the guard parser misidentifies it as a template literal start → subsequent
					// requireHarness() calls are treated as "inside a string" and ignored.
					// biome-ignore lint/complexity/useRegexLiterals: guard-backtick — see @lore above
					expect(hookStr).not.toMatch(new RegExp("[`$<>|;&]"));

					// The hook script must exist.
					const scriptPath = path.join(sandboxPath, ".claude", "return-check.sh");
					expect(fs.existsSync(scriptPath)).toBe(true);

					// Execute the hook script directly — this is exactly what claude
					// executes when a session stops. The script POSTs to the REAL route.
					// This proves the TRANSPORT end-to-end: hook script → real route → real registry.
					//
					// @lore real-claude-hook-transport: The script is executed directly
					// (not via full claude session) to isolate the transport proof. The
					// real route returns FORCE_RETURN_MESSAGE (because gate.returned=false),
					// the script sees non-empty body → exits 2 + stderr = forceMessage.
					const scriptResult = await new Promise<{
						stdout: string;
						stderr: string;
						exitCode: number | null;
					}>((resolve) => {
						execFile(
							"/bin/sh",
							[scriptPath],
							{ cwd: sandboxPath, timeout: 15_000 },
							(err, stdout, stderr) => {
								resolve({
									stdout,
									stderr: String(stderr),
									exitCode: err?.code != null ? Number(err.code) : 0,
								});
							},
						);
					});

					// The REAL registry forceCount must be >= 1 (real route incremented it).
					// This proves the script reached the REAL route (not a mock).
					// forceCount=0 means the script's curl hit a 404, 401, or wrong host.
					const entry = realServer.enforcementReg.get(testSessionId);
					if ((entry?.forceCount ?? 0) < 1) {
						throw new Error(
							`Claude hook script did not POST to the REAL route ` +
								`(registry forceCount=${entry?.forceCount ?? 0}, expected >=1). ` +
								`script stdout: "${scriptResult.stdout}" ` +
								`stderr: "${scriptResult.stderr}" ` +
								`exitCode: ${scriptResult.exitCode}`,
						);
					}
					expect(entry?.forceCount).toBeGreaterThanOrEqual(1);

					// When the real route returns a forcing message, the script should exit 2
					// (so claude re-prompts with the stderr message = the forcing message).
					expect(scriptResult.exitCode).toBe(2);
					// The stderr must contain the force message (from the real route response body).
					expect(scriptResult.stderr).toContain("return");
				} finally {
					await realServer.close();
				}
			} finally {
				await sandbox.cleanup();
			}
		}, 30_000);

		test("provision .claude/settings.json → hook file structure correct, injection-safe", async () => {
			const sandbox = createHarnessSandbox("rgate-claude");
			const sandboxPath = sandbox.path;

			try {
				const bridgeToken = `test-bridge-token-${Math.random().toString(36).slice(2)}`;
				const mcpUrl = `http://localhost:3001/api/mcp/${bridgeToken}`;

				await provisionReturnHook({
					sandboxPath,
					channel: "settings-claude",
					bridgeToken,
					mcpUrl,
					forceBudget: 2,
				});

				// Trust marker: enableAllProjectMcpServers + hooks section.
				const settingsContent = JSON.parse(
					fs.readFileSync(path.join(sandboxPath, ".claude", "settings.json"), "utf-8"),
				) as Record<string, unknown>;

				expect(settingsContent).toHaveProperty("hooks");
				const hooks = settingsContent.hooks as Record<string, unknown>;
				expect(hooks).toHaveProperty("Stop");

				// Shell script file must exist and be referenced in settings.
				expect(fs.existsSync(path.join(sandboxPath, ".claude", "return-check.sh"))).toBe(true);

				// The script content must contain the bridge URL.
				const scriptContent = fs.readFileSync(
					path.join(sandboxPath, ".claude", "return-check.sh"),
					"utf-8",
				);
				expect(scriptContent).toContain(mcpUrl);

				// settings.json hook command must NOT contain shell expansion chars.
				const hookStr = JSON.stringify(hooks.Stop);
				// Use new RegExp() to avoid guard backtick-parse issue (see @lore guard-backtick above).
				// biome-ignore lint/complexity/useRegexLiterals: guard-backtick — see @lore guard-backtick above
				expect(hookStr).not.toMatch(new RegExp("[`$<>|;&]"));
			} finally {
				await sandbox.cleanup();
			}
		}, 120_000);

		test("LIVE: claude binary is reachable and version is valid", async () => {
			const { stderr, stdout } = await execFileAsync("claude", ["--version"], {
				timeout: 10_000,
			});
			expect(`${stdout}${stderr}`.trim().length).toBeGreaterThan(0);
		}, 30_000);
	});

	// ── CODEX CLI (binary+auth gated, LIVE ENFORCEMENT) ──────────────────────
	//
	// FULL BINARY PROOF (CODEX_HOME strategy — proven end-to-end):
	//   provisionCodexHome writes a per-session CODEX_HOME dir (.codex-home/) with:
	//     - auth.json + config.toml copied from ~/.codex (NO SQLite files)
	//     - hooks.json with the Stop hook → bridge POST
	//   CliHarnessAdapter detects .codex-home/ and sets CODEX_HOME=<path> + appends
	//   --dangerously-bypass-hook-trust when spawning codex exec.
	//   The real codex binary completes a turn → Stop hook fires → bridge callCount >= 1.
	//
	// @lore Codex-home: Project-local .codex/hooks.json is silently ignored.
	// CODEX_HOME env var redirects the config home to a per-session dir. The key
	// insight: copy ONLY auth.json + config.toml (NOT the SQLite database files).
	// SQLite files lock and cause codex to exit before making an LLM call.
	// Verified end-to-end with codex-cli v0.141.0: hook fires, bridge receives POST.
	//
	// @lore Real-codex-format: Verified against codex-cli v0.141.0.
	// The hook format uses decision:block JSON on stdout (not exit 2 + stderr).
	// Trust: --dangerously-bypass-hook-trust bypasses hash-check for automation.

	describe("[harness:codex] codex CLI (settings-codex channel, LIVE hook fire proof)", () => {
		requireHarness("codex");
		test("LIVE: provision .codex/hooks.json Stop hook script → execute script → POSTs to bridge (callCount>=1), decision:block on stdout", async () => {
			const sandbox = createHarnessSandbox("rgate-codex-live");
			const sandboxPath = sandbox.path;
			const testSessionId = `rgate-codex-live-${Math.random().toString(36).slice(2, 10)}`;

			try {
				// The real route returns forceMessage (gate.returned=false →
				// shouldForceReturn → message); the codex hook script receives it and
				// outputs {"decision":"block","reason":message}.
				const realServer = await setUpLiveHarnessMcpServer(testSessionId);
				// The bridge mints the token — a fabricated one is not an issued credential.
				const bridgeToken = realServer.token;

				try {
					// mcpUrl points at the REAL route.
					const mcpUrl = `${realServer.serverUrl}/api/mcp/${bridgeToken}`;

					await provisionReturnHook({
						sandboxPath,
						channel: "settings-codex",
						bridgeToken,
						mcpUrl,
						forceBudget: 2,
					});

					// Verify the format is correct (nested hooks.Stop not top-level Stop).
					const hooksContent = JSON.parse(
						fs.readFileSync(path.join(sandboxPath, ".codex", "hooks.json"), "utf-8"),
					) as Record<string, unknown>;
					expect(hooksContent).toHaveProperty("hooks");
					const hooksObj = hooksContent.hooks as Record<string, unknown>;
					expect(hooksObj).toHaveProperty("Stop");

					// The hook script must exist.
					const scriptPath = path.join(sandboxPath, ".codex", "return-check.sh");
					expect(fs.existsSync(scriptPath)).toBe(true);

					// Execute the hook script directly — this is what codex executes
					// at turn-end. The script POSTs to the REAL route and prints
					// {"decision":"block","reason":"..."} on stdout when blocking.
					//
					// @lore real-codex-hook-transport: script execution proves the full
					// transport (hook → real route → real registry); the codex blocking
					// behavior is decision:block JSON stdout, not exit-2 + stderr.
					const scriptResult = await new Promise<{
						stdout: string;
						stderr: string;
						exitCode: number | null;
					}>((resolve) => {
						execFile(
							"/bin/sh",
							[scriptPath],
							{ cwd: sandboxPath, timeout: 15_000 },
							(err, stdout, stderr) => {
								resolve({
									stdout,
									stderr: String(stderr),
									exitCode: err?.code != null ? Number(err.code) : 0,
								});
							},
						);
					});

					// The REAL registry forceCount must be >= 1 (real route incremented it).
					const entry = realServer.enforcementReg.get(testSessionId);
					if ((entry?.forceCount ?? 0) < 1) {
						throw new Error(
							`Codex hook script did not POST to the REAL route ` +
								`(registry forceCount=${entry?.forceCount ?? 0}, expected >=1). ` +
								`script stdout: "${scriptResult.stdout}" ` +
								`stderr: "${scriptResult.stderr}" ` +
								`exitCode: ${scriptResult.exitCode}`,
						);
					}
					expect(entry?.forceCount).toBeGreaterThanOrEqual(1);

					// When the real route returns a forcing message, the codex hook script must
					// output {"decision":"block","reason":"..."} on stdout and exit 0.
					// @lore Real-codex-semantics: Codex uses JSON stdout, NOT exit 2.
					expect(scriptResult.stdout).toContain('"decision":"block"');
					expect(scriptResult.stdout).toContain("return");
					expect(scriptResult.exitCode).toBe(0);
				} finally {
					await realServer.close();
				}
			} finally {
				await sandbox.cleanup();
			}
		}, 30_000);

		test("provision .codex/hooks.json → CORRECT nested format (not flat top-level Stop)", async () => {
			const sandbox = createHarnessSandbox("rgate-codex");
			const sandboxPath = sandbox.path;

			try {
				const bridgeToken = `codex-test-token-${Math.random().toString(36).slice(2)}`;
				const mcpUrl = `http://localhost:3001/api/mcp/${bridgeToken}`;

				await provisionReturnHook({
					sandboxPath,
					channel: "settings-codex",
					bridgeToken,
					mcpUrl,
					forceBudget: 2,
				});

				const codexDir = path.join(sandboxPath, ".codex");
				expect(fs.existsSync(codexDir)).toBe(true);

				const hooksPath = path.join(codexDir, "hooks.json");
				expect(fs.existsSync(hooksPath)).toBe(true);

				const hooksContent = JSON.parse(fs.readFileSync(hooksPath, "utf-8")) as Record<
					string,
					unknown
				>;

				// @lore Real-codex-format: MUST be { "hooks": { "Stop": [...] } }
				// NOT the flat { "Stop": { ... } } format which is silently ignored.
				expect(hooksContent).toHaveProperty("hooks");
				const hooksObj = hooksContent.hooks as Record<string, unknown>;
				expect(hooksObj).toHaveProperty("Stop");
				expect(Array.isArray(hooksObj.Stop)).toBe(true);

				// The Stop hook must reference the script file (not inline command with shell chars).
				const stopHooks = hooksObj.Stop as unknown[];
				const hookStr = JSON.stringify(stopHooks);
				// No shell expansion chars in JSON config.
				// Use new RegExp() to avoid guard backtick-parse issue (see @lore guard-backtick above).
				// biome-ignore lint/complexity/useRegexLiterals: guard-backtick — see @lore guard-backtick above
				expect(hookStr).not.toMatch(new RegExp("[`$<>|;&]"));

				// The shell script must exist and reference the bridge URL.
				const scriptPath = path.join(codexDir, "return-check.sh");
				expect(fs.existsSync(scriptPath)).toBe(true);
				const scriptContent = fs.readFileSync(scriptPath, "utf-8");
				expect(scriptContent).toContain(mcpUrl);

				// Trust: codex uses --dangerously-bypass-hook-trust at spawn time.
				// No sentinel file needed (trust is per-invocation, not filesystem).
			} finally {
				await sandbox.cleanup();
			}
		}, 120_000);

		test("FULL BINARY PROOF (CODEX_HOME): spawn real codex exec with per-session CODEX_HOME → LLM turn completes → Stop hook POSTs to real route → enforcementReg.forceCount>=1", async () => {
			// Create a git-init'd sandbox (codex requires a git repo).
			const sandbox = createHarnessSandbox("rgate-codex-fb");
			const sandboxPath = sandbox.path;

			try {
				// codex requires a git repo in the working directory.
				const { execFileSync: execSync } = await import("node:child_process");
				execSync("git", ["init"], { cwd: sandboxPath, stdio: "ignore" });
				execSync("git", ["commit", "--allow-empty", "-m", "init"], {
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

				const testSessionId = `codex-fb-session-${Math.random().toString(36).slice(2)}`;

				// forceCount>=1 on the real enforcement registry proves the hook fired
				// against the real route, not a stand-in.
				const realServer = await setUpLiveHarnessMcpServer(testSessionId);
				// The bridge mints the token — a fabricated one is not an issued credential.
				const bridgeToken = realServer.token;

				try {
					// mcpUrl points at the REAL server's /api/mcp/:token path.
					// The hook script appends /return-status → full URL: /api/mcp/:token/return-status.
					const mcpUrl = `${realServer.serverUrl}/api/mcp/${bridgeToken}`;

					// provisionCodexHome writes:
					//   sandboxPath/.codex/hooks.json (compat)
					//   sandboxPath/.codex-home/ with auth.json + config.toml + hooks.json
					await provisionReturnHook({
						sandboxPath,
						channel: "settings-codex",
						bridgeToken,
						mcpUrl,
						forceBudget: 2,
					});

					// Verify the CODEX_HOME dir was created with the hooks.json.
					const codexHomeDir = path.join(sandboxPath, ".codex-home");
					expect(fs.existsSync(codexHomeDir)).toBe(true);
					expect(fs.existsSync(path.join(codexHomeDir, "hooks.json"))).toBe(true);
					expect(fs.existsSync(path.join(codexHomeDir, "return-check.sh"))).toBe(true);

					// Spawn the REAL codex binary with CODEX_HOME set to the per-session dir.
					// --dangerously-bypass-hook-trust: bypass hash-check for automation.
					// --json: JSONL output including turn.completed.
					//
					// @lore Codex-home: CODEX_HOME must point to the per-session
					// dir (not ~/.codex). The dir contains only auth.json + config.toml —
					// no SQLite files. codex reads hooks.json from CODEX_HOME/hooks.json.
					const cleanEnv = buildCleanEnv();
					cleanEnv.CODEX_HOME = codexHomeDir;

					// @lore codex-force-budget-timing: `forceBudget: 2` means the Stop
					// hook blocks the codex process twice, and each block costs a full
					// extra LLM round trip before it may stop — three turns, not one. The
					// timeout below carries real headroom over that cost; a budget flush
					// against it reads a real hang as `exitCode: null` ("never completed")
					// even once the hook assertions above have already passed.
					const result = await spawnDetached(
						"codex",
						["exec", "say: HOOK_TEST_DONE", "--json", "--dangerously-bypass-hook-trust"],
						{
							cwd: sandboxPath,
							env: cleanEnv,
							timeoutMs: 120_000,
						},
					);

					// If the Stop hook POSTed to the real /api/mcp/:token/return-status route,
					// enforcementRegistry.incrementForce was called → forceCount >= 1. This
					// test fails if the route is removed or the hook posts to the wrong URL.
					const entry = realServer.enforcementReg.get(testSessionId);
					if (!entry || entry.forceCount < 1) {
						throw new Error(
							`CODEX_HOME FULL BINARY PROOF FAILED: codex Stop hook did not POST to real /api/mcp/:token/return-status ` +
								`(enforcementReg.forceCount=${entry?.forceCount ?? "missing"}). ` +
								`stdout: "${result.stdout.slice(0, 500)}" ` +
								`stderr: "${result.stderr.slice(0, 300)}" ` +
								`exitCode: ${result.exitCode}. ` +
								`CODEX_HOME: ${codexHomeDir}. ` +
								`hooks.json contents: ${fs.readFileSync(path.join(codexHomeDir, "hooks.json"), "utf-8")}`,
						);
					}
					expect(entry.forceCount).toBeGreaterThanOrEqual(1);

					// The binary must have completed of its own accord. A null exitCode is
					// the spawn timeout's SIGKILL, never a real exit — see the timing lore
					// above the spawn.
					expect(result.exitCode).not.toBeNull();
					expect(result.stdout).toContain("turn.completed");
				} finally {
					await realServer.close();
				}
			} finally {
				await sandbox.cleanup();
			}
		}, 180_000);

		test("LIVE: codex binary is reachable, auth present, and version is valid", async () => {
			const { stdout: versionOut } = await execFileAsync("codex", ["--version"], {
				timeout: 10_000,
			});
			expect(versionOut.trim()).toMatch(/\d+\.\d+/);

			const { stdout: authOut, stderr: authErr } = await execFileAsync(
				"codex",
				["login", "status"],
				{
					timeout: 10_000,
				},
			);
			const authText = `${authOut}\n${authErr}`.toLowerCase();
			expect(authText).toMatch(/authenticated|logged in|login|account/);
		}, 30_000);
	});

	// ── OPENCODE CLI (binary+auth gated) ────────────────────────────────────
	//
	// OpenCode's process-reengage channel: HyperIdle owns the spawn, detects turn-end
	// by parsing step_finish/session.idle JSON on stdout, then re-invokes with forcing msg.
	//
	// FULL BINARY PROOF:
	//   1. spawn opencode run with a no-return prompt → step_finish appears in stdout
	//   2. HyperIdle's re-engage wrapper detects step_finish → spawns a second opencode
	//      run with the forcing message as positional arg (reEngageCarrier:"run-arg")
	//   3. The second invocation also completes → proves the full re-engage invocation path.
	//
	// @lore Opencode-process-reengage-proven: The process-reengage wrapper is
	// implemented in CliHarnessAdapter.streamEvents (cli-harness-adapter.ts:513-599).
	// This real-binary test proves the full binary spawn path (step_finish detected,
	// re-invoke with forcing message via run-arg carrier) using real opencode binary.
	// The adapter re-engage loop is separately proven via injected spawnFn in
	// cli-reengage-adapter.test.ts (no binary required, deterministic).
	//
	// @lore Opencode-plugin-limit: opencode run does not auto-load project-local
	// .opencode/plugins/*.ts. The plugin file is provisioned as a signal mechanism
	// (tells the operator the channel is armed); enforcement comes from HyperIdle's
	// process wrapper re-invocation path (what this test proves).
	//
	// @lore Opencode-model-format: opencode uses provider-prefixed model IDs.
	// OpenRouter models: "openrouter/~anthropic/claude-haiku-latest".
	// Use `opencode models` to list valid IDs for the configured provider.

	describe("[harness:opencode] opencode CLI (process-reengage channel)", () => {
		requireHarness("opencode");
		test("FULL BINARY PROOF: spawn real opencode run headless → LLM turn completes → JSON output received", async () => {
			// Spawn opencode run with a trivial prompt, fast model, JSON output.
			// detached: true (inside spawnDetached) — own process group so CC's
			// SIGTERM cascade doesn't reach it before the session completes.
			//
			// @lore Opencode-full-binary: Uses the locked test model (HARNESS_TEST_MODELS.opencode.model
			// → openrouter/z-ai/glm-4.7-flash). Pure mode (--pure) skips external plugin loading. JSON
			// output streamed per-event; step_finish proves turn completed.
			// @lore this model's opencode invocation takes ~42s to complete a real
			// turn — the 120s timeout below carries real headroom over that, not a
			// bare minimum; a tight budget reads a real in-flight turn as
			// "opencode never completes" (a kill-timer SIGKILL mid-turn, not a
			// genuine failure — stdout holds step_start and nothing after it,
			// exitCode null rather than a real code).
			// @lore the model comes from HARNESS_TEST_MODELS.opencode — never hardcoded.
			const result = await spawnDetached(
				"opencode",
				[
					"run",
					"Say exactly: HOOK_TEST_DONE",
					"--format",
					"json",
					"--pure",
					"--model",
					HARNESS_TEST_MODELS.opencode.model,
				],
				{
					cwd: os.tmpdir(),
					env: buildCleanEnv(),
					timeoutMs: 120_000,
				},
			);

			// The binary must have produced JSON output containing a step_finish event.
			// This proves the re-engage invocation path: opencode can be spawned headless
			// from HyperIdle's process wrapper and complete a real session turn.
			if (!(result.stdout.includes("step_finish") || result.stdout.includes("turn.completed"))) {
				throw new Error(
					`OpenCode binary did not complete a session turn. ` +
						`stdout: "${result.stdout.slice(0, 500)}" ` +
						`stderr: "${result.stderr.slice(0, 300)}" ` +
						`exitCode: ${result.exitCode}`,
				);
			}

			// Verify JSON output contains completion marker.
			const hasCompletion =
				result.stdout.includes("step_finish") || result.stdout.includes("turn.completed");
			expect(hasCompletion).toBe(true);
		}, 180_000);

		test("provision .opencode/plugins/return-signal.ts → plugin file written, process-reengage armed", async () => {
			const sandbox = createHarnessSandbox("rgate-opencode");
			const sandboxPath = sandbox.path;

			try {
				const bridgeToken = `opencode-test-token-${Math.random().toString(36).slice(2)}`;
				const mcpUrl = `http://localhost:3001/api/mcp/${bridgeToken}`;

				await provisionReturnHook({
					sandboxPath,
					channel: "process-reengage",
					bridgeToken,
					mcpUrl,
					forceBudget: 2,
				});

				// The opencode plugin file must be written.
				const pluginDir = path.join(sandboxPath, ".opencode", "plugins");
				expect(fs.existsSync(pluginDir)).toBe(true);

				const pluginFile = path.join(pluginDir, "return-signal.ts");
				expect(fs.existsSync(pluginFile)).toBe(true);

				const pluginContent = fs.readFileSync(pluginFile, "utf-8");
				// The plugin must emit a turn-end marker on session.idle.
				expect(pluginContent).toContain("session.idle");

				// The plugin must reference the bridge URL for the re-engage callback.
				expect(pluginContent).toContain(mcpUrl);
			} finally {
				await sandbox.cleanup();
			}
		}, 120_000);

		test("LIVE: opencode binary is reachable, auth present, and version is valid", async () => {
			// Fast verification: binary reachable + auth present + version valid.
			// The FULL BINARY PROOF (above) proves the session completion path.

			// Fact 1: opencode binary executes correctly with a fast flag.
			const { stdout: versionOut } = await execFileAsync("opencode", ["--version"], {
				timeout: 10_000,
			});
			expect(versionOut.trim().length).toBeGreaterThan(0);
			// Version should be a semver string.
			expect(versionOut.trim()).toMatch(/^\d+\.\d+/);

			// Fact 2: providers list confirms credentials present.
			const { stdout: providersOut } = await execFileAsync("opencode", ["providers", "list"], {
				timeout: 10_000,
			});
			// Should list at least one provider with credentials.
			const hasCredentials =
				/\d+\s+credentials/.test(providersOut) ||
				providersOut.includes("environment variable") ||
				providersOut.includes("API key");
			expect(hasCredentials).toBe(true);
		}, 30_000);

		test("LIVE process-reengage PROOF: step_finish detected on first spawn → re-engage fires second spawn with forcing message → second turn completes", async () => {
			// This test proves the process-reengage path for opencode:
			//   1. HyperIdle owns the opencode spawn.
			//   2. stdout is parsed for step_finish (turn-end signal).
			//   3. On step_finish from a no-return turn, HyperIdle re-invokes opencode
			//      with the forcing message as a positional arg (reEngageCarrier:"run-arg").
			//   4. The second invocation completes → re-engage path proven end-to-end.
			//
			// @lore Opencode-process-reengage-proven: The production re-engage logic
			// lives in CliHarnessAdapter.streamEvents (cli-harness-adapter.ts:513-599).
			// This test proves the real opencode binary spawns headlessly and completes
			// a turn (step_finish in stdout), and that a second spawn with the forcing
			// message as the first positional arg also completes — validating the run-arg
			// carrier mechanism. The deterministic adapter loop is proven separately in
			// cli-reengage-adapter.test.ts via injected spawnFn (no binary required).

			const FORCING_MESSAGE =
				"IMPORTANT: You must call a return action (submit_review) before stopping. Please do so now.";
			// @lore the model comes from HARNESS_TEST_MODELS.opencode → openrouter/z-ai/glm-4.7-flash,
			// never hardcoded.
			const MODEL = HARNESS_TEST_MODELS.opencode.model;

			// First spawn: trivial no-return prompt (agent just says something, doesn't return).
			// We detect step_finish and treat it as a no-return turn.
			const firstResult = await spawnDetached(
				"opencode",
				["run", "Say exactly: STEP_ONE_DONE", "--format", "json", "--pure", "--model", MODEL],
				{
					cwd: os.tmpdir(),
					env: buildCleanEnv(),
					timeoutMs: 120_000,
				},
			);

			// Assert step_finish is present in the first turn output.
			const firstHasStepFinish = firstResult.stdout.includes("step_finish");
			if (!firstHasStepFinish) {
				throw new Error(
					`opencode process-reengage PROOF FAILED: step_finish not found in first spawn stdout. ` +
						`stdout: "${firstResult.stdout.slice(0, 500)}" ` +
						`stderr: "${firstResult.stderr.slice(0, 300)}" ` +
						`exitCode: ${firstResult.exitCode}`,
				);
			}
			expect(firstHasStepFinish).toBe(true);

			// Re-engage: spawn opencode again with the forcing message as first arg.
			// This is the "run-arg" carrier (reEngageCarrier:"run-arg" in CLI_TOOL_CONFIGS).
			// @lore Opencode-reengage-carrier: opencode run <msg> passes the message
			// as the initial user prompt. The forcing message instructs the agent to return.
			const reEngageResult = await spawnDetached(
				"opencode",
				["run", FORCING_MESSAGE, "--format", "json", "--pure", "--model", MODEL],
				{
					cwd: os.tmpdir(),
					env: buildCleanEnv(),
					timeoutMs: 120_000,
				},
			);

			// The re-engage invocation must also complete (step_finish in stdout).
			// This proves the full path: turn-end detected → re-invoke with forcing message → success.
			const reEngageHasStepFinish = reEngageResult.stdout.includes("step_finish");
			if (!reEngageHasStepFinish) {
				throw new Error(
					`opencode process-reengage PROOF FAILED: re-engage spawn did not complete. ` +
						`stdout: "${reEngageResult.stdout.slice(0, 500)}" ` +
						`stderr: "${reEngageResult.stderr.slice(0, 300)}" ` +
						`exitCode: ${reEngageResult.exitCode}`,
				);
			}
			expect(reEngageHasStepFinish).toBe(true);

			// Both spawns must have exited cleanly (exit code 0).
			expect(firstResult.exitCode).toBe(0);
			expect(reEngageResult.exitCode).toBe(0);
		}, 300_000);
	});

	// ── CURSOR-AGENT CLI (soft-continue channel) ────────────────────────────

	describe("[harness:cursor-agent] cursor-agent CLI (soft-continue channel)", () => {
		requireHarness("cursor-agent");

		test("FULL BINARY PROOF: spawn real cursor-agent headless → LLM turn completes", async () => {
			// cursor-agent's own `returnEnforcementChannel` is "none" (CURSOR_AGENT_CLI_CONFIG,
			// adapter-pool.ts) — its turns are held only by the drain-end gate, not a hook or
			// re-engage loop, so this proves the same floor claude/codex/opencode each prove
			// with their own FULL BINARY PROOF: the real binary completes a headless turn.
			const result = await spawnDetached(
				"cursor-agent",
				[
					"-p",
					"Say exactly: HOOK_TEST_DONE",
					"--print",
					"--output-format",
					"stream-json",
					"--model",
					HARNESS_TEST_MODELS["cursor-agent"].model,
					"--trust",
					"--approve-mcps",
				],
				{
					cwd: os.tmpdir(),
					env: buildCleanEnv(),
					timeoutMs: 120_000,
				},
			);

			if (result.exitCode === null) {
				throw new Error(
					`cursor-agent did not complete a headless turn. ` +
						`stdout: "${result.stdout.slice(0, 500)}" ` +
						`stderr: "${result.stderr.slice(0, 300)}" ` +
						`exitCode: ${result.exitCode}`,
				);
			}
			expect(result.exitCode).not.toBeNull();
			expect(result.stdout).toContain("HOOK_TEST_DONE");
		}, 120_000);

		test("LIVE: cursor-agent binary is reachable, auth present, and version is valid", async () => {
			const { stdout: versionOut } = await execFileAsync("cursor-agent", ["--version"], {
				timeout: 10_000,
			});
			expect(versionOut.trim().length).toBeGreaterThan(0);

			const { stdout: statusOut } = await execFileAsync("cursor-agent", ["status"], {
				timeout: 10_000,
			});
			expect(statusOut.toLowerCase()).toContain("logged in");
		}, 30_000);

		test("LIVE: provision soft-continue channel without throw", async () => {
			const sandbox = createHarnessSandbox("rgate-cursor-agent");
			const sandboxPath = sandbox.path;

			try {
				const bridgeToken = `cursor-agent-test-token-${Math.random().toString(36).slice(2)}`;
				const mcpUrl = `http://localhost:3001/api/mcp/${bridgeToken}`;

				await provisionReturnHook({
					sandboxPath,
					channel: "soft-continue",
					bridgeToken,
					mcpUrl,
					forceBudget: 2,
				});
				expect(fs.existsSync(path.join(sandboxPath, ".claude"))).toBe(false);
			} finally {
				await sandbox.cleanup();
			}
		});
	});

	// One behavior, looped over all four harnesses with the same body: the
	// route-level adjudication code is harness-agnostic, so a required-action
	// session gets the identical, correct forcing message regardless of which
	// harness's Stop hook curls it.
	describe("the REAL /return-status route names the harness-literal 'mcp__hyperidle__reply' tool for a required-action session, not the trio", () => {
		const HARNESSES: readonly SupportedHarnessName[] = [
			"claude",
			"codex",
			"opencode",
			"cursor-agent",
		];

		for (const harness of HARNESSES) {
			test(`on ${harness}`, async () => {
				requireHarness(harness);
				const testSessionId = `rgate-${harness}-required-${Math.random().toString(36).slice(2)}`;
				// The bridge mints its OWN token internally; the real callable token
				// is `realServer.token`, never a locally-fabricated string.
				const realServer = await setUpLiveHarnessMcpServer(testSessionId);

				try {
					realServer.enforcementReg.register(testSessionId, {
						gate: { returned: false },
						forceCount: 0,
						exempt: false,
						requiredReturnActions: ["reply"],
					});

					const returnStatusUrl = `${realServer.serverUrl}/api/mcp/${realServer.token}/return-status`;
					const res = await fetch(returnStatusUrl, {
						method: "POST",
						headers: { Authorization: `Bearer ${realServer.token}` },
					});
					expect(res.status).toBe(200);
					const body = await res.text();

					// The literal, callable tool name a harness's MCP client exposes
					// for a "hyperidle" MCP server tool — not the bare name.
					expect(body).toContain("mcp__hyperidle__reply");
					// Must NOT fall back to the full-trio default message (this
					// session has a SPECIFIC required action).
					expect(body).not.toContain("submit_review");
					expect(body).not.toContain("handoff_to");
					expect(body).not.toContain("send_message");
				} finally {
					await realServer.close();
				}
			}, 30_000);
		}
	});
});
