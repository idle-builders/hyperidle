/**
 * Server lifecycle: migrate → start → health-check.
 */

// @lore PGlite migration: createServer is now async (awaits PGlite WASM init).
import { createServer as _createServer, type ServerHandle } from "@hyperidle/server/server-factory";

export type { ServerHandle };

/**
 * Start the Hono server on port 0 (OS-assigned) and return a handle.
 * Environment variables DATABASE_URL, HYPERIDLE_API_KEY, and
 * HYPERIDLE_STATIC_DIR must be set before calling this.
 */
export async function startServer(): Promise<ServerHandle> {
	return _createServer(0);
}

/**
 * Extract the OS-assigned port from a listening server handle.
 */
export function getPort(handle: ServerHandle): number {
	const addr = handle.httpServer.address();
	if (typeof addr === "object" && addr !== null) {
		return addr.port;
	}
	throw new Error("Server not listening on a port");
}

/**
 * Poll GET /api/health until a 200 response is received or the timeout elapses.
 * Throws if the health check does not succeed within timeoutMs.
 */
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
		// Only sleep if we still have budget
		if (Date.now() + 100 < deadline) {
			await new Promise<void>((resolve) => setTimeout(resolve, 100));
		} else {
			break;
		}
	}

	throw new Error(`Health check failed: server at ${url} did not respond within ${timeoutMs}ms`);
}
