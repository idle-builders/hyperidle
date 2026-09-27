/**
 * startServer() calls createServer(0, deps) with topology:"local" and the loopback hostname —
 * desktop's own composition root, never importing another application. getPort() extracts the
 * OS-assigned port from a listening handle; waitForHealth() resolves on 200 and times out otherwise.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { getPort, startServer, waitForHealth } from "../src/boot-server.js";

// ---------------------------------------------------------------------------
// Mock ./create-server.js — desktop's own composition root
// ---------------------------------------------------------------------------
vi.mock("../src/create-server.js", () => ({
	createServer: vi.fn(async (port: number) => ({
		httpServer: {
			address: () => ({ port: port === 0 ? 51234 : port }),
			close: vi.fn(),
		},
		dispose: vi.fn(),
	})),
}));

describe("startServer", () => {
	it("calls createServer with port 0 and topology:local", async () => {
		const { createServer } = await import("../src/create-server.js");
		await startServer();
		expect(createServer).toHaveBeenCalledWith(0, expect.objectContaining({ topology: "local" }));
	});

	// S-9.2: the embedded server must not be reachable from the local network.
	// `createServer` binds every interface unless a hostname is supplied, so the
	// guarantee is only real if the desktop Application asks for loopback. That
	// the parameter is honoured at the socket is proven separately, against a
	// real bind, in
	// `applications/remote-server/src/__tests__/server-bind-address.integration.test.ts`.
	it("pins the embedded server to loopback", async () => {
		const { createServer } = await import("../src/create-server.js");
		await startServer();
		expect(createServer).toHaveBeenCalledWith(
			0,
			expect.objectContaining({ hostname: "127.0.0.1" }),
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
