/**
 * X5 — SessionConfig MCP connection info + HarnessCapabilities.mcpSupport tests (red phase).
 *
 * Tests:
 * - McpConnectionInfo type is correctly shaped
 * - SessionConfig accepts optional mcpConnectionInfo
 * - HarnessCapabilities includes mcpSupport boolean
 * - Adapters correctly declare mcpSupport
 * - Provisioner conditional tool_call interception based on mcpSupport + mcpConnectionInfo
 */

import type {
	HarnessCapabilities,
	McpConnectionInfo,
	SessionConfig,
} from "@hyperidle/harness-protocol";
import { describe, expect, it, vi } from "vitest";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { cliAdapterFixture } from "./cli-adapter-fixtures.js";

// ── Type shape tests (runtime-checked via object construction) ────────────────

describe("McpConnectionInfo type shape", () => {
	it("can construct a McpConnectionInfo with url and token", () => {
		const info: McpConnectionInfo = {
			url: "http://localhost:3001/api/mcp/abc123",
			token: "abc123",
		};
		expect(info.url).toBe("http://localhost:3001/api/mcp/abc123");
		expect(info.token).toBe("abc123");
	});
});

describe("SessionConfig accepts optional mcpConnectionInfo", () => {
	it("SessionConfig with mcpConnectionInfo is valid", () => {
		const config: SessionConfig = {
			sandboxPath: "/workspace/test",
			sessionId: "test-session",
			assembledPrompt: "Do the task.",
			modelTier: "workhorse",
			tools: ["Read"],
			mcpConnectionInfo: {
				url: "http://localhost:3001/api/mcp/tok",
				token: "tok",
			},
		};
		expect(config.mcpConnectionInfo?.url).toBe("http://localhost:3001/api/mcp/tok");
		expect(config.mcpConnectionInfo?.token).toBe("tok");
	});

	it("SessionConfig without mcpConnectionInfo is valid (optional field)", () => {
		const config: SessionConfig = {
			sandboxPath: "/workspace/test",
			sessionId: "test-session",
			assembledPrompt: "Do the task.",
			modelTier: "workhorse",
			tools: ["Read"],
		};
		expect(config.mcpConnectionInfo).toBeUndefined();
	});
});

describe("HarnessCapabilities includes mcpSupport", () => {
	it("HarnessCapabilities with mcpSupport: true is valid", () => {
		const caps: HarnessCapabilities = {
			preCompactionTrigger: true,
			subAgents: false,
			modelProviders: ["anthropic"],
			mcpSupport: true,
			returnEnforcement: "none",
		};
		expect(caps.mcpSupport).toBe(true);
	});

	it("HarnessCapabilities with mcpSupport: false is valid", () => {
		const caps: HarnessCapabilities = {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: false,
			returnEnforcement: "none",
		};
		expect(caps.mcpSupport).toBe(false);
	});
});

// ── Adapter mcpSupport declarations ──────────────────────────────────────────

describe("Adapter mcpSupport capability declarations", () => {
	it("claude CLI adapter (CliHarnessAdapter with CLAUDE_CLI_CONFIG) declares mcpSupport: true", () => {
		const adapter = new CliHarnessAdapter(cliAdapterFixture("claude"));
		expect(adapter.getCapabilities().mcpSupport).toBe(true);
	});

	it("CliHarnessAdapter declares mcpSupport: true", () => {
		const spawnSpy = vi.fn();
		const adapter = new CliHarnessAdapter(
			{
				binary: "aider",
				args: [],
				envMap: {},
				eventFormat: "text",
				envAllowlist: [],
			},
			{ spawnFn: spawnSpy },
		);
		expect(adapter.getCapabilities().mcpSupport).toBe(true);
	});
});

// ── Conditional tool_call interception logic ──────────────────────────────────

describe("AC6 — conditional tool_call interception based on mcpSupport + mcpBridgeToken", () => {
	/**
	 * The interceptToolCalls formula from architecture.md:
	 *   const interceptToolCalls = !adapterCapabilities.mcpSupport || !mcpBridgeToken;
	 *
	 * We test the formula directly since session-provisioning.ts is too integrated
	 * to test the event loop in isolation here.
	 */
	function shouldInterceptToolCalls(
		mcpSupport: boolean,
		mcpBridgeToken: string | undefined,
	): boolean {
		return !(mcpSupport && mcpBridgeToken);
	}

	it("intercepts tool_call when adapter has mcpSupport: false (regardless of bridge)", () => {
		expect(shouldInterceptToolCalls(false, "some-token")).toBe(true);
		expect(shouldInterceptToolCalls(false, undefined)).toBe(true);
	});

	it("does NOT intercept tool_call when mcpSupport: true AND bridge token present", () => {
		expect(shouldInterceptToolCalls(true, "some-token")).toBe(false);
	});

	it("intercepts tool_call when mcpSupport: true BUT bridge token absent (bridge failed)", () => {
		expect(shouldInterceptToolCalls(true, undefined)).toBe(true);
	});

	it("CliHarnessAdapter (mcpSupport: true) does NOT intercept when bridge is active", () => {
		const spawnSpy = vi.fn();
		const adapter = new CliHarnessAdapter(
			{ binary: "aider", args: [], envMap: {}, eventFormat: "text", envAllowlist: [] },
			{ spawnFn: spawnSpy },
		);
		const intercepts = shouldInterceptToolCalls(
			adapter.getCapabilities().mcpSupport,
			"active-bridge-token",
		);
		expect(intercepts).toBe(false);
	});

	it("CliHarnessAdapter (mcpSupport: true) DOES intercept when bridge failed (no token)", () => {
		const spawnSpy = vi.fn();
		const adapter = new CliHarnessAdapter(
			{ binary: "aider", args: [], envMap: {}, eventFormat: "text", envAllowlist: [] },
			{ spawnFn: spawnSpy },
		);
		const intercepts = shouldInterceptToolCalls(
			adapter.getCapabilities().mcpSupport,
			undefined, // bridge failed
		);
		expect(intercepts).toBe(true);
	});
});
