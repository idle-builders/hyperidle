import type { EnforcementRegistry } from "@hyperidle/harness-protocol";
import type { ToolRegistry } from "@hyperidle/tool-protocol";
import type { Hono } from "hono";
import { createMcpSession } from "./mcp-bridge.js";
import { createMcpRouter, type McpSessionRegistry } from "./mcp-route.js";

export { returnStatusTool } from "../return-status-tool.js";

export interface McpToolBridge {
	readonly router: Hono;
	open(session: {
		readonly sessionId: string;
		readonly registry: ToolRegistry;
		readonly onToolCall?: (call: { toolName: string; args: unknown }) => void;
	}): Promise<{ readonly token: string }>;
	close(token: string): Promise<void>;
}

export function createMcpToolBridge(
	options: { readonly enforcement?: EnforcementRegistry } = {},
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
				// Custody is already removed; teardown cannot re-authorize the token.
			}
		},
		handleRequest(token, request) {
			const instance = active.get(token);
			return instance
				? instance.transport.handleRequest(request)
				: Promise.resolve(new Response("Unauthorized", { status: 401 }));
		},
	};
	return {
		router: createMcpRouter(sessions, options.enforcement),
		async open(session) {
			const instance = await createMcpSession(session);
			sessions.register(instance);
			return { token: instance.token };
		},
		close(token) {
			return sessions.unregister(token);
		},
	};
}
