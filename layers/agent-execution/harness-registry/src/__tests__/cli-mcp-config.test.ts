/**
 * T1 — Config-shape test for writeCliMcpConfig (AC5).
 *
 * Assert the per-session config writer produces the correct dialect for each binary:
 *
 *   codex:    .codex-home/config.toml contains [mcp_servers.hyperidle] with
 *             url = "<mcpUrl>" and bearer_token_env_var = "HYPERIDLE_MCP_TOKEN";
 *             return value has tokenEnv.HYPERIDLE_MCP_TOKEN === token.
 *
 *   opencode: opencode.json contains
 *             mcp.hyperidle = { type:"remote", url, headers:{Authorization:"Bearer <tok>"},
 *             enabled:true } and returns OPENCODE_CONFIG pointing to that file.
 *
 * This test MUST BE RED today:
 *   The `writeCliMcpConfig` function does not exist yet.
 *   Import will throw a module-not-found or named-export-not-found error.
 *
 * After T4 (green phase): writeCliMcpConfig is created → this turns GREEN.
 *
 * IN CI / test:all — deterministic, no external binary.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	buildCodexPluginConfigArgs,
	writeHarnessMcpConfig,
	writePluginStdioMcpEntries,
} from "../cli-mcp-config.js";

const writeCliMcpConfig = writeHarnessMcpConfig;

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const TEST_MCP_URL = "http://127.0.0.1:9999/api/mcp/test-token-abc123";
const TEST_TOKEN = "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678";

describe("writeCliMcpConfig", () => {
	let sandboxPath: string;

	beforeEach(() => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "t1-cli-mcp-config-"));
	});

	afterEach(() => {
		fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	// ── codex-toml dialect ────────────────────────────────────────────────────
	// Bridge config and trust declarations are passed as -c flags at spawn.
	// writeHarnessMcpConfig returns only tokenEnv; no file is written to disk.

	describe("codex-toml dialect", () => {
		test("returns tokenEnv with HYPERIDLE_MCP_TOKEN = token", () => {
			const { tokenEnv } = writeCliMcpConfig({
				dialect: "codex-toml",
				sandboxPath,
				mcpUrl: TEST_MCP_URL,
				token: TEST_TOKEN,
			});

			expect(tokenEnv?.HYPERIDLE_MCP_TOKEN).toBe(TEST_TOKEN);
		});

		test("does not write any file — bridge and trust passed as -c flags at spawn", () => {
			writeCliMcpConfig({
				dialect: "codex-toml",
				sandboxPath,
				mcpUrl: TEST_MCP_URL,
				token: TEST_TOKEN,
				trustedPaths: ["/some/trusted/path"],
			});

			expect(fs.readdirSync(sandboxPath)).toHaveLength(0);
		});
	});

	// ── opencode-json dialect ─────────────────────────────────────────────────

	describe("opencode-json dialect", () => {
		test("writes opencode.json to sandbox root with correct mcp.hyperidle shape", () => {
			// Act
			writeCliMcpConfig({
				dialect: "opencode-json",
				sandboxPath,
				mcpUrl: TEST_MCP_URL,
				token: TEST_TOKEN,
			});

			// Assert: the file was written.
			const opencodeJsonPath = path.join(sandboxPath, "opencode.json");
			expect(fs.existsSync(opencodeJsonPath)).toBe(true);

			const raw = fs.readFileSync(opencodeJsonPath, "utf-8");
			const parsed = JSON.parse(raw) as {
				mcp?: {
					hyperidle?: {
						type?: string;
						url?: string;
						headers?: Record<string, string>;
						enabled?: boolean;
					};
				};
			};

			// Must have mcp.hyperidle.
			expect(parsed.mcp).toBeDefined();
			const hyperidle = parsed.mcp?.hyperidle;
			expect(hyperidle).toBeDefined();

			// type must be "remote" (opencode's remote MCP server type).
			expect(hyperidle?.type).toBe("remote");

			// url must match the mcpUrl.
			expect(hyperidle?.url).toBe(TEST_MCP_URL);

			// headers.Authorization must carry "Bearer <token>".
			expect(hyperidle?.headers?.Authorization).toBe(`Bearer ${TEST_TOKEN}`);

			// enabled must be true.
			expect(hyperidle?.enabled).toBe(true);
		});

		test("returns OPENCODE_CONFIG pointing at the generated config file", () => {
			// Act
			const { tokenEnv } = writeCliMcpConfig({
				dialect: "opencode-json",
				sandboxPath,
				mcpUrl: TEST_MCP_URL,
				token: TEST_TOKEN,
			});

			// opencode embeds the token inline, but OPENCODE_CONFIG forces the binary
			// to load the per-session config path regardless of project-root discovery.
			expect(tokenEnv).toEqual({
				OPENCODE_CONFIG: path.join(sandboxPath, "opencode.json"),
			});
		});

		test("produces valid JSON (parseable without error)", () => {
			writeCliMcpConfig({
				dialect: "opencode-json",
				sandboxPath,
				mcpUrl: TEST_MCP_URL,
				token: TEST_TOKEN,
			});

			const opencodeJsonPath = path.join(sandboxPath, "opencode.json");
			const raw = fs.readFileSync(opencodeJsonPath, "utf-8");

			// Must be valid JSON with the mcp server entry it just wrote.
			const parsed = JSON.parse(raw) as { mcp?: Record<string, unknown> };
			expect(Object.keys(parsed.mcp ?? {}).length).toBeGreaterThan(0);
		});

		test("does not put the token in a query param or path — only in headers.Authorization", () => {
			writeCliMcpConfig({
				dialect: "opencode-json",
				sandboxPath,
				mcpUrl: TEST_MCP_URL,
				token: TEST_TOKEN,
			});

			const opencodeJsonPath = path.join(sandboxPath, "opencode.json");
			const parsed = JSON.parse(fs.readFileSync(opencodeJsonPath, "utf-8")) as {
				mcp?: { hyperidle?: { url?: string } };
			};

			// The url must NOT embed the token.
			expect(parsed.mcp?.hyperidle?.url).toBe(TEST_MCP_URL);
			expect(parsed.mcp?.hyperidle?.url).not.toContain(TEST_TOKEN);
		});
	});

	// ── cursor-json dialect ───────────────────────────────────────────────────

	describe("cursor-json dialect", () => {
		test("writes .cursor/mcp.json with the bridge url and an inline bearer token", () => {
			writeCliMcpConfig({
				dialect: "cursor-json",
				sandboxPath,
				mcpUrl: TEST_MCP_URL,
				token: TEST_TOKEN,
			});

			const parsed = JSON.parse(
				fs.readFileSync(path.join(sandboxPath, ".cursor", "mcp.json"), "utf-8"),
			) as {
				mcpServers?: { hyperidle?: { url?: string; headers?: Record<string, string> } };
			};
			expect(parsed.mcpServers?.hyperidle?.url).toBe(TEST_MCP_URL);
			expect(parsed.mcpServers?.hyperidle?.headers?.Authorization).toBe(`Bearer ${TEST_TOKEN}`);
		});
	});
});

// ---------------------------------------------------------------------------
// writePluginStdioMcpEntries — dialect shape unit tests
// ---------------------------------------------------------------------------

describe("writePluginStdioMcpEntries — plugin stdio MCP entries", () => {
	let sandboxPath: string;

	beforeEach(() => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "probe-plugin-mcp-"));
	});

	afterEach(() => {
		fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	describe("codex-toml dialect", () => {
		// Plugin entries for codex-toml are passed as -c flags via buildCodexPluginConfigArgs.
		// writePluginStdioMcpEntries is a no-op for this dialect.

		test("is a no-op — no file written, plugin args via buildCodexPluginConfigArgs", () => {
			writePluginStdioMcpEntries({
				dialect: "codex-toml",
				sandboxPath,
				servers: [
					{
						key: "my-plugin",
						config: { command: "/usr/bin/node", args: ["/opt/plugin/server.js"] },
					},
				],
			});

			expect(fs.readdirSync(sandboxPath)).toHaveLength(0);
		});

		test("no-op when servers list is empty", () => {
			writePluginStdioMcpEntries({ dialect: "codex-toml", sandboxPath, servers: [] });
			expect(fs.readdirSync(sandboxPath)).toHaveLength(0);
		});
	});

	describe("opencode-json dialect", () => {
		test("writes command as a SINGLE merged array [binary, ...args]", () => {
			// opencode requires a single command array — NOT separate command+args.
			// Verified 2026-08-26: string command + separate args → silently rejected.
			writePluginStdioMcpEntries({
				dialect: "opencode-json",
				sandboxPath,
				servers: [
					{
						key: "my-plugin",
						config: {
							command: "/usr/bin/node",
							args: ["/opt/plugin/server.js", "--port", "3000"],
						},
					},
				],
			});

			const jsonPath = path.join(sandboxPath, "opencode.json");
			expect(fs.existsSync(jsonPath)).toBe(true);
			const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as {
				mcp?: Record<string, { type: string; command?: string[]; enabled?: boolean }>;
			};
			const entry = parsed.mcp?.["my-plugin"];
			// type must be "local" (verified: the opencode stdio type name).
			expect(entry?.type).toBe("local");
			expect(entry?.enabled).toBe(true);
			// command must be a flat array: [binary, ...args]
			expect(Array.isArray(entry?.command)).toBe(true);
			expect(entry?.command).toEqual(["/usr/bin/node", "/opt/plugin/server.js", "--port", "3000"]);
		});

		test("writes env as a flat string-to-string record", () => {
			writePluginStdioMcpEntries({
				dialect: "opencode-json",
				sandboxPath,
				servers: [
					{
						key: "my-plugin",
						config: {
							command: "/usr/bin/node",
							args: [],
							env: { MY_VAR: "my-value", OTHER: "42" },
						},
					},
				],
			});

			const parsed = JSON.parse(
				fs.readFileSync(path.join(sandboxPath, "opencode.json"), "utf-8"),
			) as { mcp?: Record<string, { env?: Record<string, string> }> };
			expect(parsed.mcp?.["my-plugin"]?.env).toEqual({ MY_VAR: "my-value", OTHER: "42" });
		});

		test("writes cwd when provided", () => {
			writePluginStdioMcpEntries({
				dialect: "opencode-json",
				sandboxPath,
				servers: [
					{
						key: "my-plugin",
						config: { command: "/usr/bin/node", args: [], cwd: "/opt/plugin" },
					},
				],
			});

			const parsed = JSON.parse(
				fs.readFileSync(path.join(sandboxPath, "opencode.json"), "utf-8"),
			) as { mcp?: Record<string, { cwd?: string }> };
			expect(parsed.mcp?.["my-plugin"]?.cwd).toBe("/opt/plugin");
		});

		test("merges with existing opencode.json without overwriting bridge entry", () => {
			// Pre-write a bridge (hyperidle remote) entry.
			const jsonPath = path.join(sandboxPath, "opencode.json");
			fs.writeFileSync(
				jsonPath,
				JSON.stringify({
					$schema: "https://opencode.ai/config.json",
					mcp: {
						hyperidle: {
							type: "remote",
							url: "http://localhost/api/mcp/tok",
							headers: { Authorization: "Bearer tok" },
							enabled: true,
						},
					},
				}),
			);

			writePluginStdioMcpEntries({
				dialect: "opencode-json",
				sandboxPath,
				servers: [{ key: "my-plugin", config: { command: "/usr/bin/node", args: [] } }],
			});

			const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as {
				mcp?: Record<string, { type: string }>;
			};
			// Bridge entry must survive.
			expect(parsed.mcp?.hyperidle?.type).toBe("remote");
			// Plugin entry must be added.
			expect(parsed.mcp?.["my-plugin"]?.type).toBe("local");
		});

		test("no-op when servers list is empty", () => {
			writePluginStdioMcpEntries({ dialect: "opencode-json", sandboxPath, servers: [] });
			expect(fs.existsSync(path.join(sandboxPath, "opencode.json"))).toBe(false);
		});
	});

	describe("cursor-json dialect", () => {
		test("writes .cursor/mcp.json with mcpServers object keyed by server key", () => {
			writePluginStdioMcpEntries({
				dialect: "cursor-json",
				sandboxPath,
				servers: [
					{
						key: "my-plugin",
						config: { command: "/usr/bin/node", args: ["/opt/plugin/server.js"] },
					},
				],
			});

			const mcpPath = path.join(sandboxPath, ".cursor", "mcp.json");
			expect(fs.existsSync(mcpPath)).toBe(true);
			const parsed = JSON.parse(fs.readFileSync(mcpPath, "utf-8")) as {
				mcpServers?: Record<string, unknown>;
			};
			const entry = parsed.mcpServers?.["my-plugin"];
			expect(entry).toBeDefined();
			// cursor passes through the full config object.
			expect((entry as Record<string, unknown>).command).toBe("/usr/bin/node");
		});

		test("no-op when servers list is empty", () => {
			writePluginStdioMcpEntries({ dialect: "cursor-json", sandboxPath, servers: [] });
			expect(fs.existsSync(path.join(sandboxPath, ".cursor", "mcp.json"))).toBe(false);
		});
	});
});

// ---------------------------------------------------------------------------
// buildCodexPluginConfigArgs — -c flag args for plugin MCP servers
// ---------------------------------------------------------------------------

describe("buildCodexPluginConfigArgs", () => {
	test("returns empty array for empty servers list", () => {
		expect(buildCodexPluginConfigArgs([])).toEqual([]);
	});

	test("returns mcp_servers.<key>.command arg for a server with command", () => {
		const args = buildCodexPluginConfigArgs([
			{ key: "my-plugin", config: { command: "/usr/bin/node" } },
		]);

		expect(args).toContain('mcp_servers.my-plugin.command="/usr/bin/node"');
	});

	test("returns mcp_servers.<key>.args TOML array arg for a server with args", () => {
		const args = buildCodexPluginConfigArgs([
			{
				key: "my-plugin",
				config: { command: "/usr/bin/node", args: ["/opt/plugin/server.js", "--port", "3000"] },
			},
		]);

		expect(args).toContain(
			'mcp_servers.my-plugin.args=["/opt/plugin/server.js", "--port", "3000"]',
		);
	});

	test("returns mcp_servers.<key>.cwd arg when cwd is provided", () => {
		const args = buildCodexPluginConfigArgs([
			{ key: "my-plugin", config: { command: "/usr/bin/node", args: [], cwd: "/opt/plugin" } },
		]);

		expect(args).toContain('mcp_servers.my-plugin.cwd="/opt/plugin"');
	});

	test("carries a server's env as one inline table", () => {
		const args = buildCodexPluginConfigArgs([
			{
				key: "my-plugin",
				config: { command: "/usr/bin/node", env: { API_URL: "https://x", MODE: 'a"b' } },
			},
		]);

		expect(args).toContain('mcp_servers.my-plugin.env={API_URL="https://x", MODE="a\\"b"}');
	});

	test("returns args for multiple servers in order", () => {
		const args = buildCodexPluginConfigArgs([
			{ key: "plugin-a", config: { command: "/bin/a" } },
			{ key: "plugin-b", config: { command: "/bin/b" } },
		]);

		const aIdx = args.findIndex((a) => a.includes("plugin-a"));
		const bIdx = args.findIndex((a) => a.includes("plugin-b"));
		expect(aIdx).toBeGreaterThanOrEqual(0);
		expect(bIdx).toBeGreaterThanOrEqual(0);
		expect(aIdx).toBeLessThan(bIdx);
	});

	test("escapes double quotes in command value", () => {
		const args = buildCodexPluginConfigArgs([
			{ key: "p", config: { command: '/path/with"quote/bin' } },
		]);

		expect(args[0]).toContain('\\"');
		expect(args[0]).not.toContain('path/with"quote');
	});
});
