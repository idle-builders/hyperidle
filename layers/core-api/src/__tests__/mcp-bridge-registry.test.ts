import { EventBus } from "@hyperidle/event-bus";
import type { ToolContext, ToolRegistry } from "@hyperidle/harness-protocol";
import { createReturnEnforcement } from "@hyperidle/harness-registry";
import { createMcpToolBridge } from "@hyperidle/harness-registry/mcp";
import { buildToolRegistry } from "@hyperidle/tool-handlers";
import { describe, expect, test } from "../__testing__/test-fixtures.js";
import { actionsAsTools } from "../actions/actions-as-tools.js";
import { buildCoreActions } from "../actions/compose.js";

const registry: ToolRegistry = {
	definitions: [],
	invoke: async () => ({ success: false, code: "NOT_FOUND", error: "none" }),
	toClaudeToolSpecs: () => [],
};

describe("X2 MCP session custody", () => {
	test("opens a production tool registry and preserves result codes", async ({
		db,
		agentOrchestration,
	}) => {
		// @lore BC5 T11: the hand-written management catalog (`create_team`/
		// `add_agent`) is DELETED with the `CoreApiPort` seam it wrote through
		// — a session's registry is the composed action list's own tool
		// projection now, exactly what `run-orchestration-composition.ts`'s
		// `buildToolProvider` assembles.
		const definitions = actionsAsTools(
			buildCoreActions({
				agentOrchestration,
				agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
				reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
			}),
		);
		const context: ToolContext<typeof db> = {
			db,
			eventBus: new EventBus(),
			agentId: "mcp-role-agent",
			sessionId: "mcp-role-session",
			taskId: "mcp-role-task",
			sandboxPath: "/tmp/mcp-role-session",
			ingestion: { dispose() {} },
		};
		const registry = buildToolRegistry(definitions, context, { role: "assistant" });
		expect(registry.definitions.some(({ name }) => name === "search_users")).toBe(true);
		await expect(registry.invoke("search_users", {})).resolves.toMatchObject({
			success: true,
		});
		await expect(registry.invoke("not_a_real_tool", {})).resolves.toMatchObject({
			success: false,
			code: "NOT_FOUND",
		});

		const bridge = createMcpToolBridge();
		const { token } = await bridge.open({
			sessionId: context.sessionId,
			registry: registry as ToolRegistry,
		});
		const delegated = await bridge.router.request(`/mcp/${token}`, { method: "POST" });
		expect(delegated.status).not.toBe(401);
		await bridge.close(token);
		expect((await bridge.router.request(`/mcp/${token}`, { method: "POST" })).status).toBe(401);
	});

	test("tokens are isolated and closing one immediately revokes only that token", async () => {
		const bridge = createMcpToolBridge({
			enforcement: createReturnEnforcement(),
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
		const enforcement = createReturnEnforcement();
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
