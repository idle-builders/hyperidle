/**
 * Unit tests for OpenCodeServeAdapter.
 * All process and network calls are injected fakes — no binary or server needed.
 */

import type { ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { OpenCodeServeAdapter } from "../opencode-serve-adapter.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A fake SSE stream that lets tests push events and close the stream. */
class FakeSseStream {
	private readonly chunks: string[] = [];
	// Tracked so pull() can close immediately if close() was called before the first read.
	private closed = false;
	private readonly readers: Array<{
		resolve(result: { done: boolean; value?: Uint8Array }): void;
	}> = [];

	/** Push an event in the stable API format: {type, properties}. */
	pushEvent(type: string, properties: Record<string, unknown>): void {
		if (this.closed) return;
		const event = { type, properties };
		const line = `data: ${JSON.stringify(event)}\n\n`;
		const chunk = new TextEncoder().encode(line);
		if (this.readers.length > 0) {
			const r = this.readers.shift();
			r?.resolve({ done: false, value: chunk });
		} else {
			this.chunks.push(line);
		}
	}

	close(): void {
		this.closed = true;
		if (this.readers.length > 0) {
			for (const r of this.readers) {
				r.resolve({ done: true });
			}
			this.readers.length = 0;
		}
	}

	asReadableStream(): ReadableStream<Uint8Array> {
		const pushChunks = this.chunks;
		const readers = this.readers;
		const isClosed = () => this.closed;
		return new ReadableStream<Uint8Array>({
			pull(controller) {
				if (pushChunks.length > 0) {
					const line = pushChunks.shift();
					if (line) controller.enqueue(new TextEncoder().encode(line));
					return;
				}
				if (isClosed()) {
					controller.close();
					return;
				}
				return new Promise<void>((resolve) => {
					readers.push({
						resolve(result: { done: boolean; value?: Uint8Array }) {
							if (result.done) {
								controller.close();
							} else if (result.value) {
								controller.enqueue(result.value);
							}
							resolve();
						},
					});
				});
			},
		});
	}
}

/** Build a minimal SessionConfig for tests. */
function makeConfig(overrides?: {
	sessionId?: string;
	sandboxPath?: string;
	instruction?: string;
	selectedModel?: string;
	returnHook?: { bridgeToken: string; mcpUrl: string; forceBudget: number };
}) {
	return {
		sessionId: overrides?.sessionId ?? "test-session-1",
		sandboxPath: overrides?.sandboxPath ?? "/tmp/sandbox",
		assembledPrompt: "test prompt",
		instruction: overrides?.instruction ?? "say HELLO",
		modelTier: "workhorse" as const,
		tools: [],
		selectedModel: overrides?.selectedModel,
		mcpConnectionInfo: undefined,
		returnHook: overrides?.returnHook,
	};
}

/** Build a fake spawn that immediately emits the port line on stdout (mirrors real opencode behavior). */
function makeFakeSpawn(port = 19800): typeof spawn {
	return vi.fn(() => {
		const stdout = new EventEmitter() as unknown as NonNullable<ChildProcess["stdout"]>;
		const child = Object.assign(new EventEmitter() as unknown as ChildProcess, {
			stdin: null,
			stdout,
			stderr: null,
			pid: 99999,
		});
		setImmediate(() => {
			stdout.emit("data", Buffer.from(`opencode server listening on http://127.0.0.1:${port}\n`));
		});
		return child;
	}) as unknown as typeof spawn;
}

/** Build a fake fetch that intercepts opencode stable API calls. */
function makeFakeFetch(sseStream: FakeSseStream) {
	return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
		const urlStr = String(url);

		// Session create: POST /session?directory=...
		if (urlStr.includes("/session?") && !urlStr.includes("/session/") && init?.method === "POST") {
			return new Response(JSON.stringify({ id: "ses_fake123" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Prompt async: POST /session/ses_fake123/prompt_async
		if (urlStr.includes("/session/ses_fake123/prompt_async") && init?.method === "POST") {
			return new Response(null, { status: 204 });
		}

		// Global SSE event stream: GET /event
		if (urlStr.includes("/event?")) {
			return new Response(sseStream.asReadableStream(), {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			});
		}

		// Abort: POST /session/ses_fake123/abort
		if (urlStr.includes("/abort") && init?.method === "POST") {
			return new Response(JSON.stringify(true), { status: 200 });
		}

		return new Response("not found", { status: 404 });
	});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("OpenCodeServeAdapter", () => {
	let xdgCfgDir: string;

	beforeEach(() => {
		xdgCfgDir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-test-cfg-"));
	});

	afterEach(() => {
		fs.rmSync(xdgCfgDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	test("startSession creates session and sends initial prompt", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgConfigHome: xdgCfgDir,
		});

		const handle = await adapter.startSession(makeConfig({ instruction: "say HELLO" }));
		expect(handle.sessionId).toMatch(/^opencode-serve-/);

		// Session create was called with directory query param (not in body)
		const createCall = fakeFetch.mock.calls.find(
			([url]) => String(url).includes("/session?") && !String(url).includes("/session/"),
		);
		expect(createCall).toBeDefined();
		expect(String(createCall?.[0])).toContain("directory=");

		// Initial prompt was sent via prompt_async
		const promptCall = fakeFetch.mock.calls.find(([url]) => String(url).includes("/prompt_async"));
		expect(promptCall).toBeDefined();
		const promptBody = JSON.parse(promptCall?.[1]?.body as string) as {
			parts: Array<{ type: string; text: string }>;
		};
		expect(promptBody.parts[0]?.text).toBe("say HELLO");

		sseStream.close();
	});

	test("streamEvents yields text events from SSE stream", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgConfigHome: xdgCfgDir,
		});

		const handle = await adapter.startSession(makeConfig());

		setImmediate(() => {
			// Announce assistant message first so text parts are emitted.
			sseStream.pushEvent("message.updated", {
				sessionID: "ses_fake123",
				info: { id: "msg1", role: "assistant" },
			});
			sseStream.pushEvent("message.part.updated", {
				sessionID: "ses_fake123",
				part: { id: "prt1", messageID: "msg1", type: "text", text: "Hello" },
			});
			sseStream.pushEvent("message.part.updated", {
				sessionID: "ses_fake123",
				part: { id: "prt2", messageID: "msg1", type: "text", text: " World" },
			});
			sseStream.close();
		});

		const events: Array<{ type: string; text?: string }> = [];
		for await (const evt of adapter.streamEvents(handle)) {
			events.push(evt);
		}

		const completions = events.filter(
			(e) => e.type === "completion" && (e as { text: string }).text !== "",
		);
		expect(completions.map((e) => (e as { text: string }).text)).toEqual(["Hello", " World"]);
	});

	test("text from user messages is not emitted", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgConfigHome: xdgCfgDir,
		});

		const handle = await adapter.startSession(makeConfig());

		setImmediate(() => {
			// User message — no message.updated with role "assistant"
			sseStream.pushEvent("message.part.updated", {
				sessionID: "ses_fake123",
				part: { id: "prt_user", messageID: "msg_user", type: "text", text: "user prompt" },
			});
			// Only then announce the assistant message
			sseStream.pushEvent("message.updated", {
				sessionID: "ses_fake123",
				info: { id: "msg_asst", role: "assistant" },
			});
			sseStream.pushEvent("message.part.updated", {
				sessionID: "ses_fake123",
				part: { id: "prt_asst", messageID: "msg_asst", type: "text", text: "assistant reply" },
			});
			sseStream.close();
		});

		const events: Array<{ type: string; text?: string }> = [];
		for await (const evt of adapter.streamEvents(handle)) {
			events.push(evt);
		}

		const completions = events
			.filter((e) => e.type === "completion")
			.map((e) => (e as { text: string }).text);
		// Only assistant reply, not user prompt
		expect(completions).toEqual(["assistant reply"]);
	});

	test("streamEvents yields tool_call events", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgConfigHome: xdgCfgDir,
		});

		const handle = await adapter.startSession(makeConfig());

		setImmediate(() => {
			sseStream.pushEvent("message.part.updated", {
				sessionID: "ses_fake123",
				part: {
					id: "prt_tool1",
					messageID: "msg1",
					type: "tool",
					callID: "call1",
					tool: "bash",
					state: { status: "running", input: { command: "echo hi" }, time: { start: 1 } },
				},
			});
			sseStream.close();
		});

		const events: Array<{ type: string }> = [];
		for await (const evt of adapter.streamEvents(handle)) {
			events.push(evt);
		}

		const toolCall = events.find((e) => e.type === "tool_call") as
			| { type: string; toolName: string; args: Record<string, unknown> }
			| undefined;
		expect(toolCall?.toolName).toBe("bash");
		expect(toolCall?.args).toEqual({ command: "echo hi" });
	});

	test("tool_call emitted only once per part (deduplicated across state updates)", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgConfigHome: xdgCfgDir,
		});

		const handle = await adapter.startSession(makeConfig());

		setImmediate(() => {
			// Same part ID emitted twice (pending → running state update)
			sseStream.pushEvent("message.part.updated", {
				sessionID: "ses_fake123",
				part: {
					id: "prt_tool1",
					messageID: "msg1",
					type: "tool",
					callID: "call1",
					tool: "bash",
					state: { status: "pending", input: { command: "echo hi" }, raw: "" },
				},
			});
			sseStream.pushEvent("message.part.updated", {
				sessionID: "ses_fake123",
				part: {
					id: "prt_tool1",
					messageID: "msg1",
					type: "tool",
					callID: "call1",
					tool: "bash",
					state: { status: "running", input: { command: "echo hi" }, time: { start: 1 } },
				},
			});
			sseStream.close();
		});

		const events: Array<{ type: string }> = [];
		for await (const evt of adapter.streamEvents(handle)) {
			events.push(evt);
		}

		const toolCalls = events.filter((e) => e.type === "tool_call");
		expect(toolCalls).toHaveLength(1);
	});

	test("session.idle event marks session done", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgConfigHome: xdgCfgDir,
		});

		const handle = await adapter.startSession(makeConfig());

		setImmediate(() => {
			sseStream.pushEvent("message.updated", {
				sessionID: "ses_fake123",
				info: { id: "msg1", role: "assistant" },
			});
			sseStream.pushEvent("message.part.updated", {
				sessionID: "ses_fake123",
				part: { id: "prt1", messageID: "msg1", type: "text", text: "done" },
			});
			// session.idle ends the session without closing the SSE stream
			sseStream.pushEvent("session.idle", { sessionID: "ses_fake123" });
		});

		const events: Array<{ type: string; text?: string }> = [];
		for await (const evt of adapter.streamEvents(handle)) {
			events.push(evt);
		}

		const completions = events.filter((e) => e.type === "completion");
		expect(completions).toHaveLength(1);

		// Clean up
		sseStream.close();
	});

	test("a long quiet run stays open until session.idle", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			const sseStream = new FakeSseStream();
			const adapter = new OpenCodeServeAdapter({
				spawnFn: makeFakeSpawn(),
				fetchFn: makeFakeFetch(sseStream) as typeof globalThis.fetch,
				xdgConfigHome: xdgCfgDir,
			});
			const handle = await adapter.startSession(makeConfig());

			// Ten minutes of a silent shell command: no events, the run is still going.
			await vi.advanceTimersByTimeAsync(10 * 60_000);
			expect(await adapter.deliver(handle, "still there?")).toBe("delivered");

			setImmediate(() => sseStream.pushEvent("session.idle", { sessionID: "ses_fake123" }));
			for await (const _ of adapter.streamEvents(handle)) {
				// drain until session.idle ends the run
			}
			expect(await adapter.deliver(handle, "after idle")).toBe("unsupported");
			sseStream.close();
		} finally {
			vi.useRealTimers();
		}
	});

	test("session.error event → crashed outcome and error event emitted", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgConfigHome: xdgCfgDir,
		});

		const handle = await adapter.startSession(makeConfig());

		setImmediate(() => {
			sseStream.pushEvent("session.error", {
				sessionID: "ses_fake123",
				error: {
					name: "ProviderAuthError",
					data: { providerID: "openrouter", message: "invalid api key" },
				},
			});
		});

		const events: Array<{ type: string }> = [];
		for await (const evt of adapter.streamEvents(handle)) {
			events.push(evt);
		}

		const result = await adapter.stopSession(handle);
		expect(result.outcome).toBe("crashed");

		const errorEvents = events.filter((e) => e.type === "error") as Array<{
			type: string;
			message: string;
			code: string;
		}>;
		expect(errorEvents).toHaveLength(1);
		expect(errorEvents[0]?.message).toBe("invalid api key");
		expect(errorEvents[0]?.code).toBe("ProviderAuthError");

		sseStream.close();
	});

	test("events from other sessions are ignored", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgConfigHome: xdgCfgDir,
		});

		const handle = await adapter.startSession(makeConfig());

		setImmediate(() => {
			// Event from a DIFFERENT session — must be ignored
			sseStream.pushEvent("message.updated", {
				sessionID: "ses_other999",
				info: { id: "msg_other", role: "assistant" },
			});
			sseStream.pushEvent("message.part.updated", {
				sessionID: "ses_other999",
				part: { id: "prt_other", messageID: "msg_other", type: "text", text: "not ours" },
			});
			sseStream.pushEvent("session.idle", { sessionID: "ses_other999" });
			// Correct session idle
			sseStream.pushEvent("session.idle", { sessionID: "ses_fake123" });
		});

		const events: Array<{ type: string }> = [];
		for await (const evt of adapter.streamEvents(handle)) {
			events.push(evt);
		}

		const completions = events.filter((e) => e.type === "completion");
		expect(completions).toHaveLength(0);
		// Clean up
		sseStream.close();
	});

	test("deliver sends prompt_async with text and model", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgConfigHome: xdgCfgDir,
		});

		const handle = await adapter.startSession(
			makeConfig({ selectedModel: "openrouter/mistral/mistral-7b" }),
		);
		const result = await adapter.deliver(handle, "focus on the main task");
		expect(result).toBe("delivered");

		// The deliver call must include both the text and the model
		const steerCall = fakeFetch.mock.calls
			.filter(([url]) => String(url).includes("/prompt_async"))
			.pop();
		const steerBody = JSON.parse(steerCall?.[1]?.body as string) as {
			parts: Array<{ type: string; text: string }>;
			model?: { providerID: string; modelID: string };
		};
		expect(steerBody.parts[0]?.text).toBe("focus on the main task");
		expect(steerBody.model).toEqual({ providerID: "openrouter", modelID: "mistral/mistral-7b" });

		sseStream.close();
	});

	test("deliver returns unsupported after session is done", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgConfigHome: xdgCfgDir,
		});

		const handle = await adapter.startSession(makeConfig());
		sseStream.close();

		// Wait for session to finish
		for await (const _ of adapter.streamEvents(handle)) {
			// drain
		}

		const result = await adapter.deliver(handle, "too late");
		expect(result).toBe("unsupported");
	});

	test("getCapabilities returns sdk-inprocess and opencode-json", () => {
		const adapter = new OpenCodeServeAdapter({ xdgConfigHome: xdgCfgDir });
		const caps = adapter.getCapabilities();
		expect(caps.returnEnforcement).toBe("sdk-inprocess");
		expect(caps.cliMcpDialect).toBe("opencode-json");
		expect(caps.mcpSupport).toBe(true);
	});

	test("stopSession marks session done and returns completed outcome", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgConfigHome: xdgCfgDir,
		});

		const handle = await adapter.startSession(makeConfig());
		const result = await adapter.stopSession(handle);
		expect(result.outcome).toBe("completed");
	});

	test("stopSession abort failure does not produce an unhandled rejection", async () => {
		// Plain function (not vi.fn) — vi.fn attaches an internal .catch to track mock calls, which
		// prevents the unhandledRejection event from firing and makes this test unable to go red.
		const plainFetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			const urlStr = String(url);
			if (
				urlStr.includes("/session?") &&
				!urlStr.includes("/session/") &&
				init?.method === "POST"
			) {
				return new Response(JSON.stringify({ id: "ses_abort_fail" }), { status: 200 });
			}
			if (urlStr.includes("/prompt_async") && init?.method === "POST") {
				return new Response(null, { status: 204 });
			}
			if (urlStr.includes("/event?")) {
				// Hang until aborted — active session mid-run
				return new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => {
						reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
					});
				});
			}
			if (urlStr.includes("/abort") && init?.method === "POST") {
				// Reject — server died just before the abort arrived
				throw new TypeError("fetch failed");
			}
			return new Response("ok", { status: 200 });
		};

		const unhandledRejections: unknown[] = [];
		const urHandler = (reason: unknown) => {
			unhandledRejections.push(reason);
		};
		process.on("unhandledRejection", urHandler);

		try {
			const fakeSpawn = makeFakeSpawn();
			const adapter = new OpenCodeServeAdapter({
				spawnFn: fakeSpawn,
				fetchFn: plainFetch as typeof globalThis.fetch,
				xdgConfigHome: xdgCfgDir,
				// Short timeout so the test does not wait for the 2s default
				abortTimeoutMs: 100,
			});

			const handle = await adapter.startSession(makeConfig());
			// Session is not done — stopSession must hit the abort path
			const result = await adapter.stopSession(handle);
			expect(result.outcome).toBe("completed");
			// Give Node.js a tick to detect any unhandled rejection from the abort fetch
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(unhandledRejections, "stopSession must not leave an unhandled rejection").toHaveLength(
				0,
			);
		} finally {
			process.off("unhandledRejection", urHandler);
		}
	});

	test("model passed to prompt_async as {providerID, modelID}", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgConfigHome: xdgCfgDir,
		});

		await adapter.startSession(makeConfig({ selectedModel: "openrouter/z-ai/glm-4.7-flash" }));

		// Model appears on prompt_async (not on session create)
		const promptCall = fakeFetch.mock.calls.find(([url]) => String(url).includes("/prompt_async"));
		const promptBody = JSON.parse(promptCall?.[1]?.body as string) as {
			model?: { providerID: string; modelID: string };
		};
		expect(promptBody.model).toEqual({
			providerID: "openrouter",
			modelID: "z-ai/glm-4.7-flash",
		});

		sseStream.close();
	});

	test("return gate blocks and sends follow-up prompt", async () => {
		const sseStream = new FakeSseStream();

		let fetchCallCount = 0;
		let promptCount = 0;
		const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			const urlStr = String(url);

			if (
				urlStr.includes("/session?") &&
				!urlStr.includes("/session/") &&
				init?.method === "POST"
			) {
				return new Response(JSON.stringify({ id: "ses_gate" }), { status: 200 });
			}
			if (urlStr.includes("/session/ses_gate/prompt_async") && init?.method === "POST") {
				promptCount++;
				if (promptCount > 1) {
					// Follow-up prompt (gate re-engage) — schedule idle so the generator exits
					setImmediate(() => {
						sseStream.pushEvent("session.idle", { sessionID: "ses_gate" });
					});
				}
				return new Response(null, { status: 204 });
			}
			if (urlStr.includes("/event?")) {
				return new Response(sseStream.asReadableStream(), {
					status: 200,
					headers: { "Content-Type": "text/event-stream" },
				});
			}
			if (urlStr.includes("/return-status")) {
				fetchCallCount++;
				// Block on first call, approve on second
				const text = fetchCallCount === 1 ? "Please return to the topic." : "";
				return new Response(text, { status: 200 });
			}
			return new Response("ok", { status: 200 });
		});

		const fakeSpawn = makeFakeSpawn();
		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fetchFn as typeof globalThis.fetch,
			xdgConfigHome: xdgCfgDir,
		});

		const handle = await adapter.startSession(
			makeConfig({
				returnHook: {
					bridgeToken: "test-token",
					mcpUrl: "http://localhost:9/api/mcp/x",
					forceBudget: 5,
				},
			}),
		);

		// Signal first turn done via session.idle (stream stays open for follow-up turn)
		setImmediate(() => {
			sseStream.pushEvent("session.idle", { sessionID: "ses_gate" });
		});

		// Drain the stream — gate fires, follow-up sent, then approved
		const events: Array<{ type: string }> = [];
		for await (const evt of adapter.streamEvents(handle)) {
			events.push(evt);
		}

		// Return gate was checked at least twice (once blocked, once approved)
		expect(fetchCallCount).toBeGreaterThanOrEqual(2);
		// Force return count was incremented
		expect(adapter.getForceReturnCount("test-session-1")).toBeGreaterThanOrEqual(1);
	});

	test("spawn receives isolated XDG env — no full-env leak", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);

		let capturedEnv: Record<string, string> | undefined;
		const fakeSpawn = vi.fn(
			(_cmd: string, _args: string[], opts: { env?: Record<string, string> }) => {
				capturedEnv = opts.env;
				const stdout = new EventEmitter() as unknown as NonNullable<ChildProcess["stdout"]>;
				const child = Object.assign(new EventEmitter() as unknown as ChildProcess, {
					stdin: null,
					stdout,
					stderr: null,
					pid: 99998,
				});
				setImmediate(() => {
					stdout.emit("data", Buffer.from("opencode server listening on http://127.0.0.1:19900\n"));
				});
				return child;
			},
		);

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn as unknown as typeof spawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgConfigHome: xdgCfgDir,
		});

		await adapter.startSession(makeConfig());

		// XDG_CONFIG_HOME must be the isolated dir; XDG_DATA_HOME is passed through from process.env
		expect(capturedEnv?.XDG_CONFIG_HOME).toBe(xdgCfgDir);
		expect(capturedEnv?.OPENCODE_PERMISSION).toBe('{"*":"allow"}');

		// Env must not contain random process env keys (no full-env passthrough)
		const allowlist = [
			"PATH",
			"HOME",
			"LANG",
			"OPENROUTER_API_KEY",
			"XDG_DATA_HOME",
			"XDG_CONFIG_HOME",
			"OPENCODE_PERMISSION",
		];
		const leakedKeys = Object.keys(process.env).filter(
			(k) => !allowlist.includes(k) && capturedEnv?.[k] !== undefined,
		);
		expect(leakedKeys, "env must not leak process.env keys outside the allowlist").toHaveLength(0);

		sseStream.close();
	});

	test("server exits mid-turn → session ends as crashed", async () => {
		let serverChild: EventEmitter | undefined;
		const fakeSpawn = vi.fn(() => {
			const stdout = new EventEmitter() as unknown as NonNullable<ChildProcess["stdout"]>;
			const child = Object.assign(new EventEmitter() as unknown as ChildProcess, {
				stdin: null,
				stdout,
				stderr: null,
				pid: 99999,
			});
			serverChild = child as unknown as EventEmitter;
			setImmediate(() => {
				stdout.emit("data", Buffer.from("opencode server listening on http://127.0.0.1:19802\n"));
			});
			return child;
		}) as unknown as typeof spawn;

		// SSE fetch hangs until aborted — simulates an active session mid-turn
		const fakeFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			const urlStr = String(url);
			if (
				urlStr.includes("/session?") &&
				!urlStr.includes("/session/") &&
				init?.method === "POST"
			) {
				return new Response(JSON.stringify({ id: "ses_crash" }), { status: 200 });
			}
			if (urlStr.includes("/prompt_async") && init?.method === "POST") {
				return new Response(null, { status: 204 });
			}
			if (urlStr.includes("/event")) {
				// Hang until aborted — represents an active SSE stream
				return new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => {
						const err = Object.assign(new Error("aborted"), { name: "AbortError" });
						reject(err);
					});
				});
			}
			return new Response("ok", { status: 200 });
		}) as typeof globalThis.fetch;

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch,
			xdgConfigHome: xdgCfgDir,
		});

		const handle = await adapter.startSession(makeConfig());

		// Give the SSE subscription a tick to start its pending fetch
		await new Promise<void>((resolve) => setImmediate(resolve));

		// Simulate server process exiting while session is running
		serverChild?.emit("exit", 1, null);

		// Session is now crashed+done synchronously from the exit handler
		const result = await adapter.stopSession(handle);
		expect(result.outcome).toBe("crashed");
	});

	test("server auto-killed when last session ends", async () => {
		const killSpy = vi.fn();

		// Two separate SSE streams — one per /event subscription (routed by call count).
		const sseStream1 = new FakeSseStream();
		const sseStream2 = new FakeSseStream();
		let sessionIdx = 0;
		let eventCallCount = 0;

		const fakeFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			const urlStr = String(url);
			if (
				urlStr.includes("/session?") &&
				!urlStr.includes("/session/") &&
				init?.method === "POST"
			) {
				sessionIdx++;
				const id = `ses_s${sessionIdx}`;
				return new Response(JSON.stringify({ id }), { status: 200 });
			}
			if (urlStr.includes("/prompt_async") && init?.method === "POST") {
				return new Response(null, { status: 204 });
			}
			if (urlStr.includes("/event?")) {
				// Each /event subscription gets its own stream (first call → stream1, second → stream2).
				eventCallCount++;
				const stream = eventCallCount === 1 ? sseStream1 : sseStream2;
				return new Response(stream.asReadableStream(), {
					status: 200,
					headers: { "Content-Type": "text/event-stream" },
				});
			}
			return new Response("ok", { status: 200 });
		}) as typeof globalThis.fetch;

		const fakeSpawn = makeFakeSpawn(19803);
		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			killFn: killSpy,
			fetchFn: fakeFetch,
			xdgConfigHome: xdgCfgDir,
		});

		const handle1 = await adapter.startSession(makeConfig({ sessionId: "s1" }));
		const handle2 = await adapter.startSession(makeConfig({ sessionId: "s2" }));

		// Close first stream and stop first session
		sseStream1.close();
		for await (const _ of adapter.streamEvents(handle1)) {
			// drain
		}
		await adapter.stopSession(handle1);
		expect(
			killSpy,
			"server must stay alive when second session is still running",
		).not.toHaveBeenCalled();

		// Close second stream and stop second session
		sseStream2.close();
		for await (const _ of adapter.streamEvents(handle2)) {
			// drain
		}
		await adapter.stopSession(handle2);
		expect(killSpy, "server must be killed after last session ends").toHaveBeenCalledWith(
			99999,
			"SIGKILL",
		);
	});
});
