#!/usr/bin/env tsx
/**
 * AK1: Harness vocabulary guard — prevents reintroduction of dropped terms.
 *
 * Usage:
 *   npm run harness-vocab-guard:check   # CI mode: exits 1 if any hits found
 *
 * Banned patterns (see plan §Guard):
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
 *   - /workspaceHandle/      — run-unit variable (lowercase-first)
 *   - /[Ww]orkspaceReaper/   — run-unit class
 *   - /workspace_snapshot/   — DB column (snake_case)
 *   - /workspacePath/        — run-unit field (SessionConfig shared field)
 *
 * @lore AK1: Three-tier approach for "workspace" identifiers:
 *   (1) Ban specific typed run-unit identifiers (WorkspaceAdapter, WorkspaceHandle, etc.)
 *   (2) Ban /workspacePath/ — the shared run-unit field; no legitimate retained case.
 *   (3) Do NOT ban bare "workspace" — too noisy (npm workspaces, /workspace cwd, goose --workspace).
 *   The guard's own unit test (AK1-harness-vocab-guard.test.ts) is allowlisted so its
 *   fixture strings don't self-trigger.
 *
 * @lore AK1: {{workspace}} token is NOT allowlisted — it renames to {{sandbox}} (our DSL token,
 *   not a third-party contract). Any residual {{workspace}} is a dangling reference.
 *   The guard does NOT ban raw "workspace" strings, so {{workspace}} is not banned here;
 *   the grep checklist in the plan covers it for review. The workspacePath ban covers the
 *   SessionConfig field that {{workspace}} resolves against.
 *
 * Retained (KEEP — not banned):
 *   harness, session, Fabric, Strategy, /workspace (cwd literal),
 *   workspaces (npm), @hyperidle/* imports, --workspace (goose's CLI flag).
 *
 * Allowlist dirs (skipped entirely):
 *   node_modules, .git, dist, build, .next, packages/desktop/out,
 *   packages-star-dist (glob), docs/archive, plans, .pipeline, packages/db/drizzle
 *
 * Allowlist files (skipped individually):
 *   scripts/harness-vocab-guard.ts (self), package.json (script-name self-reference),
 *   packages/db/src/__tests__/AK1-harness-vocab-guard.test.ts (fixture strings),
 *   CHANGELOG* if present.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Banned patterns
// ---------------------------------------------------------------------------

interface BannedPattern {
	/** Human-readable label for error reporting. */
	label: string;
	/** Regex to test each line of content. */
	re: RegExp;
}

const BANNED_PATTERNS: BannedPattern[] = [
	// Term 1: soul
	{ label: "soul (any case)", re: /\bsoul/i },
	// Term 4: materialization / composePrompt / prompt-composition
	{ label: "materializ*", re: /materializ/i },
	{ label: "composePrompt", re: /composePrompt/ },
	{ label: "prompt[-\s]composition", re: /prompt[ -]composition/i },
	// Term 3: skill-tools
	{ label: "skill-tools", re: /skill-tools/ },
	{ label: "skillTools", re: /skillTools/ },
	// Term 2: workspace run-unit identifiers (three-tier; see @lore above)
	{ label: "WorkspaceAdapter", re: /WorkspaceAdapter/ },
	{ label: "WorkspaceHandle", re: /WorkspaceHandle/ },
	{ label: "workspaceBasePath", re: /workspaceBasePath/ },
	{ label: "workspaceSnapshot", re: /workspaceSnapshot/ },
	{ label: "workspaceHandle (lowercase)", re: /\bworkspaceHandle\b/ },
	{ label: "WorkspaceReaper / workspaceReaper", re: /[Ww]orkspaceReaper/ },
	{ label: "workspace_snapshot (snake_case)", re: /workspace_snapshot/ },
	{ label: "workspacePath", re: /workspacePath/ },
];

// ---------------------------------------------------------------------------
// checkContent — exported for unit testing
// ---------------------------------------------------------------------------

/**
 * Check a string of content for harness vocabulary violations.
 * Returns { clean: true } if no hits, or { clean: false, hits: string[] }
 * with the offending line descriptions.
 *
 * Each hit is formatted as "line N: <trimmed line content>".
 */
export function checkContent(content: string): { clean: boolean; hits: string[] } {
	const hits: string[] = [];
	const lines = content.split("\n");

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		for (const pattern of BANNED_PATTERNS) {
			if (pattern.re.test(line)) {
				hits.push(`line ${i + 1}: ${line.trim()}`);
				// Only report the line once even if multiple patterns match
				break;
			}
		}
	}

	return { clean: hits.length === 0, hits };
}

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".html", ".md", ".yaml", ".yml", ".json"]);

// Extensions to always skip (TypeScript declaration/map files from build output).
const SKIP_EXTENSIONS_SUFFIX = [".d.ts", ".d.ts.map"];

/**
 * Directories to skip entirely.
 *
 * @lore AK1: Historical migrations (packages/db/drizzle) are allowlisted because
 * they legitimately retain old column names (soul_prompt, workspace_snapshot) as
 * historical record. The AC explicitly permits dropped terms in historical
 * migrations/changelogs/docs-archive/plans/.pipeline.
 */
