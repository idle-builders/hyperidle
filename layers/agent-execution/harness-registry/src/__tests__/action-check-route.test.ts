/**
 * Unit tests for the /mcp/:token/action-check HTTP route.
 *
 * The route is the PreToolUse hook endpoint. It:
 *   - validates Bearer auth
 *   - checks single-use clearances (consumed on match)
 *   - matches rules by case-insensitive substring of "toolName JSON(input)"
 *   - on match: sets pendingBlock, returns harness-specific deny JSON
 *   - on no match: returns harness-specific allow JSON
 *   - when gateRegistry absent: always allows (fail-open)
 *   - when session has no rules: always allows
 */

import type { ToolRegistry } from "@hyperidle/harness-protocol";
import { describe, expect, it } from "vitest";
import { createActionGateRegistry } from "../action-gate-registry.js";
import { createMcpToolBridge } from "../mcp-tool-bridge.js";

const registry: ToolRegistry = {
	definitions: [],
	invoke: async () => ({ success: false, code: "NOT_FOUND", error: "none" }),
	toClaudeToolSpecs: () => [],
};

function makeHookBody(toolName: string, toolInput: unknown = {}): string {
	return JSON.stringify({ tool_name: toolName, tool_input: toolInput });
}

async function postActionCheck(
	router: ReturnType<
		ReturnType<typeof createMcpToolBridge>["router"]["fetch"]
	> extends Promise<Response>
		? never
		: ReturnType<typeof createMcpToolBridge>["router"],
	token: string,
	body: string,
	harness = "generic",
	authToken?: string,
): Promise<Response> {
	const auth = authToken ?? token;
	return router.request(`/mcp/${token}/action-check?harness=${harness}`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${auth}`,
			"Content-Type": "application/json",
		},
		body,
	});
}

describe("/mcp/:token/action-check", () => {
	// ── Auth ───────────────────────────────────────────────────────────────

	it("returns 401 for unknown token", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const res = await bridge.router.request("/mcp/unknown/action-check", {
			method: "POST",
			headers: { authorization: "Bearer unknown" },
			body: makeHookBody("bash"),
		});
		expect(res.status).toBe(401);
	});

	it("returns 401 when bearer does not match token", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "auth-test", registry });

		const res = await bridge.router.request(`/mcp/${token}/action-check`, {
			method: "POST",
			headers: { authorization: "Bearer wrong-token" },
			body: makeHookBody("bash"),
		});
		expect(res.status).toBe(401);
		await bridge.close(token);
	});

	// ── Fail-open when no gate registry ────────────────────────────────────

	it("allows when no gateRegistry wired", async () => {
		const bridge = createMcpToolBridge(); // no gateRegistry
		const { token } = await bridge.open({ sessionId: "no-gate", registry });

		const res = await postActionCheck(bridge.router, token, makeHookBody("bash"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.decision).toBe("allow");
		await bridge.close(token);
	});

	// ── Fail-open when session has no rules ─────────────────────────────────

	it("allows when session has no rules registered", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "no-rules", registry });
		// register with empty rules
		gateReg.register("no-rules", { rules: [], sandboxPath: "/tmp" });

		const res = await postActionCheck(bridge.router, token, makeHookBody("bash"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.decision).toBe("allow");
		await bridge.close(token);
	});

	it("allows when session is not registered in gate registry", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "unregistered", registry });
		// intentionally NOT calling gateReg.register

		const res = await postActionCheck(bridge.router, token, makeHookBody("bash"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.decision).toBe("allow");
		await bridge.close(token);
	});

	// ── Rule matching ─────────────────────────────────────────────────────

	it("denies when tool name matches a rule pattern (exact)", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "deny-exact", registry });
		gateReg.register("deny-exact", {
			rules: [{ id: "r1", pattern: "bash", description: "Shell commands" }],
			sandboxPath: "/tmp",
		});

		const res = await postActionCheck(bridge.router, token, makeHookBody("bash"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.decision).toBe("deny");
		await bridge.close(token);
	});

	it("deny sets pendingBlock on the gate entry", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "pending", registry });
		gateReg.register("pending", {
			rules: [{ id: "r1", pattern: "write_file", description: "File write" }],
			sandboxPath: "/tmp",
		});

		await postActionCheck(bridge.router, token, makeHookBody("write_file", { path: "/etc/hosts" }));
		const entry = gateReg.get("pending");
		expect(entry?.pendingBlock).not.toBeNull();
		expect(entry?.pendingBlock?.ruleId).toBe("r1");
		expect(entry?.pendingBlock?.blockedTool).toBe("write_file");
		await bridge.close(token);
	});

	it("rule match is case-insensitive substring", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "case-test", registry });
		gateReg.register("case-test", {
			rules: [{ id: "r1", pattern: "BASH", description: "Shell" }],
			sandboxPath: "/tmp",
		});

		const res = await postActionCheck(bridge.router, token, makeHookBody("bash"));
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.decision).toBe("deny");
		await bridge.close(token);
	});

	it("allows when no rule pattern matches", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "no-match", registry });
		gateReg.register("no-match", {
			rules: [{ id: "r1", pattern: "bash", description: "Shell" }],
			sandboxPath: "/tmp",
		});

		const res = await postActionCheck(bridge.router, token, makeHookBody("read_file"));
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.decision).toBe("allow");
		await bridge.close(token);
	});

	it("matches pattern in tool input JSON (not just tool name)", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "input-match", registry });
		gateReg.register("input-match", {
			rules: [{ id: "r1", pattern: "/etc/passwd", description: "Sensitive file" }],
			sandboxPath: "/tmp",
		});

		const body = makeHookBody("read_file", { path: "/etc/passwd" });
		const res = await postActionCheck(bridge.router, token, body);
		const json = (await res.json()) as Record<string, unknown>;
		expect(json.decision).toBe("deny");
		await bridge.close(token);
	});

	// ── Single-use clearances ─────────────────────────────────────────────

	it("clearance allows the tool and is consumed (next call denied)", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "clearance", registry });
		gateReg.register("clearance", {
			rules: [{ id: "r1", pattern: "bash", description: "Shell" }],
			sandboxPath: "/tmp",
		});
		gateReg.addClearance("clearance", "bash");

		// First call: cleared
		const first = await postActionCheck(bridge.router, token, makeHookBody("bash"));
		const firstBody = (await first.json()) as Record<string, unknown>;
		expect(firstBody.decision).toBe("allow");

		// Second call: clearance consumed, now denied
		const second = await postActionCheck(bridge.router, token, makeHookBody("bash"));
		const secondBody = (await second.json()) as Record<string, unknown>;
		expect(secondBody.decision).toBe("deny");
		await bridge.close(token);
	});

	it("clearance is tool-name specific — other tools still denied", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "specific-clear", registry });
		gateReg.register("specific-clear", {
			rules: [{ id: "r1", pattern: "bash", description: "Shell" }],
			sandboxPath: "/tmp",
		});
		gateReg.addClearance("specific-clear", "write_file");

		// bash is not cleared — should be denied
		const res = await postActionCheck(bridge.router, token, makeHookBody("bash"));
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.decision).toBe("deny");
		await bridge.close(token);
	});

	// ── Harness-specific response formats ──────────────────────────────────

	it("claude format: allow returns hookSpecificOutput with permissionDecision=allow", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "claude-allow", registry });
		gateReg.register("claude-allow", { rules: [], sandboxPath: "/tmp" });

		const res = await postActionCheck(bridge.router, token, makeHookBody("read_file"), "claude");
		const body = (await res.json()) as Record<string, unknown>;
		const hso = body.hookSpecificOutput as Record<string, unknown>;
		expect(hso?.hookEventName).toBe("PreToolUse");
		expect(hso?.permissionDecision).toBe("allow");
		await bridge.close(token);
	});

	it("claude format: deny returns hookSpecificOutput with permissionDecision=deny", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "claude-deny", registry });
		gateReg.register("claude-deny", {
			rules: [{ id: "r1", pattern: "bash", description: "Shell" }],
			sandboxPath: "/tmp",
		});

		const res = await postActionCheck(bridge.router, token, makeHookBody("bash"), "claude");
		const body = (await res.json()) as Record<string, unknown>;
		const hso = body.hookSpecificOutput as Record<string, unknown>;
		expect(hso?.permissionDecision).toBe("deny");
		await bridge.close(token);
	});

	it("codex format: allow returns { decision: 'approve' }", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "codex-allow", registry });
		gateReg.register("codex-allow", { rules: [], sandboxPath: "/tmp" });

		const res = await postActionCheck(bridge.router, token, makeHookBody("read_file"), "codex");
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.decision).toBe("approve");
		await bridge.close(token);
	});

	it("codex format: deny returns { decision: 'block', reason }", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "codex-deny", registry });
		gateReg.register("codex-deny", {
			rules: [{ id: "r1", pattern: "bash", description: "Shell" }],
			sandboxPath: "/tmp",
		});

		const res = await postActionCheck(bridge.router, token, makeHookBody("bash"), "codex");
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.decision).toBe("block");
		expect(typeof body.reason).toBe("string");
		await bridge.close(token);
	});

	it("cursor format: allow returns { permission: 'allow' }", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "cursor-allow", registry });
		gateReg.register("cursor-allow", { rules: [], sandboxPath: "/tmp" });

		const res = await postActionCheck(bridge.router, token, makeHookBody("read_file"), "cursor");
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.permission).toBe("allow");
		await bridge.close(token);
	});

	it("cursor format: deny returns { permission: 'deny', user_message } (not agent_message)", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "cursor-deny", registry });
		gateReg.register("cursor-deny", {
			rules: [{ id: "r1", pattern: "bash", description: "Shell" }],
			sandboxPath: "/tmp",
		});

		const res = await postActionCheck(bridge.router, token, makeHookBody("bash"), "cursor");
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.permission).toBe("deny");
		expect(typeof body.user_message).toBe("string");
		expect(body.agent_message).toBeUndefined();
		await bridge.close(token);
	});

	it("deny reason names the rule description", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "reason-test", registry });
		gateReg.register("reason-test", {
			rules: [{ id: "r1", pattern: "bash", description: "Shell commands require approval" }],
			sandboxPath: "/tmp",
		});

		const res = await postActionCheck(bridge.router, token, makeHookBody("bash"), "generic");
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.reason as string).toContain("Shell commands require approval");
		await bridge.close(token);
	});

	// ── Fail-open on bad body ──────────────────────────────────────────────

	it("allows on unparseable body (fail-open)", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "bad-body", registry });
		gateReg.register("bad-body", {
			rules: [{ id: "r1", pattern: "bash", description: "Shell" }],
			sandboxPath: "/tmp",
		});

		const res = await bridge.router.request(`/mcp/${token}/action-check`, {
			method: "POST",
			headers: { authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
			body: "not json at all!!!",
		});
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.decision).toBe("allow");
		await bridge.close(token);
	});

	it("opencode format: allow returns { decision: 'allow' } (same as generic default)", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "opencode-allow", registry });
		gateReg.register("opencode-allow", { rules: [], sandboxPath: "/tmp" });

		const res = await postActionCheck(bridge.router, token, makeHookBody("read_file"), "opencode");
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.decision).toBe("allow");
		await bridge.close(token);
	});

	it("opencode format: deny returns { decision: 'deny', reason }", async () => {
		const gateReg = createActionGateRegistry();
		const bridge = createMcpToolBridge({ gateRegistry: gateReg });
		const { token } = await bridge.open({ sessionId: "opencode-deny", registry });
		gateReg.register("opencode-deny", {
			rules: [{ id: "r1", pattern: "bash", description: "Shell" }],
			sandboxPath: "/tmp",
		});

		const res = await postActionCheck(bridge.router, token, makeHookBody("bash"), "opencode");
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.decision).toBe("deny");
		expect(typeof body.reason).toBe("string");
		await bridge.close(token);
	});
});
