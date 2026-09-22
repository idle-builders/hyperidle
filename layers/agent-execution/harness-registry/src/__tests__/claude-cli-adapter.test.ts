/**
 * claude CLI adapter unit tests.
 *
 * Asserts:
 * 1. CLAUDE_CLI_CONFIG shape (binary, key args, returnEnforcementChannel, eventDialect, envMap)
 * 2. CliHarnessAdapter(CLAUDE_CLI_CONFIG).getCapabilities().returnEnforcement === "settings-claude"
 * 3. spawn is called with expected argv and forwards only allowlisted env
 * 4. preMapClaudeEvent translates assistant(tool_use), assistant(text), result,
 *    and system lines to canonical events with NO error events produced
 */

import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type { HarnessEvent } from "@hyperidle/harness-protocol";
import { describe, expect, it, vi } from "vitest";
import { preMapClaudeEvent } from "../harness-event-normalization.js";
import { cliAdapterFixture } from "./cli-adapter-fixtures.js";

const CLAUDE_CLI_CONFIG = cliAdapterFixture("claude");

import { CliHarnessAdapter } from "../cli-harness-adapter.js";

// ── 1. CLAUDE_CLI_CONFIG shape ────────────────────────────────────────────────

describe("CLAUDE_CLI_CONFIG shape", () => {
	it("binary is 'claude'", () => {
		expect(CLAUDE_CLI_CONFIG.binary).toBe("claude");
	});

	it("args include -p (headless prompt flag)", () => {
		expect(CLAUDE_CLI_CONFIG.args).toContain("-p");
	});

	it("args include --output-format stream-json", () => {
		const args = CLAUDE_CLI_CONFIG.args;
		const idx = args.indexOf("--output-format");
		expect(idx).toBeGreaterThanOrEqual(0);
		expect(args[idx + 1]).toBe("stream-json");
	});

	it("args include --verbose", () => {
		expect(CLAUDE_CLI_CONFIG.args).toContain("--verbose");
	});

	it("args include --mcp-config .mcp.json", () => {
		const args = CLAUDE_CLI_CONFIG.args;
		const idx = args.indexOf("--mcp-config");
		expect(idx).toBeGreaterThanOrEqual(0);
		expect(args[idx + 1]).toBe(".mcp.json");
	});

	it("args include --strict-mcp-config", () => {
		expect(CLAUDE_CLI_CONFIG.args).toContain("--strict-mcp-config");
	});

	it("args include --permission-mode bypassPermissions", () => {
		const args = CLAUDE_CLI_CONFIG.args;
		const idx = args.indexOf("--permission-mode");
		expect(idx).toBeGreaterThanOrEqual(0);
		expect(args[idx + 1]).toBe("bypassPermissions");
	});

	it("args include --settings .claude/settings.json", () => {
		const args = CLAUDE_CLI_CONFIG.args;
		const idx = args.indexOf("--settings");
		expect(idx).toBeGreaterThanOrEqual(0);
		expect(args[idx + 1]).toBe(".claude/settings.json");
	});

	it("returnEnforcementChannel is 'settings-claude'", () => {
		expect(CLAUDE_CLI_CONFIG.returnEnforcementChannel).toBe("settings-claude");
	});

	it("eventDialect is 'claude-stream-json'", () => {
		expect(CLAUDE_CLI_CONFIG.eventDialect).toBe("claude-stream-json");
	});

	it("claude has no envMap — authenticates via its own installed auth", () => {
		// @lore envMap was removed from CliAdapterConfig. claude authenticates via
		// ~/.claude/ credentials; no API key is injected by HyperIdle.
		// Verify no envMap property exists on the config.
		expect("envMap" in CLAUDE_CLI_CONFIG).toBe(false);
	});

	it("envAllowlist includes PATH, HOME, LANG, USER, LOGNAME", () => {
		expect(CLAUDE_CLI_CONFIG.envAllowlist).toContain("PATH");
		expect(CLAUDE_CLI_CONFIG.envAllowlist).toContain("HOME");
		expect(CLAUDE_CLI_CONFIG.envAllowlist).toContain("LANG");
		// USER + LOGNAME are required for claude.ai OAuth keychain auth on macOS —
		// proven via live smoke (without them the real binary returns "Not logged in").
		expect(CLAUDE_CLI_CONFIG.envAllowlist).toContain("USER");
		expect(CLAUDE_CLI_CONFIG.envAllowlist).toContain("LOGNAME");
	});
});

