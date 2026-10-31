/**
 * Unit tests for OpenCodeServeAdapter.
 * All process and network calls are injected fakes — no binary or server needed.
 */

import type { ChildProcess } from "node:child_process";
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
	private closeResolve?: () => void;
	private readonly readers: Array<{
		resolve(result: { done: boolean; value?: Uint8Array }): void;
	}> = [];

	pushEvent(type: string, data: Record<string, unknown>): void {
		const event = { type, data };
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
		if (this.readers.length > 0) {
			for (const r of this.readers) {
				r.resolve({ done: true });
			}
			this.readers.length = 0;
		}
		this.closeResolve?.();
	}

	asReadableStream(): ReadableStream<Uint8Array> {
		const pushChunks = this.chunks;
		const readers = this.readers;
		return new ReadableStream<Uint8Array>({
			pull(controller) {
				if (pushChunks.length > 0) {
					const line = pushChunks.shift();
					if (line) controller.enqueue(new TextEncoder().encode(line));
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
	sandboxPath?: string;
	instruction?: string;
	selectedModel?: string;
	returnHook?: { bridgeToken: string; mcpUrl: string; forceBudget: number };
}) {
	return {
		sessionId: "test-session-1",
		sandboxPath: overrides?.sandboxPath ?? "/tmp/sandbox",
		assembledPrompt: "test prompt",
		instruction: overrides?.instruction ?? "say HELLO",
		modelTier: "medium" as const,
		tools: [],
		selectedModel: overrides?.selectedModel,
		returnHook: overrides?.returnHook,
	};
}

/** Build a fake spawn that immediately emits the port line on stdout (mirrors real opencode behavior). */
function makeFakeSpawn(port = 19800) {
	return vi.fn(() => {
		const child = new EventEmitter() as ChildProcess & {
			stdin: null;
			stdout: EventEmitter;
			stderr: null;
			pid: number;
		};
		child.stdin = null;
		child.stdout = new EventEmitter();
		child.stderr = null;
		child.pid = 99999;
		setImmediate(() => {
			child.stdout.emit(
				"data",
				Buffer.from(`opencode server listening on http://127.0.0.1:${port}\n`),
			);
		});
		return child as unknown as ChildProcess;
	});
}

/** Build a fake fetch that intercepts opencode API calls. */
function makeFakeFetch(sseStream: FakeSseStream) {
	return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
		const urlStr = String(url);

		// Session create
		if (urlStr.endsWith("/api/session") && init?.method === "POST") {
			return new Response(
				JSON.stringify({ data: { id: "ses_fake123" } }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}

		// Prompt
		if (urlStr.includes("/api/session/ses_fake123/prompt") && init?.method === "POST") {
			return new Response(
				JSON.stringify({ data: { admittedSeq: 1, delivery: "steer" } }),
				{ status: 200 },
			);
		}

		// SSE event stream
		if (urlStr.includes("/api/session/ses_fake123/event")) {
			return new Response(sseStream.asReadableStream(), {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			});
		}

		// Interrupt
		if (urlStr.includes("/interrupt") && init?.method === "POST") {
			return new Response(null, { status: 200 });
		}

		return new Response("not found", { status: 404 });
	});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("OpenCodeServeAdapter", () => {
	let xdgDir: string;

	beforeEach(() => {
		xdgDir = fs.mkdtempSync(path.join(os.tmpdir(), "oc-test-xdg-"));
	});

	afterEach(() => {
		fs.rmSync(xdgDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	test("startSession creates session and sends initial prompt", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgDataHome: xdgDir,
		});

		const handle = await adapter.startSession(makeConfig({ instruction: "say HELLO" }));
		expect(handle.sessionId).toMatch(/^opencode-serve-/);

		// Session create was called
		const createCall = fakeFetch.mock.calls.find(([url]) =>
			String(url).endsWith("/api/session"),
		);
		expect(createCall).toBeDefined();
		const createBody = JSON.parse(createCall?.[1]?.body as string);
		expect(createBody.location.directory).toBe("/tmp/sandbox");

		// Initial prompt was sent
		const promptCall = fakeFetch.mock.calls.find(([url]) =>
			String(url).includes("/prompt"),
		);
		expect(promptCall).toBeDefined();
		const promptBody = JSON.parse(promptCall?.[1]?.body as string);
		expect(promptBody.prompt.text).toBe("say HELLO");
		expect(promptBody.resume).toBe(true);

		sseStream.close();
	});

	test("streamEvents yields text events from SSE stream", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgDataHome: xdgDir,
		});

		const handle = await adapter.startSession(makeConfig());

		// Push events and then close
		setImmediate(() => {
			sseStream.pushEvent("session.next.text.delta", { text: "Hello" });
			sseStream.pushEvent("session.next.text.delta", { text: " World" });
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

	test("streamEvents yields tool_call events", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgDataHome: xdgDir,
		});

		const handle = await adapter.startSession(makeConfig());

		setImmediate(() => {
			sseStream.pushEvent("session.next.step.started", {});
			sseStream.pushEvent("session.next.tool.called", {
				tool: "bash",
				input: { command: "echo hi" },
			});
			sseStream.pushEvent("session.next.step.ended", {});
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

	test("deliver sends steer prompt and returns delivered", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgDataHome: xdgDir,
		});

		const handle = await adapter.startSession(makeConfig());
		const result = await adapter.deliver(handle, "focus on the main task");
		expect(result).toBe("delivered");

		// Check the steer call used delivery: "steer"
		const steerCall = fakeFetch.mock.calls
			.filter(([url]) => String(url).includes("/prompt"))
			.pop();
		const steerBody = JSON.parse(steerCall?.[1]?.body as string);
		expect(steerBody.delivery).toBe("steer");
		expect(steerBody.prompt.text).toBe("focus on the main task");

		sseStream.close();
	});

	test("deliver returns unsupported after session is done", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgDataHome: xdgDir,
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

	test("getCapabilities returns settings-codex and opencode-json", () => {
		const adapter = new OpenCodeServeAdapter({ xdgDataHome: xdgDir });
		const caps = adapter.getCapabilities();
		expect(caps.returnEnforcement).toBe("settings-codex");
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
			xdgDataHome: xdgDir,
		});

		const handle = await adapter.startSession(makeConfig());
		const result = await adapter.stopSession(handle);
		expect(result.outcome).toBe("completed");
	});

	test("model parsing splits provider/model correctly", async () => {
		const sseStream = new FakeSseStream();
		const fakeFetch = makeFakeFetch(sseStream);
		const fakeSpawn = makeFakeSpawn();

		const adapter = new OpenCodeServeAdapter({
			spawnFn: fakeSpawn,
			fetchFn: fakeFetch as typeof globalThis.fetch,
			xdgDataHome: xdgDir,
		});

		await adapter.startSession(
			makeConfig({ selectedModel: "openrouter/z-ai/glm-4.7-flash" }),
		);

		const createCall = fakeFetch.mock.calls.find(([url]) =>
			String(url).endsWith("/api/session"),
		);
		const createBody = JSON.parse(createCall?.[1]?.body as string);
		expect(createBody.model).toEqual({
			providerID: "openrouter",
			id: "z-ai/glm-4.7-flash",
		});

		sseStream.close();
	});

	test("return gate blocks and sends follow-up prompt", async () => {
		const sseStream = new FakeSseStream();

		let fetchCallCount = 0;
		const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
			const urlStr = String(url);

			if (urlStr.endsWith("/api/session") && init?.method === "POST") {
				return new Response(JSON.stringify({ data: { id: "ses_gate" } }), { status: 200 });
			}
			if (urlStr.includes("/api/session/ses_gate/prompt") && init?.method === "POST") {
				return new Response(JSON.stringify({ data: {} }), { status: 200 });
			}
			if (urlStr.includes("/api/session/ses_gate/event")) {
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
			xdgDataHome: xdgDir,
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

		// Close after first stream subscription (simulates end of first turn)
		setImmediate(() => {
			sseStream.close();
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
});
