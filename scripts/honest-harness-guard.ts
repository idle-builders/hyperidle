#!/usr/bin/env tsx
/**
 * AR1 — honest-harness-guard: fails the build when a harness-facing integration
 * test stubs/scripts/mocks the harness it is supposed to exercise against the real
 * binary, or gates itself with a `skipIf`-on-absent availability check.
 * (architecture.md Mechanism 3 + Decision 2/3/5.)
 *
 * Usage:
 *   npx tsx scripts/honest-harness-guard.ts --check            # CI mode (rides `lint`)
 *   npx tsx scripts/honest-harness-guard.ts --write-allowlist  # (re)generate the debt ledger
 *
 * File selection is PATH-ONLY via isHarnessIntegrationPath (single source —
 * scripts/lib/honest-harness-predicate.ts), so the guard and the attestation
 * floor agree on exactly which files are "agentic".
 *
 * Three checks over the selected files:
 *   1. Lane checks (immediate, NEVER allowlisted): no `*.real-harness.test.ts`
 *      file, no `vitest.real-harness.config.ts`, no `test:real-harness` script.
 *   2. skipIf-on-absent check (immediate, NEVER allowlisted): a skip-when-absent
 *      availability gate in a selected file is always a violation — that is the
 *      pattern requireHarness replaces.
 *   3. Stub-content check (allowlisted, monotonic-shrink): a selected file that
 *      constructs/imports/mocks a fake harness seam. Known debt is tracked in
 *      honest-harness-guard.allowlist.json; the allowlist only ever shrinks.
 *
 * Allowlist rules:
 *   dirty + allowlisted        → PASS  (known debt; AR2–AR6 convert it)
 *   dirty + NOT allowlisted    → FAIL  (new offender — real harness or demote to *.test.ts)
 *   clean + allowlisted        → FAIL  (debt paid — remove from allowlist)
 *   allowlisted path missing   → FAIL  (stale entry)
 *
 * @lore AR1: the guard is a standalone tsx check (not an eslint rule) because it
 *   reasons about whole-repo facts (does the dead .real-harness config exist?) and
 *   owns a stateful monotonic-shrink allowlist — neither fits ESLint's per-file AST
 *   model. It rides `npm run lint` (precedent: ag7-no-divergent-classes.ts) so CI's
 *   Lint step enforces it with no new CI job.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { isHarnessIntegrationPath } from "./lib/honest-harness-predicate.js";

export { isHarnessIntegrationPath } from "./lib/honest-harness-predicate.js";

// ── Pure detection ────────────────────────────────────────────────────────────

/**
 * A selected file is "stub-dirty" when it constructs, imports, or vi.mock()s a
 * fake/scripted/echo/capturing/mock harness seam instead of driving the real one.
 */
