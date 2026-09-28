/**
 * S4 RED — RemoteWorkerClient: unit tests (AC-2, AC-3, AC-4, AC-5, AC-7, AC-8).
 *
 * AC coverage:
 *  - connect(): calls POST /api/auth/worker-token first, then opens WS
 *  - connect(): sends WorkerRegisterMessage with correct fields after WS opens
 *  - disconnect() with no active sessions: closes WS immediately
 *  - disconnect() with mock active session completing within timeout: waits then closes
 *  - disconnect() with session exceeding 60s: calls stopSession then closes WS
 *  - dispatch: activeSessions incremented, events forwarded, session_result sent
 *  - pause(): sends { type: "pause" } via WS
 *  - resume(): sends { type: "resume" } via WS
 *  - getStatus(): returns correct snapshot (enabled, connected, paused, activeSessions, etc.)
 *  - onStatusChange(): callback fired on state transitions
 *  - connect() fails if worker-token endpoint returns 404 → throws
 *  - connect() fails if WS connection fails → throws
 */

import type {
	HarnessAdapter,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/harness-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock electron (needed transitively through safe-credential-resolver if imported)
vi.mock("electron", () => ({
	safeStorage: {
		isEncryptionAvailable: vi.fn(() => true),
		encryptString: vi.fn((v: string) => Buffer.from(`ENC:${v}`)),
		decryptString: vi.fn((buf: Buffer) => {
			const str = buf.toString();
			if (str.startsWith("ENC:")) return str.slice(4);
			throw new Error("Decrypt failed");
		}),
	},
}));

// ── Shared mock types ─────────────────────────────────────────────────────────

interface MockWsInstance {
	onopen: (() => void) | null;
	onmessage: ((event: { data: string }) => void) | null;
	onclose: (() => void) | null;
	onerror: ((err: Error) => void) | null;
	sent: string[];
	readyState: number;
	send(data: string): void;
	close(): void;
}

let wsInstances: MockWsInstance[] = [];
let fetchResponses: Array<{ ok: boolean; status: number; json: () => Promise<unknown> }> = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWsInstance(): MockWsInstance {
	const inst: MockWsInstance = {
		onopen: null,
		onmessage: null,
		onclose: null,
		onerror: null,
		sent: [],
		readyState: 0, // CONNECTING
		send(data: string) {
			this.sent.push(data);
		},
		close() {
			this.readyState = 3; // CLOSED
			this.onclose?.();
		},
	};
	wsInstances.push(inst);
	return inst;
}

// Trigger the registered ack to simulate a successful server-side registration
function simulateRegisteredAck(wsInst: MockWsInstance): void {
	wsInst.readyState = 1; // OPEN
	wsInst.onmessage?.({ data: JSON.stringify({ type: "registered" }) });
}

beforeEach(() => {
	wsInstances = [];
	fetchResponses = [];

	// Mock global fetch
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation(async (_url: string) => {
			const resp = fetchResponses.shift();
			if (!resp) {
				return { ok: true, status: 200, json: async () => ({ token: "mock-worker-token" }) };
			}
			return resp;
		}),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

// ── Import under test ─────────────────────────────────────────────────────────

// We dynamically import to allow vi.mock hoisting
const getClient = async () => {
	const mod = await import("../remote-worker-client.js");
	return mod;
};

/**
 * Wait for the WS to be created in wsInstances after connect() starts.
 * connect() does an async fetch first, then creates the WS — so we need
 * to flush microtasks to let the fetch resolve before accessing wsInstances.
 *
 * @lore: connect() order — awaits fetch() before creating WebSocket; poll until wsInstances[0] appears or test races
 */
async function waitForWsInstance(): Promise<MockWsInstance> {
	for (let i = 0; i < 50; i++) {
		if (wsInstances[0]) return wsInstances[0];
		await new Promise<void>((resolve) => setTimeout(resolve, 2));
	}
	throw new Error("WS instance was not created within timeout");
}

// ── Mock HarnessAdapter builder ───────────────────────────────────────────────

interface MockAdapterOptions {
	/** Events to yield from streamEvents (simulated). */
	events?: HarnessEvent[];
	/** Custom stopSession result. */
	stopResult?: SessionResult;
	/** If true, streamEvents never resolves (simulates long-running session). */
	blockForever?: boolean;
}

const DEFAULT_STOP_RESULT: SessionResult = {
	outcome: "completed",
	tokenUsage: { byTier: {} },
};

function makeMockAdapter(opts: MockAdapterOptions = {}): HarnessAdapter & {
	startSession: ReturnType<typeof vi.fn>;
	stopSession: ReturnType<typeof vi.fn>;
} {
	let sessionCounter = 0;
	const stopResult = opts.stopResult ?? DEFAULT_STOP_RESULT;

	const startSession = vi
		.fn()
		.mockImplementation(async (_config: SessionConfig): Promise<SessionHandle> => {
			sessionCounter++;
			return { sessionId: `mock-session-${sessionCounter}` };
		});

	const stopSession = vi.fn().mockResolvedValue(stopResult);

	const streamEvents = vi.fn().mockImplementation(async function* (_handle: SessionHandle) {
		if (opts.blockForever) {
			// Never resolves — simulates a long-running session
			await new Promise<void>(() => {}); // intentionally never resolves
			return;
		}
		const events = opts.events ?? [];
		for (const evt of events) {
			yield evt;
		}
	});

	return {
		startSession,
		stopSession,
		streamEvents,
		getCapabilities: vi.fn().mockReturnValue({
			preCompactionTrigger: true,
			subAgents: true,
			modelProviders: ["anthropic"],
			mcpSupport: false,
		}),
	};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RemoteWorkerClient connect/disconnect", () => {
	it("connect() calls POST /api/auth/worker-token before opening WS", async () => {
		const { RemoteWorkerClient } = await getClient();

		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});
		const client = new RemoteWorkerClient(
			{
				serverUrl: "http://localhost:3001",
				credentialsPath: "/tmp/creds.json",
				authKey: "my-api-key",
				deviceId: "test-device-uuid",
				machineName: "test-machine",
				modelProviders: ["anthropic"],
				maxConcurrent: 2,
			},
			MockWebSocket as unknown as typeof WebSocket,
		);

		const connectPromise = client.connect();

		// Trigger WS open and registered ack
		// waitForWsInstance() needed because connect() awaits fetch() before creating WS
		const wsInst = await waitForWsInstance();
		wsInst.readyState = 1;
		wsInst.onopen?.();
		simulateRegisteredAck(wsInst);

		await connectPromise;

		// fetch should have been called for worker-token
		expect(fetch).toHaveBeenCalledWith(
			"http://localhost:3001/api/auth/worker-token",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({ "X-API-Key": "my-api-key" }),
			}),
		);
	});

	it("connect() sends WorkerRegisterMessage with correct fields after WS opens", async () => {
		const { RemoteWorkerClient } = await getClient();

		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});
		const client = new RemoteWorkerClient(
			{
				serverUrl: "http://localhost:3001",
				credentialsPath: "/tmp/creds.json",
				authKey: "my-api-key",
				deviceId: "my-device-uuid",
				machineName: "my-machine",
				modelProviders: ["anthropic"],
				maxConcurrent: 3,
			},
			MockWebSocket as unknown as typeof WebSocket,
		);

		const connectPromise = client.connect();

		const wsInst = await waitForWsInstance();
		wsInst.readyState = 1;
		wsInst.onopen?.();
		simulateRegisteredAck(wsInst);

		await connectPromise;

		// The register message should have been sent
		const sentMessages = wsInst.sent.map((s) => JSON.parse(s) as unknown);
		const registerMsg = sentMessages.find(
			(
				m,
			): m is {
				type: string;
				id: string;
				name: string;
				modelProviders: string[];
				maxConcurrent: number;
			} => (m as { type: string }).type === "register",
		);

		expect(registerMsg).toBeDefined();
		expect(registerMsg?.type).toBe("register");
		expect(registerMsg?.id).toBe("my-device-uuid");
		expect(registerMsg?.name).toBe("my-machine");
		expect(registerMsg?.modelProviders).toContain("anthropic");
		expect(registerMsg?.maxConcurrent).toBe(3);
	});

	it("connect() rejects if worker-token endpoint returns 404", async () => {
		const { RemoteWorkerClient } = await getClient();

		fetchResponses = [{ ok: false, status: 404, json: async () => ({ error: "not found" }) }];
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});
		const client = new RemoteWorkerClient(
			{
				serverUrl: "http://localhost:3001",
				credentialsPath: "/tmp/creds.json",
				authKey: "my-api-key",
				deviceId: "d1",
				machineName: "m1",
				modelProviders: [],
				maxConcurrent: 1,
			},
			MockWebSocket as unknown as typeof WebSocket,
		);

		await expect(client.connect()).rejects.toThrow();
	});

	it("disconnect() with no active sessions closes WS immediately", async () => {
		const { RemoteWorkerClient } = await getClient();

		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});
		const client = new RemoteWorkerClient(
			{
				serverUrl: "http://localhost:3001",
				credentialsPath: "/tmp/creds.json",
				authKey: "key",
				deviceId: "d1",
				machineName: "m1",
				modelProviders: ["anthropic"],
				maxConcurrent: 1,
			},
			MockWebSocket as unknown as typeof WebSocket,
		);

		const connectPromise = client.connect();
		const wsInst = await waitForWsInstance();
		wsInst.readyState = 1;
		wsInst.onopen?.();
		simulateRegisteredAck(wsInst);
		await connectPromise;

		await client.disconnect();

		expect(wsInst.readyState).toBe(3); // CLOSED
	});
});

