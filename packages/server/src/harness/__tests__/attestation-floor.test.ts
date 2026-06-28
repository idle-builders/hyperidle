/**
 * AR1 — Attestation executed/skipped count floor unit tests (TDD red phase).
 *
 * Tests the pure functions for:
 *   1. extractAgenticCounts(results, predicate) — counts executed/skipped from a
 *      vitest JSON reporter output object for files matching the harness predicate.
 *   2. assertAgenticFloor(counts) — the floor assertion logic that
 *      check-attestation.ts applies. Returns a violation string or null.
 *
 * Vitest 4 JSON reporter shape (architecture.md §Count extraction):
 *   { testResults: Array<{ name: string (= file path), assertionResults: Array<{ status: string }> }> }
 *   status values: "passed" | "failed" | "skipped" | "pending" | "todo"
 *   "pending" and "todo" count as skipped.
 *   "passed" and "failed" count as executed.
 *
 * Floor rules (from check-attestation.ts additive block, architecture.md §check-attestation):
 *   Rule W5 (non-empty): if agenticExecuted + agenticSkipped === 0 → FAIL
 *     ("agentic harness integration set is EMPTY")
 *   Rule floor: if agenticExecuted === 0 (and total > 0) → FAIL
 *     ("agentic harness integration tests reported ZERO executed")
 *   Rule legacy-back-compat: if agenticExecuted is undefined → no check (pass)
 *
 * The modules under test do not exist yet — these tests are intentionally RED.
 */

import { describe, expect, test } from "vitest";
import {
	assertAgenticFloor,
	extractAgenticCounts,
	type AgenticCounts,
	type VitestJsonResult,
} from "../../../../scripts/lib/attestation-floor.js";
import { isHarnessFacingIntegration } from "../../../../scripts/honest-harness-guard.js";

// ── Vitest JSON fixture builder ───────────────────────────────────────────────

type AssertionStatus = "passed" | "failed" | "skipped" | "pending" | "todo";

interface FixtureAssertion {
	status: AssertionStatus;
}

interface FixtureFile {
	name: string; // file path
	assertions: FixtureAssertion[];
}

function buildVitestJson(files: FixtureFile[]): VitestJsonResult {
	return {
		testResults: files.map((f) => ({
			name: f.name,
			assertionResults: f.assertions.map((a) => ({ status: a.status })),
		})),
	};
}

// ── Fixture paths ─────────────────────────────────────────────────────────────

// Harness-facing integration file (predicate → true)
const HARNESS_FILE = "packages/server/src/harness/__tests__/cli-adapter-real-binary.integration.test.ts";
// Harness-facing with seam import (we pass a source that triggers isHarnessFacingIntegration)
const HARNESS_SOURCE_MAP: Record<string, string> = {
	[HARNESS_FILE]: `import { CliHarnessAdapter } from "../../harness/cli-harness-adapter.js";\ntest('x', () => {});`,
};

// Service integration file (predicate → false)
const SERVICE_FILE = "packages/server/src/__tests__/threads.integration.test.ts";
const SERVICE_SOURCE_MAP: Record<string, string> = {
	[SERVICE_FILE]: `import { test } from "../test-fixtures.js";\ntest('x', () => {});`,
};

/** A predicate that uses the real isHarnessFacingIntegration with source from a map. */
function makeRealPredicate(sourceMap: Record<string, string>) {
	return (filePath: string): boolean => {
		const source = sourceMap[filePath] ?? "";
		return isHarnessFacingIntegration(filePath, source);
	};
}

/** A predicate that always flags a path ending in integration.test.ts as harness-facing
 * (for testing extractAgenticCounts isolation without isHarnessFacingIntegration). */
function alwaysAgenticPredicate(filePath: string): boolean {
	return filePath.endsWith(".integration.test.ts");
}

/** A predicate that never flags anything as harness-facing (empty agentic set). */
function neverAgenticPredicate(_filePath: string): boolean {
	return false;
}

// ── extractAgenticCounts: all tests executed ──────────────────────────────────

