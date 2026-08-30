/**
 * AC1 / AC5 — Design-source invariant (vitest enforcement).
 *
 * Enforces that TSX is the single design source of truth.
 * Replaces `scripts/design-source-guard.ts` which was local-only and NOT enforced
 * in CI. This vitest test rides the test suite, which CI runs directly — so the
 * invariant is enforced by an actual run rather than by a signed claim about one.
 *
 * Fails if:
 *   1. `framework/design-system/html/` directory exists (HTML reference tree still present).
 *   2. Any `.html` file exists under `framework/design-system/` outside the exemption list.
 *   3. Any `.claude/skills/*.md` or `.claude/rules/*.md` file contains forbidden
 *      HTML-as-design-reference strings.
 *
 * Exemptions for .html files:
 *   - `viewer/index.html`      — Vite SPA entry point (not a design reference)
 *   - `playwright-report/**`   — Playwright HTML report output (generated artifact)
 *
 * @lore AJ1 REDO: Previously a bespoke tsx script (`scripts/design-source-guard.ts`)
 *   run only in `npm run verify` (local). Moved to vitest so the invariant is enforced
 *   in CI without a custom CI step. (It was originally enforced via the signed
 *   attestation; the attestation is gone and CI now runs the test suite directly,
 *   which enforces this the same way for a simpler reason.)
 *   See plans/AJ1/architecture.md.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

// ---------------------------------------------------------------------------
// Repo root — anchored to this file's location, not process.cwd().
// File is at: layers/core-ui/src/ds/__tests__/design-source.test.ts
// Repo root is 5 levels up (AU44 batch7: moved from framework/design-system/src/__tests__/).
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../../..", // __tests__ -> ds -> src -> core-ui -> layers -> repo root
);

// ---------------------------------------------------------------------------
// Forbidden string patterns in skill/rule files (HTML-as-design-reference language)
// Mirrors FORBIDDEN_PATTERNS from the deleted scripts/design-source-guard.ts
// ---------------------------------------------------------------------------

interface ForbiddenPattern {
	re: RegExp;
	label: string;
}

const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
	{
		re: /visual:compare/,
		label:
			'"visual:compare" (dead script that compared TSX against HTML design-synthesis references)',
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
		label:
			'"ds:sync compares HTML" (design-system.md — ds:sync now compares TSX vs golden baselines)',
	},
	// AJ1: catch mockup.html named as the design reference/variant.
	{
		re: /mockup\.html.*preferred|The mockup IS the variant|preferred.*mockup\.html/i,
		label:
			'"mockup.html (preferred)" or "The mockup IS the variant" — HTML-as-design-reference language (AJ1: TSX is the design source of truth)',
	},
	{
		re: /mockup\.html.*embodies the variant|embodies.*variant.*mockup\.html/i,
		label: '"mockup.html embodies the variant" — HTML-as-design-reference language (AJ1)',
	},
	// AJ1 REDO: screenshot-regression-net language must not re-enter skills/rules.
	// NOTE: "screenshot" and "Playwright" alone are NOT banned — manual screenshot-review
	// acts (drive the running app, look at pixels) are legitimate and must survive.
	// Only the REGRESSION-NET language (golden baseline gate) is forbidden here.
	{
		re: /golden (png|baseline)/i,
		label:
			'"golden PNG/baseline" — screenshot regression-net language (AJ1 REDO: replaced by vitest DOM-snapshot net)',
	},
	{
		re: /toHaveScreenshot/,
		label:
			'"toHaveScreenshot" — Playwright screenshot assertion (AJ1 REDO: deleted; use vitest DOM-snapshot net)',
	},
	{
		re: /__screenshots__/,
		label: '"__screenshots__" — deleted golden-PNG directory (AJ1 REDO: removed)',
	},
	{
		re: /ds:sync.*screenshot|ds:sync.*pixel|ds:sync.*baseline/i,
		label:
			'"ds:sync…screenshot/pixel/baseline" — screenshot gate language (AJ1 REDO: ds:sync deleted)',
	},
];

/** Directories to scan for forbidden string patterns (relative to repo root). */
const STRING_SCAN_DIRS = [".claude/skills", ".claude/rules"];

