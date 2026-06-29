/**
 * AR1 — honest-harness-guard unit tests (TDD red phase).
 *
 * Tests the pure, importable logic of scripts/honest-harness-guard.ts
 * (architecture.md Mechanism 3 + Decision 3 + Decision 5):
 *
 *   isStubDirty(source): boolean
 *     true iff the source constructs a fake/scripted/echo/capturing/mock harness
 *     adapter, imports mock-harness-adapter, or vi.mock()s the harness / llm-client /
 *     callLlm seam.
 *
 *   hasAbsentSkipIf(source): boolean
 *     true iff the source uses test/it/describe.skipIf as a "skip-when-absent"
 *     availability gate (the pattern requireHarness replaces).
 *
 *   checkGuardRules(files, allowlist): GuardResult[]
 *     Decision 3 allowlist rules over harness-facing integration files:
 *       Rule 1: dirty + allowlisted        → PASS (known debt)
 *       Rule 2: dirty + NOT allowlisted     → VIOLATION (new offender)
 *       Rule 3: clean + allowlisted         → VIOLATION (debt paid — remove from allowlist)
 *       Rule 4: allowlisted path missing    → VIOLATION (stale)
 *     skipIf-on-absent in a SELECTED file   → VIOLATION even if allowlisted (never gated).
 *     A *.test.ts unit (not selected by the path predicate) → never a violation, even
 *     if it stubs (stubs are correct in units).
 *
 * Plus: isHarnessIntegrationPath is re-exported from the guard (single source).
 *
 * The module under test does not exist yet — these tests are intentionally RED.
 */

import { describe, expect, test } from "vitest";
import {
	checkGuardRules,
	type GuardFile,
	hasAbsentSkipIf,
	isHarnessIntegrationPath,
	isStubDirty,
} from "../../../../scripts/honest-harness-guard.js";

// GuardResult shape declared locally so strict-mode .find() callbacks type-check
// even before the module exists (red phase).
interface GuardResult {
	path: string;
	violation: string | null;
}

const HARNESS_INT = (name: string): string =>
	`packages/server/src/harness/__tests__/${name}.integration.test.ts`;

function file(path: string, source: string, exists = true): GuardFile {
	return { path, source, exists } as GuardFile;
}

// ── isStubDirty ───────────────────────────────────────────────────────────────

