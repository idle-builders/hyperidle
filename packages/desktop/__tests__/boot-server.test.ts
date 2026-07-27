/**
 * N4 — boot-server tests
 *
 * AC coverage:
 *  - startServer() calls createServer(0, deps) from @hyperidle/core-api/server-factory,
 *    injecting a concrete LocalSandboxAdapter/AdapterPool (AU19 Increment 5 item 2)
 *  - getPort() extracts the OS-assigned port from a listening handle
 *  - waitForHealth() resolves when /api/health returns 200
 *  - waitForHealth() throws after 30s timeout (mocked to fast timeout)
 *  - waitForHealth() throws immediately on explicit small timeout
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { getPort, startServer, waitForHealth } from "../src/boot-server.js";

// ---------------------------------------------------------------------------
// Mock @hyperidle/core-api/server-factory + @hyperidle/harness-registry
// ---------------------------------------------------------------------------
vi.mock("@hyperidle/core-api/server-factory", () => ({
	createServer: vi.fn(async (port: number) => ({
		httpServer: {
			address: () => ({ port: port === 0 ? 51234 : port }),
			close: vi.fn(),
		},
		dispose: vi.fn(),
	})),
}));

vi.mock("@hyperidle/harness-registry", () => ({
	createLocalAdapterPool: vi.fn(async () => ({ pool: "fake-adapter-pool" })),
	createSandboxAdapter: vi.fn(() => ({ workspaceAdapter: "fake" })),
}));

describe("startServer", () => {
	it("calls createServer with port 0 and an injected adapterPool/workspaceAdapter", async () => {
		const { createServer } = await import("@hyperidle/core-api/server-factory");
		await startServer();
		expect(createServer).toHaveBeenCalledWith(
			0,
			expect.objectContaining({
				adapterPool: expect.anything(),
				workspaceAdapter: expect.anything(),
			}),
		);
	});

	it("returns a ServerHandle with httpServer and dispose", async () => {
		const handle = await startServer();
		expect(handle).toHaveProperty("httpServer");
		expect(handle).toHaveProperty("dispose");
		expect(typeof handle.dispose).toBe("function");
	});
});

describe("getPort", () => {
	it("extracts the port number from a handle with address() returning an object", () => {
		const handle = {
			httpServer: {
				address: () => ({ port: 54321 }),
				close: vi.fn(),
			},
			dispose: vi.fn(),
		};
		expect(getPort(handle)).toBe(54321);
	});

	it("throws if address() returns a string (unix socket)", () => {
		const handle = {
			httpServer: {
				address: () => "/tmp/server.sock",
				close: vi.fn(),
			},
			dispose: vi.fn(),
		};
		expect(() => getPort(handle)).toThrow("Server not listening on a port");
	});

	it("throws if address() returns null (not yet listening)", () => {
		const handle = {
			httpServer: {
				address: () => null,
				close: vi.fn(),
			},
			dispose: vi.fn(),
		};
		expect(() => getPort(handle)).toThrow("Server not listening on a port");
	});
});

describe("waitForHealth", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("resolves when /api/health returns 200", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

		await expect(waitForHealth(3001, 5000)).resolves.toBeUndefined();
	});

	it("polls the correct URL: http://127.0.0.1:{port}/api/health", async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
		vi.stubGlobal("fetch", fetchMock);

		await waitForHealth(9999, 5000);

		expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:9999/api/health");
	});

	it("retries when fetch throws (server not ready yet)", async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("ECONNREFUSED"))
			.mockRejectedValueOnce(new Error("ECONNREFUSED"))
			.mockResolvedValue({ ok: true, status: 200 });
		vi.stubGlobal("fetch", fetchMock);

		await expect(waitForHealth(3001, 5000)).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("retries when fetch returns non-200 response", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: false, status: 503 })
			.mockResolvedValue({ ok: true, status: 200 });
		vi.stubGlobal("fetch", fetchMock);

		await expect(waitForHealth(3001, 5000)).resolves.toBeUndefined();
	});

	it("rejects after timeout elapses without a 200 response", async () => {
		// Use a very short timeout (10ms) so the test is fast
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

		await expect(waitForHealth(3001, 10)).rejects.toThrow(/health check failed/i);
	});
});
