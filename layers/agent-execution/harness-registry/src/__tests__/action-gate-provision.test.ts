/**
 * Unit tests for installActionGate file provisioning (deny half).
 *
 * Each test covers one harness channel and verifies that the correct files are
 * written with the expected content (token, URL, fail-closed semantics). These
 * tests exercise the file-writing logic only — no real binary is invoked.
 *
 * Harness coverage:
 *   "settings-claude"  → .claude/settings.json PreToolUse hook + gate-check.py
 *   "settings-codex"   → .codex-home/hooks.json + .codex-home/rules/gate.rules backstop
 *   "settings-cursor"  → .cursor/hooks.json with failClosed:true + gate-check.py
 *   "process-reengage" → .opencode/plugin/hyperidle-gate.js + .hyperidle/opencode-permission.json
 *   empty rules        → no-op (no files written for any channel)
 */

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installActionGate } from "../provision-gate-hook.js";

/**
 * Run py_compile on a Python file. Throws if the file is not valid Python.
 * This proves the gate script can actually be PARSED by Python — a string-grep
 * that the word "except" appears is not enough (a comment-only else: block
 * parses as IndentationError).
 */
function assertPythonValid(scriptPath: string): void {
	const result = childProcess.spawnSync("python3", ["-m", "py_compile", scriptPath], {
		encoding: "utf-8",
	});
	if (result.status !== 0) {
		throw new Error(`Python parse failed for ${scriptPath}:\n${result.stderr}`);
	}
}

/**
 * Run the gate script with no server running (network error) and assert it
 * prints a deny JSON to stdout (fail-closed behavior).
 */
function assertPythonFailsClosed(scriptPath: string): void {
	const result = childProcess.spawnSync("python3", [scriptPath], {
		input: JSON.stringify({ tool_name: "Write" }),
		encoding: "utf-8",
		timeout: 10_000,
	});
	expect(result.stdout, "gate script must write deny JSON to stdout on network error").toContain(
		"deny",
	);
}

const BRIDGE_TOKEN = "test-bridge-token-abc";
const MCP_URL = "http://localhost:3001/api/mcp/test-bridge-token-abc";

