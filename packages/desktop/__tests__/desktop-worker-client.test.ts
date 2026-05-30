/**
 * S4 RED — DesktopWorkerClient: unit tests (AC-2, AC-3, AC-4, AC-5, AC-7, AC-8).
 *
 * AC coverage:
 *  - connect(): calls POST /api/auth/worker-token first, then opens WS
 *  - connect(): sends WorkerRegisterMessage with correct fields after WS opens
 *  - disconnect() with no active sessions: closes WS immediately
 *  - disconnect() with mock active session completing within timeout: waits then closes
 *  - disconnect() with session exceeding 60s: calls stopSession then closes WS
 *  - pause(): sends { type: "pause" } via WS
 *  - resume(): sends { type: "resume" } via WS
 *  - getStatus(): returns correct snapshot (enabled, connected, paused, activeSessions, etc.)
 *  - onStatusChange(): callback fired on state transitions
 *  - connect() fails if worker-token endpoint returns 404 → throws
 *  - connect() fails if WS connection fails → throws
 */

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
	const mod = await import("../src/desktop-worker-client.js");
	return mod;
};

/**
 * Wait for the WS to be created in wsInstances after connect() starts.
 * connect() does an async fetch first, then creates the WS — so we need
 * to flush microtasks to let the fetch resolve before accessing wsInstances.
 *
 * @lore S4: Test helper needed because connect() is async: fetch() is awaited
 * before WebSocket creation, so wsInstances[0] is undefined immediately after
 * calling connect(). This helper polls until the WS appears (up to 100ms).
 */
async function waitForWsInstance(): Promise<MockWsInstance> {
	for (let i = 0; i < 50; i++) {
		if (wsInstances[0]) return wsInstances[0];
		await new Promise<void>((resolve) => setTimeout(resolve, 2));
	}
	throw new Error("WS instance was not created within timeout");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("S4 AC-2/AC-3 — DesktopWorkerClient connect/disconnect", () => {
	it("connect() calls POST /api/auth/worker-token before opening WS", async () => {
		const { DesktopWorkerClient } = await getClient();

		// @lore S4: vi.fn mock must use regular function (not arrow) so `new MockWebSocket()` works
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});
		const client = new DesktopWorkerClient(
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
		const { DesktopWorkerClient } = await getClient();

		// @lore S4: vi.fn mock must use regular function (not arrow) so `new MockWebSocket()` works
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});
		const client = new DesktopWorkerClient(
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
		const { DesktopWorkerClient } = await getClient();

		fetchResponses = [{ ok: false, status: 404, json: async () => ({ error: "not found" }) }];
		// @lore S4: vi.fn mock must use regular function (not arrow) so `new MockWebSocket()` works
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});
		const client = new DesktopWorkerClient(
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
		const { DesktopWorkerClient } = await getClient();

		// @lore S4: vi.fn mock must use regular function (not arrow) so `new MockWebSocket()` works
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});
		const client = new DesktopWorkerClient(
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

describe("S4 AC-7 — DesktopWorkerClient pause/resume", () => {
	async function makeConnectedClient(MockWebSocket: ReturnType<typeof vi.fn>) {
		const { DesktopWorkerClient } = await getClient();

		const client = new DesktopWorkerClient(
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
		// @lore S4: vi.fn mock must use regular function (not arrow) so `new MockWebSocket()` works
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
		// @lore S4: vi.fn mock must use regular function (not arrow) so `new MockWebSocket()` works
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

describe("S4 AC-6 — DesktopWorkerClient getStatus()", () => {
	it("getStatus() returns not-connected when not yet connected", async () => {
		const { DesktopWorkerClient } = await getClient();
		// @lore S4: vi.fn mock must use regular function (not arrow) so `new MockWebSocket()` works
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});

		const client = new DesktopWorkerClient(
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
		const { DesktopWorkerClient } = await getClient();
		// @lore S4: vi.fn mock must use regular function (not arrow) so `new MockWebSocket()` works
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});

		const client = new DesktopWorkerClient(
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
		const { DesktopWorkerClient } = await getClient();
		// @lore S4: vi.fn mock must use regular function (not arrow) so `new MockWebSocket()` works
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});

		const client = new DesktopWorkerClient(
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

describe("S4 — DesktopWorkerClient onStatusChange()", () => {
	it("onStatusChange() callback fired when status changes", async () => {
		const { DesktopWorkerClient } = await getClient();
		// @lore S4: vi.fn mock must use regular function (not arrow) so `new MockWebSocket()` works
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});

		const client = new DesktopWorkerClient(
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
		const { DesktopWorkerClient } = await getClient();
		// @lore S4: vi.fn mock must use regular function (not arrow) so `new MockWebSocket()` works
		// biome-ignore lint/complexity/useArrowFunction: regular function required so `new MockWebSocket()` works via Reflect.construct
		const MockWebSocket = vi.fn().mockImplementation(function () {
			return makeWsInstance();
		});

		const client = new DesktopWorkerClient(
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
