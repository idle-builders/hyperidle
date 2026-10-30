/**
 * Per-harness return-enforcement hook provisioning. Writes the hook artifact
 * appropriate to the harness's declared channel, called at sandbox setup time (BEFORE startSession).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ReturnEnforcementChannel } from "@hyperidle/harness-capability";

interface ReturnHookOptions {
	readonly sandboxPath: string;
	readonly channel: ReturnEnforcementChannel;
	readonly bridgeToken: string;
	readonly mcpUrl: string;
	readonly forceBudget: number;
}

/**
 * Provision the return-enforcement hook for the given channel. Idempotent.
 * @lore: workspace trust — must be established for file-based channels; Claude Code silently ignores hooks in untrusted workspaces; missing trust → forceCount=0
 */
function installReturnHook(opts: ReturnHookOptions): void {
	const { sandboxPath, channel, bridgeToken, mcpUrl } = opts;

	switch (channel) {
		case "settings-claude":
			provisionClaudeSettings(sandboxPath, bridgeToken, mcpUrl);
			break;

		case "settings-codex":
			provisionCodexHome(sandboxPath, bridgeToken, mcpUrl);
			break;

		case "process-reengage":
			provisionOpencodePlugin(sandboxPath, bridgeToken, mcpUrl);
			break;

		// No-op channels: enforcement is handled in-process or not at all.
		case "sdk-inprocess":
		case "soft-continue":
		case "none":
			// No file artifact written for these channels.
			break;
	}
}

// ── Private provisioning helpers ──────────────────────────────────────────────

/**
 * settings-claude: Write .claude/settings.json with a Stop hook.
 * @lore: claude settings hook — script: .claude/return-check.sh; settings.json references the path; exit-2+stderr; enableAllProjectMcpServers establishes trust
 */
function provisionClaudeSettings(sandboxPath: string, bridgeToken: string, mcpUrl: string): void {
	const claudeDir = path.join(sandboxPath, ".claude");
	fs.mkdirSync(claudeDir, { recursive: true });

	const scriptPath = path.join(claudeDir, "return-check.sh");
	const scriptContent = buildReturnCheckScript(bridgeToken, mcpUrl);
	fs.writeFileSync(scriptPath, scriptContent, { encoding: "utf-8", mode: 0o755 });

	// The command references only the script path (no shell chars in JSON). bridgeUrl is metadata (Claude Code ignores unknown fields).
	const settings = {
		enableAllProjectMcpServers: true,
		enabledMcpjsonServers: ["hyperidle"],
		hooks: {
			Stop: [
				{
					hooks: [
						{
							type: "command",
							command: ".claude/return-check.sh",
							bridgeUrl: mcpUrl,
						},
					],
				},
			],
		},
	};

	fs.writeFileSync(
		path.join(claudeDir, "settings.json"),
		JSON.stringify(settings, null, 2),
		"utf-8",
	);
}

/**
 * settings-codex: Create per-session CODEX_HOME with a notify-based return gate.
 * Also writes .codex/hooks.json for backward-compat with unit tests.
 * @lore: codex hooks trust — hooks.json Stop hooks require a pre-computed SHA256 hash in config.toml; hash algorithm is opaque; notify fires without hash trust
 */
function provisionCodexHome(sandboxPath: string, bridgeToken: string, mcpUrl: string): void {
	const codexDir = path.join(sandboxPath, ".codex");
	fs.mkdirSync(codexDir, { recursive: true });

	const scriptPath = path.join(codexDir, "return-check.sh");
	const scriptContent = buildCodexReturnCheckScript(bridgeToken, mcpUrl);
	fs.writeFileSync(scriptPath, scriptContent, { encoding: "utf-8", mode: 0o755 });

	const hooksConfig = buildCodexHooksConfig(codexDir);

	fs.writeFileSync(
		path.join(codexDir, "hooks.json"),
		JSON.stringify(hooksConfig, null, 2),
		"utf-8",
	);

	// .codex-home/ is the real enforcement path; CodexAppServerAdapter sets CODEX_HOME to it.
	const codexHomeDir = path.join(sandboxPath, ".codex-home");
	fs.mkdirSync(codexHomeDir, { recursive: true });

	// @lore: codex copy — copy auth.json + config.toml; SQLite files lock and crash codex; strip approvals_reviewer from config.toml (interactive hang in non-TTY)
	const userCodexDir = path.join(process.env.HOME ?? process.env.USERPROFILE ?? "/root", ".codex");
	for (const file of ["auth.json", "config.toml"]) {
		const src = path.join(userCodexDir, file);
		const dst = path.join(codexHomeDir, file);
		try {
			// Don't overwrite config.toml — may already have the per-session [mcp_servers.hyperidle] block.
			if (file === "config.toml" && fs.existsSync(dst)) continue;
			fs.copyFileSync(src, dst);
		} catch {
			// File absent — fine; codex will use env-based auth.
		}
	}

	const perSessionConfigPath = path.join(codexHomeDir, "config.toml");
	try {
		let tomlContent = fs.readFileSync(perSessionConfigPath, "utf-8");
		// Strip approvals_reviewer — let codex use its built-in headless default.
		tomlContent = tomlContent.replace(/^approvals_reviewer\s*=\s*"[^"]*"\n?/gm, "");
		// Strip any existing notify line — we inject our own below.
		tomlContent = tomlContent.replace(/^notify\s*=\s*\[.*\]\n?/gm, "");
		fs.writeFileSync(perSessionConfigPath, tomlContent, "utf-8");
	} catch {
		// config.toml absent — nothing to strip.
	}

	// @lore: realpath for trust — macOS /var/folders is a symlink to /private/var/folders; trust entry must use the real path
	const realSandboxPath = fs.realpathSync(sandboxPath);
	fs.appendFileSync(
		perSessionConfigPath,
		`\n[projects."${realSandboxPath}"]\ntrust_level = "trusted"\n`,
		"utf-8",
	);

	// @lore: notify gate — inject notify at top level (before any [section]); fires on turn-ended without hash trust; hooks.json Stop requires pre-computed hash
	const notifyScriptPath = path.join(codexHomeDir, "notify.sh");
	const notifyScriptContent = buildCodexNotifyScript(bridgeToken, mcpUrl);
	fs.writeFileSync(notifyScriptPath, notifyScriptContent, { encoding: "utf-8", mode: 0o755 });

	const currentToml = fs.readFileSync(perSessionConfigPath, "utf-8");
	const notifyLine = `notify = ["${notifyScriptPath}", "turn-ended"]\n`;
	const firstSection = currentToml.indexOf("[");
	const newToml =
		firstSection === -1
			? `${currentToml}\n${notifyLine}`
			: `${currentToml.slice(0, firstSection)}${notifyLine}\n${currentToml.slice(firstSection)}`;
	fs.writeFileSync(perSessionConfigPath, newToml, "utf-8");
}

