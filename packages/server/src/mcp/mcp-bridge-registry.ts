import type { McpBridgeInstance } from "./mcp-bridge.js";

/**
 * In-memory registry of active MCP bridge instances, keyed by session token.
 *
 * The registry is the routing table for the `ALL /api/mcp/:token` route.
 * Token lookup is O(1). Unknown tokens return 401.
 *
 * @lore X2 D5: The registry is a server-scoped singleton created in
 * server-factory.ts and passed through AppOptions + ProvisionSessionDeps.
 * It is NOT stored in Hono context (that would couple it to the request
 * lifecycle; the session provisioner runs outside HTTP request handlers).
 */
export interface McpBridgeRegistry {
	/** Register a new bridge. */
	readonly register: (instance: McpBridgeInstance) => void;
	/** Look up a bridge by token. Returns undefined if not found or expired. */
	readonly lookup: (token: string) => McpBridgeInstance | undefined;
	/** Unregister and close a bridge. No-op if not found. */
	readonly unregister: (token: string) => Promise<void>;
	/** Handle an incoming HTTP request by looking up the token and delegating. */
	readonly handleRequest: (token: string, request: Request) => Promise<Response>;
	/** Number of active bridges. For observability. */
	readonly size: number;
}

/**
 * Create a fresh in-memory MCP bridge registry.
 *
 * @lore X2: Both endSession and crashSession paths must call unregister().
 * The crash-path cleanup requirement comes from the architecture critique.
 * Missing cleanup on crash leaves orphaned in-memory entries that can't
 * be GC'd (the Map holds strong references) and orphaned tokens that
 * return 401 but waste memory until process restart.
 */
export function createMcpBridgeRegistry(): McpBridgeRegistry {
	const bridges = new Map<string, McpBridgeInstance>();

	function register(instance: McpBridgeInstance): void {
		bridges.set(instance.token, instance);
	}

	function lookup(token: string): McpBridgeInstance | undefined {
		return bridges.get(token);
	}

	async function unregister(token: string): Promise<void> {
		const instance = bridges.get(token);
		if (!instance) {
			// No-op for unknown tokens.
			return;
		}
		bridges.delete(token);
		// @lore X2: We call only mcpServer.close(), NOT transport.close() separately.
		// McpServer.close() → Server.close() → transport.close() — the transport is
		// closed transitively via the protocol layer. Calling transport.close() twice
		// (once explicitly, once transitively) would cause unintended double-close.
		//
		// @lore X2 W1: close() is wrapped in try-catch so that a transport error
		// during teardown cannot propagate through session-provisioning.ts and block
		// Phase 11. If close() throws, the bridge is already removed from the Map —
		// the orphaned subprocess will be GC'd on process restart. Swallowing is
		// intentional: teardown must always complete regardless of close failures.
		try {
			await instance.mcpServer.close();
		} catch {
			// Swallow: bridge already removed from registry. Teardown must complete.
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.warn(`[mcp-bridge-registry] mcpServer.close() failed for token ${token}`);
		}
	}

	async function handleRequest(token: string, request: Request): Promise<Response> {
		const instance = bridges.get(token);
		if (!instance) {
			return new Response("Unauthorized", { status: 401 });
		}
		return instance.transport.handleRequest(request);
	}

	return {
		register,
		lookup,
		unregister,
		handleRequest,
		get size(): number {
			return bridges.size;
		},
	};
}
