/**
 * Per-session CLI MCP config writer.
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
 * Exported so the scaffolding-drift-guard can assert coverage.
 *
 * The Codex home and OpenCode config are both rooted inside the session sandbox.
 */
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
	fs.appendFileSync(configTomlPath, buildCodexTrustBlock(sandboxPath, trustedPaths), "utf-8");

	// Token must be injected as an env var on codex spawn — NOT forwarded from
	// process.env (it's per-session-generated). Caller injects outside allowlist.
	return { tokenEnv: { HYPERIDLE_MCP_TOKEN: token } };
}

/**
 * Trust is DECLARED through codex's own
 * mechanism, never bypassed — kept deliberately as the general shape (where a
 * harness has a trusted-directory mechanism, declare the filesystems we
 * inject as trusted through it), not because it was observed to change
 * whether `codex exec` runs. Empirically, on codex-cli 0.150.1, this
 * `[projects."<path>"] trust_level = "trusted"` block makes no observed
 * difference to the "Not inside a trusted directory" refusal in either
 * direction — that refusal tracks git-repo-ness alone (see
 * `ensureSandboxGitRepo`, run-orchestration/mounter.ts, and the corrected
 * @lore in adapter-pool.ts next to codex's CLI_TOOL_CONFIGS entry). The
 * session sandbox (codex's cwd) is always declared; `extraPaths` carries the
 * session's other mounted filesystems (the filesystem primitive's job is
 * deciding what is trusted — see docs/objects/folders.md),
 * so a doc_set folder symlinked into the sandbox from elsewhere on disk is
 * trusted too, not just the sandbox root it is linked under.
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
 * @lore A single-pass regex + callback, not a chain of `.replace`s — a chain
 * only covers the escapes it enumerates (this used to stop at `\ " \n \r \t`,
 * leaving every other C0 control character, e.g. a vertical tab from a pasted
 * path, emitted raw; codex's own TOML parser then dies with "invalid basic
 * string" — verified against the real binary). The TOML spec requires every
 * control character in a basic string to be escaped; this handles the named
 * escapes it defines (`\\ \" \n \r \t \b \f`) and falls back to `\uXXXX` for
 * everything else in the C0/DEL range. A single pass also avoids the
 * double-escaping a sequential chain risks if ever reordered.
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

	// @lore cursor-workspace-root (verified live 2026-08-31, cursor-agent
	// 2026.08.25): cursor-agent reads `.cursor/mcp.json` from the root of the
	// enclosing GIT REPOSITORY, not from its working directory. A session sandbox
	// is `<base>/local-sb-N-<ts>/` and `<base>` is itself a git repo, so cursor
	// resolved the root to `<base>`, found no `.cursor/` there, and started with
	// no MCP server at all. The agent then said so in its own transcript ("there's
	// no `hyperidle` MCP server registered") and answered in plain text — a turn
	// that never calls `reply`, so `not_returned`, every time.
	//
	// Reproduced three ways to pin the cause: the same sandbox one directory up
	// (a repo root) connects; the same sandbox as a plain subdirectory does not;
	// `git init` inside it makes it connect again. `--workspace <sandbox>` does
	// NOT fix it — cursor takes the workspace from the repo root regardless, so
	// the flag is not the lever it looks like. Writing `.cursor/mcp.json` at the
	// real repo root instead was rejected: that root can be the user's own
	// checkout, and a per-session bridge token has no business being written there.
	//
	// Nothing is done about it HERE. `ensureSandboxGitRepo`
	// (run-orchestration/mounter.ts) already makes every session sandbox a git
	// repo, unconditionally and well before this runs, so the precondition this
	// dialect needs is already met by the time the file lands.
	const cursorDir = path.join(sandboxPath, ".cursor");
	fs.mkdirSync(cursorDir, { recursive: true });
	const mcpJsonPath = path.join(cursorDir, "mcp.json");

	// @lore AW1 cursor-json: cursor-agent reads MCP servers from .cursor/mcp.json
	// at the git-repo root (same shape as Cursor IDE). Token is inline in headers.
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