describe("extractAgenticCounts — all agentic tests executed", () => {
	test("all passed → executed=N, skipped=0", () => {
		const json = buildVitestJson([
			{ name: HARNESS_FILE, assertions: [{ status: "passed" }, { status: "passed" }] },
		]);
		const counts = extractAgenticCounts(json, alwaysAgenticPredicate);
		expect(counts.agenticExecuted).toBe(2);
		expect(counts.agenticSkipped).toBe(0);
	});

	test("some passed, some failed → both count as executed", () => {
		const json = buildVitestJson([
			{
				name: HARNESS_FILE,
				assertions: [
					{ status: "passed" },
					{ status: "failed" },
					{ status: "passed" },
				],
			},
		]);
		const counts = extractAgenticCounts(json, alwaysAgenticPredicate);
		expect(counts.agenticExecuted).toBe(3);
		expect(counts.agenticSkipped).toBe(0);
	});
});

// ── extractAgenticCounts: all tests skipped ───────────────────────────────────

describe("extractAgenticCounts — all agentic tests skipped", () => {
	test("all skipped → executed=0, skipped=N", () => {
		const json = buildVitestJson([
			{
				name: HARNESS_FILE,
				assertions: [{ status: "skipped" }, { status: "skipped" }],
			},
		]);
		const counts = extractAgenticCounts(json, alwaysAgenticPredicate);
		expect(counts.agenticExecuted).toBe(0);
		expect(counts.agenticSkipped).toBe(2);
	});

	test("pending counts as skipped", () => {
		const json = buildVitestJson([
			{ name: HARNESS_FILE, assertions: [{ status: "pending" }] },
		]);
		const counts = extractAgenticCounts(json, alwaysAgenticPredicate);
		expect(counts.agenticExecuted).toBe(0);
		expect(counts.agenticSkipped).toBe(1);
	});

	test("todo counts as skipped", () => {
		const json = buildVitestJson([
			{ name: HARNESS_FILE, assertions: [{ status: "todo" }] },
		]);
		const counts = extractAgenticCounts(json, alwaysAgenticPredicate);
		expect(counts.agenticExecuted).toBe(0);
		expect(counts.agenticSkipped).toBe(1);
	});
});

// ── extractAgenticCounts: non-agentic files are excluded ─────────────────────

describe("extractAgenticCounts — non-agentic files excluded from counts", () => {
	test("service integration file (predicate=false) not counted", () => {
		const json = buildVitestJson([
			{ name: SERVICE_FILE, assertions: [{ status: "passed" }, { status: "passed" }] },
		]);
		// neverAgenticPredicate: nothing counts
		const counts = extractAgenticCounts(json, neverAgenticPredicate);
		expect(counts.agenticExecuted).toBe(0);
		expect(counts.agenticSkipped).toBe(0);
	});

	test("mixed: agentic file counts, service file does not", () => {
		const json = buildVitestJson([
			{ name: HARNESS_FILE, assertions: [{ status: "passed" }] },
			{ name: SERVICE_FILE, assertions: [{ status: "passed" }, { status: "passed" }] },
		]);
		// Only HARNESS_FILE matches alwaysAgenticPredicate here (ends with .integration.test.ts)
		// Both match, so we need a more selective predicate.
		// Use a predicate that only flags HARNESS_FILE
		const pred = (f: string): boolean => f === HARNESS_FILE;
		const counts = extractAgenticCounts(json, pred);
		expect(counts.agenticExecuted).toBe(1); // only from HARNESS_FILE
		expect(counts.agenticSkipped).toBe(0);
	});
});

// ── extractAgenticCounts: zero agentic files (empty set) ─────────────────────

describe("extractAgenticCounts — zero agentic files matched", () => {
	test("no files match the predicate → executed=0, skipped=0 (empty set)", () => {
		const json = buildVitestJson([
			{ name: SERVICE_FILE, assertions: [{ status: "passed" }] },
		]);
		const counts = extractAgenticCounts(json, neverAgenticPredicate);
		expect(counts.agenticExecuted).toBe(0);
		expect(counts.agenticSkipped).toBe(0);
	});

	test("empty testResults array → executed=0, skipped=0", () => {
		const json = buildVitestJson([]);
		const counts = extractAgenticCounts(json, alwaysAgenticPredicate);
		expect(counts.agenticExecuted).toBe(0);
		expect(counts.agenticSkipped).toBe(0);
	});
});

// ── assertAgenticFloor: floor assertion logic ─────────────────────────────────

