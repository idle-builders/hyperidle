import { Hono } from "hono";
import type { McpBridgeRegistry } from "../mcp/mcp-bridge-registry.js";

/**
 * Create the Hono sub-router for MCP bridge requests.
 *
 * Route: ALL /mcp/:token (mounted on /api, so full path is /api/mcp/:token)
 *
 * The token in the URL is the authentication credential. Unknown tokens
 * receive 401 from the bridge registry. The rate limiter on /api/* provides
 * flood protection without per-request auth overhead.
 *
 * @lore X2 D1: This route MUST be mounted BEFORE the auth middleware so MCP
 * clients can authenticate via the session token without needing an X-API-Key.
 * The token in the URL is the sole authentication mechanism for MCP clients.
 * This mirrors the WebSocket route mounting pattern (registerWebSocket runs
 * before authMiddleware in createApp).
 */
export function createMcpRoute(bridgeRegistry: McpBridgeRegistry): Hono {
	const router = new Hono();

	router.all("/mcp/:token", async (c) => {
		const token = c.req.param("token");
		const response = await bridgeRegistry.handleRequest(token, c.req.raw);
		return response;
	});

	return router;
}
