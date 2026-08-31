/**
 * Integration tests for the /mcp/:token/action-check HTTP endpoint.
 *
 * Tests the action gate check flow through a real HTTP server (not just the
 * in-process router.request() path the unit tests use). The real integration
 * point: a real TCP-bound Hono server, real fetch() calls, the full MCP bridge
 * session lifecycle (open → action-check → close).
 *
 * AC coverage:
 *   - Blocks a matching tool via real HTTP → deny response
 *   - Allows a non-matching tool via real HTTP → allow response
 *   - Clearance (addClearance) allows the tool once → denied on the next call
 *   - Fail-open: no gate registry → always allow
 *   - pendingBlock is set on the in-memory gate entry after a deny
 */

import { serve } from "@hono/node-server";
import type { ToolRegistry } from "@hyperidle/harness-protocol";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ActionGateRegistry } from "../action-gate-registry.js";
import { createActionGateRegistry } from "../action-gate-registry.js";
import { createMcpToolBridge, type McpToolBridge } from "../mcp-tool-bridge.js";

const emptyRegistry: ToolRegistry = {
	definitions: [],
	invoke: async () => ({ success: false, code: "NOT_FOUND", error: "none" }),
	toClaudeToolSpecs: () => [],
};

function hookBody(toolName: string, toolInput: unknown = {}): string {
	return JSON.stringify({ tool_name: toolName, tool_input: toolInput });
}

interface ServerHandle {
	url: string;
	close: () => Promise<void>;
}

async function startServer(app: Hono): Promise<ServerHandle> {
	return new Promise((resolve) => {
		const server = serve({ fetch: app.fetch, port: 0 }, (info) => {
			resolve({
				url: `http://127.0.0.1:${info.port}`,
				close: () =>
					new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
			});
		});
	});
}

async function actionCheck(
	serverUrl: string,
	token: string,
	body: string,
	harness = "generic",
): Promise<{ status: number; body: Record<string, unknown> }> {
	const res = await fetch(`${serverUrl}/mcp/${token}/action-check?harness=${harness}`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body,
	});
	return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("gate action-check (integration — real HTTP)", () => {
	let gateReg: ActionGateRegistry;
	let bridge: McpToolBridge;
	let server: ServerHandle;
	let token: string;

	beforeEach(async () => {
		gateReg = createActionGateRegistry();
		bridge = createMcpToolBridge({ gateRegistry: gateReg });

		const app = new Hono();
		app.route("/", bridge.router);

		server = await startServer(app);
		const opened = await bridge.open({ sessionId: "integ-session", registry: emptyRegistry });
		token = opened.token;
	});

	afterEach(async () => {
		await bridge.close(token).catch(() => undefined);
		await server.close();
	});

	test("no rules registered → always allow", async () => {
		// session opened but NOT registered in gateReg → fail-open
		const { status, body } = await actionCheck(server.url, token, hookBody("bash"));
		expect(status).toBe(200);
		expect(body.decision).toBe("allow");
	});

	test("empty rule list → always allow", async () => {
		gateReg.register("integ-session", { rules: [], sandboxPath: "/tmp" });
		const { status, body } = await actionCheck(server.url, token, hookBody("bash"));
		expect(status).toBe(200);
		expect(body.decision).toBe("allow");
	});

	test("matching rule → deny and set pendingBlock", async () => {
		gateReg.register("integ-session", {
			rules: [{ id: "r1", pattern: "bash", description: "Shell commands" }],
			sandboxPath: "/tmp",
		});

		const { status, body } = await actionCheck(server.url, token, hookBody("bash"));
		expect(status).toBe(200);
		expect(body.decision).toBe("deny");

		const entry = gateReg.get("integ-session");
		expect(entry?.pendingBlock?.ruleId).toBe("r1");
		expect(entry?.pendingBlock?.blockedTool).toBe("bash");
	});

	test("non-matching tool → allow even when rules exist", async () => {
		gateReg.register("integ-session", {
			rules: [{ id: "r1", pattern: "bash", description: "Shell" }],
			sandboxPath: "/tmp",
		});

		const { body } = await actionCheck(server.url, token, hookBody("read_file"));
		expect(body.decision).toBe("allow");
	});

	test("addClearance: first call allows, second call denies (clearance consumed)", async () => {
		gateReg.register("integ-session", {
			rules: [{ id: "r1", pattern: "bash", description: "Shell" }],
			sandboxPath: "/tmp",
		});
		gateReg.addClearance("integ-session", "bash");

		const first = await actionCheck(server.url, token, hookBody("bash"));
		expect(first.body.decision).toBe("allow");

		const second = await actionCheck(server.url, token, hookBody("bash"));
		expect(second.body.decision).toBe("deny");
	});

	test("fail-open: no gateRegistry wired → always allow", async () => {
		// bridge without gateRegistry
		const noBridge = createMcpToolBridge();
		const app2 = new Hono();
		app2.route("/", noBridge.router);
		const srv2 = await startServer(app2);
		const { token: tok2 } = await noBridge.open({
			sessionId: "no-gate-integ",
			registry: emptyRegistry,
		});

		try {
			const { body } = await actionCheck(srv2.url, tok2, hookBody("bash"));
			expect(body.decision).toBe("allow");
		} finally {
			await noBridge.close(tok2).catch(() => undefined);
			await srv2.close();
		}
	});

	test("deny reason includes the rule description", async () => {
		gateReg.register("integ-session", {
			rules: [{ id: "r1", pattern: "bash", description: "Shell commands need approval" }],
			sandboxPath: "/tmp",
		});

		const { body } = await actionCheck(server.url, token, hookBody("bash"));
		expect(body.decision).toBe("deny");
		expect(String(body.reason)).toContain("Shell commands need approval");
	});
});
