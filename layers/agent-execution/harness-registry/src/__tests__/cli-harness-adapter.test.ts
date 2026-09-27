/**
 * CliHarnessAdapter unit tests.
 *
 * Tests all runtime behaviors of the CLI harness adapter:
 * - Template variable resolution
 * - Binary availability check
 * - startSession process spawning
 * - streamEvents ndjson and text modes
 * - stopSession SIGTERM/SIGKILL escalation
 * - Env sandboxing
 * - ENOENT from spawn produces a clear error
 */

import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type { HarnessEvent, SessionConfig, SessionResumeConfig } from "@hyperidle/harness-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliAdapterConfig } from "../cli-harness-adapter.js";
import { CliHarnessAdapter, stopAllLiveHarnessSessions } from "../cli-harness-adapter.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<CliAdapterConfig> = {}): CliAdapterConfig {
	return {
		binary: "fake-tool",
		args: ["--dir", "{{sandbox}}", "--model", "{{model}}"],
		envMap: { MCP_URL: "{{mcpUrl}}" },
		eventFormat: "ndjson",
		envAllowlist: ["PATH", "HOME"],
		...overrides,
	};
}

function makeSessionConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
	return {
		sandboxPath: "/workspace/test-123",
		sessionId: "test-session",
		assembledPrompt: "Do the task.",
		modelTier: "workhorse",
		tools: ["Read", "Write"],
		// The model the agent was configured with. There is no second source for
		// it any more — the gateway's `resolvedModel` used to sit beside this as a
		// fallback, and injected a key and base URL besides.
		selectedModel: "claude-3-5-sonnet-20241022",
		mcpConnectionInfo: {
			url: "http://localhost:3001/api/mcp/abc123token",
			token: "abc123token",
		},
		...overrides,
	};
}

/** Create a fake child process that emits controllable events. */
function makeFakeChild(): {
	proc: ChildProcess;
	emitStdout: (line: string) => void;
	emitStderr: (line: string) => void;
	emitExit: (code: number | null, signal: string | null) => void;
	killSpy: ReturnType<typeof vi.fn>;
} {
	const stdout = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
	const stderr = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
	const proc = new EventEmitter() as ChildProcess;
	(proc as unknown as { stdout: unknown }).stdout = stdout;
	(proc as unknown as { stderr: unknown }).stderr = stderr;
	(proc as unknown as { pid: number }).pid = 12345;

	const killSpy = vi.fn();
	proc.kill = killSpy as unknown as typeof proc.kill;

	return {
		proc,
		emitStdout: (line: string) => stdout.emit("data", Buffer.from(`${line}\n`)),
		emitStderr: (line: string) => stderr.emit("data", Buffer.from(`${line}\n`)),
		emitExit: (code: number | null, signal: string | null) => proc.emit("exit", code, signal),
		killSpy,
	};
}

// ── Template variable resolution ─────────────────────────────────────────────

