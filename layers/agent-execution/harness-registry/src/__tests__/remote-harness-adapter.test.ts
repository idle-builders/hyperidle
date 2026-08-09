/**
 * S2 — RemoteHarnessAdapter: unit tests (AC1).
 *
 * Tests that RemoteHarnessAdapter:
 * - implements HarnessAdapter interface
 * - sends ServerDispatchMessage on startSession
 * - yields HarnessEvents from WorkerEventMessages
 * - sends ServerStopMessage on stopSession
 * - returns capabilities from worker registration
 *
 * These fail (red phase) until `remote-harness-adapter.ts` is created.
 */

import type { HarnessAdapter, HarnessEvent, SessionConfig } from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import type { WorkerRegisterMessage } from "../remote-harness-adapter.js";
import { RemoteHarnessAdapter } from "../remote-harness-adapter.js";

// ── Mock WebSocket ─────────────────────────────────────────────────────────

interface MockWsMessage {
	data: string;
}

class MockWebSocket {
	public sent: string[] = [];
	public onmessage: ((evt: MockWsMessage) => void) | null = null;
	public onclose: (() => void) | null = null;
	public onerror: ((err: Error) => void) | null = null;

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
		this.onclose?.();
	}

	/** Helper: simulate receiving a message from the worker. */
	receive(msg: object): void {
		this.onmessage?.({ data: JSON.stringify(msg) });
	}

	/** Get sent message at index, throwing if absent. */
	sentAt(index: number): string {
		const msg = this.sent.at(index);
		if (msg === undefined) throw new Error(`No sent message at index ${index}`);
		return msg;
	}
}

const TEST_CONFIG: SessionConfig = {
	sandboxPath: "/workspace/test",
	sessionId: "test-session",
	systemPromptPath: "/workspace/prompts/builder.md",
	assembledPrompt: "",
	modelTier: "workhorse",
	tools: ["Read", "Write"],
};

const WORKER_REG: WorkerRegisterMessage = {
	type: "register",
	id: "w-remote-1",
	name: "test-worker",
	modelProviders: ["anthropic"],
	maxConcurrent: 2,
};

// ── Interface compliance ─────────────────────────────────────────────────────

describe("RemoteHarnessAdapter interface compliance", () => {
	it("satisfies HarnessAdapter at compile time", () => {
		const ws = new MockWebSocket();
		// If RemoteHarnessAdapter doesn't implement HarnessAdapter, this assignment will fail
		const adapter: HarnessAdapter = new RemoteHarnessAdapter(ws, WORKER_REG);
		expect(adapter).toBeDefined();
	});

	it("getCapabilities returns modelProviders from registration", () => {
		const ws = new MockWebSocket();
		const adapter = new RemoteHarnessAdapter(ws as never, WORKER_REG);
		const caps = adapter.getCapabilities();
		expect(caps.modelProviders).toEqual(["anthropic"]);
		expect(caps.preCompactionTrigger).toBe(false);
		expect(caps.subAgents).toBe(false);
	});
});

// ── startSession ────────────────────────────────────────────────────────────

describe("RemoteHarnessAdapter startSession", () => {
	it("sends a ServerDispatchMessage to the WebSocket", async () => {
		const ws = new MockWebSocket();
		const adapter = new RemoteHarnessAdapter(ws as never, WORKER_REG);

		const startPromise = adapter.startSession(TEST_CONFIG);

		// After calling startSession, a dispatch message should have been sent
		expect(ws.sent).toHaveLength(1);
		const dispatched = JSON.parse(ws.sentAt(0)) as {
			type: string;
			sessionId: string;
			config: { sandboxPath: string };
		};
		expect(dispatched.type).toBe("dispatch");
		expect(dispatched.config.sandboxPath).toBe("/workspace/test");
		expect(dispatched.sessionId).toBeTruthy();

		const handle = await startPromise;
		expect(handle.sessionId).toBeTruthy();
	});
});

// ── streamEvents ────────────────────────────────────────────────────────────

