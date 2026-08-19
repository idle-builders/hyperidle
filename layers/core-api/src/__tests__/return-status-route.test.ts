import { MAX_FORCE_RETURNS } from "@hyperidle/harness-protocol";
import { createReturnEnforcement } from "@hyperidle/harness-registry";
import { createMcpToolBridge } from "@hyperidle/harness-registry/mcp";
import type { ToolRegistry } from "@hyperidle/harness-protocol";
import { describe, expect, test } from "vitest";

const registry: ToolRegistry = {
	definitions: [],
	invoke: async () => ({ success: false, code: "NOT_FOUND", error: "none" }),
	toClaudeToolSpecs: () => [],
};

describe("return-status adjudication", () => {
	test("the bridge and return tool mutate the same enforcement resource", async () => {
		const enforcement = createReturnEnforcement({ isolated: true });
		const bridge = createMcpToolBridge({ enforcement });
		const sessionId = "return-status-session";
		const opened = await bridge.open({ sessionId, registry });
		enforcement.register(sessionId, { gate: { returned: false }, forceCount: 0, exempt: false });

		const response = await bridge.router.request(`/mcp/${opened.token}/return-status`, {
			method: "POST",
			headers: { authorization: `Bearer ${opened.token}` },
		});
		expect(response.status).toBe(200);
		expect(await response.text()).not.toBe("");
		expect(enforcement.get(sessionId)?.forceCount).toBe(1);
		await bridge.close(opened.token);
	});

	test("returned, exempt, exhausted, and unknown sessions are allowed without mutation", async () => {
		const enforcement = createReturnEnforcement({ isolated: true });
		const bridge = createMcpToolBridge({ enforcement });
		const cases = [
			{ sessionId: "returned", gate: { returned: true }, forceCount: 0, exempt: false },
			{ sessionId: "exempt", gate: { returned: false }, forceCount: 0, exempt: true },
			{
				sessionId: "exhausted",
				gate: { returned: false },
				forceCount: MAX_FORCE_RETURNS,
				exempt: false,
			},
		] as const;

		for (const entry of cases) {
			const { token } = await bridge.open({ sessionId: entry.sessionId, registry });
			enforcement.register(entry.sessionId, {
				gate: entry.gate,
				forceCount: entry.forceCount,
				exempt: entry.exempt,
			});
			const response = await bridge.router.request(`/mcp/${token}/return-status`, {
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
			});
			expect(response.status).toBe(200);
			expect(await response.text()).toBe("");
			expect(enforcement.get(entry.sessionId)?.forceCount).toBe(entry.forceCount);
			await bridge.close(token);
		}

		const unknownSession = await bridge.open({ sessionId: "not-enforced", registry });
		const response = await bridge.router.request(`/mcp/${unknownSession.token}/return-status`, {
			method: "POST",
			headers: { authorization: `Bearer ${unknownSession.token}` },
		});
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");
		await bridge.close(unknownSession.token);
	});

	test("rejects missing, malformed, and mismatched bearer credentials", async () => {
		const bridge = createMcpToolBridge({
			enforcement: createReturnEnforcement({ isolated: true }),
		});
		const { token } = await bridge.open({ sessionId: "auth", registry });
		for (const authorization of [undefined, token, `Basic ${token}`, `Bearer wrong-${token}`]) {
			const headers = authorization ? { authorization } : undefined;
			const response = await bridge.router.request(`/mcp/${token}/return-status`, {
				method: "POST",
				headers,
			});
			expect(response.status).toBe(401);
		}
		await bridge.close(token);
	});
});
