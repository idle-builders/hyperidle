/**
 * AL6 v4-final — Per-harness return-enforcement hook provisioning.
 *
 * `provisionReturnHook` is called at sandbox setup time (Phase 8b in
 * session-provisioning.ts, BEFORE startSession) to install the enforcement
 * artifact appropriate to the harness's declared channel.
 *
 * Dispatch table:
 *   "settings-claude"  → writes .claude/settings.json with Stop hook + trust
 *   "settings-codex"   → writes .codex/hooks.json with Stop hook + trust marker
 *   "process-reengage" → writes .opencode/plugins/return-signal.ts
 *   "sdk-inprocess"    → no-op (SDK Stop closure wired in startSession directly)
 *   "builtin-loop"     → no-op (in-process loop; no file artifact)
 *   "soft-continue"    → no-op (cursor inert today)
 *   "none"             → no-op (drain-gate floor only)
 *
 * WARN-F1: workspace trust is established for settings-claude and settings-codex
 * by writing the appropriate trust marker. Without it the harness silently skips
 * the project-local hook — producing not_returned with forceCount=0 (v1 regression).
 *
 * @lore AL6 v4-final: This module is the "write hook artifact" step that replaces
 * v3's rewriteSandboxForcing (which rewrote AGENTS.md with the forcing message).
 * v4 provisions the hook ONCE at setup; the hook fires natively at turn-end.
 * The bridge URL and token are server-minted — no agent-authored value enters the
 * shell command (no injection surface).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ReturnEnforcementChannel } from "@hyperidle/shared";

export type { ReturnEnforcementChannel };

export interface ProvisionReturnHookOptions {
	readonly sandboxPath: string;
	readonly channel: ReturnEnforcementChannel;
	readonly bridgeToken: string;
	readonly mcpUrl: string;
	readonly forceBudget: number;
}

/**
 * Provision the return-enforcement hook for the given channel.
 *
 * This function is idempotent: calling it twice for the same sandboxPath
 * and channel overwrites the existing artifact with the same content.
 *
 * @lore AL6 WARN-F1: The function ensures workspace trust for file-based channels.
 * Claude Code silently ignores project-level hooks in untrusted workspaces.
 * Codex requires a trust marker in the .codex/ directory. Writing the hook
 * without establishing trust is what caused the v1 forceCount=0 regression.
 */
export async function provisionReturnHook(opts: ProvisionReturnHookOptions): Promise<void> {
	const { sandboxPath, channel, bridgeToken, mcpUrl } = opts;

	switch (channel) {
		case "settings-claude":
			await provisionClaudeSettings(sandboxPath, bridgeToken, mcpUrl);
			break;

		case "settings-codex":
			await provisionCodexHooks(sandboxPath, bridgeToken, mcpUrl);
			break;

		case "process-reengage":
			await provisionOpencodePlugin(sandboxPath, bridgeToken, mcpUrl);
			break;

		// No-op channels: enforcement is handled in-process or not at all.
		case "sdk-inprocess":
		case "builtin-loop":
		case "soft-continue":
		case "none":
			// No file artifact written for these channels.
			break;
	}
}

// ── Private provisioning helpers ──────────────────────────────────────────────

/**
 * settings-claude: Write .claude/settings.json with a Stop hook.
 *
 * WARN-F1 (trust): We set `enableAllProjectMcpServers: true` in settings.json
 * to establish workspace trust. Claude Code loads project-level hooks only in
 * trusted workspaces; without this marker the Stop hook is silently skipped.
 *
 * The Stop hook uses exit-2+stderr semantics: a non-zero exit from the hook
 * command causes Claude Code to re-prompt with the stderr as the blocking message.
 *
 * @lore AL6 WARN-F1: We write the shell script to `.claude/return-check.sh` and
 * reference ONLY the script path in settings.json. This ensures settings.json
 * contains no shell-expansion characters (`$`, `>`, `|`, `;`, `&`) — the JSON
 * hook config is injection-safe, carrying only the server-minted script path.
 * The script itself contains shell syntax but is never interpolated in JSON.
 *
 * @lore AL6 WARN-F1: exit-2+stderr semantics: the hook must exit with code 2
 * and write the force message to stderr for Claude Code to treat it as a blocking
 * response. The curl command signals HyperIdle to check return status; HyperIdle
 * responds with forceMessage on stdout which the hook relays to stderr then exits 2.
 */
