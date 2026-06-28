#!/usr/bin/env tsx
/**
 * honest-harness-guard — static guard for harness integration test honesty.
 *
 * AR1: Detects and enforces against:
 *   1. Live-lane violations: *.real-harness.test.ts files, vitest.real-harness.config.ts,
 *      test:real-harness npm script.
 *   2. skipIf-on-harness: test.skipIf used as an availability gate in harness-facing
 *      integration tests (must use requireHarness instead).
 *   3. Stub-adapter construction: new ScriptedAdapter/EchoHarnessAdapter/MockHarnessAdapter/
 *      CapturingHarnessAdapter/ScriptedHarness in a harness-facing integration test.
 *   4. vi.mock of harness or LLM seam modules in a harness-facing integration test.
 *
 * Allowlist (scripts/honest-harness-guard.allowlist.json): Known-debt stub-adapter
 * construction files. Shrinks monotonically as AR2–AR6 convert them. The skipIf
 * and lane checks are NEVER allowlisted.
 *
 * Decision 2 (architecture.md): A file is "harness-facing" iff it ends with
 * ".integration.test.ts" AND imports one of the production harness seam modules
 * (or mock-harness-adapter, which IS the offender pattern in integration tests).
 *
 * @lore AR1: regex heuristics are conservative by design. The real teeth are
 * requireHarness (runtime hard-fail) + attestation floor. This guard is the
 * tripwire that stops a NEW offender — not the proof of correctness.
 *
 * @lore AR1: standalone script form follows ah5-no-mock-guard.ts (fail-closed-on-zero
 * inspected files). The allowlist + --write-allowlist is net-new machinery (no ah5
 * precedent; ah5/ah6/mock-inventory have no allowlist whatsoever).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "node:fs/promises";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── isHarnessFacingIntegration (single-sourced predicate) ────────────────────
//
// Used by BOTH this guard AND scripts/verify-attest.ts's attestation floor.
// A regression here fails the unit test (is-harness-facing-integration.test.ts).
// Do not inline or duplicate.

/** The production harness seam module patterns that make a file harness-facing. */
const SEAM_PATTERNS: readonly RegExp[] = [
	/harness\/adapter-pool/,
	/harness\/cli-harness-adapter/,
	/harness\/builtin-harness-adapter/,
	/harness\/remote-harness-adapter/,
	/harness\/llm-client/,
	/services\/session-provisioning/,
	/harness\/mock-harness-adapter/,
	/shared\/harness\/mock-harness-adapter/,
];

/**
 * Detect whether a file is a harness-facing integration test.
 *
 * Decision 2 (architecture.md):
 *   POSITIVE (true) iff:
 *     - filePath ends with ".integration.test.ts"
 *     - AND source imports one of the seam modules (ESM import OR require() call)
 *
 *   FALSE for:
 *     - *.test.ts (wrong suffix)
 *     - *.integration.test.ts with no seam import (web/service integration)
 *     - seam module name only in a comment (not an actual import)
 *
 *   KNOWN MISS (false negative):
 *     - test imports the seam only transitively (via helper, no direct import)
 *     — accepted limitation per Decision 2; AR2-AR6 handle by hand.
 *
 * @lore AR1: Single-sourced predicate. Feeds both this guard (static check)
 * and verify-attest.ts (attestation floor). is-harness-facing-integration.test.ts
 * is the regression net for both blast radii.
 */
