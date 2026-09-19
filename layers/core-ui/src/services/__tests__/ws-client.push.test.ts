/**
 * AU21 §6 Decision L4 / §9 Increment 14d.
 *
 * `ws-client.ts`'s `messageMatchesTopic` matches a PUSH envelope
 * (`{ type: "update", topic, kind, data }` — see `ws-connection-hub.ts` +
 * `routes/threads.ts`) by its own `topic`
 * field — a message for "thread:thr-2" must never reach a "thread:thr-1"
 * subscriber's handler. This supersedes the old `{ type: "invalidate", … }`
 * ping (founder: "there is no refetch … core submits the changed version").
 *
 * WS transport is unavailable in JSDOM (@lore Q1) — this test stubs
 * `global.WebSocket` with a minimal fake that lets us drive `onopen`/
 * `onmessage` directly, which is the standard "stub the browser API, not the
 * unit under test" pattern (WsClient itself is real, un-mocked).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetchMock } = vi.hoisted(() => ({
	apiFetchMock: vi.fn(),
}));

vi.mock("../api-fetch.js", () => ({
	apiFetch: apiFetchMock,
}));

// @lore AU21: test-setup.ts globally mocks "./services/ws-client.js" as a
// no-op for every web unit test (WS is unavailable in JSDOM — see its top
// comment). THIS file is the one place that must exercise the REAL WsClient
// implementation, so we explicitly unmock it here, then stub the browser
// WebSocket global instead (the standard "stub the platform API, not the
// unit under test" pattern).
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

describe("ws-client — push envelope topic matching", () => {
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

	it("dispatches a push envelope only to subscribers of its own `topic` field (conversations)", async () => {
		const { getWsClient } = await import("../ws-client.js");
		const convHandler = vi.fn();
		const threadHandler = vi.fn();
		const client = getWsClient();
		client.subscribe("conversations", convHandler);
		client.subscribe("thread:thr-9", threadHandler);

		const socket = await connectAndOpen();

		socket.onmessage?.({
			data: JSON.stringify({
				type: "update",
				topic: "conversations",
				kind: "thread_created",
				data: { id: "t1" },
			}),
		});

		expect(convHandler).toHaveBeenCalledTimes(1);
		expect(threadHandler).not.toHaveBeenCalled();
	});

	it("dispatches a push envelope only to the matching thread:<id> subscriber, never a sibling thread", async () => {
		const { getWsClient } = await import("../ws-client.js");
		const client = getWsClient();
		const thread1Handler = vi.fn();
		const thread2Handler = vi.fn();
		client.subscribe("thread:thr-1", thread1Handler);
		client.subscribe("thread:thr-2", thread2Handler);

		const socket = await connectAndOpen();

		socket.onmessage?.({
			data: JSON.stringify({
				type: "update",
				topic: "thread:thr-1",
				kind: "thread_message_appended",
				data: { message: { id: "m-1" } },
			}),
		});

		expect(thread1Handler).toHaveBeenCalledTimes(1);
		expect(thread2Handler).not.toHaveBeenCalled();
	});

	it("passes the parsed push envelope, including its `data` payload, to the handler", async () => {
		const { getWsClient } = await import("../ws-client.js");
		const client = getWsClient();
		const handler = vi.fn();
		client.subscribe("conversations", handler);

		const socket = await connectAndOpen();

		socket.onmessage?.({
			data: JSON.stringify({
				type: "update",
				topic: "conversations",
				kind: "thread_created",
				data: { id: "t1", title: "Hello" },
			}),
		});

		expect(handler).toHaveBeenCalledWith({
			type: "update",
			topic: "conversations",
			kind: "thread_created",
			data: { id: "t1", title: "Hello" },
		});
	});
});

// @lore proven-bug regression: a packaged desktop build (MODE === "production")
// must never dial the hardcoded dev address, even when a machine-local `.env`
// file sets NODE_ENV=development and corrupts `import.meta.env.DEV`/`.PROD` —
// see the `@lore proven-bug fix` comment on ws-client.ts's `connect()`. MODE is
// the one signal Vite cannot mis-set from a `.env` file, so it is the only thing
// this branch may read.
describe("ws-client — production build never dials the dev address", () => {
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
		vi.unstubAllEnvs();
	});

	it("connects to the page's own host, not ws://localhost:3001, when MODE is production", async () => {
		vi.stubEnv("MODE", "production");
		const { getWsClient } = await import("../ws-client.js");
		getWsClient().subscribe("conversations", vi.fn());

		const socket = await connectAndOpen();

		expect(socket.url.startsWith("ws://localhost:3001")).toBe(false);
		expect(socket.url.startsWith("ws://localhost:5173/api/ws?token=")).toBe(true);
	});

	it("still connects to ws://localhost:3001 in dev/test MODE", async () => {
		const { getWsClient } = await import("../ws-client.js");
		getWsClient().subscribe("conversations", vi.fn());

		const socket = await connectAndOpen();

		expect(socket.url.startsWith("ws://localhost:3001/api/ws?token=")).toBe(true);
	});
});