async function provisionClaudeSettings(
	sandboxPath: string,
	bridgeToken: string,
	mcpUrl: string,
): Promise<void> {
	const claudeDir = path.join(sandboxPath, ".claude");
	fs.mkdirSync(claudeDir, { recursive: true });

	// Write the shell script separately so settings.json has no shell-expansion chars.
	const scriptPath = path.join(claudeDir, "return-check.sh");
	const scriptContent = buildReturnCheckScript(bridgeToken, mcpUrl);
	fs.writeFileSync(scriptPath, scriptContent, { encoding: "utf-8", mode: 0o755 });

	// WARN-F1 trust: enableAllProjectMcpServers establishes workspace trust
	// so Claude Code loads project-level hooks. Without this, the Stop hook
	// in hooks.Stop is silently ignored.
	//
	// The command references only the script path (no shell chars in JSON).
	// We embed bridgeUrl as a metadata field so the hook config carries the URL
	// for observability/audit (Claude Code ignores unknown fields).
	const settings = {
		enableAllProjectMcpServers: true,
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
 * settings-codex: Write .codex/hooks.json with a Stop hook.
 *
 * WARN-F1 (trust): We write a `trusted` sentinel file in the .codex/ directory
 * to establish project trust. Codex loads project-local hooks only when the
 * project layer is trusted; without this the hook is silently skipped.
 *
 * @lore AL6 WARN-F1: Same script-file pattern as settings-claude — write the
 * shell script to `.codex/return-check.sh` and reference only the script path
 * in hooks.json so the JSON config has no shell-expansion characters.
 *
 * @lore AL6 WARN-F2: The Codex CLI hardcodes `args:["exec","proceed","--json"]`
 * in CLI_TOOL_CONFIGS; each session needs a per-session prompt carrier. The
 * hooks.json Stop hook is the mechanism to intercept turn-end before Codex exits.
 */
async function provisionCodexHooks(
	sandboxPath: string,
	bridgeToken: string,
	mcpUrl: string,
): Promise<void> {
	const codexDir = path.join(sandboxPath, ".codex");
	fs.mkdirSync(codexDir, { recursive: true });

	// WARN-F1 trust: write a `trusted` sentinel file so Codex loads project hooks.
	fs.writeFileSync(path.join(codexDir, "trusted"), "", "utf-8");

	// Write the shell script separately so hooks.json has no shell-expansion chars.
	const scriptPath = path.join(codexDir, "return-check.sh");
	const scriptContent = buildReturnCheckScript(bridgeToken, mcpUrl);
	fs.writeFileSync(scriptPath, scriptContent, { encoding: "utf-8", mode: 0o755 });

	// The command references only the script path (no shell chars in JSON).
	// We embed bridgeUrl as a metadata field for observability/audit.
	const hooks = {
		Stop: {
			command: ".codex/return-check.sh",
			bridgeUrl: mcpUrl,
		},
	};

	fs.writeFileSync(path.join(codexDir, "hooks.json"), JSON.stringify(hooks, null, 2), "utf-8");
}

/**
 * Build the shell script content for a return-enforcement Stop hook.
 *
 * The script is written to a file (`.claude/return-check.sh` or
 * `.codex/return-check.sh`) and the hook config references only the path.
 * This keeps the JSON hook config free of shell-expansion characters.
 *
 * Protocol: POST to the HyperIdle bridge /return-status endpoint.
 *   - Bridge returns empty body → agent stopped cleanly → exit 0 (allow stop).
 *   - Bridge returns a forceMessage → exit 2 with message on stderr (block stop,
 *     Claude Code re-prompts with the stderr content).
 *
 * @lore AL6 WARN-F1: The script uses single-quoted shell strings for the URL and
 * token to prevent shell variable expansion. Both values are server-minted
 * (hex-token + localhost URL) and contain no single-quote characters.
 */
function buildReturnCheckScript(bridgeToken: string, mcpUrl: string): string {
	return [
		"#!/bin/sh",
		"# HyperIdle return-enforcement hook — auto-generated, do not edit.",
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
 * process-reengage: Write .opencode/plugins/return-signal.ts.
 *
 * OpenCode does not have a native Stop hook. Instead we provision a plugin
 * that listens on the `session.idle` event and POSTs to the HyperIdle bridge.
 * If the bridge returns a forceMessage, the plugin injects it as a new user
 * message to re-engage the session.
 *
 * @lore AL6 WARN-F3: This is the "process-reengage" channel. It is weaker than
 * "settings-claude" because it requires the plugin runtime to be loaded and
 * session.idle to fire reliably. The drain-gate floor backstops any escape.
 */
async function provisionOpencodePlugin(
	sandboxPath: string,
	bridgeToken: string,
	mcpUrl: string,
): Promise<void> {
	const pluginDir = path.join(sandboxPath, ".opencode", "plugins");
	fs.mkdirSync(pluginDir, { recursive: true });

	// @lore AL6 WARN-F3: session.idle is the OpenCode lifecycle event that
	// fires when the agent's turn completes without further tool calls.
	// This is the closest analog to a "Stop hook" in OpenCode's plugin API.
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
