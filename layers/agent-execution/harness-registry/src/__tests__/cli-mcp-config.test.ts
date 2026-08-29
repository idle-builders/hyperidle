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
 *
 * @lore AL7 T1: Tests the shape contract for the config writer. The writer
 * lives in packages/server/src/harness/cli-mcp-config.ts (new file, T4).
 * Using a real temp dir to prove actual file I/O, not just return values.
 *
 * @lore AL7 T1 toml-parsing: The codex toml block is verified via string
 * matching (not a full TOML parser dependency) since the block has a simple,
 * predictable structure. The block is appended so we match the section header
 * and key=value lines independently.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
// @lore AL7 T1 RED: This import will fail until writeCliMcpConfig is created in T4.
import { writeHarnessMcpConfig, writePluginStdioMcpEntries } from "../cli-mcp-config.js";

const writeCliMcpConfig = writeHarnessMcpConfig;

import { afterEach, beforeEach, describe, expect, test } from "vitest";

const TEST_MCP_URL = "http://127.0.0.1:9999/api/mcp/test-token-abc123";
const TEST_TOKEN = "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678";

describe("T1 — writeCliMcpConfig (AC5)", () => {
	let sandboxPath: string;

	beforeEach(() => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "t1-cli-mcp-config-"));
	});

	afterEach(() => {
		fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	// ── codex-toml dialect ────────────────────────────────────────────────────

	describe("codex-toml dialect", () => {
		test("writes [mcp_servers.hyperidle] block to .codex-home/config.toml", () => {
			// Arrange: pre-create .codex-home dir (mirrors provisionCodexHome behavior).
			const codexHomeDir = path.join(sandboxPath, ".codex-home");
			fs.mkdirSync(codexHomeDir, { recursive: true });

			// Act
			writeCliMcpConfig({
				dialect: "codex-toml",
				sandboxPath,
				mcpUrl: TEST_MCP_URL,
				token: TEST_TOKEN,
			});

			// Assert: the file was written.
			const configTomlPath = path.join(codexHomeDir, "config.toml");
			expect(fs.existsSync(configTomlPath)).toBe(true);

			const content = fs.readFileSync(configTomlPath, "utf-8");

			// Must contain the section header.
			expect(content).toContain("[mcp_servers.hyperidle]");

			// Must contain the url key pointing to the mcpUrl.
			expect(content).toContain(`url = "${TEST_MCP_URL}"`);

			// Must contain the bearer_token_env_var key (not the token inline).
			expect(content).toContain(`bearer_token_env_var = "HYPERIDLE_MCP_TOKEN"`);

			// Must NOT embed the token inline in the toml.
			// The token travels via the env var, not the config file.
			expect(content).not.toContain(TEST_TOKEN);
		});

		test("returns tokenEnv with HYPERIDLE_MCP_TOKEN = token", () => {
			// Arrange
			const codexHomeDir = path.join(sandboxPath, ".codex-home");
			fs.mkdirSync(codexHomeDir, { recursive: true });

			// Act + Assert
			const { tokenEnv } = writeCliMcpConfig({
				dialect: "codex-toml",
				sandboxPath,
				mcpUrl: TEST_MCP_URL,
				token: TEST_TOKEN,
			});

			// The return value carries the env var for the spawn.
			expect(tokenEnv).toBeDefined();
			expect(tokenEnv?.HYPERIDLE_MCP_TOKEN).toBe(TEST_TOKEN);
		});

		test("creates .codex-home/config.toml if it does not exist yet", () => {
			// Arrange: do NOT pre-create .codex-home dir.
			// The writer must create it + the file if absent.

			// Act
			writeCliMcpConfig({
				dialect: "codex-toml",
				sandboxPath,
				mcpUrl: TEST_MCP_URL,
				token: TEST_TOKEN,
			});

			// Assert: .codex-home/config.toml was created.
			const configTomlPath = path.join(sandboxPath, ".codex-home", "config.toml");
			expect(fs.existsSync(configTomlPath)).toBe(true);
			const content = fs.readFileSync(configTomlPath, "utf-8");
			expect(content).toContain("[mcp_servers.hyperidle]");
		});

		test("appends to existing config.toml without destroying existing content", () => {
			// Arrange: codex already has other config in config.toml (e.g. from return-enforcement provisioning).
			const codexHomeDir = path.join(sandboxPath, ".codex-home");
			fs.mkdirSync(codexHomeDir, { recursive: true });
			const configTomlPath = path.join(codexHomeDir, "config.toml");
			const existingContent = `# Existing codex config\n[model]\ndefault = "o4-mini"\n`;
			fs.writeFileSync(configTomlPath, existingContent, "utf-8");

			// Act
			writeCliMcpConfig({
				dialect: "codex-toml",
				sandboxPath,
				mcpUrl: TEST_MCP_URL,
				token: TEST_TOKEN,
			});

			// Assert: existing content is preserved.
			const after = fs.readFileSync(configTomlPath, "utf-8");
			expect(after).toContain('default = "o4-mini"');
			// And the new block is also present.
			expect(after).toContain("[mcp_servers.hyperidle]");
		});

		// ── BA2 ruling 18 — trust is declared, not bypassed ───────────────────────
		//
		// codex 0.150.1 refuses to run outside a directory it trusts ("Not inside
		// a trusted directory"). The fix is NOT a bypass flag — it is codex's own
		// declaration mechanism: `[projects."<path>"] trust_level = "trusted"` in
		// config.toml. This writer already authors that file for the MCP entry, so
		// the trust declaration belongs beside it.

		test('declares the sandbox path trusted via [projects."<path>"] trust_level', () => {
			const codexHomeDir = path.join(sandboxPath, ".codex-home");
			fs.mkdirSync(codexHomeDir, { recursive: true });

			writeCliMcpConfig({
				dialect: "codex-toml",
				sandboxPath,
				mcpUrl: TEST_MCP_URL,
				token: TEST_TOKEN,
			});

			const content = fs.readFileSync(path.join(codexHomeDir, "config.toml"), "utf-8");
			expect(content).toContain(`[projects."${sandboxPath}"]`);
			expect(content).toContain('trust_level = "trusted"');
		});

		test("declares each mounted filesystem's real path trusted alongside the sandbox", () => {
			const codexHomeDir = path.join(sandboxPath, ".codex-home");
			fs.mkdirSync(codexHomeDir, { recursive: true });
			const mountedRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), "t1-mounted-repo-"));

			try {
				writeCliMcpConfig({
					dialect: "codex-toml",
					sandboxPath,
					mcpUrl: TEST_MCP_URL,
					token: TEST_TOKEN,
					trustedPaths: [mountedRepoPath],
				});

				const content = fs.readFileSync(path.join(codexHomeDir, "config.toml"), "utf-8");
				expect(content).toContain(`[projects."${sandboxPath}"]`);
				expect(content).toContain(`[projects."${mountedRepoPath}"]`);
				// Both entries declare trust_level = "trusted" (count, not just contains).
				expect(content.match(/trust_level = "trusted"/g)?.length).toBe(2);
			} finally {
				fs.rmSync(mountedRepoPath, { recursive: true, force: true });
			}
		});

		test("does not duplicate the trust entry when a trustedPaths entry equals the sandbox", () => {
			const codexHomeDir = path.join(sandboxPath, ".codex-home");
			fs.mkdirSync(codexHomeDir, { recursive: true });

			writeCliMcpConfig({
				dialect: "codex-toml",
				sandboxPath,
				mcpUrl: TEST_MCP_URL,
				token: TEST_TOKEN,
				trustedPaths: [sandboxPath],
			});

			const content = fs.readFileSync(path.join(codexHomeDir, "config.toml"), "utf-8");
			expect(content.match(/trust_level = "trusted"/g)?.length).toBe(1);
		});

		test("leaves the [mcp_servers.hyperidle] block undisturbed by the trust declaration", () => {
			const codexHomeDir = path.join(sandboxPath, ".codex-home");
			fs.mkdirSync(codexHomeDir, { recursive: true });

			writeCliMcpConfig({
				dialect: "codex-toml",
				sandboxPath,
				mcpUrl: TEST_MCP_URL,
				token: TEST_TOKEN,
				trustedPaths: ["/some/other/mounted/path"],
			});

			const content = fs.readFileSync(path.join(codexHomeDir, "config.toml"), "utf-8");
			expect(content).toContain("[mcp_servers.hyperidle]");
			expect(content).toContain(`url = "${TEST_MCP_URL}"`);
			expect(content).toContain('bearer_token_env_var = "HYPERIDLE_MCP_TOKEN"');
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

			// Must be valid JSON — no JSON.parse exception.
			expect(() => JSON.parse(raw)).not.toThrow();
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
});

// ---------------------------------------------------------------------------
// writePluginStdioMcpEntries — dialect shape unit tests
// ---------------------------------------------------------------------------

describe("writePluginStdioMcpEntries — plugin stdio MCP entries", () => {
	let sandboxPath: string;

	beforeEach(() => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba9b-plugin-mcp-"));
	});

	afterEach(() => {
		fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	describe("codex-toml dialect", () => {
		test("writes [mcp_servers.<key>] block with separate command/args TOML fields", () => {
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

			const tomlPath = path.join(sandboxPath, ".codex-home", "config.toml");
			expect(fs.existsSync(tomlPath)).toBe(true);
			const content = fs.readFileSync(tomlPath, "utf-8");
			expect(content).toContain("[mcp_servers.my-plugin]");
			expect(content).toContain('command = "/usr/bin/node"');
			expect(content).toContain('args = ["/opt/plugin/server.js"]');
		});

		test("writes env as TOML inline table and cwd as string", () => {
			writePluginStdioMcpEntries({
				dialect: "codex-toml",
				sandboxPath,
				servers: [
					{
						key: "my-plugin",
						config: {
							command: "/usr/bin/node",
							args: [],
							env: { MY_VAR: "my-value" },
							cwd: "/opt/plugin",
						},
					},
				],
			});

			const content = fs.readFileSync(
				path.join(sandboxPath, ".codex-home", "config.toml"),
				"utf-8",
			);
			expect(content).toContain('cwd = "/opt/plugin"');
			expect(content).toContain("MY_VAR");
			expect(content).toContain("my-value");
		});

		test("no-op when servers list is empty", () => {
			writePluginStdioMcpEntries({ dialect: "codex-toml", sandboxPath, servers: [] });
			expect(fs.existsSync(path.join(sandboxPath, ".codex-home", "config.toml"))).toBe(false);
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
			expect(parsed.mcp?.["hyperidle"]?.type).toBe("remote");
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
			expect((entry as Record<string, unknown>)["command"]).toBe("/usr/bin/node");
		});

		test("no-op when servers list is empty", () => {
			writePluginStdioMcpEntries({ dialect: "cursor-json", sandboxPath, servers: [] });
			expect(fs.existsSync(path.join(sandboxPath, ".cursor", "mcp.json"))).toBe(false);
		});
	});
});