describe("CliHarnessAdapter — template variable resolution", () => {
	it("resolves {{sandbox}} in args", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ args: ["--dir", "{{sandbox}}"] }), {
			spawnFn: spawnSpy,
			killFn: vi.fn(),
		});
		const sessionConfig = makeSessionConfig();
		const handle = await adapter.startSession(sessionConfig);
		expect(handle.sessionId).toBeTruthy();

		const spawnCall = spawnSpy.mock.calls[0]!;
		expect(spawnCall[1]).toContain("/workspace/test-123");
		expect(spawnCall[1]).not.toContain("{{sandbox}}");
	});

	it("resolves {{model}} in args", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ args: ["--model", "{{model}}"] }), {
			spawnFn: spawnSpy,
			killFn: vi.fn(),
		});
		const handle = await adapter.startSession(makeSessionConfig());
		expect(handle.sessionId).toBeTruthy();

		const spawnCall = spawnSpy.mock.calls[0]!;
		expect(spawnCall[1]).toContain("claude-3-5-sonnet-20241022");
		expect(spawnCall[1]).not.toContain("{{model}}");
	});

	// @lore Two tests here exercised `{{apiKey}}` and `{{baseUrl}}`, the template variables that carried a stored credential and a brought endpoint into a harness's environment. Both variables are gone — HyperIdle holds no model credential to pass on — so there is nothing left for them to resolve.

	it("resolves {{mcpUrl}} in envMap", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(
			makeConfig({
				args: [],
				envMap: { MCP_URL: "{{mcpUrl}}" },
				envAllowlist: [],
			}),
			{ spawnFn: spawnSpy, killFn: vi.fn() },
		);
		await adapter.startSession(makeSessionConfig());

		const spawnCall = spawnSpy.mock.calls[0]!;
		const spawnEnv = spawnCall[2]?.env as Record<string, string>;
		expect(spawnEnv["MCP_URL"]).toBe("http://localhost:3001/api/mcp/abc123token");
	});

	it("resolves {{mcpUrl}} to empty string when mcpConnectionInfo is absent", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(
			makeConfig({
				args: [],
				envMap: { MCP_URL: "{{mcpUrl}}" },
				envAllowlist: [],
			}),
			{ spawnFn: spawnSpy, killFn: vi.fn() },
		);
		const sessionConfigNoMcp = makeSessionConfig({ mcpConnectionInfo: undefined });
		await adapter.startSession(sessionConfigNoMcp);

		const spawnCall = spawnSpy.mock.calls[0]!;
		const spawnEnv = spawnCall[2]?.env as Record<string, string>;
		expect(spawnEnv["MCP_URL"]).toBe("");
	});

	it("drops --model flag when the agent named no model", async () => {
		// @lore empty-model-strip: When the agent named no model, {{model}} resolves to "". Passing --model "" to codex sends an empty model string to the OpenAI API → 400 invalid_request_error. The fix: strip --model + "" pairs when model is empty, preserving prior behavior (codex falls back to its CLI default). This test proves the conditional strip: --model "" must NOT appear in the final args.
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(
			makeConfig({
				args: ["exec", "{{prompt}}", "--model", "{{model}}", "--json"],
				envMap: {},
				envAllowlist: [],
			}),
			{ spawnFn: spawnSpy, killFn: vi.fn() },
		);
		await adapter.startSession(makeSessionConfig({ selectedModel: undefined }));

		const spawnCall = spawnSpy.mock.calls[0]!;
		const spawnArgs: string[] = spawnCall[1];
		// The --model flag and its empty-string value must be stripped
		expect(spawnArgs).not.toContain("--model");
		// Other args must be preserved
		expect(spawnArgs).toContain("exec");
		expect(spawnArgs).toContain("--json");
		// No unresolved template vars
		expect(spawnArgs).not.toContain("{{model}}");
	});

	/**
	 * @lore instruction-not-truncated: `{{prompt}}` used to be built here as `assembledPrompt.slice(0, 200)` with newlines flattened. A real agent read the result and replied "your initial message appears to have been cut off" — it had been, at exactly 200 characters. The instruction is what the agent is ASKED to do; it arrives whole or the agent cannot do the work.
	 */
	it("passes the instruction through whole, never truncated", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const instruction = `Your task: build the thing\n\n${"y".repeat(500)}\n\nFinally: say DONE.`;

		const adapter = new CliHarnessAdapter(
			makeConfig({ args: ["exec", "{{prompt}}"], envMap: {}, envAllowlist: [] }),
			{ spawnFn: spawnSpy, killFn: vi.fn() },
		);
		await adapter.startSession(makeSessionConfig({ instruction }));

		const spawnArgs: string[] = spawnSpy.mock.calls[0]![1];
		const passed = spawnArgs.find((a) => a.includes("build the thing")) ?? "";
		expect(passed, "the whole instruction reaches the harness").toBe(instruction);
		expect(passed.length).toBeGreaterThan(200);
		expect(passed, "the end of it survives").toContain("Finally: say DONE.");
	});

	/**
	 * @lore instruction-not-truncated: `assembledPrompt` is CONTEXT — it goes to AGENTS.md. It is not the ask, and it must not be used as one.
	 */
	it("does not fall back to the assembled context when there is no instruction", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(
			makeConfig({ args: ["exec", "{{prompt}}"], envMap: {}, envAllowlist: [] }),
			{ spawnFn: spawnSpy, killFn: vi.fn() },
		);
		await adapter.startSession(
			makeSessionConfig({
				instruction: undefined,
				assembledPrompt: "You are a helpful agent. Here is everything you know.",
			}),
		);

		const spawnArgs: string[] = spawnSpy.mock.calls[0]![1];
		expect(spawnArgs).toContain("proceed");
		expect(spawnArgs.join(" ")).not.toContain("everything you know");
	});

	it("keeps --model flag when the agent named one", async () => {
		// @lore empty-model-strip: Non-empty model must still inject --model <value>. Proves the conditional strip only fires on empty string, not on valid model IDs.
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(
			makeConfig({
				args: ["exec", "{{prompt}}", "--model", "{{model}}", "--json"],
				envMap: {},
				envAllowlist: [],
			}),
			{ spawnFn: spawnSpy, killFn: vi.fn() },
		);
		await adapter.startSession(makeSessionConfig({ selectedModel: "gpt-5.4-mini" }));

		const spawnCall = spawnSpy.mock.calls[0]!;
		const spawnArgs: string[] = spawnCall[1];
		// --model gpt-5.4-mini must appear in args
		const modelIdx = spawnArgs.indexOf("--model");
		expect(modelIdx).toBeGreaterThan(-1);
		expect(spawnArgs[modelIdx + 1]).toBe("gpt-5.4-mini");
	});
});

