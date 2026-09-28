import type { ToolRegistry } from "@hyperidle/harness-protocol";
import type { Hono } from "hono";
import type { EnforcementRegistry } from "../enforcement-registry.js";
import { createMcpSession } from "./mcp-bridge.js";
import { createMcpRouter, type McpSessionRegistry } from "./mcp-route.js";

export { returnStatusTool } from "../return-status-tool.js";

export interface McpToolBridge {
	readonly router: Hono;
	/** Open a session-scoped MCP bridge slot. Returns token and the full `/api/mcp/<token>` URL. */
	open(session: {
		readonly sessionId: string;
		readonly registry: ToolRegistry;
		readonly onToolCall?: (call: { toolName: string; args: unknown }) => void;
	}): Promise<{ readonly token: string; readonly url: string }>;
	close(token: string): Promise<void>;
}

export function createMcpToolBridge(
	options: { readonly enforcement?: EnforcementRegistry; readonly baseUrl?: string } = {},
): McpToolBridge {
	const active = new Map<string, Awaited<ReturnType<typeof createMcpSession>>>();
	const sessions: McpSessionRegistry & {
		register(instance: Awaited<ReturnType<typeof createMcpSession>>): void;
		unregister(token: string): Promise<void>;
	} = {
		register(instance) {
			active.set(instance.token, instance);
		},
		lookup(token) {
			return active.get(token);
		},
		async unregister(token) {
			const instance = active.get(token);
			if (!instance) return;
			active.delete(token);
			try {
				await instance.mcpServer.close();
			} catch {
				// Custody already removed; teardown failure is safe to ignore.
			}
		},
		handleRequest(token, request) {
			const instance = active.get(token);
			return instance
				? instance.transport.handleRequest(request)
				: Promise.resolve(new Response("Unauthorized", { status: 401 }));
		},
	};
	const { baseUrl = "" } = options;
	return {
		router: createMcpRouter(sessions, options.enforcement),
		async open(session) {
			const instance = await createMcpSession(session);
			sessions.register(instance);
			const token = instance.token;
			return { token, url: `${baseUrl}/api/mcp/${token}` };
		},
		close(token) {
			return sessions.unregister(token);
		},
	};
}