const STUB_PATTERNS: readonly RegExp[] = [
	// fake-adapter constructions
	/new\s+(?:Scripted|Echo|Capturing|Mock)(?:Adapter|Harness|HarnessAdapter)\b/,
	/new\s+ScriptedHarness\b/,
	// a hand-rolled HarnessAdapter implementation
	/class\s+\w+\s+implements\s+HarnessAdapter\b/,
	// a factory function / arrow whose RETURN TYPE is HarnessAdapter — i.e. it
	// hand-builds and returns a fake adapter object (the dominant in-repo stub
	// idiom: `function makeStubAdapter(...): HarnessAdapter { return {...} }`,
	// `const make = (): HarnessAdapter => ({...})`). The `)` anchor before the
	// colon scopes this to a RETURN-TYPE annotation, so a parameter annotation
	// (`adapter: HarnessAdapter`) and a type import do NOT match. AC5: stub-the-seam
	// via a factory must fail the build just like `new ScriptedAdapter` /
	// `implements HarnessAdapter`. (AR1 finding 3 — AL6-return-gate +
	// ah5-gates-on-broken-stream evaded the old set with this exact shape.)
	/\)\s*:\s*HarnessAdapter\b/,
	// importing a mock harness adapter module
	/import\s+[^;]*mock-harness-adapter/,
	// vi.mock of the harness seam / the llm-client / a callLlm module
	/vi\.mock\(\s*["'][^"']*harness[^"']*["']/,
	/vi\.mock\(\s*["'][^"']*llm-client[^"']*["']/,
	/vi\.mock\(\s*["'][^"']*callLlm[^"']*["']/,
];

export function isStubDirty(source: string): boolean {
	return STUB_PATTERNS.some((re) => re.test(source));
}

/**
 * A selected file has an absent-skipIf when it uses test/it/describe.skipIf as a
 * skip-when-absent availability gate (the pattern requireHarness replaces).
 *
 * Narrow shape: `.skipIf(!…)` or `.skipIf(<name>Installed|Present|Configured|Missing|Absent)`.
 * The inverse skip-WHEN-PRESENT assertion (e.g. asserting a binary is absent) is a
 * different intent; AR1 removes the one such case (cursor) outright, so it need not
 * be specially excluded here.
 */
const ABSENT_SKIPIF_PATTERNS: readonly RegExp[] = [
	/(?:test|it|describe)\.skipIf\s*\(\s*!/,
	/(?:test|it|describe)\.skipIf\s*\(\s*\w*(?:Installed|Present|Configured)\b/,
	/(?:test|it|describe)\.skipIf\s*\(\s*\w*(?:Missing|Absent)\b/,
];

export function hasAbsentSkipIf(source: string): boolean {
	return ABSENT_SKIPIF_PATTERNS.some((re) => re.test(source));
}

// ── Guard rules over (already-read) files ─────────────────────────────────────

export interface GuardFile {
	/** Repo-relative POSIX path. */
	path: string;
	/** File source (empty string if missing). */
	source: string;
	/** Whether the file exists on disk. */
	exists: boolean;
}

export interface GuardResult {
	path: string;
	violation: string | null;
}

/**
 * Apply the lane/skipIf/stub-content rules to a set of pre-read files against the
 * allowlist. Returns one result per input file plus one per stale allowlist entry.
 */
export function checkGuardRules(files: GuardFile[], allowlist: string[]): GuardResult[] {
	const allow = new Set(allowlist.map((p) => p.replace(/\\/g, "/")));
	const results: GuardResult[] = [];
	const seen = new Set<string>();

	for (const f of files) {
		const p = f.path.replace(/\\/g, "/");
		seen.add(p);
		results.push({ path: p, violation: ruleFor(f, p, allow) });
	}

	// Rule 4 (stale): an allowlisted path that never appeared as an existing file.
	for (const entry of allow) {
		if (seen.has(entry)) continue;
		results.push({
			path: entry,
			violation:
				`stale allowlist entry — ${entry} no longer exists. ` +
				`Remove it from honest-harness-guard.allowlist.json.`,
		});
	}

	return results;
}

function ruleFor(f: GuardFile, p: string, allow: Set<string>): string | null {
	// Only harness-facing integration files are subject to the guard.
	if (!isHarnessIntegrationPath(p)) return null;

	const allowlisted = allow.has(p);

	// Rule 4 (stale): allowlisted but the file is gone.
	if (!f.exists) {
		if (allowlisted) {
			return (
				`stale allowlist entry — ${p} no longer exists. ` +
				`Remove it from honest-harness-guard.allowlist.json.`
			);
		}
		return null;
	}

	// skipIf-on-absent is NEVER allowlisted — always a violation in a selected file.
	if (hasAbsentSkipIf(f.source)) {
		return (
			`skipIf-on-absent availability gate in a harness-facing integration test. ` +
			`Replace it with requireHarness(<name>) — never skipIf to green.`
		);
	}

	const dirty = isStubDirty(f.source);

	if (dirty && allowlisted) return null; // Rule 1: known debt.
	if (dirty && !allowlisted) {
		return (
			`stubbed/scripted/mocked harness seam in a harness-facing integration test. ` +
			`Write against the real harness binary (requireHarness) or demote to a *.test.ts unit.`
		);
	}
	if (!dirty && allowlisted) {
		return (
			`debt paid — ${p} no longer stubs the harness but is still on the allowlist. ` +
			`Remove it from honest-harness-guard.allowlist.json.`
		);
	}
	return null; // clean + not allowlisted — the honest case.
}

// ── Filesystem scan (CLI side) ────────────────────────────────────────────────

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const ALLOWLIST_PATH = path.join(SCRIPT_DIR, "honest-harness-guard.allowlist.json");

const SCAN_DIRS = [
	"packages/server/src/harness/__tests__",
	"packages/server/src/__tests__",
];

/** Collect every existing harness-facing integration file as a GuardFile. */
function collectSelectedFiles(): GuardFile[] {
	const out: GuardFile[] = [];
	for (const dir of SCAN_DIRS) {
		const abs = path.join(REPO_ROOT, dir);
		if (!fs.existsSync(abs)) continue;
		for (const name of fs.readdirSync(abs)) {
			const rel = `${dir}/${name}`;
			if (!isHarnessIntegrationPath(rel)) continue;
			out.push({ path: rel, source: fs.readFileSync(path.join(abs, name), "utf8"), exists: true });
		}
	}
	return out;
}

/** Stale allowlist entries whose files no longer exist (added as non-existing GuardFiles). */
function withStaleEntries(files: GuardFile[], allowlist: string[]): GuardFile[] {
	const present = new Set(files.map((f) => f.path));
	const extras: GuardFile[] = [];
	for (const entry of allowlist) {
		const e = entry.replace(/\\/g, "/");
		if (present.has(e)) continue;
		extras.push({ path: e, source: "", exists: fs.existsSync(path.join(REPO_ROOT, e)) });
	}
	return [...files, ...extras];
}

function readAllowlist(): string[] {
	if (!fs.existsSync(ALLOWLIST_PATH)) return [];
	const parsed: unknown = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8"));
	if (!Array.isArray(parsed)) throw new Error("allowlist must be a JSON array of paths");
	return parsed.map((p) => String(p));
}

// ── Lane checks (immediate, never allowlisted) ────────────────────────────────

function laneViolations(): string[] {
	const violations: string[] = [];

	// 1a: no *.real-harness.test.ts file may survive anywhere in packages/.
	const survivors: string[] = [];
	const walk = (dir: string): void => {
		for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
			if (name.name === "node_modules" || name.name === "dist" || name.name === ".git") continue;
			const full = path.join(dir, name.name);
			if (name.isDirectory()) walk(full);
			else if (name.name.endsWith(".real-harness.test.ts")) {
				survivors.push(path.relative(REPO_ROOT, full));
			}
		}
	};
	walk(path.join(REPO_ROOT, "packages"));
	for (const s of survivors) {
		violations.push(`dead lane: ${s} — rename to *.integration.test.ts (the .real-harness lane is gone)`);
	}

	// 1b: no vitest.real-harness.config.ts.
	if (fs.existsSync(path.join(REPO_ROOT, "vitest.real-harness.config.ts"))) {
		violations.push("dead lane: vitest.real-harness.config.ts must be deleted");
	}

	// 1c: no test:real-harness npm script.
	const pkg: unknown = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
	const scripts =
		pkg && typeof pkg === "object" && "scripts" in pkg
			? (pkg as { scripts?: Record<string, string> }).scripts
			: undefined;
	if (scripts && "test:real-harness" in scripts) {
		violations.push('dead lane: the "test:real-harness" npm script must be removed');
	}

	return violations;
}

// ── --write-allowlist ─────────────────────────────────────────────────────────

function writeAllowlist(): void {
	const files = collectSelectedFiles();
	const dirty = files
		.filter((f) => !hasAbsentSkipIf(f.source) && isStubDirty(f.source))
		.map((f) => f.path)
		.sort();
	fs.writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(dirty, null, "\t")}\n`);
	process.stdout.write(`honest-harness-guard: wrote ${dirty.length} known-debt entries to allowlist.\n`);
	for (const d of dirty) process.stdout.write(`  ${d}\n`);
}

// ── --check ───────────────────────────────────────────────────────────────────

function runCheck(): { ok: boolean; violations: GuardResult[]; lane: string[] } {
	const lane = laneViolations();
	const allowlist = readAllowlist();
	const files = withStaleEntries(collectSelectedFiles(), allowlist);
	const results = checkGuardRules(files, allowlist).filter((r) => r.violation !== null);
	return { ok: lane.length === 0 && results.length === 0, violations: results, lane };
}

const isEntrypoint =
	process.argv[1] ===
	(typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url));

if (isEntrypoint) {
	if (process.argv.includes("--write-allowlist")) {
		writeAllowlist();
		process.exit(0);
	}
	if (process.argv.includes("--check")) {
		const { ok, violations, lane } = runCheck();
		if (ok) {
			process.stdout.write("honest-harness-guard --check: clean.\n");
			process.exit(0);
		}
		process.stderr.write("honest-harness-guard --check: honest-harness violations found!\n\n");
		for (const l of lane) process.stderr.write(`  ${l}\n`);
		for (const v of violations) process.stderr.write(`  ${v.path}: ${v.violation}\n`);
		process.stderr.write(
			"\nHarness-facing integration tests must drive the real binary (requireHarness),\n" +
				"never a stub. Known debt is tracked in scripts/honest-harness-guard.allowlist.json\n" +
				"(monotonic shrink — AR2–AR6 convert it). See plans/AR1/architecture.md.\n",
		);
		process.exit(1);
	}
	process.stderr.write(
		"Usage: npx tsx scripts/honest-harness-guard.ts [--check | --write-allowlist]\n",
	);
	process.exit(1);
}
