/**
 * Per-session CLI MCP config writer.
 *
 * Each supported CLI binary reads MCP server configuration from a binary-specific
 * dialect file written into the per-session sandbox. This writer is the
 * ONLY per-binary difference: it teaches each binary how to find the bridge URL
 * in its own config dialect.
 */

import * as fs from "node:fs";
import * as path from "node:path";

interface HarnessMcpConfigParams {
	/** Which binary's config dialect to produce. */
	readonly dialect: "codex-toml" | "opencode-json" | "cursor-json";
	/** Absolute path of the per-session sandbox directory. */
	readonly sandboxPath: string;
	/** Full MCP URL: ${mcpBaseUrl}/api/mcp/${token} */
	readonly mcpUrl: string;
	/** 64-char hex bridge session token. */
	readonly token: string;
	/**
	 * Additional local paths to declare trusted, beyond the sandbox itself —
	 * the session's mounted filesystems (the filesystem
	 * primitive is what declares trusted directories; the harness is told what
	 * it declares, in whatever form that harness understands). Currently only
	 * the codex-toml dialect acts on this — codex is the harness with a trust
	 * precondition; the field is threaded generically so a future harness with
	 * the same shape of check does not need a parallel param.
	 */
	readonly trustedPaths?: readonly string[];
}

interface HarnessMcpConfigResult {
	/**
	 * For codex-toml: { HYPERIDLE_MCP_TOKEN: token } — must be injected onto
	 * the spawn env OUTSIDE the envAllowlist (per-session, not from process.env).
	 * For opencode-json: { OPENCODE_CONFIG: <sandbox>/opencode.json }.
	 */
	readonly tokenEnv?: Record<string, string>;
}

/** Write the per-session MCP config file for a CLI binary. Returns tokenEnv for the spawn env. */
function writeHarnessMcpConfig(params: HarnessMcpConfigParams): HarnessMcpConfigResult {
	const { dialect, sandboxPath, mcpUrl, token, trustedPaths } = params;

	switch (dialect) {
		case "codex-toml":
			return writeCodexToml({ sandboxPath, mcpUrl, token, trustedPaths });

		case "opencode-json":
			return writeOpencodeJson({ sandboxPath, mcpUrl, token });

		case "cursor-json":
			return writeCursorJson({ sandboxPath, mcpUrl, token });
	}
}

// ── codex-toml dialect ────────────────────────────────────────────────────────

function writeCodexToml(params: {
	sandboxPath: string;
	mcpUrl: string;
	token: string;
	trustedPaths?: readonly string[];
}): HarnessMcpConfigResult {
	const { sandboxPath, mcpUrl, token, trustedPaths } = params;

	const codexHomeDir = path.join(sandboxPath, ".codex-home");
	const configTomlPath = path.join(codexHomeDir, "config.toml");

	// Ensure .codex-home/ exists (mirrors provisionCodexHome; idempotent).
	fs.mkdirSync(codexHomeDir, { recursive: true });

	// @lore: codex-toml token — token travels via env var, NOT inline in toml; `url` + `bearer_token_env_var` is the shape for `codex mcp add --bearer-token-env-var`
	const mcpBlock =
		"\n[mcp_servers.hyperidle]\n" +
		`url = "${mcpUrl}"\n` +
		`bearer_token_env_var = "HYPERIDLE_MCP_TOKEN"\n` +
		'default_tools_approval_mode = "approve"\n';

	// Append to existing config.toml (may already have model/auth blocks). Create the file if absent.
	fs.appendFileSync(configTomlPath, mcpBlock, "utf-8");
	fs.appendFileSync(configTomlPath, buildCodexTrustBlock(sandboxPath, trustedPaths), "utf-8");

	return { tokenEnv: { HYPERIDLE_MCP_TOKEN: token } };
}

/**
 * Declares trusted directories through codex's own mechanism. Empirically, on codex-cli 0.150.1,
 * this block makes no observed difference to the "Not inside a trusted directory" refusal — that
 * refusal tracks git-repo-ness alone (see ensureSandboxGitRepo in run-orchestration/mounter.ts).
 * The session sandbox is always declared; extraPaths carries mounted filesystems.
 */
function buildCodexTrustBlock(sandboxPath: string, extraPaths?: readonly string[]): string {
	const paths = [...new Set([sandboxPath, ...(extraPaths ?? [])])];
	return paths
		.map((p) => `\n[projects."${escapeTomlString(p)}"]\ntrust_level = "trusted"\n`)
		.join("");
}

