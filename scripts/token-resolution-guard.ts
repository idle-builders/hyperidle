#!/usr/bin/env tsx
/**
 * Token resolution guard — fails the build when any var(--x) reference in
 * shipped CSS or TSX files references a custom property not defined in
 * packages/design-system/src/tokens.css.
 *
 * Usage:
 *   npm run token-guard:check   # CI mode: exits 1 if any undefined tokens found
 *
 * Gate decision (from plans/AI1/architecture.md §Gate decision):
 *   ESLint rules can only target *.{ts,tsx}; the worst offenders are .css files.
 *   A standalone script that walks both CSS and TSX is the only mechanism that
 *   covers the full scan surface with one source of truth.
 *
 * @lore AI1: This guard was introduced to enforce the AI1 token-resolution
 * contract. The scan globs are fixed to shipped source only (packages/{web,
 * design-system}/src/**) — test/story files are excluded because they may
 * legitimately assert on or document dead-token strings (e.g. the ThreadSections
 * protected test, which is updated in lockstep with source, not policed here).
 *
 * @lore AI1 WARNING: Comment-stripping (step 2) is text-level, not a full AST
 * tokenizer. A `//` or `/* *\/` sequence inside a string or regex literal would
 * be wrongly blanked. In this repo every legitimate var(--…) lives in a
 * className/style string with no comment delimiters inside it, so no
 * false-negative occurs. The worst case is a missed dead token (dropped
 * reference), which the mapping table + /review grep catch independently.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Pure exports — tested by packages/db/__tests__/AI1-token-resolution-guard.test.ts
// ---------------------------------------------------------------------------

/**
 * Extract defined custom-property names from tokens.css text.
 * A definition is a line with `--name:` at declaration position.
 * References (var(--name)) are NOT treated as definitions.
 */
export function checkContent(cssSource: string): Set<string> {
	const defined = new Set<string>();
	// Match `--name:` at declaration position — anchored by the colon after the name.
	// This regex matches `--foo:` inside a rule block but NOT `var(--foo)` (which has no colon).
	const DEFINITION_RE = /(--[a-zA-Z0-9-]+)\s*:/g;
	let match: RegExpExecArray | null;
	while ((match = DEFINITION_RE.exec(cssSource)) !== null) {
		const candidate = match[1];
		if (candidate !== undefined) {
			defined.add(candidate);
		}
	}
	return defined;
}

/**
 * Blank out comments before reference extraction, preserving line count so
 * reported line numbers stay accurate.
 *
 * lang selects the comment grammar:
 *   "css" → block comments only (/* … *\/)
 *   "ts"  → line (//) + block (/* … *\/) comments
 *
 * Newlines inside comment spans are preserved (replaced with spaces/newlines);
 * non-newline characters are replaced with spaces so lengths stay equal and
 * line numbers remain accurate.
 */
export function stripComments(text: string, lang: "css" | "ts"): string {
	let result = text;

	// Block comments: /* … */  (both css and ts)
	result = result.replace(/\/\*[\s\S]*?\*\//g, (match) => {
		// Preserve newlines; replace everything else with spaces
		return match.replace(/[^\n]/g, " ");
	});

	// Line comments: // … (ts only; CSS has no line comments)
	if (lang === "ts") {
		result = result.replace(/\/\/[^\n]*/g, (match) => {
			// Replace all characters with spaces (no newlines in a line comment)
			return " ".repeat(match.length);
		});
	}

	return result;
}

/**
 * Find var(--x) references whose token is not in `defined`.
 * Expects comment-stripped text — callers strip before calling.
 * Returns one entry per occurrence (not deduplicated) with 1-based line numbers.
 */
export function findUndefinedReferences(
	fileText: string,
	defined: ReadonlySet<string>,
): Array<{ line: number; token: string }> {
	const results: Array<{ line: number; token: string }> = [];

	// Split into lines for line-number tracking.
	const lines = fileText.split("\n");

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const line = lines[lineIdx] ?? "";
		// Use a fresh regex per line to avoid state issues
		const lineRe = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
		let match: RegExpExecArray | null;
		while ((match = lineRe.exec(line)) !== null) {
			const token = match[1];
			if (token !== undefined && !defined.has(token)) {
				results.push({ line: lineIdx + 1, token });
			}
		}
	}

	return results;
}

