#!/usr/bin/env tsx
/**
 * Nimmly guard — prevents reintroduction of "Nimmly" references in the repo.
 *
 * Usage:
 *   npm run nimmly-guard:check   # CI mode: exits 1 if any hits found
 *
 * Excluded paths (legitimate occurrences):
 *   - node_modules/     (dependencies, not our code)
 *   - .git/             (VCS internals)
 *   - .pipeline/work-packages/  (the AF17 spec itself describes the purge)
 *   - docs/archive/     (superseded history, churn with no value)
 *   - scripts/nimmly-guard.ts   (this file — contains "nimmly" in strings)
 *
 * @lore AF17: Nimmly is a separate product (per the Nimmly-purge directive,
 * same class as Rail/CoC). Zero occurrences in live code/tests/docs/mockups.
 * The guard runs in `npm run verify` after mock-inventory:check.
 * NIT from reviewer: must NOT red on .pipeline/ progress files (which legitimately
 * contain "Nimmly" as the title of the AF17 workpackage).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const NIMMLY_RE = /nimmly/i;

/**
 * Exported for unit testing (AC6).
 * Check a string of content for Nimmly references.
 * Returns { clean: true } if no hits, or { clean: false, hits: string[] } with
 * the offending lines.
 */
export function checkContent(content: string): { clean: boolean; hits: string[] } {
	const hits: string[] = [];
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		if (NIMMLY_RE.test(line)) {
			hits.push(`line ${i + 1}: ${line.trim()}`);
		}
	}
	return { clean: hits.length === 0, hits };
}

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

const SCAN_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".html",
	".md",
	".yaml",
	".yml",
	".json",
]);

// Extensions to always skip regardless of directory.
// @lore AF17: .d.ts and .d.ts.map are TypeScript declaration files emitted
// by the build. They contain JSDoc from the source and would false-positive
// on the guard's own JSDoc comment. Source files are the truth; skip all
// declaration output.
const SKIP_EXTENSIONS_SUFFIX = [".d.ts", ".d.ts.map"];

/**
 * Directories to skip entirely (not recurse into).
 *
 * @lore AF17 WARNING-1: Exclusions must be principled — only non-shipped artifacts.
 * The guard scans SOURCE that ships to users. Pipeline tracking state and planning
 * artifacts are explicitly out of scope for two reasons:
 *   1. They legitimately reference "Nimmly" as the workpackage title / branch name.
 *   2. They are not live code — they are never deployed, bundled, or seen by users.
 *
 * Excluded categories:
 *   - .pipeline/work-packages/  — workpackage spec files; AF17 spec describes the purge
 *   - .pipeline/progress/       — per-workpackage progress JSON; AF17.json has "Nimmly" in title
 *   - .pipeline/retro-log/      — per-workpackage retro logs; may reference Nimmly as workpackage context (.jsonl is not a scanned extension anyway)
 *   - plans/                    — intermediate architecture docs, critiques, design mockups
 *   - docs/archive/             — superseded history (not deployed)
 *
 * IMPORTANT: Shipped source (packages/, scripts/, docs/ outside archive) IS scanned.
 * Nothing in shipped code may contain "Nimmly".
 */
const EXCLUDED_DIR_PATTERNS: string[] = [
	"node_modules",
	".git",
	// Pipeline tracking state — not shipped; legitimately references Nimmly as WP title/branch.
	// @lore AF17 WARNING-1: narrowed from blanket ".pipeline" to the two sub-dirs that hold
	// Nimmly references. .pipeline/audits/ is intentionally NOT excluded — audit ledgers
	// should not reference Nimmly in live-code findings.
	".pipeline/work-packages",
	".pipeline/progress",
	// Intermediate pipeline planning artifacts — architecture docs, critiques, design mockups.
	// They legitimately discuss Nimmly as the purge target but are never shipped.
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
	// Design system compiled output
	"packages/design-system/dist",
];

/**
 * Files to exclude individually.
 * @lore AF17: The guard script itself contains "nimmly" in strings — must be excluded.
 * package.json is excluded because it contains the script name "nimmly-guard:check"
 * which is an unavoidable self-reference — purging it would break the guard.
 * The AF17 test file for AC6 tests the guard function itself, so it must contain
 * "nimmly" strings as test fixtures — excluded from the guard scan.
 * The AF17 factory-isolation test checks for ABSENCE of nimmly ids — excluded.
 */
const EXCLUDED_FILE_PATTERNS: string[] = [
	"scripts/nimmly-guard.ts",
	"scripts/nimmly-guard.js",
	// package.json: the "nimmly-guard:check" script name is a self-reference — unavoidable
	"package.json",
	// AF17 guard unit test: contains "nimmly" strings as test fixtures for the guard fn
	"packages/db/src/__tests__/AF17-nimmly-guard.test.ts",
	"packages/db/src/__tests__/AF17-nimmly-guard.test.js",
	// AF17 factory-isolation test: checks for ABSENCE of old nimmly ids
	"packages/db/src/__tests__/AF17-factory-isolation.integration.test.ts",
	"packages/db/src/__tests__/AF17-factory-isolation.integration.test.js",
	// Developer policy doc: names the banned word to explain why it is banned
	"docs/guides/developer/mock-data-policy.md",
];

function isExcludedFile(relPath: string): boolean {
	const normalized = relPath.replace(/\\/g, "/");
	return EXCLUDED_FILE_PATTERNS.some((p) => normalized.endsWith(p) || normalized === p);
}

function isExcludedDir(relPath: string): boolean {
	const normalized = relPath.replace(/\\/g, "/");
	return EXCLUDED_DIR_PATTERNS.some((p) => {
		// Match exact segment or path prefix
		return normalized === p || normalized.startsWith(`${p}/`) || normalized.includes(`/${p}/`) || normalized.endsWith(`/${p}`);
	});
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
			// Skip declaration files (build outputs that mirror source JSDoc)
			if (SKIP_EXTENSIONS_SUFFIX.some((s) => entry.endsWith(s))) continue;
			if (SCAN_EXTENSIONS.has(path.extname(entry).toLowerCase())) {
				results.push(fullPath);
			}
		}
	}

	return results;
}

// ---------------------------------------------------------------------------
// Check mode
// ---------------------------------------------------------------------------

interface CheckHit {
	file: string;
	lines: string[];
}

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
	// scripts/nimmly-guard.ts → repo root is one level up
	const repoRoot = path.resolve(path.dirname(scriptPath), "..");

	if (isCheck) {
		const result = runCheck(repoRoot);

		if (!result.ok) {
			process.stderr.write("nimmly-guard --check: Nimmly references found!\n\n");
			for (const hit of result.hits) {
				process.stderr.write(`  ${hit.file}:\n`);
				for (const line of hit.lines) {
					process.stderr.write(`    ${line}\n`);
				}
			}
			process.stderr.write(
				`\n${result.hits.length} file(s) contain Nimmly references.\n` +
					`Purge them and commit. See plans/AF17/architecture.md task 11 for the full list.\n`,
			);
			process.exit(1);
		}

		process.stdout.write("nimmly-guard --check: clean.\n");
		process.exit(0);
	}

	process.stderr.write("Usage: npm run nimmly-guard:check\n");
	process.exit(1);
}
