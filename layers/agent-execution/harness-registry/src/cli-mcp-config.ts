/**
 * AL7 delta — Per-session CLI MCP config writer.
 *
 * Each supported CLI binary reads MCP server configuration from a binary-specific
 * dialect file written into the per-session sandbox. This writer handles both:
 *
 *   codex-toml  — appends `[mcp_servers.hyperidle]` to .codex-home/config.toml;
 *                 token delivered via env var (HYPERIDLE_MCP_TOKEN).
 *   opencode-json — writes opencode.json to sandbox cwd; token inline in
 *                   headers.Authorization; path delivered via OPENCODE_CONFIG.
 *
 * The registry/router are transport-agnostic and untouched. This writer is the
 * ONLY per-binary difference: it teaches each binary how to find the bridge URL
 * in its own config dialect.
 *
 * @lore AL7 cli-mcp-config: Security boundaries per §6:
 *   - mcpUrl is server-constructed (${mcpBaseUrl}/api/mcp/${token}); never agent-authored.
 *   - token is a 64-char hex server-generated secret; no JSON/toml metacharacters.
 *   - codex: token travels via HYPERIDLE_MCP_TOKEN env var (NOT inline in toml)
 *     because bearer_token_env_var is codex's API; injected outside envAllowlist
 *     (per-session-generated, not forwarded from process.env — mirror CODEX_HOME).
 *   - opencode: token is inline in headers.Authorization; written via JSON.stringify
 *     which escapes any metacharacters (token is hex so none expected). The config
 *     path is also injected via OPENCODE_CONFIG so OpenCode loads it even when the
 *     session sandbox is not detected as a project root.
 *   - Both files live in the per-session sandbox (already isolated).
 *
 * @lore AL7 cli-mcp-config N6: codex token injection MUST be outside-allowlist
 * (inject-not-forward). The allowlist forwards from process.env, but the token is
 * per-session-generated and NOT in process.env. Return tokenEnv from this function
 * and let the caller inject it the same way CODEX_HOME is injected (startSession,
 * outside resolvedEnvMap/envAllowlist).
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
}

interface HarnessMcpConfigResult {
	/**
	 * For codex-toml: { HYPERIDLE_MCP_TOKEN: token } — must be injected onto
	 * the spawn env OUTSIDE the envAllowlist (per-session, not from process.env).
	 * For opencode-json: { OPENCODE_CONFIG: <sandbox>/opencode.json }.
	 */
	readonly tokenEnv?: Record<string, string>;
}

/**
 * Write the per-session MCP config file for a CLI binary.
 *
 * - codex-toml: appends `[mcp_servers.hyperidle]` block to
 *   `<sandbox>/.codex-home/config.toml`. Creates the file + directory if absent.
 *   Returns `{ tokenEnv: { HYPERIDLE_MCP_TOKEN: token } }` for the spawn env.
 *
 * - opencode-json: writes `<sandbox>/opencode.json` with the `mcp.hyperidle`
 *   remote block. Token is inline in `headers.Authorization`. Returns
 *   `{ tokenEnv: { OPENCODE_CONFIG: <sandbox>/opencode.json } }` so the spawn
 *   loads the generated config deterministically.
 */
/**
 * Root-level files emitted by writeCliMcpConfig, indexed by dialect.
 * - codex-toml: writes .codex-home/config.toml (covered by .codex-home root).
 * - opencode-json: writes opencode.json in the sandbox root.
 * Exported so the AO2 scaffolding-drift-guard can assert coverage.
 *
 * The Codex home and OpenCode config are both rooted inside the session sandbox.
 */
function writeHarnessMcpConfig(params: HarnessMcpConfigParams): HarnessMcpConfigResult {
	const { dialect, sandboxPath, mcpUrl, token } = params;

	switch (dialect) {
		case "codex-toml":
			return writeCodexToml({ sandboxPath, mcpUrl, token });

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
}): HarnessMcpConfigResult {
	const { sandboxPath, mcpUrl, token } = params;

	const codexHomeDir = path.join(sandboxPath, ".codex-home");
	const configTomlPath = path.join(codexHomeDir, "config.toml");

	// Ensure .codex-home/ exists (mirrors provisionCodexHome; idempotent).
	fs.mkdirSync(codexHomeDir, { recursive: true });

	// The MCP block to append. Codex reads bearer_token_env_var from the env;
	// the token does NOT appear in the toml file (security: no inline secret).
	//
	// @lore AL7 codex-toml: `url` and `bearer_token_env_var` are the two fields
	// codex writes when you run `codex mcp add --url <U> --bearer-token-env-var <ENV>`.
	// Verified against: codex-cli 0.141.0, codex mcp get hyperidle --json.
	const mcpBlock =
		"\n[mcp_servers.hyperidle]\n" +
		`url = "${mcpUrl}"\n` +
		`bearer_token_env_var = "HYPERIDLE_MCP_TOKEN"\n` +
		'default_tools_approval_mode = "approve"\n';

	// Append to existing config.toml (return-enforcement provisioning may have written model/auth
	// blocks already). Create the file if absent.
	fs.appendFileSync(configTomlPath, mcpBlock, "utf-8");

	// Token must be injected as an env var on codex spawn — NOT forwarded from
	// process.env (it's per-session-generated). Caller injects outside allowlist.
	return { tokenEnv: { HYPERIDLE_MCP_TOKEN: token } };
}

