import * as crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AnySchema as McpAnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type { ToolResult } from "../tools/tool-result.js";

/**
 * The `inputSchema` type the MCP SDK's `registerTool` config accepts. Extracted
 * from the SDK method so we don't hand-roll the `AnySchema` (z3 | z4.$ZodType)
 * union.
 *
 * @lore AF4/§9: the MCP SDK dedupes to zod 3.25.76 while server schemas are zod
 * 4.4.3 — the `zod/v4/core $ZodType` brands are nominally distinct, so a server
 * `z.ZodType` is not directly assignable to the SDK's `AnySchema`. The bridge
 * below (`asMcpInputSchema`) is an internal, behaviour-neutral schema-type
 * bridge (NOT a wire-shape change): the schema still validates identically; only
 * its static brand is reconciled. Version-alignment is out of AF4 scope.
 */
/**
 * Reconcile a server-local zod 4.4.3 schema's brand with the MCP SDK's
 * `AnySchema` (deduped zod 3.25.76). The runtime object is identical; only the
 * static `$ZodType` brand differs (the §9 cross-version seam). The cast is the
 * documented internal schema-type bridge — it is not a wire/request payload cast
 * and does not alter what the schema parses. Returning the SDK's single-schema
 * `AnySchema` arm keeps `registerTool`'s `(args, extra)` callback resolvable
 * (the full `ZodRawShapeCompat | AnySchema` union would collapse `cb` to never).
 */
function asMcpInputSchema(schema: unknown): McpAnySchema {
	return schema as McpAnySchema;
}

/**
 * A live MCP bridge instance for a single agent session.
 *
 * One McpServer + transport per session keyed by a 64-char hex token.
 * The token is the authentication credential — requests with unknown tokens
 * receive 401 from the bridge registry.
 *
 * @lore X2 D3: One McpServer + transport per session (not shared). The session
 * token in the URL replaces MCP's internal session management (stateless mode).
 */
export interface McpBridgeInstance {
	readonly token: string;
	readonly sessionId: string;
	readonly mcpServer: McpServer;
	readonly transport: WebStandardStreamableHTTPServerTransport;
}

export interface CreateMcpBridgeOptions {
	readonly sessionId: string;
	readonly registry: ToolRegistry;
}

/**
 * Map a ToolResult (HyperIdle's discriminated union) to the MCP CallToolResult.
 *
 * @lore X2 D4: Success maps to content text array; failure maps to isError=true.
 * The error body is JSON-stringified so the harness can parse the machine-readable
 * `code` field without string matching.
 */
export function toolResultToCallToolResult(result: ToolResult): CallToolResult {
	if (result.success) {
		return {
			content: [{ type: "text", text: JSON.stringify(result.data) }],
		};
	}

	return {
		content: [
			{
				type: "text",
				text: JSON.stringify({ error: result.error, code: result.code }),
			},
		],
		isError: true,
	};
}

/**
 * Create an McpServer with all tools from the registry registered, and a
 * stateless WebStandardStreamableHTTPServerTransport.
 *
 * @lore X2 D1: The transport runs in stateless mode (no sessionIdGenerator).
 * Our session token in the URL IS the session management — the bridge registry
 * maps tokens to transport instances.
 *
 * @lore X2 D6: We pass the full z.ZodType schema to registerTool. The MCP
 * SDK's AnySchema type accepts z4.$ZodType (our schemas are Zod 4). The SDK's
 * internal zod-compat layer handles both v3 and v4 Zod schemas. No manual
 * JSON Schema conversion is needed here — the Zod schema is the single source
 * of truth.
 *
 * @lore X2 D7: Double validation is intentional. The MCP SDK validates input
 * via Zod before calling the handler. The handler then calls registry.invoke()
 * which re-validates via safeParse. This double validation is the security
 * boundary: registry.invoke() enforces role-based authorization (returning
 * FORBIDDEN for cross-role tool calls). Bypassing it would bypass the security
 * gate. No skill tools use .transform(), so double parsing is idempotent.
 */
export async function createMcpBridge(options: CreateMcpBridgeOptions): Promise<McpBridgeInstance> {
	const { sessionId, registry } = options;

	// D2: 64-char hex token = 256 bits of entropy. Brute-force infeasible.
	const token = crypto.randomBytes(32).toString("hex");

	// D1: stateless mode — no sessionIdGenerator. Our token replaces MCP session management.
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
	});

	const mcpServer = new McpServer(
		{ name: "hyperidle", version: "0.0.1" },
		{ capabilities: { tools: {} } },
	);

	// Register every tool from the registry with the MCP server.
	// The registry is already role-filtered (toolsForRole called at buildToolRegistry time).
	for (const def of registry.definitions) {
		// eslint-disable-next-line @typescript-eslint/no-loop-func
		mcpServer.registerTool(
			def.name,
			{
				description: def.description,
				// @lore AF4/§9: bridge the server zod-4.4.3 schema to the MCP SDK's
				// AnySchema (its zod dedupes to 3.25.76). Behaviour-neutral schema-type
				// bridge — same validation, distinct brand. NOT a wire-shape change.
				inputSchema: asMcpInputSchema(def.inputSchema),
			},
			async (args: unknown) => {
				const result = await registry.invoke(def.name, args);
				return toolResultToCallToolResult(result);
			},
		);
	}

	// Connect the McpServer to the transport so it can handle requests.
	await mcpServer.connect(transport);

	return { token, sessionId, mcpServer, transport };
}
