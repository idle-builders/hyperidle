#!/usr/bin/env tsx
/**
 * AK1: Harness vocabulary guard — prevents reintroduction of dropped terms.
 *
 * Banned patterns:
 *   - /\bsoul/i              — soul, soulPrompt, soul_prompt, SOUL_PROMPT_MAX_LENGTH, etc.
 *   - /materializ/i          — materialize, MaterializationConfig, materialization, etc.
 *   - /composePrompt/        — exact camelCase
 *   - /prompt[ -]composition/i — "prompt composition", "prompt-composition"
 *   - /skill-tools/          — hyphenated dir/term
 *   - /skillTools/           — camelCase variant
 *   - /WorkspaceAdapter/     — run-unit typed identifier
 *   - /WorkspaceHandle/      — run-unit typed identifier
 *   - /workspaceBasePath/    — run-unit variable
 *   - /workspaceSnapshot/    — run-unit variable (camelCase)
 *   - /workspaceHandle/      — run-unit variable (lowercase)
 *   - /[Ww]orkspaceReaper/   — run-unit class
 *   - /workspace_snapshot/   — DB column (snake_case)
 *   - /workspacePath/        — run-unit field (SessionConfig)
 *
 * Allowlisted (KEEP — not banned):
 *   - Literal "/workspace" cwd path string
 *   - npm "workspaces" key
 *   - @hyperidle/* workspace imports
 *   - harnessType (harness is RETAINED)
 *   - harness, session, Fabric, Strategy (retained nouns)
 *   - goose's bare "--workspace" CLI flag string
 *
 * @lore AK1: Three-tier approach for "workspace" (see plan §Guard):
 *   (1) Ban specific typed run-unit identifiers (WorkspaceAdapter, WorkspaceHandle, etc.)
 *   (2) Ban /workspacePath/ — the shared run-unit field; no legitimate retained case expected
 *   (3) Do NOT ban bare "workspace" — too noisy (npm workspaces, /workspace cwd, --workspace flag)
 *   The guard's own unit test (AK1-harness-vocab-guard.test.ts) is allowlisted so its
 *   fixture strings don't self-trigger.
 *
 * @lore AK1: {{workspace}} token is NOT allowlisted — it renames to {{sandbox}} (our DSL, not
 *   a third-party contract). Any residual {{workspace}} is a dangling reference.
 *
 * STUB: This file is a stub during the RED phase. The full implementation is built in
 * Phase B (green). The stub exports the correct function signatures but always returns
 * clean:true so all guard tests FAIL (they expect flagging behavior).
 *
 * TODO(AK1-green): Implement BANNED_PATTERNS, walkFiles, full checkContent logic below.
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Exported for unit testing.
 * Check a string of content for harness vocabulary violations.
 * Returns { clean: true } if no hits, or { clean: false, hits: string[] } with
 * the offending lines.
 *
 * STUB: Always returns clean:true (RED — tests expect clean:false for banned terms).
 */
export function checkContent(content: string): { clean: boolean; hits: string[] } {
	// STUB: real implementation replaces this body in green phase
	void content;
	return { clean: true, hits: [] };
}

interface CheckHit {
	file: string;
	lines: string[];
}

/**
 * Walk all files under repoRoot and run checkContent on each.
 * Returns { ok: true } if no banned terms found, { ok: false, hits } otherwise.
 *
 * STUB: Always returns ok:true.
 */
export function runCheck(repoRoot: string): { ok: boolean; hits: CheckHit[] } {
	// STUB: real implementation replaces this body in green phase
	void repoRoot;
	return { ok: true, hits: [] };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isEntrypoint =
	process.argv[1] ===
	(typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url));

if (isEntrypoint) {
	const isCheck = process.argv.includes("--check");
	const scriptPath = fileURLToPath(import.meta.url);
	const repoRoot = path.resolve(path.dirname(scriptPath), "..");

	if (isCheck) {
		const result = runCheck(repoRoot);
		if (!result.ok) {
			process.stderr.write("harness-vocab-guard --check: banned terms found!\n\n");
			for (const hit of result.hits) {
				process.stderr.write(`  ${hit.file}:\n`);
				for (const line of hit.lines) {
					process.stderr.write(`    ${line}\n`);
				}
			}
			process.exit(1);
		}
		process.stdout.write("harness-vocab-guard --check: clean.\n");
		process.exit(0);
	}

	process.stderr.write("Usage: npm run harness-vocab-guard:check\n");
	process.exit(1);
}
