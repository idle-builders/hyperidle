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
 * @lore: zeroing (not removing) claude's session-detection env vars lets the process inherit HOME/PATH so keychain auth still works.
 * @lore: codex-cli hooks.json must use the nested `{ hooks: { Stop: [{ hooks: [...] }] } }` shape — the old flat format is silently ignored.
 * @lore: codex Stop hooks use JSON stdout `{ decision: "block" }`; claude uses exit 2 + stderr.
 * @lore: CODEX_HOME/hooks.json only — the per-session dir must carry only auth.json + config.toml + hooks.json (no SQLite).
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
 * @lore: `detached: true` + piped stdio is the correct posture for spawning a harness binary from vitest — its own process group, ref/unref to avoid hanging.
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

					// the guard parser misidentifies it as a template literal start → subsequent
					// requireHarness() calls are treated as "inside a string" and ignored.
					// biome-ignore lint/complexity/useRegexLiterals: backtick literal confuses harness guard string-parser
					expect(hookStr).not.toMatch(new RegExp("[`$<>|;&]"));

					// The hook script must exist.
					const scriptPath = path.join(sandboxPath, ".claude", "return-check.sh");
					expect(fs.existsSync(scriptPath)).toBe(true);

					// Execute the hook script directly — this is exactly what claude
					// executes when a session stops. The script POSTs to the REAL route.
					// This proves the TRANSPORT end-to-end: hook script → real route → real registry.
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
				// Use new RegExp() to avoid backtick literal in regex (confuses harness guard string-parser).
				// biome-ignore lint/complexity/useRegexLiterals: backtick literal confuses harness guard string-parser
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
	//

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

				expect(hooksContent).toHaveProperty("hooks");
				const hooksObj = hooksContent.hooks as Record<string, unknown>;
				expect(hooksObj).toHaveProperty("Stop");
				expect(Array.isArray(hooksObj.Stop)).toBe(true);

				// The Stop hook must reference the script file (not inline command with shell chars).
				const stopHooks = hooksObj.Stop as unknown[];
				const hookStr = JSON.stringify(stopHooks);
				// No shell expansion chars in JSON config.
				// Use new RegExp() to avoid backtick literal in regex (confuses harness guard string-parser).
				// biome-ignore lint/complexity/useRegexLiterals: backtick literal confuses harness guard string-parser
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
					const cleanEnv = buildCleanEnv();
					cleanEnv.CODEX_HOME = codexHomeDir;

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
	// OpenCode's process-reengage channel: used by remote-harness-adapter.ts.
	// The local production path uses OpenCodeServeAdapter (opencode serve --port 0);
	// these tests cover the channel provisioning and binary sanity only.
	//
	// @lore: opencode run does not auto-load project-local .opencode/plugins/*.ts — enforcement is HyperIdle's own process-wrapper re-invocation.

	describe("[harness:opencode] opencode CLI (process-reengage channel)", () => {
		requireHarness("opencode");

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