/** Build the codex hooks.json config referencing a return-check.sh at an absolute path (so codex finds it regardless of working directory). */
function buildCodexHooksConfig(scriptDir: string): Record<string, unknown> {
	return {
		hooks: {
			Stop: [
				{
					hooks: [
						{
							type: "command",
							command: path.join(scriptDir, "return-check.sh"),
							timeout: 10,
						},
					],
				},
			],
		},
	};
}

/**
 * Build the Claude Code Stop hook script. Protocol: empty body → exit 0; forceMessage → stderr + exit 2.
 * Single-quoted shell strings prevent variable expansion (both values are server-minted hex/URL).
 */
function buildReturnCheckScript(bridgeToken: string, mcpUrl: string): string {
	return [
		"#!/bin/sh",
		"# HyperIdle return-enforcement hook (Claude Code) — auto-generated, do not edit.",
		`response=$(curl -s -X POST '${mcpUrl}/return-status' \\`,
		`  -H 'Authorization: Bearer ${bridgeToken}' \\`,
		`  -H 'Content-Type: application/json' -d '{}' 2>&1)`,
		'if [ -n "$response" ]; then',
		'  printf "%s\\n" "$response" >&2',
		"  exit 2",
		"fi",
	].join("\n");
}

/**
 * Build the Codex Stop hook script. Protocol: empty body → {"decision":"approve"}; forceMessage → {"decision":"block","reason":"..."}.
 * Used for .codex/hooks.json (unit test backward-compat path only).
 */
function buildCodexReturnCheckScript(bridgeToken: string, mcpUrl: string): string {
	return [
		"#!/bin/sh",
		"# HyperIdle return-enforcement hook (Codex) — auto-generated, do not edit.",
		`response=$(curl -s -X POST '${mcpUrl}/return-status' \\`,
		`  -H 'Authorization: Bearer ${bridgeToken}' \\`,
		`  -H 'Content-Type: application/json' -d '{}' 2>&1)`,
		'if [ -n "$response" ]; then',
		'  printf \'{"decision":"block","reason":"%s"}\' "$response"',
		"  exit 0",
		"fi",
		'printf \'{"decision":"approve"}\'',
	].join("\n");
}

/**
 * Build the Codex notify script. Called by config.toml notify on "turn-ended".
 * Output is ignored by codex — this is a fire-and-forget notification to the bridge.
 */
function buildCodexNotifyScript(bridgeToken: string, mcpUrl: string): string {
	return [
		"#!/bin/sh",
		"# HyperIdle turn-ended notify script (Codex) — auto-generated, do not edit.",
		`curl -s -X POST '${mcpUrl}/return-status' \\`,
		`  -H 'Authorization: Bearer ${bridgeToken}' \\`,
		`  -H 'Content-Type: application/json' -d '{}' >/dev/null 2>&1`,
	].join("\n");
}

/**
 * process-reengage: Write .opencode/plugins/return-signal.ts.
 */
function provisionOpencodePlugin(sandboxPath: string, bridgeToken: string, mcpUrl: string): void {
	const pluginDir = path.join(sandboxPath, ".opencode", "plugins");
	fs.mkdirSync(pluginDir, { recursive: true });

	const pluginContent = `/**
 * HyperIdle return-enforcement plugin for OpenCode.
 * Auto-generated by provisionReturnHook — do not edit.
 * Bridge: ${mcpUrl}
 */

export default {
  name: "hyperidle-return-enforcement",
  version: "1.0.0",
  async setup(ctx) {
    ctx.on("session.idle", async () => {
      try {
        const response = await fetch("${mcpUrl}/return-status", {
          method: "POST",
          headers: {
            "Authorization": "Bearer ${bridgeToken}",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const text = await response.text();
        if (text && text.trim().length > 0) {
          // Bridge returned a forceMessage — re-engage the session.
          await ctx.sendMessage(text.trim());
        }
      } catch {
        // Bridge unreachable — allow stop (drain-gate floor backstops).
      }
    });
  },
};
`;

	fs.writeFileSync(path.join(pluginDir, "return-signal.ts"), pluginContent, "utf-8");
}

export { installReturnHook };
