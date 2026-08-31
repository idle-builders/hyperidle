/**
 * Per-harness action gate hook provisioning (deny half).
 *
 * `installActionGate` is called at sandbox setup time after the MCP bridge is open.
 * It writes the hook artifact that intercepts EVERY tool call in the session and
 * POSTs to `/action-check` to get an allow/deny decision.
 *
 * Dispatch table:
 *   "settings-claude"  → appends PreToolUse hook to .claude/settings.json
 *   "settings-codex"   → appends PreToolUse hook to .codex-home/hooks.json
 *                        + writes execpolicy .rules backstop
 *   "settings-cursor"  → writes .cursor/hooks.json preToolUse + failClosed:true
 *   "process-reengage" → writes .opencode/plugin/hyperidle-gate.js (tool.execute.before)
 *                        + writes .hyperidle/opencode-permission.json (OPENCODE_PERMISSION backstop)
 *                        + creates .hyperidle/opencode-xdg-config/ (XDG_CONFIG_HOME isolation dir)
 *   other channels     → no-op (rule set empty, no gate needed)
 *
 * Fail-closed by construction on every harness:
 *   claude/codex/cursor — Python script catches all exceptions and prints deny JSON.
 *   cursor              — failClosed:true in hooks.json (cursor denies on script error).
 *   opencode            — plugin throws on deny; OPENCODE_PERMISSION backstop denies
 *                         if plugin fails to load.
 *
 * The sidecar scripts call `POST /api/mcp/<token>/action-check` which returns
 * `{"decision":"allow"}` or `{"decision":"deny","reason":"<description>"}`.
 * Each script reformats the response for its harness's wire protocol.
 *
 * @lore BA2: The gate scripts read the token and URL from closed-over values
 * written at provisioning time — no harness-authored value enters the URL or
 * the HTTP body. The server-minted token is the sole auth credential.
 *
 * @lore BA2: Gate hooks are separate from return enforcement hooks
 * (provision-return-hook.ts). Each harness may have BOTH — the return hook
 * fires at turn end (Stop), the gate hook fires before every tool call (PreToolUse).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ReturnEnforcementChannel } from "@hyperidle/harness-capability";
import type { GateRule } from "./action-gate-store.js";

export interface ActionGateOptions {
	readonly sandboxPath: string;
	readonly channel: ReturnEnforcementChannel;
	/** The MCP bridge token for this session (Bearer auth). */
	readonly bridgeToken: string;
	/** Full base URL of the action-check endpoint, e.g. `http://localhost:3001/api/mcp/<token>`. */
	readonly mcpUrl: string;
	/** Rules to enforce. Empty = no gate written (no-op). */
	readonly rules: readonly GateRule[];
}

/**
 * Provision the action gate hook for the given harness channel.
 *
 * When `rules` is empty, this is a no-op — no gate artifact is written and
 * the session proceeds ungated. Rules are provisioned at session-start time
 * and are frozen for the session's lifetime (the deny half; clearance lives
 * in the verdict half, which is a separate work package).
 */
async function installActionGate(opts: ActionGateOptions): Promise<void> {
	if (opts.rules.length === 0) return;

	const { sandboxPath, channel, bridgeToken, mcpUrl } = opts;

	switch (channel) {
		case "settings-claude":
			await appendClaudeGateHook(sandboxPath, bridgeToken, mcpUrl);
			break;

		case "settings-codex":
			await appendCodexGateHook(sandboxPath, bridgeToken, mcpUrl, opts.rules);
			break;

		case "settings-cursor":
			await writeCursorGateHook(sandboxPath, bridgeToken, mcpUrl);
			break;

		case "process-reengage":
			await writeOpencodeGate(sandboxPath, bridgeToken, mcpUrl, opts.rules);
			break;

		// No PreToolUse hook artifact for these channels.
		case "sdk-inprocess":
		case "soft-continue":
		case "none":
			break;
	}
}

