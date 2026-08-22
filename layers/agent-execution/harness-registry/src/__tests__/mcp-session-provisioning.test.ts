/**
 * AU31 §2.7/§3.1 sites 12,14 (B1): session-scoped MCP dial — `bridge.open`
 * now returns the `/api/mcp/<token>` URL directly (Row 14 MERGE: URL folded
 * into `McpToolBridge.open`; `openMcpBridgeSession` deleted).
 */

import type { ToolRegistry } from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import { createMcpToolBridge } from "../mcp/index.js";

const registry: ToolRegistry = {
	definitions: [],
	invoke: async () => ({ success: false, code: "NOT_FOUND", error: "none" }),
	toClaudeToolSpecs: () => [],
};

const BASE_URL = "http://localhost:3001";

describe("bridge.open", () => {
	it("spells the /api/mcp/<token> URL and leaves the token live on the bridge router", async () => {
		const bridge = createMcpToolBridge({ baseUrl: BASE_URL });
		const { token, url } = await bridge.open({
			sessionId: "session-1",
			registry,
		});

		expect(url).toBe(`${BASE_URL}/api/mcp/${token}`);

		// The token is live on the bridge's own router — proves this call really
		// opened the bridge, not merely computed a token-shaped string.
		const live = await bridge.router.request(`/mcp/${token}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		});
		expect(live.status).not.toBe(401);
	});

	it("gives each session its own token on the same bridge", async () => {
		const bridge = createMcpToolBridge({ baseUrl: BASE_URL });
		const first = await bridge.open({ sessionId: "session-2a", registry });
		const second = await bridge.open({ sessionId: "session-2b", registry });

		expect(first.token).not.toBe(second.token);
		expect(first.url).not.toBe(second.url);
	});
});

describe("bridge.close", () => {
	it("revokes the token on the same bridge instance", async () => {
		const bridge = createMcpToolBridge({ baseUrl: BASE_URL });
		const { token } = await bridge.open({ sessionId: "session-3", registry });

		await bridge.close(token);

		const revoked = await bridge.router.request(`/mcp/${token}`, { method: "POST" });
		expect(revoked.status).toBe(401);
	});
});
