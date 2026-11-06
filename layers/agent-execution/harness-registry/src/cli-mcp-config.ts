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
	// @lore: codex-toml no-file — bridge + trust passed as -c flags at spawn (buildArgs/startSession); token still travels via HYPERIDLE_MCP_TOKEN env var
	const { token } = params;
	return { tokenEnv: { HYPERIDLE_MCP_TOKEN: token } };
}

/**
 * Escape a value for a TOML basic string (used for -c flag values and table keys).
 * @lore: escapeTomlString — single-pass regex; replace chain misses control chars → "invalid string"; TOML requires full escape; one pass avoids double-escape
 */
export function escapeTomlString(value: string): string {
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

function writePluginEntriesCodexToml(_params: {
	sandboxPath: string;
	servers: ReadonlyArray<PluginStdioServer>;
}): void {
	// @lore: codex-toml no-file — plugin MCP entries now passed as -c flags via buildCodexPluginConfigArgs; nothing written to disk here
}

/**
 * Build -c flag args for plugin-contributed stdio MCP servers (codex-toml dialect).
 * Each entry expands to one or more `key=value` strings to pass as `-c key=value` to codex.
 * Returns raw -c arg values (without the leading "-c") — the caller interleaves them.
 */
export function buildCodexPluginConfigArgs(servers: ReadonlyArray<PluginStdioServer>): string[] {
	const args: string[] = [];
	for (const { key, config } of servers) {
		if (typeof config.command === "string") {
			args.push(`mcp_servers.${key}.command="${escapeTomlString(config.command)}"`);
		}
		if (Array.isArray(config.args)) {
			const argsToml = (config.args as unknown[])
				.map((a) => `"${escapeTomlString(String(a))}"`)
				.join(", ");
			args.push(`mcp_servers.${key}.args=[${argsToml}]`);
		}
		if (config.cwd !== undefined) {
			args.push(`mcp_servers.${key}.cwd="${escapeTomlString(String(config.cwd))}"`);
		}
		if (config.env && typeof config.env === "object") {
			const entries = Object.entries(config.env as Record<string, unknown>).map(
				([k, v]) => `${k}="${escapeTomlString(String(v))}"`,
			);
			if (entries.length > 0) args.push(`mcp_servers.${key}.env={${entries.join(", ")}}`);
		}
	}
	return args;
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
