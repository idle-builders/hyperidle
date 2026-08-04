#!/usr/bin/env tsx
/**
 * AU27 Increment 9 — `AL6` work-package-ID naming guard.
 *
 * The return-enforcement mechanism (the gate, the forcing message, the per-harness
 * hook provisioning) was originally built under work package `AL6`. AU27's naming
 * purge renamed every WP-id-badged identifier/marker/header/filename to an
 * intent-describing name (`FORCE_RETURN_MESSAGE`, `return-relay`, `X-Return-Seen`,
 * `return-gate.test.ts`, etc.) — the mechanism is "return enforcement", not a WP id.
 *
 * This guard is the anti-regrowth backstop: it fails the build if `AL6` (any case)
 * reappears in PRODUCTION code — the surface this WP purged it from. It does not
 * scan test/tooling/docs/historical-pipeline-state — those are a looser, non-gated
 * convention (renamed for consistency by the same WP, but not mechanically enforced
 * here; re-introducing `AL6` in a NEW test fixture, while discouraged, is not what
 * this guard exists to catch — it exists so the identifier never creeps back into
 * the runtime surface it was purged from).
 *
 * Usage:
 *   npm run al6-naming-guard:check   # CI mode: exits 1 if any hits found
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// checkContent — exported for unit testing
// ---------------------------------------------------------------------------

const AL6_PATTERN = /al6/i;

/**
 * Check a string of content for the `AL6` work-package-ID naming.
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
		if (AL6_PATTERN.test(line)) {
			hits.push(`line ${i + 1}: ${line.trim()}`);
		}
	}

	return { clean: hits.length === 0, hits };
}

// ---------------------------------------------------------------------------
// File walker — production source only
// ---------------------------------------------------------------------------

const SCAN_EXTENSIONS = new Set([".ts", ".tsx"]);
const SKIP_EXTENSIONS_SUFFIX = [".d.ts", ".d.ts.map"];

/**
 * Directories to skip entirely.
 *
 * @lore Production scope only — this guard's AC is "no `AL6` naming in
 * production code", not the whole repo. Tests, e2e, eval scenarios, tooling
 * scripts, docs, and historical pipeline/plan state are excluded: they were
 * renamed for consistency by the same WP but are not what AC-9 gates on, and
 * `plans/`/`.pipeline/` legitimately retain the WP id as history (git log
 * equivalent — see harness-vocab-guard.ts's identical carve-out for
 * `packages/db/drizzle`).
 */
const EXCLUDED_DIR_PATTERNS: string[] = [
	"node_modules",
	".git",
	"dist",
	".next",
	"build",
	// Test / e2e directories — this guard's scope is production runtime source only.
	"__tests__",
	"e2e",
	// Eval scenarios are tooling (live LLM benches), not production.
	"packages/eval",
	// Desktop build output.
	"packages/desktop/out",
	"packages/desktop/release",
];

/** Files to exclude individually (this guard's own source + its unit test fixtures). */
const EXCLUDED_FILE_PATTERNS: string[] = [
	"scripts/al6-naming-guard.ts",
	"scripts/al6-naming-guard.js",
	"packages/db/src/__tests__/return-enforcement-naming-guard.test.ts",
	"packages/db/src/__tests__/return-enforcement-naming-guard.test.js",
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
			// Only scan `packages/*` production source — not the repo root.
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
 * Walk `packages/` under repoRoot and check each production `.ts`/`.tsx` file
 * for `AL6` naming. Returns { ok: true } if clean, { ok: false, hits } if found.
 */
export function runCheck(repoRoot: string): { ok: boolean; hits: CheckHit[] } {
	const packagesRoot = path.join(repoRoot, "packages");
	const files = walkFiles(packagesRoot, repoRoot);
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
	process.argv[1] === (typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url));

if (isEntrypoint) {
	const isCheck = process.argv.includes("--check");
	const scriptPath = fileURLToPath(import.meta.url);
	// scripts/al6-naming-guard.ts → repo root is one level up
	const repoRoot = path.resolve(path.dirname(scriptPath), "..");

	if (isCheck) {
		const result = runCheck(repoRoot);

		if (!result.ok) {
			process.stderr.write("al6-naming-guard --check: AL6 work-package-ID naming found in production code!\n\n");
			for (const hit of result.hits) {
				process.stderr.write(`  ${hit.file}:\n`);
				for (const line of hit.lines) {
					process.stderr.write(`    ${line}\n`);
				}
			}
			process.stderr.write(
				`\n${result.hits.length} file(s) contain \`AL6\` naming. The mechanism is "return\n` +
					`enforcement", not a work-package id — rename to an intent-describing name.\n` +
					`See docs/agent-layer/return-gate-enforcement.md.\n`,
			);
			process.exit(1);
		}

		process.stdout.write("al6-naming-guard --check: clean.\n");
		process.exit(0);
	}

	process.stderr.write("Usage: npm run al6-naming-guard:check\n");
	process.exit(1);
}