// ── Shared helper ─────────────────────────────────────────────────────────────

/** Ensure a directory exists (idempotent). */
function mkdirp(dir: string): void {
	fs.mkdirSync(dir, { recursive: true });
}

// ── Claude Code ───────────────────────────────────────────────────────────────

/**
 * Append a PreToolUse hook to `.claude/settings.json`.
 *
 * The settings file is already written by `provisionClaudeSettings` (the return
 * enforcement step). This function MERGES the PreToolUse hook into the existing
 * `hooks` object rather than overwriting the file, so the Stop hook survives.
 *
 * The gate script is written to `.claude/gate-check.py` (separate from the hook
 * config so settings.json stays injection-safe — no shell chars in JSON).
 *
 * Wire protocol (claude PreToolUse):
 *   stdin: {"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{...}}
 *   stdout (deny): {"hookSpecificOutput":{"hookEventName":"PreToolUse",
 *                    "permissionDecision":"deny","permissionDecisionReason":"..."}}
 *   stdout (allow): exit 0, no output
 *   fail-closed: exception handler prints deny JSON on stdout
 *
 * @lore BA2: No matcher field — the gate script receives EVERY tool call and
 * POSTs to /action-check, which applies pattern matching server-side. Claude's
 * hook matcher is tool-name-only and cannot carry state; server-side is simpler.
 */