describe("RemoteWorkerClient dispatch", () => {
	async function makeConnectedClientWithAdapter(
		MockWebSocket: ReturnType<typeof vi.fn>,
		adapter: HarnessAdapter,
	) {
		const { RemoteWorkerClient } = await getClient();

		const client = new RemoteWorkerClient(
			{
				serverUrl: "http://localhost:3001",
				credentialsPath: "/tmp/creds.json",
				authKey: "key",
				deviceId: "d1",
				machineName: "m1",
				modelProviders: ["anthropic"],
				maxConcurrent: 2,
			},
			MockWebSocket as unknown as typeof WebSocket,
			adapter,
		);

		const connectPromise = client.connect();
		const wsInst = await waitForWsInstance();
		wsInst.readyState = 1;
		wsInst.onopen?.();
		simulateRegisteredAck(wsInst);
		await connectPromise;

		return { client, wsInst };
	}

	it("dispatch message: activeSessions increments during session, decrements after", async () => {
		const statusChanges: { activeSessions: number }[] = [];
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});

		// Adapter that yields one event then completes
		const adapter = makeMockAdapter({ events: [{ type: "completion", text: "done" }] });
		const { client, wsInst } = await makeConnectedClientWithAdapter(MockWebSocket, adapter);

		client.onStatusChange((s) => {
			statusChanges.push({ activeSessions: s.activeSessions });
		});

		// Simulate server dispatching a session
		const dispatchMsg = JSON.stringify({
			type: "dispatch",
			sessionId: "srv-session-1",
			config: {
				sandboxPath: "/tmp/ws",
				composedPrompt: "",
				modelTier: "fast",
				tools: [],
			},
		});

		wsInst.onmessage?.({ data: dispatchMsg });

		// Wait for session to complete (adapter has events, so it will finish quickly)
		await new Promise<void>((resolve) => setTimeout(resolve, 50));

		// Should have seen activeSessions = 1 then back to 0
		const incremented = statusChanges.some((s) => s.activeSessions === 1);
		const decremented = statusChanges.some((s) => s.activeSessions === 0);
		expect(incremented).toBe(true);
		expect(decremented).toBe(true);
	});

	it("dispatch message: events forwarded as WorkerEventMessage", async () => {
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});

		const adapter = makeMockAdapter({
			events: [{ type: "completion", text: "hello" }],
		});
		const { wsInst } = await makeConnectedClientWithAdapter(MockWebSocket, adapter);

		wsInst.onmessage?.({
			data: JSON.stringify({
				type: "dispatch",
				sessionId: "srv-session-2",
				config: {
					sandboxPath: "/tmp/ws",
					composedPrompt: "",
					modelTier: "fast",
					tools: [],
				},
			}),
		});

		// Wait for async dispatch to process
		await new Promise<void>((resolve) => setTimeout(resolve, 50));

		const sentParsed = wsInst.sent.map(
			(s) => JSON.parse(s) as { type: string; sessionId?: string },
		);
		const eventMsgs = sentParsed.filter((m) => m.type === "event");
		expect(eventMsgs.length).toBeGreaterThan(0);
		expect(eventMsgs[0]?.sessionId).toBe("srv-session-2");
	});

	it("dispatch message: session_result sent after session completes", async () => {
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});

		const adapter = makeMockAdapter({ events: [] });
		const { wsInst } = await makeConnectedClientWithAdapter(MockWebSocket, adapter);

		wsInst.onmessage?.({
			data: JSON.stringify({
				type: "dispatch",
				sessionId: "srv-session-3",
				config: {
					sandboxPath: "/tmp/ws",
					composedPrompt: "",
					modelTier: "fast",
					tools: [],
				},
			}),
		});

		await new Promise<void>((resolve) => setTimeout(resolve, 50));

		const sentParsed = wsInst.sent.map(
			(s) => JSON.parse(s) as { type: string; sessionId?: string },
		);
		const resultMsg = sentParsed.find((m) => m.type === "session_result");
		expect(resultMsg).toBeDefined();
		expect(resultMsg?.sessionId).toBe("srv-session-3");
	});
});

