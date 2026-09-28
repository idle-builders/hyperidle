/**
 * Plugin MCP contribution merge logic — calls the real
 * `mergePluginMcpContributions` from provisioner.ts, never a copy of its
 * helpers, so a production bug fails here too. Each test stubs
 * `PluginMcpContributionsPort` (the only boundary) and writes into a real
 * temp sandbox path — no DB, no binaries.
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
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-mcp-merge-"));
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

describe("mergePluginMcpContributions — no dialect (claude-code)", () => {
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
		const server = result.mcpServers.server as { env: Record<string, string> };
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
		const server = result.mcpServers.server as Record<string, unknown>;
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
		expect(result.mcpServers.existing).toEqual({ url: "http://localhost:9000" });
		expect(result.mcpServers["plugin-server"]).toMatchObject({ command: "node" });
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
//
// mergePluginMcpContributions is a routing layer for the dialect path:
// it builds the expanded server list and delegates to the writeStdioEntries
// callback. The actual file writes are the responsibility of cli-mcp-config.ts
// (writePluginStdioMcpEntries). These tests verify the routing contract only:
// correct dialect forwarded, correct expanded server data passed, .mcp.json
// untouched, callback skipped when servers list is empty.
// ---------------------------------------------------------------------------

type WriteStdioCall = {
	readonly dialect: "codex-toml" | "opencode-json" | "cursor-json";
	readonly sandboxPath: string;
	readonly servers: ReadonlyArray<{
		readonly key: string;
		readonly config: Record<string, unknown>;
	}>;
};

function makeWriteSpy(): { calls: WriteStdioCall[]; spy: (params: WriteStdioCall) => void } {
	const calls: WriteStdioCall[] = [];
	return {
		calls,
		spy: (params) => {
			calls.push(params);
		},
	};
}

describe("mergePluginMcpContributions — codex-toml dialect", () => {
	it("calls writeStdioEntries with correct dialect and expanded servers", async () => {
		const { calls, spy } = makeWriteSpy();
		await mergePluginMcpContributions(
			makePort([
				{
					key: "my-plugin",
					defaultValueJson: JSON.stringify({
						command: "node",
						args: ["${PLUGIN_ROOT}/dist/server.js"],
					}),
					installPath: "/opt/plugin",
				},
			]),
			tmpDir,
			null,
			"codex-toml",
			spy,
		);
		expect(calls).toHaveLength(1);
		const call = calls[0]!;
		expect(call.dialect).toBe("codex-toml");
		expect(call.sandboxPath).toBe(tmpDir);
		expect(call.servers).toHaveLength(1);
		const server = call.servers[0]!;
		expect(server.key).toBe("my-plugin");
		// ${PLUGIN_ROOT} expansion must be applied before the callback is called
		expect((server.config as { args: string[] }).args[0]).toBe("/opt/plugin/dist/server.js");
	});

	it("does not write .mcp.json when dialect is codex-toml", async () => {
		const { spy } = makeWriteSpy();
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
			spy,
		);
		// dialect path must never touch .mcp.json (that is the no-dialect path only)
		expect(fs.existsSync(path.join(tmpDir, ".mcp.json"))).toBe(false);
	});

	it("does not call writeStdioEntries when all rows are skipped (invalid JSON)", async () => {
		const { calls, spy } = makeWriteSpy();
		await mergePluginMcpContributions(
			makePort([{ key: "bad", defaultValueJson: "not-json{{{", installPath: "/opt/plugin" }]),
			tmpDir,
			null,
			"codex-toml",
			spy,
		);
		// servers array is empty after filtering → callback must not be invoked
		expect(calls).toHaveLength(0);
	});
});

describe("mergePluginMcpContributions — opencode-json dialect", () => {
	it("calls writeStdioEntries with opencode-json dialect and expanded servers", async () => {
		const { calls, spy } = makeWriteSpy();
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
			spy,
		);
		expect(calls).toHaveLength(1);
		const call = calls[0]!;
		expect(call.dialect).toBe("opencode-json");
		expect(call.servers[0]!.key).toBe("my-plugin");
	});

	it("does not call writeStdioEntries when rows list is empty", async () => {
		const { calls, spy } = makeWriteSpy();
		await mergePluginMcpContributions(makePort([]), tmpDir, null, "opencode-json", spy);
		// empty rows → early return → callback never invoked
		expect(calls).toHaveLength(0);
	});
});

describe("mergePluginMcpContributions — cursor-json dialect", () => {
	it("calls writeStdioEntries with cursor-json dialect and expanded servers", async () => {
		const { calls, spy } = makeWriteSpy();
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
			spy,
		);
		expect(calls).toHaveLength(1);
		const call = calls[0]!;
		expect(call.dialect).toBe("cursor-json");
		expect(call.servers[0]!.key).toBe("my-plugin");
	});

	it("does not call writeStdioEntries when all rows are filtered out", async () => {
		const { calls, spy } = makeWriteSpy();
		await mergePluginMcpContributions(
			makePort([{ key: "bad", defaultValueJson: "not-json{{{", installPath: "/opt/plugin" }]),
			tmpDir,
			null,
			"cursor-json",
			spy,
		);
		expect(calls).toHaveLength(0);
	});
});
