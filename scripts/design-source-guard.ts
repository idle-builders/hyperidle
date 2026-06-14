#!/usr/bin/env tsx
/**
 * Design-source guard — enforces that TSX is the single design source of truth.
 *
 * Fails if:
 *   1. `packages/design-system/html/` directory exists (HTML reference tree still present).
 *   2. Any `.html` file exists under `packages/design-system/` (stray HTML reference files).
 *   3. Any `.claude/skills/*.md` or `.claude/rules/*.md` file contains forbidden
 *      HTML-as-design-reference strings:
 *      - "visual:compare"
 *      - "pixel-for-pixel"  (implies HTML is the pixel source of truth)
 *      - "html/*.html" / "html/<Component>.html" / ".html" in HTML-reference context
 *        (captured via: "HTML is the design" / "HTML component files" / ".html` (design" etc.)
 *
 * Usage:
 *   npm run design-source-guard:check   # exits 1 if any violation found
 *
 * AC mapping:
 *   AC1 — "no `.html` reference files under `packages/design-system/`; no rule/skill/script
 *          names HTML as the design reference"
 *   AC5 — 5 skills + visual-parity.md describe TSX-first reality
 *
 * @lore AJ1: The inversion from HTML-as-truth to TSX-as-truth required a guard (not a
 * vitest test) because AC1 is a static filesystem/string property. The guard follows
 * the same pattern as the other guard scripts: filesystem scan + string scan, exits 1
 * on violation. Runs in `npm run verify` as part of the guard chain — local-only
 * (not in CI), consistent with sibling guards.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Forbidden string patterns in skill/rule files (HTML-as-design-reference language)
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate HTML is still named as the design reference.
 * We scan only `.claude/skills/` and `.claude/rules/` — the agent-facing docs.
 */
const FORBIDDEN_PATTERNS: Array<{ re: RegExp; label: string }> = [
	{
		re: /visual:compare/,
		label: '"visual:compare" (dead script that compared TSX against HTML design-synthesis references)',
	},
	{
		re: /pixel-for-pixel/,
		label: '"pixel-for-pixel" (implies HTML is the pixel source of truth)',
	},
	{
		re: /HTML is the design (source|reference)/i,
		label: '"HTML is the design source/reference" (visual-parity.md language)',
	},
	{
		re: /HTML component files.*are the design source of truth/i,
		label: '"HTML component files…are the design source of truth" (visual-parity.md language)',
	},
	{
		re: /html\/themes\//,
		label: '"html/themes/" reference (deleted directory)',
	},
	{
		re: /Dual representation.*\.html/,
		label: '"Dual representation…html" (design-system.md language describing deleted dual-mode)',
	},
	{
		re: /ds:sync.*compares HTML/i,
		label: '"ds:sync compares HTML" (design-system.md — ds:sync now compares TSX vs golden baselines)',
	},
];

// ---------------------------------------------------------------------------
// File scope: which files to scan for forbidden strings
// ---------------------------------------------------------------------------

/** Only scan these directories for the string-pattern check. */
const STRING_SCAN_DIRS = [".claude/skills", ".claude/rules"];

/** Extensions to scan for forbidden string patterns. */
const STRING_SCAN_EXTS = new Set([".md", ".txt"]);

// ---------------------------------------------------------------------------
// Filesystem checks: no HTML reference files under packages/design-system/
// ---------------------------------------------------------------------------

/**
 * Check that no HTML reference tree exists under packages/design-system/.
 * Returns a list of violations (file paths relative to repoRoot).
 */
export function checkNoHtmlFiles(repoRoot: string): string[] {
	const dsDir = path.join(repoRoot, "packages", "design-system");
	const htmlDir = path.join(dsDir, "html");

	// Violation 1: html/ directory still exists
	if (fs.existsSync(htmlDir)) {
		// Report the directory itself + count of files inside
		let count = 0;
		try {
			count = countFilesRecursive(htmlDir);
		} catch {
			count = -1;
		}
		return [
			`packages/design-system/html/ — HTML reference directory still exists (${count} files). Delete the entire tree.`,
		];
	}

	// Violation 2: any stray .html file directly under packages/design-system/
	// EXEMPTIONS (paths relative to dsDir):
	//   viewer/index.html — Vite SPA entry point (root: "viewer" in vite.config.ts)
	//   playwright-report/**  — Playwright HTML report output (generated, not reference files)
	// @lore AJ1: Only html/*.html component reference files are forbidden. Tooling
	// artifacts (Vite shell, Playwright reports) must remain.
	const violations: string[] = [];
	const isHtmlExempt = (entry: string): boolean => {
		const normalized = entry.replace(/\\/g, "/");
		return (
			normalized === "viewer/index.html" || normalized.startsWith("playwright-report/")
		);
	};
	try {
		const entries = fs.readdirSync(dsDir, { recursive: true }) as string[];
		for (const entry of entries) {
			if (
				typeof entry === "string" &&
				entry.endsWith(".html") &&
				!isHtmlExempt(entry)
			) {
				violations.push(
					`packages/design-system/${entry} — stray .html file found (all HTML reference files must be deleted)`,
				);
			}
		}
	} catch {
		// Directory doesn't exist — no violation
	}

	return violations;
}

