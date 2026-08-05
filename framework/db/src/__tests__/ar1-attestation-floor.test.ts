/**
 * AR1 — attestation executed-count floor unit tests (TDD red phase).
 *
 * Tests the pure functions of scripts/lib/attestation-floor.ts (architecture.md
 * Mechanism 4 + Decision 4):
 *
 *   extractAgenticCounts(json, predicate): { agenticExecuted, agenticSkipped }
 *     Over a parsed vitest `--reporter=json` object:
 *       json.testResults[]            — one entry per file, `name` = file path (absolute)
 *       …[i].assertionResults[].status ∈ "passed"|"failed"|"skipped"|"pending"|"todo"
 *     For each file whose predicate(name) is true (name normalized abs→repo-relative POSIX):
 *       status passed|failed  → agenticExecuted++
 *       status skipped|pending|todo → agenticSkipped++
 *     Files the predicate rejects are ignored entirely. A predicate-matched file with
 *     ZERO assertions (whole-file collection-skip) contributes 0/0.
 *
 *   assertAgenticFloor(counts): string | null
 *     - agenticExecuted === 0 with a non-empty set      → violation string
 *     - empty set (executed+skipped === 0)              → violation string
 *     - agenticExecuted >= 1                            → null
 *     - legacy { undefined, undefined } (no AR1 fields) → null (back-compat, no crash)
 *
 * Field names are exactly `agenticExecuted` / `agenticSkipped`.
 *
 * The module under test does not exist yet — these tests are intentionally RED.
 */

import { describe, expect, test } from "vitest";
import {
	assertAgenticFloor,
	extractAgenticCounts,
	type VitestJsonResult,
} from "../../../../scripts/lib/attestation-floor.js";

// ── Fixture builders mirroring the vitest --reporter=json shape ───────────────

type Status = "passed" | "failed" | "skipped" | "pending" | "todo";

function fileResult(name: string, statuses: Status[]): VitestJsonResult["testResults"][number] {
	return {
		name,
		assertionResults: statuses.map((status) => ({ status })),
	};
}

function report(...files: VitestJsonResult["testResults"]): VitestJsonResult {
	return { testResults: files };
}

const HARNESS = "/abs/repo/packages/server/src/harness/__tests__/foo.integration.test.ts";
const HARNESS2 = "/abs/repo/packages/server/src/harness/__tests__/bar.integration.test.ts";
const SESSION_PROV =
	"/abs/repo/packages/server/src/__tests__/session-provisioning.integration.test.ts";
const SERVICE = "/abs/repo/packages/server/src/__tests__/threads.integration.test.ts";
const UNIT = "/abs/repo/packages/server/src/harness/__tests__/adapter-pool.test.ts";

// Predicate matching the path-only single source (abs path normalized internally).
function harnessPredicate(p: string): boolean {
	return (
		/\/harness\/__tests__\/.*\.integration\.test\.ts$/.test(p) ||
		p.endsWith("__tests__/session-provisioning.integration.test.ts")
	);
}

// ── extractAgenticCounts ──────────────────────────────────────────────────────

describe("extractAgenticCounts — counts executed/skipped in matched files only", () => {
	test("passed + failed count as executed", () => {
		const json = report(fileResult(HARNESS, ["passed", "failed", "passed"]));
		const counts = extractAgenticCounts(json, harnessPredicate);
		expect(counts.agenticExecuted).toBe(3);
		expect(counts.agenticSkipped).toBe(0);
	});

	test("skipped + pending + todo count as skipped", () => {
		const json = report(fileResult(HARNESS, ["skipped", "pending", "todo"]));
		const counts = extractAgenticCounts(json, harnessPredicate);
		expect(counts.agenticExecuted).toBe(0);
		expect(counts.agenticSkipped).toBe(3);
	});

	test("mixed statuses in a matched file", () => {
		const json = report(fileResult(HARNESS, ["passed", "skipped", "failed", "todo"]));
		const counts = extractAgenticCounts(json, harnessPredicate);
		expect(counts.agenticExecuted).toBe(2);
		expect(counts.agenticSkipped).toBe(2);
	});

	test("session-provisioning (explicit) is counted", () => {
		const json = report(fileResult(SESSION_PROV, ["passed"]));
		const counts = extractAgenticCounts(json, harnessPredicate);
		expect(counts.agenticExecuted).toBe(1);
	});

	test("aggregates across multiple matched files", () => {
		const json = report(
			fileResult(HARNESS, ["passed", "skipped"]),
			fileResult(HARNESS2, ["failed", "todo", "passed"]),
		);
		const counts = extractAgenticCounts(json, harnessPredicate);
		expect(counts.agenticExecuted).toBe(3); // passed + failed + passed
		expect(counts.agenticSkipped).toBe(2); // skipped + todo
	});

	test("a non-harness (service) file's assertions are IGNORED", () => {
		const json = report(
			fileResult(SERVICE, ["passed", "passed", "passed"]),
			fileResult(HARNESS, ["passed"]),
		);
		const counts = extractAgenticCounts(json, harnessPredicate);
		// Only the harness file's single passed assertion counts.
		expect(counts.agenticExecuted).toBe(1);
		expect(counts.agenticSkipped).toBe(0);
	});

	test("a *.test.ts unit in the harness dir is IGNORED", () => {
		const json = report(fileResult(UNIT, ["passed", "passed"]));
		const counts = extractAgenticCounts(json, harnessPredicate);
		expect(counts.agenticExecuted).toBe(0);
		expect(counts.agenticSkipped).toBe(0);
	});

	test("a matched file with ZERO assertions (whole-file collection skip) contributes 0/0", () => {
		const json = report(fileResult(HARNESS, []));
		const counts = extractAgenticCounts(json, harnessPredicate);
		expect(counts.agenticExecuted).toBe(0);
		expect(counts.agenticSkipped).toBe(0);
	});

	test("empty testResults → 0/0", () => {
		const counts = extractAgenticCounts(report(), harnessPredicate);
		expect(counts.agenticExecuted).toBe(0);
		expect(counts.agenticSkipped).toBe(0);
	});

	test("normalizes absolute paths before the predicate (relative path also matches)", () => {
		const rel = "packages/server/src/harness/__tests__/foo.integration.test.ts";
		const json = report(fileResult(rel, ["passed"]));
		const counts = extractAgenticCounts(json, harnessPredicate);
		expect(counts.agenticExecuted).toBe(1);
	});
});