describe("installActionGate", () => {
	let sandboxPath: string;

	beforeEach(() => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "gate-prov-"));
	});

	afterEach(() => {
		fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	// ── No-op when rules is empty ─────────────────────────────────────────────

	it("writes no files when rules is empty (no-op)", async () => {
		await installActionGate({
			sandboxPath,
			channel: "settings-claude",
			bridgeToken: BRIDGE_TOKEN,
			mcpUrl: MCP_URL,
			rules: [],
		});
		// None of the gate files should exist
		expect(fs.existsSync(path.join(sandboxPath, ".claude", "settings.json"))).toBe(false);
	});

	it("writes no files for unknown channel even when rules present", async () => {
		await installActionGate({
			sandboxPath,
			channel: "none",
			bridgeToken: BRIDGE_TOKEN,
			mcpUrl: MCP_URL,
			rules: [{ id: "r1", pattern: "*", description: "blocked" }],
		});
		expect(fs.existsSync(path.join(sandboxPath, ".claude"))).toBe(false);
	});

	// ── settings-claude ───────────────────────────────────────────────────────

	describe("settings-claude", () => {
		const rules = [{ id: "r1", pattern: "*", description: "all gated" }];

		it("writes .claude/settings.json with a PreToolUse hooks entry", async () => {
			await installActionGate({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules,
			});
			const settingsPath = path.join(sandboxPath, ".claude", "settings.json");
			expect(fs.existsSync(settingsPath)).toBe(true);
			const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<
				string,
				unknown
			>;
			expect(settings).toHaveProperty("hooks");
			const hooks = settings.hooks as Record<string, unknown>;
			expect(hooks).toHaveProperty("PreToolUse");
		});

		it("writes .claude/gate-check.py sidecar script", async () => {
			await installActionGate({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules,
			});
			const scriptPath = path.join(sandboxPath, ".claude", "gate-check.py");
			expect(fs.existsSync(scriptPath)).toBe(true);
		});

		it("gate-check.py contains the bridge token and action-check URL", async () => {
			await installActionGate({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules,
			});
			const scriptContent = fs.readFileSync(
				path.join(sandboxPath, ".claude", "gate-check.py"),
				"utf-8",
			);
			expect(scriptContent).toContain(BRIDGE_TOKEN);
			expect(scriptContent).toContain("action-check");
		});

		it("gate-check.py is valid Python and fails closed when the server is unreachable", async () => {
			await installActionGate({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules,
			});
			const scriptPath = path.join(sandboxPath, ".claude", "gate-check.py");
			// Proves the script can be parsed — catches comment-only else: blocks.
			assertPythonValid(scriptPath);
			// Proves fail-closed: deny JSON on stdout when server is not running.
			assertPythonFailsClosed(scriptPath);
		});

		it("merges PreToolUse into an existing settings.json without clobbering other keys", async () => {
			const settingsPath = path.join(sandboxPath, ".claude", "settings.json");
			fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
			fs.writeFileSync(settingsPath, JSON.stringify({ model: "my-model" }));

			await installActionGate({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules,
			});
			const updated = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
			expect(updated.model).toBe("my-model");
			expect(updated).toHaveProperty("hooks");
		});
	});

	// ── settings-codex ────────────────────────────────────────────────────────

	describe("settings-codex", () => {
		const rules = [{ id: "r1", pattern: "bash", description: "no bash" }];

		it("writes .codex-home/hooks.json with a PreToolUse entry", async () => {
			await installActionGate({
				sandboxPath,
				channel: "settings-codex",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules,
			});
			const hooksPath = path.join(sandboxPath, ".codex-home", "hooks.json");
			expect(fs.existsSync(hooksPath)).toBe(true);
			const hooks = JSON.parse(fs.readFileSync(hooksPath, "utf-8")) as Record<string, unknown>;
			expect(JSON.stringify(hooks)).toContain("PreToolUse");
		});

		it("writes .codex-home/rules/gate.rules backstop", async () => {
			await installActionGate({
				sandboxPath,
				channel: "settings-codex",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules,
			});
			const rulesPath = path.join(sandboxPath, ".codex-home", "rules", "gate.rules");
			expect(fs.existsSync(rulesPath)).toBe(true);
		});

		// These two previously asserted the file contained `allow *` and `deny *`. Neither is valid
		// Starlark: codex exits 1 with "Error loading rules: starlark error: Parse error" before it
		// ever calls the model, so a session with a gate installed died on startup. The tests were
		// asserting the defect. What the file must actually be is valid Starlark — comments only,
		// with enforcement in the PreToolUse hook.
		it("gate.rules is valid Starlark: comment lines only, no bare directives", async () => {
			await installActionGate({
				sandboxPath,
				channel: "settings-codex",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules,
			});
			const content = fs.readFileSync(
				path.join(sandboxPath, ".codex-home", "rules", "gate.rules"),
				"utf-8",
			);
			const code = content
				.split("\n")
				.map((l) => l.trim())
				.filter((l) => l.length > 0 && !l.startsWith("#"));
			expect(
				code,
				`gate.rules must contain no non-comment lines, found: ${code.join(" | ")}`,
			).toEqual([]);
		});

		it("gate.rules names each active rule so a reader can see what is enforced", async () => {
			await installActionGate({
				sandboxPath,
				channel: "settings-codex",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules: [{ id: "r1", pattern: "bash", description: "no shell" }],
			});
			const content = fs.readFileSync(
				path.join(sandboxPath, ".codex-home", "rules", "gate.rules"),
				"utf-8",
			);
			expect(content).toContain("r1");
			expect(content).toContain("bash");
		});
	});

	// ── settings-cursor ───────────────────────────────────────────────────────

	describe("settings-cursor", () => {
		const rules = [{ id: "r1", pattern: "*", description: "needs approval" }];

		it("writes .cursor/hooks.json with failClosed:true on the preToolUse hook", async () => {
			await installActionGate({
				sandboxPath,
				channel: "settings-cursor",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules,
			});
			const hooksPath = path.join(sandboxPath, ".cursor", "hooks.json");
			expect(fs.existsSync(hooksPath)).toBe(true);
			const config = JSON.parse(fs.readFileSync(hooksPath, "utf-8")) as {
				hooks?: { preToolUse?: Array<{ failClosed?: boolean }> };
			};
			const hook = config.hooks?.preToolUse?.[0];
			expect(hook?.failClosed).toBe(true);
		});

		it("cursor hooks.json has no 'matcher' field", async () => {
			await installActionGate({
				sandboxPath,
				channel: "settings-cursor",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules,
			});
			const content = fs.readFileSync(path.join(sandboxPath, ".cursor", "hooks.json"), "utf-8");
			expect(content).not.toContain('"matcher"');
		});

		it("writes .cursor/gate-check.py — valid Python, token present, fails closed", async () => {
			await installActionGate({
				sandboxPath,
				channel: "settings-cursor",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules,
			});
			const scriptPath = path.join(sandboxPath, ".cursor", "gate-check.py");
			const content = fs.readFileSync(scriptPath, "utf-8");
			expect(content).toContain(BRIDGE_TOKEN);
			expect(content).toContain("action-check");
			assertPythonValid(scriptPath);
			assertPythonFailsClosed(scriptPath);
		});
	});

	// ── process-reengage (opencode) ───────────────────────────────────────────

	describe("process-reengage (opencode)", () => {
		const rules = [{ id: "r1", pattern: "*", description: "gated" }];

		it("writes .opencode/plugin/hyperidle-gate.js", async () => {
			await installActionGate({
				sandboxPath,
				channel: "process-reengage",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules,
			});
			const pluginPath = path.join(sandboxPath, ".opencode", "plugin", "hyperidle-gate.js");
			expect(fs.existsSync(pluginPath)).toBe(true);
		});

		it("plugin uses tool.execute.before key (not preToolUse)", async () => {
			await installActionGate({
				sandboxPath,
				channel: "process-reengage",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules,
			});
			const content = fs.readFileSync(
				path.join(sandboxPath, ".opencode", "plugin", "hyperidle-gate.js"),
				"utf-8",
			);
			expect(content).toContain("tool.execute.before");
		});

		it("plugin contains the bridge token and action-check URL", async () => {
			await installActionGate({
				sandboxPath,
				channel: "process-reengage",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules,
			});
			const content = fs.readFileSync(
				path.join(sandboxPath, ".opencode", "plugin", "hyperidle-gate.js"),
				"utf-8",
			);
			expect(content).toContain(BRIDGE_TOKEN);
			expect(content).toContain("action-check");
		});

		it("writes .hyperidle/opencode-permission.json (OPENCODE_PERMISSION backstop)", async () => {
			await installActionGate({
				sandboxPath,
				channel: "process-reengage",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules,
			});
			const permPath = path.join(sandboxPath, ".hyperidle", "opencode-permission.json");
			expect(fs.existsSync(permPath)).toBe(true);
		});

		it("creates .hyperidle/opencode-xdg-config/ directory for XDG isolation", async () => {
			await installActionGate({
				sandboxPath,
				channel: "process-reengage",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: MCP_URL,
				rules,
			});
			const xdgDir = path.join(sandboxPath, ".hyperidle", "opencode-xdg-config");
			expect(fs.existsSync(xdgDir)).toBe(true);
			expect(fs.statSync(xdgDir).isDirectory()).toBe(true);
		});
	});
});
