/**
 * Server lifecycle: migrate → start → health-check.
 */

// @lore N4: ServerHandle is the shape returned by @hyperidle/server/server-factory.
// The subpath export doesn't exist yet; we use a local interface that matches.
export interface ServerHandle {
	readonly httpServer: {
		address(): { port: number } | string | null;
		close(cb?: (err?: Error) => void): void;
	};
	readonly dispose: () => void;
}

// @lore N4: Import @hyperidle/server/server-factory as a static ESM import so
// vi.mock() in tests can intercept it. A dynamic require() bypasses Vitest's
// mock hoisting and the real module (which imports better-sqlite3) would run
// during tests, causing 'better-sqlite3 is not yet supported in Bun' errors.
import { createServer as _createServer } from "@hyperidle/server/server-factory";

/**
 * Start the Hono server on port 0 (OS-assigned) and return a handle.
 * Environment variables DATABASE_URL, HYPERIDLE_API_KEY, and
 * HYPERIDLE_STATIC_DIR must be set before calling this.
 */
export function startServer(): ServerHandle {
	return _createServer(0) as unknown as ServerHandle;
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
