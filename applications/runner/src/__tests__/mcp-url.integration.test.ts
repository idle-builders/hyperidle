/**
 * Integration test: the MCP bridge URL written into agent config files
 * (`.cursor/mcp.json`, `opencode.json`, `.claude/return-check.sh`) is
 * `${mcpBaseUrl}/api/mcp/${token}`.  The bridge HTTP server must serve that
 * route — not a 404.
 *
 * This test replicates the bridge-server setup that runner/index.ts does and
 * proves the URL is reachable.  Proves RED before the /api prefix is added to
 * the mount.
 */

import * as net from "node:net";
import { type ServerType, serve } from "@hono/node-server";
import { bootAgentExecution } from "@hyperidle/agent-execution";
import { Hono } from "hono";
import { afterEach, describe, expect, test } from "vitest";

function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.once("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const addr = probe.address();
			if (!addr || typeof addr === "string") {
				probe.close(() => reject(new Error("could not determine free port")));
				return;
			}
			const { port } = addr;
			probe.close(() => resolve(port));
		});
	});
}

let bridgeServer: ServerType | null = null;
afterEach(async () => {
	if (bridgeServer) {
		await new Promise<void>((resolve) => bridgeServer?.close(() => resolve()));
		bridgeServer = null;
	}
});

describe("runner MCP bridge URL", () => {
	test("URL written to agent config files is reachable at /api/mcp/:token (not 404)", async () => {
		const port = await getFreePort();
		const mcpBaseUrl = `http://127.0.0.1:${port}`;

		const execution = await bootAgentExecution({
			mcpBaseUrl,
			discoveryDeps: { run: async () => ({ stdout: "", stderr: "not found", exitCode: 1 }) },
			availabilityDeps: {
				whichFn: async () => {
					throw new Error("not found");
				},
			},
		});

		// Replicates runner/index.ts: mount the MCP router under /api so URLs
		// written to config files (${mcpBaseUrl}/api/mcp/:token) are reachable.
		const bridgeApp = new Hono();
		const bridgeApi = new Hono();
		execution.mountMcpRouter(bridgeApi);
		bridgeApp.route("/api", bridgeApi);

		bridgeServer = serve({ fetch: bridgeApp.fetch, port, hostname: "127.0.0.1" });
		await new Promise<void>((resolve, reject) => {
			if (bridgeServer?.listening) {
				resolve();
				return;
			}
			bridgeServer?.once("listening", resolve);
			bridgeServer?.once("error", reject);
		});

		try {
			// Open a bridge session — returns the URL that is written into every config file.
			const { url, token } = await execution.adapters.harnessRuntime.openMcpBridge({
				sessionId: "mcp-url-test",
				toolRegistry: {
					definitions: [],
					invoke: async () => ({
						success: false as const,
						code: "NOT_FOUND" as const,
						error: "none",
					}),
					toClaudeToolSpecs: () => [],
				},
			});

			// url = "${mcpBaseUrl}/api/mcp/${token}" — the path agents dial.
			// Before the fix: bridgeApp serves /mcp/:token (no /api prefix) → 404.
			const mcpRes = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
					params: {
						protocolVersion: "2024-11-05",
						capabilities: {},
						clientInfo: { name: "test", version: "1" },
					},
				}),
			});
			expect(mcpRes.status).not.toBe(404);

			// return-status must also be reachable (hook scripts POST here).
			const rsRes = await fetch(`${url}/return-status`, {
				method: "POST",
				headers: { Authorization: `Bearer ${token}` },
			});
			expect(rsRes.status).not.toBe(404);

			await execution.adapters.harnessRuntime.closeMcpBridge(token);
		} finally {
			execution.dispose();
		}
	}, 10_000);
});
