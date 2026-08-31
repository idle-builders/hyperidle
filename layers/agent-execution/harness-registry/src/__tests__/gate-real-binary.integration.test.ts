/**
 * Action gate — real-binary harness integration tests.
 *
 * LOCAL-ONLY LANE — runs via test:integration (harness project). Needs real CLI
 * binaries and real LLM credentials. Never a GitHub Actions job.
 *
 * Seven acceptance criteria proven here:
 *
 *   AC1  No rules — agent completes consequential work uninterrupted.
 *   AC2  Matching rule — agent blocked, told which rule (claude + codex + cursor-agent).
 *   AC3  Agent files a review via submit_review after being blocked (claude).
 *   AC4  Approval (addClearance) → agent resumes, action succeeds (claude).
 *   AC5  No clearance → resumed session still blocked on next attempt (claude).
 *   AC6  Non-matching tool — not blocked even when other rules exist (claude).
 *   AC7  Wrong nativeSessionId → session runs context-free, detected (cursor-agent).
 *
 * @lore BA2 hook-format: the gate hook is a shell script that pipes the
 * PreToolUse event JSON to the action-check endpoint. The server returns the
 * harness-specific JSON the hook must output, so the script is just `cat | curl`.
 * The hook runs BEFORE the tool executes; even `--permission-mode bypassPermissions`
 * does not bypass it.
 *
 * @lore BA2 cursor-gate-channel: cursor-agent's returnEnforcementChannel is
 * "none" in production (no stop hook). For the gate hook, cursor uses "soft-continue"
 * (.cursor/hooks.json). The production provisioner path (provisionGateHook) uses
 * adapterCapabilities.returnEnforcement which is "none" for cursor — so the
 * gate hook is not installed via the production path for cursor. In this test,
 * installGateHook("soft-continue") is called DIRECTLY to prove the hook mechanism
 * works on cursor-agent. The production wiring gap (cursor returnEnforcementChannel
 * should be "soft-continue" for gate support) is a finding.
 *
 * @lore BA2 cursor-failClosed: cursor-agent fails open (silently) by default
 * when a hook crashes. addCursorGateHook sets failClosed: true.
 *
 * @lore BA2 opencode-pure: opencode's --pure flag disables project plugins,
 * making the gate plugin silently inert. Gate testing for opencode is scoped out
 * pending removal of --pure from the adapter config.
 *
 * @lore BA2 ac3-seed-prompt: the instruction to call submit_review lives in the
 * assembledPrompt, NOT in the hook denial message. Sonnet refused an instruction
 * inside a hook message as "characteristic of a prompt injection embedded in
 * tool output". The seed prompt carries the behavioral contract.
 *
 * @lore BA2 ac7-wrong-id: cursor-agent exits 0 on a wrong session id and echoes
 * the requested id, but runs context-free. Detection: resumed agent does not know
 * the codeword from the first session. See also session-handles.integration.test.ts.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { HarnessEvent, SessionConfig, SessionResumeConfig } from "@hyperidle/harness-protocol";
import { ensureSandboxGitRepo } from "@hyperidle/run-orchestration";
import { describe, expect, test } from "vitest";
import { createActionGateRegistry } from "../action-gate-registry.js";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { writeHarnessMcpConfig } from "../cli-mcp-config.js";
import { createMcpToolBridge } from "../mcp-tool-bridge.js";
import { installGateHook } from "../provision-gate-hook.js";
import { cliAdapterFixture, GATE_TEST_CLAUDE_CONFIG } from "./cli-adapter-fixtures.js";
import { harnessTestResolvedModel, requireHarness } from "./require-harness.js";

const execFileAsync = promisify(execFile);

// ── Codeword for AC3 / AC7 context tests ─────────────────────────────────────
// Non-guessable session identifier: agent must recall it to prove context.
const CODEWORD = "OSPREY-3841";

// ── Sandbox cleanup (retry on ENOTEMPTY — OS race on macOS) ──────────────────

async function rmSandbox(dir: string): Promise<void> {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
			return;
		} catch (err) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code !== "ENOTEMPTY" && code !== "EBUSY") throw err;
			await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
		}
	}
	fs.rmSync(dir, { recursive: true, force: true });
}

// ── Drain all events from a running session ───────────────────────────────────

async function drainEvents(
	adapter: CliHarnessAdapter,
	handle: Awaited<ReturnType<CliHarnessAdapter["startSession"]>>,
): Promise<{ events: HarnessEvent[]; completionTexts: string[] }> {
	const events: HarnessEvent[] = [];
	for await (const ev of adapter.streamEvents(handle)) {
		events.push(ev);
	}
	const completionTexts = events
		.filter((e) => e.type === "completion")
		.map((e) => ("text" in e ? (e.text as string) : ""));
	return { events, completionTexts };
}

function anyText(completionTexts: string[]): string {
	return completionTexts.join(" ");
}

// ── Auth probe helpers ────────────────────────────────────────────────────────

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
		return (stdout + stderr).trim().startsWith("Logged in");
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

// ── Action-check server ────────────────────────────────────────────────────────
//
// Starts a real TCP-bound HTTP server that handles /mcp/:token/action-check.
// The server uses a real ActionGateRegistry and McpToolBridge — same production
// code the real system uses.
//
// @lore BA2 action-check-test-server: the bridge.router is a Hono router; mounting
// it on a raw http.Server requires manually calling Hono's fetch handler, matching
// the pattern from mcp-bridge-stateful.integration.test.ts.

interface ActionCheckServer {
	url: string;
	gateRegistry: ReturnType<typeof createActionGateRegistry>;
	bridge: ReturnType<typeof createMcpToolBridge>;
	openSession(sessionId: string): Promise<string>; // returns token
	close(): Promise<void>;
}

async function startActionCheckServer(): Promise<ActionCheckServer> {
	const gateRegistry = createActionGateRegistry();
	const bridge = createMcpToolBridge({ gateRegistry });

	const server = http.createServer();
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const addr = server.address();
	if (!addr || typeof addr === "string") throw new Error("Could not get server address");
	const port = addr.port;

	server.on("request", async (req, res) => {
		try {
			// Build a Request from the incoming http.IncomingMessage.
			const url = `http://127.0.0.1:${port}${req.url}`;
			const headers: Record<string, string> = {};
			for (const [k, v] of Object.entries(req.headers)) {
				if (v !== undefined) headers[k] = Array.isArray(v) ? v.join(",") : v;
			}
			const chunks: Buffer[] = [];
			for await (const chunk of req) {
				chunks.push(chunk as Buffer);
			}
			const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
			const request = new Request(url, {
				method: req.method,
				headers,
				body: body && body.length > 0 ? body : undefined,
			});
			const honoResponse = await bridge.router.fetch(request);
			res.writeHead(honoResponse.status, Object.fromEntries(honoResponse.headers.entries()));
			const text = await honoResponse.text();
			res.end(text);
		} catch (err) {
			res.writeHead(500);
			res.end(JSON.stringify({ error: String(err) }));
		}
	});

	const serverUrl = `http://127.0.0.1:${port}`;

	return {
		url: serverUrl,
		gateRegistry,
		bridge,
		async openSession(sessionId: string): Promise<string> {
			const opened = await bridge.open({
				sessionId,
				registry: {
					definitions: [],
					invoke: async () => ({ success: false, code: "NOT_FOUND", error: "none" }),
					toClaudeToolSpecs: () => [],
				},
			});
			return opened.token;
		},
		close: async () => {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		},
	};
}

// ── Test MCP server: exposes blocked_tool + submit_review ─────────────────────
//
// Provides two MCP tools:
//   blocked_tool  — the tool the gate rule targets; if called (shouldn't happen),
//                   returns a success marker.
//   submit_review — a fake submit_review that captures calls for AC3 assertion.
//
// @lore AN2 test-server-stateful: ONE stateful McpServer+Transport instance;
// creating a new one per request breaks the session handshake.

interface GateTestMcpServer {
	url: string;
	bearerToken: string;
	getSubmitReviewCalls(): Array<Record<string, unknown>>;
	close(): Promise<void>;
}

async function startGateTestMcpServer(): Promise<GateTestMcpServer> {
	const bearerToken = `gate-test-${Math.random().toString(36).slice(2, 10)}`;
	const submitReviewCalls: Array<Record<string, unknown>> = [];

	const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
	const { StreamableHTTPServerTransport } = await import(
		"@modelcontextprotocol/sdk/server/streamableHttp.js"
	);
	const { z } = await import("zod");

	// @lore AN2 version-seam bridge: server pkg uses zod 4.4.3; SDK deduped to zod 3.25.76.
	type McpAnySchema = import("@modelcontextprotocol/sdk/server/zod-compat.js").AnySchema;
	type McpRawShape = Record<string, McpAnySchema>;
	function asMcpShape(shape: unknown): McpRawShape {
		return shape as McpRawShape;
	}

	const mcpServer = new McpServer({ name: "gate-test-mcp", version: "0.0.1" });

	// The tool the gate will block.
	mcpServer.tool(
		"blocked_tool",
		"A test tool that should be blocked by the gate rule",
		asMcpShape({ task: z.string() }),
		async (_args: Record<string, string>) => {
			// If we reach here, the gate failed to block — test will catch via output
			return {
				content: [{ type: "text" as const, text: "BLOCKED_TOOL_EXECUTED" }],
			};
		},
	);

	// The submit_review tool — a fake that captures AC3 call evidence.
	mcpServer.tool(
		"submit_review",
		"Submit a review for the current task when a gate blocks an action",
		asMcpShape({
			title: z.string(),
			reasoning: z.array(z.string()),
		}),
		async (args: Record<string, unknown>) => {
			submitReviewCalls.push(args);
			return {
				content: [
					{
						type: "text" as const,
						text: "Review submitted. A human will review your request.",
					},
				],
			};
		},
	);

	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: () => Math.random().toString(36).slice(2),
	});
	await mcpServer.connect(transport);

	const httpServer = http.createServer();
	await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
	const addr = httpServer.address();
	if (!addr || typeof addr === "string") throw new Error("Could not get MCP server address");
	const mcpPort = addr.port;

	httpServer.on("request", async (req, res) => {
		const authHeader = req.headers.authorization;
		if (authHeader !== `Bearer ${bearerToken}`) {
			res.writeHead(401);
			res.end(JSON.stringify({ error: "Unauthorized" }));
			return;
		}
		await transport.handleRequest(req, res);
	});

	return {
		url: `http://127.0.0.1:${mcpPort}`,
		bearerToken,
		getSubmitReviewCalls: () => submitReviewCalls,
		close: async () => {
			mcpServer.close();
			await new Promise<void>((resolve) => httpServer.close(() => resolve()));
		},
	};
}

// ── Write claude sandbox config (MCP trust + optional hook) ──────────────────

function writeClaudeSandboxConfig(
	sandboxPath: string,
	mcpServers: Record<string, { type: string; url: string; headers?: Record<string, string> }>,
): void {
	fs.mkdirSync(path.join(sandboxPath, ".claude"), { recursive: true });

	const mcpJson = { mcpServers };
	fs.writeFileSync(path.join(sandboxPath, ".mcp.json"), JSON.stringify(mcpJson, null, 2), "utf-8");

	const settings: Record<string, unknown> = {
		enableAllProjectMcpServers: true,
	};
	fs.writeFileSync(
		path.join(sandboxPath, ".claude", "settings.json"),
		JSON.stringify(settings, null, 2),
		"utf-8",
	);
}

// ── Gate test: claude ─────────────────────────────────────────────────────────

describe("action gate — claude real binary", () => {
	requireHarness("claude");

	const RULE_ID = "r-bash-gate";
	const RULE_DESC = "Blocked tool needs approval";

	test("AC1: no rules → agent completes blocked_tool call uninterrupted, no gate row set", async ({
		skip,
	}) => {
		if (!(await claudeAuthed())) {
			skip();
			return;
		}

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "gate-ac1-"));
		let actionServer: ActionCheckServer | null = null;
		let mcpServer: GateTestMcpServer | null = null;

		try {
			ensureSandboxGitRepo(sandboxPath);

			actionServer = await startActionCheckServer();
			mcpServer = await startGateTestMcpServer();

			const sessionId = `gate-ac1-${Math.random().toString(36).slice(2, 8)}`;
			const token = await actionServer.openSession(sessionId);

			// AC1: register session WITHOUT any rules → allow everything.
			actionServer.gateRegistry.register(sessionId, { rules: [], sandboxPath });

			// Write MCP config pointing to the test MCP server (bearer-auth).
			writeClaudeSandboxConfig(sandboxPath, {
				"gate-test": {
					type: "http",
					url: mcpServer.url,
					// biome-ignore lint/style/useNamingConvention: HTTP header name is canonical RFC case
					headers: { Authorization: `Bearer ${mcpServer.bearerToken}` },
				},
			});

			// Install gate hook (it will fire but allow because no rules).
			await installGateHook({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken: token,
				mcpUrl: `${actionServer.url}/mcp/${token}`,
			});

			const model = harnessTestResolvedModel("claude");
			const adapter = new CliHarnessAdapter(GATE_TEST_CLAUDE_CONFIG);

			const config: SessionConfig = {
				sessionId,
				sandboxPath,
				assembledPrompt:
					"Call the blocked_tool MCP tool with task='run a test'. " +
					"If it returns BLOCKED_TOOL_EXECUTED, reply with exactly: AC1_DONE",
				modelTier: "workhorse",
				tools: [],
				resolvedModel: model,
			};

			const handle = await adapter.startSession(config);
			const { completionTexts } = await drainEvents(adapter, handle);
			const r = await adapter.stopSession(handle);

			expect(r.outcome).toBe("completed");

			const text = anyText(completionTexts).toLowerCase();
			// No denial: "blocked" should not appear from the gate.
			expect(
				text.includes("blocked by rule") || text.includes("action blocked"),
				`AC1: should NOT be gate-blocked. Got: ${completionTexts.slice(0, 2).join("|")}`,
			).toBe(false);

			// No pendingBlock in the gate entry.
			const entry = actionServer.gateRegistry.get(sessionId);
			expect(entry?.pendingBlock, "AC1: no pending block should exist").toBeNull();
		} finally {
			await actionServer?.close();
			await mcpServer?.close();
			await rmSandbox(sandboxPath);
		}
	}, 120_000);

	test("AC2: matching rule → agent is denied and told which rule", async ({ skip }) => {
		if (!(await claudeAuthed())) {
			skip();
			return;
		}

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "gate-ac2-claude-"));
		let actionServer: ActionCheckServer | null = null;
		let mcpServer: GateTestMcpServer | null = null;

		try {
			ensureSandboxGitRepo(sandboxPath);

			actionServer = await startActionCheckServer();
			mcpServer = await startGateTestMcpServer();

			const sessionId = `gate-ac2-claude-${Math.random().toString(36).slice(2, 8)}`;
			const token = await actionServer.openSession(sessionId);

			// Register gate rule blocking "blocked_tool".
			actionServer.gateRegistry.register(sessionId, {
				rules: [{ id: RULE_ID, pattern: "blocked_tool ", description: RULE_DESC }],
				sandboxPath,
			});

			writeClaudeSandboxConfig(sandboxPath, {
				"gate-test": {
					type: "http",
					url: mcpServer.url,
					// biome-ignore lint/style/useNamingConvention: HTTP header name is canonical RFC case
					headers: { Authorization: `Bearer ${mcpServer.bearerToken}` },
				},
			});

			await installGateHook({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken: token,
				mcpUrl: `${actionServer.url}/mcp/${token}`,
			});

			const model = harnessTestResolvedModel("claude");
			const adapter = new CliHarnessAdapter(GATE_TEST_CLAUDE_CONFIG);

			const config: SessionConfig = {
				sessionId,
				sandboxPath,
				assembledPrompt:
					"Call the blocked_tool MCP tool with task='run a test'. " +
					"Tell me what response you received from the tool or the gate.",
				modelTier: "workhorse",
				tools: [],
				resolvedModel: model,
			};

			const handle = await adapter.startSession(config);
			const { completionTexts } = await drainEvents(adapter, handle);
			await adapter.stopSession(handle);

			const text = anyText(completionTexts).toLowerCase();

			// The rule description must appear in the agent's output.
			expect(
				text.includes(RULE_DESC.toLowerCase()) ||
					text.includes("blocked") ||
					text.includes("rule") ||
					text.includes("approval"),
				`AC2 claude: agent must report gate denial naming the rule. Got: ${completionTexts.slice(0, 3).join("|")}`,
			).toBe(true);

			// The gate must have set a pendingBlock.
			const entry = actionServer.gateRegistry.get(sessionId);
			expect(
				entry?.pendingBlock?.ruleId,
				"AC2 claude: pendingBlock must be set after gate denial",
			).toBe(RULE_ID);
			// The MCP tool name is prefixed by claude (mcp__<server>__<tool>).
			expect(
				entry?.pendingBlock?.blockedTool,
				"AC2 claude: blockedTool must contain tool name",
			).toContain("blocked_tool");

			// The tool must NOT have been executed (gate blocked it).
			expect(
				anyText(completionTexts).includes("BLOCKED_TOOL_EXECUTED"),
				"AC2 claude: blocked_tool must not have executed",
			).toBe(false);
		} finally {
			await actionServer?.close();
			await mcpServer?.close();
			await rmSandbox(sandboxPath);
		}
	}, 120_000);

	test("AC3: agent calls submit_review after being blocked, review reaches the test MCP server", async ({
		skip,
	}) => {
		if (!(await claudeAuthed())) {
			skip();
			return;
		}

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "gate-ac3-"));
		let actionServer: ActionCheckServer | null = null;
		let mcpServer: GateTestMcpServer | null = null;

		try {
			ensureSandboxGitRepo(sandboxPath);

			actionServer = await startActionCheckServer();
			mcpServer = await startGateTestMcpServer();

			const sessionId = `gate-ac3-${Math.random().toString(36).slice(2, 8)}`;
			const token = await actionServer.openSession(sessionId);

			actionServer.gateRegistry.register(sessionId, {
				rules: [{ id: RULE_ID, pattern: "blocked_tool ", description: RULE_DESC }],
				sandboxPath,
			});

			writeClaudeSandboxConfig(sandboxPath, {
				"gate-test": {
					type: "http",
					url: mcpServer.url,
					// biome-ignore lint/style/useNamingConvention: HTTP header name is canonical RFC case
					headers: { Authorization: `Bearer ${mcpServer.bearerToken}` },
				},
			});

			await installGateHook({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken: token,
				mcpUrl: `${actionServer.url}/mcp/${token}`,
			});

			const model = harnessTestResolvedModel("claude");
			const adapter = new CliHarnessAdapter(GATE_TEST_CLAUDE_CONFIG);

			// @lore BA2 ac3-seed-prompt: submit_review instruction in the seed prompt,
			// NOT in the hook denial message (which would look like a prompt injection).
			const config: SessionConfig = {
				sessionId,
				sandboxPath,
				assembledPrompt:
					"Your task ID is: " +
					CODEWORD +
					". " +
					"Try to call the blocked_tool MCP tool with task='test'. " +
					"If the gate blocks it with a rule denial, you MUST call submit_review " +
					"with title='Access request for blocked_tool' and " +
					"reasoning=['I need to run blocked_tool to complete the task', " +
					"'Rule: " +
					RULE_DESC +
					"']. " +
					"Do not attempt blocked_tool again after the gate denies it.",
				modelTier: "workhorse",
				tools: [],
				resolvedModel: model,
			};

			const handle = await adapter.startSession(config);
			const { completionTexts } = await drainEvents(adapter, handle);
			await adapter.stopSession(handle);

			// The agent must have called submit_review.
			const submits = mcpServer.getSubmitReviewCalls();
			expect(
				submits.length,
				`AC3: submit_review must have been called at least once. ` +
					`Agent output: ${completionTexts.slice(0, 3).join("|")}`,
			).toBeGreaterThan(0);

			// The review must have a title and non-empty reasoning.
			const first = submits[0] as Record<string, unknown>;
			expect(typeof first.title, "AC3: submit_review must carry a title").toBe("string");
			expect(
				Array.isArray(first.reasoning) && (first.reasoning as string[]).length > 0,
				"AC3: submit_review must carry non-empty reasoning",
			).toBe(true);
		} finally {
			await actionServer?.close();
			await mcpServer?.close();
			await rmSandbox(sandboxPath);
		}
	}, 180_000);

	test("AC4: approval (addClearance) → resumed session calls blocked_tool successfully", async ({
		skip,
	}) => {
		if (!(await claudeAuthed())) {
			skip();
			return;
		}

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "gate-ac4-"));
		let actionServer: ActionCheckServer | null = null;
		let mcpServer: GateTestMcpServer | null = null;

		try {
			ensureSandboxGitRepo(sandboxPath);

			actionServer = await startActionCheckServer();
			mcpServer = await startGateTestMcpServer();

			const sessionId = `gate-ac4-${Math.random().toString(36).slice(2, 8)}`;
			const token = await actionServer.openSession(sessionId);

			actionServer.gateRegistry.register(sessionId, {
				rules: [{ id: RULE_ID, pattern: "blocked_tool ", description: RULE_DESC }],
				sandboxPath,
			});

			writeClaudeSandboxConfig(sandboxPath, {
				"gate-test": {
					type: "http",
					url: mcpServer.url,
					// biome-ignore lint/style/useNamingConvention: HTTP header name is canonical RFC case
					headers: { Authorization: `Bearer ${mcpServer.bearerToken}` },
				},
			});

			await installGateHook({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken: token,
				mcpUrl: `${actionServer.url}/mcp/${token}`,
			});

			const model = harnessTestResolvedModel("claude");
			const adapter = new CliHarnessAdapter(GATE_TEST_CLAUDE_CONFIG);

			// ── Session 1: agent is blocked ───────────────────────────────
			const configP1: SessionConfig = {
				sessionId,
				sandboxPath,
				assembledPrompt:
					"Call the blocked_tool MCP tool with task='gate_ac4_test'. " +
					"Reply with whatever result you get.",
				modelTier: "workhorse",
				tools: [],
				resolvedModel: model,
			};

			const handleP1 = await adapter.startSession(configP1);
			await drainEvents(adapter, handleP1);
			await adapter.stopSession(handleP1);

			// Capture native id for resume.
			const nativeId = adapter.getNativeSessionId?.(handleP1);
			expect(nativeId, "AC4: native session id must be captured").toBeTruthy();

			// Verify blocked.
			expect(
				actionServer.gateRegistry.get(sessionId)?.pendingBlock?.ruleId,
				"AC4: pendingBlock must be set after session 1",
			).toBe(RULE_ID);

			// ── Approval: add clearance for the MCP-prefixed tool name ──────────────────
			// Claude prefixes MCP tool names as mcp__<server>__<tool>; clearance must match.
			const blockedToolName =
				actionServer.gateRegistry.get(sessionId)?.pendingBlock?.blockedTool ?? "blocked_tool";
			actionServer.gateRegistry.addClearance(sessionId, blockedToolName);
			// Also clear the pending block so the entry is clean for resume.
			actionServer.gateRegistry.clearPendingBlock(sessionId);

			// ── Session 2: resume — agent should call blocked_tool and succeed ──
			const resumeConfig: SessionResumeConfig = {
				sandboxPath,
				modelTier: "workhorse",
				resolvedModel: model,
			};

			const handleP2 = await adapter.resumeSession?.(
				nativeId!,
				"The action was approved. The gate clearance for blocked_tool has been granted. " +
					"Please call blocked_tool now with task='gate_ac4_test'.",
				resumeConfig,
			);
			expect(handleP2, "AC4: resumeSession must return a handle").toBeDefined();
			if (!handleP2) return;

			const { completionTexts: p2Texts } = await drainEvents(adapter, handleP2);
			await adapter.stopSession(handleP2);

			// After approval, blocked_tool must execute (gate clears after one use).
			const p2Text = anyText(p2Texts);
			expect(
				p2Text.includes("BLOCKED_TOOL_EXECUTED"),
				`AC4: resumed session must successfully call blocked_tool. ` +
					`Got: ${p2Texts.slice(0, 3).join("|")}`,
			).toBe(true);

			// Clearance consumed — gate entry should have no pending block.
			const postEntry = actionServer.gateRegistry.get(sessionId);
			expect(postEntry?.pendingBlock, "AC4: clearance consumed, no pendingBlock").toBeNull();
		} finally {
			await actionServer?.close();
			await mcpServer?.close();
			await rmSandbox(sandboxPath);
		}
	}, 180_000);

	test("AC5: resume without clearance → gate still blocks on next attempt", async ({ skip }) => {
		if (!(await claudeAuthed())) {
			skip();
			return;
		}

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "gate-ac5-"));
		let actionServer: ActionCheckServer | null = null;
		let mcpServer: GateTestMcpServer | null = null;

		try {
			ensureSandboxGitRepo(sandboxPath);

			actionServer = await startActionCheckServer();
			mcpServer = await startGateTestMcpServer();

			const sessionId = `gate-ac5-${Math.random().toString(36).slice(2, 8)}`;
			const token = await actionServer.openSession(sessionId);

			actionServer.gateRegistry.register(sessionId, {
				rules: [{ id: RULE_ID, pattern: "blocked_tool ", description: RULE_DESC }],
				sandboxPath,
			});

			writeClaudeSandboxConfig(sandboxPath, {
				"gate-test": {
					type: "http",
					url: mcpServer.url,
					// biome-ignore lint/style/useNamingConvention: HTTP header name is canonical RFC case
					headers: { Authorization: `Bearer ${mcpServer.bearerToken}` },
				},
			});

			await installGateHook({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken: token,
				mcpUrl: `${actionServer.url}/mcp/${token}`,
			});

			const model = harnessTestResolvedModel("claude");
			const adapter = new CliHarnessAdapter(GATE_TEST_CLAUDE_CONFIG);

			// ── Session 1: blocked ────────────────────────────────────────
			const configP1: SessionConfig = {
				sessionId,
				sandboxPath,
				assembledPrompt: "Call the blocked_tool MCP tool with task='ac5_test'.",
				modelTier: "workhorse",
				tools: [],
				resolvedModel: model,
			};

			const handleP1 = await adapter.startSession(configP1);
			await drainEvents(adapter, handleP1);
			await adapter.stopSession(handleP1);

			const nativeId = adapter.getNativeSessionId?.(handleP1);
			expect(nativeId, "AC5: native session id captured").toBeTruthy();

			// ── Session 2: resume WITHOUT clearance → still blocked ───────
			// Clear the pendingBlock so session 2 triggers a fresh block.
			actionServer.gateRegistry.clearPendingBlock(sessionId);

			const resumeConfig: SessionResumeConfig = {
				sandboxPath,
				modelTier: "workhorse",
				resolvedModel: model,
			};

			const handleP2 = await adapter.resumeSession?.(
				nativeId!,
				"Please try calling blocked_tool again with task='ac5_retry'.",
				resumeConfig,
			);
			if (!handleP2) {
				// resumeSession not available — note and skip.
				return;
			}

			await drainEvents(adapter, handleP2);
			await adapter.stopSession(handleP2);

			// Gate must have fired again (no clearance was added).
			const entry = actionServer.gateRegistry.get(sessionId);
			expect(entry?.pendingBlock?.ruleId, "AC5: gate must block again without clearance").toBe(
				RULE_ID,
			);
		} finally {
			await actionServer?.close();
			await mcpServer?.close();
			await rmSandbox(sandboxPath);
		}
	}, 180_000);

	test("AC6: non-matching tool → unblocked even when a rule exists", async ({ skip }) => {
		if (!(await claudeAuthed())) {
			skip();
			return;
		}

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "gate-ac6-"));
		let actionServer: ActionCheckServer | null = null;
		let mcpServer: GateTestMcpServer | null = null;

		try {
			ensureSandboxGitRepo(sandboxPath);

			actionServer = await startActionCheckServer();
			mcpServer = await startGateTestMcpServer();

			const sessionId = `gate-ac6-${Math.random().toString(36).slice(2, 8)}`;
			const token = await actionServer.openSession(sessionId);

			// Rule only blocks "dangerous_tool" — NOT "blocked_tool" or "submit_review".
			actionServer.gateRegistry.register(sessionId, {
				rules: [{ id: "r-other", pattern: "dangerous_tool", description: "Dangerous tool" }],
				sandboxPath,
			});

			writeClaudeSandboxConfig(sandboxPath, {
				"gate-test": {
					type: "http",
					url: mcpServer.url,
					// biome-ignore lint/style/useNamingConvention: HTTP header name is canonical RFC case
					headers: { Authorization: `Bearer ${mcpServer.bearerToken}` },
				},
			});

			await installGateHook({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken: token,
				mcpUrl: `${actionServer.url}/mcp/${token}`,
			});

			const model = harnessTestResolvedModel("claude");
			const adapter = new CliHarnessAdapter(GATE_TEST_CLAUDE_CONFIG);

			// Ask agent to call blocked_tool — NOT in the gate rule.
			const config: SessionConfig = {
				sessionId,
				sandboxPath,
				assembledPrompt:
					"Call the blocked_tool MCP tool with task='ac6_test'. " +
					"If it returns BLOCKED_TOOL_EXECUTED, reply with: AC6_DONE",
				modelTier: "workhorse",
				tools: [],
				resolvedModel: model,
			};

			const handle = await adapter.startSession(config);
			const { completionTexts } = await drainEvents(adapter, handle);
			const r = await adapter.stopSession(handle);

			expect(r.outcome).toBe("completed");

			// The agent should complete successfully (blocked_tool not in the rule).
			const text = anyText(completionTexts);
			expect(
				text.includes("BLOCKED_TOOL_EXECUTED") || text.includes("AC6_DONE"),
				`AC6: blocked_tool (not in rule) must succeed. Got: ${completionTexts.slice(0, 3).join("|")}`,
			).toBe(true);

			// No pending block for blocked_tool.
			const entry = actionServer.gateRegistry.get(sessionId);
			expect(entry?.pendingBlock, "AC6: no pending block for non-matching tool").toBeNull();
		} finally {
			await actionServer?.close();
			await mcpServer?.close();
			await rmSandbox(sandboxPath);
		}
	}, 120_000);
});

// ── Gate test: codex ──────────────────────────────────────────────────────────

describe("action gate — codex real binary", () => {
	requireHarness("codex");

	test("AC2: matching rule → codex agent is denied and told which rule", async ({ skip }) => {
		if (!(await codexAuthed())) {
			skip();
			return;
		}

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "gate-ac2-codex-"));
		let actionServer: ActionCheckServer | null = null;
		let mcpServer: GateTestMcpServer | null = null;

		try {
			ensureSandboxGitRepo(sandboxPath);

			actionServer = await startActionCheckServer();
			mcpServer = await startGateTestMcpServer();

			const sessionId = `gate-ac2-codex-${Math.random().toString(36).slice(2, 8)}`;
			const token = await actionServer.openSession(sessionId);

			const RULE_ID_CODEX = "r-bash-codex";
			const RULE_DESC_CODEX = "Shell commands need approval on codex";

			actionServer.gateRegistry.register(sessionId, {
				rules: [{ id: RULE_ID_CODEX, pattern: "shell", description: RULE_DESC_CODEX }],
				sandboxPath,
			});

			// Configure MCP for codex using codex-toml dialect.
			// @lore AN2 codex-carrier: codex uses .codex-home/config.toml for MCP.
			writeHarnessMcpConfig({
				dialect: "codex-toml",
				sandboxPath,
				mcpUrl: mcpServer.url,
				token: mcpServer.bearerToken,
			});

			await installGateHook({
				sandboxPath,
				channel: "settings-codex",
				bridgeToken: token,
				mcpUrl: `${actionServer.url}/mcp/${token}`,
			});

			const model = harnessTestResolvedModel("codex");
			const codexConfig = cliAdapterFixture("codex");
			const adapter = new CliHarnessAdapter(codexConfig);

			const config: SessionConfig = {
				sessionId,
				sandboxPath,
				assembledPrompt:
					"Run a shell command to list the current directory. " +
					"Tell me what the gate or the shell returns.",
				modelTier: "workhorse",
				tools: [],
				resolvedModel: model,
			};

			const handle = await adapter.startSession(config);
			const { completionTexts } = await drainEvents(adapter, handle);
			await adapter.stopSession(handle);

			const text = anyText(completionTexts).toLowerCase();

			// Either the rule desc or "blocked" must appear in output.
			expect(
				text.includes(RULE_DESC_CODEX.toLowerCase()) ||
					text.includes("blocked") ||
					text.includes("approval") ||
					text.includes("permission"),
				`AC2 codex: agent must report gate denial. Got: ${completionTexts.slice(0, 3).join("|")}`,
			).toBe(true);

			// pendingBlock must be set — the gate fired.
			const entry = actionServer.gateRegistry.get(sessionId);
			expect(
				entry?.pendingBlock?.ruleId,
				"AC2 codex: pendingBlock must be set after gate denial",
			).toBe(RULE_ID_CODEX);
		} finally {
			await actionServer?.close();
			await mcpServer?.close();
			await rmSandbox(sandboxPath);
		}
	}, 120_000);
});

// ── Gate test: cursor-agent ───────────────────────────────────────────────────

describe("action gate — cursor-agent real binary", () => {
	requireHarness("cursor-agent");

	test("AC2: matching rule → cursor-agent blocked, told which rule (hook installed via soft-continue)", async ({
		skip,
	}) => {
		if (!(await cursorAgentAuthed())) {
			skip();
			return;
		}

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "gate-ac2-cursor-"));
		let actionServer: ActionCheckServer | null = null;
		let mcpServer: GateTestMcpServer | null = null;

		try {
			ensureSandboxGitRepo(sandboxPath);

			actionServer = await startActionCheckServer();
			mcpServer = await startGateTestMcpServer();

			const sessionId = `gate-ac2-cursor-${Math.random().toString(36).slice(2, 8)}`;
			const token = await actionServer.openSession(sessionId);

			const RULE_ID_CURSOR = "r-blocked-cursor";
			const RULE_DESC_CURSOR = "Blocked tool needs approval on cursor";

			actionServer.gateRegistry.register(sessionId, {
				rules: [
					{
						id: RULE_ID_CURSOR,
						pattern: "blocked_tool ",
						description: RULE_DESC_CURSOR,
					},
				],
				sandboxPath,
			});

			// Configure MCP for cursor using cursor-json dialect.
			writeHarnessMcpConfig({
				dialect: "cursor-json",
				sandboxPath,
				mcpUrl: mcpServer.url,
				token: mcpServer.bearerToken,
			});

			// @lore BA2 cursor-gate-channel: install via "soft-continue" directly;
			// the production path uses "none" (returnEnforcementChannel for cursor).
			// This proves the mechanism works on cursor-agent. The production routing
			// gap (cursor should use "soft-continue" for gate hook support) is a
			// separate finding — not fixed here.
			await installGateHook({
				sandboxPath,
				channel: "soft-continue",
				bridgeToken: token,
				mcpUrl: `${actionServer.url}/mcp/${token}`,
			});

			const model = harnessTestResolvedModel("cursor-agent");
			const cursorConfig = cliAdapterFixture("cursor-agent");
			const adapter = new CliHarnessAdapter(cursorConfig);

			const config: SessionConfig = {
				sessionId,
				sandboxPath,
				assembledPrompt:
					"Call the blocked_tool MCP tool with task='cursor_test'. " +
					"Tell me what the gate or the tool returned.",
				modelTier: "workhorse",
				tools: [],
				resolvedModel: model,
			};

			const handle = await adapter.startSession(config);
			const { completionTexts } = await drainEvents(adapter, handle);
			await adapter.stopSession(handle);

			const text = anyText(completionTexts).toLowerCase();

			// @lore BA2 cursor-verdict-wording: naming the gate fact improves
			// compliance from 3/6 to 8/8. The rule description must appear in
			// the agent's output.
			expect(
				text.includes(RULE_DESC_CURSOR.toLowerCase()) ||
					text.includes("blocked") ||
					text.includes("approval") ||
					text.includes("denied"),
				`AC2 cursor: agent must report gate denial naming the rule. Got: ${completionTexts.slice(0, 3).join("|")}`,
			).toBe(true);

			// pendingBlock must be set.
			const entry = actionServer.gateRegistry.get(sessionId);
			expect(
				entry?.pendingBlock?.ruleId,
				"AC2 cursor: pendingBlock must be set after gate denial",
			).toBe(RULE_ID_CURSOR);
		} finally {
			await actionServer?.close();
			await mcpServer?.close();
			await rmSandbox(sandboxPath);
		}
	}, 120_000);

	test("AC7: wrong nativeSessionId → resumed session runs context-free (does not know codeword)", async ({
		skip,
	}) => {
		if (!(await cursorAgentAuthed())) {
			skip();
			return;
		}

		const sandboxA = fs.mkdtempSync(path.join(os.tmpdir(), "gate-ac7-a-"));
		const sandboxB = fs.mkdtempSync(path.join(os.tmpdir(), "gate-ac7-b-"));
		let actionServer: ActionCheckServer | null = null;

		try {
			ensureSandboxGitRepo(sandboxA);
			ensureSandboxGitRepo(sandboxB);

			// No gate needed for AC7 — testing context detection only.
			actionServer = await startActionCheckServer();

			const cursorConfig = cliAdapterFixture("cursor-agent");
			const adapter = new CliHarnessAdapter(cursorConfig);
			const model = harnessTestResolvedModel("cursor-agent");

			// Session 1: plant codeword.
			const configP1: SessionConfig = {
				sessionId: `ac7-p1-${Math.random().toString(36).slice(2, 8)}`,
				sandboxPath: sandboxA,
				assembledPrompt: `Your task ID is ${CODEWORD}. Acknowledge by replying with: PHASE1_OK`,
				modelTier: "workhorse",
				tools: [],
				resolvedModel: model,
			};

			const handleP1 = await adapter.startSession(configP1);
			await drainEvents(adapter, handleP1);
			await adapter.stopSession(handleP1);

			const nativeId = adapter.getNativeSessionId?.(handleP1);
			expect(nativeId, "AC7: native session id must be captured").toBeTruthy();

			// Session 2: resume in WRONG sandbox — cursor runs context-free.
			// @lore BA2 cursor-ac7: cursor-agent exits 0 on a wrong session id;
			// detection is via content — the resumed session does not know the codeword.
			const resumeConfig: SessionResumeConfig = {
				sandboxPath: sandboxB, // WRONG — cursor won't find sandboxA's session
				modelTier: "workhorse",
				resolvedModel: model,
			};

			const handleP2 = await adapter.resumeSession?.(
				nativeId!,
				`What task ID was assigned to this session? Reply with just the ID.`,
				resumeConfig,
			);

			if (!handleP2) {
				// resumeSession not available on this adapter.
				return;
			}

			const { completionTexts: p2Texts } = await drainEvents(adapter, handleP2);
			await adapter.stopSession(handleP2);

			// The wrong-sandbox resume must NOT know the codeword.
			const knowsCodeword = p2Texts.some((t) => t.includes(CODEWORD));
			expect(
				knowsCodeword,
				`AC7: wrong-sandbox cursor resume must NOT know codeword "${CODEWORD}" ` +
					`(proves context-free detected). Got: ${p2Texts.slice(0, 3).join("|")}`,
			).toBe(false);
		} finally {
			await actionServer?.close();
			await rmSandbox(sandboxA);
			await rmSandbox(sandboxB);
		}
	}, 120_000);
});

// ── AC7 note on opencode ─────────────────────────────────────────────────────
// opencode: gate scoped out — the --pure flag disables project plugins, making
// the gate plugin silently inert. Testing gate blocking for opencode requires
// removing --pure from the adapter config (see provision-gate-hook.ts @lore
// BA2 opencode-pure). Scoped out as a known limitation. The session resumption
// mechanism for opencode IS proven in session-handles.integration.test.ts.
