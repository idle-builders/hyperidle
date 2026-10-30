/**
 * Unit tests for CodexAppServerAdapter — JSON-RPC protocol behavior and deliver.
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
	triggerExit(code: number, signal: string | null): void;
}

/**
 * Builds a fake codex app-server that auto-responds to well-known requests.
 * Responses come in synchronously via PassThrough, so await startSession
 * resolves with no real I/O.
 */
function makeFakeServer(): FakeServerParts {
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
	});

	return {
		adapter,
		stdinLines,
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

	test("streamEvents yields completion text from item/agentMessage/delta notifications", async () => {
		const { adapter, triggerExit } = makeFakeServer();

		const fakeStdout = adapter as unknown as {
			sessions: Map<string, { child: ChildProcess }>;
		} as unknown as never;
		// We can't access sessions directly; drive via the fake server instead.
		// Just test through the full flow: push a delta notification and collect it.
		void fakeStdout; // unused — we drive via startSession + manual stdout write below

		const handle = await adapter.startSession(BASE_CONFIG);

		// Push an agent message delta and then complete the turn via exit
		// Access the internal session's child stdout to push notifications
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
