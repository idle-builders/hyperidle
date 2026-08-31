/**
 * Per-harness action-gate PreToolUse hook provisioning.
 *
 * `installGateHook` is called at sandbox setup time (alongside the return hook)
 * when the session has one or more resolved action rules. It writes the
 * appropriate PreToolUse hook artifact for the session's harness channel.
 *
 * Dispatch table:
 *   "settings-claude"  → adds PreToolUse entry to .claude/settings.json
 *   "settings-codex"   → adds PreToolUse entry to .codex-home/hooks.json
 *   "soft-continue"    → adds PreToolUse entry to .cursor/hooks.json (cursor-agent)
 *   "process-reengage" → adds PreToolUse handler to opencode plugin
 *   others             → no-op (gate unsupported on this channel)
 *
 * Protocol: each harness pipes its hook event JSON to /action-check?harness=<type>.
 * The server returns the exact harness-specific JSON the hook should output
 * (allow or deny). The script is just:
 *
 *   cat | curl -s POST '<mcpUrl>/action-check?harness=<type>' \
 *     -H 'Authorization: Bearer <token>' \
 *     --data-binary @-
 *
 * @lore BA2 hook-format: the curl output IS the hook's stdout. The server
 * formats the JSON for the target harness, so no client-side jq or Python
 * is needed.
 *
 * @lore BA2 terse-deny: the deny message names ONLY the rule — no imperative.
 * The instruction to call submit_review lives in the seed prompt (Sonnet twice
 * refused an instruction inside a hook message as "characteristic of a prompt
 * injection embedded in tool output").
 *
 * @lore BA2 cursor-failClosed: cursor-agent fails OPEN (silently) by default
 * when a hook crashes. `failClosed: true` is required to fail closed on errors.
 *
 * @lore BA2 opencode-xdg-isolation: --pure was removed from the opencode adapter args
 * (adapter-pool.ts) so project plugins load. XDG_CONFIG_HOME is set in the adapter envMap
 * to <sandbox>/.xdg_config so the user's global ~/.config/opencode/plugins never loads in
 * a sandboxed session, while project plugins from <sandbox>/.opencode/plugins/ still load.
 * Empirically verified: probe plugin in <dir>/.opencode/plugins/ fires correctly without --pure.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ReturnEnforcementChannel } from "@hyperidle/harness-capability";

export interface GateHookOptions {
	readonly sandboxPath: string;
	readonly channel: ReturnEnforcementChannel;
	readonly bridgeToken: string;
	readonly mcpUrl: string;
	/** HyperIdle sessionId — baked into the opencode plugin so it can identify the session. */
	readonly sessionId?: string;
}

/**
 * Install the action-gate PreToolUse hook for the given channel.
 * Merges with any existing hook config (e.g. the Stop hook written by
 * installReturnHook) without overwriting it.
 *
 * This function is idempotent: calling it twice for the same sandboxPath
 * and channel overwrites the existing artifact with the same content.
 */
async function installGateHook(opts: GateHookOptions): Promise<void> {
	const { sandboxPath, channel, bridgeToken, mcpUrl, sessionId = "" } = opts;

	switch (channel) {
		case "settings-claude":
			await addClaudeGateHook(sandboxPath, bridgeToken, mcpUrl);
			break;
		case "settings-codex":
			await addCodexGateHook(sandboxPath, bridgeToken, mcpUrl);
			break;
		case "soft-continue":
			await addCursorGateHook(sandboxPath, bridgeToken, mcpUrl);
			break;
		case "process-reengage":
			await addOpencodeGatePlugin(sandboxPath, bridgeToken, mcpUrl, sessionId);
			break;
		default:
			// Other channels (sdk-inprocess, builtin-loop, none) don't support
			// PreToolUse gate hooks.
			break;
	}
}

// ── Gate check shell script ────────────────────────────────────────────────────

/**
 * Build the gate-check shell script for a given harness type.
 *
 * The script pipes the hook event JSON to /action-check?harness=<type>.
 * The server returns the exact harness-specific decision JSON.
 *
 * @lore BA2 injection-safe: the URL and token use single-quoted strings to
 * prevent shell variable expansion. Both are server-minted and contain no
 * single-quote characters.
 */
function buildGateCheckScript(bridgeToken: string, mcpUrl: string, harnessType: string): string {
	return [
		"#!/bin/sh",
		`# HyperIdle action gate hook (${harnessType}) — auto-generated, do not edit.`,
		`cat | curl -s -X POST '${mcpUrl}/action-check?harness=${harnessType}' \\`,
		`  -H 'Authorization: Bearer ${bridgeToken}' \\`,
		`  -H 'Content-Type: application/json' \\`,
		"  --data-binary @-",
	].join("\n");
}

// ── Claude Code: merge PreToolUse into .claude/settings.json ─────────────────

