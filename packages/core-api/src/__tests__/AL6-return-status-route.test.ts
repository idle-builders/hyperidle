/**
 * AL6 CRIT-1 — Integration tests for POST /api/mcp/:token/return-status.
 *
 * These tests prove the REAL route → registry link:
 *   POST /api/mcp/:token/return-status
 *   → bridgeRegistry.lookup(token) → { sessionId }
 *   → enforcementRegistry.get(sessionId) → entry
 *   → shouldForceReturn(entry.gate, entry.forceCount) → forceMessage or null
 *   → if forceMessage: incrementForce + return body = forceMessage
 *   → if null: return empty body 200
 *
 * Tests FAIL if:
 *   - The route is deleted from mcp-route.ts
 *   - The bridge registry lookup fails
 *   - The enforcement registry is not wired
 *   - shouldForceReturn is not called with the registry's gate/forceCount
 *
 * @lore AL6 CRIT-1: The route is mounted via createApp({ registerMcpRoute }) and
 * must be registered BEFORE the auth middleware (it uses the token in the URL, not
 * the X-API-Key). The test creates isolated bridge/enforcement registries per test
 * to avoid cross-test pollution (unlike the process singleton in production).
 *
 * @lore AL6 CRIT-1 bridge-stub: The route only needs bridge.sessionId from the
 * McpBridgeInstance. We register a minimal stub object (just token + sessionId)
 * into the bridge registry — no need for a real McpServer or transport.
 */

import type { EnforcementRegistry } from "@hyperidle/harness-registry";
import { createEnforcementRegistry } from "@hyperidle/harness-registry";
import type { McpBridgeInstance, McpBridgeRegistry } from "@hyperidle/harness-registry/mcp";
import { createMcpBridgeRegistry, createMcpRoute } from "@hyperidle/harness-registry/mcp";
import { AL6_FORCE_RETURN_MESSAGE, AL6_MAX_FORCE_RETURNS } from "@hyperidle/shared";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it as test } from "vitest";

// ── Bridge stub ───────────────────────────────────────────────────────────────
// The /return-status route only reads bridge.sessionId; the rest of
// McpBridgeInstance (mcpServer, transport) is not used by this route.
function registerFakeBridge(
	bridgeRegistry: McpBridgeRegistry,
	opts: { token: string; sessionId: string },
): void {
	bridgeRegistry.register({
		token: opts.token,
		sessionId: opts.sessionId,
		// These are not used by the /return-status route — the route only calls lookup().
		mcpServer: null as unknown as McpBridgeInstance["mcpServer"],
		transport: null as unknown as McpBridgeInstance["transport"],
	});
}