// ── Binary availability ───────────────────────────────────────────────────────

describe("CliHarnessAdapter.checkAvailability", () => {
	it("returns true when binary is found (mock which)", async () => {
		const whichSpy = vi.fn().mockResolvedValue("/usr/bin/fake-tool");
		const result = await CliHarnessAdapter.checkAvailability("fake-tool", { whichFn: whichSpy });
		expect(result).toBe(true);
		expect(whichSpy).toHaveBeenCalledWith("fake-tool");
	});

	it("returns false when binary is not found (which throws)", async () => {
		const whichSpy = vi.fn().mockRejectedValue(new Error("not found"));
		const result = await CliHarnessAdapter.checkAvailability("nonexistent-tool", {
			whichFn: whichSpy,
		});
		expect(result).toBe(false);
	});
});

// ── startSession ─────────────────────────────────────────────────────────────

describe("CliHarnessAdapter startSession", () => {
	it("spawns the binary with args array (not shell string)", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(
			makeConfig({ args: ["--dir", "{{sandbox}}", "--model", "{{model}}"] }),
			{ spawnFn: spawnSpy, killFn: vi.fn() },
		);
		await adapter.startSession(makeSessionConfig());

		expect(spawnSpy).toHaveBeenCalledTimes(1);
		const [binary, args, options] = spawnSpy.mock.calls[0] as [
			string,
			string[],
			Record<string, unknown>,
		];
		// Binary is passed as first argument separately — not embedded in an array
		expect(binary).toBe("fake-tool");
		// args is an array (not a string)
		expect(Array.isArray(args)).toBe(true);
		// shell option must be false or absent for security
		expect(options?.shell).toBeFalsy();
	});

	it("uses sandboxPath as cwd", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ args: [] }), {
			spawnFn: spawnSpy,
			killFn: vi.fn(),
		});
		await adapter.startSession(makeSessionConfig({ sandboxPath: "/my/workspace" }));

		const options = spawnSpy!.mock.calls[0]![2] as Record<string, unknown>;
		expect(options?.cwd).toBe("/my/workspace");
	});

	it("returns a SessionHandle with a non-empty sessionId", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ args: [] }), {
			spawnFn: spawnSpy,
			killFn: vi.fn(),
		});
		const handle = await adapter.startSession(makeSessionConfig());
		expect(typeof handle.sessionId).toBe("string");
		expect(handle.sessionId.length).toBeGreaterThan(0);
	});

	it("ENOENT from spawn throws a clear 'binary not found' error", async () => {
		const spawnSpy = vi.fn().mockImplementation(() => {
			const error = new Error("spawn fake-tool ENOENT") as NodeJS.ErrnoException;
			error.code = "ENOENT";
			const proc = new EventEmitter() as ChildProcess;
			const stdout = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
			const stderr = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
			(proc as unknown as { stdout: unknown }).stdout = stdout;
			(proc as unknown as { stderr: unknown }).stderr = stderr;
			// In real Node.js, ENOENT means pid is undefined — match that behavior.
			// Do NOT set proc.pid so the adapter enters the "pid undefined" path.
			// The error fires asynchronously on the next tick (process.nextTick behavior).
			process.nextTick(() => proc.emit("error", error));
			return proc;
		});

		const adapter = new CliHarnessAdapter(makeConfig({ binary: "fake-tool", args: [] }), {
			spawnFn: spawnSpy,
			killFn: vi.fn(),
		});
		await expect(adapter.startSession(makeSessionConfig())).rejects.toThrow(
			/binary not found.*fake-tool/i,
		);
	});
});

