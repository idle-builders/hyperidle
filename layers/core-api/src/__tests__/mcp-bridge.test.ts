import type { ToolRegistry } from "@hyperidle/harness-protocol";
import { createMcpToolBridge } from "@hyperidle/harness-registry/mcp";
import { describe, expect, test } from "vitest";

const registry: ToolRegistry = {
	definitions: [],
	invoke: async () => ({ success: false, code: "NOT_FOUND", error: "none" }),
	toClaudeToolSpecs: () => [],
};

describe("MCP tool bridge", () => {
	test("opens cryptographically random 256-bit path tokens", async () => {
		const bridge = createMcpToolBridge();
		const one = await bridge.open({ sessionId: "one", registry });
		const two = await bridge.open({ sessionId: "two", registry });
		expect(one.token).toMatch(/^[a-f0-9]{64}$/);
		expect(two.token).toMatch(/^[a-f0-9]{64}$/);
		expect(one.token).not.toBe(two.token);
		await bridge.close(one.token);
		await bridge.close(two.token);
	});
});