function countFilesRecursive(dir: string): number {
	let count = 0;
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const e of entries) {
		if (e.isDirectory()) {
			count += countFilesRecursive(path.join(dir, e.name));
		} else {
			count++;
		}
	}
	return count;
}

// ---------------------------------------------------------------------------
// String scan: skill/rule files must not name HTML-as-design-reference
// ---------------------------------------------------------------------------

interface StringHit {
	file: string;
	pattern: string;
	line: number;
	text: string;
}

/**
 * Scan `.claude/skills/` and `.claude/rules/` for forbidden HTML-as-design-reference strings.
 * Returns all hits found.
 */
export function checkNoHtmlAsReference(repoRoot: string): StringHit[] {
	const hits: StringHit[] = [];

	for (const scanDir of STRING_SCAN_DIRS) {
		const dir = path.join(repoRoot, scanDir);
		if (!fs.existsSync(dir)) continue;

		const files = walkMarkdownFiles(dir);
		for (const file of files) {
			const relFile = path.relative(repoRoot, file).replace(/\\/g, "/");
			let content: string;
			try {
				content = fs.readFileSync(file, "utf8");
			} catch {
				continue;
			}

			const lines = content.split("\n");
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i] ?? "";
				for (const { re, label } of FORBIDDEN_PATTERNS) {
					if (re.test(line)) {
						hits.push({
							file: relFile,
							pattern: label,
							line: i + 1,
							text: line.trim(),
						});
					}
				}
			}
		}
	}

	return hits;
}

function walkMarkdownFiles(dir: string): string[] {
	const results: string[] = [];
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return results;
	}
	for (const e of entries) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) {
			results.push(...walkMarkdownFiles(full));
		} else if (STRING_SCAN_EXTS.has(path.extname(e.name).toLowerCase())) {
			results.push(full);
		}
	}
	return results;
}

// ---------------------------------------------------------------------------
// Exported check runner
// ---------------------------------------------------------------------------

export interface GuardResult {
	ok: boolean;
	htmlViolations: string[];
	stringHits: StringHit[];
}

export function runCheck(repoRoot: string): GuardResult {
	const htmlViolations = checkNoHtmlFiles(repoRoot);
	const stringHits = checkNoHtmlAsReference(repoRoot);
	return {
		ok: htmlViolations.length === 0 && stringHits.length === 0,
		htmlViolations,
		stringHits,
	};
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
	// scripts/design-source-guard.ts → repo root is one level up
	const repoRoot = path.resolve(path.dirname(scriptPath), "..");

	if (isCheck) {
		const result = runCheck(repoRoot);

		if (!result.ok) {
			process.stderr.write("design-source-guard --check: violations found!\n\n");

			if (result.htmlViolations.length > 0) {
				process.stderr.write("HTML reference files (AC1 — must be deleted):\n");
				for (const v of result.htmlViolations) {
					process.stderr.write(`  ${v}\n`);
				}
				process.stderr.write("\n");
			}

			if (result.stringHits.length > 0) {
				process.stderr.write("HTML-as-design-reference language in skills/rules (AC1/AC5):\n");
				for (const h of result.stringHits) {
					process.stderr.write(`  ${h.file}:${h.line} — ${h.pattern}\n`);
					process.stderr.write(`    > ${h.text}\n`);
				}
				process.stderr.write("\n");
			}

			process.stderr.write(
				`${result.htmlViolations.length} filesystem violation(s), ` +
					`${result.stringHits.length} string hit(s).\n` +
					`Fix: delete packages/design-system/html/, rewrite .claude/skills|rules files ` +
					`to reference TSX stories instead of HTML files. See plans/AJ1/architecture.md.\n`,
			);
			process.exit(1);
		}

		process.stdout.write("design-source-guard --check: clean.\n");
		process.exit(0);
	}

	process.stderr.write("Usage: npm run design-source-guard:check\n");
	process.exit(1);
}