// ---------------------------------------------------------------------------
// File walker (same pattern as the other guard scripts in scripts/)
// ---------------------------------------------------------------------------

const SKIP_EXTENSIONS_SUFFIX = [".d.ts", ".d.ts.map"];

const EXCLUDED_DIR_PATTERNS: string[] = [
	"node_modules",
	".git",
	"dist",
	".next",
	"build",
	"packages/desktop/out",
	"packages/desktop/dist",
	"packages/design-system/dist",
	".pipeline",
	"plans",
	"docs",
	// Worktrees — symlinks that cause infinite recursion if walked
	".worktrees",
	// Test and story directories
	"__tests__",
];

const EXCLUDED_FILE_SUFFIXES: string[] = [
	".stories.tsx",
	".test.ts",
	".test.tsx",
	".spec.ts",
	".spec.tsx",
];

const SCAN_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);

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

function isExcludedFile(relPath: string): boolean {
	const normalized = relPath.replace(/\\/g, "/");
	return EXCLUDED_FILE_SUFFIXES.some((s) => normalized.endsWith(s));
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
// Scan scope: only shipped source under packages/{design-system,web}/src
// ---------------------------------------------------------------------------

const SCAN_ROOTS = [
	"packages/design-system/src",
	"packages/web/src",
];

interface ScanHit {
	file: string;
	line: number;
	token: string;
}

export function runCheck(repoRoot: string): { ok: boolean; hits: ScanHit[] } {
	// 1. Build the defined-token set from tokens.css
	const tokensCssPath = path.join(repoRoot, "packages/design-system/src/tokens.css");
	let tokensCss = "";
	try {
		tokensCss = fs.readFileSync(tokensCssPath, "utf8");
	} catch {
		process.stderr.write(
			`token-resolution-guard: cannot read ${tokensCssPath}\n`,
		);
		process.exit(1);
	}
	const defined = checkContent(tokensCss);

	// 2. Walk scan roots
	const allFiles: string[] = [];
	for (const root of SCAN_ROOTS) {
		const absRoot = path.join(repoRoot, root);
		if (fs.existsSync(absRoot)) {
			allFiles.push(...walkFiles(absRoot, repoRoot));
		}
	}

	// 3. Scan each file
	const allHits: ScanHit[] = [];
	for (const filePath of allFiles) {
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf8");
		} catch {
			continue;
		}

		const ext = path.extname(filePath).toLowerCase();
		const lang = ext === ".css" ? "css" : "ts";
		const stripped = stripComments(content, lang);
		const refs = findUndefinedReferences(stripped, defined);

		for (const ref of refs) {
			allHits.push({
				file: path.relative(repoRoot, filePath).replace(/\\/g, "/"),
				line: ref.line,
				token: ref.token,
			});
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
	const repoRoot = path.resolve(path.dirname(scriptPath), "..");

	if (isCheck) {
		const result = runCheck(repoRoot);

		if (!result.ok) {
			process.stderr.write(
				"token-resolution-guard --check: undefined token references found!\n\n",
			);
			for (const hit of result.hits) {
				process.stderr.write(`  ${hit.file}:${hit.line}  undefined token ${hit.token}\n`);
			}
			process.stderr.write(
				`\n${result.hits.length} undefined token reference(s) found.\n` +
					`Map each dead token to a defined token in packages/design-system/src/tokens.css.\n` +
					`See plans/AI1/architecture.md §Token mapping for the canonical mapping table.\n`,
			);
			process.exit(1);
		}

		process.stdout.write("token-resolution-guard --check: clean.\n");
		process.exit(0);
	}

	process.stderr.write("Usage: npm run token-guard:check\n");
	process.exit(1);
}
