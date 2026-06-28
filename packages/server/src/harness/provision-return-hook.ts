/**
 * AL6 v4-final — Per-harness return-enforcement hook provisioning.
 *
 * `provisionReturnHook` is called at sandbox setup time (Phase 8b in
 * session-provisioning.ts, BEFORE startSession) to install the enforcement
 * artifact appropriate to the harness's declared channel.
 *
 * Dispatch table:
 *   "settings-claude"  → writes .claude/settings.json with Stop hook + trust
 *   "settings-codex"   → writes .codex-home/ (per-session CODEX_HOME) with
 *                         auth.json + config.toml copied from ~/.codex + hooks.json
 *                         containing Stop hook. CliHarnessAdapter detects this dir
 *                         and sets CODEX_HOME=<sandboxPath>/.codex-home when spawning codex.
 *   "process-reengage" → writes .opencode/plugins/return-signal.ts
 *   "sdk-inprocess"    → no-op (dead — no adapter declares this; kept in union for backward compat)
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
 *
 * @lore AL6 codex-codex-home: Codex reads hooks from CODEX_HOME/hooks.json
 * (default: ~/.codex/hooks.json); a project-local .codex/hooks.json is only
 * honored in *trusted* projects, so our per-session CODEX_HOME is the reliable channel.
 * CODEX_HOME redirect works when we copy ONLY auth.json + config.toml (not the SQLite
 * database files) — those lock and cause codex to exit before making an LLM call.
 * Per-session CODEX_HOME is created at <sandboxPath>/.codex-home/ for isolation.
 * Verified with codex-cli v0.141.0: CODEX_HOME env var is respected; hook fires
 * and bridge receives POST. See AL6-real-harness-return-enforcement.integration.test.ts.
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
			await provisionCodexHome(sandboxPath, bridgeToken, mcpUrl);
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

// ── AO2: EMITTED_ROOTS exports for scaffolding-drift-guard ───────────────────

/**
 * Root directories emitted by provisionClaudeSettings.
 * Exported so the AO2 scaffolding-drift-guard can assert coverage without
 * re-hardcoding the path list in the test.
 *
 * @lore AO2 C2: Exported separately per provisioner so the drift-guard can
 * enumerate ALL provisioners (Claude, Codex, OpenCode) rather than just Claude.
 */
export const EMITTED_ROOTS_CLAUDE_SETTINGS = [".claude"] as const;

/**
 * Root directories emitted by provisionCodexHome.
 * .codex for backward-compat (unit tests + legacy); .codex-home for the real
 * per-session CODEX_HOME that codex actually reads.
 */
export const EMITTED_ROOTS_CODEX_HOME = [".codex", ".codex-home"] as const;

/**
 * Root directories emitted by provisionOpencodePlugin.
 */
export const EMITTED_ROOTS_OPENCODE_PLUGIN = [".opencode"] as const;

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
 * settings-codex: Create a per-session CODEX_HOME directory and write hooks.json.
 *
 * CODEX_HOME strategy (v4 proven path):
 *   - Codex reads hooks ONLY from CODEX_HOME/hooks.json (default: ~/.codex/hooks.json).
 *   - Project-local .codex/hooks.json is silently ignored by codex.
 *   - Per-session CODEX_HOME = <sandboxPath>/.codex-home/
 *   - Contents: auth.json + config.toml (copied from ~/.codex, NOT symlinked) + hooks.json
 *   - SQLite database files (.sqlite, .sqlite-wal, .sqlite-shm) are intentionally excluded —
 *     copying them triggers a file-lock and codex exits before the LLM call.
 *   - CliHarnessAdapter detects .codex-home/ in the sandbox and sets CODEX_HOME=<path>.
 *   - --dangerously-bypass-hook-trust is passed at spawn time to bypass hash-check.
 *
 * This function ALSO writes .codex/hooks.json for backward-compat with unit tests
 * that inspect the sandbox .codex/ directory.
 *
 * @lore AL6 codex-codex-home: Verified end-to-end with codex-cli v0.141.0:
 *   1. Per-session CODEX_HOME created with auth.json + config.toml + hooks.json
 *   2. Codex spawned with CODEX_HOME=<sandboxPath>/.codex-home + --dangerously-bypass-hook-trust
 *   3. Stop hook fires → bridge POST received → callCount >= 1 proven.
 *   Previous attempts copied the full ~/.codex/ (with SQLite files) → file-lock → codex crash.
 *   Solution: copy only auth.json + config.toml (absent these, codex works with env-based auth).
 *
 * @lore AL6 WARN-F1 (real codex v0.141.0): The hooks.json format is:
 * ```json
 * { "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "..." }] }] } }
 * ```
 * NOT a top-level "Stop" key. The old flat format `{ "Stop": { "command": "..." } }`
 * is WRONG and silently ignored by codex.
 *
 * @lore AL6 WARN-F1 (codex decision:block): Codex Stop hooks accept JSON-on-stdout
 * (`{"decision":"block","reason":"..."}` blocks+re-prompts); recent codex also accepts
 * exit-2+stderr like Claude, but we use the JSON form.
 * stdout `{"decision":"approve"}` or exit 0 with no JSON allows the stop.
 */
