/**
 * mcp-bridge-registry.test.ts — Unit tests for McpBridgeRegistry.
 *
 * AC coverage:
 *   AC2 (partial) — register/lookup by token maps to the correct bridge instance
 *   AC5 (partial) — unregister removes the bridge (size goes to 0)
 *
 * Critique warning — crash-path cleanup:
 *   Tests both teardown paths: unregister before endSession AND before crashSession.
 *
 * These tests import from paths that don't exist yet — they will fail until
 * the green phase implementation is written.
 */

import * as os from "node:os";
import * as path from "node:path";
import { createTestDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpBridge, type McpBridgeInstance } from "../mcp/mcp-bridge.js";
import { createMcpBridgeRegistry, type McpBridgeRegistry } from "../mcp/mcp-bridge-registry.js";
import { buildToolRegistry, type ToolContext } from "../tools/tool-registry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(db: import("@hyperidle/db").HyperIdleDb, eventBus: EventBus): ToolContext {
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

async function makeBridge(sessionId: string): Promise<McpBridgeInstance> {
	const handle = await createTestDb();
	const eventBus = new EventBus();
	const ctx = makeContext(handle.db, eventBus);
	const registry = buildToolRegistry(ctx, { role: "builder" });
	return createMcpBridge({ sessionId, registry });
}

// ---------------------------------------------------------------------------
// Suite: createMcpBridgeRegistry — basic lifecycle
// ---------------------------------------------------------------------------

describe("createMcpBridgeRegistry", () => {
	it("returns a registry with size=0 initially", () => {
		const registry = createMcpBridgeRegistry();
		expect(registry.size).toBe(0);
	});

	it("exposes register, lookup, unregister, handleRequest, size", () => {
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
	let registry: McpBridgeRegistry;
	let bridge: McpBridgeInstance;

	beforeEach(async () => {
		registry = createMcpBridgeRegistry();
		bridge = await makeBridge("session-lookup-1");
	});

	it("lookup returns undefined for unknown token", () => {
		const found = registry.lookup("does-not-exist");
		expect(found).toBeUndefined();
	});

	it("register increases size by 1", () => {
		registry.register(bridge);
		expect(registry.size).toBe(1);
	});

	it("lookup returns the registered bridge by token", () => {
		registry.register(bridge);
		const found = registry.lookup(bridge.token);
		expect(found).toBe(bridge);
		expect(found?.sessionId).toBe("session-lookup-1");
	});

	it("lookup returns undefined for a different token", () => {
		registry.register(bridge);
		const found = registry.lookup(
			"000000000000000000000000000000000000000000000000000000000000dead",
		);
		expect(found).toBeUndefined();
	});

	it("can register multiple bridges independently", async () => {
		const bridge2 = await makeBridge("session-lookup-2");
		registry.register(bridge);
		registry.register(bridge2);

		expect(registry.size).toBe(2);
		expect(registry.lookup(bridge.token)?.sessionId).toBe("session-lookup-1");
		expect(registry.lookup(bridge2.token)?.sessionId).toBe("session-lookup-2");

		await bridge2.transport.close();
	});
});

// ---------------------------------------------------------------------------
// Suite: unregister lifecycle
// ---------------------------------------------------------------------------

describe("McpBridgeRegistry unregister (AC5 partial)", () => {
	it("unregister removes bridge so lookup returns undefined", async () => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge("session-unreg-1");

		registry.register(bridge);
		expect(registry.size).toBe(1);

		await registry.unregister(bridge.token);

		expect(registry.size).toBe(0);
		expect(registry.lookup(bridge.token)).toBeUndefined();
	});

	it("unregister is a no-op for unknown token (does not throw)", async () => {
		const registry = createMcpBridgeRegistry();
		await expect(registry.unregister("nonexistent-token")).resolves.not.toThrow();
		expect(registry.size).toBe(0);
	});

	it("unregister calls transport.close()", async () => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge("session-unreg-close");

		const closeSpy = vi.spyOn(bridge.transport, "close").mockResolvedValue(undefined);

		registry.register(bridge);
		await registry.unregister(bridge.token);

		expect(closeSpy).toHaveBeenCalledOnce();
	});

	it("unregister calls mcpServer.close()", async () => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge("session-unreg-mcp-close");

		const mcpCloseSpy = vi.spyOn(bridge.mcpServer, "close").mockResolvedValue(undefined);

		registry.register(bridge);
		await registry.unregister(bridge.token);

		expect(mcpCloseSpy).toHaveBeenCalledOnce();
	});

	// Critique warning: crash-path teardown — unregister must be called
	// before BOTH endSession() and crashSession() paths.
	it("unregister before endSession path: bridge is removed before normal session end", async () => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge("session-end-path");

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

	it("unregister before crashSession path: bridge is removed before crash teardown", async () => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge("session-crash-path");

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
	it("returns 401 for unknown token", async () => {
		const registry = createMcpBridgeRegistry();
		const req = new Request("http://localhost/api/mcp/badtoken", { method: "POST" });
		const res = await registry.handleRequest("badtoken", req);

		expect(res.status).toBe(401);
	});

	it("returns 401 for empty token", async () => {
		const registry = createMcpBridgeRegistry();
		const req = new Request("http://localhost/api/mcp/", { method: "POST" });
		const res = await registry.handleRequest("", req);

		expect(res.status).toBe(401);
	});

	it("delegates to transport.handleRequest for a registered bridge", async () => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge("session-handle-req");

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

	it("returns 401 after unregister (token no longer valid)", async () => {
		const registry = createMcpBridgeRegistry();
		const bridge = await makeBridge("session-post-unreg");

		vi.spyOn(bridge.transport, "close").mockResolvedValue(undefined);
		vi.spyOn(bridge.mcpServer, "close").mockResolvedValue(undefined);

		registry.register(bridge);
		await registry.unregister(bridge.token);

		const req = new Request(`http://localhost/api/mcp/${bridge.token}`, { method: "POST" });
		const res = await registry.handleRequest(bridge.token, req);

		expect(res.status).toBe(401);
	});
});
