/**
 * mcp-route.test.ts — HTTP route unit tests for createMcpRoute.
 *
 * Tests the Hono sub-router in isolation — delegates to registry.handleRequest,
 * forwards the token from the URL, and passes through the raw Response.
 *
 * Integration tests (real MCP tool calls through the production bridge) live in
 * packages/server/src/harness/__tests__/AL7-two-session-trust-first.integration.test.ts
 * and packages/server/src/mcp/__tests__/mcp-bridge-stateful.integration.test.ts (T0b).
 */

import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { McpBridgeRegistry } from "@hyperidle/agent-layer";
import { createMcpRoute } from "../../services/mcp-route.js";

function makeMockRegistry(response: Response): McpBridgeRegistry {
	return {
		register: vi.fn(),
		lookup: vi.fn(),
		unregister: vi.fn(),
		handleRequest: vi.fn().mockResolvedValue(response),
		get size() {
			return 0;
		},
	};
}

describe("createMcpRoute", () => {
	it("routes ALL /mcp/:token to registry.handleRequest with the correct token", async () => {
		const mockResponse = new Response("ok", { status: 200 });
		const registry = makeMockRegistry(mockResponse);
		const router = createMcpRoute(registry);

		// Mount on a parent app (mirrors server-factory usage)
		const app = new Hono();
		app.route("/api", router);

		const res = await app.request("/api/mcp/abc123", { method: "POST", body: "{}" });

		expect(registry.handleRequest).toHaveBeenCalledOnce();
		expect(registry.handleRequest).toHaveBeenCalledWith("abc123", expect.any(Request));
		expect(res.status).toBe(200);
	});

	it("forwards 401 from registry for unknown token", async () => {
		const mockResponse = new Response("Unauthorized", { status: 401 });
		const registry = makeMockRegistry(mockResponse);
		const router = createMcpRoute(registry);

		const app = new Hono();
		app.route("/api", router);

		const res = await app.request("/api/mcp/unknown-token", { method: "POST" });

		expect(res.status).toBe(401);
	});

	it("supports GET requests (ALL handler)", async () => {
		const mockResponse = new Response("ok", { status: 200 });
		const registry = makeMockRegistry(mockResponse);
		const router = createMcpRoute(registry);

		const app = new Hono();
		app.route("/api", router);

		const res = await app.request("/api/mcp/sometoken", { method: "GET" });

		expect(registry.handleRequest).toHaveBeenCalledOnce();
		expect(res.status).toBe(200);
	});
});
