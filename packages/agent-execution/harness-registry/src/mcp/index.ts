/**
 * Dep-isolated barrel for the MCP transport layer — `@hyperidle/harness-registry/mcp`.
 *
 * DB-free: deps = @hyperidle/shared + @modelcontextprotocol/sdk + hono (runtime).
 * These runtime deps are intentionally EXCLUDED from the core `"."` entrypoint
 * so the remote-worker build (which only imports `@hyperidle/harness-registry`)
 * stays zero-DB and Hono/MCP-SDK-free (Mechanism B zero-DB seam).
 *
 * Callers: composition root (packages/core-api/src) only — never an
 * agent-execution Service importing another Service (Mechanism C).
 *
 * @lore AU20 B3b: mcp-provider package folded into harness-registry behind this
 * dep-isolated `./mcp` subpath export. The core `"."` entrypoint remains
 * @hyperidle/shared-only; the MCP transport surface lives here, accessed only
 * by the server-side composition root that already wires Hono routes.
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