/**
 * Escape a value for a TOML basic string. `extraPaths` (a mounted filesystem's
 * real path, e.g. a doc_set folder name) is user-influenced — an unescaped `"`
 * closes the string early and lets the rest of the value be parsed as TOML
 * (new keys/tables), and a literal newline is not valid inside a basic string
 * at all.
 *
 * @lore: escapeTomlString — single-pass regex; replace chain misses control chars → "invalid string"; TOML requires full escape; one pass avoids double-escape
 */
function escapeTomlString(value: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters IS the point of this escape function.
	return value.replace(/[\\"\n\r\t\x00-\x1f\x7f]/g, (ch) => {
		switch (ch) {
			case "\\":
				return "\\\\";
			case '"':
				return '\\"';
			case "\n":
				return "\\n";
			case "\r":
				return "\\r";
			case "\t":
				return "\\t";
			case "\b":
				return "\\b";
			case "\f":
				return "\\f";
			default:
				return `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
		}
	});
}

// ── opencode-json dialect ─────────────────────────────────────────────────────

function writeOpencodeJson(params: {
	sandboxPath: string;
	mcpUrl: string;
	token: string;
}): HarnessMcpConfigResult {
	const { sandboxPath, mcpUrl, token } = params;

	const opencodeJsonPath = path.join(sandboxPath, "opencode.json");

	// @lore: opencode-json shape — type:"remote" + headers.Authorization is the shape opencode mcp add writes; token inline (hex only); path via OPENCODE_CONFIG
	const config = {
		$schema: "https://opencode.ai/config.json",
		mcp: {
			hyperidle: {
				type: "remote",
				url: mcpUrl,
				headers: {
					Authorization: `Bearer ${token}`,
				},
				enabled: true,
			},
		},
	};

	fs.writeFileSync(opencodeJsonPath, JSON.stringify(config, null, 2), "utf-8");

	// OPENCODE_CONFIG forces this per-session config to load even when OpenCode doesn't detect the sandbox as a project root.
	return { tokenEnv: { OPENCODE_CONFIG: opencodeJsonPath } };
}

// ── cursor-json dialect ───────────────────────────────────────────────────────

function writeCursorJson(params: {
	sandboxPath: string;
	mcpUrl: string;
	token: string;
}): HarnessMcpConfigResult {
	const { sandboxPath, mcpUrl, token } = params;

	// @lore: cursor workspace root — cursor-agent reads .cursor/mcp.json from the git repo root, not cwd; ensureSandboxGitRepo ensures every sandbox is a git repo
	const cursorDir = path.join(sandboxPath, ".cursor");
	fs.mkdirSync(cursorDir, { recursive: true });
	const mcpJsonPath = path.join(cursorDir, "mcp.json");

	const config = {
		mcpServers: {
			hyperidle: {
				url: mcpUrl,
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		},
	};

	fs.writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2), "utf-8");
	return {};
}

// ── Plugin stdio MCP entries ──────────────────────────────────────────────────

/**
 * A plugin-contributed stdio MCP server, already template-expanded.
 * Fields match the standard MCP stdio server config shape.
 */
export interface PluginStdioServer {
	readonly key: string;
	readonly config: Record<string, unknown>;
}

/**
 * Write plugin-contributed stdio MCP server entries into the harness's dialect
 * file. Merges with whatever the bridge writer already put there; never
 * overwrites the bridge entry.
 *
 * All ${PLUGIN_ROOT}/${PLUGIN_DATA} expansion and cwd-defaulting are done by the caller.
 *
 */
export function writePluginStdioMcpEntries(params: {
	readonly dialect: "codex-toml" | "opencode-json" | "cursor-json";
	readonly sandboxPath: string;
	readonly servers: ReadonlyArray<PluginStdioServer>;
}): void {
	const { dialect, sandboxPath, servers } = params;
	if (servers.length === 0) return;

	switch (dialect) {
		case "codex-toml":
			writePluginEntriesCodexToml({ sandboxPath, servers });
			break;
		case "opencode-json":
			writePluginEntriesOpencodeJson({ sandboxPath, servers });
			break;
		case "cursor-json":
			writePluginEntriesCursorJson({ sandboxPath, servers });
			break;
	}
}

function writePluginEntriesCodexToml(params: {
	sandboxPath: string;
	servers: ReadonlyArray<PluginStdioServer>;
}): void {
	const { sandboxPath, servers } = params;
	const codexHomeDir = path.join(sandboxPath, ".codex-home");
	fs.mkdirSync(codexHomeDir, { recursive: true });
	const configTomlPath = path.join(codexHomeDir, "config.toml");

	for (const { key, config } of servers) {
		let block = `\n[mcp_servers.${key}]\n`;
		if (typeof config.command === "string") block += `command = "${config.command}"\n`;
		if (Array.isArray(config.args)) {
			const argsStr = (config.args as unknown[]).map((a) => `"${String(a)}"`).join(", ");
			block += `args = [${argsStr}]\n`;
		}
		if (config.cwd !== undefined) block += `cwd = "${String(config.cwd)}"\n`;
		if (config.env && typeof config.env === "object") {
			const envEntries = Object.entries(config.env as Record<string, unknown>)
				.map(([k, v]) => `${k} = "${String(v)}"`)
				.join(", ");
			if (envEntries) block += `env = { ${envEntries} }\n`;
		}
		// No bearer_token_env_var — stdio MCP servers communicate over stdin/stdout, not HTTP.
		fs.appendFileSync(configTomlPath, block, "utf-8");
	}
}

function writePluginEntriesOpencodeJson(params: {
	sandboxPath: string;
	servers: ReadonlyArray<PluginStdioServer>;
}): void {
	const { sandboxPath, servers } = params;
	const opencodeJsonPath = path.join(sandboxPath, "opencode.json");

	// @lore: opencode stdio shape — command is a SINGLE array [binary, ...args]; separate command+args silently rejected ("Ignoring MCP config entry without type")
	type OpenCodeMcpEntry = {
		type: string;
		command?: string[];
		enabled: boolean;
		env?: Record<string, string>;
		cwd?: string;
	};
	type OpenCodeJson = { $schema?: string; mcp: Record<string, OpenCodeMcpEntry> };

	let existing: OpenCodeJson = { $schema: "https://opencode.ai/config.json", mcp: {} };
	if (fs.existsSync(opencodeJsonPath)) {
		try {
			existing = JSON.parse(fs.readFileSync(opencodeJsonPath, "utf-8")) as OpenCodeJson;
			if (!existing.mcp) existing.mcp = {};
		} catch {
			existing = { $schema: "https://opencode.ai/config.json", mcp: {} };
		}
	}
	for (const { key, config } of servers) {
		const entry: OpenCodeMcpEntry = { type: "local", enabled: true };
		const cmdArray: string[] = [];
		if (typeof config.command === "string") cmdArray.push(config.command);
		if (Array.isArray(config.args)) cmdArray.push(...(config.args as unknown[]).map(String));
		if (cmdArray.length > 0) entry.command = cmdArray;
		if (config.env && typeof config.env === "object") {
			const envObj: Record<string, string> = {};
			for (const [k, v] of Object.entries(config.env as Record<string, unknown>)) {
				envObj[k] = String(v);
			}
			if (Object.keys(envObj).length > 0) entry.env = envObj;
		}
		if (config.cwd !== undefined) entry.cwd = String(config.cwd);
		existing.mcp[key] = entry;
	}
	fs.writeFileSync(opencodeJsonPath, JSON.stringify(existing, null, 2), "utf-8");
}

function writePluginEntriesCursorJson(params: {
	sandboxPath: string;
	servers: ReadonlyArray<PluginStdioServer>;
}): void {
	const { sandboxPath, servers } = params;
	const cursorDir = path.join(sandboxPath, ".cursor");
	fs.mkdirSync(cursorDir, { recursive: true });
	const cursorMcpPath = path.join(cursorDir, "mcp.json");

	let existing: { mcpServers?: Record<string, unknown> } = { mcpServers: {} };
	if (fs.existsSync(cursorMcpPath)) {
		try {
			existing = JSON.parse(fs.readFileSync(cursorMcpPath, "utf-8")) as typeof existing;
		} catch {
			// start fresh
		}
	}
	const merged: Record<string, unknown> = { ...(existing.mcpServers ?? {}) };
	for (const { key, config } of servers) {
		merged[key] = config;
	}
	fs.writeFileSync(cursorMcpPath, JSON.stringify({ mcpServers: merged }, null, 2), "utf-8");
}

export { writeHarnessMcpConfig };
