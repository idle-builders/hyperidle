#!/usr/bin/env tsx
/**
 * AR3 — test-naming-guard: fails the build when a test filename or a
 * describe/test/it string contains a workpackage identifier.
 *
 * A workpackage identifier is any `[A-Z]{1,3}\d+` token used as a filename
 * prefix (e.g. `AF10-`, `X3-`, `ar3-`) or as a prefix/label inside a test
 * string (`"AF10 AC2: …"`, `"X3 — session…"`). Project management artefacts
 * belong in the tracker, not in test code — the behavior name outlives the
 * ticket.
 *
 * Usage:
 *   npx tsx scripts/test-naming-guard.ts --check   # CI mode (rides `npm run lint`)
 *
 * File-name check:
 *   Any test filename whose base name starts with a WP-id pattern is a
 *   violation. Examples: `AF10-provisioning-cost-delta.integration.test.ts`,
 *   `af7-dispatch-wiring.integration.test.ts`, `X3-agent-config.spec.ts`.
 *
 * String check (describe/test/it titles):
 *   Any string literal passed as the first argument to describe/test/it that
 *   contains a word-boundary WP-id prefix is a violation. The check uses a
 *   lightweight text scan (regex), not a full AST parse, so it is fast and
 *   platform-independent. False-positives are allowlisted.
 *
 * Allowlist rules (identical to honest-harness-guard):
 *   dirty + allowlisted        → PASS  (known debt; rename as conversions land)
 *   dirty + NOT allowlisted    → FAIL  (new offender — use a behavior name)
 *   clean + allowlisted        → FAIL  (debt paid — remove from allowlist)
 *   allowlisted path missing   → FAIL  (stale entry)
 *
 * The 7 AR3 test files renamed this PR have behavior-named filenames and MUST
 * NOT appear on the allowlist. The ~300 legacy WP-named files are all listed
 * so the guard does not break `main` while conversions land (monotonic shrink).
 *
 * @lore AR3: the guard is a standalone tsx check (not an ESLint rule) because
 *   it owns a stateful monotonic-shrink allowlist and must walk the repo to
 *   find ALL test files. It rides `npm run lint` (precedent: honest-harness-
 *   guard.ts, ag7-no-divergent-classes.ts) so CI's Lint step enforces it with
 *   no new CI job.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const ALLOWLIST_PATH = path.join(SCRIPT_DIR, "test-naming-guard.allowlist.json");

// ── WP-id pattern ─────────────────────────────────────────────────────────────

/**
 * Matches a workpackage identifier at the START of a filename base (case-
 * insensitive). The pattern is `[A-Za-z]{1,3}\d+` followed by a separator
 * (`-` or `_`). The `i` flag covers lower-case prefixes like `af7-`, `ar3-`.
 *
 * Examples that match: `AF10-`, `X3-`, `ar3-`, `af7-`, `M3-`, `L17-`, `W3-`.
 * Examples that do NOT match: `session-cost-`, `provisioning-`, `adapter-`.
 *
 * @lore AR3: We require the separator (`-` or `_`) so that a purely behavioral
 * name like `actions.test.ts` does not trip on its first character. The
 * separator is the key signal that the token is used as a ticket prefix.
 */
const WP_ID_FILENAME = /^[A-Za-z]{1,3}\d+[-_]/;

/**
 * Matches a workpackage identifier inside a test string (describe/test/it
 * first argument). Looks for a word-boundary WP-id token with a separator or
 * at the start of the string.
 *
 * Matched shapes:
 *   "AF10 AC2: …"  — space-separated ticket prefix
 *   "AF10-…"       — hyphen-prefixed
 *   "X3 — …"       — em-dash after ticket
 *   "AR3: …"       — colon after ticket
 *   "(AR3)"        — parenthesised ticket
 *
 * @lore AR3: the describe/test/it string check catches ticket labels that
 * survive a file rename. A file named `session-cost.test.ts` with
 * `describe("AF10: session cost")` would fool the filename check alone.
 */
