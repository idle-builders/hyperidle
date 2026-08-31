import type { ToolRegistry } from "@hyperidle/harness-protocol";
import type { Hono } from "hono";
import type { ActionGateRegistry } from "../action-gate-registry.js";
import type { EnforcementRegistry } from "../enforcement-registry.js";
import { createMcpSession } from "./mcp-bridge.js";
import { createMcpRouter, type McpSessionRegistry } from "./mcp-route.js";

export { returnStatusTool } from "../return-status-tool.js";

export interface McpToolBridge {
	readonly router: Hono;
	/**
	 * Open a session-scoped MCP bridge slot. Returns the auth token AND the
	 * fully-spelled `/api/mcp/<token>` URL that CLI harnesses dial.
	 *
	 * @lore Row 14 MERGE: `openMcpBridgeSession` was a one-string-template
	 * wrapper around `bridge.open`. The URL now lives inside `open` itself —
	 * `baseUrl` is passed to `createMcpToolBridge` at boot time (the one place
	 * that knows the origin). Callers no longer thread `baseUrl` per-call.
	 */
	open(session: {
		readonly sessionId: string;
		readonly registry: ToolRegistry;
		readonly onToolCall?: (call: { toolName: string; args: unknown }) => void;
	}): Promise<{ readonly token: string; readonly url: string }>;
	close(token: string): Promise<void>;
}

export function createMcpToolBridge(
	options: {
		readonly enforcement?: EnforcementRegistry;
		readonly gateRegistry?: ActionGateRegistry;
		readonly baseUrl?: string;
	} = {},
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
	const { baseUrl = "" } = options;
	return {
		router: createMcpRouter(sessions, options.enforcement, options.gateRegistry),
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