// ── Env sandboxing ────────────────────────────────────────────────────────────

describe("CliHarnessAdapter env sandboxing", () => {
	it("only includes allowlisted env vars plus resolved envMap vars", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		// Temporarily set some env vars to simulate host process env
		const originalPath = process.env["PATH"];
		const originalSecret = process.env["HYPERIDLE_SECRET"];
		process.env["PATH"] = "/usr/bin:/bin";
		process.env["HYPERIDLE_SECRET"] = "super-secret-should-not-leak";

		const adapter = new CliHarnessAdapter(
			makeConfig({
				args: [],
				envMap: { FAKE_MCP: "{{mcpUrl}}" },
				envAllowlist: ["PATH"], // Only PATH is allowlisted, not HYPERIDLE_SECRET
			}),
			{ spawnFn: spawnSpy, killFn: vi.fn() },
		);
		await adapter.startSession(makeSessionConfig());

		const spawnEnv = spawnSpy!.mock.calls[0]![2]?.env as Record<string, string>;
		expect(spawnEnv["PATH"]).toBe("/usr/bin:/bin");
		expect(spawnEnv["FAKE_MCP"]).toBe("http://localhost:3001/api/mcp/abc123token");
		// Secret must NOT be forwarded
		expect(spawnEnv["HYPERIDLE_SECRET"]).toBeUndefined();

		// Restore
		process.env["PATH"] = originalPath;
		if (originalSecret !== undefined) {
			process.env["HYPERIDLE_SECRET"] = originalSecret;
		} else {
			delete process.env["HYPERIDLE_SECRET"];
		}
	});

	it("does not include env vars not in allowlist even when present in host env", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		process.env["DATABASE_URL"] = "postgres://should-not-leak";
		const adapter = new CliHarnessAdapter(
			makeConfig({ args: [], envMap: {}, envAllowlist: ["PATH"] }),
			{ spawnFn: spawnSpy, killFn: vi.fn() },
		);
		await adapter.startSession(makeSessionConfig());

		const spawnEnv = spawnSpy!.mock.calls[0]![2]?.env as Record<string, string>;
		expect(spawnEnv["DATABASE_URL"]).toBeUndefined();
		delete process.env["DATABASE_URL"];
	});
});

// ── resumeSession env construction ───────────────────────────────────────────
//
// Guards that envMap is resolved the same way in resumeSession as in
// startSession. Before this fix, resumeSession passed only extraEnv
// (CODEX_HOME + mcpTokenEnv), silently dropping envMap.
//
// @lore A test here proved `{{apiKey}}` resolved on resume exactly as it did at start — codex's envMap was `OPENAI_API_KEY: "{{apiKey}}"`, opencode's the ANTHROPIC_API_KEY equivalent. HyperIdle holds no key to resolve any more: a harness arrives already logged in and carries its own credential, so `{{apiKey}}` and `{{baseUrl}}` are gone as template vars. The claim that survives — envMap IS resolved on resume, and per-session specifics beat it — is made below over `{{model}}`, a var that still exists.

