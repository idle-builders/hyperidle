/**
 * AO2 — Scaffolding drift-guard (C2).
 *
 * Asserts that SANDBOX_SCAFFOLDING_PATHS covers EVERY path emitted by EVERY real
 * writer that drops files into the per-session working directory.
 *
 * When a future writer adds a scaffolding path that SANDBOX_SCAFFOLDING_PATHS
 * doesn't cover, CI goes red immediately — the constant can never silently fall
 * behind and corrupt a capture by committing scaffolding as authored output.
 *
 * This is a static-property test on real code constants — NOT a filesystem grep.
 * It imports the real writer surfaces (EMITTED_ROOTS_* consts) from each module.
 *
 * @lore AO2 C2 round-2: ALL harness provisioners must be enumerated — not just
 * Claude. Codex (.codex, .codex-home) and OpenCode (.opencode) were the gap in
 * the original drift-guard spec.
 */

// ── Import real writer EMITTED_ROOTS surfaces ────────────────────────────────
import {
	EMITTED_ROOTS_AGENTS_MD,
	EMITTED_ROOTS_CONTEXT_ASSEMBLY,
} from "@hyperidle/server/app-runtime";
import { describe, expect, it } from "vitest";
import { EMITTED_ROOTS_CLI_MCP_CONFIG } from "../../harness/cli-mcp-config.js";
import {
	EMITTED_ROOTS_CLAUDE_SETTINGS,
	EMITTED_ROOTS_CODEX_HOME,
	EMITTED_ROOTS_OPENCODE_PLUGIN,
} from "../../harness/provision-return-hook.js";
import { EMITTED_ROOTS_MCP_JSON } from "../../services/session-provisioning.js";

// ── Import the constant under test ───────────────────────────────────────────
import { SANDBOX_SCAFFOLDING_PATHS } from "../scaffolding-paths.js";

// ── Coverage helper ───────────────────────────────────────────────────────────

/**
 * A path is "covered" if it equals an entry in SANDBOX_SCAFFOLDING_PATHS OR
 * starts with a directory-root entry followed by '/'.
 *
 * e.g. "context/session.toon" is covered by root "context"
 *      ".fabric/manifest.json" is covered by root ".fabric"
 *      "CLAUDE.md" is covered by exact-match "CLAUDE.md"
 */
function isCovered(emittedPath: string, scaffoldingPaths: readonly string[]): boolean {
	for (const sp of scaffoldingPaths) {
		if (emittedPath === sp) return true;
		if (emittedPath.startsWith(`${sp}/`)) return true;
	}
	return false;
}

function assertAllCovered(writerName: string, emittedRoots: readonly string[]): void {
	for (const root of emittedRoots) {
		const covered = isCovered(root, SANDBOX_SCAFFOLDING_PATHS);
		if (!covered) {
			throw new Error(
				`DRIFT: ${writerName} emits '${root}' which is NOT covered by SANDBOX_SCAFFOLDING_PATHS.\n` +
					`Add '${root}' (or its parent root) to packages/server/src/filesystem/scaffolding-paths.ts`,
			);
		}
	}
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SANDBOX_SCAFFOLDING_PATHS drift-guard", () => {
	it("covers context-assembly emitted roots (.fabric, context, knowledge, work)", () => {
		assertAllCovered("context-assembly.ts", EMITTED_ROOTS_CONTEXT_ASSEMBLY);
	});

	it("covers writeSandboxAgentsMd files (AGENTS.md, CLAUDE.md)", () => {
		assertAllCovered("context-assembly-prompt.ts writeSandboxAgentsMd", EMITTED_ROOTS_AGENTS_MD);
	});

	it("covers session-provisioning .mcp.json", () => {
		assertAllCovered("session-provisioning.ts .mcp.json writer", EMITTED_ROOTS_MCP_JSON);
	});

	it("covers provisionClaudeSettings (.claude/)", () => {
		assertAllCovered(
			"provision-return-hook.ts provisionClaudeSettings",
			EMITTED_ROOTS_CLAUDE_SETTINGS,
		);
	});

	it("covers provisionCodexHome (.codex/, .codex-home/)", () => {
		assertAllCovered("provision-return-hook.ts provisionCodexHome", EMITTED_ROOTS_CODEX_HOME);
	});

	it("covers provisionOpencodePlugin (.opencode/)", () => {
		assertAllCovered(
			"provision-return-hook.ts provisionOpencodePlugin",
			EMITTED_ROOTS_OPENCODE_PLUGIN,
		);
	});

	it("covers writeCliMcpConfig (opencode.json)", () => {
		assertAllCovered("harness/cli-mcp-config.ts writeCliMcpConfig", EMITTED_ROOTS_CLI_MCP_CONFIG);
	});

	it("SANDBOX_SCAFFOLDING_PATHS has no duplicate entries", () => {
		const seen = new Set<string>();
		for (const p of SANDBOX_SCAFFOLDING_PATHS) {
			expect(seen.has(p), `duplicate entry in SANDBOX_SCAFFOLDING_PATHS: '${p}'`).toBe(false);
			seen.add(p);
		}
	});

	it("SANDBOX_SCAFFOLDING_PATHS is non-empty", () => {
		expect(SANDBOX_SCAFFOLDING_PATHS.length).toBeGreaterThan(0);
	});
});