// ── 2. getCapabilities().returnEnforcement ────────────────────────────────────

describe("CliHarnessAdapter(CLAUDE_CLI_CONFIG) capabilities", () => {
	it("returnEnforcement is 'settings-claude'", () => {
		const adapter = new CliHarnessAdapter(CLAUDE_CLI_CONFIG);
		expect(adapter.getCapabilities().returnEnforcement).toBe("settings-claude");
	});

	it("mcpSupport is true", () => {
		const adapter = new CliHarnessAdapter(CLAUDE_CLI_CONFIG);
		expect(adapter.getCapabilities().mcpSupport).toBe(true);
	});
});

// ── 3. spawn called with expected argv; only allowlisted env forwarded ────────

function makeFakeChild(): {
	proc: ChildProcess;
	emitExit: (code: number | null, signal: string | null) => void;
} {
	const stdout = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
	const stderr = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
	const proc = new EventEmitter() as ChildProcess;
	(proc as unknown as { stdout: unknown }).stdout = stdout;
	(proc as unknown as { stderr: unknown }).stderr = stderr;
	(proc as unknown as { pid: number }).pid = 99999;
	proc.kill = vi.fn() as unknown as typeof proc.kill;
	return {
		proc,
		emitExit: (code, signal) => proc.emit("exit", code, signal),
	};
}

function makeSessionConfig() {
	return {
		sandboxPath: "/workspace/claude-test",
		sessionId: "claude-cli-test-session",
		assembledPrompt: "Do the task.",
		modelTier: "workhorse" as const,
		tools: [],
		selectedModel: "claude-sonnet-4-6",
		mcpConnectionInfo: undefined,
	};
}

describe("CliHarnessAdapter(CLAUDE_CLI_CONFIG) spawn behavior", () => {
	it("spawns 'claude' binary with expected argv including model and prompt", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(CLAUDE_CLI_CONFIG, { spawnFn: spawnSpy });
		const config = makeSessionConfig();

		// Kick off session (don't await full stream)
		const sessionP = adapter.startSession(config);
		// Let event loop tick for spawn
		await Promise.resolve();
		fakeChild.emitExit(0, null);
		await sessionP;

		expect(spawnSpy).toHaveBeenCalledOnce();
		const [binary, args] = spawnSpy.mock.calls[0] as [string, string[], unknown];
		expect(binary).toBe("claude");
		expect(args).toContain("-p");
		expect(args).toContain("--output-format");
		expect(args).toContain("stream-json");
		expect(args).toContain("--model");
		// {{model}} resolved to the session's model
		expect(args[args.indexOf("--model") + 1]).toBe("claude-sonnet-4-6");
	});

	it("passes the model the agent chose", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(CLAUDE_CLI_CONFIG, { spawnFn: spawnSpy });
		// The shape a subscription-authenticated machine actually has: an agent
		// configured with a model, and NO credential anywhere to resolve one.
		const sessionP = adapter.startSession({ ...makeSessionConfig(), selectedModel: "haiku" });
		await Promise.resolve();
		fakeChild.emitExit(0, null);
		await sessionP;

		const [, args] = spawnSpy.mock.calls[0] as [string, string[], unknown];
		expect(args[args.indexOf("--model") + 1]).toBe("haiku");
	});

	it("prefers the agent's chosen model over a gateway-resolved one", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(CLAUDE_CLI_CONFIG, { spawnFn: spawnSpy });
		// makeSessionConfig resolves to claude-sonnet-4-6 through the gateway; the
		// agent's own choice is what the person picked and what must win.
		const sessionP = adapter.startSession({ ...makeSessionConfig(), selectedModel: "opus" });
		await Promise.resolve();
		fakeChild.emitExit(0, null);
		await sessionP;

		const [, args] = spawnSpy.mock.calls[0] as [string, string[], unknown];
		expect(args[args.indexOf("--model") + 1]).toBe("opus");
	});

	it("forwards only PATH, HOME, LANG, USER, LOGNAME from process.env (not DATABASE_URL, ANTHROPIC_API_KEY etc)", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		// Pollute env with secrets that must NOT be forwarded.
		// Start from a clean base so origEnv's USER/LOGNAME don't leak the assertion.
		const origEnv = process.env;
		process.env = {
			DATABASE_URL: "postgres://secret",
			ANTHROPIC_API_KEY: "sk-should-not-be-forwarded",
			HYPERIDLE_API_KEY: "master-secret",
			PATH: "/usr/bin:/bin",
			HOME: "/home/user",
			LANG: "en_US.UTF-8",
			USER: "tester",
			LOGNAME: "tester",
		};

		try {
			const adapter = new CliHarnessAdapter(CLAUDE_CLI_CONFIG, { spawnFn: spawnSpy });
			const sessionP = adapter.startSession(makeSessionConfig());
			await Promise.resolve();
			fakeChild.emitExit(0, null);
			await sessionP;

			const [, , spawnOpts] = spawnSpy.mock.calls[0] as [
				string,
				string[],
				{ env: Record<string, string> },
			];
			const env = spawnOpts.env;

			// Only allowlisted vars forwarded
			expect(env.PATH).toBeDefined();
			expect(env.HOME).toBeDefined();
			expect(env.LANG).toBeDefined();
			expect(env.USER).toBeDefined();
			expect(env.LOGNAME).toBeDefined();

			// Secrets must NOT be present
			expect(env.DATABASE_URL).toBeUndefined();
			expect(env.ANTHROPIC_API_KEY).toBeUndefined();
			expect(env.HYPERIDLE_API_KEY).toBeUndefined();

			// envMap is empty — no extra keys injected
			const allowedKeys = new Set(["PATH", "HOME", "LANG", "USER", "LOGNAME"]);
			const unexpectedKeys = Object.keys(env).filter((k) => !allowedKeys.has(k));
			expect(unexpectedKeys).toEqual([]);
		} finally {
			process.env = origEnv;
		}
	});
});

