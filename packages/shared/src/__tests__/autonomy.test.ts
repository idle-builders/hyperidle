/**
 * L1 — Autonomy Schema (red phase).
 *
 * These tests pin the shared-types contract for the L1–L4 autonomy ladder
 * defined in `docs/plans/L1.md` Decision 2. They MUST fail against `main`
 * until the new `packages/shared/src/types/autonomy.ts` module is created
 * and re-exported from the package barrel.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import {
	AUTONOMY_LEVEL_META,
	AUTONOMY_LEVELS,
	type AutonomyLevel,
	type AutonomyLevelMeta,
	autonomyLevelFromCode,
	DEFAULT_AUTONOMY_LEVEL,
	isAutonomyLevel,
	LEGACY_AUTONOMY_MAPPING,
} from "@hyperidle/shared";

describe("L1: AutonomyLevel type", () => {
	it("is the numeric ladder 1 | 2 | 3 | 4 (no widening to number)", () => {
		// Type-level: a value typed as AutonomyLevel must be assignable to 1|2|3|4
		// and rejected from values outside the ladder. If `AutonomyLevel` ever
		// widens to `number`, these assertions stop being meaningful — the
		// compiler will accept any number and the test suite goes silently green.
		expectTypeOf<AutonomyLevel>().toEqualTypeOf<1 | 2 | 3 | 4>();

		// Sanity: a literal 1 is assignable.
		const a: AutonomyLevel = 1;
		const b: AutonomyLevel = 2;
		const c: AutonomyLevel = 3;
		const d: AutonomyLevel = 4;
		expect([a, b, c, d]).toEqual([1, 2, 3, 4]);
	});

	it("AUTONOMY_LEVELS is the readonly tuple [1, 2, 3, 4]", () => {
		expect(AUTONOMY_LEVELS).toEqual([1, 2, 3, 4]);
		// Type-level: must be `readonly AutonomyLevel[]` (or stricter), not
		// `number[]`.
		expectTypeOf(AUTONOMY_LEVELS).toMatchTypeOf<readonly AutonomyLevel[]>();
	});
});

describe("L1: AUTONOMY_LEVEL_META", () => {
	it("has an entry per ladder level keyed by 1..4", () => {
		for (const level of [1, 2, 3, 4] as const) {
			expect(AUTONOMY_LEVEL_META[level]).toBeDefined();
			expect(AUTONOMY_LEVEL_META[level].level).toBe(level);
		}
	});

	it("each entry has the L1..L4 code", () => {
		expect(AUTONOMY_LEVEL_META[1].code).toBe("L1");
		expect(AUTONOMY_LEVEL_META[2].code).toBe("L2");
		expect(AUTONOMY_LEVEL_META[3].code).toBe("L3");
		expect(AUTONOMY_LEVEL_META[4].code).toBe("L4");
	});

	it("labels match the spec semantics (L1=asks every step ... L4=autonomous, retro)", () => {
		// Spec source: TRACK-L.md L1 contracts/constraints.
		// L1 — asks every step
		expect(AUTONOMY_LEVEL_META[1].label.toLowerCase()).toContain("asks every step");
		// L2 — asks before commit
		expect(AUTONOMY_LEVEL_META[2].label.toLowerCase()).toContain("asks before commit");
		// L3 — commits low-risk, asks high-risk
		expect(AUTONOMY_LEVEL_META[3].label.toLowerCase()).toContain("low-risk");
		expect(AUTONOMY_LEVEL_META[3].label.toLowerCase()).toContain("high-risk");
		// L4 — autonomous, retro only
		expect(AUTONOMY_LEVEL_META[4].label.toLowerCase()).toContain("autonomous");
	});

	it("each entry has a non-empty description", () => {
		for (const level of [1, 2, 3, 4] as const) {
			expect(typeof AUTONOMY_LEVEL_META[level].description).toBe("string");
			expect(AUTONOMY_LEVEL_META[level].description.length).toBeGreaterThan(0);
		}
	});

	it("commitsAutonomously: false at L1/L2, true at L3/L4", () => {
		expect(AUTONOMY_LEVEL_META[1].commitsAutonomously).toBe(false);
		expect(AUTONOMY_LEVEL_META[2].commitsAutonomously).toBe(false);
		expect(AUTONOMY_LEVEL_META[3].commitsAutonomously).toBe(true);
		expect(AUTONOMY_LEVEL_META[4].commitsAutonomously).toBe(true);
	});

	it("retrospectiveOnly: only true at L4", () => {
		expect(AUTONOMY_LEVEL_META[1].retrospectiveOnly).toBe(false);
		expect(AUTONOMY_LEVEL_META[2].retrospectiveOnly).toBe(false);
		expect(AUTONOMY_LEVEL_META[3].retrospectiveOnly).toBe(false);
		expect(AUTONOMY_LEVEL_META[4].retrospectiveOnly).toBe(true);
	});

	it("AutonomyLevelMeta.code is the L1|L2|L3|L4 string union (no widening)", () => {
		expectTypeOf<AutonomyLevelMeta["code"]>().toEqualTypeOf<"L1" | "L2" | "L3" | "L4">();
	});
});

describe("L1: isAutonomyLevel runtime guard", () => {
	it("accepts each ladder level", () => {
		expect(isAutonomyLevel(1)).toBe(true);
		expect(isAutonomyLevel(2)).toBe(true);
		expect(isAutonomyLevel(3)).toBe(true);
		expect(isAutonomyLevel(4)).toBe(true);
	});

	it("rejects out-of-range integers", () => {
		expect(isAutonomyLevel(0)).toBe(false);
		expect(isAutonomyLevel(5)).toBe(false);
		expect(isAutonomyLevel(-1)).toBe(false);
		expect(isAutonomyLevel(2.5)).toBe(false);
	});

	it("rejects strings, null, undefined, objects", () => {
		expect(isAutonomyLevel("L1")).toBe(false);
		expect(isAutonomyLevel("1")).toBe(false);
		expect(isAutonomyLevel(null)).toBe(false);
		expect(isAutonomyLevel(undefined)).toBe(false);
		expect(isAutonomyLevel({})).toBe(false);
		expect(isAutonomyLevel([])).toBe(false);
	});

	it("narrows type to AutonomyLevel inside the guard branch", () => {
		const value: unknown = 3;
		if (isAutonomyLevel(value)) {
			// If isAutonomyLevel doesn't narrow correctly, this assignment is a
			// compile error — that's a real test failure for the red phase.
			const narrowed: AutonomyLevel = value;
			expect(narrowed).toBe(3);
		} else {
			throw new Error("expected isAutonomyLevel(3) to narrow");
		}
	});
});

describe("L1: autonomyLevelFromCode", () => {
	it("returns the matching level for L1..L4", () => {
		expect(autonomyLevelFromCode("L1")).toBe(1);
		expect(autonomyLevelFromCode("L2")).toBe(2);
		expect(autonomyLevelFromCode("L3")).toBe(3);
		expect(autonomyLevelFromCode("L4")).toBe(4);
	});

	it("returns null for unknown codes", () => {
		expect(autonomyLevelFromCode("L0")).toBe(null);
		expect(autonomyLevelFromCode("L5")).toBe(null);
		expect(autonomyLevelFromCode("manual")).toBe(null);
		expect(autonomyLevelFromCode("")).toBe(null);
	});

	it("return type is AutonomyLevel | null", () => {
		expectTypeOf(autonomyLevelFromCode).returns.toEqualTypeOf<AutonomyLevel | null>();
	});
});

describe("L1: DEFAULT_AUTONOMY_LEVEL", () => {
	it("is L1 (the new (agent, skill) default per spec)", () => {
		// "Given an agent with no per-skill rows, when the autonomy editor opens,
		// then every skill defaults to L1 with a 'not yet trusted' hint."
		expect(DEFAULT_AUTONOMY_LEVEL).toBe(1);
	});

	it("type is AutonomyLevel (not number)", () => {
		expectTypeOf<typeof DEFAULT_AUTONOMY_LEVEL>().toMatchTypeOf<AutonomyLevel>();
	});
});

describe("L1: LEGACY_AUTONOMY_MAPPING", () => {
	it("maps the three legacy 3-state strings to ladder levels", () => {
		// Documented mapping per docs/plans/L1.md Decision 2:
		//   manual     -> 1 (asks every step)
		//   supervised -> 2 (asks before commit)
		//   autonomous -> 4 (fully autonomous, retro only)
		expect(LEGACY_AUTONOMY_MAPPING.manual).toBe(1);
		expect(LEGACY_AUTONOMY_MAPPING.supervised).toBe(2);
		expect(LEGACY_AUTONOMY_MAPPING.autonomous).toBe(4);
	});

	it("every value is an AutonomyLevel (compile-time)", () => {
		expectTypeOf(LEGACY_AUTONOMY_MAPPING).toMatchTypeOf<
			Readonly<Record<"manual" | "supervised" | "autonomous", AutonomyLevel>>
		>();
	});

	it("has exactly the three legacy keys (no extras)", () => {
		expect(Object.keys(LEGACY_AUTONOMY_MAPPING).sort()).toEqual([
			"autonomous",
			"manual",
			"supervised",
		]);
	});
});