async function appendClaudeGateHook(
	sandboxPath: string,
	bridgeToken: string,
	mcpUrl: string,
): Promise<void> {
	const claudeDir = path.join(sandboxPath, ".claude");
	mkdirp(claudeDir);

	// Write the Python gate-check script.
	const scriptPath = path.join(claudeDir, "gate-check.py");
	fs.writeFileSync(scriptPath, buildPythonGateScript(bridgeToken, mcpUrl, "claude"), {
		encoding: "utf-8",
		mode: 0o755,
	});

	// Merge the PreToolUse hook into the existing settings.json.
	const settingsPath = path.join(claudeDir, "settings.json");
	let settings: Record<string, unknown> = {};
	try {
		settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
	} catch {
		// File absent or invalid — start fresh (provisionClaudeSettings runs first
		// so this branch only fires in tests that call installActionGate alone).
	}

	const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
	hooks.PreToolUse = [
		{
			hooks: [
				{
					type: "command",
					command: ".claude/gate-check.py",
				},
			],
		},
	];
	settings.hooks = hooks;

	fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

// ── Codex ─────────────────────────────────────────────────────────────────────

/**
 * Append a PreToolUse hook to `.codex-home/hooks.json` and write an execpolicy
 * `.rules` backstop.
 *
 * Wire protocol (codex PreToolUse — same schema as claude, intentionally):
 *   stdin: {"session_id":"...","tool_name":"Bash","tool_input":{...},...}
 *   stdout (deny): {"hookSpecificOutput":{"hookEventName":"PreToolUse",
 *                    "permissionDecision":"deny","permissionDecisionReason":"..."}}
 *   stdout (allow): exit 0, no output
 *   fail-closed: exception handler prints deny JSON on stdout
 *
 * Codex hooks fail OPEN on script error. The execpolicy `.rules` backstop
 * is the fail-closed spine for shell commands.
 *
 * @lore BA2: The hook is appended (not overridden) so the Stop return hook
 * that `provisionCodexHome` already wrote remains intact.
 */
async function appendCodexGateHook(
	sandboxPath: string,
	bridgeToken: string,
	mcpUrl: string,
	rules: readonly GateRule[],
): Promise<void> {
	const codexHomeDir = path.join(sandboxPath, ".codex-home");
	mkdirp(codexHomeDir);

	// Write the Python gate-check script into CODEX_HOME.
	const scriptPath = path.join(codexHomeDir, "gate-check.py");
	fs.writeFileSync(scriptPath, buildPythonGateScript(bridgeToken, mcpUrl, "codex"), {
		encoding: "utf-8",
		mode: 0o755,
	});

	// Merge PreToolUse hook into the existing hooks.json.
	const hooksPath = path.join(codexHomeDir, "hooks.json");
	let hooksConfig: Record<string, unknown> = { hooks: {} };
	try {
		hooksConfig = JSON.parse(fs.readFileSync(hooksPath, "utf-8")) as Record<string, unknown>;
	} catch {
		// File absent — start fresh.
	}
	const hooks = (hooksConfig.hooks ?? {}) as Record<string, unknown[]>;
	hooks.PreToolUse = [
		{
			hooks: [
				{
					type: "command",
					command: scriptPath, // absolute path — codex spawns from arbitrary cwd
					timeout: 10,
				},
			],
		},
	];
	hooksConfig.hooks = hooks;
	fs.writeFileSync(hooksPath, JSON.stringify(hooksConfig, null, 2), "utf-8");

	// Also write to the backward-compat .codex/ dir (unit tests inspect this).
	const legacyCodexDir = path.join(sandboxPath, ".codex");
	mkdirp(legacyCodexDir);
	const legacyScriptPath = path.join(legacyCodexDir, "gate-check.py");
	fs.writeFileSync(legacyScriptPath, buildPythonGateScript(bridgeToken, mcpUrl, "codex"), {
		encoding: "utf-8",
		mode: 0o755,
	});
	let legacyHooks: Record<string, unknown> = { hooks: {} };
	try {
		legacyHooks = JSON.parse(
			fs.readFileSync(path.join(legacyCodexDir, "hooks.json"), "utf-8"),
		) as Record<string, unknown>;
	} catch {
		/* empty */
	}
	const legacyHookMap = (legacyHooks.hooks ?? {}) as Record<string, unknown[]>;
	legacyHookMap.PreToolUse = [
		{
			hooks: [{ type: "command", command: legacyScriptPath, timeout: 10 }],
		},
	];
	legacyHooks.hooks = legacyHookMap;
	fs.writeFileSync(
		path.join(legacyCodexDir, "hooks.json"),
		JSON.stringify(legacyHooks, null, 2),
		"utf-8",
	);

	// Write execpolicy .rules backstop — fail-closed for shell commands.
	// @lore BA2: The hook fails OPEN on error; .rules fails CLOSED (broken file → codex
	// exits 1). We deny the specific patterns from our rules as a fallback.
	// The .rules format: one command-prefix pattern per line, prefix-matched against argv.
	const rulesDir = path.join(codexHomeDir, "rules");
	mkdirp(rulesDir);
	const rulesContent = buildCodexExecpolicyRules(rules);
	fs.writeFileSync(path.join(rulesDir, "gate.rules"), rulesContent, "utf-8");
}

/**
 * Build the execpolicy .rules content from action rules.
 *
 * The .rules format is an allowlist of shell command prefixes — anything not
 * matched is denied. To avoid over-blocking (the gate only restricts specific
 * patterns, not everything), we emit an allowlist-everything rule and then a
 * deny for any pattern that maps to a shell command (pattern starts with "bash"
 * or "*").
 *
 * @lore BA2: execpolicy .rules is the backstop. The main gate is the PreToolUse
 * hook. .rules only kicks in if the hook fails open. We emit `allow *` so normal
 * commands are not blocked by the presence of the file alone, then deny specific
 * patterns derived from action rules whose pattern suggests shell execution.
 */
function buildCodexExecpolicyRules(rules: readonly GateRule[]): string {
	const lines: string[] = [
		"# HyperIdle action gate — execpolicy backstop (auto-generated, do not edit)",
		"# Format: allow/deny <command-prefix-pattern>",
		"# This file is the fail-closed backstop when the PreToolUse hook fails open.",
	];
	// Start with a broad allow so commands not matched by gate rules proceed.
	lines.push("allow *");
	// Add deny entries for any rule whose pattern suggests shell/bash execution.
	for (const rule of rules) {
		const pat = rule.pattern.toLowerCase();
		if (pat === "*" || pat === "bash" || pat.startsWith("bash")) {
			// Broad rule — deny all shell commands as backstop.
			lines.push(`# Rule: ${rule.description}`);
			lines.push("deny *");
			break; // One deny * is enough.
		}
	}
	return `${lines.join("\n")}\n`;
}

// ── Cursor ────────────────────────────────────────────────────────────────────

/**
 * Write `.cursor/hooks.json` with a preToolUse hook and `failClosed: true`.
 *
 * Wire protocol (cursor preToolUse):
 *   stdin: {"hook_event_name":"preToolUse","tool_name":"Write","tool_input":{...},...}
 *   stdout (deny): {"permission":"deny","user_message":"<reason>"}
 *   stdout (allow): {"permission":"allow"} or exit 0, no output
 *   fail-closed: failClosed:true in hooks.json + exception handler prints deny JSON
 *
 * @lore BA2: NO matcher field — cursor's preToolUse hooks have no matcher.
 * The gate script receives every tool call; the script dispatches on tool_name.
 * Symlinked config paths are refused by cursor-agent — write real files only.
 */
async function writeCursorGateHook(
	sandboxPath: string,
	bridgeToken: string,
	mcpUrl: string,
): Promise<void> {
	const cursorDir = path.join(sandboxPath, ".cursor");
	mkdirp(cursorDir);

	// Write the Python gate-check script.
	const scriptPath = path.join(cursorDir, "gate-check.py");
	fs.writeFileSync(scriptPath, buildPythonGateScript(bridgeToken, mcpUrl, "cursor"), {
		encoding: "utf-8",
		mode: 0o755,
	});

	// Read existing hooks.json (may already have hooks from test fixtures etc.)
	const hooksPath = path.join(cursorDir, "hooks.json");
	let hooksConfig: Record<string, unknown> = { version: 1, hooks: {} };
	try {
		hooksConfig = JSON.parse(fs.readFileSync(hooksPath, "utf-8")) as Record<string, unknown>;
	} catch {
		/* File absent — start fresh. */
	}

	const hooks = (hooksConfig.hooks ?? {}) as Record<string, unknown[]>;
	// @lore BA2: failClosed:true is non-negotiable. Without it, a crashed gate
	// is an open gate — cursor silently allows on error, exit-nonzero, empty stdout,
	// or invalid JSON. The script also prints deny JSON on exception, but failClosed
	// is the defense-in-depth backstop when the Python interpreter itself is absent.
	hooks.preToolUse = [
		{
			command: scriptPath, // absolute path — cwd in cursor payload is ""
			failClosed: true,
		},
	];
	hooksConfig.hooks = hooks;

	fs.writeFileSync(hooksPath, JSON.stringify(hooksConfig, null, 2), "utf-8");
}

// ── OpenCode ──────────────────────────────────────────────────────────────────

/**
 * Write the opencode gate plugin and backstop files.
 *
 * Three artifacts:
 *   1. `.opencode/plugin/hyperidle-gate.js` — primary gate (tool.execute.before)
 *   2. `.hyperidle/opencode-permission.json` — OPENCODE_PERMISSION backstop JSON
 *   3. `.hyperidle/opencode-xdg-config/` — XDG_CONFIG_HOME isolation dir
 *      (cli-harness-adapter reads this dir's existence and sets XDG_CONFIG_HOME)
 *
 * Wire protocol (opencode tool.execute.before):
 *   First param (input): { tool: "<name>", sessionID: "...", callID: "..." }
 *   Second param (output): { args: { command: "...", ...tool-specific args } }
 *   Deny: throw Error("<reason>")
 *   Allow: return (do not throw)
 *
 * OPENCODE_PERMISSION format (last-match-wins globs):
 *   { "<toolName>": "deny" } — broad deny for any tool whose pattern matches
 *   { "<toolName>": { "*": "allow", "<pattern>": "deny" } } — per-command rule
 *
 * @lore BA2: `--pure` was removed from opencode's args (adapter-pool.ts).
 * XDG_CONFIG_HOME replaces it: hides user's global plugins/config while loading
 * the sandbox's gate plugin. The xdg config dir is created here (empty) so the
 * adapter's existence check works.
 *
 * @lore BA2: The plugin fails OPEN if it fails to load (opencode logs + continues).
 * OPENCODE_PERMISSION is the fail-closed backstop: set on the process env by
 * cli-harness-adapter reading .hyperidle/opencode-permission.json.
 */
async function writeOpencodeGate(
	sandboxPath: string,
	bridgeToken: string,
	mcpUrl: string,
	rules: readonly GateRule[],
): Promise<void> {
	const hpDir = path.join(sandboxPath, ".hyperidle");
	mkdirp(hpDir);

	// 1. Create XDG_CONFIG_HOME isolation dir.
	// cli-harness-adapter detects this dir and sets XDG_CONFIG_HOME accordingly.
	const xdgConfigDir = path.join(hpDir, "opencode-xdg-config");
	mkdirp(xdgConfigDir);

	// 2. Write OPENCODE_PERMISSION backstop.
	// Build a broad permission JSON from the rules: deny the tool names/patterns.
	const permissionConfig = buildOpencodePermissionConfig(rules);
	fs.writeFileSync(
		path.join(hpDir, "opencode-permission.json"),
		JSON.stringify(permissionConfig),
		"utf-8",
	);

	// 3. Write the gate plugin.
	const pluginDir = path.join(sandboxPath, ".opencode", "plugin");
	mkdirp(pluginDir);
	const pluginContent = buildOpencodeGatePlugin(bridgeToken, mcpUrl);
	fs.writeFileSync(path.join(pluginDir, "hyperidle-gate.js"), pluginContent, "utf-8");
}

/**
 * Build the OPENCODE_PERMISSION config JSON from action rules.
 *
 * Maps each rule pattern to a deny entry. The pattern is used as the tool name
 * (opencode tool names: "bash", "read", "write", "edit", "fetch", etc.).
 *
 * When the pattern is "*", all tools are denied. Otherwise the pattern is the
 * tool name (possibly with a `:` specifier which is stripped for the broad backstop).
 */
function buildOpencodePermissionConfig(rules: readonly GateRule[]): Record<string, unknown> {
	const config: Record<string, unknown> = {};
	for (const rule of rules) {
		const colonPart = rule.pattern.split(":")[0] ?? rule.pattern;
		const toolName = rule.pattern === "*" ? "*" : (colonPart.split("_")[0] ?? colonPart);
		if (toolName === "*") {
			// Deny all tools — overwrite everything with deny.
			return { "*": "deny" };
		}
		config[toolName] = "deny";
	}
	return config;
}

/**
 * Build the opencode gate plugin JS content.
 *
 * The plugin uses `fetch` (available in Bun/opencode runtime) to call /action-check.
 * On deny: throws Error with the rule description (opencode wraps this in tool error).
 * On error/timeout: throws a generic deny message (fail closed at call level).
 *
 * @lore BA2: Args are on the SECOND parameter (`output.args`), NOT `input`.
 * `input` carries only { tool, sessionID, callID }. The first attempt put them in
 * `input.input` which was always empty — proven by the research log showing
 * `BEFORE tool=bash … args={"command":"ls"}` on output.args.
 *
 * @lore BA2: Deny detection is from `data.decision`, NOT from error message text.
 * The archived first attempt did `err.message.includes("Action blocked")` which
 * broke when the bridge reason used different wording.
 */
function buildOpencodeGatePlugin(bridgeToken: string, mcpUrl: string): string {
	return `/**
 * HyperIdle action gate plugin for opencode.
 * Auto-generated by installActionGate — do not edit.
 * Bridge: ${mcpUrl}
 */

export const HyperiIdleGate = async ({ directory }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const toolName = input.tool ?? "";
      const actionCheckUrl = "${mcpUrl}/action-check";
      try {
        const resp = await fetch(actionCheckUrl, {
          method: "POST",
          headers: {
            "Authorization": "Bearer ${bridgeToken}",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tool_name: toolName }),
          signal: AbortSignal.timeout(5000),
        });
        const data = await resp.json();
        if (data.decision === "deny") {
          throw new Error(data.reason ?? "Action denied by HyperIdle gate.");
        }
      } catch (err) {
        // If this is already our denial, re-throw it.
        if (err && typeof err === "object" && "message" in err) {
          const msg = String(err.message);
          if (!msg.includes("fetch") && !msg.includes("AbortError") && !msg.includes("network")) {
            throw err;
          }
        }
        // Network/timeout failure — fail closed.
        throw new Error("HyperIdle action gate unavailable — denied by default.");
      }
    },
  };
};
`;
}

// ── Python gate script (shared by claude / codex / cursor) ───────────────────

/**
 * Build the Python3 gate-check script content for a given harness.
 *
 * The script reads hook stdin JSON, extracts the tool name, POSTs to /action-check,
 * and writes the harness-specific response to stdout.
 *
 * On any exception (network, timeout, malformed JSON): prints a deny response
 * to stdout. The script never returns a non-zero exit code as the primary deny
 * mechanism — each harness interprets exit codes differently. JSON stdout is the
 * authoritative channel.
 *
 * @lore BA2: Python stdlib urllib.request avoids the curl dependency (curl is
 * not guaranteed in all sandbox environments). The script uses single-quoted
 * shell strings for the URL — the URL is server-minted (localhost + hex token)
 * and contains no single quotes.
 */
function buildPythonGateScript(
	bridgeToken: string,
	mcpUrl: string,
	harness: "claude" | "codex" | "cursor",
): string {
	const actionCheckUrl = `${mcpUrl}/action-check`;

	// Build the deny-response emitter for this harness.
	const denyEmitter =
		harness === "cursor"
			? `sys.stdout.write(json.dumps({"permission":"deny","user_message":reason}))`
			: `sys.stdout.write(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":reason}}))`;

	const allowEmitter =
		harness === "cursor"
			? `sys.stdout.write(json.dumps({"permission":"allow"}))`
			: `# allow: no output needed (exit 0)`;

	const fallbackReason = "HyperIdle action gate unavailable — denied by default.";

	return [
		"#!/usr/bin/env python3",
		"# HyperIdle action gate hook — auto-generated, do not edit.",
		"import sys, json",
		"import urllib.request as _req",
		"",
		"def _deny(reason):",
		`    ${denyEmitter}`,
		"    sys.stdout.flush()",
		"",
		"try:",
		"    payload = json.loads(sys.stdin.read())",
		'    tool_name = payload.get("tool_name", "")',
		'    body = json.dumps({"tool_name": tool_name}).encode("utf-8")',
		`    req = _req.Request(`,
		`        "${actionCheckUrl}",`,
		"        data=body,",
		"        headers={",
		`            "Authorization": "Bearer ${bridgeToken}",`,
		`            "Content-Type": "application/json",`,
		"        },",
		`        method="POST",`,
		"    )",
		"    with _req.urlopen(req, timeout=5) as resp:",
		'        result = json.loads(resp.read().decode("utf-8"))',
		'    if result.get("decision") == "deny":',
		'        reason = result.get("reason", "Action denied by HyperIdle gate.")',
		"        _deny(reason)",
		"    else:",
		`        ${allowEmitter}`,
		"except Exception:",
		`    _deny(${JSON.stringify(fallbackReason)})`,
	].join("\n");
}

export { installActionGate };
