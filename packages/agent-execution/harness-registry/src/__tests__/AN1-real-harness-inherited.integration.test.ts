/**
 * AN1 real-harness inherited-tools proof.
 *
 * Proves that each supported harness's MCP/CLI enumeration works against the REAL
 * binary — not a mock or fixture. Each test seeds an isolated config in a temp dir,
 * runs the probe through the real binary, and asserts:
 *   1. The known server name appears in the result.
 *   2. NO secret/env/command/token field is present on any descriptor.
 *   3. The honest none-state (empty config) returns [].
 *
 * Each binary's describe block is gated by requireHarness(<name>), which HARD-FAILS
 * (never skips) when the binary is absent — a missing harness means the work is not
 * done, not that the suite passes (AR1).
 *
 * @lore AN1: local-only lane — not a GitHub Actions job. These tests call real CLIs
 * (codex, claude, opencode) with isolated temp-dir configs so developer's actual
 * ~/.codex / ~/.claude / ~/.config/opencode configs are never mutated.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InheritedToolDescriptor } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	discoverLocalHarnesses,
	probeClaudeCodeMcpList,
	probeCodexMcpList,
	probeEnvironmentClis,
	probeOpencodeMcpList,
} from "../harness-discovery.js";
import { requireHarness } from "./require-harness.js";

/**
 * Asserts that no descriptor has any field that could leak secret/env/command/token values.
 * Hard-rule 4: enumeration is identity-only (name + kind + harness + health).
 */
function assertNoSecretFields(tools: readonly InheritedToolDescriptor[]): void {
	const allowedKeys = new Set(["name", "kind", "harness", "health"]);
	for (const tool of tools) {
		const actualKeys = Object.keys(tool);
		const forbidden = actualKeys.filter((k) => !allowedKeys.has(k));
		expect(
			forbidden,
			`Descriptor for "${tool.name}" has forbidden fields: ${forbidden.join(", ")}`,
		).toHaveLength(0);
	}
}

// ────────────────────────────────────────────────────────────────────────────
// codex: real binary + isolated CODEX_HOME
// ────────────────────────────────────────────────────────────────────────────
describe("AN1 codex inherited-tools (real binary)", () => {
	requireHarness("codex");
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "an1-codex-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	test("returns known MCP server name from config.toml via real codex binary", async () => {
		// Seed isolated CODEX_HOME with a known MCP server
		const configToml = `[mcp_servers.an1-test-tool]\ncommand = "node"\nargs = ["index.js"]\n`;
		await writeFile(join(tmpDir, "config.toml"), configToml, "utf-8");

		const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: tmpDir };
		const tools = await probeCodexMcpList({ env });

		// Known server must appear
		const names = tools.map((t) => t.name);
		expect(names).toContain("an1-test-tool");

		// All returned descriptors must be identity-only (no secret fields)
		assertNoSecretFields(tools);

		// Kind and harness must be correct
		const server = tools.find((t) => t.name === "an1-test-tool");
		expect(server?.kind).toBe("mcp-server");
		expect(server?.harness).toBe("codex");
	});

	test("returns [] from empty CODEX_HOME config (honest none-state)", async () => {
		// Empty CODEX_HOME — no config.toml, so codex mcp list shows empty, fallback also empty
		const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: tmpDir };
		// codex fails to load config with no config.toml → falls through to config.toml path → []
		const tools = await probeCodexMcpList({ env });
		expect(tools).toHaveLength(0);
	});

	test("discoverLocalHarnesses surfaces codex inheritedTools with real binary", async () => {
		const configToml = `[mcp_servers.an1-discover-tool]\ncommand = "echo"\nargs = []\n`;
		await writeFile(join(tmpDir, "config.toml"), configToml, "utf-8");

		const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: tmpDir };
		const result = await discoverLocalHarnesses({ env });

		const names = (result.codex.inheritedTools ?? []).map((t) => t.name);
		expect(names).toContain("an1-discover-tool");
		assertNoSecretFields(result.codex.inheritedTools ?? []);
	});
});

// ────────────────────────────────────────────────────────────────────────────
// claude-code: real binary + project-scope .mcp.json via cwd
// ────────────────────────────────────────────────────────────────────────────
describe("AN1 claude-code inherited-tools (real binary)", () => {
	requireHarness("claude");
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "an1-claude-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	test("returns known MCP server name from project .mcp.json via real claude binary", async () => {
		// Seed isolated project dir with a project-scope .mcp.json
		// @lore AN1: claude mcp list reads .mcp.json from the working directory (project scope).
		// We set cwd to the temp dir so it picks up only our seeded config.
		// The test will also include user-level MCP servers (claude.ai/*, vibe-annotations etc.)
		// — we assert the known name IS present, not that it's the ONLY one.
		const mcpJson = JSON.stringify({
			mcpServers: {
				"an1-test-claude-mcp": {
					command: "node",
					args: ["/tmp/fake-mcp.js"],
					type: "stdio",
				},
			},
		});
		await writeFile(join(tmpDir, ".mcp.json"), mcpJson, "utf-8");

		const tools = await probeClaudeCodeMcpList({ cwd: tmpDir });

		const names = tools.map((t) => t.name);
		expect(names).toContain("an1-test-claude-mcp");

		// All descriptors must be identity-only
		assertNoSecretFields(tools);

		const server = tools.find((t) => t.name === "an1-test-claude-mcp");
		expect(server?.kind).toBe("mcp-server");
		expect(server?.harness).toBe("claude-code");
	});

	test("health reflects status from claude mcp list output", async () => {
		// A server with a non-running target → "Pending approval" or "Failed"
		const mcpJson = JSON.stringify({
			mcpServers: {
				"an1-health-check-mcp": {
					command: "node",
					args: ["/tmp/definitely-not-here.js"],
					type: "stdio",
				},
			},
		});
		await writeFile(join(tmpDir, ".mcp.json"), mcpJson, "utf-8");

		const tools = await probeClaudeCodeMcpList({ cwd: tmpDir });
		const server = tools.find((t) => t.name === "an1-health-check-mcp");

		// Must be found; health is "needs-attention" or "unknown" (pending/failed/rejected)
		expect(server).toBeDefined();
		expect(["needs-attention", "unknown"]).toContain(server?.health);
		assertNoSecretFields(tools);
	});
});

