/**
 * Barrel for @hyperidle/mcp-provider (agent-execution Layer Service).
 *
 * DB-free: deps = @hyperidle/shared + MCP runtime only, never @hyperidle/db
 * (Mechanism B). Bridges skill-tool invocations over the Model Context
 * Protocol for CLI-spawned harnesses (claude/codex/opencode).
 *
 * @lore AU19 Increment 4: migrated from `packages/server/src/mcp/*` +
 * `packages/server/src/services/mcp-route.ts` (§4 roster: "mcp-provider |
 * mcp/* (2), services/mcp-route.ts").
 */

// -- MCP bridge (per-session McpServer + transport) --
export {
	type CreateMcpBridgeOptions,
	createMcpBridge,
	type McpBridgeInstance,
	toolResultToCallToolResult,
} from "./mcp-bridge.js";
// -- MCP bridge registry (routing table keyed by session token) --
export {
	createMcpBridgeRegistry,
	type McpBridgeRegistry,
} from "./mcp-bridge-registry.js";
// -- MCP route (Hono sub-router: JSON-RPC bridge + AL6 return-status adjudication) --
export { createMcpRoute } from "./mcp-route.js";
