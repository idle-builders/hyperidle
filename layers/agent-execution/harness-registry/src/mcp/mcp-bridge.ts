import * as crypto from "node:crypto";
import type { ToolRegistry, ToolResult } from "@hyperidle/harness-protocol";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { AnySchema as McpAnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// @lore: asMcpInputSchema — MCP SDK uses zod 3.x while server uses zod 4.x; brands nominally distinct; cast is behaviour-neutral (same validation)
function asMcpInputSchema(schema: unknown): McpAnySchema {
	return schema as McpAnySchema;
}

/**
 * A live MCP bridge instance for a single agent session.
 * One McpServer + transport per session; 64-char hex path-token = auth + routing key.
 */
interface McpSession {
	readonly token: string;
	readonly sessionId: string;
	readonly mcpServer: McpServer;
	readonly transport: WebStandardStreamableHTTPServerTransport;
}

interface CreateMcpSessionOptions<TDb = unknown> {
	readonly sessionId: string;
	readonly registry: ToolRegistry<TDb>;
	readonly onToolCall?: (call: { toolName: string; args: unknown }) => void;
}

/** Error body is JSON-stringified so the harness can parse the machine-readable `code` field. */
function formatToolResult(result: ToolResult): CallToolResult {
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

// @lore: createMcpSession transport — stateful (sessionIdGenerator) required; CLI clients use separate HTTP requests per call; stateless throws "cannot reuse"
// @lore: createMcpSession double-validation — MCP SDK validates (Zod); registry.invoke() validates and enforces auth (FORBIDDEN cross-role); bypass skips auth
export async function createMcpSession<TDb = unknown>(
	options: CreateMcpSessionOptions<TDb>,
): Promise<McpSession> {
	const { sessionId, registry } = options;

	const token = crypto.randomBytes(32).toString("hex");

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: () => crypto.randomUUID(),
	});

	const mcpServer = new McpServer(
		{ name: "hyperidle", version: "0.0.1" },
		{ capabilities: { tools: {} } },
	);

	for (const def of registry.definitions) {
		mcpServer.registerTool(
			def.name,
			{
				description: def.description,
				inputSchema: asMcpInputSchema(def.inputSchema),
			},
			async (args: unknown) => {
				const result = await registry.invoke(def.name, args);
				options.onToolCall?.({ toolName: def.name, args });
				return formatToolResult(result);
			},
		);
	}

	await mcpServer.connect(transport);

	return { token, sessionId, mcpServer, transport };
}