describe("CliHarnessAdapter resumeSession — env construction", () => {
	it("resolves envMap templates on resume the same way startSession does", async () => {
		const spawnSpy = vi.fn();
		// startSession spawn (call 0) and resumeSession spawn (call 1)
		const fakeChild1 = makeFakeChild();
		const fakeChild2 = makeFakeChild();
		spawnSpy.mockReturnValueOnce(fakeChild1.proc).mockReturnValueOnce(fakeChild2.proc);

		const adapter = new CliHarnessAdapter(
			{
				binary: "opencode",
				// Minimal args — no templates that need a sandbox on disk.
				args: ["run", "{{prompt}}", "--format", "json", "--pure"],
				envMap: { MY_MODEL: "{{model}}" },
				eventFormat: "ndjson",
				envAllowlist: [],
			},
			{ spawnFn: spawnSpy, killFn: vi.fn() },
		);

		const startConfig = makeSessionConfig({ selectedModel: "claude-haiku-4-5" });
		await adapter.startSession(startConfig);

		const startEnv = spawnSpy.mock.calls[0]![2]?.env as Record<string, string>;
		expect(startEnv["MY_MODEL"]).toBe("claude-haiku-4-5");

		// resumeSession: the model must be resolved from envMap the same way.
		const resumeConfig: SessionResumeConfig = {
			sandboxPath: "/fake/sandbox",
			modelTier: "workhorse",
			selectedModel: "claude-sonnet-4-6",
		};
		await adapter.resumeSession("fake-session-id", "Hello", resumeConfig);

		const resumeEnv = spawnSpy.mock.calls[1]![2]?.env as Record<string, string>;
		expect(resumeEnv["MY_MODEL"]).toBe("claude-sonnet-4-6");
	});

	it("mcpTokenEnv overrides envMap on resume (per-session specifics win)", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(
			{
				binary: "opencode",
				args: ["run", "{{prompt}}", "--format", "json", "--pure"],
				envMap: { MY_TOKEN: "{{model}}" },
				eventFormat: "ndjson",
				envAllowlist: [],
			},
			{ spawnFn: spawnSpy, killFn: vi.fn() },
		);

		const resumeConfig: SessionResumeConfig = {
			sandboxPath: "/fake/sandbox",
			modelTier: "workhorse",
			selectedModel: "from-envmap",
			mcpTokenEnv: { MY_TOKEN: "from-mcpTokenEnv" },
		};
		await adapter.resumeSession("fake-session-id", "Hello", resumeConfig);

		const resumeEnv = spawnSpy.mock.calls[0]![2]?.env as Record<string, string>;
		// mcpTokenEnv wins over envMap.
		expect(resumeEnv["MY_TOKEN"]).toBe("from-mcpTokenEnv");
	});
});

// ── streamEvents: ndjson mode ─────────────────────────────────────────────────

describe("CliHarnessAdapter streamEvents — ndjson mode", () => {
	it("parses valid JSON lines as HarnessEvents", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ args: [], eventFormat: "ndjson" }), {
			spawnFn: spawnSpy,
			killFn: vi.fn(),
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const toolCallEvent: HarnessEvent = {
			type: "tool_call",
			toolName: "read_file",
			args: { path: "/workspace/test.ts" },
		};

		const events: HarnessEvent[] = [];
		const streamPromise = (async () => {
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
				if (events.length >= 1) break;
			}
		})();

		// Emit a valid NDJSON line
		fakeChild.emitStdout(JSON.stringify(toolCallEvent));
		await streamPromise;

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual(toolCallEvent);
	});

	it("yields malformed JSON lines as completion events", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ args: [], eventFormat: "ndjson" }), {
			spawnFn: spawnSpy,
			killFn: vi.fn(),
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const events: HarnessEvent[] = [];
		const streamPromise = (async () => {
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
				if (events.length >= 1) break;
			}
		})();

		fakeChild.emitStdout("this is not valid json {{{");
		await streamPromise;

		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe("completion");
		expect((events[0] as { type: string; text: string }).text).toBe("this is not valid json {{{");
	});

	it("yields stderr lines as error events", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ args: [], eventFormat: "ndjson" }), {
			spawnFn: spawnSpy,
			killFn: vi.fn(),
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const events: HarnessEvent[] = [];
		const streamPromise = (async () => {
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
				if (events.length >= 1) break;
			}
		})();

		fakeChild.emitStderr("error: something went wrong");
		await streamPromise;

		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe("error");
		expect((events[0] as { type: string; message: string; code: string }).message).toBe(
			"error: something went wrong",
		);
		expect((events[0] as { type: string; message: string; code: string }).code).toBe("CliStderr");
	});

	it("silently drops stderr lines matching stderrIgnorePatterns (no error event emitted)", async () => {
		// @lore codex-opencode-stderr-ignore: CLI tools emit informational stderr. stderrIgnorePatterns filters them before they become error events that crash provisionSession.
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		// Config with a pattern that matches the benign line we'll emit.
		const adapter = new CliHarnessAdapter(
			makeConfig({ args: [], eventFormat: "ndjson", stderrIgnorePatterns: [/benign/] }),
			{ spawnFn: spawnSpy, killFn: vi.fn() },
		);
		const handle = await adapter.startSession(makeSessionConfig());

		const events: HarnessEvent[] = [];
		const streamPromise = (async () => {
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
				// Stop after the completion event to avoid blocking the test.
				if (event.type === "completion") break;
			}
		})();

		// The stderr line matches the pattern → silently dropped (no error event).
		fakeChild.emitStderr("benign informational startup message");
		// A real stdout completion unblocks the stream so the test can terminate.
		fakeChild.emitStdout(JSON.stringify({ type: "completion", text: "done" }));
		fakeChild.emitExit(0, null);

		await streamPromise;

		// No error events — the filtered stderr line was silently dropped.
		expect(events.every((e) => e.type !== "error")).toBe(true);
		// The stdout completion event was still emitted.
		expect(events.some((e) => e.type === "completion")).toBe(true);
	});

	it("stops streaming when the process exits", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ args: [], eventFormat: "ndjson" }), {
			spawnFn: spawnSpy,
			killFn: vi.fn(),
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const events: HarnessEvent[] = [];
		const streamPromise = (async () => {
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
			}
		})();

		// Emit one event then exit
		fakeChild.emitStdout(JSON.stringify({ type: "completion", text: "done" }));
		fakeChild.emitExit(0, null);

		await streamPromise; // should complete because process exited

		expect(events.some((e) => e.type === "completion")).toBe(true);
	});
});

