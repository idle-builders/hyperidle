import type { ToolRegistry } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import { createMcpToolBridge } from "../mcp-tool-bridge.js";
import { createReturnEnforcement } from "../return-enforcement.js";

const registry: ToolRegistry = {
	definitions: [],
	invoke: async () => ({ success: false, code: "NOT_FOUND", error: "none" }),
	toClaudeToolSpecs: () => [],
};

describe("MCP public route", () => {
	it("rejects unknown tokens for every supported HTTP method", async () => {
		const bridge = createMcpToolBridge();
		for (const method of ["GET", "POST", "DELETE"]) {
			const response = await bridge.router.request("/mcp/unknown", { method });
			expect(response.status).toBe(401);
		}
	});

	it("delegates a live token and revokes it on close", async () => {
		const bridge = createMcpToolBridge();
		const { token } = await bridge.open({ sessionId: "route-session", registry });
		const live = await bridge.router.request(`/mcp/${token}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		});
		expect(live.status).not.toBe(401);

		await bridge.close(token);
		const revoked = await bridge.router.request(`/mcp/${token}`, { method: "POST" });
		expect(revoked.status).toBe(401);
	});

	it("requires an exact bearer credential for return-status", async () => {
		const enforcement = createReturnEnforcement({ isolated: true });
		const bridge = createMcpToolBridge({ enforcement });
		const { token } = await bridge.open({ sessionId: "auth-session", registry });

		for (const authorization of [
			`Basic ${token}`,
			`Bearer prefix-${token}`,
			`Bearer ${token}-suffix`,
			`bearer ${token}`,
		]) {
			const response = await bridge.router.request(`/mcp/${token}/return-status`, {
				method: "POST",
				headers: { authorization },
			});
			expect(response.status).toBe(401);
		}

		await bridge.close(token);
	});

	it("rejects an unknown return-status token even when bearer and URL match", async () => {
		const bridge = createMcpToolBridge({
			enforcement: createReturnEnforcement({ isolated: true }),
		});
		const token = "unknown-token";
		const response = await bridge.router.request(`/mcp/${token}/return-status`, {
			method: "POST",
			headers: { authorization: `Bearer ${token}` },
		});

		expect(response.status).toBe(401);
	});

	it("revokes return-status authorization before idempotent close completes", async () => {
		const enforcement = createReturnEnforcement({ isolated: true });
		const bridge = createMcpToolBridge({ enforcement });
		const { token } = await bridge.open({ sessionId: "lifecycle-session", registry });

		await bridge.close(token);
		await expect(bridge.close(token)).resolves.toBeUndefined();

		const response = await bridge.router.request(`/mcp/${token}/return-status`, {
			method: "POST",
			headers: { authorization: `Bearer ${token}` },
		});
		expect(response.status).toBe(401);
	});
});
