/**
 * Shared setup for real-binary harness tests that probe the MCP bridge /
 * return-enforcement path end-to-end — without a full agent session run.
 * Used by: real-harness-return-enforcement-realbinary.
 */

import * as net from "node:net";

import { serve } from "@hono/node-server";
import { bootAgentExecution } from "@hyperidle/agent-execution";
import type { EnforcementRegistry } from "@hyperidle/harness-registry";
import { buildCleanEnv, createHarnessSandbox } from "@hyperidle/harness-registry/test-fixtures";
import { Hono } from "hono";

export { buildCleanEnv, createHarnessSandbox };

/** An OS-assigned free port — needed before the bridge exists. */
export function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.once("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const addr = probe.address();
			if (addr === null || typeof addr === "string") {
				probe.close(() => reject(new Error("could not determine a free port")));
				return;
			}
			const { port } = addr;
			probe.close(() => resolve(port));
		});
	});
}

export interface LiveHarnessMcpServer {
	/** The server's own origin — `${serverUrl}/api/mcp/<token>` is the dialable MCP URL. */
	readonly serverUrl: string;
	readonly token: string;
	readonly enforcementReg: EnforcementRegistry;
	readonly sessionId: string;
	close(): Promise<void>;
}

/**
 * Boots the real `bootAgentExecution` MCP bridge + enforcement registry on a
 * random port, opens one bridge session for `sessionId`, and registers a
 * default enforcement entry — the same starting state every real-binary proof
 * needs before the binary's own hook can fire against it.
 */
export async function setUpLiveHarnessMcpServer(sessionId: string): Promise<LiveHarnessMcpServer> {
	const port = await getFreePort();
	const serverUrl = `http://127.0.0.1:${port}`;
	const execution = await bootAgentExecution({ mcpBaseUrl: serverUrl });

	const bridgeApp = new Hono();
	const bridgeApi = new Hono();
	execution.mountMcpRouter(bridgeApi);
	bridgeApp.route("/api", bridgeApi);
	const httpServer = await new Promise<ReturnType<typeof serve>>((resolve) => {
		const server = serve({ fetch: bridgeApp.fetch, port }, () => resolve(server));
	});

	const { token } = await execution.adapters.harnessRuntime.openMcpBridge({
		sessionId,
		toolRegistry: {
			definitions: [],
			invoke: async () => ({ success: false, code: "NOT_FOUND", error: "none" }),
			toClaudeToolSpecs: () => [],
		},
	});

	const enforcementReg = execution.adapters.harnessRuntime.enforcementRegistry;
	enforcementReg.register(sessionId, { gate: { returned: false }, forceCount: 0, exempt: false });

	return {
		serverUrl,
		token,
		enforcementReg,
		sessionId,
		async close() {
			enforcementReg.unregister(sessionId);
			await execution.adapters.harnessRuntime.closeMcpBridge(token);
			execution.dispose();
			await new Promise<void>((resolve, reject) => {
				httpServer.close((err: Error | undefined) => (err ? reject(err) : resolve()));
			});
		},
	};
}
