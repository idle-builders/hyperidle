/**
 * AF1 RED — Failing tests for the typecheck gate verdict function.
 *
 * Tests the pure computeVerdict() function from tools/repo-gates/src/lib/typecheck-verdict.ts.
 * All tests import the module and assert on return values — no filesystem reads,
 * no execSync, no mocking. This is a proper unit test per CLAUDE.md.
 *
 * Acceptance criteria covered:
 * AC1: Gate covers all packages (structural — enforced by dynamic discovery in gate script).
 * AC2: Non-excepted file with type error → exit non-zero + file named.
 * AC3: Exception list contains exactly broken units (enforced by typecheck-debt.json contents).
 * AC4: npm run verify passes (integration — tested by running verify itself).
 * AC5: Removing a still-broken unit → gate fails.
 * Extra: Crashed package → gate fails (W1 crash-guard requirement).
 * Extra: Excepted-but-clean package → gate fails (stale ratchet).
 * Extra: Orphaned debt entry (package name not on disk) → validated separately by gate script.
 *
 * @lore AU37: moved here from framework/api-contract, where it was parked because the
 * module under test lived in scripts/lib/ (not a workspace package) and vitest projects
 * only cover workspace packages. tools/repo-gates is now that package.
 */

import { describe, expect, it } from "vitest";
import { computeVerdict, type PackageResult } from "../lib/typecheck-verdict.js";

// -- Helpers --

function makeResult(
	name: string,
	ownErrors: number,
	excepted: boolean,
	opts: Partial<PackageResult> = {},
): PackageResult {
	return {
		name,
		ownErrors,
		excepted,
		crashed: false,
		errorLines: ownErrors > 0 ? [`packages/${name}/src/index.ts:1:7 error TS2322: stub`] : [],
		rawOutput: "",
		...opts,
	};
}

// -- Suites --

describe("computeVerdict — happy path", () => {
	it("all packages clean with no exceptions → PASS", () => {
		const results = [makeResult("api-contract", 0, false)];
		const verdict = computeVerdict(results);
		expect(verdict.outcome).toBe("PASS");
		expect(verdict.crashedPackages).toHaveLength(0);
		expect(verdict.failedNonExcepted).toHaveLength(0);
		expect(verdict.staleExcepted).toHaveLength(0);
	});

	it("excepted package with errors → PASS (tolerated)", () => {
		// AC3 + AC2 negative: errors inside an excepted unit do not fail the gate.
		const results = [makeResult("api-contract", 0, false), makeResult("shared", 155, true)];
		const verdict = computeVerdict(results);
		expect(verdict.outcome).toBe("PASS");
		expect(verdict.failedNonExcepted).toHaveLength(0);
	});

	it("multiple excepted packages with errors → PASS", () => {
		const results = [
			makeResult("api-contract", 0, false),
			makeResult("shared", 155, true),
			makeResult("db", 2, true),
			makeResult("server", 3780, true),
		];
		const verdict = computeVerdict(results);
		expect(verdict.outcome).toBe("PASS");
	});
});

describe("computeVerdict — AC2: non-excepted package with errors → FAIL", () => {
	it("single non-excepted package with errors → FAIL", () => {
		// Simulates: const x: string = 123 injected into api-contract
		const results = [
			makeResult("api-contract", 1, false, {
				errorLines: [
					"framework/api-contract/src/index.ts:5:7 - error TS2322: Type 'number' is not assignable to type 'string'.",
				],
			}),
		];
		const verdict = computeVerdict(results);
		expect(verdict.outcome).toBe("FAIL");
		expect(verdict.failedNonExcepted).toHaveLength(1);
		expect(verdict.failedNonExcepted[0]?.name).toBe("api-contract");
	});

	it("failed package is named in the result (AC2: names the file)", () => {
		const errorLine =
			"framework/api-contract/src/index.ts:5:7 - error TS2322: Type 'number' is not assignable to type 'string'.";
		const results = [makeResult("api-contract", 1, false, { errorLines: [errorLine] })];
		const verdict = computeVerdict(results);
		expect(verdict.failedNonExcepted[0]?.errorLines).toContain(errorLine);
	});

	it("clean non-excepted package alongside excepted broken one → PASS", () => {
		const results = [makeResult("api-contract", 0, false), makeResult("shared", 155, true)];
		const verdict = computeVerdict(results);
		expect(verdict.outcome).toBe("PASS");
	});

	it("non-excepted with errors + excepted with errors → FAIL (non-excepted fails it)", () => {
		const results = [makeResult("api-contract", 1, false), makeResult("shared", 155, true)];
		const verdict = computeVerdict(results);
		expect(verdict.outcome).toBe("FAIL");
		expect(verdict.failedNonExcepted).toHaveLength(1);
		expect(verdict.failedNonExcepted[0]?.name).toBe("api-contract");
	});
});

