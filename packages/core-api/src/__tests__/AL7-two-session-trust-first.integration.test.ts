/**
 * AL7 — LIVE real-binary trust-first two-session loop (local-only lane).
 *
 * ⚠️  LOCAL-ONLY LANE — NOT IN CI / NOT IN test:all / NOT IN test:integration
 *
 * Proves the AL7 trust-first two-session loop against the REAL installed Claude
 * Code CLI binary end-to-end:
 *
 *   Session 1 (open-work):
 *     - Spawn the real `claude` binary pointed at a local HyperIdle MCP server
 *       that exposes `commit_file` with an in-memory capturing router.
 *     - The agent calls `commit_file` → routes through MCP bridge → capturing router
 *       intercepts it as a Proposed Call (AWAITING_REVIEW).
 *     - Assert: capturedCallCount >= 1 (REAL binary called the tool via MCP).
 *
 *   Approve (in-process):
 *     - Mark the captured call as approved → grant the call in-memory.
 *
 *   Session 2 (grant-bearing):
 *     - Re-provision the MCP server with the grant-bearing router (approved call runs).
 *     - Spawn the real `claude` binary again.
 *     - The agent calls `commit_file` → grant consumed → real file written to disk.
 *     - Assert: file exists on disk (REAL binary executed the approved op).
 *     - Assert: work continues — agent emits another tool call or text after the op.
 *
 * Per project rule: "e2e/expensive/live-LLM tests run locally only; never a GitHub
 * Actions job." Runs via npm run test:integration (serial harness project)
 *
 * @lore AL7 real-harness: The MCP bridge uses the same wiring as AL6's real-harness
 * test (createMcpRoute + local Hono server). The capturing router wraps registry.invoke
 * in-memory — no DB needed for the proof vehicle. The proof is:
 *   real binary → real MCP call → registry.invoke → capture (session 1)
 *   real binary → real MCP call → registry.invoke → grant consume → file written (session 2)
 *
 * @lore AL7 real-harness mcp-config: Claude CLI accepts --mcp-config pointing to
 * a JSON file with { "mcpServers": { "name": { "type": "http", "url": "..." } } }.
 * The URL is the real Hono server's /api/mcp/<token> endpoint. Combined with
 * --strict-mcp-config to prevent the binary from reading other project .mcp.json
 * files that might conflict.
 *
 * @lore AL7 real-harness codex-opencode (T3 COMPLETE — AL7 delta): Codex and opencode
 * lanes mirror the claude lane structure: session-1 (capture) → approve → session-2
 * (grant-bearing) → real file written. All three lanes are re-pointed at the PRODUCTION
 * `createMcpBridge` + `createMcpRoute` at `/api/mcp/${token}`. The test-only
 * `buildStatefulMcpServer` + `app.all("/mcp/:token")` override have been DELETED (T3).
 * The production bridge (stateful since AL7 T0) is the only transport in use.
 *
 * @lore AL7 T3 teardown-coverage: Per the R1-closure section (architecture.md), the
 * production bridge teardown (unregister → mcpServer.close → transport.close) is
 * pre-addressed by mcp-bridge-registry.ts. The stateful bridge adds only a sessionId
 * string + _initialized boolean to the transport instance — both GC'd with the instance.
 * No new teardown code is needed here.
 *
 * @lore AL7 real-claude-full-binary: Uses same env isolation recipe as AL6:
 *   CLAUDECODE="" CLAUDE_CODE_ENTRYPOINT="" CLAUDE_CODE_EXECPATH=""
 *   CLAUDE_CODE_SESSION_ID="" AI_AGENT="" CLAUDE_EFFORT=""
 * Zeroing (not removing) lets keychain auth still work via HOME + macOS Security.
 * detached:true puts the process in its own process group.
 *
 * @lore AL7 session-2-liveness: Session 2 proves the full grant-consume loop. The
 * in-memory capture registry transitions from capture-mode to grant-bearing-mode between
 * sessions. The file is written by commit_file's real handler; we check its existence
 * on disk (the sandbox is not torn down between sessions in this test).
 */

import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { serve } from "@hono/node-server";
import { createReturnEnforcement, provisionHarnessEnvironment } from "@hyperidle/harness-registry";
import { createMcpToolBridge, type McpToolBridge } from "@hyperidle/harness-registry/mcp";
import { harnessTestResolvedModel, requireHarness } from "@hyperidle/harness-registry/test-utils";
import {
	type EnforcementRegistry,
	err,
	normalizeHarnessEvent,
	ok,
	type RegisteredTool,
	type ToolContext,
	type ToolRegistry,
	type ToolResult,
	toClaudeToolSpec,
	toRegistered,
} from "@hyperidle/shared";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import z from "zod";

const createEnforcementRegistry = () => createReturnEnforcement({ isolated: true });

/**
 * Inline commit_file proof-vehicle tool.
 *
 * @lore AU20 Am10: `createCommitFileTool` factory is now internal to
 * `@hyperidle/tool-handlers`. `commit_file` is a pure disk-write tool with
 * no DB dependency — safe to inline here so this harness test owns its
 * proof vehicle without a cross-layer import.
 */
const commitFileTool = toRegistered({
	name: "commit_file",
	description:
		"Write content to a file in the session sandbox. Overwrites the file if it already exists.",
	inputSchema: z.object({
		path: z.string().min(1),
		content: z.string(),
	}),
	handler: async (args: { path: string; content: string }, ctx: ToolContext) => {
		const resolved = path.resolve(
			path.isAbsolute(args.path) ? args.path : path.join(ctx.sandboxPath, args.path),
		);
		const sandboxResolved = path.resolve(ctx.sandboxPath);
		if (!resolved.startsWith(sandboxResolved + path.sep) && resolved !== sandboxResolved) {
			return err("OUTSIDE_SANDBOX", `commit_file: path outside sandbox ${sandboxResolved}`);
		}
		try {
			fs.mkdirSync(path.dirname(resolved), { recursive: true });
			fs.writeFileSync(resolved, args.content, "utf-8");
		} catch (e) {
			return err("WRITE_FAILED", `commit_file: could not write: ${String(e)}`);
		}
		return ok({ written: resolved, bytes: Buffer.byteLength(args.content, "utf-8") });
	},
	reversibility: "irreversible" as const,
});

// ── In-memory capturing router ────────────────────────────────────────────────
//
// Wraps the real commit_file tool definition with a stateful router that:
//   - Session 1 (capture mode): intercepts commit_file calls → captures in-memory
//     → returns AWAITING_REVIEW.
//   - Session 2 (grant-bearing mode): allows the approved commit_file call to run.
//
// This avoids needing a full DB (proposedCalls table) for the proof.
// The proof is: REAL binary → REAL MCP call → REAL registry.invoke → capture/execute.
//
// @lore AL7 real-harness: in-memory capturing router mirrors how AL6's test used
// the in-memory EnforcementRegistry (forceCount as the proof signal). Here the
// captured call array is the proof signal — callCount >= 1 proves the real binary
// called the tool via MCP.

interface CapturedCall {
	readonly toolId: string;
	readonly args: Record<string, unknown>;
}

type RouterMode = "capture" | "grant-bearing";

interface CapturingRouter {
	/** Tool registry that routes through the capturing logic. */
	readonly registry: ToolRegistry;
	/** Captured calls from session 1 (capture mode). */
	readonly captured: CapturedCall[];
	/** Approved call (set after human approves in-process). */
	approvedCall: CapturedCall | null;
	/** Switch mode between sessions. */
	setMode(mode: RouterMode): void;
	/** Current mode. */
	getMode(): RouterMode;
}

/**
 * Create a capturing router wrapping the real commit_file tool.
 *
 * The ToolContext stub only needs sandboxPath for commit_file's write handler.
 * Other context fields are stubs — this is a single-tool proof vehicle.
 *
 * @lore AL7 real-harness: ToolContext.db etc. are not used by commit_file's
 * handler (it only writes to disk). The stubs prevent null-dereference without
 * importing real DB or EventBus infrastructure.
 */
