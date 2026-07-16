/**
 * mcp-bridge-registry.test.ts — Unit tests for McpBridgeRegistry.
 *
 * AC coverage:
 *   AC2 (partial) — register/lookup by token maps to the correct bridge instance
 *   AC5 (partial) — unregister removes the bridge (size goes to 0)
 *
 * Demoted from mcp-bridge-registry.integration.test.ts (AR6): pure registry unit,
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
	createMcpBridge,
	createMcpBridgeRegistry,
	type McpBridgeInstance,
} from "@hyperidle/mcp-provider";
import { EventBus, type ToolContext } from "@hyperidle/shared";
import { buildToolRegistry } from "../services/tool-provider-bindings.js";
import { describe, expect, test, vi } from "../test-fixtures.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(db: HyperIdleDb, eventBus: EventBus): ToolContext<HyperIdleDb> {
	return {
		db,
		eventBus,
		agentId: "agent-reg-test",
		sessionId: "session-reg-test",
		taskId: "task-reg-test",
		sandboxPath: path.join(os.tmpdir(), `x2-registry-test-${Date.now()}`),
		ingestion: { dispose: (): void => {} },
	};
}

async function makeBridge(db: HyperIdleDb, sessionId: string): Promise<McpBridgeInstance> {
	const eventBus = new EventBus();
	const ctx = makeContext(db, eventBus);
	const registry = buildToolRegistry(ctx, { role: "builder" });
	return createMcpBridge({ sessionId, registry });
}

// ---------------------------------------------------------------------------
// Suite: createMcpBridgeRegistry — basic lifecycle
// ---------------------------------------------------------------------------

describe("createMcpBridgeRegistry", () => {
	test("returns a registry with size=0 initially", () => {
		const registry = createMcpBridgeRegistry();
		expect(registry.size).toBe(0);
	});

	test("exposes register, lookup, unregister, handleRequest, size", () => {
		const registry = createMcpBridgeRegistry();
		expect(typeof registry.register).toBe("function");
		expect(typeof registry.lookup).toBe("function");
		expect(typeof registry.unregister).toBe("function");
		expect(typeof registry.handleRequest).toBe("function");
		expect(typeof registry.size).toBe("number");
	});
});

// ---------------------------------------------------------------------------
// Suite: register / lookup lifecycle
// ---------------------------------------------------------------------------

describe("McpBridgeRegistry register + lookup (AC2)", () => {
	test("lookup returns undefined for unknown token", () => {
		const registry = createMcpBridgeRegistry();
		const found = registry.lookup("does-not-exist");
		expect(found).toBeUndefined();
	});

	test("register increases size by 1", async ({ db }) => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge(db, "session-lookup-1");
		registry.register(bridge);
		expect(registry.size).toBe(1);
		await bridge.transport.close();
	});

	test("lookup returns the registered bridge by token", async ({ db }) => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge(db, "session-lookup-2");
		registry.register(bridge);
		const found = registry.lookup(bridge.token);
		expect(found).toBe(bridge);
		expect(found?.sessionId).toBe("session-lookup-2");
		await bridge.transport.close();
	});

	test("lookup returns undefined for a different token", async ({ db }) => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge(db, "session-lookup-3");
		registry.register(bridge);
		const found = registry.lookup(
			"000000000000000000000000000000000000000000000000000000000000dead",
		);
		expect(found).toBeUndefined();
		await bridge.transport.close();
	});

	test("can register multiple bridges independently", async ({ db }) => {
		const registry = createMcpBridgeRegistry();
		const bridge1 = await makeBridge(db, "session-lookup-multi-1");
		const bridge2 = await makeBridge(db, "session-lookup-multi-2");
		registry.register(bridge1);
		registry.register(bridge2);

		expect(registry.size).toBe(2);
		expect(registry.lookup(bridge1.token)?.sessionId).toBe("session-lookup-multi-1");
		expect(registry.lookup(bridge2.token)?.sessionId).toBe("session-lookup-multi-2");

		await bridge1.transport.close();
		await bridge2.transport.close();
	});
});

// ---------------------------------------------------------------------------
// Suite: unregister lifecycle
// ---------------------------------------------------------------------------

describe("McpBridgeRegistry unregister (AC5 partial)", () => {
	test("unregister removes bridge so lookup returns undefined", async ({ db }) => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge(db, "session-unreg-1");

		registry.register(bridge);
		expect(registry.size).toBe(1);

		await registry.unregister(bridge.token);

		expect(registry.size).toBe(0);
		expect(registry.lookup(bridge.token)).toBeUndefined();
	});

	test("unregister is a no-op for unknown token (does not throw)", async () => {
		const registry = createMcpBridgeRegistry();
		await expect(registry.unregister("nonexistent-token")).resolves.not.toThrow();
		expect(registry.size).toBe(0);
	});

	test("unregister calls transport.close()", async ({ db }) => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge(db, "session-unreg-close");

		const closeSpy = vi.spyOn(bridge.transport, "close").mockResolvedValue(undefined);

		registry.register(bridge);
		await registry.unregister(bridge.token);

		expect(closeSpy).toHaveBeenCalledOnce();
	});

	test("unregister calls mcpServer.close()", async ({ db }) => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge(db, "session-unreg-mcp-close");

		const mcpCloseSpy = vi.spyOn(bridge.mcpServer, "close").mockResolvedValue(undefined);

		registry.register(bridge);
		await registry.unregister(bridge.token);

		expect(mcpCloseSpy).toHaveBeenCalledOnce();
	});

	// Critique warning: crash-path teardown — unregister must be called
	// before BOTH endSession() and crashSession() paths.
	test("unregister before endSession path: bridge is removed before normal session end", async ({
		db,
	}) => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge(db, "session-end-path");

		registry.register(bridge);
		expect(registry.size).toBe(1);

		// Simulate what session-provisioning will do in Phase 11 (endSession path)
		await registry.unregister(bridge.token);

		expect(registry.size).toBe(0);
		// After teardown, requests must return 401
		const req = new Request(`http://localhost/api/mcp/${bridge.token}`, { method: "POST" });
		const res = await registry.handleRequest(bridge.token, req);
		expect(res.status).toBe(401);
	});

	test("unregister before crashSession path: bridge is removed before crash teardown", async ({
		db,
	}) => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge(db, "session-crash-path");

		registry.register(bridge);
		expect(registry.size).toBe(1);

		// Simulate what session-provisioning will do in Phase 11 (crashSession path)
		await registry.unregister(bridge.token);

		expect(registry.size).toBe(0);
		expect(registry.lookup(bridge.token)).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Suite: handleRequest routing (AC2 partial)
// ---------------------------------------------------------------------------

describe("McpBridgeRegistry handleRequest (AC2)", () => {
	test("returns 401 for unknown token", async () => {
		const registry = createMcpBridgeRegistry();
		const req = new Request("http://localhost/api/mcp/badtoken", { method: "POST" });
		const res = await registry.handleRequest("badtoken", req);

		expect(res.status).toBe(401);
	});

	test("returns 401 for empty token", async () => {
		const registry = createMcpBridgeRegistry();
		const req = new Request("http://localhost/api/mcp/", { method: "POST" });
		const res = await registry.handleRequest("", req);

		expect(res.status).toBe(401);
	});

	test("delegates to transport.handleRequest for a registered bridge", async ({ db }) => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge(db, "session-handle-req");

		// Mock transport.handleRequest to track delegation
		const mockResponse = new Response("ok", { status: 200 });
		const handleSpy = vi.spyOn(bridge.transport, "handleRequest").mockResolvedValue(mockResponse);

		registry.register(bridge);

		const req = new Request(`http://localhost/api/mcp/${bridge.token}`, { method: "POST" });
		const res = await registry.handleRequest(bridge.token, req);

		expect(handleSpy).toHaveBeenCalledOnce();
		expect(handleSpy).toHaveBeenCalledWith(req);
		expect(res.status).toBe(200);
	});

	test("returns 401 after unregister (token no longer valid)", async ({ db }) => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge(db, "session-post-unreg");

		vi.spyOn(bridge.transport, "close").mockResolvedValue(undefined);
		vi.spyOn(bridge.mcpServer, "close").mockResolvedValue(undefined);

		registry.register(bridge);
		await registry.unregister(bridge.token);

		const req = new Request(`http://localhost/api/mcp/${bridge.token}`, { method: "POST" });
		const res = await registry.handleRequest(bridge.token, req);

		expect(res.status).toBe(401);
	});
});
