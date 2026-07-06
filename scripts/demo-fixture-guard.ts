#!/usr/bin/env tsx
/**
 * Demo-fixture import-allowlist guard (AC4).
 *
 * Enforces: `packages/db/src/demo-fixture.ts` may ONLY be imported by:
 *   1. packages/db/src/setup-cli.ts (the --demo flag caller)
 *   2. Test files (*.test.ts, *.test.tsx, *.integration.test.ts, *.spec.ts)
 *   3. packages/db/src/seed.ts (the backward-compat wrapper — itself only used by tests)
 *
 * Forbidden importers (the four pure-production paths that MUST NEVER import demo-fixture):
 *   - packages/db/src/seed-pg-cli.ts
 *   - packages/db/src/bootstrap-pg.ts
 *   - packages/db/src/factory-bootstrap.ts
 *   - packages/db/src/migrate-pg.ts
 *
 * Usage:
 *   npm run demo-fixture-guard:check   # CI mode: exits 1 if forbidden import found
 *
 * @lore AF17: This guard is the structural barrier that makes AC4 real, not incidental.
 * Without it, a careless import from a production path could silently reintroduce demo
 * data into production DBs (the failure mode AF17 was built to eliminate).
 *
 * @lore AF17 scope rationale: .pipeline/ and plans/ are excluded from all guards —
 * they are transient pipeline artifacts (architecture docs, critiques, review files)
 * that legitimately discuss demo-fixture as the purge target. They are not shipped
 * source files and are never deployed or run in production.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @lore AF17-R2: The original regex `['"](\.\.\/)*demo-fixture(\.js)?['"]` only matched
 * `"../demo-fixture.js"` (zero-or-more `../` forms) but NOT `"./demo-fixture.js"` — the
 * exact form used by every sibling file in `packages/db/src/`. The guard was green by
 * blindness. Fixed to cover: `./demo-fixture`, `../demo-fixture`, `../../demo-fixture` (any
 * depth), and the workspace subpath `@hyperidle/db/demo-fixture`.
 */
