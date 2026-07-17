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

export interface WriteCliMcpConfigParams {
	/** Which binary's config dialect to produce. */
	readonly dialect: "codex-toml" | "opencode-json" | "cursor-json";
	/** Absolute path of the per-session sandbox directory. */
	readonly sandboxPath: string;
	/** Full MCP URL: ${mcpBaseUrl}/api/mcp/${token} */
	readonly mcpUrl: string;
	/** 64-char hex bridge session token. */
	readonly token: string;
}

export interface WriteCliMcpConfigResult {
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
 * @lore AO2: .codex-home is already listed in EMITTED_ROOTS_CODEX_HOME (from
 * provisionCodexHome). opencode.json is a new root not covered elsewhere.
 */
export const EMITTED_ROOTS_CLI_MCP_CONFIG = ["opencode.json"] as const;

export function writeCliMcpConfig(params: WriteCliMcpConfigParams): WriteCliMcpConfigResult {
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
}): WriteCliMcpConfigResult {
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

	// Append to existing config.toml (AL6 provisioning may have written model/auth
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
}): WriteCliMcpConfigResult {
	const { sandboxPath, mcpUrl, token } = params;

	const opencodeJsonPath = path.join(sandboxPath, "opencode.json");

	// @lore AL7 opencode-json: opencode loads opencode.json from the spawn cwd.
	// Verified against: opencode 1.17.8, `opencode mcp add --url <U> --header ...`.
	// The `type:"remote"` + `headers.Authorization:"Bearer <token>"` shape is the
	// exact output of `opencode mcp add ... --header "Authorization=Bearer <tok>"`.
	const config = {
		// biome-ignore lint/style/useNamingConvention: $schema is the canonical JSON Schema field name
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
}): WriteCliMcpConfigResult {
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
					// biome-ignore lint/style/useNamingConvention: HTTP header name is canonical RFC case
					Authorization: `Bearer ${token}`,
				},
			},
		},
	};

	fs.writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2), "utf-8");
	return {};
}
