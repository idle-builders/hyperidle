/**
 * Server lifecycle: migrate → start → health-check.
 */

// @lore PGlite migration: createServer is now async (awaits PGlite WASM init).
//
// @lore AU31 §5.3: `desktop` boots its OWN composition root now
// (`./create-server.js`) — no `application → application` import of
// `@hyperidle/remote-server`. `topology: "local"` replaces the concrete
// `LocalSandboxAdapter` + `createLocalAdapterPool()` this file used to
// construct itself; `bootAgentExecution` (inside `create-server.ts`) owns
// that construction now. See `./create-server.ts`'s own top `@lore` for why
// the two Applications' composition roots are duplicated, not shared.
import { createServer as _createServer, type ServerHandle } from "./create-server.js";

export type { ServerHandle };

/**
 * The embedded server serves only the Electron renderer in this same process,
 * so it binds loopback and nothing else.
 *
 * @lore The desktop app binds to loopback only — no public-internet exposure.
 * This was a false claim until this parameter was passed: `createServer` binds
 * every interface when given no hostname, so the embedded server was reachable
 * from the local network by any machine that could guess the OS-assigned port.
 * `remote-server` still omits `hostname` on purpose — a hosted deployment has
 * to answer its ingress.
 */
const LOOPBACK = "127.0.0.1";

/**
 * Start the Hono server on port 0 (OS-assigned), bound to loopback, and return
 * its async-disposal handle. Environment variables DATABASE_URL,
 * HYPERIDLE_API_KEY, and HYPERIDLE_STATIC_DIR must be set before calling this.
 */
export function startServer(): Promise<ServerHandle> {
	return _createServer(0, {
		topology: "local",
		hostname: LOOPBACK,
	});
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