/** Extensions to scan for forbidden string patterns. */
const STRING_SCAN_EXTS = new Set([".md", ".txt"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

interface StringHit {
	file: string;
	pattern: string;
	line: number;
	text: string;
}

function scanFilesForForbiddenPatterns(repoRoot: string): {
	hits: StringHit[];
	filesScanned: string[];
} {
	const hits: StringHit[] = [];
	const filesScanned: string[] = [];

	for (const scanDir of STRING_SCAN_DIRS) {
		const dir = path.join(repoRoot, scanDir);
		if (!fs.existsSync(dir)) continue;

		const files = walkMarkdownFiles(dir);
		for (const file of files) {
			const relFile = path.relative(repoRoot, file).replace(/\\/g, "/");
			filesScanned.push(relFile);
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

	return { hits, filesScanned };
}

function isHtmlExempt(entryRelativeToDs: string): boolean {
	const normalized = entryRelativeToDs.replace(/\\/g, "/");
	return normalized === "viewer/index.html" || normalized.startsWith("playwright-report/");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AC1 — TSX is the single design source of truth", () => {
	test("framework/design-system/ directory must not exist (dissolved into layers/core-ui/src/ds/)", () => {
		const oldDsDir = path.join(REPO_ROOT, "framework", "design-system");
		const exists = fs.existsSync(oldDsDir);
		expect(
			exists,
			`framework/design-system/ directory still exists. ` +
				`AU44 batch7 dissolved it into layers/core-ui/src/ds/ — delete the old directory. ` +
				`(repo root resolved to: ${REPO_ROOT})`,
		).toBe(false);
	});

	test("no stray .html files under layers/core-ui/src/ds/ (except exemptions)", () => {
		const dsDir = path.join(REPO_ROOT, "layers", "core-ui", "src", "ds");

		// Non-vacuous guard: the directory must exist for this check to be meaningful
		expect(
			fs.existsSync(dsDir),
			`layers/core-ui/src/ds/ not found — repo root likely wrong: ${REPO_ROOT}`,
		).toBe(true);

		let allEntries: string[];
		try {
			allEntries = fs.readdirSync(dsDir, { recursive: true }) as string[];
		} catch {
			allEntries = [];
		}

		const htmlFiles = allEntries.filter(
			(entry): entry is string =>
				typeof entry === "string" && entry.endsWith(".html") && !isHtmlExempt(entry),
		);

		const violations = htmlFiles.map(
			(entry) =>
				`layers/core-ui/src/ds/${entry} — stray .html file found (all HTML reference files must be deleted; AC1)`,
		);

		expect(violations, violations.join("\n")).toHaveLength(0);
	});

	test("skills and rules contain no HTML-as-design-reference language", () => {
		const { hits, filesScanned } = scanFilesForForbiddenPatterns(REPO_ROOT);

		// Non-vacuous guard: must have found actual files to scan.
		// .claude/skills and .claude/rules must both exist with .md files.
		expect(
			filesScanned.length,
			`No skill/rule markdown files found to scan. ` +
				`Expected .claude/skills/*.md and .claude/rules/*.md under repo root: ${REPO_ROOT}. ` +
				`Glob returned 0 files — the scan is vacuously passing and the invariant is NOT enforced.`,
		).toBeGreaterThan(0);

		const report = hits
			.map((h) => `${h.file}:${h.line} — ${h.pattern}\n    > ${h.text}`)
			.join("\n");

		expect(
			hits,
			`Found ${hits.length} HTML-as-design-reference violation(s) in skills/rules:\n${report}\n\n` +
				`Fix: rewrite the listed files to reference TSX stories instead of HTML files. ` +
				`See plans/AJ1/architecture.md (AC1/AC5).`,
		).toHaveLength(0);
	});
});
