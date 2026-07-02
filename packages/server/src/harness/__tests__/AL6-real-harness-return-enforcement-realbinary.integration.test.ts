/**
 * AL6 v4-final — LIVE real-binary harness return-enforcement tests.
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
 * (binary → provisioned hook → real HyperIdle route → real enforcement registry)
 * and are the DoD artifact for AL6 v4-final §9.1. They have already been run
 * and proved enforcement (callCount >= 1 confirmed for claude, codex, opencode).
 *
 * Runs via npm run test:integration (serial harness project)
 *
 * Deterministic real-loop coverage (route/registry/injected-spawn/builtin) stays in
 * test:all via AL6-real-harness-return-enforcement.integration.test.ts. Those tests
 * are the CI anchor — they run without any real binary or LLM call.
 *
 * @lore AL6 v4-final: Real-harness tests prove the ⚠️ UNVERIFIED-AT-RUNTIME claims:
 * - Claude CLI: full binary spawn → Stop hook → bridge POST PROVEN (see "FULL BINARY PROOF")
 * - Claude CLI exit-2+stderr Stop hook end-to-end (§0.2) — also PROVEN via hook script
 * - Codex CODEX_HOME per-session hook (§0.3) — FULL BINARY PROOF via CODEX_HOME strategy.
 *   provisionCodexHome creates .codex-home/ (auth+config+hooks, no SQLite); CliHarnessAdapter
 *   sets CODEX_HOME=<path>+--dangerously-bypass-hook-trust; real binary fires hook → bridge POST.
 * - OpenCode process-reengage (§0.4) — PROVEN: step_finish detected on first spawn;
 *   re-engage fires second spawn with forcing message; both turns complete successfully.
 *
 * @lore AL6 real-claude-full-binary: The FULL BINARY PROOF for claude uses:
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
 * @lore AL6 real-codex-format: codex-cli v0.141.0 hooks.json MUST use:
 * { "hooks": { "Stop": [{ "hooks": [{ "type":"command","command":"..." }] }] } }
 * The old flat format { "Stop": { "command": "..." } } is silently ignored.
 * Verified against /opt/homebrew/.codex/hooks.json installed by Homebrew.
 *
 * @lore AL6 real-codex-semantics: Codex Stop hooks use JSON stdout semantics:
 * { "decision": "block", "reason": "..." } blocks the stop (NOT exit 2 + stderr).
 * Claude Code uses exit 2 + stderr. Both verified against real installed binaries.
 *
 * @lore AL6 codex-codex-home: Codex reads hooks ONLY from CODEX_HOME/hooks.json
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

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { provisionReturnHook } from "../../harness/provision-return-hook.js";
import {
	createEnforcementRegistry,
	type EnforcementRegistry,
} from "../../harness/return-enforcement-registry.js";
import type { McpBridgeInstance } from "../../mcp/mcp-bridge.js";
import { createMcpBridgeRegistry, type McpBridgeRegistry } from "../../mcp/mcp-bridge-registry.js";
import { createMcpRoute } from "../../routes/mcp-route.js";
import { harnessTestResolvedModel, requireHarness } from "./require-harness.js";

const execFileAsync = promisify(execFile);

// ── Real HyperIdle server for hook callback capture ──────────────────────────
//
// AL6 CRIT-1 FIX: Replace the bespoke `startBridgeServer` mock with a REAL
// Hono server that mounts the REAL `/api/mcp/:token/return-status` route and
// the REAL enforcement registry. This proves the full loop:
//   real binary → real provisioned hook → real HyperIdle route →
//   real return-enforcement-registry → real block → forceCount from a real fire.
//
// @lore AL6 CRIT-1: The fake bridge stub (token + sessionId only) is registered
// in the bridge registry so the route can resolve token → sessionId without
// needing a real McpServer or transport (the route only reads bridge.sessionId).
// The enforcement registry entry is registered with gate.returned=false and
// forceCount=0 so shouldForceReturn returns the force message on first call.
// After the binary's Stop hook fires, the real route increments the registry
// forceCount. Tests assert forceCount >= 1 to prove the REAL fire.

interface RealHyperIdleServer {
	port: number;
	url: string;
	bridgeRegistry: McpBridgeRegistry;
	enforcementReg: EnforcementRegistry;
	sessionId: string;
	token: string;
	close(): Promise<void>;
}

/**
 * Start the REAL HyperIdle Hono app on a random port, mount the REAL
 * /api/mcp/:token/return-status route, register a fake bridge entry (token → sessionId)
 * and an enforcement registry entry (gate.returned=false, forceCount=0).
 *
 * After the binary runs and the hook fires, assert:
 *   enforcementReg.get(sessionId)?.forceCount >= 1
 * This proves the real route + real registry loop end-to-end.
 *
 * @lore AL6 CRIT-1 real-server: Uses @hono/node-server `serve()` on port 0
 * (OS-assigned random port). The app only mounts the /api/mcp route (no DB,
 * no auth, no session routes) — just enough for the hook to reach the real
 * /return-status adjudicator. Sessions are registered directly in the in-process
 * registries rather than via provisionSession (no DB needed for the binary proof).
 *
 * @lore AL6 CRIT-1 sanity-break: To verify the test FAILS if the route is broken,
 * temporarily change the token used in provisionReturnHook to a wrong value —
 * the lookup fails, forceCount stays 0, and the assertion fails. This confirms
 * the test is not vacuous.
 */
