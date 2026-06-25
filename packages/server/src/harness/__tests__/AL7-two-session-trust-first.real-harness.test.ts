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
 * Actions job." Run on demand: npm run test:real-harness
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
 * @lore AL7 real-harness codex-opencode (REVISED — AL7 delta): Codex and opencode
 * lanes are added in this file as the AL7 delta. They mirror the claude lane structure:
 * session-1 (capture) → approve → session-2 (grant-bearing) → real file written.
 * All three lanes are re-pointed at the PRODUCTION `createMcpBridge` + `createMcpRoute`
 * once T0 (stateful bridge) and T4-T6 (wiring) land. The test-only `buildStatefulMcpServer`
 * and the `app.all("/mcp/:token")` route override will be deleted in T3 (green phase)
 * when the production bridge is stateful. The codex/opencode lanes are RED until T0+T5+T6.
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

import { execFile, execFileSync, spawn } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { serve } from "@hono/node-server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AnySchema as McpAnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	createEnforcementRegistry,
	type EnforcementRegistry,
} from "../../harness/return-enforcement-registry.js";
import { createMcpBridgeRegistry, type McpBridgeRegistry } from "../../mcp/mcp-bridge-registry.js";
import { createMcpRoute } from "../../routes/mcp-route.js";
import { commitFileTool } from "../../tools/commit-file.js";
import type { RegisteredTool, ToolContext, ToolRegistry } from "../../tools/tool-registry.js";
import { toClaudeToolSpec, toRegistered } from "../../tools/tool-registry.js";
import type { ToolResult } from "../../tools/tool-result.js";
import { err } from "../../tools/tool-result.js";

const execFileAsync = promisify(execFile);

// ── Binary detection (same pattern as AM2 + AL6) ─────────────────────────────

function binaryPresent(name: string): boolean {
	try {
		execFileSync("which", [name], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

const claudeInstalled = binaryPresent("claude");
const codexInstalled = binaryPresent("codex");
const opencodeInstalled = binaryPresent("opencode");

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
		const { stdout } = await execFileAsync("opencode", ["providers", "list"], {
			timeout: 10_000,
		});
		return /\d+\s+credentials/.test(stdout) || stdout.includes("environment variable");
	} catch {
		return false;
	}
}

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

	const commitFileDef = toRegistered(commitFileTool);

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
	readonly bridgeRegistry: McpBridgeRegistry;
	readonly enforcementReg: EnforcementRegistry;
	readonly sessionId: string;
	token: string;
	readonly capturingRouter: CapturingRouter;
	close(): Promise<void>;
	/** Swap the MCP bridge (new token + registry) between sessions. */
	rebuildBridge(newRouter: CapturingRouter): Promise<void>;
}

/**
 * Build a STATEFUL MCP server + transport for a given capturing router.
 *
 * Uses STATEFUL mode (`sessionIdGenerator: () => randomUUID()`) instead of the
 * production stateless mode. This is required because the claude binary makes multiple
 * HTTP requests per MCP "session" (initialize + list_tools + call_tool), and the
 * stateless transport (`_hasHandledRequest` guard) throws on the second request.
 *
 * @lore AL7 real-harness stateful-transport: `WebStandardStreamableHTTPServerTransport`
 * in stateless mode sets `_hasHandledRequest = true` on the first request and throws
 * `Stateless transport cannot be reused across requests` on any subsequent request.
 * The claude binary's MCP client makes multiple requests per session, so stateless mode
 * is incompatible with a real CLI client. Stateful mode assigns a session ID and routes
 * subsequent requests via the Mcp-Session-Id header, allowing the full initialize +
 * list_tools + call_tool sequence to work correctly.
 *
 * This is a test-only construct; the production `createMcpBridge` uses stateless mode
 * for the ClaudeAgentSdkAdapter path (which uses the SDK directly, not HTTP requests).
 */