describe("isStubDirty — flags fake/scripted/mocked harness seams", () => {
	test("new ScriptedAdapter(...) → dirty", () => {
		expect(isStubDirty(`const a = new ScriptedAdapter({ replies: ["ok"] });`)).toBe(true);
	});

	test("new ScriptedHarness(...) → dirty", () => {
		expect(isStubDirty(`const h = new ScriptedHarness();`)).toBe(true);
	});

	test("new EchoHarnessAdapter(...) → dirty", () => {
		expect(isStubDirty(`const e = new EchoHarnessAdapter();`)).toBe(true);
	});

	test("new CapturingHarnessAdapter(...) → dirty", () => {
		expect(isStubDirty(`const c = new CapturingHarnessAdapter({});`)).toBe(true);
	});

	test("new MockHarnessAdapter(...) → dirty", () => {
		expect(isStubDirty(`const m = new MockHarnessAdapter();`)).toBe(true);
	});

	test("class X implements HarnessAdapter → dirty", () => {
		expect(isStubDirty(`class FakeAdapter implements HarnessAdapter {}`)).toBe(true);
	});

	test("factory function returning : HarnessAdapter → dirty (AR1 finding 3)", () => {
		// The dominant in-repo stub idiom: a hand-rolled factory whose RETURN TYPE
		// is HarnessAdapter (AL6-return-gate's makeStubAdapter, ah5's makeBrokenStreamAdapter).
		const multiLine = [
			`function makeStubAdapter(`,
			`	events: HarnessEvent[],`,
			`): HarnessAdapter {`,
			`	return { startSession() {}, streamEvents() {} } as HarnessAdapter;`,
			`}`,
		].join("\n");
		expect(isStubDirty(multiLine)).toBe(true);
	});

	test("single-line factory returning HarnessAdapter → dirty", () => {
		expect(isStubDirty(`function makeBrokenStreamAdapter(): HarnessAdapter {`)).toBe(true);
	});

	test("arrow factory returning HarnessAdapter → dirty", () => {
		expect(isStubDirty(`const make = (): HarnessAdapter => ({ startSession() {} });`)).toBe(true);
	});

	test("a PARAMETER annotated : HarnessAdapter is NOT dirty (no false positive)", () => {
		// `adapter: HarnessAdapter` is a parameter type, not a return-type factory —
		// the `)`-anchor before the colon must keep this clean.
		const src = [
			`import { requireHarness } from "./require-harness.js";`,
			`requireHarness("claude");`,
			`function register(adapter: HarnessAdapter): void { pool.register("local", adapter); }`,
			`test("x", async () => {});`,
		].join("\n");
		expect(isStubDirty(src)).toBe(false);
	});

	test("a type IMPORT of HarnessAdapter is NOT dirty (no false positive)", () => {
		expect(isStubDirty(`import type { HarnessAdapter } from "../harness-adapter.js";`)).toBe(false);
	});

	test("import of mock-harness-adapter → dirty", () => {
		expect(
			isStubDirty(
				`import { MockHarnessAdapter } from "../../../shared/harness/mock-harness-adapter.js";`,
			),
		).toBe(true);
	});

	test('vi.mock("...harness/llm-client...") → dirty', () => {
		expect(isStubDirty(`vi.mock("../llm-client.js");`)).toBe(true);
	});

	test('vi.mock("...callLlm...") → dirty', () => {
		expect(isStubDirty(`vi.mock("../harness/callLlm.js");`)).toBe(true);
	});

	test("vi.mock of any harness module → dirty", () => {
		expect(isStubDirty(`vi.mock("../../harness/cli-harness-adapter.js");`)).toBe(true);
	});

	test("a clean real-harness test (requireHarness + real adapter) → not dirty", () => {
		const src = [
			`import { requireHarness } from "./require-harness.js";`,
			`import { CliHarnessAdapter } from "../cli-harness-adapter.js";`,
			`requireHarness("claude");`,
			`test("real", async () => { const a = new CliHarnessAdapter(cfg); });`,
		].join("\n");
		expect(isStubDirty(src)).toBe(false);
	});

	test("empty source → not dirty", () => {
		expect(isStubDirty("")).toBe(false);
	});
});

// ── hasAbsentSkipIf ───────────────────────────────────────────────────────────

describe("hasAbsentSkipIf — flags skip-when-absent availability gates", () => {
	test("test.skipIf(!x) → true", () => {
		expect(hasAbsentSkipIf(`test.skipIf(!claudeInstalled)("x", () => {});`)).toBe(true);
	});

	test("test.skipIf(!process.env.ANTHROPIC_API_KEY) → true", () => {
		expect(hasAbsentSkipIf(`test.skipIf(!process.env.ANTHROPIC_API_KEY)("x", () => {});`)).toBe(
			true,
		);
	});

	test("describe.skipIf(!installed) → true", () => {
		expect(hasAbsentSkipIf(`describe.skipIf(!installed)("block", () => {});`)).toBe(true);
	});

	test("it.skipIf(binaryMissing) → true", () => {
		expect(hasAbsentSkipIf(`it.skipIf(binaryMissing)("x", () => {});`)).toBe(true);
	});

	test("skipIf(codexInstalled) (…Installed absence-style name) → true", () => {
		expect(hasAbsentSkipIf(`test.skipIf(codexInstalled)("x", () => {});`)).toBe(true);
	});

	test("a file using requireHarness (no skipIf) → false", () => {
		expect(hasAbsentSkipIf(`requireHarness("claude");\ntest("x", () => {});`)).toBe(false);
	});

	test("empty source → false", () => {
		expect(hasAbsentSkipIf("")).toBe(false);
	});
});

// ── checkGuardRules: Decision 3 allowlist rules ───────────────────────────────

const DIRTY_SRC = [
	`import { CliHarnessAdapter } from "../cli-harness-adapter.js";`,
	`const adapter = new ScriptedAdapter({ replies: ["ok"] });`,
	`test("x", async () => {});`,
].join("\n");

const CLEAN_SRC = [
	`import { requireHarness } from "./require-harness.js";`,
	`import { CliHarnessAdapter } from "../cli-harness-adapter.js";`,
	`requireHarness("claude");`,
	`test("x", async () => {});`,
].join("\n");

