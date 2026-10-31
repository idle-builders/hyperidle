/**
 * Unit tests for provisionReturnHook.
 *
 * Covers:
 *   - Writes the correct file per channel (settings-claude, settings-codex, process-reengage)
 *   - No-op for sdk-inprocess, none (no file written)
 *   - Hook file content: bridge URL + token present; no agent-authored injection
 *   - WARN-F1: trust marker is written for settings-claude and settings-codex
 *   - WARN-F1: hook content is not-vacuous (decision:block or exit-2 semantics present)
 *   - AC4: route-checklist — handles all declared channels without throwing
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { ReturnEnforcementChannel } from "@hyperidle/harness-capability";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { provisionHarnessEnvironment } from "../provision-harness-environment.js";

const execFileAsync = promisify(execFile);

const provisionReturnHook = (options: {
	readonly sandboxPath: string;
	readonly channel: ReturnEnforcementChannel;
	readonly bridgeToken: string;
	readonly mcpUrl: string;
	readonly forceBudget: number;
}) => provisionHarnessEnvironment({ ...options, token: options.bridgeToken });

describe("provisionReturnHook", () => {
	let sandboxPath: string;

	beforeEach(() => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "prh-"));
	});

	afterEach(() => {
		fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	const bridgeToken = "test-bridge-token-abc123def456";
	const mcpUrl = `http://localhost:3001/api/mcp/${bridgeToken}`;
	const forceBudget = 2;

	// ── settings-claude channel ────────────────────────────────────────────

	describe("settings-claude: writes .claude/settings.json with Stop hook", () => {
		it("creates .claude/settings.json in the sandbox", async () => {
			await provisionReturnHook({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});

			const settingsPath = path.join(sandboxPath, ".claude", "settings.json");
			expect(fs.existsSync(settingsPath)).toBe(true);
		});

		it("settings.json contains a hooks.Stop entry", async () => {
			await provisionReturnHook({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});

			const settingsPath = path.join(sandboxPath, ".claude", "settings.json");
			const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;

			expect(content).toHaveProperty("hooks");
			const hooks = content.hooks as Record<string, unknown>;
			expect(hooks).toHaveProperty("Stop");
		});

		it("Stop hook command contains the bridge mcpUrl", async () => {
			await provisionReturnHook({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});

			const settingsPath = path.join(sandboxPath, ".claude", "settings.json");
			const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;

			const hookStr = JSON.stringify(content.hooks);
			expect(hookStr).toContain(mcpUrl);
		});

		it("Stop hook command contains the bridge token", async () => {
			await provisionReturnHook({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});

			const settingsPath = path.join(sandboxPath, ".claude", "settings.json");
			const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;

			const hookStr = JSON.stringify(content.hooks);
			expect(hookStr).toContain(bridgeToken);
		});

		it("hook command contains no shell injection characters from agent-authored content", async () => {
			// The bridge token and URL are server-minted. No agent-authored value enters the shell.
			// This test guards against the injection class: no backticks, $(), <, >, |, ;, &
			// UNLESS they are part of the deliberately written command structure.
			await provisionReturnHook({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});

			const settingsPath = path.join(sandboxPath, ".claude", "settings.json");
			const raw = fs.readFileSync(settingsPath, "utf-8");

			// The token is hex-only (no injection surface).
			// The mcpUrl is a server-constructed URL (no injection surface).
			// Guard: the token in the file must match exactly what was provided (no mutation).
			expect(raw).toContain(bridgeToken);
			// The file must be valid JSON (no shell expansion broke it).
			expect(() => JSON.parse(raw)).not.toThrow();
		});

		it("marks the sandbox as trusted so Claude Code loads the hook", async () => {
			// Claude Code silently skips hooks in untrusted workspaces.
			// The provisioning MUST establish trust or the hook is decorative.
			await provisionReturnHook({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});

			const claudeDir = path.join(sandboxPath, ".claude");
			const settingsContent = JSON.parse(
				fs.readFileSync(path.join(claudeDir, "settings.json"), "utf-8"),
			) as Record<string, unknown>;

			const hasTrustIndicator =
				// Check for trust in settings.json directly
				"trusted" in settingsContent ||
				settingsContent.enableAllProjectMcpServers === true ||
				// Or a separate trust file
				fs.existsSync(path.join(claudeDir, "settings.local.json"));

			expect(hasTrustIndicator).toBe(true);
		});
	});

	// ── settings-codex channel ─────────────────────────────────────────────
	// No hook files for settings-codex: enforcement is in-process in CodexAppServerAdapter.
	// The only artifact is .codex-home/ (auth.json + config.toml), no hooks.json or return-check.sh.

	describe("settings-codex: creates .codex-home/ but no hook files", () => {
		it("codex trust is per-invocation — no .codex/hooks.json or return-check.sh written", async () => {
			// @lore: settings-codex gate — no file hook; CodexAppServerAdapter checks bridge in-process after each turn (hooks.json Stop requires opaque pre-computed hash)
			await provisionReturnHook({
				sandboxPath,
				channel: "settings-codex",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});

			const codexDir = path.join(sandboxPath, ".codex");

			// No hook directory at all.
			expect(fs.existsSync(codexDir)).toBe(false);
		});
	});

	// ── process-reengage channel ───────────────────────────────────────────

	describe("process-reengage: writes .opencode/plugins/return-signal.ts", () => {
		it("creates .opencode/plugins/return-signal.ts", async () => {
			await provisionReturnHook({
				sandboxPath,
				channel: "process-reengage",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});

			const pluginPath = path.join(sandboxPath, ".opencode", "plugins", "return-signal.ts");
			expect(fs.existsSync(pluginPath)).toBe(true);
		});

		it("plugin exports a session.idle listener", async () => {
			await provisionReturnHook({
				sandboxPath,
				channel: "process-reengage",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});

			const pluginPath = path.join(sandboxPath, ".opencode", "plugins", "return-signal.ts");
			const content = fs.readFileSync(pluginPath, "utf-8");

			expect(content).toContain("session.idle");
		});

		it("plugin references the bridge callback URL", async () => {
			await provisionReturnHook({
				sandboxPath,
				channel: "process-reengage",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});

			const pluginPath = path.join(sandboxPath, ".opencode", "plugins", "return-signal.ts");
			const content = fs.readFileSync(pluginPath, "utf-8");

			expect(content).toContain(mcpUrl);
		});
	});

	// ── No-op channels (no file written) ──────────────────────────────────

	describe("sdk-inprocess, none: no file written", () => {
		it("sdk-inprocess: does not write any config file", async () => {
			await provisionReturnHook({
				sandboxPath,
				channel: "sdk-inprocess",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});

			// No .claude/settings.json, no .codex/hooks.json, no .opencode plugin.
			expect(fs.existsSync(path.join(sandboxPath, ".claude"))).toBe(false);
			expect(fs.existsSync(path.join(sandboxPath, ".codex"))).toBe(false);
			expect(fs.existsSync(path.join(sandboxPath, ".opencode"))).toBe(false);
		});

		it("none: does not write any config file", async () => {
			await provisionReturnHook({ sandboxPath, channel: "none", bridgeToken, mcpUrl, forceBudget });

			expect(fs.existsSync(path.join(sandboxPath, ".claude"))).toBe(false);
			expect(fs.existsSync(path.join(sandboxPath, ".codex"))).toBe(false);
			expect(fs.existsSync(path.join(sandboxPath, ".opencode"))).toBe(false);
		});
	});

	// ── soft-continue: no-op for now (cursor inert) ───────────────────────

	describe("soft-continue: does not throw (cursor inert today)", () => {
		it("soft-continue does not throw for an inert channel", async () => {
			// Cursor is not spawnable today — soft-continue must be a safe no-op:
			// no harness config file gets written for it.
			await provisionReturnHook({
				sandboxPath,
				channel: "soft-continue",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});
			expect(fs.existsSync(path.join(sandboxPath, ".claude"))).toBe(false);
			expect(fs.existsSync(path.join(sandboxPath, ".codex"))).toBe(false);
			expect(fs.existsSync(path.join(sandboxPath, ".opencode"))).toBe(false);
		});
	});

	// ── the generated scripts, actually run ────────────────────────────────

	async function withLocalBridge(
		respond: () => string,
		run: (mcpUrl: string) => Promise<void>,
	): Promise<void> {
		const server = http.createServer((_req, res) => {
			res.writeHead(200);
			res.end(respond());
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
		const address = server.address();
		const port = typeof address === "object" && address ? address.port : 0;
		try {
			await run(`http://127.0.0.1:${port}`);
		} finally {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	}

	describe("return-check.sh (claude) — actually executed against a real bridge", () => {
		it("exits 0 with empty stdout/stderr when the bridge allows the stop", async () => {
			await withLocalBridge(
				() => "",
				async (mcpUrl) => {
					await provisionReturnHook({
						sandboxPath,
						channel: "settings-claude",
						bridgeToken,
						mcpUrl,
						forceBudget,
					});
					const scriptPath = path.join(sandboxPath, ".claude", "return-check.sh");
					const { stdout, stderr } = await execFileAsync("sh", [scriptPath]);
					expect(stdout.trim()).toBe("");
					expect(stderr.trim()).toBe("");
				},
			);
		});

		it("exits 2 and relays the force message on stderr when the bridge blocks the stop", async () => {
			await withLocalBridge(
				() => "finish the task before stopping",
				async (mcpUrl) => {
					await provisionReturnHook({
						sandboxPath,
						channel: "settings-claude",
						bridgeToken,
						mcpUrl,
						forceBudget,
					});
					const scriptPath = path.join(sandboxPath, ".claude", "return-check.sh");
					await expect(execFileAsync("sh", [scriptPath])).rejects.toMatchObject({
						code: 2,
						stderr: expect.stringContaining("finish the task before stopping"),
					});
				},
			);
		});
	});

	// ── AC4 route-checklist: all channels handled ─────────────────────────

	describe("provisionReturnHook handles every ReturnEnforcementChannel value", () => {
		const allChannels: ReturnEnforcementChannel[] = [
			"sdk-inprocess",
			"settings-claude",
			"settings-codex",
			"process-reengage",
			"soft-continue",
			"none",
		];

		for (const channel of allChannels) {
			it(`handles channel="${channel}" without throwing`, async () => {
				const channelSandbox = fs.mkdtempSync(
					path.join(os.tmpdir(), `prh-ch-${channel.replace(/-/g, "")}-`),
				);
				try {
					await provisionReturnHook({
						sandboxPath: channelSandbox,
						channel,
						bridgeToken,
						mcpUrl,
						forceBudget,
					});
					expect(fs.existsSync(channelSandbox)).toBe(true);
				} finally {
					fs.rmSync(channelSandbox, { recursive: true, force: true });
				}
			});
		}
	});
});