function createCapturingRouter(sandboxPath: string): CapturingRouter {
	const captured: CapturedCall[] = [];
	let mode: RouterMode = "capture";
	let approvedCall: CapturedCall | null = null;

	// commitFileTool is already toRegistered() — no double-wrap needed.
	const commitFileDef = commitFileTool;

	// Minimal stub context: only sandboxPath is used by commit_file.handler.
	const stubCtx: ToolContext = {
		db: null as unknown as ToolContext["db"],
		eventBus: null as unknown as ToolContext["eventBus"],
		agentId: "al7-real-test-agent",
		sessionId: "al7-real-test-session",
		taskId: "al7-real-test-task",
		sandboxPath,
		ingestion: null as unknown as ToolContext["ingestion"],
	};

	async function invoke(name: string, rawArgs: unknown): Promise<ToolResult> {
		if (name !== "commit_file") {
			// Only expose commit_file in this test; any other tool call is unknown.
			return err("NOT_FOUND", `Unknown tool in AL7 proof: ${name}`);
		}

		const def = commitFileDef;
		const parsed = def.inputSchema.safeParse(rawArgs ?? {});
		if (!parsed.success) {
			return err("INVALID_INPUT", parsed.error.message);
		}

		const args = parsed.data as Record<string, unknown>;

		if (mode === "capture") {
			// Session 1: capture the call and return AWAITING_REVIEW.
			captured.push({ toolId: name, args });
			return err("AWAITING_REVIEW", `commit_file routed to review (AL7 trust-first proof).`);
		}

		if (mode === "grant-bearing") {
			// Session 2: if the approved call matches, execute it.
			if (approvedCall !== null && approvedCall.toolId === name) {
				// Execute the real commit_file handler.
				return commitFileDef.handler(parsed.data, stubCtx);
			}
			// No grant or tool mismatch → capture again (shouldn't happen in this test).
			captured.push({ toolId: name, args });
			return err("AWAITING_REVIEW", `commit_file — no active grant for this call.`);
		}

		return err("NOT_FOUND", `Unknown mode: ${mode}`);
	}

	const definitions: readonly RegisteredTool[] = [commitFileDef];

	const registry: ToolRegistry = {
		definitions,
		invoke,
		toClaudeToolSpecs: () => definitions.map((d) => toClaudeToolSpec(d)),
	};

	return {
		registry,
		captured,
		get approvedCall() {
			return approvedCall;
		},
		set approvedCall(v) {
			approvedCall = v;
		},
		setMode(m: RouterMode) {
			mode = m;
		},
		getMode() {
			return mode;
		},
	};
}

// ── Local HyperIdle MCP server ────────────────────────────────────────────────

interface Al7TestServer {
	readonly port: number;
	readonly url: string;
	readonly bridgeRegistry: McpToolBridge;
	readonly enforcementReg: EnforcementRegistry;
	readonly sessionId: string;
	token: string;
	readonly capturingRouter: CapturingRouter;
	close(): Promise<void>;
	/** Swap the MCP bridge (new token + registry) between sessions. */
	rebuildBridge(newRouter: CapturingRouter): Promise<void>;
}

// buildStatefulMcpServer DELETED in T3 (AL7 review fix). The production
// createMcpBridge (stateful since AL7 T0) is used directly in startAl7TestServer
// and rebuildBridge — no test-only stand-in remains.

/**
 * Start a local Hono server with the PRODUCTION MCP bridge:
 *   - createMcpBridge (stateful) registered in bridgeRegistry
 *   - createMcpRoute (ALL /api/mcp/:token) as the ONLY MCP catch-all
 *   - return-status route for AL6 enforcement hook
 *
 * T3 COMPLETE: the test-only `buildStatefulMcpServer` and the `/mcp/:token`
 * route override are gone. All three lanes (claude, codex, opencode) hit the
 * PRODUCTION `createMcpBridge` + `createMcpRoute` at `/api/mcp/${token}`.
 *
 * @lore AL7 T3 production-bridge: The production bridge (createMcpBridge) is
 * stateful (sessionIdGenerator: () => crypto.randomUUID(), set in AL7 T0). The
 * bridge registry holds one transport instance per session token — the production
 * /api/mcp/:token route delegates to bridgeRegistry.handleRequest which routes
 * to the correct stateful transport instance. No test-only stand-in remains.
 *
 * @lore AL7 T3 sanity-break: Wrong token in any CLI config → bridgeRegistry.lookup
 * returns undefined → 401 → binary gets a tool error → captured stays 0 → assertion
 * fails. This confirms all three lanes are non-vacuous (production registry path).
 */
async function startAl7TestServer(
	sandboxPath: string,
	testSessionId: string,
): Promise<Al7TestServer> {
	const enforcementReg = createEnforcementRegistry();
	const bridgeRegistry = createMcpToolBridge({ enforcement: enforcementReg });

	// Register enforcement entry (exempt=true so Stop hook never forces re-prompt).
	const gate = { returned: true };
	enforcementReg.register(testSessionId, { gate, forceCount: 0, exempt: true });

	// Build the capturing router (session 1: capture mode).
	const capturingRouter = createCapturingRouter(sandboxPath);

	// Build the PRODUCTION bridge via createMcpBridge (stateful transport).
	// The token is a 64-char hex session key; the bridgeRegistry routes /api/mcp/:token
	// requests to this transport instance.
	let currentBridge = await bridgeRegistry.open({
		sessionId: testSessionId,
		registry: capturingRouter.registry,
	});

	const app = new Hono();

	// Mount the production MCP + enforcement routes at /api.
	// createMcpRoute provides: ALL /api/mcp/:token (bridge) + return-status route.
	// No /mcp/:token override — CLIs must use /api/mcp/:token (production path).
	const api = new Hono();
	const mcpRouter = bridgeRegistry.router;
	api.route("/", mcpRouter);
	app.route("/api", api);

	let resolvePort: (port: number) => void;
	const portPromise = new Promise<number>((resolve) => {
		resolvePort = resolve;
	});

	const server = serve({ fetch: app.fetch, port: 0 }, (info) => {
		resolvePort(info.port);
	});

	const port = await portPromise;
	const url = `http://127.0.0.1:${port}`;

	return {
		port,
		url,
		bridgeRegistry,
		enforcementReg,
		sessionId: testSessionId,
		get token() {
			return currentBridge.token;
		},
		capturingRouter,
		close: async () => {
			enforcementReg.unregister(testSessionId);
			// Unregister closes the bridge (mcpServer.close → transport.close).
			await bridgeRegistry.close(currentBridge.token);
			await new Promise<void>((resolve, reject) => {
				server.close((err) => (err ? reject(err) : resolve()));
			});
		},
		rebuildBridge: async (newRouter: CapturingRouter) => {
			// Unregister old bridge (closes mcpServer + transport via registry).
			await bridgeRegistry.close(currentBridge.token);
			// Build a new PRODUCTION bridge with the updated router.
			currentBridge = await bridgeRegistry.open({
				sessionId: testSessionId,
				registry: newRouter.registry,
			});
		},
	};
}

// ── Clean env for headless binary spawning ────────────────────────────────────
// Same recipe as AL6 — zero CC session-detection vars, keep keychain auth.

function buildCleanEnv(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (v !== undefined) env[k] = v;
	}
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
	for (const v of ccVars) env[v] = "";
	return env;
}

/**
 * Spawn a process in its own process group (detached), wait for exit.
 * Same pattern as AL6's spawnDetached.
 */
