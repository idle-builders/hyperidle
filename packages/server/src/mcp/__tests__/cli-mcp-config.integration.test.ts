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
 *             enabled:true }.
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
import { afterEach, beforeEach, describe, expect, test } from "vitest";
// @lore AL7 T1 RED: This import will fail until writeCliMcpConfig is created in T4.
import { writeCliMcpConfig } from "../../harness/cli-mcp-config.js";

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
			// Arrange: codex already has other config in config.toml (e.g. from AL6 provisioning).
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

		test("returns empty tokenEnv (token is inline in the json, no env var needed)", () => {
			// Act
			const { tokenEnv } = writeCliMcpConfig({
				dialect: "opencode-json",
				sandboxPath,
				mcpUrl: TEST_MCP_URL,
				token: TEST_TOKEN,
			});

			// opencode embeds the token inline; no tokenEnv needed.
			// The return value must either omit tokenEnv or have it as undefined/empty.
			expect(tokenEnv ?? {}).toEqual({});
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