async function provisionCodexHome(
	sandboxPath: string,
	bridgeToken: string,
	mcpUrl: string,
): Promise<void> {
	// ── 1. Backward-compat: write .codex/hooks.json (for unit tests + legacy path).
	const codexDir = path.join(sandboxPath, ".codex");
	fs.mkdirSync(codexDir, { recursive: true });

	// Write the codex-specific return-check script (uses decision:block JSON on stdout,
	// not exit 2 + stderr like Claude Code).
	const scriptPath = path.join(codexDir, "return-check.sh");
	const scriptContent = buildCodexReturnCheckScript(bridgeToken, mcpUrl);
	fs.writeFileSync(scriptPath, scriptContent, { encoding: "utf-8", mode: 0o755 });

	// @lore AL6 WARN-F1: Codex hooks.json format verified against real installed binary.
	const hooksConfig = buildCodexHooksConfig(codexDir);

	fs.writeFileSync(
		path.join(codexDir, "hooks.json"),
		JSON.stringify(hooksConfig, null, 2),
		"utf-8",
	);

	// ── 2. Per-session CODEX_HOME: create .codex-home/ with auth + config + hooks.
	//
	// @lore AL6 codex-codex-home: This is the REAL enforcement path that makes the
	// Stop hook fire when codex is spawned by CliHarnessAdapter. The .codex/ dir above
	// is the legacy/compat path for unit tests. CliHarnessAdapter sets CODEX_HOME to
	// this directory when it detects it exists.
	const codexHomeDir = path.join(sandboxPath, ".codex-home");
	fs.mkdirSync(codexHomeDir, { recursive: true });

	// Copy ONLY auth.json and config.toml from ~/.codex — NOT the SQLite database files.
	// @lore AL6 codex-codex-home: SQLite files (.sqlite, .sqlite-wal, .sqlite-shm) get
	// locked when a second codex process tries to open them → codex exits immediately.
	// Absent auth.json/config.toml: codex falls back to env-based auth (OPENAI_API_KEY)
	// which still works. Copy them when present to preserve user's model config.
	const userCodexDir = path.join(process.env.HOME ?? process.env.USERPROFILE ?? "/root", ".codex");
	for (const file of ["auth.json", "config.toml"]) {
		const src = path.join(userCodexDir, file);
		const dst = path.join(codexHomeDir, file);
		try {
			fs.copyFileSync(src, dst);
		} catch {
			// File absent — fine; codex will use env-based auth.
		}
	}

	// Write per-session hooks.json in CODEX_HOME — this is what codex actually reads.
	const homeScriptPath = path.join(codexHomeDir, "return-check.sh");
	fs.writeFileSync(homeScriptPath, scriptContent, { encoding: "utf-8", mode: 0o755 });

	// The hook command uses an absolute path (the CODEX_HOME script) so it works
	// regardless of codex's working directory.
	const homeHooksConfig = buildCodexHooksConfig(codexHomeDir);
	fs.writeFileSync(
		path.join(codexHomeDir, "hooks.json"),
		JSON.stringify(homeHooksConfig, null, 2),
		"utf-8",
	);
}

/**
 * Build the codex hooks.json config structure referencing a return-check.sh in the given dir.
 *
 * @lore AL6 WARN-F1: Uses absolute path to the script so codex can find it regardless of
 * the working directory it was spawned in.
 */
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
 * Build the shell script content for a Claude Code return-enforcement Stop hook.
 *
 * Protocol (Claude Code — exit 2 + stderr):
 *   - Bridge returns empty body → exit 0 (allow stop).
 *   - Bridge returns a forceMessage → write to stderr + exit 2 (block stop;
 *     Claude Code re-prompts with the stderr content as a blocking message).
 *
 * @lore AL6 WARN-F1: The script uses single-quoted shell strings for the URL and
 * token to prevent shell variable expansion. Both values are server-minted
 * (hex-token + localhost URL) and contain no single-quote characters.
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
 * Build the shell script content for a Codex return-enforcement Stop hook.
 *
 * Protocol (Codex — decision:block JSON on stdout):
 *   - Bridge returns empty body → print {"decision":"approve"} and exit 0 (allow stop).
 *   - Bridge returns a forceMessage → print {"decision":"block","reason":"..."} on stdout
 *     and exit 0 (Codex re-prompts with the reason).
 *
 * @lore AL6 WARN-F1 (real codex v0.141.0): Codex Stop hooks use JSON stdout semantics,
 * NOT exit 2 + stderr like Claude Code. Verified by running codex with a blocking
 * Stop hook that returns {"decision":"block","reason":"..."} — codex correctly
 * re-prompted with the reason text.
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