// ── Hono app builder for isolated tests ──────────────────────────────────────
function buildTestApp(
	bridgeRegistry: McpBridgeRegistry,
	enforcementReg: EnforcementRegistry,
): Hono {
	const app = new Hono();
	const api = new Hono();

	// Register the MCP route BEFORE any auth middleware (same as production in app.ts).
	// The route authenticates via the bearer token in the URL path.
	const mcpRouter = createMcpRoute(bridgeRegistry, enforcementReg);
	api.route("/", mcpRouter);

	app.route("/api", api);
	return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AL6 CRIT-1 — POST /api/mcp/:token/return-status route integration", () => {
	let bridgeRegistry: McpBridgeRegistry;
	let enforcementReg: EnforcementRegistry;
	let token: string;
	let sessionId: string;

	beforeEach(() => {
		bridgeRegistry = createMcpBridgeRegistry();
		enforcementReg = createEnforcementRegistry();
		token = `test-token-${Math.random().toString(36).slice(2, 18)}`;
		sessionId = `test-session-${Math.random().toString(36).slice(2, 18)}`;
	});

	afterEach(() => {
		enforcementReg.unregister(sessionId);
	});

	test("returns forceMessage body when gate.returned=false and budget left (block signal)", async () => {
		// Arrange: session registered with no return yet, forceCount=0, budget=2.
		registerFakeBridge(bridgeRegistry, { token, sessionId });
		const gate = { returned: false };
		enforcementReg.register(sessionId, { gate, forceCount: 0, exempt: false });

		const app = buildTestApp(bridgeRegistry, enforcementReg);

		// Act: POST to the real route with Bearer auth.
		const res = await app.request(`/api/mcp/${token}/return-status`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: "{}",
		});

		// Assert: 200 with forceMessage body → hook blocks the stop.
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toBe(AL6_FORCE_RETURN_MESSAGE);
	});

	test("increments enforcement registry forceCount when forceMessage is returned", async () => {
		// Verify the registry is mutated — this is what makes the test prove the real loop.
		registerFakeBridge(bridgeRegistry, { token, sessionId });
		const gate = { returned: false };
		enforcementReg.register(sessionId, { gate, forceCount: 0, exempt: false });

		const app = buildTestApp(bridgeRegistry, enforcementReg);

		// Pre-call: forceCount = 0.
		expect(enforcementReg.get(sessionId)?.forceCount).toBe(0);

		await app.request(`/api/mcp/${token}/return-status`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
		});

		// Post-call: forceCount = 1 (incrementForce was called by the route).
		expect(enforcementReg.get(sessionId)?.forceCount).toBe(1);
	});

	test("returns empty body when gate.returned=true (allow signal — no force)", async () => {
		// gate.returned=true means agent called a return action.
		registerFakeBridge(bridgeRegistry, { token, sessionId });
		const gate = { returned: true };
		enforcementReg.register(sessionId, { gate, forceCount: 0, exempt: false });

		const app = buildTestApp(bridgeRegistry, enforcementReg);

		const res = await app.request(`/api/mcp/${token}/return-status`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
		});

		// 200 with empty body → hook allows stop.
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toBe("");

		// forceCount must NOT be incremented (no force needed).
		expect(enforcementReg.get(sessionId)?.forceCount).toBe(0);
	});

	test("returns empty body when forceCount >= AL6_MAX_FORCE_RETURNS (budget exhausted)", async () => {
		// Budget exhausted → allow stop (drain-gate floor handles the not_returned outcome).
		registerFakeBridge(bridgeRegistry, { token, sessionId });
		const gate = { returned: false };
		// Pre-set forceCount to the max.
		enforcementReg.register(sessionId, {
			gate,
			forceCount: AL6_MAX_FORCE_RETURNS,
			exempt: false,
		});

		const app = buildTestApp(bridgeRegistry, enforcementReg);

		const res = await app.request(`/api/mcp/${token}/return-status`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
		});

		// 200 with empty body → budget exhausted, allow stop.
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toBe("");
	});

	test("returns 401 when Bearer token does not match URL token", async () => {
		// Belt-and-suspenders auth: the header must include the URL token.
		registerFakeBridge(bridgeRegistry, { token, sessionId });
		const gate = { returned: false };
		enforcementReg.register(sessionId, { gate, forceCount: 0, exempt: false });

		const app = buildTestApp(bridgeRegistry, enforcementReg);

		const res = await app.request(`/api/mcp/${token}/return-status`, {
			method: "POST",
			headers: { Authorization: "Bearer wrong-token-that-does-not-match" },
		});

		expect(res.status).toBe(401);
	});

	test("returns 200 empty body for unknown/expired token (session ended)", async () => {
		// Unknown token (bridge not registered) → allow stop.
		// This is the normal case when the session has already ended.
		const unknownToken = "unknown-token-not-in-registry";
		const app = buildTestApp(bridgeRegistry, enforcementReg);

		const res = await app.request(`/api/mcp/${unknownToken}/return-status`, {
			method: "POST",
			headers: { Authorization: `Bearer ${unknownToken}` },
		});

		// Route allows stop (session ended/unknown = safe to stop).
		expect(res.status).toBe(200);
	});

	test("does not force when session is exempt (internal-extraction drain)", async () => {
		// Exempt sessions bypass enforcement entirely.
		registerFakeBridge(bridgeRegistry, { token, sessionId });
		const gate = { returned: false };
		enforcementReg.register(sessionId, { gate, forceCount: 0, exempt: true });

		const app = buildTestApp(bridgeRegistry, enforcementReg);

		const res = await app.request(`/api/mcp/${token}/return-status`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
		});

		// 200 with empty body → exempt session, no force.
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toBe("");

		// forceCount must NOT be incremented.
		expect(enforcementReg.get(sessionId)?.forceCount).toBe(0);
	});

	test("returns 501 when enforcementRegistry not passed to createMcpRoute", async () => {
		// When the registry is absent, the route returns 501 Not Implemented.
		// This guards against mis-wired production setups.
		registerFakeBridge(bridgeRegistry, { token, sessionId });

		// Create the route WITHOUT the enforcement registry.
		const mcpRouterNoReg = createMcpRoute(bridgeRegistry, undefined);
		const app = new Hono();
		const api = new Hono();
		api.route("/", mcpRouterNoReg);
		app.route("/api", api);

		const res = await app.request(`/api/mcp/${token}/return-status`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
		});

		expect(res.status).toBe(501);
	});
});
