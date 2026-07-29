/**
 * AU21 Increment 7, Wave A (Decision E) — RED phase.
 *
 * `ws-client.ts`'s `messageMatchesTopic` currently matches "conversations"/
 * "work" messages unconditionally (any message received on the socket goes to
 * every global-topic subscriber) and "thread:<id>" messages by inspecting the
 * full domain event's `threadId` field. Once the server collapses these
 * routes onto a minimal invalidation envelope (`{ type: "invalidate", topic,
 * kind, id? }` — see `ws-broadcaster.invalidation-signal.test.ts` +
 * `ws-broadcaster.thread-topic.test.ts`), the client must match by the
 * envelope's own `topic` field instead — a message for "thread:thr-2" must
 * never reach a "thread:thr-1" subscriber's handler.
 *
 * WS transport is unavailable in JSDOM (@lore Q1) — this test stubs
 * `global.WebSocket` with a minimal fake that lets us drive `onopen`/
 * `onmessage` directly, which is the standard "stub the browser API, not the
 * unit under test" pattern (WsClient itself is real, un-mocked).
 *
 * Red until `messageMatchesTopic` is updated to match on the invalidation
 * envelope's `topic` field for conversations/work/thread topics.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetchMock } = vi.hoisted(() => ({
	apiFetchMock: vi.fn(),
}));

vi.mock("../api-fetch.js", () => ({
	apiFetch: apiFetchMock,
}));

// @lore AU21 Increment 7: test-setup.ts globally mocks "./services/ws-client.js"
// as a no-op for every web unit test (WS is unavailable in JSDOM — see its
// top comment). THIS file is the one place that must exercise the REAL
// WsClient implementation, so we explicitly unmock it here, then stub the
// browser WebSocket global instead (the standard "stub the platform API, not
// the unit under test" pattern).
vi.unmock("../ws-client.js");

class MockWebSocket {
	static instances: MockWebSocket[] = [];
	onopen: (() => void) | null = null;
	onmessage: ((evt: { data: unknown }) => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;
	sent: string[] = [];

	constructor(public url: string) {
		MockWebSocket.instances.push(this);
	}

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
		this.onclose?.();
	}
}

async function connectAndOpen(): Promise<MockWebSocket> {
	await vi.waitFor(() => {
		expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(1);
	});
	const socket = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
	socket.onopen?.();
	return socket;
}

describe("ws-client — invalidation envelope topic matching", () => {
	beforeEach(() => {
		vi.resetModules();
		MockWebSocket.instances = [];
		apiFetchMock.mockReset();
		apiFetchMock.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ token: "tok-1" }),
		});
		vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("dispatches an invalidate envelope only to subscribers of its own `topic` field (conversations)", async () => {
		const { getWsClient } = await import("../ws-client.js");
		const convHandler = vi.fn();
		const workHandler = vi.fn();
		const client = getWsClient();
		client.subscribe("conversations", convHandler);
		client.subscribe("work", workHandler);

		const socket = await connectAndOpen();

		socket.onmessage?.({
			data: JSON.stringify({ type: "invalidate", topic: "conversations", kind: "thread_created" }),
		});

		expect(convHandler).toHaveBeenCalledTimes(1);
		expect(workHandler).not.toHaveBeenCalled();
	});

	it("dispatches an invalidate envelope only to the matching thread:<id> subscriber, never a sibling thread", async () => {
		const { getWsClient } = await import("../ws-client.js");
		const client = getWsClient();
		const thread1Handler = vi.fn();
		const thread2Handler = vi.fn();
		client.subscribe("thread:thr-1", thread1Handler);
		client.subscribe("thread:thr-2", thread2Handler);

		const socket = await connectAndOpen();

		socket.onmessage?.({
			data: JSON.stringify({
				type: "invalidate",
				topic: "thread:thr-1",
				kind: "thread_message_appended",
				id: "thr-1",
			}),
		});

		expect(thread1Handler).toHaveBeenCalledTimes(1);
		expect(thread2Handler).not.toHaveBeenCalled();
	});

	it("passes the parsed invalidate envelope object to the handler", async () => {
		const { getWsClient } = await import("../ws-client.js");
		const client = getWsClient();
		const handler = vi.fn();
		client.subscribe("conversations", handler);

		const socket = await connectAndOpen();

		socket.onmessage?.({
			data: JSON.stringify({ type: "invalidate", topic: "conversations", kind: "item_created" }),
		});

		expect(handler).toHaveBeenCalledWith({
			type: "invalidate",
			topic: "conversations",
			kind: "item_created",
		});
	});
});