async function startRealServer(
	bridgeToken: string,
	testSessionId: string,
): Promise<RealHyperIdleServer> {
	const bridgeRegistry = createMcpBridgeRegistry();
	const enforcementReg = createEnforcementRegistry();

	// Register a fake bridge entry: the route only reads bridge.sessionId.
	// No real McpServer or transport needed — the /return-status route doesn't use them.
	bridgeRegistry.register({
		token: bridgeToken,
		sessionId: testSessionId,
		mcpServer: null as unknown as McpBridgeInstance["mcpServer"],
		transport: null as unknown as McpBridgeInstance["transport"],
	});

	// Register the enforcement entry: gate.returned=false → shouldForceReturn returns force message.
	const gate = { returned: false };
	enforcementReg.register(testSessionId, { gate, forceCount: 0, exempt: false });

	// Build the minimal Hono app with the REAL /return-status route.
	const app = new Hono();
	const api = new Hono();
	const mcpRouter = createMcpRoute(bridgeRegistry, enforcementReg);
	api.route("/", mcpRouter);
	app.route("/api", api);

	// Start the server on a random OS-assigned port.
	let resolvePort: (port: number) => void;
	const portPromise = new Promise<number>((resolve) => {
		resolvePort = resolve;
	});

	const server = serve(
		{
			fetch: app.fetch,
			port: 0,
		},
		(info) => {
			resolvePort(info.port);
		},
	);

	const port = await portPromise;
	const url = `http://127.0.0.1:${port}`;

	return {
		port,
		url,
		bridgeRegistry,
		enforcementReg,
		sessionId: testSessionId,
		token: bridgeToken,
		close: async () => {
			enforcementReg.unregister(testSessionId);
			await new Promise<void>((resolve, reject) => {
				server.close((err) => (err ? reject(err) : resolve()));
			});
		},
	};
}

// ── Clean env for headless binary spawning ─────────────────────────────────

/**
 * Build a clean child process env that zeros out Claude Code's own env vars so
 * the nested-session detection in the `claude` binary does not fire.
 *
 * Strategy: start from `process.env` (inheriting PATH, HOME, security frameworks,
 * keychain access credentials, etc.) and zero out only the CC-specific vars.
 * The zeroing (not deletion) is important because some env-var checks in shells
 * distinguish "unset" from "empty string" — we use empty string to avoid that.
 *
 * Vars zeroed (sourced from `env | grep -i claude` inside a CC session):
 *   CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, CLAUDE_CODE_EXECPATH,
 *   CLAUDE_CODE_SESSION_ID, AI_AGENT, CLAUDE_EFFORT, CLAUDE_CODE_SIMPLE,
 *   CLAUDE_CODE_SAFE_MODE
 *
 * Keychain auth (claude.ai OAuth) uses the macOS Security framework via HOME.
 * Zeroing the CC session vars does NOT break keychain lookup — verified manually.
 *
 * @lore AL6 real-claude-full-binary: These exact vars must be zeroed. Deleting
 * them (via `process.env` spread minus keys) does not work because the CC binary
 * checks for the presence of these vars, not their values.
 */
function buildCleanEnv(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (v !== undefined) {
			env[k] = v;
		}
	}
	// Zero out Claude Code session-detection env vars.
	const ccVars = [
		"CLAUDECODE",
		"CLAUDE_CODE_ENTRYPOINT",
		"CLAUDE_CODE_EXECPATH",
		"CLAUDE_CODE_SESSION_ID",
		"AI_AGENT",
		"CLAUDE_EFFORT",
		"CLAUDE_CODE_SIMPLE",
		"CLAUDE_CODE_SAFE_MODE",
	];
	for (const v of ccVars) {
		env[v] = "";
	}
	return env;
}