describe("RemoteWorkerClient graceful shutdown", () => {
	it("disconnect() waits for active session completing within timeout then closes", async () => {
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});

		// Session that blocks until we manually resolve it
		// of a `let` reassigned inside a synchronously-invoked Promise executor
		// narrows a `null`-initialized variable to `never` at the later read
		// (reproduced in isolation, TS 6.0.3); `undefined` does not trip it.
		let resolveStream: (() => void) | undefined;
		const streamPromise = new Promise<void>((resolve) => {
			resolveStream = resolve;
		});

		const adapter: HarnessAdapter = {
			startSession: vi.fn().mockResolvedValue({ sessionId: "slow-session" }),
			stopSession: vi.fn().mockResolvedValue(DEFAULT_STOP_RESULT),
			getCapabilities: vi.fn().mockReturnValue({
				preCompactionTrigger: false,
				subAgents: false,
				modelProviders: ["anthropic"],
				mcpSupport: false,
			}),
			// biome-ignore lint/correctness/useYield: generator intentionally yields nothing — blocks until stream resolves
			streamEvents: vi.fn().mockImplementation(async function* () {
				await streamPromise; // blocks until resolved
			}),
		};

		const { RemoteWorkerClient } = await getClient();
		const client = new RemoteWorkerClient(
			{
				serverUrl: "http://localhost:3001",
				credentialsPath: "/tmp/creds.json",
				authKey: "key",
				deviceId: "d1",
				machineName: "m1",
				modelProviders: ["anthropic"],
				maxConcurrent: 1,
				disconnectTimeoutMs: 5_000,
			},
			MockWebSocket as unknown as typeof WebSocket,
			adapter,
		);

		const connectPromise = client.connect();
		const wsInst = await waitForWsInstance();
		wsInst.readyState = 1;
		wsInst.onopen?.();
		simulateRegisteredAck(wsInst);
		await connectPromise;

		// Dispatch the session
		wsInst.onmessage?.({
			data: JSON.stringify({
				type: "dispatch",
				sessionId: "slow-session",
				config: {
					sandboxPath: "/tmp/ws",
					composedPrompt: "",
					modelTier: "fast",
					tools: [],
				},
			}),
		});

		// Give dispatch time to start (activeSessions should be 1)
		await new Promise<void>((res) => setTimeout(res, 10));
		expect(client.getStatus().activeSessions).toBe(1);

		// Start disconnect — will poll waiting for session to finish
		const disconnectPromise = client.disconnect();

		// Resolve the stream so the session can complete
		resolveStream?.();

		await disconnectPromise;

		expect(wsInst.readyState).toBe(3); // WS should be closed
	}, 10_000);

	it("disconnect() force-stops sessions that exceed the timeout", async () => {
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});

		const stopSession = vi.fn().mockResolvedValue(DEFAULT_STOP_RESULT);

		const adapter: HarnessAdapter = {
			startSession: vi.fn().mockResolvedValue({ sessionId: "forever-session" }),
			stopSession,
			getCapabilities: vi.fn().mockReturnValue({
				preCompactionTrigger: false,
				subAgents: false,
				modelProviders: ["anthropic"],
				mcpSupport: false,
			}),
			streamEvents: vi.fn().mockImplementation(async function* () {
				// Never yields — blocks indefinitely
				await new Promise<void>(() => {});
			}),
		};

		const { RemoteWorkerClient } = await getClient();
		const client = new RemoteWorkerClient(
			{
				serverUrl: "http://localhost:3001",
				credentialsPath: "/tmp/creds.json",
				authKey: "key",
				deviceId: "d1",
				machineName: "m1",
				modelProviders: ["anthropic"],
				maxConcurrent: 1,
				// Very short timeout so force-stop triggers quickly in tests
				disconnectTimeoutMs: 300,
			},
			MockWebSocket as unknown as typeof WebSocket,
			adapter,
		);

		const connectPromise = client.connect();
		const wsInst = await waitForWsInstance();
		wsInst.readyState = 1;
		wsInst.onopen?.();
		simulateRegisteredAck(wsInst);
		await connectPromise;

		// Dispatch a session that will never complete on its own
		wsInst.onmessage?.({
			data: JSON.stringify({
				type: "dispatch",
				sessionId: "forever-session",
				config: {
					sandboxPath: "/tmp/ws",
					composedPrompt: "",
					modelTier: "fast",
					tools: [],
				},
			}),
		});

		// Give dispatch time to start
		await new Promise<void>((res) => setTimeout(res, 10));
		expect(client.getStatus().activeSessions).toBe(1);

		// disconnect() will poll for 300ms, then force-stop
		await client.disconnect();

		// stopSession should have been called to force-stop the hung session
		expect(stopSession).toHaveBeenCalled();
		expect(wsInst.readyState).toBe(3); // WS should be closed
	}, 5_000);
});