async function buildStatefulMcpServer(registry: ToolRegistry): Promise<{
	mcpServer: McpServer;
	transport: WebStandardStreamableHTTPServerTransport;
	token: string;
}> {
	const token = crypto.randomBytes(32).toString("hex");

	// STATEFUL mode: sessionIdGenerator lets the transport manage sessions across requests.
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: () => crypto.randomUUID(),
	});

	const mcpServer = new McpServer(
		{ name: "hyperidle", version: "0.0.1" },
		{ capabilities: { tools: {} } },
	);

	// Register tools from the registry.
	for (const def of registry.definitions) {
		mcpServer.registerTool(
			def.name,
			{
				description: def.description,
				inputSchema: def.inputSchema as unknown as McpAnySchema,
			},
			async (args: unknown) => {
				const result = await registry.invoke(def.name, args);
				if (result.success) {
					return { content: [{ type: "text" as const, text: JSON.stringify(result.data) }] };
				}
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify({ error: result.error, code: result.code }),
						},
					],
					isError: true,
				};
			},
		);
	}

	await mcpServer.connect(transport);
	return { mcpServer, transport, token };
}

/**
 * Start a local Hono server with:
 *   - STATEFUL MCP server exposing `commit_file` via the capturing router
 *     (stateful transport handles multiple requests per claude session)
 *   - REAL /api/mcp/:token/return-status route for AL6 enforcement hook
 *
 * Between sessions, rebuildBridge() creates a new McpServer+transport with a fresh token
 * and updates the Hono route handler to use the new transport.
 *
 * @lore AL7 real-harness: Uses stateful MCP transport (test-only) vs production stateless.
 * Stateless transport is incompatible with real CLI clients that make multiple HTTP requests
 * per session (initialize + list_tools + call_tool). Stateful transport assigns a session ID
 * via Mcp-Session-Id header and routes subsequent requests correctly.
 */