describe("RemoteHarnessAdapter streamEvents", () => {
	it("yields HarnessEvents from WorkerEventMessages", async () => {
		const ws = new MockWebSocket();
		const adapter = new RemoteHarnessAdapter(ws as never, WORKER_REG);

		const handle = await adapter.startSession(TEST_CONFIG);
		const dispatched = JSON.parse(ws.sentAt(0)) as { sessionId: string };
		const sessionId = dispatched.sessionId;

		const eventsPromise = (async (): Promise<HarnessEvent[]> => {
			const collected: HarnessEvent[] = [];
			for await (const event of adapter.streamEvents(handle)) {
				collected.push(event);
			}
			return collected;
		})();

		// Simulate worker streaming events
		ws.receive({
			type: "event",
			sessionId,
			event: { type: "token_usage", inputTokens: 10, outputTokens: 5 },
		});
		ws.receive({ type: "event", sessionId, event: { type: "completion", text: "done" } });
		// Signal end via session_result
		ws.receive({
			type: "session_result",
			sessionId,
			result: {
				outcome: "completed",
				tokenUsage: { byTier: {} },
			},
		});

		const events = await eventsPromise;
		expect(events).toHaveLength(2);
		expect(events[0]?.type).toBe("token_usage");
		expect(events[1]?.type).toBe("completion");
	});

	it("drops events for unknown sessionIds", async () => {
		const ws = new MockWebSocket();
		const adapter = new RemoteHarnessAdapter(ws as never, WORKER_REG);

		const handle = await adapter.startSession(TEST_CONFIG);
		const dispatched = JSON.parse(ws.sentAt(0)) as { sessionId: string };
		const sessionId = dispatched.sessionId;

		const eventsPromise = (async (): Promise<HarnessEvent[]> => {
			const collected: HarnessEvent[] = [];
			for await (const event of adapter.streamEvents(handle)) {
				collected.push(event);
			}
			return collected;
		})();

		// Send event for wrong session — should be ignored
		ws.receive({
			type: "event",
			sessionId: "wrong-session",
			event: { type: "completion", text: "dropped" },
		});
		// Send event for correct session
		ws.receive({ type: "event", sessionId, event: { type: "completion", text: "kept" } });
		// End
		ws.receive({
			type: "session_result",
			sessionId,
			result: {
				outcome: "completed",
				tokenUsage: { byTier: {} },
			},
		});

		const events = await eventsPromise;
		expect(events).toHaveLength(1);
		expect((events[0] as { text: string }).text).toBe("kept");
	});

	it("yields error event and terminates when worker sends error message", async () => {
		const ws = new MockWebSocket();
		const adapter = new RemoteHarnessAdapter(ws as never, WORKER_REG);

		const handle = await adapter.startSession(TEST_CONFIG);
		const dispatched = JSON.parse(ws.sentAt(0)) as { sessionId: string };
		const sessionId = dispatched.sessionId;

		const eventsPromise = (async (): Promise<HarnessEvent[]> => {
			const collected: HarnessEvent[] = [];
			for await (const event of adapter.streamEvents(handle)) {
				collected.push(event);
			}
			return collected;
		})();

		ws.receive({ type: "error", sessionId, message: "worker crashed" });

		const events = await eventsPromise;
		const lastEvent = events.at(-1);
		expect(lastEvent?.type).toBe("error");
	});

	it("terminates stream when WebSocket closes", async () => {
		const ws = new MockWebSocket();
		const adapter = new RemoteHarnessAdapter(ws as never, WORKER_REG);

		const handle = await adapter.startSession(TEST_CONFIG);

		const eventsPromise = (async (): Promise<HarnessEvent[]> => {
			const collected: HarnessEvent[] = [];
			for await (const event of adapter.streamEvents(handle)) {
				collected.push(event);
			}
			return collected;
		})();

		// Close the WebSocket unexpectedly
		ws.close();

		// Should resolve (possibly with an error event)
		const events = await eventsPromise;
		// The stream should have terminated
		expect(Array.isArray(events)).toBe(true);
	});
});

// ── stopSession ────────────────────────────────────────────────────────────

describe("RemoteHarnessAdapter stopSession", () => {
	it("sends a ServerStopMessage to the WebSocket", async () => {
		const ws = new MockWebSocket();
		const adapter = new RemoteHarnessAdapter(ws as never, WORKER_REG);

		const handle = await adapter.startSession(TEST_CONFIG);
		const dispatched = JSON.parse(ws.sentAt(0)) as { sessionId: string };
		const sessionId = dispatched.sessionId;

		const stopPromise = adapter.stopSession(handle);

		// A stop message should be sent immediately
		const lastSent = ws.sentAt(-1);
		const stopMsg = JSON.parse(lastSent) as { type: string; sessionId: string };
		expect(stopMsg.type).toBe("stop");
		expect(stopMsg.sessionId).toBe(sessionId);

		// Simulate worker acknowledging with a session_result
		// @lore AU21 (harness-telemetry narrowing): no cost field on SessionResult anymore.
		ws.receive({
			type: "session_result",
			sessionId,
			result: {
				outcome: "stopped",
				tokenUsage: { byTier: { workhorse: { prompt: 10, completion: 5 } } },
			},
		});

		const result = await stopPromise;
		expect(result.outcome).toBe("stopped");
		expect(result).not.toHaveProperty("cost");
		expect(result.tokenUsage.byTier.workhorse).toMatchObject({ prompt: 10, completion: 5 });
	});
});
