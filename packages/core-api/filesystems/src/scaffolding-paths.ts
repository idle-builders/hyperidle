/**
 * AO2 — SANDBOX_SCAFFOLDING_PATHS: the exhaustive set of path roots that
 * session-provisioning + harness layers write into the per-session working directory.
 *
 * The git adapters (GitWorktreeAdapter, GitCloneAdapter) write these as
 * root-anchored entries in `.git/info/exclude` so scaffolding files stay untracked
 * even after context-assembly drops them into the working dir. They also exclude
 * tracked-collision paths from the staged commit (the self-host case: this repo
 * tracks AGENTS.md / CLAUDE.md / .mcp.json which assembly overwrites).
 *
 * A drift-guard test (`scaffolding-drift-guard.test.ts`) imports the EMITTED_ROOTS
 * constants from every real writer and asserts that SANDBOX_SCAFFOLDING_PATHS covers
 * them all. When a new writer adds an uncovered path, that test fails CI immediately —
 * the constant can never silently fall behind and corrupt a capture.
 *
 * @lore AO2 §8: Authored fresh from the real writers on dd355c4b:
 *   - context-assembly.ts:89-107 (createDirectoryStructure + task-notes)
 *   - context-assembly.ts:254 (context/session.toon)
 *   - context-assembly.ts:266-267 (.fabric/manifest.json)
 *   - context-assembly-prompt.ts:277-279 (writeSandboxAgentsMd dual-write)
 *   - session-provisioning.ts:752-762 (.mcp.json)
 *   - provision-return-hook.ts:118-141 (provisionClaudeSettings → .claude/)
 *   - provision-return-hook.ts:192-253 (provisionCodexHome → .codex/ + .codex-home/)
 *   - provision-return-hook.ts:345-371 (provisionOpencodePlugin → .opencode/)
 *   - cli-mcp-config.ts (writeCliMcpConfig → .codex-home/config.toml, opencode.json)
 *
 * @lore AO2 C2: All harness provisioners included — not just Claude; codex/opencode
 * roots (.codex, .codex-home, .opencode) are explicitly listed so a codex/opencode
 * session on the self-host repo cannot leak those files into the authored commit.
 */

// ── Per-writer EMITTED_ROOTS exports (imported by drift-guard test) ──────────

/**
 * Paths emitted by context-assembly (createDirectoryStructure + session.toon +
 * manifest.json + task-notes.md). These are directories; the git exclude uses
 * root-anchored entries covering their whole subtree.
 *
 * @lore AO2: EMITTED_ROOTS_CONTEXT_ASSEMBLY is the source of truth for
 * what context-assembly writes. The drift-guard imports this list directly
 * rather than re-hardcoding it, so a new directory added to assembleContext
 * must also appear here to keep CI green.
 */
export const EMITTED_ROOTS_CONTEXT_ASSEMBLY = [".fabric", "context", "knowledge", "work"] as const;

/**
 * Files emitted by writeSandboxAgentsMd (dual-write: AGENTS.md + CLAUDE.md).
 *
 * @lore AO2: These are file names (not dirs), root-anchored in the exclude.
 * Critical for the self-host case: this repo tracks both files; assembly overwrites
 * them with the assembled system prompt. They must be excluded from the authored commit.
 */
export const EMITTED_ROOTS_AGENTS_MD = ["AGENTS.md", "CLAUDE.md"] as const;

/**
 * Files emitted by session-provisioning (.mcp.json for Claude MCP bridge).
 */
export const EMITTED_ROOTS_MCP_JSON = [".mcp.json"] as const;

/**
 * Paths emitted by provisionClaudeSettings (claude settings + return-check.sh).
 */
export const EMITTED_ROOTS_CLAUDE_SETTINGS = [".claude"] as const;

/**
 * Paths emitted by provisionCodexHome (codex hooks + per-session CODEX_HOME).
 */
export const EMITTED_ROOTS_CODEX_HOME = [".codex", ".codex-home"] as const;

/**
 * Paths emitted by provisionOpencodePlugin (opencode return-signal plugin).
 */
export const EMITTED_ROOTS_OPENCODE_PLUGIN = [".opencode"] as const;

/**
 * Files emitted by writeCliMcpConfig for the opencode-json dialect.
 * (codex-toml is already covered by .codex-home above)
 */
export const EMITTED_ROOTS_CLI_MCP_CONFIG = ["opencode.json"] as const;

// ── SANDBOX_SCAFFOLDING_PATHS (the authoritative constant) ───────────────────

/**
 * Root-anchored paths that the session-provisioning + harness layers write into
 * the per-session working directory. Used by git adapters to exclude scaffolding
 * from authored commits.
 *
 * A path is "covered" if it equals an entry OR sits under a root entry (treated
 * as a directory prefix). The drift-guard test asserts this invariant on import.
 *
 * @lore AO2 §8: Directory roots cover their whole subtree. The two markdown files
 * and two json files are listed by name. All harness provisioners are enumerated —
 * Claude (.claude), Codex (.codex, .codex-home), OpenCode (.opencode) — so a
 * codex/opencode session on the self-host repo cannot leak scaffolding into the commit.
 */
export const SANDBOX_SCAFFOLDING_PATHS = [
	// context-assembly directories
	...EMITTED_ROOTS_CONTEXT_ASSEMBLY,
	// writeSandboxAgentsMd files
	...EMITTED_ROOTS_AGENTS_MD,
	// session-provisioning .mcp.json
	...EMITTED_ROOTS_MCP_JSON,
	// harness provisioners
	...EMITTED_ROOTS_CLAUDE_SETTINGS,
	...EMITTED_ROOTS_CODEX_HOME,
	...EMITTED_ROOTS_OPENCODE_PLUGIN,
	// cli-mcp-config opencode.json
	...EMITTED_ROOTS_CLI_MCP_CONFIG,
] as const;
