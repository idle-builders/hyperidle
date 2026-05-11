/**
 * Server lifecycle: migrate → start → health-check.
 *
 * N4 stub — implementation pending.
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

/**
 * Start the Hono server on port 0 (OS-assigned) and return a handle.
 * Environment variables DATABASE_URL, HYPERIDLE_API_KEY, and
 * HYPERIDLE_STATIC_DIR must be set before calling this.
 */
export function startServer(): ServerHandle {
	throw new Error("not implemented");
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
export function waitForHealth(_port: number, _timeoutMs?: number): Promise<void> {
	return Promise.reject(new Error("not implemented"));
}