async function startAl7TestServer(
	sandboxPath: string,
	testSessionId: string,
): Promise<Al7TestServer> {
	const bridgeRegistry = createMcpBridgeRegistry();
	const enforcementReg = createEnforcementRegistry();

	// Register enforcement entry (exempt=true so Stop hook never forces re-prompt).
	const gate = { returned: true };
	enforcementReg.register(testSessionId, { gate, forceCount: 0, exempt: true });

	// Build the capturing router (session 1: capture mode).
	const capturingRouter = createCapturingRouter(sandboxPath);

	// Build the stateful MCP server for session 1.
	let currentMcpState = await buildStatefulMcpServer(capturingRouter.registry);

	// Build the Hono app.
	// The MCP endpoint is mounted as ALL /mcp/:token — we match by token.
	// The return-status route (AL6) uses the bridge registry.
	// Note: we add the bridge registry entry for return-status to work (even though
	// we don't use Stop hooks in this test — belt and suspenders).
	bridgeRegistry.register({
		token: currentMcpState.token,
		sessionId: testSessionId,
		mcpServer: currentMcpState.mcpServer,
		transport: currentMcpState.transport,
	});

	const app = new Hono();

	// Mount the return-status route using createMcpRoute's enforcement path.
	const api = new Hono();
	const mcpEnforcementRouter = createMcpRoute(bridgeRegistry, enforcementReg);
	api.route("/", mcpEnforcementRouter);
	app.route("/api", api);

	// Override the catch-all MCP route to use our stateful transport directly.
	// We re-register the tool-call handler that bypasses the bridge registry lookup
	// and routes directly to the current stateful transport.
	//
	// @lore AL7 real-harness route-override: The createMcpRoute catch-all (ALL /mcp/:token)
	// uses bridgeRegistry.handleRequest which calls transport.handleRequest. With stateless
	// mode that would fail on request 2. Instead we mount a direct handler that calls
	// currentMcpState.transport.handleRequest — the stateful transport handles sessions correctly.
	app.all("/mcp/:token", async (c) => {
		const token = c.req.param("token");
		if (token !== currentMcpState.token) {
			return c.text("Unauthorized", 401);
		}
		return currentMcpState.transport.handleRequest(c.req.raw);
	});

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
			return currentMcpState.token;
		},
		capturingRouter,
		close: async () => {
			enforcementReg.unregister(testSessionId);
			try {
				await currentMcpState.mcpServer.close();
			} catch {
				/* teardown swallow */
			}
			await new Promise<void>((resolve, reject) => {
				server.close((err) => (err ? reject(err) : resolve()));
			});
		},
		rebuildBridge: async (newRouter: CapturingRouter) => {
			// Close old server.
			try {
				await currentMcpState.mcpServer.close();
			} catch {
				/* swallow */
			}
			// Build new stateful MCP server with the updated router.
			currentMcpState = await buildStatefulMcpServer(newRouter.registry);
			// Update bridge registry entry with new token (for return-status route).
			bridgeRegistry.register({
				token: currentMcpState.token,
				sessionId: testSessionId,
				mcpServer: currentMcpState.mcpServer,
				transport: currentMcpState.transport,
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
	opts: { cwd: string; env: Record<string, string>; timeoutMs: number },
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
	return new Promise((resolve) => {
		const child = spawn(bin, args, {
			cwd: opts.cwd,
			env: opts.env,
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
 * The URL points to the STATEFUL MCP transport handler at /mcp/:token
 * (not /api/mcp/:token which uses the stateless bridge registry).
 *
 * @lore AL7 real-harness mcp-config: The --mcp-config flag accepts a path to a
 * JSON file. The claude binary connects to the HTTP MCP server at the given URL.
 * Combined with --strict-mcp-config to isolate from project .mcp.json files.
 * Combined with --allowedTools mcp__hyperidle__commit_file to force the agent to
 * use our MCP tool instead of built-in Write/Bash tools.
 *
 * @lore AL7 real-harness mcp-path: The MCP URL uses /mcp/:token (root-mounted stateful
 * handler) NOT /api/mcp/:token (bridge-registry catch-all with stateless transport).
 * The stateful handler at /mcp/:token handles multiple requests per claude session.
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

/** Build the MCP URL for the claude binary (stateful handler, not bridge registry). */
function buildMcpUrl(serverUrl: string, token: string): string {
	return `${serverUrl}/mcp/${token}`;
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

	describe("claude-code CLI (real binary, MCP-routed two-session loop)", () => {
		test.skipIf(!claudeInstalled)(
			"FULL BINARY PROOF session-1: real claude calls commit_file → MCP bridge → capturing router (callCount>=1)",
			async ({ skip }) => {
				const authed = await claudeAuthed();
				if (!authed) {
					skip();
					return;
				}

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
							"claude-haiku-4-5",
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
								`Check: (1) stateful MCP server reachable at /mcp/:token, ` +
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
			},
			90_000,
		);

		test.skipIf(!claudeInstalled)(
			"FULL BINARY PROOF session-2: approve → session-2 executes grant → real file written",
			async ({ skip }) => {
				const authed = await claudeAuthed();
				if (!authed) {
					skip();
					return;
				}

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
							"claude-haiku-4-5",
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
							"claude-haiku-4-5",
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
			},
			180_000,
		);

		test.skipIf(!claudeInstalled)(
			"MCP bridge wiring: commit_file exposed via MCP schema + real server reachable",
			async ({ skip }) => {
				const authed = await claudeAuthed();
				if (!authed) {
					skip();
					return;
				}

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
			},
			30_000,
		);
	});

	// ── CODEX CLI (real binary, MCP-routed two-session loop) ─────────────────
	//
	// @lore AL7 T3 codex: Mirrors the claude lane. Uses a git-init'd sandbox
	// (codex requires a git repo) and provisionCodexHome to write auth.json +
	// config.toml to .codex-home/, then writeCliMcpConfig to append
	// [mcp_servers.hyperidle] to .codex-home/config.toml.
	//
	// Lane is RED until T0 (stateful bridge) + T4 (writeCliMcpConfig) + T5/T6
	// (CLI_TOOL_CONFIGS wiring + session-provisioning config writer).
	//
	// @lore AL7 T3 codex production-bridge: Once T0 lands, this lane hits the
	// PRODUCTION createMcpBridge (stateful) via createMcpRoute at
	// ${server.url}/api/mcp/${token} — not the test-only buildStatefulMcpServer.
	// The rebuildBridge helper will use createMcpBridge once T0 is in.
	//
	// @lore AL7 T3 sanity-break codex: Changing the config-file token to a wrong
	// value → PRODUCTION bridge registry lookup fails (401) → codex gets a tool
	// error → captured stays 0 → assertion fails. Confirms the lane is not vacuous.

	describe("codex CLI (real binary, MCP-routed two-session loop)", () => {
		test.skipIf(!codexInstalled)(
			"FULL BINARY PROOF session-1: real codex calls commit_file → MCP bridge → capturing router (captured>=1)",
			async ({ skip }) => {
				const authed = await codexAuthed();
				if (!authed) {
					skip();
					return;
				}

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
					// Production bridge URL (api/mcp/:token path, not /mcp/:token test override).
					// After T0: testServer routes through createMcpBridge + createMcpRoute.
					// For now the test-only bridge is used and the URL is /mcp/:token.
					const mcpUrl = buildMcpUrl(testServer.url, testServer.token);

					// @lore AL7 T3 codex: Provision .codex-home/ with auth.json + config.toml
					// (copy from ~/.codex). Then call writeCliMcpConfig to append the
					// [mcp_servers.hyperidle] block. This is the T4/T6 production writer.
					// Currently RED: writeCliMcpConfig does not exist yet.
					const { writeCliMcpConfig } = await import("../../harness/cli-mcp-config.js");
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
					const { tokenEnv } = writeCliMcpConfig({
						dialect: "codex-toml",
						sandboxPath: s1SandboxPath,
						mcpUrl,
						token: testServer.token,
					});

					const cleanEnv = buildCleanEnv();
					cleanEnv["CODEX_HOME"] = codexHomeDir;
					// Inject the MCP token env var (codex reads from bearer_token_env_var).
					if (tokenEnv) {
						Object.assign(cleanEnv, tokenEnv);
					}

					const prompt =
						"Use the commit_file MCP tool to write 'al7-proof' to a file named 'proof.txt'. " +
						"You MUST use the commit_file tool — no other tools are available. " +
						"After calling the tool, report what the tool returned.";

					const result = await spawnDetached(
						"codex",
						["exec", prompt, "--json", "--dangerously-bypass-hook-trust"],
						{
							cwd: s1SandboxPath,
							env: cleanEnv,
							timeoutMs: 60_000,
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
			},
			90_000,
		);

		test.skipIf(!codexInstalled)(
			"FULL BINARY PROOF session-2: approve → session-2 executes grant → real file written (AC3, AC8, AC10)",
			async ({ skip }) => {
				const authed = await codexAuthed();
				if (!authed) {
					skip();
					return;
				}

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
					const { writeCliMcpConfig } = await import("../../harness/cli-mcp-config.js");

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
					const { tokenEnv: s1TokenEnv } = writeCliMcpConfig({
						dialect: "codex-toml",
						sandboxPath,
						mcpUrl: s1McpUrl,
						token: testServer.token,
					});

					const cleanEnv = buildCleanEnv();
					cleanEnv["CODEX_HOME"] = codexHomeDir;
					if (s1TokenEnv) Object.assign(cleanEnv, s1TokenEnv);

					const prompt =
						"Use the commit_file MCP tool to write 'al7-proof' to a file named 'proof.txt'. " +
						"You MUST use the commit_file tool — no other tools are available. " +
						"After calling the tool, report what the tool returned.";

					const s1Result = await spawnDetached(
						"codex",
						["exec", prompt, "--json", "--dangerously-bypass-hook-trust"],
						{ cwd: sandboxPath, env: cleanEnv, timeoutMs: 60_000 },
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
					const s2McpUrl = buildMcpUrl(testServer.url, testServer.token);
					const { tokenEnv: s2TokenEnv } = writeCliMcpConfig({
						dialect: "codex-toml",
						sandboxPath,
						mcpUrl: s2McpUrl,
						token: testServer.token,
					});
					const s2Env = { ...cleanEnv };
					if (s2TokenEnv) Object.assign(s2Env, s2TokenEnv);

					const s2Result = await spawnDetached(
						"codex",
						["exec", prompt, "--json", "--dangerously-bypass-hook-trust"],
						{ cwd: sandboxPath, env: s2Env, timeoutMs: 60_000 },
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
			},
			180_000,
		);
	});

	// ── OPENCODE CLI (real binary, MCP-routed two-session loop) ──────────────
	//
	// @lore AL7 T3 opencode: Mirrors the codex lane. Uses a plain sandbox (no git
	// required). writeCliMcpConfig writes opencode.json to the sandbox cwd.
	// The spawn recipe: opencode run <prompt> --format json --pure
	//   --dir <sandbox> --model openrouter/~anthropic/claude-haiku-latest
	// (W4 closure: --model is required; provider-prefixed form per plan §1a.)
	//
	// @lore AL7 T3 opencode W3: opencode --format json emits raw JSONL types
	// like step_finish/tool that may normalize to `unknown` via normalizeHarnessEvent.
	// The session-1 captured>=1 assertion is on the MCP router capture (not event
	// normalization) — the router captures the tool call directly regardless of
	// event normalization. The stdout `step_finish` check verifies the turn completed.
	//
	// @lore AL7 T3 sanity-break opencode: Wrong token in opencode.json → 401 from
	// bridge registry → opencode gets a tool error → captured stays 0 → assertion fails.

	describe("opencode CLI (real binary, MCP-routed two-session loop)", () => {
		test.skipIf(!opencodeInstalled)(
			"FULL BINARY PROOF session-1: real opencode calls commit_file → MCP bridge → capturing router (captured>=1)",
			async ({ skip }) => {
				const authed = await opencodeAuthed();
				if (!authed) {
					skip();
					return;
				}

				const s1SandboxPath = fs.mkdtempSync(path.join(sandboxBasePath, "opencode-s1-"));
				const testSessionId = `al7-rh-oc-s1-${Math.random().toString(36).slice(2, 10)}`;

				const testServer = await startAl7TestServer(s1SandboxPath, testSessionId);

				try {
					const mcpUrl = buildMcpUrl(testServer.url, testServer.token);

					// @lore AL7 T3 opencode: writeCliMcpConfig writes opencode.json to sandboxPath.
					// Currently RED: writeCliMcpConfig does not exist yet (T4).
					const { writeCliMcpConfig } = await import("../../harness/cli-mcp-config.js");
					writeCliMcpConfig({
						dialect: "opencode-json",
						sandboxPath: s1SandboxPath,
						mcpUrl,
						token: testServer.token,
					});

					const cleanEnv = buildCleanEnv();

					// W4: --model must be provider-prefixed (openrouter/~anthropic/claude-haiku-latest).
					// This is the real-harness hardcoded known-good model id (AL6 recipe).
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
							"openrouter/~anthropic/claude-haiku-latest",
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
			},
			90_000,
		);

		test.skipIf(!opencodeInstalled)(
			"FULL BINARY PROOF session-2: approve → session-2 executes grant → real file written (AC4, AC8, AC10)",
			async ({ skip }) => {
				const authed = await opencodeAuthed();
				if (!authed) {
					skip();
					return;
				}

				const sandboxPath = fs.mkdtempSync(path.join(sandboxBasePath, "opencode-s2loop-"));
				const testSessionId = `al7-rh-oc-s2-${Math.random().toString(36).slice(2, 10)}`;

				const testServer = await startAl7TestServer(sandboxPath, testSessionId);

				try {
					const { writeCliMcpConfig } = await import("../../harness/cli-mcp-config.js");

					// ── Session 1 ──────────────────────────────────────────────────────
					const s1McpUrl = buildMcpUrl(testServer.url, testServer.token);
					writeCliMcpConfig({
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
							"openrouter/~anthropic/claude-haiku-latest",
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
					writeCliMcpConfig({
						dialect: "opencode-json",
						sandboxPath,
						mcpUrl: s2McpUrl,
						token: testServer.token,
					});

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
							"openrouter/~anthropic/claude-haiku-latest",
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

					// W3: opencode emits step_finish (or turn.completed) when done.
					// The stdout is raw JSONL — step_finish is the opencode turn-end marker.
					// (normalizeHarnessEvent may map this to unknown today — T6 fixes that;
					// this assertion is on the raw stdout which the MCP router doesn't depend on.)
					const hasCompletion =
						s2Result.stdout.includes("step_finish") ||
						s2Result.stdout.includes("turn.completed");
					expect(hasCompletion).toBe(true);
				} finally {
					await testServer.close();
				}
			},
			180_000,
		);
	});
});
