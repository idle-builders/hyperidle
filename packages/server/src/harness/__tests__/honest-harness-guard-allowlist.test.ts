/**
 * AR1 — honest-harness-guard allowlist logic unit tests (TDD red phase).
 *
 * Tests the four allowlist enforcement rules from architecture.md Decision 3.
 * These test the pure, importable core logic of the guard — not file I/O or
 * subprocess invocation (those are covered by the --selftest fixture approach).
 *
 * The guard exports an importable function:
 *   checkGuardRules(files: GuardFile[], allowlist: string[]): GuardResult[]
 *
 * Where GuardFile = { path: string; source: string }
 * And GuardResult = { path: string; violation: string | null }
 *
 * Decision 3 rules:
 *   Rule 1: A file that is DIRTY (has a stub) AND on the allowlist → PASS (known debt, tolerated).
 *   Rule 2 (violation): A file that is DIRTY AND NOT on the allowlist → FAIL ("new offender").
 *   Rule 3 (violation): A file on the allowlist that the guard finds CLEAN → FAIL
 *     ("remove <path> from the allowlist — it no longer has a stubbed harness adapter").
 *   Rule 4 (violation): An allowlist entry whose path no longer exists (stale) → FAIL
 *     ("stale allowlist entry <path> — file not found").
 *
 * The module under test does not exist yet — these tests are intentionally RED.
 */

import { describe, expect, test } from "vitest";
import {
	type GuardFile,
	checkGuardRules,
} from "../../../../scripts/honest-harness-guard.js";

// GuardResult shape — mirrors the export; declared locally so strict-mode
// `.find()` callbacks type-check even when the module doesn't exist yet (red phase).
interface GuardResult {
	path: string;
	violation: string | null;
}

// ── Fixture helpers ───────────────────────────────────────────────────────────

/** A harness-facing integration file that constructs a scripted adapter (dirty). */
function dirtyFile(path: string): GuardFile {
	return {
		path,
		source: [
			`import { CliHarnessAdapter } from "../../harness/cli-harness-adapter.js";`,
			`const adapter = new ScriptedAdapter({ replies: ["ok"] });`,
			`test("something", async () => { /* ... */ });`,
		].join("\n"),
		exists: true,
	};
}

/** A harness-facing integration file with NO stub (clean). */
function cleanFile(path: string): GuardFile {
	return {
		path,
		source: [
			`import { requireHarness } from "./require-harness.js";`,
			`import { CliHarnessAdapter } from "../../harness/cli-harness-adapter.js";`,
			`requireHarness("claude");`,
			`test("something", async () => { /* real harness used */ });`,
		].join("\n"),
		exists: true,
	};
}

/** A NON-harness-facing unit test (*.test.ts) with a stub — should never be in the guard set. */
function unitTestFile(path: string): GuardFile {
	return {
		path,
		source: [
			`import { MockHarnessAdapter } from "../../shared/harness/mock-harness-adapter.js";`,
			`test("unit test with stub", () => { /* stubs are fine here */ });`,
		].join("\n"),
		exists: true,
	};
}

/** A stale allowlist entry pointing to a file that does not exist. */
function missingFile(path: string): GuardFile {
	return {
		path,
		source: "",
		exists: false,
	};
}

const OFFENDER_PATH = "packages/server/src/harness/__tests__/offender.integration.test.ts";
const CLEAN_PATH = "packages/server/src/harness/__tests__/clean.integration.test.ts";
const UNIT_PATH = "packages/server/src/harness/__tests__/unit.test.ts";
const STALE_PATH = "packages/server/src/harness/__tests__/gone.integration.test.ts";

// ── Rule 1: dirty + allowlisted → PASS ───────────────────────────────────────

describe("checkGuardRules — Rule 1: dirty + allowlisted → pass (known debt)", () => {
	test("dirty file on allowlist produces no violation", () => {
		const files = [dirtyFile(OFFENDER_PATH)];
		const allowlist = [OFFENDER_PATH];
		const results = checkGuardRules(files, allowlist);
		const result = results.find((r: GuardResult) => r.path === OFFENDER_PATH);
		expect(result?.violation).toBeNull();
	});

	test("multiple dirty files all allowlisted → all pass", () => {
		const path2 = "packages/server/src/__tests__/another.integration.test.ts";
		const files = [dirtyFile(OFFENDER_PATH), dirtyFile(path2)];
		const allowlist = [OFFENDER_PATH, path2];
		const results = checkGuardRules(files, allowlist);
		for (const r of results) {
			expect(r.violation).toBeNull();
		}
	});
});

// ── Rule 2 (violation): dirty + NOT allowlisted → FAIL ───────────────────────

