/**
 * AR2 — per-harness attestation floor unit tests (TDD red phase).
 *
 * Tests the new pure functions in scripts/lib/attestation-floor.ts (AR2 §2):
 *
 *   extractAgenticCounts (extended return type AgenticCountsByHarness):
 *     Now also returns byHarness: Record<string, { executed, skipped }> keyed by
 *     the [harness:X] token in each assertion's ancestorTitles.
 *
 *   assertPerHarnessFloor(byHarness, supported): string | null
 *     - undefined byHarness → null (back-compat)
 *     - any supported harness with executed === 0 → violation string naming it
 *     - all supported harnesses have executed >= 1 → null
 *
 * These tests are intentionally RED until the implementation lands.
 */

import { describe, expect, test } from "vitest";
import {
	assertPerHarnessFloor,
	extractAgenticCounts,
	type VitestJsonResult,
} from "../../../../scripts/lib/attestation-floor.js";

const SUPPORTED = ["builtin", "claude", "codex", "opencode"] as const;
const HARNESS_FILE =
	"/abs/repo/packages/server/src/harness/__tests__/AR2-provision-real-session.integration.test.ts";

// Extended assertion result shape including ancestorTitles
type AssertionResult = VitestJsonResult["testResults"][number]["assertionResults"][number];

function assertion(status: AssertionResult["status"], ancestorTitles: string[]): AssertionResult {
	return { status, ancestorTitles } as AssertionResult;
}

function fileResult(
	name: string,
	assertions: AssertionResult[],
): VitestJsonResult["testResults"][number] {
	return { name, assertionResults: assertions };
}

function report(...files: VitestJsonResult["testResults"]): VitestJsonResult {
	return { testResults: files };
}

// ── extractAgenticCounts: byHarness bucketing ─────────────────────────────────

describe("extractAgenticCounts — byHarness bucketing from [harness:X] ancestor tags", () => {
	test("no [harness:X] tags → byHarness is empty", () => {
		const json = report(fileResult(HARNESS_FILE, [assertion("passed", ["some describe"])]));
		const counts = extractAgenticCounts(json, (p) => /harness\/__tests__\/.*\.integration/.test(p));
		expect(counts.byHarness).toBeDefined();
		expect(Object.keys(counts.byHarness)).toHaveLength(0);
	});

	test("[harness:claude] tag → claude bucket incremented", () => {
		const json = report(
			fileResult(HARNESS_FILE, [assertion("passed", ["[harness:claude] lane 2"])]),
		);
		const counts = extractAgenticCounts(json, (p) => /harness\/__tests__\/.*\.integration/.test(p));
		expect(counts.byHarness["claude"]?.executed).toBe(1);
		expect(counts.byHarness["claude"]?.skipped).toBe(0);
	});

	test("[harness:builtin] skipped → skipped bucket incremented", () => {
		const json = report(
			fileResult(HARNESS_FILE, [assertion("skipped", ["[harness:builtin] lane 1"])]),
		);
		const counts = extractAgenticCounts(json, (p) => /harness\/__tests__\/.*\.integration/.test(p));
		expect(counts.byHarness["builtin"]?.executed).toBe(0);
		expect(counts.byHarness["builtin"]?.skipped).toBe(1);
	});

	test("all four harness tags → all four buckets present", () => {
		const json = report(
			fileResult(HARNESS_FILE, [
				assertion("passed", ["[harness:builtin] lane 1"]),
				assertion("passed", ["[harness:claude] lane 2"]),
				assertion("passed", ["[harness:codex] lane 3"]),
				assertion("passed", ["[harness:opencode] lane 4"]),
			]),
		);
		const counts = extractAgenticCounts(json, (p) => /harness\/__tests__\/.*\.integration/.test(p));
		expect(counts.byHarness["builtin"]?.executed).toBeGreaterThanOrEqual(1);
		expect(counts.byHarness["claude"]?.executed).toBeGreaterThanOrEqual(1);
		expect(counts.byHarness["codex"]?.executed).toBeGreaterThanOrEqual(1);
		expect(counts.byHarness["opencode"]?.executed).toBeGreaterThanOrEqual(1);
	});

	test("global agenticExecuted is still correct (back-compat)", () => {
		const json = report(
			fileResult(HARNESS_FILE, [
				assertion("passed", ["[harness:builtin]"]),
				assertion("skipped", ["[harness:claude]"]),
			]),
		);
		const counts = extractAgenticCounts(json, (p) => /harness\/__tests__\/.*\.integration/.test(p));
		expect(counts.agenticExecuted).toBe(1);
		expect(counts.agenticSkipped).toBe(1);
	});
});

// ── assertPerHarnessFloor ─────────────────────────────────────────────────────

describe("assertPerHarnessFloor — fails when any supported harness has zero executed", () => {
	test("undefined byHarness → null (legacy back-compat)", () => {
		expect(assertPerHarnessFloor(undefined, SUPPORTED)).toBeNull();
	});

	test("all four harnesses with executed >= 1 → null (passes)", () => {
		const byHarness = {
			builtin: { executed: 2, skipped: 0 },
			claude: { executed: 1, skipped: 0 },
			codex: { executed: 1, skipped: 0 },
			opencode: { executed: 1, skipped: 0 },
		};
		expect(assertPerHarnessFloor(byHarness, SUPPORTED)).toBeNull();
	});

	test("codex with 0 executed → violation string naming codex", () => {
		const byHarness = {
			builtin: { executed: 2, skipped: 0 },
			claude: { executed: 1, skipped: 0 },
			codex: { executed: 0, skipped: 1 },
			opencode: { executed: 1, skipped: 0 },
		};
		const v = assertPerHarnessFloor(byHarness, SUPPORTED);
		expect(v).not.toBeNull();
		expect(v).toMatch(/codex/);
	});

	test("missing harness key (not in byHarness) is treated as 0 executed → violation", () => {
		// opencode key absent from byHarness
		const byHarness = {
			builtin: { executed: 1, skipped: 0 },
			claude: { executed: 1, skipped: 0 },
			codex: { executed: 1, skipped: 0 },
			// opencode deliberately absent
		};
		const v = assertPerHarnessFloor(byHarness, SUPPORTED);
		expect(v).not.toBeNull();
		expect(v).toMatch(/opencode/);
	});

	test("multiple harnesses with zero → violation names all of them", () => {
		const byHarness = {
			builtin: { executed: 0, skipped: 1 },
			claude: { executed: 0, skipped: 1 },
			codex: { executed: 1, skipped: 0 },
			opencode: { executed: 1, skipped: 0 },
		};
		const v = assertPerHarnessFloor(byHarness, SUPPORTED);
		expect(v).not.toBeNull();
		expect(v).toMatch(/builtin/);
		expect(v).toMatch(/claude/);
	});

	test("empty byHarness → all four harnesses have 0 executed → violation", () => {
		const v = assertPerHarnessFloor({}, SUPPORTED);
		expect(v).not.toBeNull();
		expect(v).toMatch(/builtin/);
		expect(v).toMatch(/claude/);
		expect(v).toMatch(/codex/);
		expect(v).toMatch(/opencode/);
	});

	test("violation message mentions 'ZERO executed'", () => {
		const byHarness = {
			builtin: { executed: 1, skipped: 0 },
			claude: { executed: 1, skipped: 0 },
			codex: { executed: 0, skipped: 0 },
			opencode: { executed: 1, skipped: 0 },
		};
		const v = assertPerHarnessFloor(byHarness, SUPPORTED);
		expect(v).toMatch(/ZERO/i);
	});
});