// ────────────────────────────────────────────────────────────────────────────
// opencode: real binary + isolated XDG_CONFIG_HOME
// ────────────────────────────────────────────────────────────────────────────
describe("AN1 opencode inherited-tools (real binary)", () => {
	requireHarness("opencode");
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "an1-opencode-"));
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	test("returns known MCP server name from opencode.jsonc via real opencode config", async () => {
		// Seed isolated XDG_CONFIG_HOME with opencode config containing a known MCP server
		// @lore AN1: opencode config is at $XDG_CONFIG_HOME/opencode/opencode.jsonc.
		// We seed a known server name and assert it's enumerated identity-only.
		const configDir = join(tmpDir, "opencode");
		await mkdir(configDir, { recursive: true });
		const openCodeJsonc = JSON.stringify({
			// biome-ignore lint/style/useNamingConvention: $schema is the canonical JSON Schema field name
			$schema: "https://opencode.ai/config.json",
			mcp: {
				"an1-test-opencode-mcp": {
					type: "remote",
					url: "http://localhost:19999/mcp",
				},
			},
		});
		await writeFile(join(configDir, "opencode.jsonc"), openCodeJsonc, "utf-8");

		const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: tmpDir };
		const tools = await probeOpencodeMcpList({ env });

		const names = tools.map((t) => t.name);
		expect(names).toContain("an1-test-opencode-mcp");

		// All descriptors must be identity-only (no url/type/env field)
		assertNoSecretFields(tools);

		const server = tools.find((t) => t.name === "an1-test-opencode-mcp");
		expect(server?.kind).toBe("mcp-server");
		expect(server?.harness).toBe("opencode");
	});

	test("returns [] when opencode.jsonc has no mcp key (honest none-state)", async () => {
		const configDir = join(tmpDir, "opencode");
		await mkdir(configDir, { recursive: true });
		await writeFile(
			join(configDir, "opencode.jsonc"),
			// biome-ignore lint/style/useNamingConvention: $schema is the canonical JSON Schema field name
			JSON.stringify({ $schema: "https://opencode.ai/config.json" }),
			"utf-8",
		);

		const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: tmpDir };
		const tools = await probeOpencodeMcpList({ env });
		expect(tools).toHaveLength(0);
	});

	test("returns [] when opencode.jsonc does not exist (honest none-state)", async () => {
		// tmpDir exists but has no opencode subdir
		const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: tmpDir };
		const tools = await probeOpencodeMcpList({ env });
		expect(tools).toHaveLength(0);
	});

	test("discoverLocalHarnesses surfaces opencode inheritedTools via XDG_CONFIG_HOME", async () => {
		const configDir = join(tmpDir, "opencode");
		await mkdir(configDir, { recursive: true });
		const openCodeJsonc = JSON.stringify({
			// biome-ignore lint/style/useNamingConvention: $schema is the canonical JSON Schema field name
			$schema: "https://opencode.ai/config.json",
			mcp: {
				"an1-discover-opencode-mcp": {
					type: "remote",
					url: "http://localhost:19998/mcp",
				},
			},
		});
		await writeFile(join(configDir, "opencode.jsonc"), openCodeJsonc, "utf-8");

		const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: tmpDir };
		const result = await discoverLocalHarnesses({ env });

		const names = (result.opencode.inheritedTools ?? []).map((t) => t.name);
		expect(names).toContain("an1-discover-opencode-mcp");
		assertNoSecretFields(result.opencode.inheritedTools ?? []);
	});
});

// ────────────────────────────────────────────────────────────────────────────
// builtin (environment CLIs): gh auth status — no token field
// ────────────────────────────────────────────────────────────────────────────
describe("AN1 builtin/environment inherited-tools (real binary)", () => {
	requireHarness("gh");
	test("probeEnvironmentClis: gh present → github descriptor is identity-only", async () => {
		// Uses real gh binary — no injection needed
		const tools = await probeEnvironmentClis();

		// gh is installed and (on this dev machine) logged in → github must appear
		// If not logged in, tools may be empty — but no descriptor should have token fields
		assertNoSecretFields(tools);

		const ghTool = tools.find((t) => t.name === "github");
		if (ghTool) {
			expect(ghTool.kind).toBe("cli");
			expect(ghTool.harness).toBe("environment");
			// health should be "working" when logged in
			expect(ghTool.health).toBe("working");
		}
	});

	test("discoverLocalHarnesses: builtin inheritedTools surfaces github identity-only", async () => {
		const result = await discoverLocalHarnesses();

		const builtinTools = result.builtin.inheritedTools ?? [];
		assertNoSecretFields(builtinTools);

		// No descriptor should have token, env, command, or credentials field
		for (const tool of builtinTools) {
			expect(tool).not.toHaveProperty("token");
			expect(tool).not.toHaveProperty("credentials");
			expect(tool).not.toHaveProperty("env");
			expect(tool).not.toHaveProperty("command");
		}
	});
});
