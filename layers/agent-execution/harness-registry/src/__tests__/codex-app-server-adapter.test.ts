/**
 * Unit tests for CodexAppServerAdapter — JSON-RPC protocol behavior, deliver, and return gate.
 *
 * Uses a fake spawn with PassThrough streams so no real codex binary is needed.
 */

import type { ChildProcess } from "node:child_process";
import { PassThrough } from "node:stream";
import type { SessionConfig } from "@hyperidle/harness-protocol";
import { describe, expect, test } from "vitest";
import { CodexAppServerAdapter } from "../codex-app-server-adapter.js";

// Minimal SessionConfig for unit tests (no real sandbox, no real model)
const BASE_CONFIG: SessionConfig = {
	sessionId: "unit-test-session",
	sandboxPath: "/tmp/fake-sandbox",
	assembledPrompt: "You are a test agent.",
	instruction: "Reply with exactly: TEST_OK",
	modelTier: "workhorse",
	tools: [],
	selectedModel: "gpt-4o-mini",
	mcpConnectionInfo: undefined,
};

const FAKE_THREAD_ID = "thread-unit-1";
const FAKE_TURN_ID = "turn-unit-1";

interface FakeServerParts {
	adapter: CodexAppServerAdapter;
	/** Written stdin lines (each already a complete JSON-RPC message string) */
	stdinLines: string[];
	/** Direct access to the fake stdout PassThrough for injecting notifications */
	fakeStdout: PassThrough;
	triggerExit(code: number, signal: string | null): void;
}

/**
 * Builds a fake codex app-server that auto-responds to well-known requests.
 * Responses come in synchronously via PassThrough, so await startSession
 * resolves with no real I/O.
 */
function makeFakeServer(opts?: {
	/** Optional fake fetch — injected so gate tests don't need a real HTTP server. */
	fetchFn?: typeof globalThis.fetch;
	/** Override the SIGKILL escalation timeout (default: adapter default; use large value to disable in tests). */
	sigkillTimeoutMs?: number;
}): FakeServerParts {
	const stdinLines: string[] = [];

	const fakeStdout = new PassThrough();
	const fakeStdin = new PassThrough();

	// Intercept stdin writes and respond immediately on stdout
	fakeStdin.on("data", (chunk: Buffer) => {
		const raw = chunk.toString();
		for (const line of raw.split("\n")) {
			if (!line.trim()) continue;
			stdinLines.push(line);
			let parsed: { method: string; id: number };
			try {
				parsed = JSON.parse(line) as { method: string; id: number };
			} catch {
				continue;
			}
			let result: unknown;
			if (parsed.method === "initialize") {
				result = {
					userAgent: "codex/fake",
					codexHome: "/tmp/fake-codex-home",
					platformFamily: "unix",
					platformOs: "macos",
				};
			} else if (parsed.method === "thread/start") {
				result = { thread: { id: FAKE_THREAD_ID } };
			} else if (parsed.method === "turn/start") {
				result = { turn: { id: FAKE_TURN_ID } };
				// Also emit turn/started notification so activeTurnId is set from notification path
				fakeStdout.push(
					`${JSON.stringify({
						method: "turn/started",
						params: { threadId: FAKE_THREAD_ID, turn: { id: FAKE_TURN_ID } },
					})}\n`,
				);
			} else if (parsed.method === "turn/steer") {
				result = { turnId: FAKE_TURN_ID };
			}
			if (result !== undefined) {
				fakeStdout.push(`${JSON.stringify({ id: parsed.id, result })}\n`);
			}
		}
	});

	const exitHandlers: Array<(code: number | null, signal: string | null) => void> = [];

	const fakeChild = {
		pid: 99999,
		stdin: fakeStdin,
		stdout: fakeStdout,
		stderr: new PassThrough(),
		on(event: string, handler: unknown) {
			if (event === "exit") {
				exitHandlers.push(handler as (code: number | null, signal: string | null) => void);
			}
			return fakeChild;
		},
		kill() {
			// no-op in unit tests
		},
	} as unknown as ChildProcess;

	const adapter = new CodexAppServerAdapter({
		spawnFn: (() => fakeChild) as unknown as typeof import("node:child_process").spawn,
		killFn: () => {
			// no-op in unit tests
		},
		...(opts?.fetchFn ? { fetchFn: opts.fetchFn } : {}),
		...(opts?.sigkillTimeoutMs !== undefined ? { sigkillTimeoutMs: opts.sigkillTimeoutMs } : {}),
	});

	return {
		adapter,
		stdinLines,
		fakeStdout,
		triggerExit(code, signal) {
			for (const h of exitHandlers) h(code, signal);
		},
	};
}

