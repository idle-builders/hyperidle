/**
 * BA9b: Unit tests for plugin MCP contribution merge logic.
 *
 * Tests the real `mergePluginMcpContributions` from provisioner.ts — NOT a
 * copy of its internal helpers. Importing the real function is the only way
 * to guarantee the test exercises production behaviour (mock-validation trap:
 * a copy of the helper validates itself, not the code that ships).
 *
 * Each test provides a stubbed `PluginMcpContributionsPort` (the only boundary)
 * and a real temp-directory sandbox path — no DB, no binaries.
 *
 * @lore BA9b-B5: the previous version copy-pasted `expandPluginVars` and
 *   `expandMcpConfigValue` from provisioner.ts and asserted against those copies.
 *   A bug in the production copy would pass these tests while shipping broken MCP
 *   config. The fix: export `mergePluginMcpContributions` (@for-testing) and call
 *   it directly, treating the port as the test boundary.
 *
 * @lore BA9b-B2: the second parameter changed from `mcpJsonPath` to `sandboxPath`
 *   so the function can write to the appropriate dialect-specific file within the
 *   sandbox directory. The function derives mcpJsonPath = sandboxPath/.mcp.json
 *   internally for the no-dialect (claude-code) case.
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

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ba9b-mcp-merge-"));
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

/** Read the no-dialect output (.mcp.json in sandbox root). */
function readMcpJson(): { mcpServers: Record<string, unknown> } {
	const mcpJsonPath = path.join(tmpDir, ".mcp.json");
	return JSON.parse(fs.readFileSync(mcpJsonPath, "utf-8")) as {
		mcpServers: Record<string, unknown>;
	};
}

// ---------------------------------------------------------------------------
// No-dialect tests (claude-code: .mcp.json in sandbox root)
// ---------------------------------------------------------------------------