describe("assertAgenticFloor — W5 non-empty floor", () => {
	test("empty agentic set (executed=0, skipped=0) → violation (W5)", () => {
		const counts: AgenticCounts = { agenticExecuted: 0, agenticSkipped: 0 };
		const result = assertAgenticFloor(counts);
		expect(result).not.toBeNull();
		expect(result).toMatch(/empty|zero.*agentic|agentic.*set.*empty/i);
	});

	test("non-empty violation message mentions 'EMPTY' or 'empty'", () => {
		const counts: AgenticCounts = { agenticExecuted: 0, agenticSkipped: 0 };
		const result = assertAgenticFloor(counts);
		expect(result).toMatch(/empty/i);
	});
});

describe("assertAgenticFloor — zero executed floor (all skipped)", () => {
	test("agentic tests all skipped (executed=0, skipped>0) → violation", () => {
		const counts: AgenticCounts = { agenticExecuted: 0, agenticSkipped: 3 };
		const result = assertAgenticFloor(counts);
		expect(result).not.toBeNull();
		expect(result).toMatch(/zero executed|0.*executed|skipped.*all/i);
	});

	test("violation message for all-skipped is distinct from empty set", () => {
		const emptyCounts: AgenticCounts = { agenticExecuted: 0, agenticSkipped: 0 };
		const allSkippedCounts: AgenticCounts = { agenticExecuted: 0, agenticSkipped: 5 };
		const emptyMsg = assertAgenticFloor(emptyCounts);
		const allSkippedMsg = assertAgenticFloor(allSkippedCounts);
		// Both are violations, but the messages should be distinct
		expect(emptyMsg).not.toBeNull();
		expect(allSkippedMsg).not.toBeNull();
		// They should not be identical (empty set vs all-skipped are different failures)
		expect(emptyMsg).not.toBe(allSkippedMsg);
	});
});

describe("assertAgenticFloor — some executed (passes)", () => {
	test("at least one executed → no violation", () => {
		const counts: AgenticCounts = { agenticExecuted: 1, agenticSkipped: 0 };
		const result = assertAgenticFloor(counts);
		expect(result).toBeNull();
	});

	test("executed > 0 with some skipped → no violation", () => {
		const counts: AgenticCounts = { agenticExecuted: 2, agenticSkipped: 3 };
		const result = assertAgenticFloor(counts);
		expect(result).toBeNull();
	});

	test("all executed, none skipped → no violation", () => {
		const counts: AgenticCounts = { agenticExecuted: 10, agenticSkipped: 0 };
		const result = assertAgenticFloor(counts);
		expect(result).toBeNull();
	});
});

// ── Back-compat: legacy attestation with no counts ────────────────────────────

describe("assertAgenticFloor — legacy back-compat", () => {
	test("undefined agenticExecuted → no violation (legacy attestation, skip the floor)", () => {
		// The check-attestation.ts block only runs if typeof agenticExecuted === "number"
		// This test verifies the back-compat: an attestation without the field passes.
		const counts: AgenticCounts = { agenticExecuted: undefined as unknown as number, agenticSkipped: undefined as unknown as number };
		const result = assertAgenticFloor(counts);
		// Legacy attestations without the field should be exempt
		expect(result).toBeNull();
	});
});

// ── Integration: real isHarnessFacingIntegration predicate + count extraction ─

describe("extractAgenticCounts with real isHarnessFacingIntegration predicate", () => {
	test("harness-facing file (cli-harness-adapter import) counts as agentic", () => {
		const json = buildVitestJson([
			{
				name: HARNESS_FILE,
				assertions: [{ status: "passed" }, { status: "skipped" }],
			},
		]);
		const allSources = { ...HARNESS_SOURCE_MAP, ...SERVICE_SOURCE_MAP };
		const pred = makeRealPredicate(allSources);
		const counts = extractAgenticCounts(json, pred);
		expect(counts.agenticExecuted).toBe(1);
		expect(counts.agenticSkipped).toBe(1);
	});

	test("service integration file (no seam import) does NOT count as agentic", () => {
		const json = buildVitestJson([
			{
				name: SERVICE_FILE,
				assertions: [{ status: "passed" }, { status: "passed" }],
			},
		]);
		const allSources = { ...HARNESS_SOURCE_MAP, ...SERVICE_SOURCE_MAP };
		const pred = makeRealPredicate(allSources);
		const counts = extractAgenticCounts(json, pred);
		// Service integration file → predicate returns false → not counted
		expect(counts.agenticExecuted).toBe(0);
		expect(counts.agenticSkipped).toBe(0);
	});
});
