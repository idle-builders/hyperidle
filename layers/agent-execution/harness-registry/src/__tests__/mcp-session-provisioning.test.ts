/**
 * AU31 §2.7/§3.1 sites 12,14 (B1): `openMcpBridgeSession`/`closeMcpBridgeSession`
 * — the session-scoped MCP dial folded in from `run-orchestration`'s
 * `provisioner.ts`. See the `@lore` at `mcp/index.ts`'s definition.
 */

import type { ToolRegistry } from "@hyperidle/tool-protocol";
import { describe, expect, it } from "vitest";
import { closeMcpBridgeSession, createMcpToolBridge, openMcpBridgeSession } from "../mcp/index.js";

const registry: ToolRegistry = {
	definitions: [],
	invoke: async () => ({ success: false, code: "NOT_FOUND", error: "none" }),
	toClaudeToolSpecs: () => [],
};

describe("openMcpBridgeSession", () => {
	it("opens the bridge and spells the same /api/mcp/<token> URL every real dial used to build inline", async () => {
		const bridge = createMcpToolBridge();
		const { token, url } = await openMcpBridgeSession(bridge, "http://localhost:3001", {
			sessionId: "session-1",
			registry,
		});

		expect(url).toBe(`http://localhost:3001/api/mcp/${token}`);

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
		const bridge = createMcpToolBridge();
		const first = await openMcpBridgeSession(bridge, "http://localhost:3001", {
			sessionId: "session-2a",
			registry,
		});
		const second = await openMcpBridgeSession(bridge, "http://localhost:3001", {
			sessionId: "session-2b",
			registry,
		});

		expect(first.token).not.toBe(second.token);
		expect(first.url).not.toBe(second.url);
	});
});

describe("closeMcpBridgeSession", () => {
	it("revokes the token on the same bridge instance", async () => {
		const bridge = createMcpToolBridge();
		const { token } = await openMcpBridgeSession(bridge, "http://localhost:3001", {
			sessionId: "session-3",
			registry,
		});

		await closeMcpBridgeSession(bridge, token);

		const revoked = await bridge.router.request(`/mcp/${token}`, { method: "POST" });
		expect(revoked.status).toBe(401);
	});
});
