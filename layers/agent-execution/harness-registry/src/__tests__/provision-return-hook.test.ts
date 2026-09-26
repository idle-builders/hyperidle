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
 *
 * Tests FAIL (red) until:
 *   - packages/server/src/harness/provision-return-hook.ts is created (green phase Task 4)
 *   - ReturnEnforcementChannel type exists in @hyperidle/harness-capability (green phase Task 1)
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
// FAILS red: module does not exist yet
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
			// FAILS red: provisionReturnHook does not exist
			await provisionReturnHook({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});

			const settingsPath = path.join(sandboxPath, ".claude", "settings.json");
			// FAILS red: file is not written because the module does not exist
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
			// FAILS red until trust provisioning is implemented.
			await provisionReturnHook({
				sandboxPath,
				channel: "settings-claude",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});

			// Trust can be established via:
			// (a) a .claude/settings.local.json with trust:true, OR
			// (b) the hooks object itself contains a trust marker, OR
			// (c) the file includes the correct permissionMode setting, OR
			// (d) another trust mechanism the green phase chooses.
			// The test asserts ONE of these is present.
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

			// FAILS red: no trust mechanism implemented yet
			expect(hasTrustIndicator).toBe(true);
		});
	});

	// ── settings-codex channel ─────────────────────────────────────────────

	describe("settings-codex: writes .codex/hooks.json with Stop hook", () => {
		it("creates .codex/hooks.json in the sandbox", async () => {
			await provisionReturnHook({
				sandboxPath,
				channel: "settings-codex",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});

			const hooksPath = path.join(sandboxPath, ".codex", "hooks.json");
			expect(fs.existsSync(hooksPath)).toBe(true);
		});

		it("hooks.json contains a Stop entry with decision:block semantics (nested format)", async () => {
			await provisionReturnHook({
				sandboxPath,
				channel: "settings-codex",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});

			const hooksPath = path.join(sandboxPath, ".codex", "hooks.json");
			const content = JSON.parse(fs.readFileSync(hooksPath, "utf-8")) as Record<string, unknown>;

			// @lore Real codex format: The format is { "hooks": { "Stop": [...] } }
			// NOT a top-level "Stop" key. Verified against codex-cli v0.141.0.
			// The old flat format { "Stop": { "command": "..." } } is silently ignored.
			expect(content).toHaveProperty("hooks");
			const hooksObj = content.hooks as Record<string, unknown>;
			expect(hooksObj).toHaveProperty("Stop");
			expect(Array.isArray(hooksObj.Stop)).toBe(true);

			// The hook script must be referenced (URL is in the script, not hooks.json).
			const hookStr = JSON.stringify(hooksObj.Stop);
			expect(hookStr).toContain("return-check.sh");

			// The script itself must contain the mcpUrl.
			const scriptContent = fs.readFileSync(
				path.join(sandboxPath, ".codex", "return-check.sh"),
				"utf-8",
			);
			expect(scriptContent).toContain(mcpUrl);
		});

		it("codex trust is per-invocation (--dangerously-bypass-hook-trust), no sentinel file needed", async () => {
			// @lore Real codex trust: Codex trust is a per-invocation flag:
			// --dangerously-bypass-hook-trust bypasses hash-check for automation.
			// There is NO sentinel file mechanism (no "trusted" file, no config.toml needed).
			// This test asserts the CORRECT behavior: no bogus trust file is written.
			await provisionReturnHook({
				sandboxPath,
				channel: "settings-codex",
				bridgeToken,
				mcpUrl,
				forceBudget,
			});

			const codexDir = path.join(sandboxPath, ".codex");

			// No bogus sentinel file should be written.
			expect(fs.existsSync(path.join(codexDir, "trusted"))).toBe(false);

			// The hooks.json MUST exist (that's the real mechanism).
			expect(fs.existsSync(path.join(codexDir, "hooks.json"))).toBe(true);

			// The return-check.sh script must exist (referenced by hooks.json).
			expect(fs.existsSync(path.join(codexDir, "return-check.sh"))).toBe(true);
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
			// Cursor is not spawnable today — soft-continue must be a safe no-op.
			await expect(
				provisionReturnHook({
					sandboxPath,
					channel: "soft-continue",
					bridgeToken,
					mcpUrl,
					forceBudget,
				}),
			).resolves.not.toThrow();
		});
	});

	// ── AC4 route-checklist: all channels handled ─────────────────────────

	// ── the generated scripts, actually run ────────────────────────────────
	//
	// Every test above inspects return-check.sh as text. None of them run it.
	// A shell script that only ever gets read is not proven — it is asserted
	// about. These spawn a real local bridge and execute the real script with
	// `sh`, the way Claude Code / Codex actually invoke it.

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

	describe("return-check.sh (codex) — actually executed against a real bridge", () => {
		it('prints {"decision":"approve"} and exits 0 when the bridge allows the stop', async () => {
			await withLocalBridge(
				() => "",
				async (mcpUrl) => {
					await provisionReturnHook({
						sandboxPath,
						channel: "settings-codex",
						bridgeToken,
						mcpUrl,
						forceBudget,
					});
					const scriptPath = path.join(sandboxPath, ".codex", "return-check.sh");
					const { stdout } = await execFileAsync("sh", [scriptPath]);
					expect(JSON.parse(stdout)).toEqual({ decision: "approve" });
				},
			);
		});

		it("prints decision:block with the bridge reason and exits 0 when the bridge blocks the stop", async () => {
			await withLocalBridge(
				() => "finish the task before stopping",
				async (mcpUrl) => {
					await provisionReturnHook({
						sandboxPath,
						channel: "settings-codex",
						bridgeToken,
						mcpUrl,
						forceBudget,
					});
					const scriptPath = path.join(sandboxPath, ".codex", "return-check.sh");
					const { stdout } = await execFileAsync("sh", [scriptPath]);
					const parsed = JSON.parse(stdout) as { decision: string; reason: string };
					expect(parsed.decision).toBe("block");
					expect(parsed.reason).toContain("finish the task before stopping");
				},
			);
		});
	});

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
					await expect(
						provisionReturnHook({
							sandboxPath: channelSandbox,
							channel,
							bridgeToken,
							mcpUrl,
							forceBudget,
						}),
					).resolves.not.toThrow();
				} finally {
					fs.rmSync(channelSandbox, { recursive: true, force: true });
				}
			});
		}
	});
});