describe("computeVerdict — AC5: removing still-broken unit from list → FAIL", () => {
	it("previously-excepted package now non-excepted with errors → FAIL", () => {
		// Simulates removing 'shared' from typecheck-debt.json while it still has 155 errors.
		const results = [
			makeResult("api-contract", 0, false),
			makeResult("shared", 155, false), // excepted=false: removed from debt list
		];
		const verdict = computeVerdict(results);
		expect(verdict.outcome).toBe("FAIL");
		expect(verdict.failedNonExcepted.map((r) => r.name)).toContain("shared");
	});
});

describe("computeVerdict — crash guard (W1)", () => {
	it("crashed package (tsc exit!=0, zero parseable lines) → FAIL regardless of exception status", () => {
		// Simulates: corrupted tsconfig.json → tsc exits non-zero with no parseable output.
		const results = [
			makeResult("api-contract", 0, false, {
				crashed: true,
				rawOutput:
					"error TS5058: The specified path does not exist: 'framework/api-contract/tsconfig.json'.",
			}),
		];
		const verdict = computeVerdict(results);
		expect(verdict.outcome).toBe("FAIL");
		expect(verdict.crashedPackages).toHaveLength(1);
		expect(verdict.crashedPackages[0]?.name).toBe("api-contract");
	});

	it("crashed excepted package → FAIL (crash takes priority over quarantine)", () => {
		// Even a quarantined package crashing is always a gate failure.
		const results = [
			makeResult("shared", 0, true, {
				crashed: true,
				rawOutput: "fatal: internal compiler error",
			}),
		];
		const verdict = computeVerdict(results);
		expect(verdict.outcome).toBe("FAIL");
		expect(verdict.crashedPackages[0]?.name).toBe("shared");
	});

	it("crashed package raw output is captured in result", () => {
		const rawOutput = "fatal: out of memory\nnode exited with code 137";
		const results = [makeResult("api-contract", 0, false, { crashed: true, rawOutput })];
		const verdict = computeVerdict(results);
		expect(verdict.crashedPackages[0]?.rawOutput).toBe(rawOutput);
	});
});

describe("computeVerdict — stale ratchet", () => {
	it("excepted package with zero own errors → FAIL with stale entry", () => {
		// Simulates: api-contract (clean) mistakenly added to typecheck-debt.json.
		const results = [
			makeResult("api-contract", 0, true), // excepted=true but clean → stale
		];
		const verdict = computeVerdict(results);
		expect(verdict.outcome).toBe("FAIL");
		expect(verdict.staleExcepted).toHaveLength(1);
		expect(verdict.staleExcepted[0]?.name).toBe("api-contract");
	});

	it("stale entry message references the package name", () => {
		const results = [makeResult("api-contract", 0, true)];
		const verdict = computeVerdict(results);
		const allMessages = verdict.messages.join("\n");
		expect(allMessages).toContain("api-contract");
	});

	it("multiple stale entries all reported", () => {
		const results = [makeResult("api-contract", 0, true), makeResult("shared", 0, true)];
		const verdict = computeVerdict(results);
		expect(verdict.staleExcepted).toHaveLength(2);
	});

	it("excepted package with errors is NOT stale (still has debt)", () => {
		const results = [makeResult("shared", 155, true)];
		const verdict = computeVerdict(results);
		expect(verdict.staleExcepted).toHaveLength(0);
		expect(verdict.outcome).toBe("PASS");
	});
});

describe("computeVerdict — combined scenarios", () => {
	it("full passing scenario: clean non-excepted + broken excepted packages → PASS", () => {
		// Represents the expected state after AF1 ships: api-contract clean,
		// all 10 broken packages quarantined.
		const brokenPackages = [
			"shared",
			"db",
			"design-system",
			"desktop",
			"eslint-plugin-design",
			"eval",
			"fabric",
			"server",
			"web",
			"pipeline",
		];
		const results = [
			makeResult("api-contract", 0, false),
			...brokenPackages.map((name) => makeResult(name, 10, true)),
		];
		const verdict = computeVerdict(results);
		expect(verdict.outcome).toBe("PASS");
		expect(verdict.failedNonExcepted).toHaveLength(0);
		expect(verdict.crashedPackages).toHaveLength(0);
		expect(verdict.staleExcepted).toHaveLength(0);
	});

	it("crash takes priority over non-excepted failure in reporting", () => {
		const results = [
			makeResult("api-contract", 1, false), // non-excepted with errors
			makeResult("shared", 0, false, { crashed: true, rawOutput: "crash" }), // crashed
		];
		const verdict = computeVerdict(results);
		expect(verdict.outcome).toBe("FAIL");
		expect(verdict.crashedPackages).toHaveLength(1);
		expect(verdict.failedNonExcepted).toHaveLength(1);
	});
});
