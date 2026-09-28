import { createServer as _createServer, type ServerHandle } from "./create-server.js";

export type { ServerHandle };

// @lore: desktop server — must bind 127.0.0.1; omitting hostname listens on all interfaces and exposes the desktop API to the network
const LOOPBACK = "127.0.0.1";

export function startServer(): Promise<ServerHandle> {
	return _createServer(0, {
		topology: "local",
		hostname: LOOPBACK,
	});
}

export function getPort(handle: ServerHandle): number {
	const addr = handle.httpServer.address();
	if (typeof addr === "object" && addr !== null) {
		return addr.port;
	}
	throw new Error("Server not listening on a port");
}

export async function waitForHealth(port: number, timeoutMs = 30_000): Promise<void> {
	const url = `http://127.0.0.1:${port}/api/health`;
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				return;
			}
		} catch {
			// Server not ready yet; retry after a short delay.
		}
		if (Date.now() + 100 < deadline) {
			await new Promise<void>((resolve) => setTimeout(resolve, 100));
		} else {
			break;
		}
	}

	throw new Error(`Health check failed: server at ${url} did not respond within ${timeoutMs}ms`);
}