// ── opencode-json dialect ─────────────────────────────────────────────────────

function writeOpencodeJson(params: {
	sandboxPath: string;
	mcpUrl: string;
	token: string;
}): HarnessMcpConfigResult {
	const { sandboxPath, mcpUrl, token } = params;

	const opencodeJsonPath = path.join(sandboxPath, "opencode.json");

	// @lore AL7 opencode-json: opencode loads opencode.json from the spawn cwd.
	// Verified against: opencode 1.17.8, `opencode mcp add --url <U> --header ...`.
	// The `type:"remote"` + `headers.Authorization:"Bearer <token>"` shape is the
	// exact output of `opencode mcp add ... --header "Authorization=Bearer <tok>"`.
	const config = {
		$schema: "https://opencode.ai/config.json",
		mcp: {
			hyperidle: {
				type: "remote",
				url: mcpUrl,
				headers: {
					// biome-ignore lint/style/useNamingConvention: HTTP header name is canonical RFC case
					Authorization: `Bearer ${token}`,
				},
				enabled: true,
			},
		},
	};

	fs.writeFileSync(opencodeJsonPath, JSON.stringify(config, null, 2), "utf-8");

	// Token is inline. OPENCODE_CONFIG forces this per-session config to load even
	// when OpenCode does not consider the sandbox a project root.
	return { tokenEnv: { OPENCODE_CONFIG: opencodeJsonPath } };
}

// ── cursor-json dialect ───────────────────────────────────────────────────────

function writeCursorJson(params: {
	sandboxPath: string;
	mcpUrl: string;
	token: string;
}): HarnessMcpConfigResult {
	const { sandboxPath, mcpUrl, token } = params;

	const cursorDir = path.join(sandboxPath, ".cursor");
	fs.mkdirSync(cursorDir, { recursive: true });
	const mcpJsonPath = path.join(cursorDir, "mcp.json");

	// @lore AW1 cursor-json: cursor-agent reads MCP servers from .cursor/mcp.json
	// in the workspace (same shape as Cursor IDE). Token is inline in headers.
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
 * Called from Phase 8c (mergePluginMcpContributions) after the bridge writer
 * in Phase 8b has already run. All ${PLUGIN_ROOT}/${PLUGIN_DATA} expansion and
 * cwd-defaulting are done by the caller before this point.
 *
 * @lore BA9b B2: dialect knowledge for plugin stdio servers lives here, next to
 * the bridge's remote-server knowledge, so there is exactly one place that knows
 * how each CLI binary's config file is shaped.
 *
 * codex-toml: command/args written as TOML; no bearer_token_env_var (no token —
 *   stdio transports are local). Shape verified 2026-08-26: `codex mcp list` with
 *   CODEX_HOME pointing to .codex-home/ confirmed `[mcp_servers.key]` with separate
 *   command/args/cwd/env TOML fields is read and connected correctly.
 * opencode-json: type:"local" with command as a MERGED array [binary, ...args].
 *   Shape verified 2026-08-26: `opencode mcp list` in the sandbox CWD confirmed
 *   `type:"local"` and `command:[binary,...args]` (single array, no separate "args"
 *   key) is accepted. A string `command` + separate `args` is silently rejected with
 *   "Ignoring MCP config entry without type". env:{} is also accepted by opencode 1.18.x.
 * cursor-json: same mcpServers JSON shape as claude's .mcp.json (.cursor/mcp.json).
 *   Verified: AW1 lore — cursor-agent reads .cursor/mcp.json like Cursor IDE does.
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
		// @lore BA9b stdio codex-toml: no bearer_token_env_var — stdio MCP servers
		// communicate over stdin/stdout, not HTTP, so no auth token is needed.
		fs.appendFileSync(configTomlPath, block, "utf-8");
	}
}

function writePluginEntriesOpencodeJson(params: {
	sandboxPath: string;
	servers: ReadonlyArray<PluginStdioServer>;
}): void {
	const { sandboxPath, servers } = params;
	const opencodeJsonPath = path.join(sandboxPath, "opencode.json");

	// opencode stdio shape (verified 2026-08-26 against opencode 1.18.x):
	//   command is a SINGLE array: [binary, ...args]. Separate command string +
	//   args array is silently rejected ("Ignoring MCP config entry without type").
	//   env is a flat string→string object. cwd is a string if present.
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
		// Merge command binary + args into a single array (opencode's required shape).
		const cmdArray: string[] = [];
		if (typeof config.command === "string") cmdArray.push(config.command);
		if (Array.isArray(config.args)) cmdArray.push(...(config.args as unknown[]).map(String));
		if (cmdArray.length > 0) entry.command = cmdArray;
		// env: flat string→string record.
		if (config.env && typeof config.env === "object") {
			const envObj: Record<string, string> = {};
			for (const [k, v] of Object.entries(config.env as Record<string, unknown>)) {
				envObj[k] = String(v);
			}
			if (Object.keys(envObj).length > 0) entry.env = envObj;
		}
		// cwd: working directory for the spawned MCP server process.
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