const SKIPIF_SRC = [
	`import { CliHarnessAdapter } from "../cli-harness-adapter.js";`,
	`test.skipIf(!process.env.ANTHROPIC_API_KEY)("x", async () => {});`,
].join("\n");

describe("checkGuardRules — Rule 1: dirty + allowlisted → pass", () => {
	test("dirty selected file on the allowlist produces no violation", () => {
		const p = HARNESS_INT("offender");
		const results = checkGuardRules([file(p, DIRTY_SRC)], [p]);
		expect(results.find((r: GuardResult) => r.path === p)?.violation).toBeNull();
	});
});

describe("checkGuardRules — Rule 2: dirty + NOT allowlisted → violation", () => {
	test("a new dirty offender not on the allowlist is a violation", () => {
		const p = HARNESS_INT("new-offender");
		const results = checkGuardRules([file(p, DIRTY_SRC)], []);
		expect(results.find((r: GuardResult) => r.path === p)?.violation).toBeTruthy();
	});
});

describe("checkGuardRules — Rule 3: clean + allowlisted → violation (debt paid)", () => {
	test("a clean file still on the allowlist must be flagged for removal", () => {
		const p = HARNESS_INT("converted");
		const results = checkGuardRules([file(p, CLEAN_SRC)], [p]);
		expect(results.find((r: GuardResult) => r.path === p)?.violation).toBeTruthy();
	});
});

describe("checkGuardRules — Rule 4: stale allowlist entry → violation", () => {
	test("an allowlisted path that no longer exists is a violation", () => {
		const p = HARNESS_INT("gone");
		const results = checkGuardRules([file(p, "", false)], [p]);
		expect(results.find((r: GuardResult) => r.path === p)?.violation).toBeTruthy();
	});
});

describe("checkGuardRules — skipIf in a selected file is ALWAYS a violation", () => {
	test("skipIf-on-absent violates even when the path is allowlisted", () => {
		const p = HARNESS_INT("skipper");
		// On the allowlist (would tolerate a stub) — but skipIf is never allowlisted.
		const results = checkGuardRules([file(p, SKIPIF_SRC)], [p]);
		expect(results.find((r: GuardResult) => r.path === p)?.violation).toBeTruthy();
	});

	test("skipIf-on-absent violates when not allowlisted too", () => {
		const p = HARNESS_INT("skipper2");
		const results = checkGuardRules([file(p, SKIPIF_SRC)], []);
		expect(results.find((r: GuardResult) => r.path === p)?.violation).toBeTruthy();
	});
});

describe("checkGuardRules — no false positives", () => {
	test("a *.test.ts unit with a stub is NOT a violation (stubs allowed in units)", () => {
		// Not selected by the path predicate; the guard must not flag it.
		const p = "packages/server/src/harness/__tests__/AL6-return-gate.test.ts";
		const results = checkGuardRules([file(p, DIRTY_SRC)], []);
		expect(results.find((r: GuardResult) => r.path === p)?.violation).toBeNull();
	});

	test("a web/service *.integration.test.ts (not harness-facing) with a stub → no violation", () => {
		const p = "packages/server/src/__tests__/threads.integration.test.ts";
		const results = checkGuardRules([file(p, DIRTY_SRC)], []);
		expect(results.find((r: GuardResult) => r.path === p)?.violation).toBeNull();
	});

	test("a clean harness-facing integration file (real harness) → no violation", () => {
		const p = HARNESS_INT("honest");
		const results = checkGuardRules([file(p, CLEAN_SRC)], []);
		expect(results.find((r: GuardResult) => r.path === p)?.violation).toBeNull();
	});
});

// ── single-sourced predicate is re-exported from the guard ────────────────────

describe("guard re-exports the single-sourced path predicate", () => {
	test("isHarnessIntegrationPath selects a harness-dir integration file", () => {
		expect(isHarnessIntegrationPath(HARNESS_INT("foo"))).toBe(true);
	});

	test("isHarnessIntegrationPath rejects a *.test.ts unit", () => {
		expect(
			isHarnessIntegrationPath("packages/server/src/harness/__tests__/adapter-pool.test.ts"),
		).toBe(false);
	});
});
