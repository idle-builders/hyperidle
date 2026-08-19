import type { ToolRegistry } from "@hyperidle/harness-protocol";
import type { EnforcementRegistry } from "../enforcement-registry.js";
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

/**
 * AU31 §2.7/§3.1 sites 12,14 (B1) — the session-scoped MCP dial, folded in
 * from `run-orchestration`'s `provisioner.ts`: bridge-open, the `/api/mcp/`
 * URL spelling, and close. `harness-registry` is the one Service with an
 * allowed edge to the MCP router (`tools/governance/decided-rules.json`);
 * `provisioner.ts` calls only these two functions, through the injected
 * `SessionLifecycleHarnessRuntime` port (`openMcpBridge`/`closeMcpBridge`,
 * wired at `layers/core-api/src/services/run-orchestration-composition.ts`),
 * never touching `bridge.open`/`bridge.close` or a `/api/mcp/` literal
 * itself again.
 */
export async function openMcpBridgeSession(
	bridge: McpToolBridge,
	baseUrl: string,
	session: {
		readonly sessionId: string;
		readonly registry: ToolRegistry;
		readonly onToolCall?: (call: { toolName: string; args: unknown }) => void;
	},
): Promise<{ readonly token: string; readonly url: string }> {
	const { token } = await bridge.open(session);
	return { token, url: `${baseUrl}/api/mcp/${token}` };
}