describe("RemoteWorkerClient pause/resume", () => {
	async function makeConnectedClient(MockWebSocket: ReturnType<typeof vi.fn>) {
		const { RemoteWorkerClient } = await getClient();

		const client = new RemoteWorkerClient(
			{
				serverUrl: "http://localhost:3001",
				credentialsPath: "/tmp/creds.json",
				authKey: "key",
				deviceId: "d1",
				machineName: "m1",
				modelProviders: ["anthropic"],
				maxConcurrent: 1,
			},
			MockWebSocket as unknown as typeof WebSocket,
		);

		const connectPromise = client.connect();
		const wsInst = await waitForWsInstance();
		wsInst.readyState = 1;
		wsInst.onopen?.();
		simulateRegisteredAck(wsInst);
		await connectPromise;

		return { client, wsInst };
	}

	it("pause() sends { type: 'pause' } via WS", async () => {
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});
		const { client, wsInst } = await makeConnectedClient(MockWebSocket);

		client.pause();

		const pauseMsg = wsInst?.sent
			.map((s) => JSON.parse(s) as { type: string })
			.find((m) => m.type === "pause");
		expect(pauseMsg).toBeDefined();
		expect(pauseMsg?.type).toBe("pause");
	});

	it("resume() sends { type: 'resume' } via WS", async () => {
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});
		const { client, wsInst } = await makeConnectedClient(MockWebSocket);

		client.pause();
		client.resume();

		const resumeMsg = wsInst?.sent
			.map((s) => JSON.parse(s) as { type: string })
			.find((m) => m.type === "resume");
		expect(resumeMsg).toBeDefined();
		expect(resumeMsg?.type).toBe("resume");
	});
});