const WP_ID_IN_STRING = /\b[A-Za-z]{1,3}\d+\s*[-:_\s(]/;

// ── Test file discovery ───────────────────────────────────────────────────────

const TEST_SUFFIXES = [
	".test.ts",
	".test.tsx",
	".integration.test.ts",
	".spec.ts",
	".spec.tsx",
];

function isTestFile(name: string): boolean {
	return TEST_SUFFIXES.some((s) => name.endsWith(s));
}

function walkTestFiles(dir: string): string[] {
	const out: string[] = [];
	if (!fs.existsSync(dir)) return out;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const { name } = entry;
		if (name === "node_modules" || name === "dist" || name === ".git") continue;
		const full = path.join(dir, name);
		if (entry.isDirectory()) {
			out.push(...walkTestFiles(full));
		} else if (isTestFile(name)) {
			out.push(full);
		}
	}
	return out;
}

// ── Violation detection ───────────────────────────────────────────────────────

export interface NamingViolation {
	/** Repo-relative POSIX path. */
	path: string;
	kind: "filename" | "string-title";
	/** The offending text (filename base or the matched title). */
	offender: string;
	/** Line number (1-based) for string-title violations; 0 for filename. */
	line: number;
}

/**
 * Returns true iff the filename base (without directory) starts with a WP-id
 * pattern.
 */
export function hasWpFilename(filePath: string): boolean {
	return WP_ID_FILENAME.test(path.basename(filePath));
}

/**
 * Returns the first argument string of describe/test/it calls that contain a
 * WP-id pattern.
 *
 * Lightweight scan: extracts the first string argument from each
 * `describe(…)`, `test(…)`, `it(…)` call site (quote-delimited content only;
 * template literals and computed expressions are not matched and thus never
 * falsely flagged). This is intentionally conservative — it will miss
 * WP labels embedded in template literals or variables, but it never flags
 * clean names.
 */