export function isHarnessFacingIntegration(filePath: string, source: string): boolean {
	// Must end with .integration.test.ts (not .test.ts, not .spec.ts)
	if (!filePath.endsWith(".integration.test.ts")) return false;

	// Check for actual import/require statements (not comments).
	// We need to match: import ... from "...seam..." or require("...seam...")
	// But NOT a seam name in a comment line.
	const lines = source.split("\n");
	for (const line of lines) {
		const trimmed = line.trimStart();
		// Skip pure comment lines
		if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
			continue;
		}
		// Check for import or require referencing a seam module
		for (const seam of SEAM_PATTERNS) {
			if (seam.test(line)) {
				// Confirm it's in an import/require context, not a comment within code
				// Allow both ESM import and CommonJS require
				if (/(?:^|\s)import\s|require\s*\(/.test(line) || /from\s+["']/.test(line)) {
					return true;
				}
			}
		}
	}
	return false;
}

// ── Stub/dirty detection ──────────────────────────────────────────────────────

/** Patterns that mark a harness-facing integration file as "dirty" (has a stub). */
const STUB_PATTERNS: readonly RegExp[] = [
	/new\s+ScriptedAdapter\s*[({]/,
	/new\s+ScriptedHarness\s*[({]/,
	/new\s+EchoHarnessAdapter\s*[({]/,
	/new\s+CapturingHarnessAdapter\s*[({]/,
	/new\s+MockHarnessAdapter\s*[({]/,
	/new\s+makeBuiltinPool\s*[({]/,
	/class\s+\w+\s+implements\s+HarnessAdapter/,
	/import.*mock-harness-adapter/,
	/vi\.mock\s*\(\s*["'][^"']*harness\/llm-client["']/,
	/vi\.mock\s*\(\s*["'][^"']*callLlm[^"']*["']/,
	/vi\.mock\s*\(\s*["'][^"']*\/harness\/[^"']*["']/,
];

/** Patterns that mark a file as having a skipIf-on-harness (never allowlisted). */
const SKIP_IF_PATTERNS: readonly RegExp[] = [
	/test\.skipIf\s*\(\s*!/,
	/test\.skipIf\s*\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*Installed\s*\)/,
	/test\.skipIf\s*\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*Present\s*\)/,
	/test\.skipIf\s*\(\s*!?\s*binaryPresent\s*\(/,
	/it\.skipIf\s*\(\s*!/,
	/describe\.skipIf\s*\(\s*!/,
];

function isStubDirty(source: string): boolean {
	for (const p of STUB_PATTERNS) {
		if (p.test(source)) return true;
	}
	return false;
}

function hasSkipIf(source: string): boolean {
	for (const p of SKIP_IF_PATTERNS) {
		if (p.test(source)) return true;
	}
	return false;
}

// ── GuardFile / GuardResult types (exported for the allowlist test) ───────────

/**
 * A file entry passed to checkGuardRules.
 * `exists` indicates whether the file actually exists on disk.
 */
export interface GuardFile {
	path: string;
	source: string;
	exists: boolean;
}

/** The result of checking a single file against the guard rules. */
export interface GuardResult {
	path: string;
	violation: string | null;
}

/**
 * checkGuardRules — apply Decision 3 allowlist rules to a set of files.
 *
 * Rules:
 *   Rule 1: dirty + allowlisted → PASS (known debt, tolerated).
 *   Rule 2 (violation): dirty + NOT allowlisted → FAIL ("new offender").
 *   Rule 3 (violation): clean + allowlisted → FAIL ("remove from allowlist").
 *   Rule 4 (violation): stale entry (file missing) + allowlisted → FAIL.
 *
 * skipIf-on-harness is ALWAYS a violation, never allowlisted (AR1 converts all of them).
 *
 * Note: unit test files (*.test.ts) passed here should not produce violations even if
 * they use stub imports — the caller (guard) filters by isHarnessFacingIntegration first,
 * but if a *.test.ts sneaks in, its suffix means isStubDirty checking still runs BUT
 * the SEAM check (isHarnessFacingIntegration) would have excluded it. For belt-and-braces,
 * we check: if it's a *.test.ts (not *.integration.test.ts), emit no violation.
 */
export function checkGuardRules(files: GuardFile[], allowlist: string[]): GuardResult[] {
	const allowlistSet = new Set(allowlist);
	const results: GuardResult[] = [];

	for (const file of files) {
		const onAllowlist = allowlistSet.has(file.path);

		// Rule 4: stale allowlist entry (file does not exist)
		if (!file.exists && onAllowlist) {
			results.push({
				path: file.path,
				violation: `stale allowlist entry ${file.path} — file not found. Remove it from the allowlist.`,
			});
			continue;
		}

		// skipIf check: ALWAYS a violation, never allowlisted
		if (hasSkipIf(file.source)) {
			results.push({
				path: file.path,
				violation:
					`${file.path}: skipIf-on-harness detected — convert to requireHarness() ` +
					`(AR1 mandate: never skipIf to green; use requireHarness which throws on absence).`,
			});
			continue;
		}

		// Belt-and-braces: *.test.ts (non-integration) — never a stub violation
		if (!file.path.endsWith(".integration.test.ts")) {
			results.push({ path: file.path, violation: null });
			continue;
		}

		const dirty = isStubDirty(file.source);

		if (dirty && onAllowlist) {
			// Rule 1: known debt, tolerated
			results.push({ path: file.path, violation: null });
		} else if (dirty && !onAllowlist) {
			// Rule 2: new offender
			results.push({
				path: file.path,
				violation:
					`${file.path}: new offender — stubbed harness adapter detected in a harness-facing ` +
					`integration test. Either convert to requireHarness() + real binary, or add to ` +
					`the allowlist via 'npm run honest-harness-guard -- --write-allowlist'.`,
			});
		} else if (!dirty && onAllowlist) {
			// Rule 3: clean but allowlisted — monotonic shrink violation
			results.push({
				path: file.path,
				violation:
					`${file.path}: remove from allowlist — it no longer has a stubbed harness adapter. ` +
					`AR2–AR6 have converted it. Remove the line from honest-harness-guard.allowlist.json.`,
			});
		} else {
			// clean + not on allowlist: no violation
			results.push({ path: file.path, violation: null });
		}
	}

	return results;
}

// ── Allowlist loading ──────────────────────────────────────────────────────────

interface AllowlistJson {
	$comment?: string;
	version: number;
	stubbedHarnessIntegration: string[];
}

function loadAllowlist(): string[] {
	const allowlistPath = path.join(repoRoot, "scripts", "honest-harness-guard.allowlist.json");
	if (!fs.existsSync(allowlistPath)) return [];
	const raw = fs.readFileSync(allowlistPath, "utf-8");
	const parsed = JSON.parse(raw) as AllowlistJson;
	return parsed.stubbedHarnessIntegration ?? [];
}

// ── File collection ────────────────────────────────────────────────────────────

async function collectIntegrationFiles(): Promise<string[]> {
	const files: string[] = [];
	for await (const f of glob("packages/**/*.integration.test.ts", {
		cwd: repoRoot,
		exclude: (p) => p.includes("node_modules") || p.includes(".git") || p.includes("dist"),
	})) {
		files.push(String(f));
	}
	return files.sort();
}

// ── Lane checks ───────────────────────────────────────────────────────────────

function checkLaneViolations(): string[] {
	const violations: string[] = [];

	// Check for *.real-harness.test.ts files
	// (These should not exist after lane collapse)
	const realHarnessGlobResult = (() => {
		try {
			return fs
				.readdirSync(path.join(repoRoot, "packages"), { recursive: true })
				.filter((f) => typeof f === "string" && f.endsWith(".real-harness.test.ts"))
				.map((f) => `packages/${f}`);
		} catch {
			return [];
		}
	})();

	for (const f of realHarnessGlobResult) {
		violations.push(
			`LANE VIOLATION: ${f} — the .real-harness.test.ts suffix has been collapsed into .integration.test.ts (AR1). Rename this file.`,
		);
	}

	// Check for vitest.real-harness.config.ts
	if (fs.existsSync(path.join(repoRoot, "vitest.real-harness.config.ts"))) {
		violations.push(
			`LANE VIOLATION: vitest.real-harness.config.ts exists — delete it (AR1: lane collapsed into vitest.integration.config.ts).`,
		);
	}

	// Check package.json for test:real-harness script
	const pkgPath = path.join(repoRoot, "package.json");
	if (fs.existsSync(pkgPath)) {
		const pkg = fs.readFileSync(pkgPath, "utf-8");
		if (/"test:real-harness"/.test(pkg)) {
			violations.push(
				`LANE VIOLATION: package.json still has "test:real-harness" script — remove it (AR1).`,
			);
		}
	}

	return violations;
}

// ── Self-test fixtures (--selftest mode) ──────────────────────────────────────

/**
 * Self-test: runs against in-memory fixture data to verify the guard's own logic.
 * Wired into `verify` via honest-harness-guard:selftest.
 *
 * @lore AR1: The guard self-test runs as a fast static check in verify (reads
 * in-memory fixtures, <1s). It is the W3 automated regression net for the guard's
 * contract — not "run by hand at ship."
 */
function runSelfTest(): void {
	process.stderr.write("[honest-harness-guard:selftest] Running guard self-tests...\n");
	let passed = 0;
	let failed = 0;

	function assert(description: string, condition: boolean): void {
		if (condition) {
			passed++;
			process.stderr.write(`  ✓ ${description}\n`);
		} else {
			failed++;
			process.stderr.write(`  ✗ FAIL: ${description}\n`);
		}
	}

	// ── isHarnessFacingIntegration tests ──────────────────────────────────────

	// Positive: seam import in integration file
	assert(
		"isHarnessFacingIntegration: cli-harness-adapter import → true",
		isHarnessFacingIntegration(
			"packages/server/src/harness/__tests__/foo.integration.test.ts",
			`import { CliHarnessAdapter } from "../../harness/cli-harness-adapter.js";\ntest('x', () => {});`,
		),
	);

	// Positive: mock-harness-adapter in integration file → true (IS the offender)
	assert(
		"isHarnessFacingIntegration: mock-harness-adapter in integration file → true",
		isHarnessFacingIntegration(
			"packages/server/src/harness/__tests__/foo.integration.test.ts",
			`import { MockHarnessAdapter } from "../../shared/harness/mock-harness-adapter.js";\ntest('x', () => {});`,
		),
	);

	// False: *.test.ts suffix → false (unit test, never flagged)
	assert(
		"isHarnessFacingIntegration: *.test.ts suffix → false",
		!isHarnessFacingIntegration(
			"packages/server/src/harness/__tests__/adapter-pool.test.ts",
			`import { CliHarnessAdapter } from "../../harness/cli-harness-adapter.js";\ntest('x', () => {});`,
		),
	);

	// False: web integration with no seam → false
	assert(
		"isHarnessFacingIntegration: web integration no seam → false",
		!isHarnessFacingIntegration(
			"packages/server/src/__tests__/threads.integration.test.ts",
			`import { test } from "../test-fixtures.js";\nimport { db } from "@hyperidle/db";\ntest('x', () => {});`,
		),
	);

	// False: seam name only in comment → false
	assert(
		"isHarnessFacingIntegration: seam name in comment only → false",
		!isHarnessFacingIntegration(
			"packages/server/src/__tests__/threads.integration.test.ts",
			`// This test does NOT import harness/cli-harness-adapter\nimport { test } from "../test-fixtures.js";\ntest('x', () => {});`,
		),
	);

	// ── checkGuardRules tests ──────────────────────────────────────────────────

	const OFFENDER_PATH =
		"packages/server/src/harness/__tests__/offender.integration.test.ts";
	const CLEAN_PATH = "packages/server/src/harness/__tests__/clean.integration.test.ts";
	const STALE_PATH = "packages/server/src/harness/__tests__/gone.integration.test.ts";

	const dirtyFile: GuardFile = {
		path: OFFENDER_PATH,
		source: `import { CliHarnessAdapter } from "../../harness/cli-harness-adapter.js";\nconst a = new ScriptedAdapter({ replies: [] });`,
		exists: true,
	};
	const cleanFile: GuardFile = {
		path: CLEAN_PATH,
		source: `import { CliHarnessAdapter } from "../../harness/cli-harness-adapter.js";\nrequireHarness("claude");\ntest('x', async () => {});`,
		exists: true,
	};
	const missingFile: GuardFile = { path: STALE_PATH, source: "", exists: false };

	// Rule 1: dirty + allowlisted → no violation
	const r1 = checkGuardRules([dirtyFile], [OFFENDER_PATH]);
	assert(
		"checkGuardRules Rule 1: dirty + allowlisted → no violation",
		r1.find((r) => r.path === OFFENDER_PATH)?.violation === null,
	);

	// Rule 2: dirty + not allowlisted → violation
	const r2 = checkGuardRules([dirtyFile], []);
	const r2result = r2.find((r) => r.path === OFFENDER_PATH);
	assert(
		"checkGuardRules Rule 2: dirty + not allowlisted → violation",
		r2result?.violation != null && /new offender|not.*allowlist|stubbed.*harness/i.test(r2result.violation),
	);

	// Rule 3: clean + allowlisted → violation (monotonic shrink)
	const r3 = checkGuardRules([cleanFile], [CLEAN_PATH]);
	const r3result = r3.find((r) => r.path === CLEAN_PATH);
	assert(
		"checkGuardRules Rule 3: clean + allowlisted → violation (remove from allowlist)",
		r3result?.violation != null && /remove.*allowlist|no longer.*stub/i.test(r3result.violation),
	);

	// Rule 4: stale allowlist entry → violation
	const r4 = checkGuardRules([missingFile], [STALE_PATH]);
	const r4result = r4.find((r) => r.path === STALE_PATH);
	assert(
		"checkGuardRules Rule 4: stale entry → violation",
		r4result?.violation != null && /stale|not found/i.test(r4result.violation),
	);

	// skipIf-on-harness: always a violation even if allowlisted
	const skipIfFile: GuardFile = {
		path: OFFENDER_PATH,
		source: `import { CliHarnessAdapter } from "../../harness/cli-harness-adapter.js";\ntest.skipIf(!claudeInstalled)("test", async () => {});`,
		exists: true,
	};
	const r5 = checkGuardRules([skipIfFile], [OFFENDER_PATH]);
	const r5result = r5.find((r) => r.path === OFFENDER_PATH);
	assert(
		"checkGuardRules: skipIf-on-harness → violation even if allowlisted",
		r5result?.violation != null && /skipIf|requireHarness/i.test(r5result.violation),
	);

	// Legit unit test stub (*.test.ts) → no violation (belt-and-braces)
	const unitFile: GuardFile = {
		path: "packages/server/src/__tests__/unit.test.ts",
		source: `import { MockHarnessAdapter } from "../../shared/harness/mock-harness-adapter.js";\ntest('unit', () => {});`,
		exists: true,
	};
	const r6 = checkGuardRules([unitFile], []);
	const r6result = r6.find((r) => r.path === unitFile.path);
	assert(
		"checkGuardRules: *.test.ts (unit) with stub → no violation (belt-and-braces)",
		r6result === undefined || r6result.violation === null,
	);

	process.stderr.write(
		`[honest-harness-guard:selftest] ${passed} passed, ${failed} failed\n`,
	);

	if (failed > 0) {
		process.stderr.write(
			`[honest-harness-guard:selftest] FAIL: ${failed} self-test(s) failed. ` +
				`The guard's own logic is broken — fix before running :check.\n`,
		);
		process.exit(1);
	}

	process.stdout.write(
		`[honest-harness-guard:selftest] PASS: all ${passed} self-tests passed.\n`,
	);
}

// ── Main (--check mode) ───────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.includes("--selftest")) {
		runSelfTest();
		return;
	}

	if (args.includes("--write-allowlist")) {
		await writeAllowlist();
		return;
	}

	// Default: --check
	await runCheck();
}

async function runCheck(): Promise<void> {
	// 1. Lane violations (enforced immediately, no allowlist)
	const laneViolations = checkLaneViolations();
	if (laneViolations.length > 0) {
		for (const v of laneViolations) {
			process.stderr.write(`[honest-harness-guard] VIOLATION: ${v}\n`);
		}
		process.stderr.write(
			`[honest-harness-guard] ${laneViolations.length} lane violation(s). Fix before proceeding.\n`,
		);
		process.exit(1);
	}

	// 2. Collect harness-facing integration files
	const allIntegrationPaths = await collectIntegrationFiles();

	// Filter to harness-facing files using the predicate
	const harnessFiles: GuardFile[] = [];
	for (const relPath of allIntegrationPaths) {
		const absPath = path.join(repoRoot, relPath);
		const exists = fs.existsSync(absPath);
		const source = exists ? fs.readFileSync(absPath, "utf-8") : "";
		if (isHarnessFacingIntegration(relPath, source)) {
			harnessFiles.push({ path: relPath, source, exists });
		}
	}

	// Also process allowlist entries (for stale/clean checks)
	const allowlist = loadAllowlist();
	const allowlistSet = new Set(allowlist);

	// Add allowlist entries not yet in harnessFiles (for stale detection)
	const harnessPathsSet = new Set(harnessFiles.map((f) => f.path));
	for (const entry of allowlist) {
		if (!harnessPathsSet.has(entry)) {
			const absPath = path.join(repoRoot, entry);
			const exists = fs.existsSync(absPath);
			const source = exists ? fs.readFileSync(absPath, "utf-8") : "";
			harnessFiles.push({ path: entry, source, exists });
		}
	}

	// Fail closed on zero inspected files (ah5 discipline)
	if (harnessFiles.length === 0 && allowlist.length === 0) {
		process.stderr.write(
			`[honest-harness-guard] FATAL: no harness-facing integration files found. ` +
				`Expected at least some (e.g. session-provisioning.integration.test.ts). ` +
				`A guard that inspects zero files provides zero enforcement.\n`,
		);
		process.exit(1);
	}

	// Run guard rules
	const results = checkGuardRules(harnessFiles, allowlist);
	const violations = results.filter((r) => r.violation !== null);

	if (violations.length > 0) {
		for (const v of violations) {
			process.stderr.write(`[honest-harness-guard] VIOLATION: ${v.violation}\n`);
		}
		process.stderr.write(
			`[honest-harness-guard] ${violations.length} violation(s). ` +
				`Fix stub adapters or update the allowlist via --write-allowlist.\n`,
		);
		process.exit(1);
	}

	const knownDebt = results.filter(
		(r) => r.violation === null && allowlistSet.has(r.path),
	).length;

	process.stdout.write(
		`[honest-harness-guard] PASS: ${harnessFiles.length} harness-facing file(s) checked, ` +
			`${knownDebt} known-debt (allowlisted). ` +
			`0 new violations.\n`,
	);
}

async function writeAllowlist(): Promise<void> {
	process.stderr.write("[honest-harness-guard] Scanning for stub-adapter offenders...\n");

	const allIntegrationPaths = await collectIntegrationFiles();
	const offenders: string[] = [];

	for (const relPath of allIntegrationPaths) {
		const absPath = path.join(repoRoot, relPath);
		if (!fs.existsSync(absPath)) continue;
		const source = fs.readFileSync(absPath, "utf-8");
		if (isHarnessFacingIntegration(relPath, source) && isStubDirty(source)) {
			offenders.push(relPath);
		}
	}

	offenders.sort();

	const allowlistData: AllowlistJson = {
		$comment:
			"Known-debt stubbed harness adapters — shrinks monotonically as AR2–AR6 convert each. " +
			"A path here that the guard finds CLEAN fails the guard (remove the line). " +
			"Never add by hand: regenerate via npm run honest-harness-guard -- --write-allowlist.",
		version: 1,
		stubbedHarnessIntegration: offenders,
	};

	const allowlistPath = path.join(repoRoot, "scripts", "honest-harness-guard.allowlist.json");
	fs.writeFileSync(allowlistPath, JSON.stringify(allowlistData, null, "\t") + "\n");

	process.stdout.write(
		`[honest-harness-guard] Wrote ${offenders.length} offender(s) to ${allowlistPath}\n`,
	);

	if (offenders.length > 0) {
		process.stderr.write(`Known-debt stubs (${offenders.length}):\n`);
		for (const o of offenders) {
			process.stderr.write(`  ${o}\n`);
		}
	}
}

// Only run main() when executed as a script, not when imported as a module.
// This allows is-harness-facing-integration.test.ts and other tests to import
// the pure exported functions (isHarnessFacingIntegration, checkGuardRules)
// without triggering the process.exit() calls.
//
// @lore AR1: ESM "is this the main module" idiom — compare import.meta.url
// with the resolved file:// URL of process.argv[1].
//
// Note: tsx resolves the entry file path when running scripts. The comparison
// covers both 'npx tsx scripts/honest-harness-guard.ts' (direct) and
// 'npx tsx .../honest-harness-guard.ts' (absolute path).
const isMain = (() => {
	try {
		const argv1 = process.argv[1];
		if (!argv1) return false;
		// Normalize: remove file:// prefix if present, resolve to absolute
		const argvResolved = argv1.startsWith("file://")
			? fileURLToPath(argv1)
			: path.resolve(argv1);
		const selfResolved = fileURLToPath(import.meta.url);
		return argvResolved === selfResolved;
	} catch {
		return false;
	}
})();

if (isMain) {
	await main();
}