// ── assertAgenticFloor ────────────────────────────────────────────────────────

describe("assertAgenticFloor — fails on zero-executed / empty set", () => {
	test("zero executed with skips present → violation string", () => {
		const v = assertAgenticFloor({ agenticExecuted: 0, agenticSkipped: 5 });
		expect(typeof v).toBe("string");
		expect(v).not.toBeNull();
	});

	test("empty set (0 executed, 0 skipped) → violation string", () => {
		const v = assertAgenticFloor({ agenticExecuted: 0, agenticSkipped: 0 });
		expect(typeof v).toBe("string");
		expect(v).not.toBeNull();
	});

	test(">=1 executed → null (passes)", () => {
		expect(assertAgenticFloor({ agenticExecuted: 1, agenticSkipped: 0 })).toBeNull();
	});

	test("many executed with some skipped → null", () => {
		expect(assertAgenticFloor({ agenticExecuted: 7, agenticSkipped: 3 })).toBeNull();
	});

	test("legacy attestation { undefined, undefined } → null (back-compat, no crash)", () => {
		const v = assertAgenticFloor({
			agenticExecuted: undefined,
			agenticSkipped: undefined,
		});
		expect(v).toBeNull();
	});

	test("legacy attestation with both fields absent → null", () => {
		const v = assertAgenticFloor({});
		expect(v).toBeNull();
	});

	// AT1: scope="affected" + empty set is a valid empty slice (no harness files changed)
	test("empty set + scope=affected → null (valid empty affected slice)", () => {
		const v = assertAgenticFloor({ agenticExecuted: 0, agenticSkipped: 0 }, "affected");
		expect(v).toBeNull();
	});

	test("empty set + scope=full → violation string (full run must have agentic coverage)", () => {
		const v = assertAgenticFloor({ agenticExecuted: 0, agenticSkipped: 0 }, "full");
		expect(typeof v).toBe("string");
		expect(v).not.toBeNull();
	});

	test("empty set + scope undefined (legacy) → violation string", () => {
		const v = assertAgenticFloor({ agenticExecuted: 0, agenticSkipped: 0 }, undefined);
		expect(typeof v).toBe("string");
		expect(v).not.toBeNull();
	});
});

// ── floor over extractor output (integration of the two pure fns) ─────────────

describe("floor + extractor together", () => {
	test("a report where every agentic assertion skipped trips the floor", () => {
		const json = report(
			fileResult(HARNESS, ["skipped", "skipped"]),
			fileResult(HARNESS2, ["pending"]),
		);
		const counts = extractAgenticCounts(json, harnessPredicate);
		expect(assertAgenticFloor(counts)).not.toBeNull();
	});

	test("a report with at least one executed agentic assertion passes the floor", () => {
		const json = report(fileResult(HARNESS, ["skipped", "passed"]));
		const counts = extractAgenticCounts(json, harnessPredicate);
		expect(assertAgenticFloor(counts)).toBeNull();
	});

	test("a report with only non-agentic files trips the empty-set floor", () => {
		const json = report(fileResult(SERVICE, ["passed", "passed"]));
		const counts = extractAgenticCounts(json, harnessPredicate);
		expect(assertAgenticFloor(counts)).not.toBeNull();
	});
});
