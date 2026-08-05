/**
 * AT1 — assertHarnessSymmetry unit tests (AC3).
 *
 * Ports every adversarial case from ar2-per-harness-floor.test.ts onto the new
 * assertHarnessSymmetry function (D4: equal-count floor + untagged guard).
 * All ported cases must still FAIL (return a violation string) for the same inputs,
 *
 * assertHarnessSymmetry(byHarness, agenticExecuted, supported): string | null
 *   agenticExecuted === 0                       → null (nothing ran)
 *   agenticExecuted > 0 && no tagged buckets     → string (untagged guard)
 *   agenticExecuted > 0 && equal positive buckets → null (every harness ran same matrix)
 *   agenticExecuted > 0 && one zero, others pos  → string
 *   agenticExecuted > 0 && unequal positives     → string
 */

import { describe, expect, test } from "vitest";
import { assertHarnessSymmetry } from "../../../../scripts/lib/attestation-floor.js";

const SUPPORTED = ["builtin", "claude", "codex", "opencode"] as const;

// ── AC3: core D4 logic ─────────────────────────────────────────────────────

describe("assertHarnessSymmetry — D4 conditional symmetry + untagged guard", () => {
	test("agenticExecuted=0 → null (nothing ran — no harness file in slice)", () => {
		expect(assertHarnessSymmetry({}, 0, SUPPORTED)).toBeNull();
	});

	test("agenticExecuted=0 with non-empty byHarness → null (all zero → nothing ran)", () => {
		// If every harness executed 0 and global agenticExecuted=0, it's fine
		const byHarness = {
			builtin: { executed: 0, skipped: 0 },
			claude: { executed: 0, skipped: 0 },
			codex: { executed: 0, skipped: 0 },
			opencode: { executed: 0, skipped: 0 },
		};
		expect(assertHarnessSymmetry(byHarness, 0, SUPPORTED)).toBeNull();
	});

	test("agenticExecuted>0 && no tagged buckets → violation (untagged guard)", () => {
		// A file ran (agenticExecuted>0) but emitted no [harness:X] tags
		const v = assertHarnessSymmetry({}, 5, SUPPORTED);
		expect(v).not.toBeNull();
		expect(typeof v).toBe("string");
		expect(v).toMatch(/untagged|tag/i);
	});

	test("agenticExecuted>0 && all equal positive buckets → null", () => {
		const byHarness = {
			builtin: { executed: 2, skipped: 0 },
			claude: { executed: 2, skipped: 0 },
			codex: { executed: 2, skipped: 0 },
			opencode: { executed: 2, skipped: 0 },
		};
		expect(assertHarnessSymmetry(byHarness, 8, SUPPORTED)).toBeNull();
	});

	test("agenticExecuted>0 && all equal-1 buckets → null", () => {
		const byHarness = {
			builtin: { executed: 1, skipped: 0 },
			claude: { executed: 1, skipped: 0 },
			codex: { executed: 1, skipped: 0 },
			opencode: { executed: 1, skipped: 0 },
		};
		expect(assertHarnessSymmetry(byHarness, 4, SUPPORTED)).toBeNull();
	});

	test("one harness zero, others positive → violation (unequal/missing lane)", () => {
		const byHarness = {
			builtin: { executed: 2, skipped: 0 },
			claude: { executed: 2, skipped: 0 },
			codex: { executed: 0, skipped: 1 }, // codex-zero
			opencode: { executed: 2, skipped: 0 },
		};
		const v = assertHarnessSymmetry(byHarness, 6, SUPPORTED);
		expect(v).not.toBeNull();
		expect(v).toMatch(/codex/);
	});

	test("unequal positives → violation (same supported feature surface must run same count)", () => {
		const byHarness = {
			builtin: { executed: 3, skipped: 0 },
			claude: { executed: 2, skipped: 0 },
			codex: { executed: 2, skipped: 0 },
			opencode: { executed: 2, skipped: 0 },
		};
		const v = assertHarnessSymmetry(byHarness, 9, SUPPORTED);
		expect(v).not.toBeNull();
		expect(v).toMatch(/UNEQUAL|same HyperIdle-facing feature surface/i);
		expect(v).toMatch(/builtin:3/);
		expect(v).toMatch(/claude:2/);
	});
});

