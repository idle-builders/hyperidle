import { createMcpToolBridge, createReturnEnforcement } from "@hyperidle/harness-registry";
import { EventBus, type ToolContext, type ToolRegistry } from "@hyperidle/shared";
import { buildToolRegistry } from "../services/tool-provider-bindings.js";
import { describe, expect, test } from "../test-fixtures.js";

const registry: ToolRegistry = {
	definitions: [],
	invoke: async () => ({ success: false, code: "NOT_FOUND", error: "none" }),
	toClaudeToolSpecs: () => [],
};

describe("X2 MCP session custody", () => {
	test("opens a role-filtered production tool registry and preserves result codes", async ({
		db,
	}) => {
		const context: ToolContext<typeof db> = {
			db,
			eventBus: new EventBus(),
			agentId: "mcp-role-agent",
			sessionId: "mcp-role-session",
			taskId: "mcp-role-task",
			sandboxPath: "/tmp/mcp-role-session",
			ingestion: { dispose() {} },
		};
		const builderRegistry = buildToolRegistry(context, { role: "builder" });
		const assistantRegistry = buildToolRegistry(context, { role: "assistant" });
		expect(builderRegistry.definitions.some(({ name }) => name === "create_team")).toBe(false);
		expect(assistantRegistry.definitions.some(({ name }) => name === "create_team")).toBe(true);
		await expect(builderRegistry.invoke("create_team", {})).resolves.toMatchObject({
			success: false,
			code: "FORBIDDEN",
		});
		await expect(builderRegistry.invoke("not_a_real_tool", {})).resolves.toMatchObject({
			success: false,
			code: "NOT_FOUND",
		});

		const bridge = createMcpToolBridge();
		const { token } = await bridge.open({
			sessionId: context.sessionId,
			registry: builderRegistry as ToolRegistry,
		});
		const delegated = await bridge.router.request(`/mcp/${token}`, { method: "POST" });
		expect(delegated.status).not.toBe(401);
		await bridge.close(token);
		expect((await bridge.router.request(`/mcp/${token}`, { method: "POST" })).status).toBe(401);
	});

	test("tokens are isolated and closing one immediately revokes only that token", async () => {
		const bridge = createMcpToolBridge({
			enforcement: createReturnEnforcement({ isolated: true }),
		});
		const first = await bridge.open({ sessionId: "first", registry });
		const second = await bridge.open({ sessionId: "second", registry });
		expect(first.token).not.toBe(second.token);

		await bridge.close(first.token);
		await bridge.close(first.token);
		const revoked = await bridge.router.request(`/mcp/${first.token}`, { method: "POST" });
		const live = await bridge.router.request(`/mcp/${second.token}`, { method: "POST" });
		expect(revoked.status).toBe(401);
		expect(live.status).not.toBe(401);
		await bridge.close(second.token);
	});

	test("close is idempotent and an expired token cannot reach return-status state", async () => {
		const enforcement = createReturnEnforcement({ isolated: true });
		const bridge = createMcpToolBridge({ enforcement });
		const sessionId = "expired-session";
		const { token } = await bridge.open({ sessionId, registry });
		enforcement.register(sessionId, {
			gate: { returned: false },
			forceCount: 0,
			exempt: false,
		});

		await bridge.close(token);
		await expect(bridge.close(token)).resolves.toBeUndefined();
		const response = await bridge.router.request(`/mcp/${token}/return-status`, {
			method: "POST",
			headers: { authorization: `Bearer ${token}` },
		});
		expect(response.status).toBe(401);
		expect(await response.text()).toBe("Unauthorized");
		expect(enforcement.get(sessionId)?.forceCount).toBe(0);
	});
});
