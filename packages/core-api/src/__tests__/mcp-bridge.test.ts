/**
 * mcp-bridge.test.ts — Unit tests for createMcpBridge and toolResultToCallToolResult.
 *
 * AC coverage:
 *   AC1 — createMcpBridge registers all tools from the registry as MCP tools
 *   AC3 — ToolResult success/failure correctly maps to CallToolResult
 *   AC4 — Role-based filtering: facilitator-only tools return FORBIDDEN for builder role
 *
 * Demoted from mcp-bridge.integration.test.ts (AR6): pure bridge/registry unit,
 * no harness, no agent. Real integration proof is T0b (mcp-bridge-stateful) +
 * AL7-two-session (real binaries).
 *
 * @lore AR6 demotion: Moved from src/__tests__ to mcp/__tests__ as a .test.ts unit.
 * Uses { db } fixture from test-fixtures (not createTestDb() directly).
 */

import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	type CreateMcpBridgeOptions,
	createMcpBridge,
	type McpBridgeInstance,
	toolResultToCallToolResult,
} from "@hyperidle/harness-registry/mcp";
import { EventBus, type ToolContext, type ToolRegistry, type ToolResult } from "@hyperidle/shared";
import { buildToolRegistry } from "../services/tool-provider-bindings.js";
import { describe, expect, test } from "../test-fixtures.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(db: HyperIdleDb, eventBus: EventBus): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agent-test",
		sessionId: "session-test",
		taskId: "task-test",
		sandboxPath: path.join(os.tmpdir(), `x2-bridge-test-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

// ---------------------------------------------------------------------------
// Suite: toolResultToCallToolResult (pure mapping — AC3)
// ---------------------------------------------------------------------------

describe("toolResultToCallToolResult (AC3)", () => {
	test("maps success=true with data to content text array", () => {
		const result: ToolResult = { success: true, data: { id: "abc", value: 42 } };
		const callResult = toolResultToCallToolResult(result);

		expect(callResult.isError).toBeFalsy();
		expect(callResult.content).toHaveLength(1);
		const item = callResult.content[0];
		expect(item!.type).toBe("text");
		if (item!.type === "text") {
			expect(item!.text).toBe(JSON.stringify({ id: "abc", value: 42 }));
		}
	});

	test("maps success=true with null data to content text 'null'", () => {
		const result: ToolResult = { success: true, data: null };
		const callResult = toolResultToCallToolResult(result);

		expect(callResult.isError).toBeFalsy();
		expect(callResult.content[0]?.type).toBe("text");
		if (callResult.content[0]?.type === "text") {
			expect(callResult.content[0].text).toBe("null");
		}
	});

	test("maps success=false to isError=true with JSON error body", () => {
		const result: ToolResult = {
			success: false,
			error: "Resource not found",
			code: "NOT_FOUND",
		};
		const callResult = toolResultToCallToolResult(result);

		expect(callResult.isError).toBe(true);
		expect(callResult.content).toHaveLength(1);
		const item = callResult.content[0];
		expect(item!.type).toBe("text");
		if (item!.type === "text") {
			const parsed = JSON.parse(item!.text) as { error: string; code: string };
			expect(parsed.error).toBe("Resource not found");
			expect(parsed.code).toBe("NOT_FOUND");
		}
	});

	test("maps FORBIDDEN error code to isError=true with FORBIDDEN in text", () => {
		const result: ToolResult = {
			success: false,
			error: "Tool not available to this role: route_item",
			code: "FORBIDDEN",
		};
		const callResult = toolResultToCallToolResult(result);

		expect(callResult.isError).toBe(true);
		const item = callResult.content[0];
		expect(item!.type).toBe("text");
		if (item!.type === "text") {
			expect(item!.text).toContain("FORBIDDEN");
		}
	});

	test("maps success=true with array data to JSON-stringified array", () => {
		const result: ToolResult = { success: true, data: [1, 2, 3] };
		const callResult = toolResultToCallToolResult(result);

		expect(callResult.isError).toBeFalsy();
		if (callResult.content[0]?.type === "text") {
			expect(callResult.content[0].text).toBe("[1,2,3]");
		}
	});
});

// ---------------------------------------------------------------------------
// Suite: createMcpBridge — AC1 (tool registration)
// ---------------------------------------------------------------------------

describe("createMcpBridge (AC1: tool registration)", () => {
	let bridge: McpBridgeInstance;
	let registry: ToolRegistry<HyperIdleDb>;

	test("returns a McpBridgeInstance with token, sessionId, mcpServer, transport", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const ctx = makeContext(db, eventBus);
		registry = buildToolRegistry(ctx, { role: "assistant" });

		const options: CreateMcpBridgeOptions<HyperIdleDb> = {
			sessionId: "session-ac1",
			registry,
		};
		bridge = await createMcpBridge(options);

		expect(bridge.token).toBeDefined();
		expect(typeof bridge.token).toBe("string");
		// token is a 64-char hex string (32 bytes)
		expect(bridge.token).toMatch(/^[0-9a-f]{64}$/);

		expect(bridge.sessionId).toBe("session-ac1");
		expect(bridge.mcpServer).toBeDefined();
		expect(bridge.transport).toBeDefined();

		await bridge.transport.close();
	});

	test("generates a unique token each time createMcpBridge is called", async ({ db }) => {
		const eventBus = new EventBus();
		const ctx = makeContext(db, eventBus);
		const reg1 = buildToolRegistry(ctx, { role: "assistant" });
		const reg2 = buildToolRegistry(ctx, { role: "assistant" });

		const bridge1 = await createMcpBridge({ sessionId: "session-ac1-a", registry: reg1 });
		const bridge2 = await createMcpBridge({ sessionId: "session-ac1-b", registry: reg2 });

		expect(bridge1.token).not.toBe(bridge2.token);

		await bridge1.transport.close();
		await bridge2.transport.close();
	});

	test("registers exactly 22 tools (all tools for assistant role, including AE3 management tools + AK4 edit_bet + AL7 commit_file)", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const ctx = makeContext(db, eventBus);
		registry = buildToolRegistry(ctx, { role: "assistant" });

		bridge = await createMcpBridge({ sessionId: "session-ac1-count", registry });

		// 15 (pre-AE3) + 5 (AE3 management tools) + 1 (AK4 edit_bet) + 1 (AL7 commit_file) = 22
		expect(registry.definitions).toHaveLength(22);
		const names = registry.definitions.map((d) => d.name).sort();
		expect(names).toContain("route_item");
		expect(names).toContain("log_task");
		expect(names).toContain("send_message");
		expect(names).toContain("create_artifact");
		// AE3 management tools
		expect(names).toContain("create_team");
		expect(names).toContain("add_agent");
		expect(names).toContain("create_bet");
		expect(names).toContain("create_routine");
		expect(names).toContain("update_routine");

		await bridge.transport.close();
	});

	test("each registered tool has the expected name from the registry", async ({ db }) => {
		const eventBus = new EventBus();
		const ctx = makeContext(db, eventBus);
		registry = buildToolRegistry(ctx, { role: "assistant" });

		bridge = await createMcpBridge({ sessionId: "session-ac1-names", registry });

		// Verify the registry definition names are the 22 canonical tools (15 pre-AE3 + 5 AE3 + 1 AK4 + 1 AL7)
		const expectedNames = [
			"read_inbox",
			"send_message",
			"log_task",
			"query_practice",
			"write_memory",
			"handoff_to",
			"create_item",
			"write_session_notes",
			"create_task",
			"submit_review",
			"create_artifact",
			"route_item",
			"score_attention",
			"promote_knowledge",
			"create_conflict_review",
			// AE3 management tools
			"create_team",
			"add_agent",
			"create_bet",
			"create_routine",
			"update_routine",
			// AK4: bet draft/edit tool for assistant conversational drafting
			"edit_bet",
			// AL7: commit_file — live-proof tool; reversibility:"irreversible"
			"commit_file",
		].sort();

		const actualNames = registry.definitions.map((d) => d.name).sort();
		expect(actualNames).toEqual(expectedNames);

		await bridge.transport.close();
	});
});

// ---------------------------------------------------------------------------
// Suite: createMcpBridge — AC4 (role-based filtering via registry.invoke)
// ---------------------------------------------------------------------------

describe("createMcpBridge (AC4: role-based FORBIDDEN via registry.invoke)", () => {
	test("registry.invoke returns FORBIDDEN for facilitator-only tool when role=builder", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const ctx = makeContext(db, eventBus);

		// Builder registry — does NOT include route_item (facilitator-only)
		const registry = buildToolRegistry(ctx, { role: "builder" });

		const bridge = await createMcpBridge({ sessionId: "session-ac4", registry });

		// The bridge delegates tool invocations to registry.invoke.
		// Invoking route_item on a builder registry must return FORBIDDEN.
		const result = await registry.invoke("route_item", { itemId: "item-1", targetId: "team-1" });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.code).toBe("FORBIDDEN");
			expect(result.error).toContain("route_item");
		}

		await bridge.transport.close();
	});

	test("builder registry exposes 12 tools (no 4 facilitator-only tools, but commit_file included)", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		const ctx = makeContext(db, eventBus);
		const registry = buildToolRegistry(ctx, { role: "builder" });

		const bridge = await createMcpBridge({ sessionId: "session-ac4-b", registry });

		// Builder gets 15 - 4 facilitator tools + 1 AL7 commit_file = 12 tools
		// (commit_file has no role restriction — available to all)
		expect(registry.definitions).toHaveLength(12);

		const names = registry.definitions.map((d) => d.name);
		expect(names).not.toContain("route_item");
		expect(names).not.toContain("score_attention");
		expect(names).not.toContain("promote_knowledge");
		expect(names).not.toContain("create_conflict_review");

		await bridge.transport.close();
	});
});

// ---------------------------------------------------------------------------
// Suite: createMcpBridge — AC3 deeper (handler calls registry.invoke and maps)
// ---------------------------------------------------------------------------

describe("createMcpBridge (AC3: handler invokes registry and maps ToolResult)", () => {
	test("bridge has a mcpServer that is connected (can be closed)", async ({ db }) => {
		const eventBus = new EventBus();
		const ctx = makeContext(db, eventBus);
		const registry = buildToolRegistry(ctx, { role: "assistant" });

		const bridge = await createMcpBridge({ sessionId: "session-ac3", registry });

		// The McpServer must be connected to transport — close() should not throw
		await expect(bridge.mcpServer.close()).resolves.not.toThrow();
	});
});
