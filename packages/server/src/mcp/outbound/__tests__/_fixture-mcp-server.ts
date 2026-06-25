/**
 * AN2 — In-repo real McpServer fixture over StreamableHTTPServerTransport.
 *
 * This IS the "locally-spawned standard MCP server" allowed by the WP §Plan-calls.
 * The MCP SDK Client really connects, negotiates, runs tools/list and tools/call
 * over HTTP — NOT a stub of our client. This is the primary live-proof.
 *
 * Tools exposed:
 *  - read_value   (idempotentHint:true  → reversible)
 *  - write_value  (destructiveHint:true → irreversible)
 *  - whoami       (idempotentHint:true; records inbound Authorization header
 *                  so AC3a can assert credential-attach)
 *  - mystery      (no annotations → fail-safe irreversible)
 *
 * @lore AN2: Per-session McpServer instances are required. The SDK's stateful
 * StreamableHTTPServerTransport maintains session state per McpServer instance.
 * A second client's `initialize` clashes with an already-initialized McpServer.
 * Fix: maintain sessions Map<sessionId, StreamableHTTPServerTransport> and create
 * a FRESH McpServer + transport per new initialize request (no mcp-session-id
 * header). Subsequent requests route to existing transport via the map. This mirrors
 * the SDK's `simpleStreamableHttp.js` example (stateful multi-session pattern).
 *
 * @lore AN2: Test isolation: each test creates a fresh fixture via beforeEach.
 * Stateless mode (sessionIdGenerator: undefined) would forbid transport reuse
 * across the multiple POSTs one MCP client session requires (initialize →
 * notifications/initialized → listTools → callTool).
 *
 * @lore AN2: Uses `registerTool` (not `tool()`) to avoid the zod-brand cross-version
 * issue (the SDK dedupes to zod 3.25.76; our server uses zod 4.4.3). Pattern mirrors
 * mcp-bridge.ts §lore AF4/§9 — use `asMcpInputSchema` cast for the inputSchema field.
 *
 * @lore AN2: `capturedAuthHeaders` records all Authorization headers received at the
 * HTTP layer, before handing the request to the MCP transport. The `whoami` tool
 * reads the last captured header to return it as its result — this proves AC3a
 * (credential attached in the Authorization header by the broker).
 */

import * as crypto from "node:crypto";
import * as http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AnySchema as McpAnySchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import z from "zod";

// @lore AN2/AF4: Same bridge as mcp-bridge.ts — reconcile zod 4.4.3 brand with
// SDK's AnySchema (deduped zod 3.25.76). Behaviour-neutral schema-type bridge.
function asMcpInputSchema(schema: unknown): McpAnySchema {
	return schema as McpAnySchema;
}

export interface FixtureMcpServer {
	readonly url: string;
	/** Authorization headers recorded by the HTTP handler (all requests). */
	readonly capturedAuthHeaders: string[];
	/** Number of times write_value was actually called (for at-most-once proof). */
	readonly writeCallCount: () => number;
	readonly close: () => Promise<void>;
}

/**
 * Register the four AN2 fixture tools on a McpServer instance.
 * Called once per session (each new McpServer per session gets fresh registrations).
 *
 * @param mcpServer - Fresh McpServer for this session.
 * @param capturedAuthHeaders - Shared array across sessions (fine: each test creates a new fixture).
 * @param writeCountRef - Mutable ref to the per-fixture write counter.
 */
