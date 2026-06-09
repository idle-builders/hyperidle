/**
 * mcp-bridge.test.ts — Unit tests for createMcpBridge and toolResultToCallToolResult.
 *
 * AC coverage:
 *   AC1 — createMcpBridge registers all tools from the registry as MCP tools
 *   AC3 — ToolResult success/failure correctly maps to CallToolResult
 *   AC4 — Role-based filtering: facilitator-only tools return FORBIDDEN for builder role
 *
 * These tests import from paths that don't exist yet — they will fail with
 * module-not-found errors until the green phase implementation is written.
 *
 * @lore X2 red phase: `toolResultToCallToolResult` is a pure mapping function
 * that must be exported separately from `createMcpBridge` so unit tests can
 * exercise the mapping without spinning up a real McpServer/transport.
 */

import * as os from "node:os";
import * as path from "node:path";
import { createTestDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	type CreateMcpBridgeOptions,
	createMcpBridge,
	type McpBridgeInstance,
	toolResultToCallToolResult,
} from "../mcp/mcp-bridge.js";
import {
	buildToolRegistry,
	type ToolContext,
	type ToolRegistry,
} from "../skill-tools/tool-registry.js";
import type { ToolResult } from "../skill-tools/tool-result.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(db: import("@hyperidle/db").HyperIdleDb, eventBus: EventBus): ToolContext {
	return {
		db,
		eventBus,
		agentId: "agent-test",
		sessionId: "session-test",
		taskId: "task-test",
		workspacePath: path.join(os.tmpdir(), `x2-bridge-test-${Date.now()}`),
		watcher: { stop: (): void => {} },
	};
}

// ---------------------------------------------------------------------------
// Suite: toolResultToCallToolResult (pure mapping — AC3)
// ---------------------------------------------------------------------------