export function wpTitleViolations(
	source: string,
): Array<{ line: number; title: string }> {
	// Matches: describe("…"), test("…"), it("…"), test.each("…"), describe.each(…)
	// Captures the string content of the first argument (single or double quotes only).
	const CALL_RE =
		/(?:^|[^a-zA-Z])(?:describe|test|it)(?:\.(?:each|skip|only|concurrent|todo))?\s*\(\s*["']([^"']+)["']/gm;
	const results: Array<{ line: number; title: string }> = [];
	for (const m of source.matchAll(CALL_RE)) {
		const title = m[1];
		if (WP_ID_IN_STRING.test(title)) {
			// Compute line number from match offset.
			const idx = m.index ?? 0;
			const line = source.slice(0, idx).split("\n").length;
			results.push({ line, title });
		}
	}
	return results;
}

/**
 * Check a single file for naming violations. Returns violations found.
 * Does NOT look up the allowlist — that's the caller's job.
 */
export function checkFile(relPath: string, source: string): NamingViolation[] {
	const violations: NamingViolation[] = [];
	const p = relPath.replace(/\\/g, "/");

	if (hasWpFilename(p)) {
		violations.push({
			path: p,
			kind: "filename",
			offender: path.basename(p),
			line: 0,
		});
	}

	for (const { line, title } of wpTitleViolations(source)) {
		violations.push({ path: p, kind: "string-title", offender: title, line });
	}

	return violations;
}

// ── Allowlist ─────────────────────────────────────────────────────────────────

function readAllowlist(): string[] {
	if (!fs.existsSync(ALLOWLIST_PATH)) return [];
	const parsed: unknown = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8"));
	if (!Array.isArray(parsed))
		throw new Error("test-naming-guard allowlist must be a JSON array of paths");
	return parsed.map((p) => String(p));
}

// ── --check ───────────────────────────────────────────────────────────────────

export interface GuardOutcome {
	ok: boolean;
	/** Violations on non-allowlisted files. */
	violations: NamingViolation[];
	/** Allowlisted files that have been cleaned (debt paid). */
	paidDebt: string[];
	/** Allowlist entries whose files no longer exist. */
	stale: string[];
}

function runCheck(): GuardOutcome {
	const allowlist = readAllowlist();
	const allow = new Set(allowlist.map((p) => p.replace(/\\/g, "/")));

	const testFiles = walkTestFiles(path.join(REPO_ROOT, "packages"));

	const seenAllowlisted = new Set<string>();
	const violations: NamingViolation[] = [];
	const paidDebt: string[] = [];

	for (const abs of testFiles) {
		const rel = path.relative(REPO_ROOT, abs).replace(/\\/g, "/");
		const source = fs.readFileSync(abs, "utf8");
		const found = checkFile(rel, source);

		const isAllowlisted = allow.has(rel);

		if (found.length > 0 && isAllowlisted) {
			seenAllowlisted.add(rel);
			// Known debt: pass silently.
		} else if (found.length > 0 && !isAllowlisted) {
			violations.push(...found);
		} else if (found.length === 0 && isAllowlisted) {
			// Debt paid.
			paidDebt.push(rel);
			seenAllowlisted.add(rel);
		}
	}

	// Stale entries: in allowlist but file not found.
	const stale: string[] = [];
	for (const entry of allow) {
		if (!seenAllowlisted.has(entry)) {
			const abs = path.join(REPO_ROOT, entry);
			if (!fs.existsSync(abs)) {
				stale.push(entry);
			} else {
				// File exists but wasn't in testFiles (not a test file pattern) —
				// treat as stale allowlist entry pointing to a non-test file.
				stale.push(entry);
			}
		}
	}

	return {
		ok: violations.length === 0 && paidDebt.length === 0 && stale.length === 0,
		violations,
		paidDebt,
		stale,
	};
}

// ── Entrypoint ────────────────────────────────────────────────────────────────

const isEntrypoint =
	process.argv[1] ===
	(typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url));

if (isEntrypoint) {
	if (!process.argv.includes("--check")) {
		process.stderr.write(
			"Usage: npx tsx scripts/test-naming-guard.ts --check\n",
		);
		process.exit(1);
	}

	const { ok, violations, paidDebt, stale } = runCheck();

	if (ok) {
		process.stdout.write("test-naming-guard --check: clean.\n");
		process.exit(0);
	}

	process.stderr.write("test-naming-guard --check: naming violations found!\n\n");

	for (const v of violations) {
		if (v.kind === "filename") {
			process.stderr.write(
				`  ${v.path}: filename starts with a workpackage identifier "${v.offender}".\n` +
				`    → rename to describe the behavior (e.g. "session-cost-per-step-delta.integration.test.ts")\n`,
			);
		} else {
			process.stderr.write(
				`  ${v.path}:${v.line}: test string contains a workpackage identifier: "${v.offender}"\n` +
				`    → rename to describe the behavior (e.g. "multi-step session cost equals the sum of per-step deltas")\n`,
			);
		}
	}

	for (const p of paidDebt) {
		process.stderr.write(
			`  debt paid — ${p} is clean but still on the allowlist. Remove it from scripts/test-naming-guard.allowlist.json.\n`,
		);
	}

	for (const p of stale) {
		process.stderr.write(
			`  stale allowlist entry — ${p} does not exist. Remove it from scripts/test-naming-guard.allowlist.json.\n`,
		);
	}

	process.stderr.write(
		"\nTest file names and describe/test/it strings must not contain workpackage\n" +
		"identifiers (e.g. AR3, AF10, X3, af7). Name the behavior under test.\n" +
		"Known legacy debt is listed in scripts/test-naming-guard.allowlist.json\n" +
		"(monotonic shrink — renamed files must NOT be re-added). See .claude/rules/testing.md.\n",
	);
	process.exit(1);
}