// ── streamEvents: text mode ───────────────────────────────────────────────────

describe("CliHarnessAdapter streamEvents — text mode", () => {
	it("wraps all stdout lines as completion events", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ args: [], eventFormat: "text" }), {
			spawnFn: spawnSpy,
			killFn: vi.fn(),
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const events: HarnessEvent[] = [];
		const streamPromise = (async () => {
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
				if (events.length >= 2) break;
			}
		})();

		fakeChild.emitStdout("Line one from text tool");
		fakeChild.emitStdout("Line two from text tool");
		await streamPromise;

		expect(events).toHaveLength(2);
		expect(events[0]).toEqual({ type: "completion", text: "Line one from text tool" });
		expect(events[1]).toEqual({ type: "completion", text: "Line two from text tool" });
	});

	it("wraps JSON-like stdout lines as completion events in text mode (no parsing)", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ args: [], eventFormat: "text" }), {
			spawnFn: spawnSpy,
			killFn: vi.fn(),
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const events: HarnessEvent[] = [];
		const streamPromise = (async () => {
			for await (const event of adapter.streamEvents(handle)) {
				events.push(event);
				if (events.length >= 1) break;
			}
		})();

		// Even valid JSON is treated as plain text in text mode
		fakeChild.emitStdout('{"type":"tool_call","toolName":"read"}');
		await streamPromise;

		expect(events[0]?.type).toBe("completion");
	});
});

// ── stopSession ───────────────────────────────────────────────────────────────

