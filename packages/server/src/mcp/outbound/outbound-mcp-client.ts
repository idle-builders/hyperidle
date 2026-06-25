/**
 * AN2 — Outbound MCP client.
 *
 * Connects HyperIdle OUT to an external MCP server using the SDK Client +
 * the transport the ConnectorSpec names.
 *
 * @lore AN2: This is the mirror of mcp-bridge.ts (which handles INBOUND — harness
 * → HyperIdle via SDK server transport). This file handles OUTBOUND — HyperIdle
 * → external service via SDK CLIENT transport.
 *
 * @lore AN2 security: `authToken` is resolved server-side by the caller (inside
 * the brokered tool handler). It is attached to the transport at connect time and
 * NEVER appears in:
 *   - returned object properties
 *   - args objects
 *   - thrown error messages (redacted below)
 * SSRF: `spec.url` comes from the operator-defined ConnectorSpec, never from
 * agent input. The agent cannot inject a target URL.
 */

import type { ConnectorSpec, ConnectorToolDescriptor } from "@hyperidle/shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/** The result of a tool call from an external MCP server. */
export interface CallToolResult {
	/** Combined text from all text content blocks, or JSON of the entire content array. */
	readonly text: string;
	/** Whether the tool reported an error (MCP isError flag). */
	readonly isError: boolean;
}

export interface OutboundConnection {
	readonly listTools: () => Promise<ConnectorToolDescriptor[]>;
	readonly callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;
	readonly close: () => Promise<void>;
}

/**
 * Connect OUT to an external MCP server using the SDK Client + the transport
 * the ConnectorSpec names. `authToken` (resolved server-side by the caller) is
 * attached per the spec.auth strategy:
 *   - bearer-header (http): StreamableHTTPClientTransport requestInit headers
 *     { Authorization: `Bearer ${authToken}` }
 *   - env (stdio): StdioClientTransport env { [spec.envVar]: authToken }
 *   - none: no credential
 *
 * VERIFIED against installed @modelcontextprotocol/sdk@1.29.0:
 *   StreamableHTTPClientTransportOptions.requestInit?: RequestInit (streamableHttp.d.ts:77)
 *   StdioServerParameters.env?: Record<string,string> (stdio.d.ts:19)
 */
export async function connectOutbound(
	spec: ConnectorSpec,
	authToken: string | null,
): Promise<OutboundConnection> {
	const client = new Client({ name: "hyperidle-outbound", version: "1.0.0" });

	let transport: StreamableHTTPClientTransport | StdioClientTransport;

	if (spec.transport === "http") {
		if (!spec.url) {
			throw new Error(
				`ConnectorSpec for service "${spec.service}" is missing url for http transport`,
			);
		}

		// Build requestInit with optional Authorization header
		let requestInit: RequestInit | undefined;
		if (spec.auth === "bearer-header" && authToken) {
			requestInit = {
				headers: { Authorization: `Bearer ${authToken}` },
			};
		}

		transport = new StreamableHTTPClientTransport(new URL(spec.url), {
			...(requestInit !== undefined ? { requestInit } : {}),
		});
	} else if (spec.transport === "stdio") {
		if (!spec.command) {
			throw new Error(
				`ConnectorSpec for service "${spec.service}" is missing command for stdio transport`,
			);
		}

		// Build env with optional credential env var
		let env: Record<string, string> | undefined;
		if (spec.auth === "env" && spec.envVar && authToken) {
			env = { [spec.envVar]: authToken };
		}

		transport = new StdioClientTransport({
			command: spec.command,
			args: spec.args ? [...spec.args] : [],
			...(env !== undefined ? { env } : {}),
		});
	} else {
		throw new Error(`Unsupported transport: ${String((spec as ConnectorSpec).transport)}`);
	}

	try {
		await client.connect(transport);
	} catch (e) {
		// @lore AN2 security: redact authToken from error messages to prevent
		// credential leakage in logs. Replace any occurrence with "[REDACTED]".
		// @lore AN2 redaction fragility: this is SUBSTRING-based (String.replaceAll).
		// It catches verbatim token embedding in error text (e.g. SDK echoing the Bearer
		// header). It does NOT catch: base64/percent-encoded variants, tokens split across
		// multiple fields, or error objects that stringify differently than `.message`.
		// If the SDK ever encodes the header before echoing it, the raw token won't appear
		// and replaceAll is a no-op — the redaction silently stops working. Next agent: if
		// you see token fragments in logs, check the SDK error serialization path first.
		const raw = e instanceof Error ? e.message : String(e);
		const safe = authToken && authToken.length > 0 ? raw.replaceAll(authToken, "[REDACTED]") : raw;
		throw new Error(`connectOutbound failed for service "${spec.service}": ${safe}`);
	}

	return {
		async listTools(): Promise<ConnectorToolDescriptor[]> {
			const result = await client.listTools();
			return result.tools.map((t) => ({
				name: t.name,
				...(t.description !== undefined ? { description: t.description } : {}),
				inputSchema: t.inputSchema as Record<string, unknown>,
				...(t.annotations !== undefined
					? {
							annotations: {
								...(t.annotations.destructiveHint !== undefined
									? { destructiveHint: t.annotations.destructiveHint }
									: {}),
								...(t.annotations.idempotentHint !== undefined
									? { idempotentHint: t.annotations.idempotentHint }
									: {}),
							},
						}
					: {}),
			}));
		},

		async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
			try {
				const result = await client.callTool({ name, arguments: args });

				// Map content blocks to a single text string
				const content = result.content;
				if (Array.isArray(content)) {
					const textParts = content
						.filter((c) => c.type === "text")
						.map((c) => (c as { type: "text"; text: string }).text);
					const text = textParts.length > 0 ? textParts.join("\n") : JSON.stringify(content);
					return { text, isError: result.isError === true };
				}
				return { text: JSON.stringify(result), isError: false };
			} catch (e) {
				const raw = e instanceof Error ? e.message : String(e);
				// Redact auth token from call errors too
				const safe =
					authToken && authToken.length > 0 ? raw.replaceAll(authToken, "[REDACTED]") : raw;
				throw new Error(`callTool "${name}" on service "${spec.service}" failed: ${safe}`);
			}
		},

		async close(): Promise<void> {
			await client.close();
		},
	};
}