describe("checkGuardRules — Rule 2: dirty + not allowlisted → violation (new offender)", () => {
	test("dirty file NOT on allowlist produces a violation", () => {
		const files = [dirtyFile(OFFENDER_PATH)];
		const allowlist: string[] = []; // not on list
		const results = checkGuardRules(files, allowlist);
		const result = results.find((r: GuardResult) => r.path === OFFENDER_PATH);
		expect(result?.violation).not.toBeNull();
	});

	test("violation message describes 'new offender' or equivalent", () => {
		const files = [dirtyFile(OFFENDER_PATH)];
		const results = checkGuardRules(files, []);
		const result = results.find((r: GuardResult) => r.path === OFFENDER_PATH);
		// The message should indicate this is a new / unallowlisted offender
		expect(result?.violation).toMatch(/new offender|not.*allowlist|stubbed.*harness/i);
	});

	test("dirty file on allowlist does NOT trigger Rule 2 (it passes via Rule 1)", () => {
		const files = [dirtyFile(OFFENDER_PATH)];
		const results = checkGuardRules(files, [OFFENDER_PATH]);
		const result = results.find((r: GuardResult) => r.path === OFFENDER_PATH);
		// Rule 1 wins — should be null, not a Rule 2 violation
		expect(result?.violation).toBeNull();
	});
});

// ── Rule 3 (violation): clean + allowlisted → FAIL (monotonic shrink) ─────────

describe("checkGuardRules — Rule 3: clean + allowlisted → violation (remove from allowlist)", () => {
	test("clean file on allowlist produces a violation", () => {
		const files = [cleanFile(CLEAN_PATH)];
		const allowlist = [CLEAN_PATH]; // was an offender, now converted
		const results = checkGuardRules(files, allowlist);
		const result = results.find((r: GuardResult) => r.path === CLEAN_PATH);
		expect(result?.violation).not.toBeNull();
	});

	test("violation message says to remove the path from allowlist", () => {
		const files = [cleanFile(CLEAN_PATH)];
		const results = checkGuardRules(files, [CLEAN_PATH]);
		const result = results.find((r: GuardResult) => r.path === CLEAN_PATH);
		expect(result?.violation).toMatch(/remove.*allowlist|no longer.*stub/i);
	});

	test("violation message names the specific path", () => {
		const files = [cleanFile(CLEAN_PATH)];
		const results = checkGuardRules(files, [CLEAN_PATH]);
		const result = results.find((r: GuardResult) => r.path === CLEAN_PATH);
		expect(result?.violation).toContain(CLEAN_PATH);
	});

	test("clean file NOT on allowlist produces no violation (it was never an offender)", () => {
		const files = [cleanFile(CLEAN_PATH)];
		const allowlist: string[] = []; // not on the allowlist at all
		const results = checkGuardRules(files, allowlist);
		const result = results.find((r: GuardResult) => r.path === CLEAN_PATH);
		// Clean file, not on allowlist → no Rule 3 violation, no Rule 2 violation either
		expect(result?.violation).toBeNull();
	});
});

// ── Rule 4 (violation): stale allowlist entry (file doesn't exist) → FAIL ─────

describe("checkGuardRules — Rule 4: stale allowlist entry (file missing) → violation", () => {
	test("allowlist entry with non-existent file produces a violation", () => {
		const files = [missingFile(STALE_PATH)];
		const allowlist = [STALE_PATH]; // points to a file that no longer exists
		const results = checkGuardRules(files, allowlist);
		const result = results.find((r: GuardResult) => r.path === STALE_PATH);
		expect(result?.violation).not.toBeNull();
	});

	test("violation message says 'stale' or 'not found'", () => {
		const files = [missingFile(STALE_PATH)];
		const results = checkGuardRules(files, [STALE_PATH]);
		const result = results.find((r: GuardResult) => r.path === STALE_PATH);
		expect(result?.violation).toMatch(/stale|not found|file.*not.*exist/i);
	});

	test("violation message names the stale path", () => {
		const files = [missingFile(STALE_PATH)];
		const results = checkGuardRules(files, [STALE_PATH]);
		const result = results.find((r: GuardResult) => r.path === STALE_PATH);
		expect(result?.violation).toContain(STALE_PATH);
	});
});

// ── Unit test stub detection: *.test.ts files are NEVER in the guard set ──────

describe("checkGuardRules — unit tests (*.test.ts) are excluded from the guard set", () => {
	test("a *.test.ts file with a stub import never produces a violation", () => {
		// The guard only operates on *.integration.test.ts files.
		// Unit test files are passed in by the caller only if they are harness-facing
		// (they won't be, per isHarnessFacingIntegration which gates on suffix).
		// This test verifies the guard doesn't false-positive on unit test files
		// IF they were mistakenly included (belt-and-braces check).
		const files = [unitTestFile(UNIT_PATH)];
		const allowlist: string[] = [];
		const results = checkGuardRules(files, allowlist);
		// The function should handle a *.test.ts gracefully — either exclude it
		// or return no violation (since it's not harness-facing by suffix).
		// The caller (guard) filters by isHarnessFacingIntegration first, so
		// this test documents the expected behavior when the guard's pre-filter
		// is applied before checkGuardRules.
		const result = results.find((r: GuardResult) => r.path === UNIT_PATH);
		// Either excluded (undefined) or no violation — both are valid
		if (result !== undefined) {
			expect(result.violation).toBeNull();
		}
	});
});

