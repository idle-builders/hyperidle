/**
 * BA9b: Unit tests for plugin MCP contribution merge logic.
 *
 * Tests the real `mergePluginMcpContributions` from provisioner.ts — NOT a
 * copy of its internal helpers. Importing the real function is the only way
 * to guarantee the test exercises production behaviour (mock-validation trap:
 * a copy of the helper validates itself, not the code that ships).
 *
 * Each test provides a stubbed `PluginMcpContributionsPort` (the only boundary)
 * and a real temp-directory file path — no DB, no binaries.
 *
 * @lore BA9b-B5: the previous version copy-pasted `expandPluginVars` and
 *   `expandMcpConfigValue` from provisioner.ts and asserted against those copies.
 *   A bug in the production copy would pass these tests while shipping broken MCP
 *   config. The fix: export `mergePluginMcpContributions` (@for-testing) and call
 *   it directly, treating the port as the test boundary.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mergePluginMcpContributions, type PluginMcpContributionsPort } from "../provisioner.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let mcpJsonPath: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ba9b-mcp-merge-"));
	mcpJsonPath = path.join(tmpDir, ".mcp.json");
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makePort(
	rows: ReadonlyArray<{
		readonly key: string;
		readonly defaultValueJson: string;
		readonly installPath: string | null;
	}>,
): PluginMcpContributionsPort {
	return {
		async getContributions() {
			return rows;
		},
	};
}

function readMcpJson(): { mcpServers: Record<string, unknown> } {
	return JSON.parse(fs.readFileSync(mcpJsonPath, "utf-8")) as {
		mcpServers: Record<string, unknown>;
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BA9b: mergePluginMcpContributions — real production function", () => {
	it("writes nothing when port is undefined", async () => {
		await mergePluginMcpContributions(undefined, mcpJsonPath, null);
		expect(fs.existsSync(mcpJsonPath)).toBe(false);
	});

	it("writes nothing when port returns no rows", async () => {
		await mergePluginMcpContributions(makePort([]), mcpJsonPath, null);
		expect(fs.existsSync(mcpJsonPath)).toBe(false);
	});

	it("skips rows without installPath — writes file with empty mcpServers", async () => {
		await mergePluginMcpContributions(
			makePort([{ key: "my-server", defaultValueJson: '{"command":"node"}', installPath: null }]),
			mcpJsonPath,
			null,
		);
		// File is written (rows were provided, just skipped) — mcpServers is empty
		const result = readMcpJson();
		expect(Object.keys(result.mcpServers)).toHaveLength(0);
	});

	it("expands ${PLUGIN_ROOT} in command string", async () => {
		await mergePluginMcpContributions(
			makePort([
				{
					key: "my-server",
					defaultValueJson: JSON.stringify({ command: "${PLUGIN_ROOT}/bin/server" }),
					installPath: "/opt/my-plugin",
				},
			]),
			mcpJsonPath,
			null,
		);
		const result = readMcpJson();
		expect((result.mcpServers["my-server"] as Record<string, string>).command).toBe(
			"/opt/my-plugin/bin/server",
		);
	});

	it("expands ${PLUGIN_ROOT} in args array", async () => {
		await mergePluginMcpContributions(
			makePort([
				{
					key: "node-server",
					defaultValueJson: JSON.stringify({
						command: "node",
						args: ["${PLUGIN_ROOT}/dist/server.js"],
					}),
					installPath: "/srv/plugin",
				},
			]),
			mcpJsonPath,
			null,
		);
		const result = readMcpJson();
		const server = result.mcpServers["node-server"] as { args: string[] };
		expect(server.args[0]).toBe("/srv/plugin/dist/server.js");
	});

	it("expands ${PLUGIN_ROOT} in nested env object", async () => {
		await mergePluginMcpContributions(
			makePort([
				{
					key: "py-server",
					defaultValueJson: JSON.stringify({
						command: "python",
						env: { PLUGIN_PATH: "${PLUGIN_ROOT}/lib" },
					}),
					installPath: "/usr/lib/my-plugin",
				},
			]),
			mcpJsonPath,
			null,
		);
		const result = readMcpJson();
		const server = result.mcpServers["py-server"] as { env: Record<string, string> };
		expect(server.env.PLUGIN_PATH).toBe("/usr/lib/my-plugin/lib");
	});

	it("merges multiple contributions into a single .mcp.json", async () => {
		await mergePluginMcpContributions(
			makePort([
				{
					key: "server-a",
					defaultValueJson: JSON.stringify({ command: "node", args: [] }),
					installPath: "/opt/a",
				},
				{
					key: "server-b",
					defaultValueJson: JSON.stringify({ command: "python", args: [] }),
					installPath: "/opt/b",
				},
			]),
			mcpJsonPath,
			null,
		);
		const result = readMcpJson();
		expect(Object.keys(result.mcpServers)).toHaveLength(2);
		expect(result.mcpServers["server-a"]).toBeDefined();
		expect(result.mcpServers["server-b"]).toBeDefined();
	});

	it("merges with existing .mcp.json content", async () => {
		// Pre-existing config (e.g. from the CLI harness adapter)
		fs.writeFileSync(
			mcpJsonPath,
			JSON.stringify({ mcpServers: { existing: { url: "http://localhost:9000" } } }, null, 2),
		);

		await mergePluginMcpContributions(
			makePort([
				{
					key: "plugin-server",
					defaultValueJson: JSON.stringify({ command: "node" }),
					installPath: "/opt/plugin",
				},
			]),
			mcpJsonPath,
			null,
		);

		const result = readMcpJson();
		expect(result.mcpServers["existing"]).toBeDefined();
		expect(result.mcpServers["plugin-server"]).toBeDefined();
	});

	it("leaves ${PLUGIN_DATA} unexpanded (reserved for future use)", async () => {
		await mergePluginMcpContributions(
			makePort([
				{
					key: "server",
					defaultValueJson: JSON.stringify({ env: { CACHE: "${PLUGIN_DATA}/cache" } }),
					installPath: "/opt/plugin",
				},
			]),
			mcpJsonPath,
			null,
		);
		const result = readMcpJson();
		const server = result.mcpServers["server"] as { env: Record<string, string> };
		// ${PLUGIN_DATA} not expanded — left as-is for now
		expect(server.env.CACHE).toBe("${PLUGIN_DATA}/cache");
	});

	it("skips rows with invalid JSON in defaultValueJson — writes file with empty mcpServers", async () => {
		await mergePluginMcpContributions(
			makePort([
				{
					key: "bad-server",
					defaultValueJson: "not-json{{{",
					installPath: "/opt/plugin",
				},
			]),
			mcpJsonPath,
			null,
		);
		// Bad JSON → skipped → file IS written but with empty mcpServers (rows were provided)
		const result = readMcpJson();
		expect(Object.keys(result.mcpServers)).toHaveLength(0);
	});
});
