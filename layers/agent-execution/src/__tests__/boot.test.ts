/**
 * `bootAgentExecution` — unit coverage for AU31 §6's execution face (AC #4).
 *
 * The boot needs no DB and no credentials (architecture §6 point 3), so this
 * is a pure `.test.ts`, not an integration suite — every assertion is a
 * direct call against the boot's return value.
 */
import type { ToolRegistry, WorkerRegisterMessage } from "@hyperidle/harness-protocol";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { bootAgentExecution } from "../boot.js";

const emptyToolRegistry: ToolRegistry = {
	definitions: [],
	invoke: async () => ({ success: false, code: "NOT_FOUND", error: "none" }),
	toClaudeToolSpecs: () => [],
};

describe("bootAgentExecution", () => {
	describe("adapter pool + sandbox construction", () => {
		it("disabled topology: starts with an empty adapter pool", async () => {
			const boot = await bootAgentExecution({
				topology: "disabled",
				mcpBaseUrl: "http://localhost:9999",
			});

			expect(boot.adapters.pool.size).toBe(0);
		});

		it("disabled topology: the sandbox adapter refuses to spawn", async () => {
			const boot = await bootAgentExecution({
				topology: "disabled",
				mcpBaseUrl: "http://localhost:9999",
			});

			await expect(boot.adapters.sandbox.spawn("/tmp/anything")).rejects.toThrow();
		});

		// @lore This used to assert `pool.has("local-builtin")` — the built-in
		// adapter was registered unconditionally, so a local pool was never empty
		// and every machine could always run a session. Nothing is always-present
		// now: the pool holds the CLI harnesses whose binaries this machine has, so
		// what it contains is a fact about the machine, not about the code. What
		// the code still owes is that it registers nothing else — no adapter that
		// is not a real, installed harness.
		it("local topology: registers only real CLI harnesses, nothing always-present", async () => {
			const boot = await bootAgentExecution({
				topology: "local",
				mcpBaseUrl: "http://localhost:9999",
			});

			expect(boot.adapters.pool.has("local-builtin")).toBe(false);

			const registered = boot.adapters.pool
				.describe({ includeKnownMissing: false })
				.map((d) => d.type);
			for (const type of registered) {
				expect(["claude-code", "codex", "opencode", "cursor-agent"]).toContain(type);
			}
		});
	});

	describe("worker adapter construction", () => {
		it("builds a HarnessAdapter from a worker WS registration", async () => {
			const boot = await bootAgentExecution({
				topology: "disabled",
				mcpBaseUrl: "http://localhost:9999",
			});
			const fakeWs = {
				send: () => {},
				close: () => {},
				onmessage: null,
				onclose: null,
				onerror: null,
			};
			const registration: WorkerRegisterMessage = {
				type: "register",
				id: "worker-1",
				name: "test-worker",
				modelProviders: ["anthropic"],
				maxConcurrent: 2,
			};

			const adapter = boot.adapters.createWorkerAdapter(fakeWs, registration);

			expect(adapter.getCapabilities().modelProviders).toEqual(["anthropic"]);
		});
	});

	describe("MCP bridge + router", () => {
		it("mounts the router so an opened session is dialable, and the returned URL carries mcpBaseUrl", async () => {
			const boot = await bootAgentExecution({
				topology: "disabled",
				mcpBaseUrl: "http://localhost:4242",
			});
			const api = new Hono();
			boot.mountMcpRouter(api);

			const { token, url } = await boot.adapters.harnessRuntime.openMcpBridge({
				sessionId: "session-1",
				toolRegistry: emptyToolRegistry,
			});

			expect(url).toBe(`http://localhost:4242/api/mcp/${token}`);
			const live = await api.request(`/mcp/${token}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			});
			expect(live.status).not.toBe(401);
		});

		it("rejects a token before it is opened", async () => {
			const boot = await bootAgentExecution({
				topology: "disabled",
				mcpBaseUrl: "http://localhost:4242",
			});
			const api = new Hono();
			boot.mountMcpRouter(api);

			const response = await api.request("/mcp/never-opened", { method: "POST" });

			expect(response.status).toBe(401);
		});

		it("closeMcpBridge revokes a token that openMcpBridge minted", async () => {
			const boot = await bootAgentExecution({
				topology: "disabled",
				mcpBaseUrl: "http://localhost:4242",
			});
			const api = new Hono();
			boot.mountMcpRouter(api);
			const { token } = await boot.adapters.harnessRuntime.openMcpBridge({
				sessionId: "session-2",
				toolRegistry: emptyToolRegistry,
			});

			await boot.adapters.harnessRuntime.closeMcpBridge(token);

			const revoked = await api.request(`/mcp/${token}`, { method: "POST" });
			expect(revoked.status).toBe(401);
		});
	});

	describe("return-enforcement gate", () => {
		it("evaluates 'returned' once the gate observes a member of the closed return set", async () => {
			const boot = await bootAgentExecution({
				topology: "disabled",
				mcpBaseUrl: "http://localhost:9999",
			});
			const gate = boot.adapters.harnessRuntime.createReturnGate();

			gate.observe({ type: "tool_call", toolName: "send_message", args: {} });

			expect(boot.adapters.harnessRuntime.evaluateReturn(gate, "completed")).toBe("returned");
		});

		it("evaluates 'not_returned' when no return action was observed and the session completed", async () => {
			const boot = await bootAgentExecution({
				topology: "disabled",
				mcpBaseUrl: "http://localhost:9999",
			});
			const gate = boot.adapters.harnessRuntime.createReturnGate();

			expect(boot.adapters.harnessRuntime.evaluateReturn(gate, "completed")).toBe("not_returned");
		});

		it("narrows to a required subset: an unrequired return action does not satisfy the gate", async () => {
			const boot = await bootAgentExecution({
				topology: "disabled",
				mcpBaseUrl: "http://localhost:9999",
			});
			const gate = boot.adapters.harnessRuntime.createReturnGate(["handoff_to"]);

			gate.observe({ type: "tool_call", toolName: "send_message", args: {} });

			expect(boot.adapters.harnessRuntime.evaluateReturn(gate, "completed")).toBe("not_returned");
		});
	});
});