describe("CliHarnessAdapter stopSession", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("sends SIGTERM to the whole process group on stop", async () => {
		// @lore process-group kill: stopSession signals -pid (the process group), not the child's own pid, so a grandchild the CLI forked dies too. Kill is routed through an injected killFn — never a real kill(2) syscall on this fake child's fabricated pid — see the grandchild-kill test below for the real-process proof.
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);
		const killFn = vi.fn();

		const adapter = new CliHarnessAdapter(makeConfig({ args: [] }), { spawnFn: spawnSpy, killFn });
		const handle = await adapter.startSession(makeSessionConfig());

		// Simulate process exiting after SIGTERM (within 5s)
		const stopPromise = adapter.stopSession(handle);
		expect(killFn).toHaveBeenCalledWith(-12345, "SIGTERM");
		expect(fakeChild.killSpy).not.toHaveBeenCalled();

		// Simulate graceful exit
		fakeChild.emitExit(0, null);
		const result = await stopPromise;
		expect(result.outcome).toBe("completed");
	});

	it("sends SIGKILL to the whole process group after 5s timeout if process does not exit", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);
		const killFn = vi.fn();

		const adapter = new CliHarnessAdapter(makeConfig({ args: [] }), { spawnFn: spawnSpy, killFn });
		const handle = await adapter.startSession(makeSessionConfig());

		const stopPromise = adapter.stopSession(handle);
		expect(killFn).toHaveBeenCalledWith(-12345, "SIGTERM");

		// Advance timer past 5s without exit — should SIGKILL
		await vi.advanceTimersByTimeAsync(5001);
		expect(killFn).toHaveBeenCalledWith(-12345, "SIGKILL");

		// Now exit
		fakeChild.emitExit(null, "SIGKILL");
		const result = await stopPromise;
		expect(result.outcome).toBe("stopped");
	});

	it("maps exit code 0 to outcome 'completed'", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ args: [] }), {
			spawnFn: spawnSpy,
			killFn: vi.fn(),
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const stopPromise = adapter.stopSession(handle);
		fakeChild.emitExit(0, null);
		const result = await stopPromise;
		expect(result.outcome).toBe("completed");
	});

	it("maps non-zero exit code to outcome 'crashed'", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ args: [] }), {
			spawnFn: spawnSpy,
			killFn: vi.fn(),
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const stopPromise = adapter.stopSession(handle);
		fakeChild.emitExit(1, null);
		const result = await stopPromise;
		expect(result.outcome).toBe("crashed");
	});

	it("maps null exit code (killed) to outcome 'stopped'", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ args: [] }), {
			spawnFn: spawnSpy,
			killFn: vi.fn(),
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const stopPromise = adapter.stopSession(handle);
		fakeChild.emitExit(null, "SIGKILL"); // killed
		const result = await stopPromise;
		expect(result.outcome).toBe("stopped");
	});

	it("returns no cost field and empty token usage when nothing was reported", async () => {
		const spawnSpy = vi.fn();
		const fakeChild = makeFakeChild();
		spawnSpy.mockReturnValue(fakeChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ args: [] }), {
			spawnFn: spawnSpy,
			killFn: vi.fn(),
		});
		const handle = await adapter.startSession(makeSessionConfig());

		const stopPromise = adapter.stopSession(handle);
		fakeChild.emitExit(0, null);
		const result = await stopPromise;
		// AU21 (harness-telemetry narrowing): no cost field on SessionResult anymore.
		expect(result).not.toHaveProperty("cost");
		expect(result.tokenUsage.byTier).toEqual({});
	});
});

// ── stopSession — real process-group kill (no mocks) ────────────────────────
//
// @lore process-group kill: proves the fix for the leak on 2026-09-26 — a real cursor-agent, spawned by a test, outlived the test process because child.kill(signal) only ever reached the one process we held a handle to. This test never mocks spawnFn: it spawns a real node subprocess that forks its own grandchild ('sleep'), then proves stopSession kills BOTH.

describe("CliHarnessAdapter stopSession — real process-group kill", () => {
	it("kills a grandchild process the harness child spawned", async () => {
		const script =
			"const {spawn}=require('child_process');" +
			"const c=spawn('sleep',['30']);" +
			'process.stdout.write(String(c.pid)+"\\n");';

		// NO spawnFn injected — this drives the real node:child_process.spawn.
		const adapter = new CliHarnessAdapter({
			binary: process.execPath,
			args: ["-e", script],
			envMap: {},
			eventFormat: "text",
			envAllowlist: ["PATH"],
		});

		const handle = await adapter.startSession(makeSessionConfig({ sandboxPath: process.cwd() }));

		let grandchildPid = -1;
		for await (const event of adapter.streamEvents(handle)) {
			if (event.type === "completion") {
				grandchildPid = Number((event as { type: "completion"; text: string }).text.trim());
				break;
			}
		}
		expect(grandchildPid).toBeGreaterThan(0);
		// The grandchild is alive before stop.
		expect(() => process.kill(grandchildPid, 0)).not.toThrow();

		await adapter.stopSession(handle);
		// Give the OS a moment to deliver the signal to the whole group.
		await new Promise((resolve) => setTimeout(resolve, 300));

		// The grandchild died with its parent — this is what child.kill(signal)
		// alone (no process group) could never prove.
		expect(() => process.kill(grandchildPid, 0)).toThrow();
	}, 15_000);
});

// ── stopSession — process-group kill when the parent already exited ─────────
//
// @lore process-group kill (done branch): stopSession's `session.done` branch (the CLI process already exited — the normal drain-then-stop sequence: exit fires, THEN the caller calls stopSession) used to return the buffered result WITHOUT signalling the process group at all. A grandchild that outlives its own exited parent was never touched. This test proves the fix: the parent exits on its own FIRST, then stopSession is called, and the grandchild still has to die.