describe("RemoteWorkerClient getStatus()", () => {
	it("getStatus() returns not-connected when not yet connected", async () => {
		const { RemoteWorkerClient } = await getClient();
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});

		const client = new RemoteWorkerClient(
			{
				serverUrl: "http://localhost:3001",
				credentialsPath: "/tmp/creds.json",
				authKey: "key",
				deviceId: "d1",
				machineName: "m1",
				modelProviders: ["anthropic"],
				maxConcurrent: 2,
			},
			MockWebSocket as unknown as typeof WebSocket,
		);

		const status = client.getStatus();
		expect(status.enabled).toBe(false);
		expect(status.connected).toBe(false);
		expect(status.paused).toBe(false);
		expect(status.activeSessions).toBe(0);
		expect(status.maxConcurrent).toBe(2);
		expect(status.deviceId).toBe("d1");
	});

	it("getStatus().connected is true after connect()", async () => {
		const { RemoteWorkerClient } = await getClient();
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});

		const client = new RemoteWorkerClient(
			{
				serverUrl: "http://localhost:3001",
				credentialsPath: "/tmp/creds.json",
				authKey: "key",
				deviceId: "d1",
				machineName: "m1",
				modelProviders: ["anthropic"],
				maxConcurrent: 1,
			},
			MockWebSocket as unknown as typeof WebSocket,
		);

		const connectPromise = client.connect();
		const wsInst = await waitForWsInstance();
		wsInst.readyState = 1;
		wsInst.onopen?.();
		simulateRegisteredAck(wsInst);
		await connectPromise;

		expect(client.getStatus().connected).toBe(true);
		expect(client.getStatus().enabled).toBe(true);
	});

	it("getStatus().paused is true after pause(), false after resume()", async () => {
		const { RemoteWorkerClient } = await getClient();
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});

		const client = new RemoteWorkerClient(
			{
				serverUrl: "http://localhost:3001",
				credentialsPath: "/tmp/creds.json",
				authKey: "key",
				deviceId: "d1",
				machineName: "m1",
				modelProviders: ["anthropic"],
				maxConcurrent: 1,
			},
			MockWebSocket as unknown as typeof WebSocket,
		);

		const connectPromise = client.connect();
		const wsInst = await waitForWsInstance();
		wsInst.readyState = 1;
		wsInst.onopen?.();
		simulateRegisteredAck(wsInst);
		await connectPromise;

		client.pause();
		expect(client.getStatus().paused).toBe(true);

		client.resume();
		expect(client.getStatus().paused).toBe(false);
	});
});

