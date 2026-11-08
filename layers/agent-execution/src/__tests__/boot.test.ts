/**
 * `bootAgentExecution` — unit coverage for AU31 §6's execution face (AC #4).
 *
 * The boot needs no DB and no credentials (architecture §6 point 3), so this
 * is a pure `.test.ts`, not an integration suite — every assertion is a
 * direct call against the boot's return value.
 */

import type { ToolRegistry } from "@hyperidle/harness-protocol";
import type { CliAvailabilityDeps, HarnessProbeDeps } from "@hyperidle/harness-registry";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { bootAgentExecution } from "../boot.js";

// No real binary is ever spawned or shelled out to here: discovery and
// availability are injected with stubs that report "nothing installed" — the
// same seam createLocalAdapterPool already exposes for production callers.
const noDiscovery: HarnessProbeDeps = {
	run: async () => ({ stdout: "", stderr: "not found", exitCode: 1 }),
};
const noBinaries: CliAvailabilityDeps = {
	whichFn: async () => {
		throw new Error("not found");
	},
};

const emptyToolRegistry: ToolRegistry = {
	definitions: [],
	invoke: async () => ({ success: false, code: "NOT_FOUND", error: "none" }),
	toClaudeToolSpecs: () => [],
};

describe("bootAgentExecution", () => {
	describe("adapter pool + sandbox construction", () => {
		it("registers only real CLI harnesses, nothing always-present", async () => {
			const boot = await bootAgentExecution({
				mcpBaseUrl: "http://localhost:9999",
				discoveryDeps: noDiscovery,
				availabilityDeps: noBinaries,
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

	describe("MCP bridge + router", () => {
		it("mounts the router so an opened session is dialable, and the returned URL carries mcpBaseUrl", async () => {
			const boot = await bootAgentExecution({
				mcpBaseUrl: "http://localhost:4242",
				discoveryDeps: noDiscovery,
				availabilityDeps: noBinaries,
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
				mcpBaseUrl: "http://localhost:4242",
				discoveryDeps: noDiscovery,
				availabilityDeps: noBinaries,
			});
			const api = new Hono();
			boot.mountMcpRouter(api);

			const response = await api.request("/mcp/never-opened", { method: "POST" });

			expect(response.status).toBe(401);
		});

		it("closeMcpBridge revokes a token that openMcpBridge minted", async () => {
			const boot = await bootAgentExecution({
				mcpBaseUrl: "http://localhost:4242",
				discoveryDeps: noDiscovery,
				availabilityDeps: noBinaries,
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
				mcpBaseUrl: "http://localhost:9999",
				discoveryDeps: noDiscovery,
				availabilityDeps: noBinaries,
			});
			const gate = boot.adapters.harnessRuntime.createReturnGate();

			gate.observe({ type: "tool_call", toolName: "send_message", args: {} });

			expect(boot.adapters.harnessRuntime.evaluateReturn(gate, "completed")).toBe("returned");
		});

		it("evaluates 'not_returned' when no return action was observed and the session completed", async () => {
			const boot = await bootAgentExecution({
				mcpBaseUrl: "http://localhost:9999",
				discoveryDeps: noDiscovery,
				availabilityDeps: noBinaries,
			});
			const gate = boot.adapters.harnessRuntime.createReturnGate();

			expect(boot.adapters.harnessRuntime.evaluateReturn(gate, "completed")).toBe("not_returned");
		});

		it("narrows to a required subset: an unrequired return action does not satisfy the gate", async () => {
			const boot = await bootAgentExecution({
				mcpBaseUrl: "http://localhost:9999",
				discoveryDeps: noDiscovery,
				availabilityDeps: noBinaries,
			});
			const gate = boot.adapters.harnessRuntime.createReturnGate(["edit_task"]);

			gate.observe({ type: "tool_call", toolName: "send_message", args: {} });

			expect(boot.adapters.harnessRuntime.evaluateReturn(gate, "completed")).toBe("not_returned");
		});
	});
});
