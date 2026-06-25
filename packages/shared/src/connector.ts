/**
 * AN2 — Outbound connector types.
 *
 * These types define how HyperIdle connects OUT to an external MCP server.
 * Used by the broker (AN2) and the manifest/registry (AN4).
 */

/** How HyperIdle reaches an external MCP server. CLOSED set. */
export const CONNECTOR_TRANSPORTS = ["http", "stdio"] as const;
export type ConnectorTransport = (typeof CONNECTOR_TRANSPORTS)[number];

/**
 * The config HyperIdle needs to connect OUT to one external service's MCP server.
 * AN2 resolves this from a minimal config seam keyed by Connection.service.
 * AN4 replaces the seam with the manifest/registry; this type stays.
 */
export interface ConnectorSpec {
	readonly service: string; // matches serviceConnections.service
	readonly transport: ConnectorTransport;
	readonly url?: string; // http transport (the mcp-oauth serverUrl)
	readonly command?: string; // stdio transport
	readonly args?: readonly string[]; // stdio transport
	/** How the resolved credential is attached at execution. */
	readonly auth: "bearer-header" | "env" | "none";
	readonly envVar?: string; // for auth:"env" + stdio
}

/** One tool as enumerated from an external MCP server (SDK tools/list shape). */
export interface ConnectorToolDescriptor {
	readonly name: string;
	readonly description?: string;
	readonly inputSchema: Record<string, unknown>; // JSON Schema
	// Deliberate PROJECTION of the SDK's ToolAnnotations (which also carries
	// readOnlyHint/openWorldHint/title) — AN2 only needs these two for classification.
	readonly annotations?: { destructiveHint?: boolean; idempotentHint?: boolean };
}

/**
 * Namespaced tool-name prefix so external tools never shadow internal ones.
 * @lore AN2: The double-underscore separator makes the service name and tool name
 * visually distinct and avoids collisions with any internal tool naming convention.
 */
export const CONNECTOR_TOOL_PREFIX = "conn__"; // conn__<service>__<toolName>