describe("RemoteWorkerClient onStatusChange()", () => {
	it("onStatusChange() callback fired when status changes", async () => {
		const { RemoteWorkerClient } = await getClient();
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});

		const client = new RemoteWorkerClient(
			{
				serverUrl: "http://localhost:3001",
				credentialsPath: "/tmp/creds.json",
				authKey: "key",
				deviceId: "d1",
				machineName: "m1",
				modelProviders: ["anthropic"],
				maxConcurrent: 1,
			},
			MockWebSocket as unknown as typeof WebSocket,
		);

		const statusChanges: unknown[] = [];
		const unsubscribe = client.onStatusChange((s) => {
			statusChanges.push(s);
		});

		const connectPromise = client.connect();
		const wsInst = await waitForWsInstance();
		wsInst.readyState = 1;
		wsInst.onopen?.();
		simulateRegisteredAck(wsInst);
		await connectPromise;

		// At least one status change event (connected=true)
		expect(statusChanges.length).toBeGreaterThan(0);

		unsubscribe();
	});

	it("unsubscribe() stops further callbacks", async () => {
		const { RemoteWorkerClient } = await getClient();
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});

		const client = new RemoteWorkerClient(
			{
				serverUrl: "http://localhost:3001",
				credentialsPath: "/tmp/creds.json",
				authKey: "key",
				deviceId: "d1",
				machineName: "m1",
				modelProviders: ["anthropic"],
				maxConcurrent: 1,
			},
			MockWebSocket as unknown as typeof WebSocket,
		);

		const statusChanges: unknown[] = [];
		const unsubscribe = client.onStatusChange((s) => {
			statusChanges.push(s);
		});

		const connectPromise = client.connect();
		const wsInst = await waitForWsInstance();
		wsInst.readyState = 1;
		wsInst.onopen?.();
		simulateRegisteredAck(wsInst);
		await connectPromise;

		const countAfterConnect = statusChanges.length;
		unsubscribe();

		// After unsubscribe, pausing shouldn't fire more callbacks
		client.pause();
		expect(statusChanges.length).toBe(countAfterConnect);
	});
});