// ── AC3: ported cases from ar2-per-harness-floor.test.ts ──────────────────
// Every adversarial case from ar2 must still trip the new fn.

describe("assertHarnessSymmetry — ported AR2 adversarial cases", () => {
	test("codex with 0 executed → violation string naming codex (AR2 codex-zero case)", () => {
		const byHarness = {
			builtin: { executed: 2, skipped: 0 },
			claude: { executed: 1, skipped: 0 },
			codex: { executed: 0, skipped: 1 },
			opencode: { executed: 1, skipped: 0 },
		};
		const v = assertHarnessSymmetry(byHarness, 4, SUPPORTED);
		expect(v).not.toBeNull();
		expect(v).toMatch(/codex/);
	});

	test("missing harness key treated as 0 executed → violation (AR2 missing-key case)", () => {
		// opencode key absent from byHarness
		const byHarness: Record<string, { executed: number; skipped: number }> = {
			builtin: { executed: 1, skipped: 0 },
			claude: { executed: 1, skipped: 0 },
			codex: { executed: 1, skipped: 0 },
			// opencode deliberately absent
		};
		const v = assertHarnessSymmetry(byHarness, 3, SUPPORTED);
		expect(v).not.toBeNull();
		expect(v).toMatch(/opencode/);
	});

	test("multiple harnesses with zero → violation names all of them (AR2 multi-zero case)", () => {
		const byHarness = {
			builtin: { executed: 0, skipped: 1 },
			claude: { executed: 0, skipped: 1 },
			codex: { executed: 1, skipped: 0 },
			opencode: { executed: 1, skipped: 0 },
		};
		const v = assertHarnessSymmetry(byHarness, 2, SUPPORTED);
		expect(v).not.toBeNull();
		expect(v).toMatch(/builtin/);
		expect(v).toMatch(/claude/);
	});

	test("all four harnesses with executed >= 1 and equal → null (AR2 passing case)", () => {
		const byHarness = {
			builtin: { executed: 2, skipped: 0 },
			claude: { executed: 2, skipped: 0 },
			codex: { executed: 2, skipped: 0 },
			opencode: { executed: 2, skipped: 0 },
		};
		expect(assertHarnessSymmetry(byHarness, 8, SUPPORTED)).toBeNull();
	});

	test("empty byHarness with agenticExecuted=0 → null (AR2 empty = nothing ran)", () => {
		// In the new symmetry floor, empty byHarness with 0 executed = nothing ran → pass
		// (contrast with AR2 assertPerHarnessFloor which would fail on the 4 missing keys)
		expect(assertHarnessSymmetry({}, 0, SUPPORTED)).toBeNull();
	});

	test("empty byHarness with agenticExecuted>0 → untagged guard violation", () => {
		// agenticExecuted>0 but no tagged buckets = untagged harness file ran
		const v = assertHarnessSymmetry({}, 3, SUPPORTED);
		expect(v).not.toBeNull();
		expect(v).toMatch(/untagged|tag/i);
	});

	test("violation message mentions harness name (AR2 ZERO message requirement)", () => {
		const byHarness = {
			builtin: { executed: 1, skipped: 0 },
			claude: { executed: 1, skipped: 0 },
			codex: { executed: 0, skipped: 0 },
			opencode: { executed: 1, skipped: 0 },
		};
		const v = assertHarnessSymmetry(byHarness, 3, SUPPORTED);
		expect(v).not.toBeNull();
		expect(v).toMatch(/codex/);
	});
});

// ── Legacy / undefined byHarness (not tested here — new fn doesn't take undefined)
// The new fn signature takes a Record, not Record|undefined.
// assertHarnessSymmetry is always called with the defaulted byHarness from verify-attest.
// The legacy back-compat path is in check-attestation via `agenticExecutedByHarness?` optional.
