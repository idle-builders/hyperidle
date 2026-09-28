import {
	MAX_FORCE_RETURNS,
	mcpNamespacedToolName,
	shouldForceReturn,
} from "@hyperidle/harness-protocol";
import { Hono } from "hono";
import type { EnforcementRegistry } from "../enforcement-registry.js";

interface McpSessionRegistry {
	lookup(token: string): { readonly sessionId: string } | undefined;
	handleRequest(token: string, request: Request): Promise<Response>;
}

/**
 * Create the Hono sub-router for MCP bridge requests.
 *
 * Routes (all mounted on /api):
 *   ALL  /mcp/:token              — MCP JSON-RPC bridge (existing)
 *   POST /mcp/:token/return-status — plain-HTTP hook adjudication endpoint
 *
 * The /return-status route is the real adjudicator for file-provisioned hooks
 * (settings-claude and settings-codex channels). The hook scripts POST to this
 * endpoint using the session bridge token as Bearer auth. The endpoint resolves
 * token → sessionId (via bridgeRegistry.lookup) → enforcement registry entry →
 * { returned, exempt, forceCount, budgetLeft, forceMessage }.
 *
 * Protocol (matches buildReturnCheckScript / buildCodexReturnCheckScript):
 *   Request:  POST /api/mcp/:token/return-status  Body: {} (ignored)
 *             Authorization: Bearer <token>
 *   Response: 200  Body empty          → hook allows stop (exit 0 / decision:approve)
 *             200  Body = forceMessage → hook blocks stop (exit 2+stderr / decision:block)
 *             401                      → token not found (no active session)
 *
 * @lore: mcp-route — both routes MUST be mounted BEFORE auth middleware; MCP clients and hook scripts auth via token in URL path, not X-API-Key
 * @lore: return-status route — hook scripts POST to ${mcpUrl}/return-status; must be registered BEFORE the catch-all route so Hono matches the specific path first
 */
export function createMcpRouter(
	bridgeRegistry: McpSessionRegistry,
	enforcementRegistry?: EnforcementRegistry,
): Hono {
	const router = new Hono();

	// @lore: enforcementRegistry optional — absent returns 501 (non-empty body → hook falls back to allow-stop); production wiring MUST pass the registry
	router.post("/mcp/:token/return-status", (c) => {
		const token = c.req.param("token");

		const authHeader = c.req.header("Authorization") ?? "";
		if (authHeader !== `Bearer ${token}`) {
			return c.text("Unauthorized", 401);
		}

		const bridge = bridgeRegistry.lookup(token);
		if (!bridge) {
			return c.text("Unauthorized", 401);
		}

		if (!enforcementRegistry) {
			// Registry not wired — should not happen in production.
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.warn("[return-status] enforcement resource not configured");
			return c.text("Not Implemented", 501);
		}

		const { sessionId } = bridge;
		const entry = enforcementRegistry.get(sessionId);

		if (!entry) {
			return c.text("", 200);
		}

		// Pre-increment state: how many times forced before THIS call.
		const preForceCount = entry.forceCount;
		// Both settings-claude and settings-codex channels present tools namespaced as mcp__hyperidle__<bare>.
		const forceMessage = entry.exempt
			? null
			: shouldForceReturn(
					entry.gate,
					preForceCount,
					entry.requiredReturnActions,
					mcpNamespacedToolName,
				);

		if (forceMessage !== null) {
			// Increment AFTER reading (mirrors returnStatusTool.handler semantics).
			enforcementRegistry.incrementForce(sessionId);
			return c.text(forceMessage, 200);
		}

		const budgetLeft = Math.max(0, MAX_FORCE_RETURNS - preForceCount);
		return new Response("", {
			status: 200,
			headers: {
				"X-Return-Budget-Left": String(budgetLeft),
				"X-Return-Seen": String(entry.gate.returned),
			},
		});
	});

	router.all("/mcp/:token", async (c) => {
		const token = c.req.param("token");
		const response = await bridgeRegistry.handleRequest(token, c.req.raw);
		return response;
	});

	return router;
}

export type { McpSessionRegistry };