async function addClaudeGateHook(
	sandboxPath: string,
	bridgeToken: string,
	mcpUrl: string,
): Promise<void> {
	const claudeDir = path.join(sandboxPath, ".claude");
	fs.mkdirSync(claudeDir, { recursive: true });

	const scriptPath = path.join(claudeDir, "gate-check.sh");
	fs.writeFileSync(scriptPath, buildGateCheckScript(bridgeToken, mcpUrl, "claude"), {
		encoding: "utf-8",
		mode: 0o755,
	});

	const settingsPath = path.join(claudeDir, "settings.json");
	let settings: Record<string, unknown> = {};
	try {
		const raw = fs.readFileSync(settingsPath, "utf-8");
		settings = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		// File absent or unparseable — start fresh.
	}

	const hooks = (settings.hooks as Record<string, unknown>) ?? {};
	const preToolUse = (hooks.PreToolUse as unknown[]) ?? [];

	hooks.PreToolUse = [
		...preToolUse,
		{
			hooks: [
				{
					type: "command",
					command: ".claude/gate-check.sh",
				},
			],
		},
	];
	settings.hooks = hooks;

	fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

// ── Codex: merge PreToolUse into .codex-home/hooks.json ──────────────────────

async function addCodexGateHook(
	sandboxPath: string,
	bridgeToken: string,
	mcpUrl: string,
): Promise<void> {
	// Write the gate script into CODEX_HOME — same directory as return-check.sh.
	const codexHomeDir = path.join(sandboxPath, ".codex-home");
	fs.mkdirSync(codexHomeDir, { recursive: true });

	const scriptPath = path.join(codexHomeDir, "gate-check.sh");
	fs.writeFileSync(scriptPath, buildGateCheckScript(bridgeToken, mcpUrl, "codex"), {
		encoding: "utf-8",
		mode: 0o755,
	});

	const hooksPath = path.join(codexHomeDir, "hooks.json");
	let hooksConfig: Record<string, unknown> = { hooks: {} };
	try {
		const raw = fs.readFileSync(hooksPath, "utf-8");
		hooksConfig = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		// File absent — start fresh.
	}

	const hooks = (hooksConfig.hooks as Record<string, unknown>) ?? {};
	const preToolUse = (hooks.PreToolUse as unknown[]) ?? [];

	hooks.PreToolUse = [
		...preToolUse,
		{
			hooks: [
				{
					type: "command",
					command: scriptPath,
					timeout: 10,
				},
			],
		},
	];
	hooksConfig.hooks = hooks;

	fs.writeFileSync(hooksPath, JSON.stringify(hooksConfig, null, 2), "utf-8");
}

// ── cursor-agent: write .cursor/hooks.json ────────────────────────────────────

async function addCursorGateHook(
	sandboxPath: string,
	bridgeToken: string,
	mcpUrl: string,
): Promise<void> {
	const cursorDir = path.join(sandboxPath, ".cursor");
	fs.mkdirSync(cursorDir, { recursive: true });

	const scriptPath = path.join(cursorDir, "gate-check.sh");
	fs.writeFileSync(scriptPath, buildGateCheckScript(bridgeToken, mcpUrl, "cursor"), {
		encoding: "utf-8",
		mode: 0o755,
	});

	const hooksPath = path.join(cursorDir, "hooks.json");
	let hooksConfig: Record<string, unknown> = { hooks: {} };
	try {
		const raw = fs.readFileSync(hooksPath, "utf-8");
		hooksConfig = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		// absent — fresh.
	}

	const hooks = (hooksConfig.hooks as Record<string, unknown>) ?? {};
	const preToolUse = (hooks.PreToolUse as unknown[]) ?? [];

	hooks.PreToolUse = [
		...preToolUse,
		{
			hooks: [
				{
					type: "command",
					command: scriptPath,
					// @lore BA2 cursor-failClosed: cursor-agent fails OPEN (silently)
					// by default when a hook crashes. Required to fail closed.
					failClosed: true,
					timeout: 10,
				},
			],
		},
	];
	hooksConfig.hooks = hooks;

	fs.writeFileSync(hooksPath, JSON.stringify(hooksConfig, null, 2), "utf-8");
}

// ── opencode: add PreToolUse handler to plugin ────────────────────────────────

async function addOpencodeGatePlugin(
	sandboxPath: string,
	bridgeToken: string,
	mcpUrl: string,
	sessionId: string,
): Promise<void> {
	const pluginDir = path.join(sandboxPath, ".opencode", "plugins");
	fs.mkdirSync(pluginDir, { recursive: true });

	// @lore BA2 opencode-plugin-api: opencode plugins export a named async function that
	// returns an object keyed by hook name. The real plugin API is NOT the object-with-setup(ctx)
	// shape — that shape is silently ignored. Verified against pipeline.js in ~/.config/opencode/plugins.
	// @lore BA2 opencode-xdg-isolation: --pure was removed from the adapter args so project
	// plugins load. XDG_CONFIG_HOME is set in the adapter envMap to <sandbox>/.xdg_config to
	// prevent the user's global ~/.config/opencode/plugins from loading in a sandboxed session.
	// @lore BA2 opencode-session-id: sessionId is baked into the plugin at install time so the
	// action-check endpoint can look up the gate rule for the right HyperIdle session.
	const pluginContent = `/**
 * HyperIdle action gate plugin for OpenCode.
 * Auto-generated by installGateHook — do not edit.
 * Bridge: ${mcpUrl}
 * Session: ${sessionId}
 */

export const HyperIdleActionGate = async () => {
  return {
    "tool.execute.before": async (input) => {
      const toolName = input?.tool || "";
      try {
        const response = await fetch("${mcpUrl}/action-check?harness=opencode", {
          method: "POST",
          headers: {
            "Authorization": "Bearer ${bridgeToken}",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tool_name: toolName,
            tool_input: input?.input ?? {},
            sessionId: "${sessionId}",
          }),
        });
        const data = await response.json();
        if (data && data.decision === "deny") {
          const reason = data.reason || "Action blocked by gate rule";
          throw new Error(reason);
        }
      } catch (err) {
        // Re-throw gate errors; swallow network/parse errors (fail open).
        if (err instanceof Error && err.message.includes("Action blocked") || err instanceof Error && err.message.includes("blocked by")) {
          throw err;
        }
        // Network error — fail open rather than breaking the agent.
      }
    },
  };
};
`;

	fs.writeFileSync(path.join(pluginDir, "action-gate.ts"), pluginContent, "utf-8");
}

export { installGateHook };