async function spawnDetached(
	bin: string,
	args: string[],
	opts: { cwd: string; env: Record<string, string>; timeoutMs: number; closeStdin?: boolean },
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
	return new Promise((resolve) => {
		// @lore AL7 codex-stdin: codex exec reads from stdin when it is a pipe
		// (even an empty one) and hangs when stdin is "ignore" — it emits
		// "Reading additional input from stdin..." and blocks. The fix is to
		// use "pipe" for stdin and immediately call child.stdin.end() (EOF).
		// Claude code works with "ignore"; codex requires the closed-pipe pattern.
		const stdinMode = opts.closeStdin ? "pipe" : "ignore";
		const child = spawn(bin, args, {
			cwd: opts.cwd,
			env: opts.env,
			detached: true,
			stdio: [stdinMode, "pipe", "pipe"],
		});
		if (opts.closeStdin) {
			child.stdin?.end();
		}

		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		const guard = setTimeout(() => {
			try {
				process.kill(-child.pid!, "SIGKILL");
			} catch {
				/* already exited */
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

		child.unref();
	});
}

/**
 * Write the MCP config JSON file for the claude binary.
 * Uses { "mcpServers": { "hyperidle": { "type": "http", "url": "..." } } }
 *
 * The URL points to the PRODUCTION bridge at /api/mcp/:token (T3 complete).
 *
 * @lore AL7 real-harness mcp-config: The --mcp-config flag accepts a path to a
 * JSON file. The claude binary connects to the HTTP MCP server at the given URL.
 * Combined with --strict-mcp-config to isolate from project .mcp.json files.
 * Combined with --allowedTools mcp__hyperidle__commit_file to force the agent to
 * use our MCP tool instead of built-in Write/Bash tools.
 */
function writeMcpConfig(configPath: string, mcpUrl: string): void {
	const config = {
		mcpServers: {
			hyperidle: {
				type: "http",
				url: mcpUrl,
			},
		},
	};
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Build the PRODUCTION MCP URL for any CLI binary.
 * Uses /api/mcp/:token — the createMcpRoute catch-all served by bridgeRegistry.
 * T3: all three lanes (claude, codex, opencode) hit this path.
 */
function buildMcpUrl(serverUrl: string, token: string): string {
	return `${serverUrl}/api/mcp/${token}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AL7 — LIVE real-binary trust-first two-session loop (local-only lane)", () => {
	let sandboxBasePath: string;

	beforeEach(() => {
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "al7-rh-"));
	});

	afterEach(() => {
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
	});

	// ── Session 1: FULL BINARY PROOF ──────────────────────────────────────────
	//
	// Spawns the real claude binary, points it at the local MCP server exposing
	// `commit_file`. The agent is prompted to call commit_file. The capturing router
	// intercepts the call (session 1: capture mode) → returns AWAITING_REVIEW.
	// Assert: capturedCalls >= 1 (REAL binary called commit_file via MCP).
	//
	// @lore AL7 real-harness: The prompt instructs the agent to call commit_file.
	// Claude code always calls the tool (it has no bash/file tools available in
	// --dangerously-skip-permissions mode when we use --strict-mcp-config). The
	// AWAITING_REVIEW response from the capturing router tells the agent its op is
	// pending review — it stops trying (correct session-1 behavior).
	//
	// @lore AL7 real-harness session-isolation: Both sessions use a fresh sandbox
	// within sandboxBasePath. The MCP server is reused but the bridge is rebuilt
	// with a fresh token between sessions.

	describe("[harness:claude] claude-code CLI (real binary, MCP-routed two-session loop)", () => {
		requireHarness("claude");
		test("FULL BINARY PROOF session-1: real claude calls commit_file → MCP bridge → capturing router (callCount>=1)", async () => {
			const s1SandboxPath = fs.mkdtempSync(path.join(sandboxBasePath, "s1-"));
			const testSessionId = `al7-rh-s1-${Math.random().toString(36).slice(2, 10)}`;

			const testServer = await startAl7TestServer(s1SandboxPath, testSessionId);

			try {
				const mcpUrl = buildMcpUrl(testServer.url, testServer.token);
				const mcpConfigPath = path.join(s1SandboxPath, "mcp-config.json");
				writeMcpConfig(mcpConfigPath, mcpUrl);

				// Write minimal .claude/settings.json with workspace trust (no Stop hook).
				const claudeDir = path.join(s1SandboxPath, ".claude");
				fs.mkdirSync(claudeDir, { recursive: true });
				fs.writeFileSync(
					path.join(claudeDir, "settings.json"),
					JSON.stringify({ enableAllProjectMcpServers: true }, null, 2),
					"utf-8",
				);

				const cleanEnv = buildCleanEnv();

				// Prompt the agent to call commit_file via the MCP tool.
				// --allowedTools restricts the agent to ONLY the MCP commit_file tool,
				// preventing it from using built-in Write/Bash tools instead.
				//
				// @lore AL7 real-harness allowedTools: Without --allowedTools, the claude
				// binary uses its own built-in Write/Bash tools instead of our MCP
				// commit_file tool (built-ins are preferred by default). Restricting to
				// only mcp__hyperidle__commit_file forces the agent to call our tool.
				const prompt =
					"Use the commit_file MCP tool to write the text 'al7-proof-s1' to a file named 'proof.txt'. " +
					"You MUST use the commit_file tool — no other tools are available. " +
					"After calling the tool, report what the tool returned.";

				// @lore AR7: model AR7-locked via harnessTestResolvedModel("claude") → haiku.
				const result = await spawnDetached(
					"claude",
					[
						"-p",
						prompt,
						"--mcp-config",
						mcpConfigPath,
						"--strict-mcp-config",
						"--allowedTools",
						"mcp__hyperidle__commit_file",
						"--dangerously-skip-permissions",
						"--output-format",
						"json",
						"--model",
						harnessTestResolvedModel("claude").model,
					],
					{
						cwd: s1SandboxPath,
						env: cleanEnv,
						timeoutMs: 60_000,
					},
				);

				// Assert: the REAL capturing router intercepted commit_file (capturedCalls >= 1).
				// This proves: real binary → real MCP call → real registry.invoke → capture.
				//
				// @lore AL7 real-harness sanity-break: Change the MCP URL to a wrong token
				// to verify this assertion fails (bridgeRegistry.lookup returns undefined →
				// 401 → claude gets a tool error → captured stays 0).
				if (testServer.capturingRouter.captured.length < 1) {
					throw new Error(
						`AL7 FULL BINARY PROOF FAILED (session 1): real claude binary did NOT call commit_file via MCP. ` +
							`capturingRouter.captured.length=${testServer.capturingRouter.captured.length}, expected >=1. ` +
							`stdout: "${result.stdout.slice(0, 500)}" ` +
							`stderr: "${result.stderr.slice(0, 400)}" ` +
							`exitCode: ${result.exitCode}. ` +
							`MCP URL (stateful): ${mcpUrl}. ` +
							`Check: (1) production MCP bridge reachable at /api/mcp/:token, ` +
							`(2) commit_file exposed, ` +
							`(3) --allowedTools mcp__hyperidle__commit_file forces tool use, ` +
							`(4) claude completed at least one turn (exitCode should be 0).`,
					);
				}
				expect(testServer.capturingRouter.captured.length).toBeGreaterThanOrEqual(1);

				// The captured call must be commit_file.
				const firstCapture = testServer.capturingRouter.captured[0];
				expect(firstCapture?.toolId).toBe("commit_file");

				// The binary must have completed (non-null exit code, JSON output).
				expect(result.exitCode).not.toBeNull();
			} finally {
				await testServer.close();
			}
		}, 90_000);

		test("FULL BINARY PROOF session-2: approve → session-2 executes grant → real file written", async () => {
			// This test extends session-1 to prove the full two-session loop.
			// It runs session 1 (capture), approves in-process, then runs session 2
			// (grant-bearing) and asserts the real file is written to disk.
			//
			// @lore AL7 real-harness session-2: The sandbox is NOT torn down between
			// sessions — session 2 reuses the same sandboxPath and the file written
			// by commit_file persists for assertion.

			const sandboxPath = fs.mkdtempSync(path.join(sandboxBasePath, "s2loop-"));
			const testSessionId = `al7-rh-s2-${Math.random().toString(36).slice(2, 10)}`;

			const testServer = await startAl7TestServer(sandboxPath, testSessionId);

			try {
				// ── Session 1 ──────────────────────────────────────────────────────
				const s1McpUrl = buildMcpUrl(testServer.url, testServer.token);
				const s1McpConfigPath = path.join(sandboxPath, "s1-mcp-config.json");
				writeMcpConfig(s1McpConfigPath, s1McpUrl);

				const claudeDir = path.join(sandboxPath, ".claude");
				fs.mkdirSync(claudeDir, { recursive: true });
				fs.writeFileSync(
					path.join(claudeDir, "settings.json"),
					JSON.stringify({ enableAllProjectMcpServers: true }, null, 2),
					"utf-8",
				);

				const cleanEnv = buildCleanEnv();
				const s1Prompt =
					"Use the commit_file MCP tool to write the text 'al7-proof' to a file named 'proof.txt'. " +
					"You MUST use the commit_file tool — no other tools are available. " +
					"After calling the tool, report what the tool returned.";

				// @lore AR7: model AR7-locked via harnessTestResolvedModel("claude") → haiku.
				const s1Result = await spawnDetached(
					"claude",
					[
						"-p",
						s1Prompt,
						"--mcp-config",
						s1McpConfigPath,
						"--strict-mcp-config",
						"--allowedTools",
						"mcp__hyperidle__commit_file",
						"--dangerously-skip-permissions",
						"--output-format",
						"json",
						"--model",
						harnessTestResolvedModel("claude").model,
					],
					{ cwd: sandboxPath, env: cleanEnv, timeoutMs: 60_000 },
				);

				// Assert session 1 captured the call.
				if (testServer.capturingRouter.captured.length < 1) {
					throw new Error(
						`AL7 two-session loop FAILED at session 1: commit_file not captured. ` +
							`stdout: "${s1Result.stdout.slice(0, 400)}" ` +
							`stderr: "${s1Result.stderr.slice(0, 300)}" ` +
							`exitCode: ${s1Result.exitCode}`,
					);
				}
				expect(testServer.capturingRouter.captured.length).toBeGreaterThanOrEqual(1);
				const capturedCall = testServer.capturingRouter.captured[0]!;
				expect(capturedCall.toolId).toBe("commit_file");

				// ── Approve (in-process) ────────────────────────────────────────────
				// Grant the approved call to the capturing router.
				testServer.capturingRouter.approvedCall = capturedCall;

				// Rebuild the MCP bridge with the grant-bearing router.
				// The same CapturingRouter instance switches to grant-bearing mode.
				testServer.capturingRouter.setMode("grant-bearing");
				await testServer.rebuildBridge(testServer.capturingRouter);

				// ── Session 2 ──────────────────────────────────────────────────────
				const s2McpUrl = buildMcpUrl(testServer.url, testServer.token);
				const s2McpConfigPath = path.join(sandboxPath, "s2-mcp-config.json");
				writeMcpConfig(s2McpConfigPath, s2McpUrl);

				// Session 2: same prompt. The grant-bearing router allows commit_file.
				// The real commit_file handler will write the file to sandboxPath.
				const s2Prompt =
					"Use the commit_file MCP tool to write the text 'al7-proof' to a file named 'proof.txt'. " +
					"You MUST use the commit_file tool — no other tools are available. " +
					"After calling the tool, report what the tool returned (it should say the file was written).";

				// @lore AR7: model AR7-locked via harnessTestResolvedModel("claude") → haiku.
				const s2Result = await spawnDetached(
					"claude",
					[
						"-p",
						s2Prompt,
						"--mcp-config",
						s2McpConfigPath,
						"--strict-mcp-config",
						"--allowedTools",
						"mcp__hyperidle__commit_file",
						"--dangerously-skip-permissions",
						"--output-format",
						"json",
						"--model",
						harnessTestResolvedModel("claude").model,
					],
					{ cwd: sandboxPath, env: cleanEnv, timeoutMs: 60_000 },
				);

				// Assert session 2: real file written to disk.
				// commit_file writes to ctx.sandboxPath/proof.txt (relative path resolved).
				const expectedFile = path.join(sandboxPath, "proof.txt");
				if (!fs.existsSync(expectedFile)) {
					throw new Error(
						`AL7 two-session loop FAILED at session 2: proof.txt not written to disk. ` +
							`Expected file: ${expectedFile}. ` +
							`stdout: "${s2Result.stdout.slice(0, 500)}" ` +
							`stderr: "${s2Result.stderr.slice(0, 300)}" ` +
							`exitCode: ${s2Result.exitCode}. ` +
							`captured.length=${testServer.capturingRouter.captured.length}, ` +
							`approvedCall=${JSON.stringify(testServer.capturingRouter.approvedCall)}`,
					);
				}
				expect(fs.existsSync(expectedFile)).toBe(true);

				const fileContent = fs.readFileSync(expectedFile, "utf-8");
				expect(fileContent).toBe("al7-proof");

				// Assert: session 2 completed cleanly.
				expect(s2Result.exitCode).not.toBeNull();

				// Work continues: session 2 should have produced output (the agent
				// reported on the tool result after commit_file completed).
				expect(s2Result.stdout.length).toBeGreaterThan(0);
			} finally {
				await testServer.close();
			}
		}, 180_000);

		test("MCP bridge wiring: commit_file exposed via MCP schema + real server reachable", async () => {
			const sandboxPath = fs.mkdtempSync(path.join(sandboxBasePath, "wiring-"));
			const testSessionId = `al7-rh-wiring-${Math.random().toString(36).slice(2, 10)}`;

			const testServer = await startAl7TestServer(sandboxPath, testSessionId);

			try {
				// Verify MCP server is reachable via HTTP.
				const mcpUrl = buildMcpUrl(testServer.url, testServer.token);

				// MCP SSE/HTTP server responds to POST with initialize request.
				// A minimal MCP initialize probe: POST { "method": "initialize", ... }
				// The bridge registry is wired; the transport handles the request.
				const initResponse = await fetch(mcpUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						// biome-ignore lint/style/useNamingConvention: HTTP header name is canonical RFC case
						Accept: "application/json, text/event-stream",
					},
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						method: "initialize",
						params: {
							protocolVersion: "2025-03-26",
							capabilities: {},
							clientInfo: { name: "al7-test", version: "1.0" },
						},
					}),
				});

				// The MCP server should respond 200 to initialize.
				expect(initResponse.status).toBe(200);

				// The capturing router exposes commit_file.
				expect(testServer.capturingRouter.registry.definitions).toHaveLength(1);
				expect(testServer.capturingRouter.registry.definitions[0]?.name).toBe("commit_file");
			} finally {
				await testServer.close();
			}
		}, 30_000);
	});

	// ── CODEX CLI (real binary, MCP-routed two-session loop) ─────────────────
	//
	// @lore AL7 T3 codex (COMPLETE): Mirrors the claude lane. Uses a git-init'd sandbox
	// (codex requires a git repo) and provisionCodexHome to write auth.json +
	// config.toml to .codex-home/, then writeCliMcpConfig to append
	// [mcp_servers.hyperidle] to .codex-home/config.toml.
	//
	// Hits PRODUCTION createMcpBridge (stateful) via createMcpRoute at
	// ${server.url}/api/mcp/${token}. buildStatefulMcpServer and the /mcp/:token
	// override are deleted (T3). rebuildBridge uses production createMcpBridge.
	//
	// @lore AL7 T3 sanity-break codex: Changing the config-file token to a wrong
	// value → PRODUCTION bridge registry lookup fails (401) → codex gets a tool
	// error → captured stays 0 → assertion fails. Confirms the lane is not vacuous.
	//
	// @lore AL7 codex-mcp-approval: codex requires user approval for MCP tool calls
	// by default (`approvals_reviewer = "user"` in config.toml). `--dangerously-bypass-hook-trust`
	// does NOT bypass MCP tool call approval — it only bypasses hook hash-checks. Without
	// approval bypass, codex emits `"user cancelled MCP tool call"` and the call fails.
	// The correct flag is `--dangerously-bypass-approvals-and-sandbox` which skips all
	// confirmation prompts (MCP tool calls + shell commands) and disables sandboxing.
	// This is safe in the test context (isolated temp sandbox).
	// Discovered: codex 0.141.x, 2026-06-25.
	//
	// @lore AL7 codex-stdin-pipe: codex exec must have stdin closed (pipe+end()) not
	// ignored. With `stdio:["ignore"...]`, codex hangs on some invocations — the
	// "Reading additional input from stdin..." message appears and codex blocks.
	// Fix: use `closeStdin:true` in spawnDetached (pipe stdin then child.stdin.end()).
	// Both pipe+close and /dev/null redirect produce "Reading additional input from stdin..."
	// — that message is just informational, not a hang indicator.

	describe("[harness:codex] codex CLI (real binary, MCP-routed two-session loop)", () => {
		requireHarness("codex");
		test("FULL BINARY PROOF session-1: real codex calls commit_file → MCP bridge → capturing router (captured>=1)", async () => {
			// @lore AL7 T3 codex: writeCliMcpConfig and CLI_TOOL_CONFIGS.codex.mcpConfig
			// do not exist yet (T4). This test will fail at the import/call site
			// until T4+T5+T6 land.

			const s1SandboxPath = fs.mkdtempSync(path.join(sandboxBasePath, "codex-s1-"));
			const testSessionId = `al7-rh-codex-s1-${Math.random().toString(36).slice(2, 10)}`;

			// Codex requires a git repo.
			execFileSync("git", ["init"], { cwd: s1SandboxPath, stdio: "ignore" });
			execFileSync("git", ["commit", "--allow-empty", "-m", "init"], {
				cwd: s1SandboxPath,
				stdio: "ignore",
				env: {
					...process.env,
					GIT_AUTHOR_NAME: "test",
					GIT_AUTHOR_EMAIL: "test@test.com",
					GIT_COMMITTER_NAME: "test",
					GIT_COMMITTER_EMAIL: "test@test.com",
				},
			});

			const testServer = await startAl7TestServer(s1SandboxPath, testSessionId);

			try {
				// T3 COMPLETE: uses /api/mcp/:token (production bridge path).
				const mcpUrl = buildMcpUrl(testServer.url, testServer.token);

				// writeCliMcpConfig (T4/T6): appends the [mcp_servers.hyperidle] block
				// to .codex-home/config.toml (codex-toml dialect).
				const codexHomeDir = path.join(s1SandboxPath, ".codex-home");
				fs.mkdirSync(codexHomeDir, { recursive: true });

				// Copy auth.json + config.toml from ~/.codex (AL6 recipe).
				const homeCodexDir = path.join(os.homedir(), ".codex");
				for (const fname of ["auth.json", "config.toml"]) {
					const src = path.join(homeCodexDir, fname);
					if (fs.existsSync(src)) {
						fs.copyFileSync(src, path.join(codexHomeDir, fname));
					}
				}

				// Append the MCP block (this is what writeCliMcpConfig does for codex-toml).
				const { tokenEnv } = await provisionHarnessEnvironment({
					dialect: "codex-toml",
					sandboxPath: s1SandboxPath,
					mcpUrl,
					token: testServer.token,
				});

				const cleanEnv = buildCleanEnv();
				cleanEnv.CODEX_HOME = codexHomeDir;
				// Inject the MCP token env var (codex reads from bearer_token_env_var).
				if (tokenEnv) {
					Object.assign(cleanEnv, tokenEnv);
				}

				const prompt =
					"Use the commit_file MCP tool to write 'al7-proof' to a file named 'proof.txt'. " +
					"You MUST use the commit_file tool — no other tools are available. " +
					"After calling the tool, report what the tool returned.";

				// @lore AR7: --model added per AR7 rule (codex now argument-enforced on model).
				// harnessTestResolvedModel("codex").model → gpt-5.4-mini (tiny baseline).
				const result = await spawnDetached(
					"codex",
					[
						"exec",
						prompt,
						"--json",
						"--dangerously-bypass-approvals-and-sandbox",
						"--model",
						harnessTestResolvedModel("codex").model,
					],
					{
						cwd: s1SandboxPath,
						env: cleanEnv,
						timeoutMs: 60_000,
						closeStdin: true,
					},
				);

				// AC1: real codex called commit_file via MCP → router captured it.
				if (testServer.capturingRouter.captured.length < 1) {
					throw new Error(
						`AL7 FULL BINARY PROOF FAILED (codex session 1): real codex binary did NOT call commit_file via MCP. ` +
							`captured.length=${testServer.capturingRouter.captured.length}, expected >=1. ` +
							`stdout: "${result.stdout.slice(0, 500)}" ` +
							`stderr: "${result.stderr.slice(0, 400)}" ` +
							`exitCode: ${result.exitCode}. ` +
							`MCP URL: ${mcpUrl}.`,
					);
				}
				expect(testServer.capturingRouter.captured.length).toBeGreaterThanOrEqual(1);

				const firstCapture = testServer.capturingRouter.captured[0];
				expect(firstCapture?.toolId).toBe("commit_file");

				// AC8 control — NAMED assertion: capture-mode → NO file written.
				// The mode is still "capture" — no setMode("grant-bearing"), no approval.
				// Proves: a captured-but-unapproved Proposed Call does NOT execute.
				const proofFile = path.join(s1SandboxPath, "proof.txt");
				expect(
					fs.existsSync(proofFile),
					"AC8 NAMED CONTROL: proof.txt must NOT exist in capture-mode (no approval granted). " +
						"A captured call must be held — not executed — until explicitly approved.",
				).toBe(false);

				expect(result.exitCode).not.toBeNull();
			} finally {
				await testServer.close();
			}
		}, 90_000);

		test("FULL BINARY PROOF session-2: approve → session-2 executes grant → real file written (AC3, AC8, AC10)", async () => {
			const sandboxPath = fs.mkdtempSync(path.join(sandboxBasePath, "codex-s2loop-"));
			const testSessionId = `al7-rh-codex-s2-${Math.random().toString(36).slice(2, 10)}`;

			// Codex requires a git repo.
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

			const testServer = await startAl7TestServer(sandboxPath, testSessionId);

			try {
				// ── Session 1 ──────────────────────────────────────────────────────
				const s1McpUrl = buildMcpUrl(testServer.url, testServer.token);
				const codexHomeDir = path.join(sandboxPath, ".codex-home");
				fs.mkdirSync(codexHomeDir, { recursive: true });
				const homeCodexDir = path.join(os.homedir(), ".codex");
				for (const fname of ["auth.json", "config.toml"]) {
					const src = path.join(homeCodexDir, fname);
					if (fs.existsSync(src)) {
						fs.copyFileSync(src, path.join(codexHomeDir, fname));
					}
				}
				const { tokenEnv: s1TokenEnv } = await provisionHarnessEnvironment({
					dialect: "codex-toml",
					sandboxPath,
					mcpUrl: s1McpUrl,
					token: testServer.token,
				});

				const cleanEnv = buildCleanEnv();
				cleanEnv.CODEX_HOME = codexHomeDir;
				if (s1TokenEnv) Object.assign(cleanEnv, s1TokenEnv);

				const prompt =
					"Use the commit_file MCP tool to write 'al7-proof' to a file named 'proof.txt'. " +
					"You MUST use the commit_file tool — no other tools are available. " +
					"After calling the tool, report what the tool returned.";

				// @lore AR7: --model added per AR7 rule → gpt-5.4-mini.
				const s1Result = await spawnDetached(
					"codex",
					[
						"exec",
						prompt,
						"--json",
						"--dangerously-bypass-approvals-and-sandbox",
						"--model",
						harnessTestResolvedModel("codex").model,
					],
					{ cwd: sandboxPath, env: cleanEnv, timeoutMs: 60_000, closeStdin: true },
				);

				if (testServer.capturingRouter.captured.length < 1) {
					throw new Error(
						`AL7 codex two-session loop FAILED at session 1: commit_file not captured. ` +
							`stdout: "${s1Result.stdout.slice(0, 400)}" stderr: "${s1Result.stderr.slice(0, 300)}"`,
					);
				}
				expect(testServer.capturingRouter.captured.length).toBeGreaterThanOrEqual(1);
				const capturedCall = testServer.capturingRouter.captured[0]!;
				expect(capturedCall.toolId).toBe("commit_file");

				// AC8 NAMED CONTROL: capture-mode → file NOT written.
				const proofFile = path.join(sandboxPath, "proof.txt");
				expect(
					fs.existsSync(proofFile),
					"AC8 NAMED CONTROL (codex session 1): proof.txt must NOT exist in capture-mode. " +
						"Unapproved Proposed Call must be held, not executed.",
				).toBe(false);

				// ── Approve (in-process) ────────────────────────────────────────────
				testServer.capturingRouter.approvedCall = capturedCall;
				testServer.capturingRouter.setMode("grant-bearing");
				await testServer.rebuildBridge(testServer.capturingRouter);

				// ── Session 2 ──────────────────────────────────────────────────────
				// @lore AL7 codex-s2-config-refresh: TOML does not allow duplicate table
				// keys. The session-2 writeCliMcpConfig call would append a second
				// [mcp_servers.hyperidle] block to the same config.toml, causing codex
				// to fail with "duplicate key". Fix: recreate config.toml from scratch
				// (copy base from ~/.codex) before writing the session-2 MCP block.
				// In production this never happens because each session gets a fresh sandbox.
				const s2ConfigTomlPath = path.join(codexHomeDir, "config.toml");
				const homeCodexConfigPath = path.join(homeCodexDir, "config.toml");
				if (fs.existsSync(homeCodexConfigPath)) {
					fs.copyFileSync(homeCodexConfigPath, s2ConfigTomlPath);
				} else {
					fs.writeFileSync(s2ConfigTomlPath, "", "utf-8");
				}
				const s2McpUrl = buildMcpUrl(testServer.url, testServer.token);
				const { tokenEnv: s2TokenEnv } = await provisionHarnessEnvironment({
					dialect: "codex-toml",
					sandboxPath,
					mcpUrl: s2McpUrl,
					token: testServer.token,
				});
				const s2Env = { ...cleanEnv };
				if (s2TokenEnv) Object.assign(s2Env, s2TokenEnv);

				// @lore AR7: --model added per AR7 rule → gpt-5.4-mini.
				const s2Result = await spawnDetached(
					"codex",
					[
						"exec",
						prompt,
						"--json",
						"--dangerously-bypass-approvals-and-sandbox",
						"--model",
						harnessTestResolvedModel("codex").model,
					],
					{ cwd: sandboxPath, env: s2Env, timeoutMs: 60_000, closeStdin: true },
				);

				// AC3: real codex executed the approved op → file written.
				if (!fs.existsSync(proofFile)) {
					throw new Error(
						`AL7 codex two-session loop FAILED at session 2: proof.txt not written. ` +
							`stdout: "${s2Result.stdout.slice(0, 500)}" stderr: "${s2Result.stderr.slice(0, 300)}" ` +
							`exitCode: ${s2Result.exitCode}`,
					);
				}
				expect(fs.existsSync(proofFile)).toBe(true);
				expect(fs.readFileSync(proofFile, "utf-8")).toBe("al7-proof");

				expect(s2Result.exitCode).not.toBeNull();
				// codex --json emits turn.completed when done.
				expect(s2Result.stdout).toContain("turn.completed");
			} finally {
				await testServer.close();
			}
		}, 180_000);

		test("MCP bridge wiring: commit_file exposed via MCP schema + real server reachable", async () => {
			const sandboxPath = fs.mkdtempSync(path.join(sandboxBasePath, "codex-wiring-"));
			const testSessionId = `al7-codex-wiring-${Math.random().toString(36).slice(2, 10)}`;
			const testServer = await startAl7TestServer(sandboxPath, testSessionId);

			try {
				const mcpUrl = buildMcpUrl(testServer.url, testServer.token);
				const initResponse = await fetch(mcpUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						// biome-ignore lint/style/useNamingConvention: HTTP header name is canonical RFC case
						Accept: "application/json, text/event-stream",
					},
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						method: "initialize",
						params: {
							protocolVersion: "2025-03-26",
							capabilities: {},
							clientInfo: { name: "al7-codex-test", version: "1.0" },
						},
					}),
				});

				expect(initResponse.status).toBe(200);
				expect(testServer.capturingRouter.registry.definitions).toHaveLength(1);
				expect(testServer.capturingRouter.registry.definitions[0]?.name).toBe("commit_file");
			} finally {
				await testServer.close();
			}
		}, 30_000);
	});

	// ── BUILTIN (OpenRouter in-process, MCP bridge wiring) ───────────────────
	//
	// The builtin harness uses the in-process BuiltinHarnessAdapter driven by
	// OPENROUTER_API_KEY. The builtin lane proves the MCP bridge is correctly wired:
	//   - createMcpBridge creates a bridge (token, sessionId, mcpServer, transport)
	//   - bridgeRegistry.register + bridgeRegistry.lookup work correctly
	//   - The real /api/mcp/:token route responds to MCP initialize request
	//
	// The full two-session loop (session-1 capture → approve → session-2 grant-bearing)
	// is proved by the claude/codex/opencode lanes above. The builtin lane focuses on
	// bridge wiring (same as the claude "MCP bridge wiring" test) gated on OPENROUTER_API_KEY.
	//
	// @lore AR6 AL7-builtin-lane: no vi.mock(llm-client) — uses requireHarness("builtin")
	// which hard-fails if OPENROUTER_API_KEY is absent. The bridge wiring test does not
	// spawn a real LLM call — it proves the HTTP transport is reachable via fetch.

	// ── OPENCODE CLI (real binary, MCP-routed two-session loop) ──────────────
	//
	// @lore AL7 T3 opencode (COMPLETE): Mirrors the codex lane. Uses a plain sandbox (no git
	// required). writeCliMcpConfig writes opencode.json to the sandbox cwd.
	// The spawn recipe: opencode run <prompt> --format json --pure
	//   --dir <sandbox> --model <AR7-locked> (harnessTestResolvedModel("opencode").model)
	// (W4 closure: --model is required; provider-prefixed form per plan §1a.)
	// @lore AR7: model was openrouter/~anthropic/claude-haiku-latest; now AR7-locked to
	//   openrouter/z-ai/glm-4.7-flash (harnessTestResolvedModel("opencode")). Never hardcode.
	//
	// Hits PRODUCTION createMcpBridge (stateful) via createMcpRoute at
	// ${server.url}/api/mcp/${token}. buildStatefulMcpServer and /mcp/:token override deleted.
	//
	// @lore AL7 T3 opencode W3 (RESOLVED): opencode --format json emits raw JSONL types
	// like step_finish/tool. normalizeHarnessEvent maps unknown types to error events.
	// The session-2 test includes a W3 assertion: at least one line of opencode stdout
	// parses as valid JSON and normalizes to a non-error canonical HarnessEvent (proves
	// the event normalization path works with real opencode JSONL output). If no event
	// normalizes, the opencode pre-map must be added to normalizeHarnessEvent.
	//
	// @lore AL7 T3 sanity-break opencode: Wrong token in opencode.json → 401 from
	// bridge registry → opencode gets a tool error → captured stays 0 → assertion fails.

	describe("[harness:opencode] opencode CLI (real binary, MCP-routed two-session loop)", () => {
		requireHarness("opencode");
		test("FULL BINARY PROOF session-1: real opencode calls commit_file → MCP bridge → capturing router (captured>=1)", async () => {
			const s1SandboxPath = fs.mkdtempSync(path.join(sandboxBasePath, "opencode-s1-"));
			const testSessionId = `al7-rh-oc-s1-${Math.random().toString(36).slice(2, 10)}`;

			const testServer = await startAl7TestServer(s1SandboxPath, testSessionId);

			try {
				const mcpUrl = buildMcpUrl(testServer.url, testServer.token);

				// @lore AL7 T3 opencode: writeCliMcpConfig writes opencode.json to sandboxPath.
				// Currently RED: writeCliMcpConfig does not exist yet (T4).
				await provisionHarnessEnvironment({
					dialect: "opencode-json",
					sandboxPath: s1SandboxPath,
					mcpUrl,
					token: testServer.token,
				});

				const cleanEnv = buildCleanEnv();

				// @lore AR7: model AR7-locked via harnessTestResolvedModel("opencode") →
				// openrouter/z-ai/glm-4.7-flash (replaces openrouter/~anthropic/claude-haiku-latest).
				const prompt =
					"Use the commit_file MCP tool to write 'al7-proof' to a file named 'proof.txt'. " +
					"You MUST use the commit_file tool — no other tools are available. " +
					"After calling the tool, report what the tool returned.";

				const result = await spawnDetached(
					"opencode",
					[
						"run",
						prompt,
						"--format",
						"json",
						"--pure",
						"--dir",
						s1SandboxPath,
						"--model",
						harnessTestResolvedModel("opencode").model,
					],
					{
						cwd: s1SandboxPath,
						env: cleanEnv,
						timeoutMs: 60_000,
					},
				);

				// AC2: real opencode called commit_file via MCP → router captured it.
				if (testServer.capturingRouter.captured.length < 1) {
					throw new Error(
						`AL7 FULL BINARY PROOF FAILED (opencode session 1): real opencode binary did NOT call commit_file via MCP. ` +
							`captured.length=${testServer.capturingRouter.captured.length}, expected >=1. ` +
							`stdout: "${result.stdout.slice(0, 500)}" ` +
							`stderr: "${result.stderr.slice(0, 400)}" ` +
							`exitCode: ${result.exitCode}. ` +
							`MCP URL: ${mcpUrl}. ` +
							`opencode.json must be loaded from spawn cwd (config resolution).`,
					);
				}
				expect(testServer.capturingRouter.captured.length).toBeGreaterThanOrEqual(1);

				const firstCapture = testServer.capturingRouter.captured[0];
				expect(firstCapture?.toolId).toBe("commit_file");

				// AC8 NAMED CONTROL: capture-mode → NO file written.
				// Mode is still "capture"; no approval granted.
				const proofFile = path.join(s1SandboxPath, "proof.txt");
				expect(
					fs.existsSync(proofFile),
					"AC8 NAMED CONTROL (opencode session 1): proof.txt must NOT exist in capture-mode. " +
						"Unapproved Proposed Call must be held, not executed.",
				).toBe(false);

				expect(result.exitCode).not.toBeNull();
			} finally {
				await testServer.close();
			}
		}, 90_000);

		test("FULL BINARY PROOF session-2: approve → session-2 executes grant → real file written (AC4, AC8, AC10)", async () => {
			const sandboxPath = fs.mkdtempSync(path.join(sandboxBasePath, "opencode-s2loop-"));
			const testSessionId = `al7-rh-oc-s2-${Math.random().toString(36).slice(2, 10)}`;

			const testServer = await startAl7TestServer(sandboxPath, testSessionId);

			try {
				// ── Session 1 ──────────────────────────────────────────────────────
				const s1McpUrl = buildMcpUrl(testServer.url, testServer.token);
				await provisionHarnessEnvironment({
					dialect: "opencode-json",
					sandboxPath,
					mcpUrl: s1McpUrl,
					token: testServer.token,
				});

				const cleanEnv = buildCleanEnv();

				const prompt =
					"Use the commit_file MCP tool to write 'al7-proof' to a file named 'proof.txt'. " +
					"You MUST use the commit_file tool — no other tools are available. " +
					"After calling the tool, report what the tool returned.";

				// @lore AR7: model AR7-locked → openrouter/z-ai/glm-4.7-flash.
				const s1Result = await spawnDetached(
					"opencode",
					[
						"run",
						prompt,
						"--format",
						"json",
						"--pure",
						"--dir",
						sandboxPath,
						"--model",
						harnessTestResolvedModel("opencode").model,
					],
					{ cwd: sandboxPath, env: cleanEnv, timeoutMs: 60_000 },
				);

				if (testServer.capturingRouter.captured.length < 1) {
					throw new Error(
						`AL7 opencode two-session loop FAILED at session 1: commit_file not captured. ` +
							`stdout: "${s1Result.stdout.slice(0, 400)}" stderr: "${s1Result.stderr.slice(0, 300)}"`,
					);
				}
				expect(testServer.capturingRouter.captured.length).toBeGreaterThanOrEqual(1);
				const capturedCall = testServer.capturingRouter.captured[0]!;
				expect(capturedCall.toolId).toBe("commit_file");

				// AC8 NAMED CONTROL: capture-mode → file NOT written.
				const proofFile = path.join(sandboxPath, "proof.txt");
				expect(
					fs.existsSync(proofFile),
					"AC8 NAMED CONTROL (opencode session 1): proof.txt must NOT exist in capture-mode. " +
						"Unapproved Proposed Call must be held, not executed.",
				).toBe(false);

				// ── Approve (in-process) ────────────────────────────────────────────
				testServer.capturingRouter.approvedCall = capturedCall;
				testServer.capturingRouter.setMode("grant-bearing");
				await testServer.rebuildBridge(testServer.capturingRouter);

				// ── Session 2 ──────────────────────────────────────────────────────
				const s2McpUrl = buildMcpUrl(testServer.url, testServer.token);
				await provisionHarnessEnvironment({
					dialect: "opencode-json",
					sandboxPath,
					mcpUrl: s2McpUrl,
					token: testServer.token,
				});

				// @lore AR7: model AR7-locked → openrouter/z-ai/glm-4.7-flash.
				const s2Result = await spawnDetached(
					"opencode",
					[
						"run",
						prompt,
						"--format",
						"json",
						"--pure",
						"--dir",
						sandboxPath,
						"--model",
						harnessTestResolvedModel("opencode").model,
					],
					{ cwd: sandboxPath, env: cleanEnv, timeoutMs: 60_000 },
				);

				// AC4: real opencode executed the approved op → file written.
				if (!fs.existsSync(proofFile)) {
					throw new Error(
						`AL7 opencode two-session loop FAILED at session 2: proof.txt not written. ` +
							`stdout: "${s2Result.stdout.slice(0, 500)}" stderr: "${s2Result.stderr.slice(0, 300)}" ` +
							`exitCode: ${s2Result.exitCode}`,
					);
				}
				expect(fs.existsSync(proofFile)).toBe(true);
				expect(fs.readFileSync(proofFile, "utf-8")).toBe("al7-proof");

				expect(s2Result.exitCode).not.toBeNull();

				// W3 (RESOLVED): opencode --format json emits JSONL. At least one line must
				// normalize to a non-error HarnessEvent via normalizeHarnessEvent — proving
				// the T6 obligation: opencode events are visible to the event-handling loop.
				// The opencode pre-map in normalizeHarnessEvent translates step_finish → completion
				// and tool → tool_call. Without the pre-map, all events would normalize to error.
				const s2Lines = s2Result.stdout.split("\n").filter((l) => l.trim().length > 0);
				let nonErrorNormalizedCount = 0;
				for (const line of s2Lines) {
					try {
						const parsed: unknown = JSON.parse(line);
						const event = normalizeHarnessEvent(parsed);
						// Count events that normalize to a canonical type (not error/unknown).
						// Error type includes both real errors AND unknownEvent (UnknownHarnessEvent).
						const isUnknownEvent =
							event.type === "error" &&
							"code" in event &&
							(event as { code: string }).code === "UnknownHarnessEvent";
						if (!isUnknownEvent) {
							nonErrorNormalizedCount++;
						}
					} catch {
						// Non-JSON line (e.g. debug output) — skip.
					}
				}
				expect(
					nonErrorNormalizedCount,
					"W3 ASSERTION: at least one opencode stdout JSONL line must normalize to a " +
						"non-unknown HarnessEvent via normalizeHarnessEvent. " +
						`Got 0 structured events out of ${s2Lines.length} lines. ` +
						"Check that the opencode pre-map in normalizeHarnessEvent covers the actual " +
						`event types emitted. stdout sample: "${s2Result.stdout.slice(0, 400)}"`,
				).toBeGreaterThanOrEqual(1);
			} finally {
				await testServer.close();
			}
		}, 180_000);

		test("MCP bridge wiring: commit_file exposed via MCP schema + real server reachable", async () => {
			const sandboxPath = fs.mkdtempSync(path.join(sandboxBasePath, "opencode-wiring-"));
			const testSessionId = `al7-opencode-wiring-${Math.random().toString(36).slice(2, 10)}`;
			const testServer = await startAl7TestServer(sandboxPath, testSessionId);

			try {
				const mcpUrl = buildMcpUrl(testServer.url, testServer.token);
				const initResponse = await fetch(mcpUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						// biome-ignore lint/style/useNamingConvention: HTTP header name is canonical RFC case
						Accept: "application/json, text/event-stream",
					},
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						method: "initialize",
						params: {
							protocolVersion: "2025-03-26",
							capabilities: {},
							clientInfo: { name: "al7-opencode-test", version: "1.0" },
						},
					}),
				});

				expect(initResponse.status).toBe(200);
				expect(testServer.capturingRouter.registry.definitions).toHaveLength(1);
				expect(testServer.capturingRouter.registry.definitions[0]?.name).toBe("commit_file");
			} finally {
				await testServer.close();
			}
		}, 30_000);
	});

	// ── CURSOR-AGENT CLI (real binary, MCP-routed wiring proof) ───────────────

	describe("[harness:cursor-agent] cursor-agent CLI (real binary, MCP-routed two-session loop)", () => {
		requireHarness("cursor-agent");

		test("MCP bridge wiring: commit_file exposed via MCP schema + real server reachable", async () => {
			const sandboxPath = fs.mkdtempSync(path.join(sandboxBasePath, "cursor-agent-wiring-"));
			const testSessionId = `al7-cursor-agent-wiring-${Math.random().toString(36).slice(2, 10)}`;
			const testServer = await startAl7TestServer(sandboxPath, testSessionId);

			try {
				const mcpUrl = buildMcpUrl(testServer.url, testServer.token);
				const initResponse = await fetch(mcpUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						// biome-ignore lint/style/useNamingConvention: HTTP header name is canonical RFC case
						Accept: "application/json, text/event-stream",
					},
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						method: "initialize",
						params: {
							protocolVersion: "2025-03-26",
							capabilities: {},
							clientInfo: { name: "al7-cursor-agent-test", version: "1.0" },
						},
					}),
				});

				expect(initResponse.status).toBe(200);
				expect(testServer.capturingRouter.registry.definitions).toHaveLength(1);
				expect(testServer.capturingRouter.registry.definitions[0]?.name).toBe("commit_file");
			} finally {
				await testServer.close();
			}
		}, 30_000);
	});

	// ── BUILTIN (in-process, bridge wiring proof) ─────────────────────────────

	describe("[harness:builtin] builtin in-process (MCP bridge wiring, real server reachable)", () => {
		requireHarness("builtin");

		test("MCP bridge wiring: commit_file exposed via production bridge + real server reachable via HTTP (builtin lane)", async () => {
			// Same wiring proof as the claude lane's "MCP bridge wiring" test, but gated
			// on OPENROUTER_API_KEY (builtin harness requirement) instead of claude binary.
			// Proves the production bridge is correctly wired for the builtin harness path.
			//
			// @lore AR6 AL7-builtin-lane: The builtin harness goes through BuiltinHarnessAdapter
			// which calls LLM in-process (no binary spawn). The bridge wiring test proves the
			// HTTP transport layer is functional — the same path the adapter uses to receive
			// MCP tool responses from the production bridge.
			const sandboxPath = fs.mkdtempSync(path.join(sandboxBasePath, "builtin-wiring-"));
			const testSessionId = `al7-builtin-wiring-${Math.random().toString(36).slice(2, 10)}`;

			const testServer = await startAl7TestServer(sandboxPath, testSessionId);

			try {
				const mcpUrl = buildMcpUrl(testServer.url, testServer.token);

				// The production MCP bridge responds to an MCP initialize request via HTTP.
				// This proves the bridge registry wiring is correct — the same path the
				// builtin adapter uses to communicate with the MCP server.
				const initResponse = await fetch(mcpUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						// biome-ignore lint/style/useNamingConvention: HTTP header name is canonical RFC case
						Accept: "application/json, text/event-stream",
					},
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						method: "initialize",
						params: {
							protocolVersion: "2025-03-26",
							capabilities: {},
							clientInfo: { name: "al7-builtin-test", version: "1.0" },
						},
					}),
				});

				// The MCP server should respond 200 to initialize (transport is connected).
				expect(initResponse.status).toBe(200);

				// The capturing router exposes exactly 1 tool (commit_file).
				expect(testServer.capturingRouter.registry.definitions).toHaveLength(1);
				expect(testServer.capturingRouter.registry.definitions[0]?.name).toBe("commit_file");

				expect(testServer.token).toHaveLength(64);
			} finally {
				await testServer.close();
			}
		}, 30_000);

		test("session-1 capture path: commit_file is held for review and does not write file", async () => {
			const sandboxPath = fs.mkdtempSync(path.join(sandboxBasePath, "builtin-capture-"));
			try {
				const router = createCapturingRouter(sandboxPath);
				const result = await router.registry.invoke("commit_file", {
					path: "proof.txt",
					content: "al7-proof",
				});

				expect(result.success).toBe(false);
				if (result.success) throw new Error("commit_file unexpectedly executed in capture mode");
				expect(result.code).toBe("AWAITING_REVIEW");
				expect(router.captured).toHaveLength(1);
				expect(fs.existsSync(path.join(sandboxPath, "proof.txt"))).toBe(false);
			} finally {
				fs.rmSync(sandboxPath, { recursive: true, force: true });
			}
		});

		test("session-2 grant path: approved commit_file executes and writes the real file", async () => {
			const sandboxPath = fs.mkdtempSync(path.join(sandboxBasePath, "builtin-grant-"));
			try {
				const router = createCapturingRouter(sandboxPath);
				const args = {
					path: "proof.txt",
					content: "al7-proof",
				};
				const captured = await router.registry.invoke("commit_file", args);
				expect(captured.success).toBe(false);
				const capturedCall = router.captured[0]!;
				router.approvedCall = capturedCall;
				router.setMode("grant-bearing");

				const granted = await router.registry.invoke("commit_file", args);
				expect(granted.success).toBe(true);
				expect(fs.readFileSync(path.join(sandboxPath, "proof.txt"), "utf-8")).toBe("al7-proof");
			} finally {
				fs.rmSync(sandboxPath, { recursive: true, force: true });
			}
		});
	});
});