function registerFixtureTools(
	mcpServer: McpServer,
	capturedAuthHeaders: string[],
	writeCountRef: { value: number },
): void {
	// read_value — idempotentHint:true → reversible for vetted source
	mcpServer.registerTool(
		"read_value",
		{
			description: "Read a value (idempotent)",
			inputSchema: asMcpInputSchema(z.object({ key: z.string() })),
			annotations: { idempotentHint: true },
		},
		async (args: unknown) => {
			const { key } = args as { key: string };
			return { content: [{ type: "text" as const, text: `value:${key}` }] };
		},
	);

	// write_value — destructiveHint:true → irreversible
	mcpServer.registerTool(
		"write_value",
		{
			description: "Write a value (destructive)",
			inputSchema: asMcpInputSchema(z.object({ key: z.string(), value: z.string() })),
			annotations: { destructiveHint: true },
		},
		async (args: unknown) => {
			writeCountRef.value++;
			const { key, value } = args as { key: string; value: string };
			return { content: [{ type: "text" as const, text: `written:${key}=${value}` }] };
		},
	);

	// whoami — idempotentHint:true; reads last captured Authorization header.
	// Authorization is captured at the HTTP layer (before transport.handleRequest) so the
	// tool handler can access it from the shared capturedAuthHeaders array.
	//
	// @lore AN2: McpServer tool handlers don't receive raw HTTP headers. We capture the
	// Authorization header in the Node.js http.createServer handler before passing the
	// request to the transport. The whoami tool reads the most recently captured header.
	mcpServer.registerTool(
		"whoami",
		{
			description: "Return who is calling (idempotent, records auth header)",
			inputSchema: asMcpInputSchema(z.object({})),
			annotations: { idempotentHint: true },
		},
		async () => {
			const lastAuth = capturedAuthHeaders[capturedAuthHeaders.length - 1] ?? "";
			return { content: [{ type: "text" as const, text: `auth:${lastAuth}` }] };
		},
	);

	// mystery — no annotations → fail-safe irreversible
	mcpServer.registerTool(
		"mystery",
		{
			description: "A tool with no reversibility hints",
			inputSchema: asMcpInputSchema(z.object({ x: z.number() })),
			// No annotations: intentionally omitted to test fail-safe classification
		},
		async (args: unknown) => {
			const { x } = args as { x: number };
			return { content: [{ type: "text" as const, text: `mystery:${x}` }] };
		},
	);
}

/**
 * Start a real MCP server on an ephemeral 127.0.0.1 port.
 * Returns once the server is listening.
 *
 * The caller must call `.close()` in afterEach to free the port.
 *
 * Per-session McpServer: each new MCP initialize request (no mcp-session-id header)
 * creates a fresh McpServer + StreamableHTTPServerTransport pair stored in a map.
 * Subsequent requests from the same session route to the existing transport.
 */
export async function startFixtureMcpServer(): Promise<FixtureMcpServer> {
	const capturedAuthHeaders: string[] = [];
	// Mutable ref shared across sessions (safe: each test gets a fresh fixture).
	const writeCountRef = { value: 0 };

	// Per-session transport map: session ID → transport.
	// @lore AN2: The SDK generates a session ID during initialize response and sets
	// the `mcp-session-id` response header. All subsequent requests from that client
	// include this header, so routing is an O(1) map lookup.
	const sessions = new Map<string, StreamableHTTPServerTransport>();

	const httpServer = http.createServer(async (req, res) => {
		// Capture Authorization header BEFORE passing to MCP transport.
		const authHeader = req.headers["authorization"] ?? "";
		if (authHeader) {
			capturedAuthHeaders.push(authHeader);
		}

		// Route by existing session ID if present.
		const sessionId = req.headers["mcp-session-id"] as string | undefined;
		if (sessionId) {
			const existingTransport = sessions.get(sessionId);
			if (existingTransport) {
				await existingTransport.handleRequest(req, res);
				return;
			}
			res.writeHead(404).end("Unknown session");
			return;
		}

		// No session ID → new initialize request.
		// Create a fresh McpServer + transport for this session.
		const sessionMcpServer = new McpServer({ name: "AN2-fixture", version: "1.0.0" });
		registerFixtureTools(sessionMcpServer, capturedAuthHeaders, writeCountRef);

		const sessionTransport = new StreamableHTTPServerTransport({
			sessionIdGenerator: () => crypto.randomUUID(),
			onsessioninitialized: (id) => {
				sessions.set(id, sessionTransport);
			},
			onsessionclosed: (id) => {
				sessions.delete(id);
			},
		});

		await sessionMcpServer.connect(sessionTransport);
		await sessionTransport.handleRequest(req, res);
	});

	// Listen on an ephemeral port (0 = OS picks)
	await new Promise<void>((resolve, reject) => {
		httpServer.listen(0, "127.0.0.1", () => resolve());
		httpServer.once("error", reject);
	});

	const addr = httpServer.address() as { port: number };
	const url = `http://127.0.0.1:${addr.port}/mcp`;

	return {
		url,
		capturedAuthHeaders,
		writeCallCount: () => writeCountRef.value,
		close: async () => {
			await new Promise<void>((resolve, reject) => {
				httpServer.close((err) => (err ? reject(err) : resolve()));
			});
		},
	};
}
