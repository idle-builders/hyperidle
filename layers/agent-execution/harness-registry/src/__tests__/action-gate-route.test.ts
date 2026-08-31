/**
 * Unit tests for the /action-check MCP route.
 *
 * Covers:
 *   - 401 for unknown token (no session registered)
 *   - 401 when Authorization header does not match Bearer <token>
 *   - "allow" when actionGate is absent (no gate wired)
 *   - "allow" when session has no matching rules
 *   - "deny" when a rule matches, with the rule's description as reason
 *   - "deny" (fail-closed) when request body is malformed / not JSON
 */

import type { ToolRegistry } from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import { createActionGateStore } from "../action-gate-store.js";
import { createMcpToolBridge } from "../mcp-tool-bridge.js";

const registry: ToolRegistry = {
	definitions: [],
	invoke: async () => ({ success: false, code: "NOT_FOUND", error: "none" }),
	toClaudeToolSpecs: () => [],
};

async function postActionCheck(
	router: import("hono").Hono,
	token: string,
	opts: { auth?: string; body?: unknown } = {},
) {
	const auth = opts.auth ?? `Bearer ${token}`;
	const body = opts.body !== undefined ? JSON.stringify(opts.body) : JSON.stringify({ tool_name: "Write" });
	return router.request(`/mcp/${token}/action-check`, {
		method: "POST",
		headers: { Authorization: auth, "Content-Type": "application/json" },
		body,
	});
}

describe("/mcp/:token/action-check route", () => {
	it("returns 401 for an unknown token", async () => {
		const bridge = createMcpToolBridge();
		const res = await postActionCheck(bridge.router, "ghost-token");
		expect(res.status).toBe(401);
	});

	it("returns 401 when Bearer credential does not match the token", async () => {
		const gate = createActionGateStore();
		const bridge = createMcpToolBridge({ actionGate: gate });
		const { token } = await bridge.open({ sessionId: "s-auth", registry });

		for (const bad of ["", `Basic ${token}`, `Bearer wrong`, `bearer ${token}`]) {
			const res = await postActionCheck(bridge.router, token, { auth: bad });
			expect(res.status, `expected 401 for auth='${bad}'`).toBe(401);
		}
	});

	it("returns allow when no actionGate is wired", async () => {
		// No gate supplied to createMcpToolBridge
		const bridge = createMcpToolBridge();
		const { token } = await bridge.open({ sessionId: "s-nogate", registry });
		const res = await postActionCheck(bridge.router, token);
		expect(res.status).toBe(200);
		const body = await res.json() as { decision: string };
		expect(body.decision).toBe("allow");
	});

	it("returns allow when session has no matching rules", async () => {
		const gate = createActionGateStore();
		const bridge = createMcpToolBridge({ actionGate: gate });
		const { token } = await bridge.open({ sessionId: "s-norules", registry });
		// No rules set for this session
		const res = await postActionCheck(bridge.router, token, { body: { tool_name: "Write" } });
		expect(res.status).toBe(200);
		const body = await res.json() as { decision: string };
		expect(body.decision).toBe("allow");
	});

	it("returns deny with the rule's description when a rule matches", async () => {
		const gate = createActionGateStore();
		gate.set("s-deny", [{ id: "r1", pattern: "*", description: "All tools require approval" }]);
		const bridge = createMcpToolBridge({ actionGate: gate });
		const { token } = await bridge.open({ sessionId: "s-deny", registry });

		const res = await postActionCheck(bridge.router, token, { body: { tool_name: "Bash" } });
		expect(res.status).toBe(200);
		const body = await res.json() as { decision: string; reason?: string };
		expect(body.decision).toBe("deny");
		expect(body.reason).toBe("All tools require approval");
	});

	it("returns allow when tool name does not match any rule", async () => {
		const gate = createActionGateStore();
		gate.set("s-partial", [{ id: "r1", pattern: "bash", description: "no bash" }]);
		const bridge = createMcpToolBridge({ actionGate: gate });
		const { token } = await bridge.open({ sessionId: "s-partial", registry });

		const res = await postActionCheck(bridge.router, token, { body: { tool_name: "Write" } });
		expect(res.status).toBe(200);
		const body = await res.json() as { decision: string };
		expect(body.decision).toBe("allow");
	});

	it("fails closed (deny) when the request body is malformed JSON", async () => {
		const gate = createActionGateStore();
		const bridge = createMcpToolBridge({ actionGate: gate });
		const { token } = await bridge.open({ sessionId: "s-malformed", registry });

		const res = await bridge.router.request(`/mcp/${token}/action-check`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
			body: "not-json{{{",
		});
		expect(res.status).toBe(200);
		const body = await res.json() as { decision: string };
		expect(body.decision).toBe("deny");
	});

	it("token is revoked after close — subsequent checks return 401", async () => {
		const gate = createActionGateStore();
		const bridge = createMcpToolBridge({ actionGate: gate });
		const { token } = await bridge.open({ sessionId: "s-revoke", registry });

		await bridge.close(token);
		const res = await postActionCheck(bridge.router, token);
		expect(res.status).toBe(401);
	});
});