// ── 4. preMapClaudeEvent translation ─────────────────────────────────────────

describe("preMapClaudeEvent — claude stream-json event translation", () => {
	it("translates assistant(tool_use) to tool_call with toolName and args", () => {
		const input = {
			type: "assistant",
			message: {
				content: [
					{
						type: "tool_use",
						name: "submit_review",
						input: { message: "LGTM", verdict: "approved" },
						id: "tool-1",
					},
				],
			},
		};
		const result = preMapClaudeEvent(input);
		expect(result.type).toBe("tool_call");
		expect(result.toolName).toBe("submit_review");
		expect(result.args).toEqual({ message: "LGTM", verdict: "approved" });
	});

	it("translates assistant(text) to completion with text", () => {
		const input = {
			type: "assistant",
			message: {
				content: [{ type: "text", text: "Hello, I am done." }],
			},
		};
		const result = preMapClaudeEvent(input);
		expect(result.type).toBe("completion");
		expect(result.text).toBe("Hello, I am done.");
	});

	it("translates result line to completion with result text", () => {
		const input = {
			type: "result",
			subtype: "success",
			result: "Task completed successfully.",
			total_cost_usd: 0.0123,
			is_error: false,
		};
		const result = preMapClaudeEvent(input);
		expect(result.type).toBe("completion");
		expect(result.text).toBe("Task completed successfully.");
	});

	it("translates result line with no result text to empty completion", () => {
		const input = {
			type: "result",
			subtype: "error_during_execution",
			is_error: true,
		};
		const result = preMapClaudeEvent(input);
		expect(result.type).toBe("completion");
		expect(result.text).toBe("");
	});

	it("translates system line to empty completion (no error event pollution)", () => {
		const input = {
			type: "system",
			subtype: "init",
			session_id: "sess-abc",
		};
		const result = preMapClaudeEvent(input);
		expect(result.type).toBe("completion");
		expect(result.text).toBe("");
	});

	it("prefers tool_use over text in multi-block assistant message", () => {
		const input = {
			type: "assistant",
			message: {
				content: [
					{ type: "text", text: "I will call a tool." },
					{ type: "tool_use", name: "read_inbox", input: { limit: 5 }, id: "t1" },
				],
			},
		};
		const result = preMapClaudeEvent(input);
		// tool_use comes after text in content, but tool_use takes precedence
		expect(result.type).toBe("tool_call");
		expect(result.toolName).toBe("read_inbox");
	});

	it("prefers FIRST tool_use when both tool_use blocks are present", () => {
		const input = {
			type: "assistant",
			message: {
				content: [
					{ type: "tool_use", name: "read_inbox", input: {}, id: "t1" },
					{ type: "tool_use", name: "write_memory", input: { key: "x" }, id: "t2" },
				],
			},
		};
		const result = preMapClaudeEvent(input);
		expect(result.type).toBe("tool_call");
		expect(result.toolName).toBe("read_inbox");
	});

	it("none of the translated events have type 'error'", () => {
		const inputs = [
			{
				type: "assistant",
				message: { content: [{ type: "tool_use", name: "t", input: {}, id: "1" }] },
			},
			{ type: "assistant", message: { content: [{ type: "text", text: "hi" }] } },
			{ type: "result", result: "done", total_cost_usd: 0.01 },
			{ type: "system", subtype: "init" },
			{ type: "user", content: [{ type: "text", text: "begin" }] },
		];
		for (const input of inputs) {
			const result = preMapClaudeEvent(input);
			expect(result.type).not.toBe("error");
		}
	});

	it("returns input unchanged when not a record", () => {
		// Not a record — returned as-is (no translation)
		const notRecord = "raw string line";
		const result = preMapClaudeEvent(notRecord);
		expect(result).toBe(notRecord);
	});

	it("returns input unchanged when no string type field", () => {
		const input = { message: "no type" };
		const result = preMapClaudeEvent(input);
		expect(result).toBe(input);
	});
});

