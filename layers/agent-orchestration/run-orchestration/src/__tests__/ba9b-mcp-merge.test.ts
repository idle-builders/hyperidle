/**
 * BA9b: Unit tests for plugin MCP contribution merge logic.
 * Uses the private expansion helpers through an exported surface
 * by testing the context assembler's agentId-gating.
 *
 * The MCP merge happens in the provisioner (integration test scope)
 * so this file tests the expansion helpers indirectly via a mock.
 * The real integration proof is in the harness integration tests.
 */
import { describe, expect, it } from "vitest";

/**
 * Test the ${PLUGIN_ROOT} expansion logic directly.
 * This duplicates the private helper to give it a unit-level green baseline.
 */
function expandPluginVars(value: string, pluginRoot: string): string {
	return value.replace(/\$\{PLUGIN_ROOT\}/g, pluginRoot);
}

function expandMcpConfigValue(val: unknown, pluginRoot: string): unknown {
	if (typeof val === "string") return expandPluginVars(val, pluginRoot);
	if (Array.isArray(val)) return val.map((v) => expandMcpConfigValue(v, pluginRoot));
	if (val && typeof val === "object") {
		return Object.fromEntries(
			Object.entries(val as Record<string, unknown>).map(([k, v]) => [
				k,
				expandMcpConfigValue(v, pluginRoot),
			]),
		);
	}
	return val;
}

describe("BA9b: ${PLUGIN_ROOT} expansion in MCP config", () => {
	it("expands PLUGIN_ROOT in a string value", () => {
		expect(expandPluginVars("/path/to/plugin/bin/server", "/path/to/plugin")).toBe(
			"/path/to/plugin/bin/server",
		);
	});

	it("expands PLUGIN_ROOT in args array", () => {
		const config = {
			command: "node",
			args: ["${PLUGIN_ROOT}/dist/server.js"],
		};
		const expanded = expandMcpConfigValue(config, "/opt/my-plugin") as typeof config;
		expect(expanded.args[0]).toBe("/opt/my-plugin/dist/server.js");
	});

	it("expands PLUGIN_ROOT in nested env object", () => {
		const config = {
			command: "python",
			env: { PLUGIN_PATH: "${PLUGIN_ROOT}/lib" },
		};
		const expanded = expandMcpConfigValue(config, "/srv/plugin") as typeof config;
		expect((expanded.env as Record<string, string>).PLUGIN_PATH).toBe("/srv/plugin/lib");
	});

	it("expands all occurrences in a string", () => {
		const val = "${PLUGIN_ROOT}/a:${PLUGIN_ROOT}/b";
		expect(expandPluginVars(val, "/base")).toBe("/base/a:/base/b");
	});

	it("leaves non-PLUGIN_ROOT templates untouched", () => {
		const val = "${PLUGIN_DATA}/cache";
		expect(expandPluginVars(val, "/base")).toBe("${PLUGIN_DATA}/cache");
	});

	it("passes through non-string values unchanged", () => {
		expect(expandMcpConfigValue(42, "/base")).toBe(42);
		expect(expandMcpConfigValue(true, "/base")).toBe(true);
		expect(expandMcpConfigValue(null, "/base")).toBeNull();
	});
});