const EXCLUDED_DIR_PATTERNS: string[] = [
	"node_modules",
	".git",
	// Historical migration files + Drizzle meta snapshots — retain old column names.
	"packages/db/drizzle",
	// SQLite archive for desktop — historical Drizzle snapshots, retain old column names.
	"packages/db/drizzle-sqlite-archive",
	// Pipeline tracking state — spec/progress files reference old terms as history.
	".pipeline/work-packages",
	".pipeline/progress",
	// Intermediate pipeline planning artifacts — discuss old terms as rename targets.
	"plans",
	// Superseded documentation history — not deployed.
	"docs/archive",
	// Build outputs
	"dist",
	".next",
	"build",
	// Desktop build output
	"packages/desktop/out",
	"packages/desktop/dist",
	// Desktop release artifacts (Electron builder output, gitignored) — contain old DB
	// Drizzle snapshots with historical column names. Not source; not deployed to users.
	"packages/desktop/release",
	// Design system compiled output
	"packages/design-system/dist",
];

/**
 * Files to exclude individually.
 *
 * @lore AK1: The guard script itself contains banned strings as pattern definitions.
 * package.json contains "harness-vocab-guard:check" which is fine (no banned terms there),
 * but IS listed in case npm script names later contain banned terms.
 * The AK1 test file contains banned strings as test fixtures — must be excluded.
 */
const EXCLUDED_FILE_PATTERNS: string[] = [
	// Self — contains banned strings as regex patterns
	"scripts/harness-vocab-guard.ts",
	"scripts/harness-vocab-guard.js",
	// AK1 guard unit test — contains banned strings as fixture inputs
	"packages/db/src/__tests__/AK1-harness-vocab-guard.test.ts",
	"packages/db/src/__tests__/AK1-harness-vocab-guard.test.js",
	// AK1 field-rename integration test — asserts that old field names are ABSENT in API responses.
	// Contains old field names as strings in not.toHaveProperty() assertions.
	// @lore AU19 Increment 5 item 6: repathed from `packages/server/src/routes/__tests__/...`
	// (stale — `packages/server` dissolved, see Increment 2/5) to its real post-dissolution
	// home under `packages/core-api/src/routes/__tests__/...`. Same repath-don't-delete
	// pattern as knip.json's stale packages/server entries fixed in Increment 5 item 5.
	"packages/core-api/src/routes/__tests__/AK1-renamed-fields.integration.test.ts",
	"packages/core-api/src/routes/__tests__/AK1-renamed-fields.integration.test.js",
];

function isExcludedFile(relPath: string): boolean {
	const normalized = relPath.replace(/\\/g, "/");
	return EXCLUDED_FILE_PATTERNS.some((p) => normalized.endsWith(p) || normalized === p);
}

function isExcludedDir(relPath: string): boolean {
	const normalized = relPath.replace(/\\/g, "/");
	return EXCLUDED_DIR_PATTERNS.some(
		(p) =>
			normalized === p ||
			normalized.startsWith(`${p}/`) ||
			normalized.includes(`/${p}/`) ||
			normalized.endsWith(`/${p}`),
	);
}

function walkFiles(dir: string, repoRoot: string): string[] {
	const results: string[] = [];
	let entries: string[];
	try {
		entries = fs.readdirSync(dir);
	} catch {
		return results;
	}

	for (const entry of entries) {
		const fullPath = path.join(dir, entry);
		const relPath = path.relative(repoRoot, fullPath).replace(/\\/g, "/");

		if (isExcludedDir(relPath)) continue;
		if (isExcludedFile(relPath)) continue;

		let stat: fs.Stats;
		try {
			stat = fs.statSync(fullPath);
		} catch {
			continue;
		}

		if (stat.isDirectory()) {
			results.push(...walkFiles(fullPath, repoRoot));
		} else {
			if (SKIP_EXTENSIONS_SUFFIX.some((s) => entry.endsWith(s))) continue;
			if (SCAN_EXTENSIONS.has(path.extname(entry).toLowerCase())) {
				results.push(fullPath);
			}
		}
	}

	return results;
}

// ---------------------------------------------------------------------------
// runCheck — exported for unit testing
// ---------------------------------------------------------------------------

interface CheckHit {
	file: string;
	lines: string[];
}

/**
 * Walk all files under repoRoot and check each for banned harness vocabulary.
 * Returns { ok: true } if clean, { ok: false, hits } if violations found.
 */
export function runCheck(repoRoot: string): { ok: boolean; hits: CheckHit[] } {
	const files = walkFiles(repoRoot, repoRoot);
	const allHits: CheckHit[] = [];

	for (const file of files) {
		let content: string;
		try {
			content = fs.readFileSync(file, "utf8");
		} catch {
			continue;
		}

		const { clean, hits } = checkContent(content);
		if (!clean) {
			allHits.push({ file: path.relative(repoRoot, file), lines: hits });
		}
	}

	return { ok: allHits.length === 0, hits: allHits };
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
	// scripts/harness-vocab-guard.ts → repo root is one level up
	const repoRoot = path.resolve(path.dirname(scriptPath), "..");

	if (isCheck) {
		const result = runCheck(repoRoot);

		if (!result.ok) {
			process.stderr.write("harness-vocab-guard --check: banned harness vocabulary found!\n\n");
			for (const hit of result.hits) {
				process.stderr.write(`  ${hit.file}:\n`);
				for (const line of hit.lines) {
					process.stderr.write(`    ${line}\n`);
				}
			}
			process.stderr.write(
				`\n${result.hits.length} file(s) contain banned harness vocabulary terms.\n` +
					`See plans/AK1/architecture.md for the full rename inventory.\n`,
			);
			process.exit(1);
		}

		process.stdout.write("harness-vocab-guard --check: clean.\n");
		process.exit(0);
	}

	process.stderr.write("Usage: npm run harness-vocab-guard:check\n");
	process.exit(1);
}