// ── 5. Integration: claude dialect events produce no error events in stream ──

describe("CliHarnessAdapter(CLAUDE_CLI_CONFIG) stream — no error events from claude lines", () => {
	it("assistant and result lines produce completion/tool_call, never error", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(CLAUDE_CLI_CONFIG, { spawnFn: spawnSpy });
		const handle = await adapter.startSession(makeSessionConfig());

		const events: HarnessEvent[] = [];
		const streamP = (async () => {
			for await (const ev of adapter.streamEvents(handle)) {
				events.push(ev);
			}
		})();

		const stdout = (fakeChild.proc as unknown as { stdout: EventEmitter }).stdout;
		// Emit a system line (should not produce error)
		stdout.emit("data", Buffer.from('{"type":"system","subtype":"init","session_id":"s1"}\n'));
		// Emit an assistant text line
		stdout.emit(
			"data",
			Buffer.from(
				'{"type":"assistant","message":{"content":[{"type":"text","text":"Working on it."}]}}\n',
			),
		);
		// Emit an assistant tool_use line
		stdout.emit(
			"data",
			Buffer.from(
				'{"type":"assistant","message":{"content":[{"type":"tool_use","name":"read_inbox","input":{"limit":5},"id":"t1"}]}}\n',
			),
		);
		// Emit a result line
		stdout.emit(
			"data",
			Buffer.from(
				'{"type":"result","subtype":"success","result":"Done.","total_cost_usd":0.01,"is_error":false}\n',
			),
		);
		fakeChild.emitExit(0, null);
		await streamP;

		// No error events from any claude stream-json lines
		const errorEvents = events.filter((e) => e.type === "error");
		expect(errorEvents).toHaveLength(0);

		// Completion and tool_call events are produced
		const completionEvents = events.filter((e) => e.type === "completion");
		const toolCallEvents = events.filter((e) => e.type === "tool_call");
		expect(completionEvents.length).toBeGreaterThanOrEqual(1);
		expect(toolCallEvents.length).toBeGreaterThanOrEqual(1);

		// tool_call event has correct toolName
		const toolCall = toolCallEvents[0];
		if (toolCall?.type === "tool_call") {
			expect(toolCall.toolName).toBe("read_inbox");
		}
	});
});