const DEMO_FIXTURE_IMPORT_RE =
	/['"](?:\.{1,2}\/(?:\.\.\/)*demo-fixture(?:\.js)?|@hyperidle\/db\/demo-fixture)['"]/;

/**
 * Permitted importers of demo-fixture.ts.
 * These path suffixes are allowed to import demo-fixture.
 */
const PERMITTED_SUFFIXES: string[] = [
	// The --demo flag caller
	"packages/db/src/setup-cli.ts",
	"packages/db/src/setup-cli.js",
	// The backward-compat wrapper (tests call seed() which delegates here)
	"packages/db/src/seed.ts",
	"packages/db/src/seed.js",
	// The barrel: re-exports seedDemoWorld so callers use @hyperidle/db named export
	"packages/db/src/index.ts",
	"packages/db/src/index.js",
];

/**
 * Individual files excluded from scanning entirely.
 * @lore AF17-R2: The guard script itself contains import-pattern strings in lore comments
 * — it must be self-excluded. The guard test file contains the pattern in string literals
 * passed to writeFile() — it is a .test.ts so it matches PERMITTED_TEST_PATTERNS already.
 */
const EXCLUDED_FILES: string[] = [
	// This script — contains the demo-fixture path strings in lore comments, not real imports
	"scripts/demo-fixture-guard.ts",
	"scripts/demo-fixture-guard.js",
];

const PERMITTED_TEST_PATTERNS = [
	".test.ts",
	".test.tsx",
	".test.js",
	".integration.test.ts",
	".integration.test.js",
	".spec.ts",
	".spec.js",
];

/**
 * Forbidden importers — exits 1 if any of these import demo-fixture.
 */
const FORBIDDEN_SUFFIXES: string[] = [
	"packages/db/src/seed-pg-cli.ts",
	"packages/db/src/seed-pg-cli.js",
	"packages/db/src/bootstrap-pg.ts",
	"packages/db/src/bootstrap-pg.js",
	"packages/db/src/factory-bootstrap.ts",
	"packages/db/src/factory-bootstrap.js",
	"packages/db/src/migrate-pg.ts",
	"packages/db/src/migrate-pg.js",
];

/**
 * Directories to skip entirely.
 */
const EXCLUDED_DIRS: string[] = [
	"node_modules",
	".git",
	"dist",
	"build",
	".next",
	".pipeline",
	"plans",
	".worktrees",
	"packages/desktop/out",
	"packages/desktop/dist",
	"packages/design-system/dist",
];

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const SKIP_SUFFIXES = [".d.ts", ".d.ts.map"];

function isExcludedDir(relPath: string): boolean {
	const normalized = relPath.replace(/\\/g, "/");
	return EXCLUDED_DIRS.some(
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
		let stat: fs.Stats;
		try {
			stat = fs.statSync(fullPath);
		} catch {
			continue;
		}
		if (stat.isDirectory()) {
			results.push(...walkFiles(fullPath, repoRoot));
		} else {
			if (SKIP_SUFFIXES.some((s) => entry.endsWith(s))) continue;
			if (SCAN_EXTENSIONS.has(path.extname(entry).toLowerCase())) {
				results.push(fullPath);
			}
		}
	}
	return results;
}

function isExcludedFile(relPath: string): boolean {
	const normalized = relPath.replace(/\\/g, "/");
	return EXCLUDED_FILES.some((p) => normalized === p || normalized.endsWith(`/${p}`) || normalized.endsWith(p));
}

function isPermittedImporter(relPath: string): boolean {
	const normalized = relPath.replace(/\\/g, "/");
	if (PERMITTED_SUFFIXES.some((s) => normalized.endsWith(s))) return true;
	if (PERMITTED_TEST_PATTERNS.some((s) => normalized.endsWith(s))) return true;
	return false;
}

function isForbiddenImporter(relPath: string): boolean {
	const normalized = relPath.replace(/\\/g, "/");
	return FORBIDDEN_SUFFIXES.some((s) => normalized.endsWith(s));
}

export interface DemoFixtureViolation {
	file: string;
	reason: "forbidden" | "unlisted-non-test";
}

export function runDemoFixtureGuard(repoRoot: string): { ok: boolean; violations: DemoFixtureViolation[] } {
	const files = walkFiles(repoRoot, repoRoot);
	const violations: DemoFixtureViolation[] = [];

	for (const file of files) {
		const relPath = path.relative(repoRoot, file).replace(/\\/g, "/");
		if (isExcludedFile(relPath)) continue;
		let content: string;
		try {
			content = fs.readFileSync(file, "utf8");
		} catch {
			continue;
		}
		if (!DEMO_FIXTURE_IMPORT_RE.test(content)) continue;

		if (isForbiddenImporter(relPath)) {
			violations.push({ file: relPath, reason: "forbidden" });
		} else if (!isPermittedImporter(relPath)) {
			violations.push({ file: relPath, reason: "unlisted-non-test" });
		}
	}

	return { ok: violations.length === 0, violations };
}

// CLI entry point
const isEntrypoint =
	process.argv[1] ===
	(typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url));

if (isEntrypoint) {
	const isCheck = process.argv.includes("--check");

	const scriptPath = fileURLToPath(import.meta.url);
	const repoRoot = path.resolve(path.dirname(scriptPath), "..");

	if (isCheck) {
		const result = runDemoFixtureGuard(repoRoot);

		if (!result.ok) {
			process.stderr.write("demo-fixture-guard --check: forbidden imports found!\n\n");
			for (const v of result.violations) {
				process.stderr.write(
					`  ${v.file}: ${v.reason === "forbidden" ? "FORBIDDEN production path imports demo-fixture" : "unlisted importer — add to PERMITTED_SUFFIXES or use a test file"}\n`,
				);
			}
			process.stderr.write(
				`\n${result.violations.length} violation(s). demo-fixture must only be imported by setup-cli.ts, seed.ts, and test files.\n`,
			);
			process.exit(1);
		}

		process.stdout.write("demo-fixture-guard --check: clean.\n");
		process.exit(0);
	}

	process.stderr.write("Usage: npm run demo-fixture-guard:check\n");
	process.exit(1);
}