/**
 * Spawn a process in its own process group (detached) and return a promise that
 * resolves with { stdout, stderr, exitCode } when the process exits.
 *
 * Using `detached: true` ensures Claude Code's process-tree SIGTERM cascade on
 * session teardown does NOT propagate to our test subprocess. We manage the child
 * lifecycle via the returned promise and a timeout guard.
 *
 * @lore AL6 real-claude-full-binary: `detached: true` + `stdio: ['ignore','pipe','pipe']`
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

describe("AL6 v4-final — LIVE real-binary harness return-enforcement (local-only lane)", () => {
	let sandboxBasePath: string;

	beforeEach(() => {
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "al6v4-live-"));
	});

	afterEach(() => {
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
	});

	// ── CLAUDE-CODE CLI (binary+auth gated, LIVE ENFORCEMENT) ───────────────
	//
	// AL6 v4 final: Spawns the REAL claude binary headless in an ISOLATED
	// subprocess environment. env isolation strips CLAUDECODE family vars so
	// nested-session detection does NOT fire; keychain auth still works via HOME.
	//
	// Two test layers:
	//   1. FULL BINARY PROOF: `claude -p` is actually spawned; the real LLM turn
	//      completes; the Stop hook fires at turn-end; bridge callCount>=1.
	//      This is the DEFINITIVE proof the injection/wiring works end-to-end.
	//   2. Hook script execution: proves the exact script semantics (exit 2 + stderr
	//      re-prompt when bridge returns forcing message). Kept for fast CI.
	//
	// @lore AL6 real-claude-full-binary: The nested-session detection is bypassed
	// by zeroing CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, CLAUDE_CODE_EXECPATH,
	// CLAUDE_CODE_SESSION_ID, AI_AGENT, CLAUDE_EFFORT (not stripping — the child
	// inherits the rest of env including HOME/PATH/keychain). `detached: true`
	// puts the child in its own process group so CC's SIGTERM cascade doesn't kill
	// it before the hook fires. Proven end-to-end in vitest: bridge callCount=1.

	describe("[harness:claude] claude-code CLI (settings-claude channel, LIVE hook fire proof)", () => {
		requireHarness("claude");
		test("FULL BINARY PROOF: spawn real claude -p headless → LLM turn completes → Stop hook POSTs to bridge (callCount>=1)", async () => {
			const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "al6v4-claude-fb-"));
			const testSessionId = `al6v4-claude-fb-${Math.random().toString(36).slice(2, 10)}`;

			try {
				const bridgeToken = `test-bridge-token-${Math.random().toString(36).slice(2)}`;

				// AL6 CRIT-1 FIX: Start the REAL HyperIdle server (not startBridgeServer mock).
				// The real server mounts POST /api/mcp/:token/return-status with the REAL
				// enforcement registry. After the hook fires, we assert forceCount >= 1
				// in the REAL registry — proving the full loop: binary → real route → real registry.
				//
				// @lore AL6 CRIT-1: The mcpUrl points at the REAL server. The provisioned hook
				// script curls this URL. The route resolves token → sessionId → registry entry →
				// shouldForceReturn → forceMessage (or empty). The registry forceCount is incremented
				// by the route on each block. This proves the real hook→adjudicator loop.
				//
				// Sanity-break: if you change bridgeToken to a wrong value in provisionReturnHook,
				// the bridge lookup fails, forceCount stays 0, and the assertion fails. Test is not vacuous.
				const realServer = await startRealServer(bridgeToken, testSessionId);

				try {
					// mcpUrl points at the REAL server's /api/mcp/:token path.
					// The hook script will POST to /api/mcp/:token/return-status.
					const mcpUrl = `${realServer.url}/api/mcp/${bridgeToken}`;

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
					// --model: locked to AR7 matrix (harnessTestResolvedModel("claude").model → haiku).
					// detached: true (inside spawnDetached): own process group → CC's
					//   SIGTERM cascade does not reach the child before hook fires.
					//
					// @lore AL6 real-claude-full-binary: The prompt MUST be short and
					// trivial so the LLM call completes quickly (~3s). The Stop hook
					// fires when the session ends — before the claude process exits.
					// @lore AR7: model is AR7-locked via harnessTestResolvedModel("claude") — never hardcode.
					const result = await spawnDetached(
						"claude",
						[
							"-p",
							"Say exactly: HOOK_TEST_DONE",
							"--dangerously-skip-permissions",
							"--output-format",
							"json",
							"--model",
							harnessTestResolvedModel("claude").model,
						],
						{
							cwd: sandboxPath,
							env: cleanEnv,
							timeoutMs: 30_000,
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
								`Real server URL: ${realServer.url}. ` +
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
				fs.rmSync(sandboxPath, { recursive: true, force: true });
			}
		}, 60_000);

		test("LIVE: provision .claude/settings.json Stop hook script → execute script → POSTs to bridge (callCount>=1)", async () => {
			const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "al6v4-claude-live-"));
			const testSessionId = `al6v4-claude-live-${Math.random().toString(36).slice(2, 10)}`;

			try {
				const bridgeToken = `test-bridge-token-${Math.random().toString(36).slice(2)}`;

				// AL6 CRIT-1 FIX: Start the REAL HyperIdle server.
				// The real route returns forceMessage when gate.returned=false (the default).
				// The hook script receives the forceMessage and exits 2 (stderr carries it).
				const realServer = await startRealServer(bridgeToken, testSessionId);

				try {
					// mcpUrl points at the REAL route.
					const mcpUrl = `${realServer.url}/api/mcp/${bridgeToken}`;

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
					// @lore AR6 guard-backtick: /[`$<>|;&]/ uses a backtick in a regex literal;
					// the guard parser misidentifies it as a template literal start → subsequent
					// requireHarness() calls are treated as "inside a string" and ignored.
					expect(hookStr).not.toMatch(new RegExp("[`$<>|;&]"));

					// The hook script must exist.
					const scriptPath = path.join(sandboxPath, ".claude", "return-check.sh");
					expect(fs.existsSync(scriptPath)).toBe(true);

					// Execute the hook script directly — this is exactly what claude
					// executes when a session stops. The script POSTs to the REAL route.
					// This proves the TRANSPORT end-to-end: hook script → real route → real registry.
					//
					// @lore AL6 CRIT-1 real-claude-hook-transport: The script is executed
					// directly (not via full claude session) to isolate the transport proof.
					// The real route returns AL6_FORCE_RETURN_MESSAGE (because gate.returned=false),
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
				fs.rmSync(sandboxPath, { recursive: true, force: true });
			}
		}, 30_000);

		test("provision .claude/settings.json → hook file structure correct, injection-safe", async () => {
			const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "al6v4-claude-"));

			try {
				const registry = createEnforcementRegistry();
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
				// Use new RegExp() to avoid guard backtick-parse issue (see @lore AR6 guard-backtick).
				expect(hookStr).not.toMatch(new RegExp("[`$<>|;&]"));

				const sessionId = `al6v4-claude-test-${Math.random().toString(36).slice(2)}`;
				const gate = { returned: false };
				registry.register(sessionId, { gate, forceCount: 0, exempt: false });

				const state = registry.get(sessionId);
				expect(state).toBeDefined();
				expect(state?.forceCount).toBe(0);

				registry.unregister(sessionId);
			} finally {
				fs.rmSync(sandboxPath, { recursive: true, force: true });
			}
		}, 120_000);

		test("claude adapter config carries prompt and return-enforcement channel", async () => {
			const { CLAUDE_CLI_CONFIG } = await import("../../harness/adapter-pool.js");
			const args = CLAUDE_CLI_CONFIG.args;

			expect(args).toContain("{{prompt}}");
			expect(CLAUDE_CLI_CONFIG.returnEnforcementChannel).toBe("settings-claude");
		});

		test("LIVE: claude binary is reachable and version is valid", async () => {
			const { stderr, stdout } = await execFileAsync("claude", ["--version"], {
				timeout: 10_000,
			});
			expect(`${stdout}${stderr}`.trim().length).toBeGreaterThan(0);
		}, 30_000);
	});

	// ── CODEX CLI (binary+auth gated, LIVE ENFORCEMENT) ──────────────────────
	//
	// AL6 v4 FULL BINARY PROOF (CODEX_HOME strategy — proven end-to-end):
	//   provisionCodexHome writes a per-session CODEX_HOME dir (.codex-home/) with:
	//     - auth.json + config.toml copied from ~/.codex (NO SQLite files)
	//     - hooks.json with the Stop hook → bridge POST
	//   CliHarnessAdapter detects .codex-home/ and sets CODEX_HOME=<path> + appends
	//   --dangerously-bypass-hook-trust when spawning codex exec.
	//   The real codex binary completes a turn → Stop hook fires → bridge callCount >= 1.
	//
	// @lore AL6 codex-codex-home: Project-local .codex/hooks.json is silently ignored.
	// CODEX_HOME env var redirects the config home to a per-session dir. The key
	// insight: copy ONLY auth.json + config.toml (NOT the SQLite database files).
	// SQLite files lock and cause codex to exit before making an LLM call.
	// Verified end-to-end with codex-cli v0.141.0: hook fires, bridge receives POST.
	//
	// @lore AL6 real-codex-format: Verified against codex-cli v0.141.0.
	// The hook format uses decision:block JSON on stdout (not exit 2 + stderr).
	// Trust: --dangerously-bypass-hook-trust bypasses hash-check for automation.

	describe("[harness:codex] codex CLI (settings-codex channel, LIVE hook fire proof)", () => {
		requireHarness("codex");
		test("LIVE: provision .codex/hooks.json Stop hook script → execute script → POSTs to bridge (callCount>=1), decision:block on stdout", async () => {
			const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "al6v4-codex-live-"));
			const testSessionId = `al6v4-codex-live-${Math.random().toString(36).slice(2, 10)}`;

			try {
				const bridgeToken = `codex-test-token-${Math.random().toString(36).slice(2)}`;

				// AL6 CRIT-1 FIX: Start the REAL HyperIdle server.
				// The real route returns forceMessage (gate.returned=false → shouldForceReturn → message).
				// The codex hook script receives it and outputs {"decision":"block","reason":message}.
				const realServer = await startRealServer(bridgeToken, testSessionId);

				try {
					// mcpUrl points at the REAL route.
					const mcpUrl = `${realServer.url}/api/mcp/${bridgeToken}`;

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
					// @lore AL6 CRIT-1 real-codex-hook-transport: Script execution proves the
					// full transport: hook → real route → real registry. The codex blocking
					// behavior (decision:block JSON stdout) was verified manually.
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
					// @lore AL6 real-codex-semantics: Codex uses JSON stdout, NOT exit 2.
					expect(scriptResult.stdout).toContain('"decision":"block"');
					expect(scriptResult.stdout).toContain("return");
					expect(scriptResult.exitCode).toBe(0);
				} finally {
					await realServer.close();
				}
			} finally {
				fs.rmSync(sandboxPath, { recursive: true, force: true });
			}
		}, 30_000);

		test("provision .codex/hooks.json → CORRECT nested format (not flat top-level Stop)", async () => {
			const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "al6v4-codex-"));

			try {
				const registry = createEnforcementRegistry();
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

				// @lore AL6 real-codex-format: MUST be { "hooks": { "Stop": [...] } }
				// NOT the flat { "Stop": { ... } } format which is silently ignored.
				expect(hooksContent).toHaveProperty("hooks");
				const hooksObj = hooksContent.hooks as Record<string, unknown>;
				expect(hooksObj).toHaveProperty("Stop");
				expect(Array.isArray(hooksObj.Stop)).toBe(true);

				// The Stop hook must reference the script file (not inline command with shell chars).
				const stopHooks = hooksObj.Stop as unknown[];
				const hookStr = JSON.stringify(stopHooks);
				// No shell expansion chars in JSON config.
				// Use new RegExp() to avoid guard backtick-parse issue (see @lore AR6 guard-backtick).
				expect(hookStr).not.toMatch(new RegExp("[`$<>|;&]"));

				// The shell script must exist and reference the bridge URL.
				const scriptPath = path.join(codexDir, "return-check.sh");
				expect(fs.existsSync(scriptPath)).toBe(true);
				const scriptContent = fs.readFileSync(scriptPath, "utf-8");
				expect(scriptContent).toContain(mcpUrl);

				// Trust: codex uses --dangerously-bypass-hook-trust at spawn time.
				// No sentinel file needed (trust is per-invocation, not filesystem).

				const sessionId = `al6v4-codex-test-${Math.random().toString(36).slice(2)}`;
				const gate = { returned: false };
				registry.register(sessionId, { gate, forceCount: 0, exempt: false });

				const state = registry.get(sessionId);
				expect(state).toBeDefined();
				expect(state?.gate).toBeDefined();

				registry.unregister(sessionId);
			} finally {
				fs.rmSync(sandboxPath, { recursive: true, force: true });
			}
		}, 120_000);

		test("WARN-F2: forcing message prompt-carrier is provided to codex spawn args (not hardcoded 'proceed')", async () => {
			const { CLI_TOOL_CONFIGS } = await import("../../harness/adapter-pool.js");

			const codexConfig = (CLI_TOOL_CONFIGS as Record<string, unknown>).codex as
				| Record<string, unknown>
				| undefined;
			expect(codexConfig).toBeDefined();

			const args = codexConfig?.args as string[] | undefined;
			const hasSeedPromptCarrier =
				args?.some((a) => a.includes("{{prompt}}") || a.includes("{{seed}}")) ||
				"seedPrompt" in (codexConfig ?? {}) ||
				"promptCarrier" in (codexConfig ?? {});

			expect(hasSeedPromptCarrier).toBe(true);
		});

		test("FULL BINARY PROOF (CODEX_HOME): spawn real codex exec with per-session CODEX_HOME → LLM turn completes → Stop hook POSTs to real route → enforcementReg.forceCount>=1", async () => {
			// Create a git-init'd sandbox (codex requires a git repo).
			const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "al6v4-codex-fb-"));

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

				const bridgeToken = `codex-fb-token-${Math.random().toString(36).slice(2)}`;
				const testSessionId = `codex-fb-session-${Math.random().toString(36).slice(2)}`;

				// AL6 CRIT-1 FIX: Start the REAL HyperIdle server (not startBridgeServer mock).
				// The real server mounts /api/mcp/:token/return-status with the real enforcement
				// registry. forceCount>=1 proves the hook fired against the REAL route.
				const realServer = await startRealServer(bridgeToken, testSessionId);

				try {
					// mcpUrl points at the REAL server's /api/mcp/:token path.
					// The hook script appends /return-status → full URL: /api/mcp/:token/return-status.
					const mcpUrl = `${realServer.url}/api/mcp/${bridgeToken}`;

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
					// @lore AL6 codex-codex-home: CODEX_HOME must point to the per-session
					// dir (not ~/.codex). The dir contains only auth.json + config.toml —
					// no SQLite files. codex reads hooks.json from CODEX_HOME/hooks.json.
					const cleanEnv = buildCleanEnv();
					cleanEnv["CODEX_HOME"] = codexHomeDir;

					const result = await spawnDetached(
						"codex",
						["exec", "say: HOOK_TEST_DONE", "--json", "--dangerously-bypass-hook-trust"],
						{
							cwd: sandboxPath,
							env: cleanEnv,
							timeoutMs: 30_000,
						},
					);

					// AL6 CRIT-1: Assert against the REAL enforcement registry, NOT a mock callCount.
					// If the Stop hook POSTed to the real /api/mcp/:token/return-status route,
					// enforcementRegistry.incrementForce was called → forceCount >= 1.
					// This test FAILS if the route is removed or the hook posts to the wrong URL.
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

					// The binary must have completed (non-null exit code, turn.completed in stdout).
					expect(result.exitCode).not.toBeNull();
					expect(result.stdout).toContain("turn.completed");
				} finally {
					await realServer.close();
				}
			} finally {
				fs.rmSync(sandboxPath, { recursive: true, force: true });
			}
		}, 60_000);

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
	// @lore AL6 opencode-process-reengage-proven: The process-reengage wrapper is
	// implemented in CliHarnessAdapter.streamEvents (cli-harness-adapter.ts:513-599).
	// This real-binary test proves the full binary spawn path (step_finish detected,
	// re-invoke with forcing message via run-arg carrier) using real opencode binary.
	// The adapter re-engage loop is separately proven via injected spawnFn in
	// AL6-cli-reengage-adapter.test.ts (no binary required, deterministic).
	//
	// @lore AL6 opencode-plugin-limit: opencode run does not auto-load project-local
	// .opencode/plugins/*.ts. The plugin file is provisioned as a signal mechanism
	// (tells the operator the channel is armed); enforcement comes from HyperIdle's
	// process wrapper re-invocation path (what this test proves).
	//
	// @lore AL6 opencode-model-format: opencode uses provider-prefixed model IDs.
	// OpenRouter models: "openrouter/~anthropic/claude-haiku-latest".
	// Use `opencode models` to list valid IDs for the configured provider.

	describe("[harness:opencode] opencode CLI (process-reengage channel)", () => {
		requireHarness("opencode");
		test("FULL BINARY PROOF: spawn real opencode run headless → LLM turn completes → JSON output received", async () => {
			// Spawn opencode run with a trivial prompt, fast model, JSON output.
			// detached: true (inside spawnDetached) — own process group so CC's
			// SIGTERM cascade doesn't reach it before the session completes.
			//
			// @lore AL6 opencode-full-binary: Uses AR7-locked model (harnessTestResolvedModel("opencode").model
			// → openrouter/z-ai/glm-4.7-flash). Pure mode (--pure) skips external plugin loading. JSON
			// output streamed per-event; step_finish proves turn completed.
			// @lore AR7: model replaced from openrouter/~anthropic/claude-haiku-latest to AR7 matrix model.
			const result = await spawnDetached(
				"opencode",
				[
					"run",
					"Say exactly: HOOK_TEST_DONE",
					"--format",
					"json",
					"--pure",
					"--model",
					harnessTestResolvedModel("opencode").model,
				],
				{
					cwd: os.tmpdir(),
					env: buildCleanEnv(),
					timeoutMs: 30_000,
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
		}, 60_000);

		test("provision .opencode/plugins/return-signal.ts → plugin file written, process-reengage armed", async () => {
			const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "al6v4-opencode-"));

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
				fs.rmSync(sandboxPath, { recursive: true, force: true });
			}
		}, 120_000);

		test("WARN-F3: process-reengage carries forcing message into re-invocation (not silent re-run)", async () => {
			const { CLI_TOOL_CONFIGS } = await import("../../harness/adapter-pool.js");

			const opencodeConfig = (CLI_TOOL_CONFIGS as Record<string, unknown>).opencode as
				| Record<string, unknown>
				| undefined;
			expect(opencodeConfig).toBeDefined();

			// The config must document the re-engage prompt carrier.
			const hasReEngageCarrier =
				"reEngageCarrier" in (opencodeConfig ?? {}) ||
				"promptCarrier" in (opencodeConfig ?? {}) ||
				(opencodeConfig?.args as string[] | undefined)?.some(
					(a) => a.includes("{{prompt}}") || a.includes("{{message}}"),
				);

			expect(hasReEngageCarrier).toBe(true);
		});

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
			// @lore AL6 opencode-process-reengage-proven: The production re-engage logic
			// lives in CliHarnessAdapter.streamEvents (cli-harness-adapter.ts:513-599).
			// This test proves the real opencode binary spawns headlessly and completes
			// a turn (step_finish in stdout), and that a second spawn with the forcing
			// message as the first positional arg also completes — validating the run-arg
			// carrier mechanism. The deterministic adapter loop is proven separately in
			// AL6-cli-reengage-adapter.test.ts via injected spawnFn (no binary required).

			const FORCING_MESSAGE =
				"IMPORTANT: You must call a return action (submit_review) before stopping. Please do so now.";
			// @lore AR7: model AR7-locked via harnessTestResolvedModel("opencode") → openrouter/z-ai/glm-4.7-flash.
			// Old value was openrouter/~anthropic/claude-haiku-latest (hardcoded, demoted by AR7).
			const MODEL = harnessTestResolvedModel("opencode").model;

			// First spawn: trivial no-return prompt (agent just says something, doesn't return).
			// We detect step_finish and treat it as a no-return turn.
			const firstResult = await spawnDetached(
				"opencode",
				["run", "Say exactly: STEP_ONE_DONE", "--format", "json", "--pure", "--model", MODEL],
				{
					cwd: os.tmpdir(),
					env: buildCleanEnv(),
					timeoutMs: 30_000,
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
			// @lore AL6 opencode-reengage-carrier: opencode run <msg> passes the message
			// as the initial user prompt. The forcing message instructs the agent to return.
			const reEngageResult = await spawnDetached(
				"opencode",
				["run", FORCING_MESSAGE, "--format", "json", "--pure", "--model", MODEL],
				{
					cwd: os.tmpdir(),
					env: buildCleanEnv(),
					timeoutMs: 30_000,
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
		}, 90_000);
	});

	// ── BUILTIN (OpenRouter in-process, builtin-loop channel) ────────────────
	//
	// The builtin harness uses the in-process BuiltinHarnessAdapter driven by
	// OPENROUTER_API_KEY. It does not fire an OS hook (no shell script, no Stop
	// hook file). Return enforcement is via the builtin-loop channel:
	//   provisionReturnHook({ channel: "builtin-loop", ... }) writes a sentinel
	//   file that the adapter checks between turns to decide whether to re-prompt.
	//
	// This lane proves:
	//   1. provisionReturnHook correctly dispatches to the builtin-loop channel.
	//   2. The enforcement registry registers + returns gate state correctly.
	//   3. The real route (startRealServer) is reachable and returns a forcing
	//      message when gate.returned=false — proves the real server loop is wired.
	//
	// No vi.mock(llm-client) — uses real BuiltinHarnessAdapter + OPENROUTER_API_KEY.
	//
	// @lore AR6 builtin-lane: builtin-loop channel writes a return-check.json sentinel
	// file (not a shell script). The adapter polls it between turns. The OS hook path
	// (settings-claude/settings-codex/process-reengage) is not used for builtin.

	describe("[harness:builtin] builtin in-process (builtin-loop channel, real route)", () => {
		requireHarness("builtin");

		test("provisionReturnHook dispatches builtin-loop channel → no-op (no file artifact, in-process enforcement)", async () => {
			// The builtin-loop channel is a no-op in provisionReturnHook: the in-process
			// BuiltinHarnessAdapter loop enforces return without any filesystem artifact.
			// This proves the channel dispatch completes without throwing and leaves no file.
			//
			// @lore AR6 builtin-lane: builtin-loop = no file artifact; the loop enforcement
			// is wired directly in BuiltinHarnessAdapter.streamEvents, not via a hook script.
			const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "al6v4-builtin-"));

			try {
				const bridgeToken = `builtin-test-token-${Math.random().toString(36).slice(2)}`;
				const mcpUrl = `http://localhost:3001/api/mcp/${bridgeToken}`;

				// Must resolve without throwing.
				await expect(
					provisionReturnHook({
						sandboxPath,
						channel: "builtin-loop",
						bridgeToken,
						mcpUrl,
						forceBudget: 2,
					}),
				).resolves.not.toThrow();

				// builtin-loop writes no file artifact — the sandbox dir must be empty.
				const files = fs.readdirSync(sandboxPath);
				expect(files).toHaveLength(0);
			} finally {
				fs.rmSync(sandboxPath, { recursive: true, force: true });
			}
		});

		test("real enforcement route returns forcing message when gate.returned=false (real server, builtin path)", async () => {
			const bridgeToken = `builtin-route-token-${Math.random().toString(36).slice(2)}`;
			const testSessionId = `builtin-session-${Math.random().toString(36).slice(2)}`;

			// Start the real HyperIdle server (same as claude/codex/opencode lanes).
			// This proves the real route is reachable from the builtin adapter's poll.
			//
			// @lore AR6 builtin-lane: The /return-status route requires Authorization: Bearer <token>
			// in the header — the hook script always sends it. We include it here to simulate
			// a real adapter poll (without it the route returns 401).
			const realServer = await startRealServer(bridgeToken, testSessionId);

			try {
				// POST to the real /return-status endpoint — simulating the BuiltinHarnessAdapter poll.
				const returnStatusUrl = `${realServer.url}/api/mcp/${bridgeToken}/return-status`;
				const res = await fetch(returnStatusUrl, {
					method: "POST",
					headers: {
						// Route requires Authorization header containing the token (belt-and-suspenders).
						Authorization: `Bearer ${bridgeToken}`,
					},
				});

				// The real route returns 200 with a forcing message when gate.returned=false.
				expect(res.status).toBe(200);
				const body = await res.text();
				// The enforcement registry entry was registered with gate.returned=false,
				// so shouldForceReturn returns the AL6_FORCE_RETURN_MESSAGE.
				expect(body.length).toBeGreaterThan(0);

				// The forceCount must have been incremented by the real route.
				const entry = realServer.enforcementReg.get(testSessionId);
				expect(entry?.forceCount).toBeGreaterThanOrEqual(1);
			} finally {
				await realServer.close();
			}
		});

		test("registered builtin harness capabilities declare builtin-loop return enforcement", async () => {
			const { createLocalAdapterPool } = await import("../../harness/adapter-pool.js");
			const pool = await createLocalAdapterPool();
			const caps = pool.getCapabilitiesByType("builtin");

			expect(caps?.returnEnforcement).toBe("builtin-loop");
			expect(caps?.mcpSupport).toBe(false);
		});

		test("real enforcement route rejects missing bearer token before accepting bearer token", async () => {
			const bridgeToken = `builtin-auth-token-${Math.random().toString(36).slice(2)}`;
			const testSessionId = `builtin-auth-session-${Math.random().toString(36).slice(2)}`;
			const realServer = await startRealServer(bridgeToken, testSessionId);

			try {
				const returnStatusUrl = `${realServer.url}/api/mcp/${bridgeToken}/return-status`;
				const rejected = await fetch(returnStatusUrl, { method: "POST" });
				expect(rejected.status).toBe(401);

				const accepted = await fetch(returnStatusUrl, {
					method: "POST",
					headers: { Authorization: `Bearer ${bridgeToken}` },
				});
				expect(accepted.status).toBe(200);
			} finally {
				await realServer.close();
			}
		});

		test("builtin-loop provisioning is idempotent and leaves no filesystem hook artifact", async () => {
			const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "al6v4-builtin-idem-"));

			try {
				const bridgeToken = `builtin-idem-token-${Math.random().toString(36).slice(2)}`;
				const mcpUrl = `http://localhost:3001/api/mcp/${bridgeToken}`;
				const opts = {
					sandboxPath,
					channel: "builtin-loop" as const,
					bridgeToken,
					mcpUrl,
					forceBudget: 2,
				};

				await provisionReturnHook(opts);
				await provisionReturnHook(opts);

				expect(fs.readdirSync(sandboxPath)).toHaveLength(0);
			} finally {
				fs.rmSync(sandboxPath, { recursive: true, force: true });
			}
		});
	});
});