describe("CodexAppServerAdapter", () => {
	test("deliver sends turn/steer with correct params when session is active", async () => {
		const { adapter, stdinLines } = makeFakeServer();

		const handle = await adapter.startSession(BASE_CONFIG);
		const result = await adapter.deliver(handle, "steer message here");

		expect(result).toBe("delivered");

		const steerLine = stdinLines.find((l) => l.includes('"turn/steer"'));
		expect(steerLine, "turn/steer request must appear in stdin").toBeDefined();

		const msg = JSON.parse(steerLine!) as {
			method: string;
			params: {
				threadId: string;
				expectedTurnId: string;
				input: Array<{ type: string; text: string }>;
			};
		};
		expect(msg.method).toBe("turn/steer");
		expect(msg.params.threadId).toBe(FAKE_THREAD_ID);
		expect(msg.params.expectedTurnId).toBe(FAKE_TURN_ID);
		expect(msg.params.input[0]?.text).toBe("steer message here");
	});

	test("deliver returns unsupported when session does not exist", async () => {
		const { adapter } = makeFakeServer();

		const result = await adapter.deliver({ sessionId: "nonexistent" }, "hello");
		expect(result).toBe("unsupported");
	});

	test("stopSession does not resolve before the child exits when turn is done but process is still alive", async () => {
		// sigkillTimeoutMs is large so the escalation timer never fires — we drive exit manually.
		const { adapter, fakeStdout, triggerExit } = makeFakeServer({ sigkillTimeoutMs: 600_000 });
		const handle = await adapter.startSession(BASE_CONFIG);

		// Mark the turn completed without the process exiting.
		fakeStdout.push(
			`${JSON.stringify({
				method: "turn/completed",
				params: { threadId: FAKE_THREAD_ID, turn: { id: FAKE_TURN_ID } },
			})}\n`,
		);
		// Let the notification be processed (session.done → true, exitCode still null).
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		let resolved = false;
		const stopPromise = adapter.stopSession(handle).then((result) => {
			resolved = true;
			return result;
		});

		// Several ticks must pass without the promise resolving.
		await new Promise<void>((resolve) => setTimeout(resolve, 20));
		expect(resolved, "stopSession must not resolve before the child emits exit").toBe(false);

		// Process finally exits — the promise must now resolve.
		triggerExit(0, null);
		await stopPromise;
		expect(resolved).toBe(true);
	}, 60_000);

	test("settles every caller when two stops overlap", async () => {
		const { adapter, triggerExit } = makeFakeServer({ sigkillTimeoutMs: 600_000 });
		const handle = await adapter.startSession(BASE_CONFIG);

		const first = adapter.stopSession(handle);
		const second = adapter.stopSession(handle);
		triggerExit(0, null);

		const results = await Promise.all([first, second]);
		expect(results.map((result) => result.outcome)).toEqual(["completed", "completed"]);
	}, 10_000);

	test("streamEvents yields completion text from item/agentMessage/delta notifications", async () => {
		const { adapter, triggerExit } = makeFakeServer();

		const handle = await adapter.startSession(BASE_CONFIG);

		const session = (
			adapter as unknown as {
				sessions: Map<string, { child: { stdout: PassThrough; done: boolean } }>;
			}
		).sessions.get(handle.sessionId);
		expect(session).toBeDefined();

		const events: string[] = [];
		const streaming = (async () => {
			for await (const ev of adapter.streamEvents(handle)) {
				if (ev.type === "completion") events.push(ev.text);
			}
		})();

		// Push a delta notification
		session!.child.stdout.push(
			`${JSON.stringify({
				method: "item/agentMessage/delta",
				params: {
					threadId: FAKE_THREAD_ID,
					turnId: FAKE_TURN_ID,
					itemId: "item-1",
					delta: "hello world",
				},
			})}\n`,
		);

		// Push turn/completed to close the stream
		session!.child.stdout.push(
			`${JSON.stringify({
				method: "turn/completed",
				params: { threadId: FAKE_THREAD_ID, turn: { id: FAKE_TURN_ID } },
			})}\n`,
		);

		await streaming;
		triggerExit(0, null);

		expect(events).toEqual(["hello world"]);
	});
});