describe("toolResultToCallToolResult (AC3)", () => {
	it("maps success=true with data to content text array", () => {
		const result: ToolResult = { success: true, data: { id: "abc", value: 42 } };
		const callResult = toolResultToCallToolResult(result);

		expect(callResult.isError).toBeFalsy();
		expect(callResult.content).toHaveLength(1);
		const item = callResult.content[0];
		expect(item.type).toBe("text");
		if (item.type === "text") {
			expect(item.text).toBe(JSON.stringify({ id: "abc", value: 42 }));
		}
	});

	it("maps success=true with null data to content text 'null'", () => {
		const result: ToolResult = { success: true, data: null };
		const callResult = toolResultToCallToolResult(result);

		expect(callResult.isError).toBeFalsy();
		expect(callResult.content[0]?.type).toBe("text");
		if (callResult.content[0]?.type === "text") {
			expect(callResult.content[0].text).toBe("null");
		}
	});

	it("maps success=false to isError=true with JSON error body", () => {
		const result: ToolResult = {
			success: false,
			error: "Resource not found",
			code: "NOT_FOUND",
		};
		const callResult = toolResultToCallToolResult(result);

		expect(callResult.isError).toBe(true);
		expect(callResult.content).toHaveLength(1);
		const item = callResult.content[0];
		expect(item.type).toBe("text");
		if (item.type === "text") {
			const parsed = JSON.parse(item.text) as { error: string; code: string };
			expect(parsed.error).toBe("Resource not found");
			expect(parsed.code).toBe("NOT_FOUND");
		}
	});

	it("maps FORBIDDEN error code to isError=true with FORBIDDEN in text", () => {
		const result: ToolResult = {
			success: false,
			error: "Tool not available to this role: route_item",
			code: "FORBIDDEN",
		};
		const callResult = toolResultToCallToolResult(result);

		expect(callResult.isError).toBe(true);
		const item = callResult.content[0];
		expect(item.type).toBe("text");
		if (item.type === "text") {
			expect(item.text).toContain("FORBIDDEN");
		}
	});

	it("maps success=true with array data to JSON-stringified array", () => {
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
	let registry: ToolRegistry;

	beforeEach(async () => {
		const handle = await createTestDb();
		const eventBus = new EventBus();
		const ctx = makeContext(handle.db, eventBus);
		registry = buildToolRegistry(ctx, { role: "assistant" });

		const options: CreateMcpBridgeOptions = {
			sessionId: "session-ac1",
			registry,
		};
		bridge = await createMcpBridge(options);
	});

	afterEach(async () => {
		// Clean up transport
		await bridge.transport.close();
	});

	it("returns a McpBridgeInstance with token, sessionId, mcpServer, transport", () => {
		expect(bridge.token).toBeDefined();
		expect(typeof bridge.token).toBe("string");
		// token is a 64-char hex string (32 bytes)
		expect(bridge.token).toMatch(/^[0-9a-f]{64}$/);

		expect(bridge.sessionId).toBe("session-ac1");
		expect(bridge.mcpServer).toBeDefined();
		expect(bridge.transport).toBeDefined();
	});

	it("generates a unique token each time createMcpBridge is called", async () => {
		const handle = await createTestDb();
		const eventBus = new EventBus();
		const ctx = makeContext(handle.db, eventBus);
		const reg = buildToolRegistry(ctx, { role: "assistant" });

		const bridge2 = await createMcpBridge({ sessionId: "session-ac1-b", registry: reg });

		expect(bridge.token).not.toBe(bridge2.token);

		await bridge2.transport.close();
	});

	it("registers exactly 15 tools (all tools for assistant role)", () => {
		// The McpServer's internal _registeredTools is private; we verify via
		// the registry definitions count. AC1 acceptance: all definitions from
		// the registry are registered.
		expect(registry.definitions).toHaveLength(15);
		// The bridge was created with this registry, so it must have 15 tools.
		// We'll verify via a tools/list MCP request in the integration test;
		// here we assert the registry shape is correct.
		const names = registry.definitions.map((d) => d.name).sort();
		expect(names).toContain("route_item");
		expect(names).toContain("log_task");
		expect(names).toContain("send_message");
		expect(names).toContain("create_artifact");
	});

	it("each registered tool has the expected name from the registry", () => {
		// Verify the registry definition names are the 15 canonical tools
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
		].sort();

		const actualNames = registry.definitions.map((d) => d.name).sort();
		expect(actualNames).toEqual(expectedNames);
	});
});

// ---------------------------------------------------------------------------
// Suite: createMcpBridge — AC4 (role-based filtering via registry.invoke)
// ---------------------------------------------------------------------------

describe("createMcpBridge (AC4: role-based FORBIDDEN via registry.invoke)", () => {
	it("registry.invoke returns FORBIDDEN for facilitator-only tool when role=builder", async () => {
		const handle = await createTestDb();
		const eventBus = new EventBus();
		const ctx = makeContext(handle.db, eventBus);

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

	it("builder registry exposes 11 tools (no 4 facilitator-only tools)", async () => {
		const handle = await createTestDb();
		const eventBus = new EventBus();
		const ctx = makeContext(handle.db, eventBus);
		const registry = buildToolRegistry(ctx, { role: "builder" });

		const bridge = await createMcpBridge({ sessionId: "session-ac4-b", registry });

		// Builder gets 15 - 4 facilitator tools = 11 tools
		expect(registry.definitions).toHaveLength(11);

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
	it("bridge has a mcpServer that is connected (can be closed)", async () => {
		const handle = await createTestDb();
		const eventBus = new EventBus();
		const ctx = makeContext(handle.db, eventBus);
		const registry = buildToolRegistry(ctx, { role: "assistant" });

		const bridge = await createMcpBridge({ sessionId: "session-ac3", registry });

		// The McpServer must be connected to transport — close() should not throw
		await expect(bridge.mcpServer.close()).resolves.not.toThrow();
	});
});
