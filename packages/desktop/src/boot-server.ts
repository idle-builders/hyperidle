/**
 * Server lifecycle: migrate → start → health-check.
 */

// @lore PGlite migration: createServer is now async (awaits PGlite WASM init).
//
// @lore AU19 Increment 5 (item 2): `desktop` (the `core-api` + `agent-execution`
// + `agent-orchestration` Application per §3) now constructs and injects its
// own concrete `HarnessPort` adapter — `LocalSandboxAdapter` +
// `createLocalAdapterPool()` (in-process CLI harness discovery) — instead of
// `@hyperidle/core-api`'s `createServer` defaulting it internally via a
// `HYPERIDLE_PROFILE` runtime branch. See `server-factory.ts`'s
// `CreateServerDeps` top `@lore` and `packages/remote-server/src/index.ts`
// (the mirror-image Application, empty pool + `DisabledSandboxAdapter`).
import {
	createServer as _createServer,
	type ServerHandle,
} from "@hyperidle/core-api/server-factory";
import { createLocalAdapterPool, LocalSandboxAdapter } from "@hyperidle/harness-registry";

export type { ServerHandle };

/**
 * Start the Hono server on port 0 (OS-assigned) and return a handle.
 * Environment variables DATABASE_URL, HYPERIDLE_API_KEY, and
 * HYPERIDLE_STATIC_DIR must be set before calling this.
 */
export async function startServer(): Promise<ServerHandle> {
	const adapterPool = await createLocalAdapterPool();
	return _createServer(0, { adapterPool, workspaceAdapter: new LocalSandboxAdapter() });
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