describe("CodexAppServerAdapter return gate", () => {
	test("gate approves (empty response): session ends without a follow-up turn", async () => {
		// Fake fetch: always approve (empty body).
		const fakeFetch = async () =>
			new Response("", { status: 200 }) as unknown as ReturnType<typeof globalThis.fetch>;

		const { adapter, fakeStdout, stdinLines } = makeFakeServer({
			fetchFn: fakeFetch as unknown as typeof globalThis.fetch,
		});

		const config: SessionConfig = {
			...BASE_CONFIG,
			sessionId: "gate-approve-session",
			returnHook: { bridgeToken: "tok", mcpUrl: "http://fake-bridge", forceBudget: 2 },
		};
		const handle = await adapter.startSession(config);

		const session = (
			adapter as unknown as {
				sessions: Map<string, { child: { stdout: PassThrough } }>;
			}
		).sessions.get(handle.sessionId);
		expect(session).toBeDefined();

		const streaming = (async () => {
			for await (const _ev of adapter.streamEvents(handle)) {
				// drain
			}
		})();

		// Complete the turn — gate should approve and stream should end.
		fakeStdout.push(
			`${JSON.stringify({
				method: "turn/completed",
				params: { threadId: FAKE_THREAD_ID, turn: { id: FAKE_TURN_ID } },
			})}\n`,
		);

		await streaming;

		// No second turn/start should have been sent.
		const turnStarts = stdinLines.filter((l) => l.includes('"turn/start"'));
		expect(turnStarts).toHaveLength(1); // only the initial one

		expect(adapter.getForceReturnCount("gate-approve-session")).toBe(0);
	});

	test("gate blocks (non-empty response): starts a follow-up turn then approves", async () => {
		let callCount = 0;
		const fakeFetch = async () => {
			callCount++;
			const body = callCount === 1 ? "summarize your work" : "";
			return new Response(body, { status: 200 }) as unknown as ReturnType<typeof globalThis.fetch>;
		};

		const { adapter, fakeStdout, stdinLines } = makeFakeServer({
			fetchFn: fakeFetch as unknown as typeof globalThis.fetch,
		});

		const config: SessionConfig = {
			...BASE_CONFIG,
			sessionId: "gate-block-session",
			returnHook: { bridgeToken: "tok", mcpUrl: "http://fake-bridge", forceBudget: 2 },
		};
		const handle = await adapter.startSession(config);

		const session = (
			adapter as unknown as {
				sessions: Map<string, { child: { stdout: PassThrough } }>;
			}
		).sessions.get(handle.sessionId);
		expect(session).toBeDefined();

		const streaming = (async () => {
			for await (const _ev of adapter.streamEvents(handle)) {
				// drain
			}
		})();

		// Complete the first turn — gate will block and send follow-up turn/start.
		fakeStdout.push(
			`${JSON.stringify({
				method: "turn/completed",
				params: { threadId: FAKE_THREAD_ID, turn: { id: FAKE_TURN_ID } },
			})}\n`,
		);

		// Wait briefly for the follow-up turn/start to be sent.
		await new Promise<void>((resolve) => setTimeout(resolve, 50));

		// Adapter should have sent a second turn/start with the force message.
		const turnStarts = stdinLines.filter((l) => l.includes('"turn/start"'));
		expect(turnStarts).toHaveLength(2);

		const followUp = JSON.parse(turnStarts[1]!) as {
			params: { input: Array<{ text: string }> };
		};
		expect(followUp.params.input[0]?.text).toBe("summarize your work");

		// Complete the second turn — gate should now approve.
		fakeStdout.push(
			`${JSON.stringify({
				method: "turn/completed",
				params: { threadId: FAKE_THREAD_ID, turn: { id: FAKE_TURN_ID } },
			})}\n`,
		);

		await streaming;

		expect(adapter.getForceReturnCount("gate-block-session")).toBe(1);
	});

	test("gate respects forceBudget: stops forcing after budget is exhausted", async () => {
		// Always return a force message — should stop after forceBudget turns.
		const fakeFetch = async () =>
			new Response("keep going", {
				status: 200,
			}) as unknown as ReturnType<typeof globalThis.fetch>;

		const { adapter, fakeStdout, stdinLines } = makeFakeServer({
			fetchFn: fakeFetch as unknown as typeof globalThis.fetch,
		});

		const config: SessionConfig = {
			...BASE_CONFIG,
			sessionId: "gate-budget-session",
			returnHook: { bridgeToken: "tok", mcpUrl: "http://fake-bridge", forceBudget: 1 },
		};
		const handle = await adapter.startSession(config);

		const session = (
			adapter as unknown as {
				sessions: Map<string, { child: { stdout: PassThrough } }>;
			}
		).sessions.get(handle.sessionId);
		expect(session).toBeDefined();

		const streaming = (async () => {
			for await (const _ev of adapter.streamEvents(handle)) {
				// drain
			}
		})();

		// First turn completes — gate blocks (1st force).
		fakeStdout.push(
			`${JSON.stringify({
				method: "turn/completed",
				params: { threadId: FAKE_THREAD_ID, turn: { id: FAKE_TURN_ID } },
			})}\n`,
		);

		await new Promise<void>((resolve) => setTimeout(resolve, 50));

		// Second turn start should have been sent (budget = 1, so 1 force is allowed).
		const turnStarts1 = stdinLines.filter((l) => l.includes('"turn/start"'));
		expect(turnStarts1).toHaveLength(2);

		// Second turn completes — budget exhausted, gate must approve now.
		fakeStdout.push(
			`${JSON.stringify({
				method: "turn/completed",
				params: { threadId: FAKE_THREAD_ID, turn: { id: FAKE_TURN_ID } },
			})}\n`,
		);

		await streaming;

		// No third turn/start should have been sent.
		const turnStarts2 = stdinLines.filter((l) => l.includes('"turn/start"'));
		expect(turnStarts2).toHaveLength(2);

		expect(adapter.getForceReturnCount("gate-budget-session")).toBe(1);
	});

	test("getForceReturnCount returns count for unknown session id (zero)", () => {
		const { adapter } = makeFakeServer();
		expect(adapter.getForceReturnCount("never-started")).toBe(0);
	});
});