describe("BA9b: mergePluginMcpContributions — no dialect (claude-code)", () => {
	it("writes nothing when port is undefined", async () => {
		await mergePluginMcpContributions(undefined, tmpDir, null);
		expect(fs.existsSync(path.join(tmpDir, ".mcp.json"))).toBe(false);
	});

	it("writes nothing when port returns no rows", async () => {
		await mergePluginMcpContributions(makePort([]), tmpDir, null);
		expect(fs.existsSync(path.join(tmpDir, ".mcp.json"))).toBe(false);
	});

	it("skips rows without installPath — writes file with empty mcpServers", async () => {
		await mergePluginMcpContributions(
			makePort([{ key: "my-server", defaultValueJson: '{"command":"node"}', installPath: null }]),
			tmpDir,
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
			tmpDir,
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
			tmpDir,
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
			tmpDir,
			null,
		);
		const result = readMcpJson();
		const server = result.mcpServers["py-server"] as { env: Record<string, string> };
		expect(server.env.PLUGIN_PATH).toBe("/usr/lib/my-plugin/lib");
	});

	it("expands ${PLUGIN_DATA} to installPath/data", async () => {
		await mergePluginMcpContributions(
			makePort([
				{
					key: "server",
					defaultValueJson: JSON.stringify({ env: { CACHE: "${PLUGIN_DATA}/cache" } }),
					installPath: "/opt/plugin",
				},
			]),
			tmpDir,
			null,
		);
		const result = readMcpJson();
		const server = result.mcpServers["server"] as { env: Record<string, string> };
		// ${PLUGIN_DATA} → installPath/data
		expect(server.env.CACHE).toBe("/opt/plugin/data/cache");
	});

	it("defaults cwd to plugin root when not specified", async () => {
		await mergePluginMcpContributions(
			makePort([
				{
					key: "server",
					defaultValueJson: JSON.stringify({ command: "node", args: [] }),
					installPath: "/opt/plugin",
				},
			]),
			tmpDir,
			null,
		);
		const result = readMcpJson();
		const server = result.mcpServers["server"] as Record<string, unknown>;
		expect(server.cwd).toBe("/opt/plugin");
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
			tmpDir,
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
			path.join(tmpDir, ".mcp.json"),
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
			tmpDir,
			null,
		);

		const result = readMcpJson();
		expect(result.mcpServers["existing"]).toBeDefined();
		expect(result.mcpServers["plugin-server"]).toBeDefined();
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
			tmpDir,
			null,
		);
		// Bad JSON → skipped → file IS written but with empty mcpServers (rows were provided)
		const result = readMcpJson();
		expect(Object.keys(result.mcpServers)).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Dialect tests
// ---------------------------------------------------------------------------

describe("BA9b: mergePluginMcpContributions — codex-toml dialect", () => {
	it("writes stdio entry to .codex-home/config.toml", async () => {
		await mergePluginMcpContributions(
			makePort([
				{
					key: "my-plugin",
					defaultValueJson: JSON.stringify({
						command: "node",
						args: ["/opt/plugin/dist/server.js"],
					}),
					installPath: "/opt/plugin",
				},
			]),
			tmpDir,
			null,
			"codex-toml",
		);
		const tomlPath = path.join(tmpDir, ".codex-home", "config.toml");
		expect(fs.existsSync(tomlPath)).toBe(true);
		const content = fs.readFileSync(tomlPath, "utf-8");
		expect(content).toContain("[mcp_servers.my-plugin]");
		expect(content).toContain('"/opt/plugin/dist/server.js"');
	});

	it("does not write .mcp.json when dialect is codex-toml", async () => {
		await mergePluginMcpContributions(
			makePort([
				{
					key: "my-plugin",
					defaultValueJson: JSON.stringify({ command: "node" }),
					installPath: "/opt/plugin",
				},
			]),
			tmpDir,
			null,
			"codex-toml",
		);
		// dialect file goes to .codex-home/config.toml, not .mcp.json
		expect(fs.existsSync(path.join(tmpDir, ".mcp.json"))).toBe(false);
	});
});

describe("BA9b: mergePluginMcpContributions — opencode-json dialect", () => {
	it("writes type:local entry to opencode.json", async () => {
		await mergePluginMcpContributions(
			makePort([
				{
					key: "my-plugin",
					defaultValueJson: JSON.stringify({
						command: "node",
						args: ["/opt/plugin/dist/server.js"],
					}),
					installPath: "/opt/plugin",
				},
			]),
			tmpDir,
			null,
			"opencode-json",
		);
		const jsonPath = path.join(tmpDir, "opencode.json");
		expect(fs.existsSync(jsonPath)).toBe(true);
		const content = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as {
			mcp: Record<string, { type: string; command?: string }>;
		};
		expect(content.mcp["my-plugin"]).toBeDefined();
		expect(content.mcp["my-plugin"]?.type).toBe("local");
		expect(content.mcp["my-plugin"]?.command).toBeDefined();
	});

	it("merges with existing opencode.json content", async () => {
		// Pre-existing entry (e.g. from the tool-bridge writer)
		fs.writeFileSync(
			path.join(tmpDir, "opencode.json"),
			JSON.stringify({
				$schema: "https://opencode.ai/config.json",
				mcp: { hyperidle: { type: "remote", url: "http://localhost:3001/mcp", enabled: true } },
			}),
		);
		await mergePluginMcpContributions(
			makePort([
				{
					key: "my-plugin",
					defaultValueJson: JSON.stringify({ command: "node" }),
					installPath: "/opt/plugin",
				},
			]),
			tmpDir,
			null,
			"opencode-json",
		);
		const content = JSON.parse(fs.readFileSync(path.join(tmpDir, "opencode.json"), "utf-8")) as {
			mcp: Record<string, unknown>;
		};
		expect(content.mcp["hyperidle"]).toBeDefined();
		expect(content.mcp["my-plugin"]).toBeDefined();
	});
});

describe("BA9b: mergePluginMcpContributions — cursor-json dialect", () => {
	it("writes stdio entry to .cursor/mcp.json", async () => {
		await mergePluginMcpContributions(
			makePort([
				{
					key: "my-plugin",
					defaultValueJson: JSON.stringify({
						command: "node",
						args: ["/opt/plugin/dist/server.js"],
					}),
					installPath: "/opt/plugin",
				},
			]),
			tmpDir,
			null,
			"cursor-json",
		);
		const cursorMcpPath = path.join(tmpDir, ".cursor", "mcp.json");
		expect(fs.existsSync(cursorMcpPath)).toBe(true);
		const content = JSON.parse(fs.readFileSync(cursorMcpPath, "utf-8")) as {
			mcpServers: Record<string, unknown>;
		};
		expect(content.mcpServers["my-plugin"]).toBeDefined();
	});

	it("merges with existing .cursor/mcp.json content", async () => {
		const cursorDir = path.join(tmpDir, ".cursor");
		fs.mkdirSync(cursorDir, { recursive: true });
		fs.writeFileSync(
			path.join(cursorDir, "mcp.json"),
			JSON.stringify({
				mcpServers: { hyperidle: { url: "http://localhost:3001/mcp" } },
			}),
		);
		await mergePluginMcpContributions(
			makePort([
				{
					key: "my-plugin",
					defaultValueJson: JSON.stringify({ command: "node" }),
					installPath: "/opt/plugin",
				},
			]),
			tmpDir,
			null,
			"cursor-json",
		);
		const content = JSON.parse(fs.readFileSync(path.join(cursorDir, "mcp.json"), "utf-8")) as {
			mcpServers: Record<string, unknown>;
		};
		expect(content.mcpServers["hyperidle"]).toBeDefined();
		expect(content.mcpServers["my-plugin"]).toBeDefined();
	});
});