describe("CliHarnessAdapter stopSession — parent already exited (session.done)", () => {
	it("still kills a grandchild when the parent process exited before stopSession was called", async () => {
		const script =
			"const {spawn}=require('child_process');" +
			"const c=spawn('sleep',['30']);" +
			'process.stdout.write(String(c.pid)+"\\n", () => process.exit(0));';

		// NO spawnFn injected — real node:child_process.spawn, same as the test above.
		const adapter = new CliHarnessAdapter({
			binary: process.execPath,
			args: ["-e", script],
			envMap: {},
			eventFormat: "text",
			envAllowlist: ["PATH"],
		});

		const handle = await adapter.startSession(makeSessionConfig({ sandboxPath: process.cwd() }));

		let grandchildPid = -1;
		for await (const event of adapter.streamEvents(handle)) {
			if (event.type === "completion") {
				grandchildPid = Number((event as { type: "completion"; text: string }).text.trim());
				break;
			}
		}
		expect(grandchildPid).toBeGreaterThan(0);

		// Give the parent (the "node -e" process) time to actually exit on its
		// own — session.done must already be true by the time we call
		// stopSession, or this test proves nothing about the `done` branch.
		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(() => process.kill(grandchildPid, 0)).not.toThrow();

		const result = await adapter.stopSession(handle);
		expect(result.outcome).toBe("completed");

		await new Promise((resolve) => setTimeout(resolve, 300));
		// The grandchild must be dead even though stopSession only saw an
		// already-exited parent — that used to leave it running forever.
		expect(() => process.kill(grandchildPid, 0)).toThrow();
	}, 15_000);
});

// ── process exit sweep ───────────────────────────────────────────────────────
//
// @lore process-exit backstop: detached:true means a spawned harness CLI no longer gets the terminal's SIGINT/SIGHUP on a forced `npm run dev` exit or crash. A single shared `process.on("exit", ...)` handler is the backstop, and `stopAllLiveHarnessSessions` is the exact function it calls.
//
// @lore no real exit event: this test calls `stopAllLiveHarnessSessions()` directly — never `process.emit("exit", ...)` on the real `process` object. Emitting the real event fires the ACTUAL shared handler, which sweeps every CliHarnessAdapter constructed anywhere else in this file, not just this test's own adapter — a real cross-test entanglement that is exactly how a prior version of this test (before every fake-child test in this file injected its own killFn) reached real `process.kill(-12345, "SIGKILL")` / `process.kill(-99999, "SIGKILL")` calls against the host, dozens of times per run. Calling the exported sweep function directly, with an adapter whose killFn is injected right here, tests the identical logic without touching global process state or any other test's adapter.
//
// @lore reused-pid gap: a `done` session (its CLI already exited) must NOT be swept here — see killAllLiveSessionGroups's own @lore for why. This test proves both halves in one pass: the still-running session is swept, the done one is not.

describe("CliHarnessAdapter — process exit sweep", () => {
	it("SIGKILLs every still-running session's process group, and skips a done one", async () => {
		const killFn = vi.fn();
		const spawnSpy = vi.fn();
		const runningChild = makeFakeChild();
		const doneChild = makeFakeChild();
		spawnSpy.mockReturnValueOnce(runningChild.proc).mockReturnValueOnce(doneChild.proc);

		const adapter = new CliHarnessAdapter(makeConfig({ args: [] }), {
			spawnFn: spawnSpy,
			killFn,
		});

		// Session 1: still running when the sweep fires.
		await adapter.startSession(makeSessionConfig());
		// Session 2: its CLI already exited. A caller that never calls
		// stopSession leaves it in `this.sessions` indefinitely — the sweep
		// must not re-signal it (its pid may since belong to another process).
		await adapter.startSession(makeSessionConfig());
		doneChild.emitExit(0, null);

		stopAllLiveHarnessSessions();

		expect(killFn).toHaveBeenCalledTimes(1);
		expect(killFn).toHaveBeenCalledWith(-12345, "SIGKILL");
	});
});

// ── getCapabilities ───────────────────────────────────────────────────────────

describe("CliHarnessAdapter getCapabilities", () => {
	it("returns expected capability values", () => {
		const adapter = new CliHarnessAdapter(makeConfig());
		const caps = adapter.getCapabilities();
		expect(caps.mcpSupport).toBe(true);
		expect(caps.preCompactionTrigger).toBe(false);
		expect(caps.subAgents).toBe(false);
		expect(caps.modelProviders).toEqual([]);
	});
});