// ── Stub construction patterns that mark a file as dirty ─────────────────────

describe("checkGuardRules — stub detection patterns", () => {
	test("file constructing new ScriptedAdapter is dirty", () => {
		const dirtySource = [
			`import { CliHarnessAdapter } from "../../harness/cli-harness-adapter.js";`,
			`const adapter = new ScriptedAdapter({ replies: [] });`,
		].join("\n");
		const files: GuardFile[] = [{ path: OFFENDER_PATH, source: dirtySource, exists: true }];
		const results = checkGuardRules(files, []);
		expect(results.find((r: GuardResult) => r.path === OFFENDER_PATH)?.violation).not.toBeNull();
	});

	test("file constructing new EchoHarnessAdapter is dirty", () => {
		const dirtySource = [
			`import { CliHarnessAdapter } from "../../harness/cli-harness-adapter.js";`,
			`const adapter = new EchoHarnessAdapter();`,
		].join("\n");
		const files: GuardFile[] = [{ path: OFFENDER_PATH, source: dirtySource, exists: true }];
		const results = checkGuardRules(files, []);
		expect(results.find((r: GuardResult) => r.path === OFFENDER_PATH)?.violation).not.toBeNull();
	});

	test("file with vi.mock of harness/llm-client is dirty", () => {
		const dirtySource = [
			`import { provisionSession } from "../../services/session-provisioning.js";`,
			`vi.mock("../../harness/llm-client");`,
		].join("\n");
		const files: GuardFile[] = [{ path: OFFENDER_PATH, source: dirtySource, exists: true }];
		const results = checkGuardRules(files, []);
		expect(results.find((r: GuardResult) => r.path === OFFENDER_PATH)?.violation).not.toBeNull();
	});

	test("file with vi.mock of harness module is dirty", () => {
		const dirtySource = [
			`import { CliHarnessAdapter } from "../../harness/cli-harness-adapter.js";`,
			`vi.mock("../../harness/cli-harness-adapter");`,
		].join("\n");
		const files: GuardFile[] = [{ path: OFFENDER_PATH, source: dirtySource, exists: true }];
		const results = checkGuardRules(files, []);
		expect(results.find((r: GuardResult) => r.path === OFFENDER_PATH)?.violation).not.toBeNull();
	});

	test("file importing mock-harness-adapter directly is dirty", () => {
		const dirtySource = [
			`import { AdapterPool } from "../../harness/adapter-pool.js";`,
			`import { MockHarnessAdapter } from "../../shared/harness/mock-harness-adapter.js";`,
		].join("\n");
		const files: GuardFile[] = [{ path: OFFENDER_PATH, source: dirtySource, exists: true }];
		const results = checkGuardRules(files, []);
		expect(results.find((r: GuardResult) => r.path === OFFENDER_PATH)?.violation).not.toBeNull();
	});
});

// ── skipIf-on-harness is ALWAYS a violation (never allowlisted) ───────────────

describe("checkGuardRules — skipIf-on-harness violations (never allowlisted)", () => {
	test("file with skipIf(claudeInstalled) is a violation even if on allowlist", () => {
		// skipIf checks are NEVER allowlisted — they must be converted in AR1 itself.
		const skipIfSource = [
			`import { CliHarnessAdapter } from "../../harness/cli-harness-adapter.js";`,
			`const claudeInstalled = true;`,
			`test.skipIf(!claudeInstalled)("real claude test", async () => {});`,
		].join("\n");
		const files: GuardFile[] = [{ path: OFFENDER_PATH, source: skipIfSource, exists: true }];
		// Even with the allowlist, skipIf must fail
		const results = checkGuardRules(files, [OFFENDER_PATH]);
		const result = results.find((r: GuardResult) => r.path === OFFENDER_PATH);
		expect(result?.violation).not.toBeNull();
	});

	test("skipIf violation message names the harness or skipIf pattern", () => {
		const skipIfSource = [
			`import { CliHarnessAdapter } from "../../harness/cli-harness-adapter.js";`,
			`test.skipIf(!binaryPresent)("test", async () => {});`,
		].join("\n");
		const files: GuardFile[] = [{ path: OFFENDER_PATH, source: skipIfSource, exists: true }];
		const results = checkGuardRules(files, [OFFENDER_PATH]);
		const result = results.find((r: GuardResult) => r.path === OFFENDER_PATH);
		expect(result?.violation).toMatch(/skipIf|skip.*harness|requireHarness/i);
	});
});
