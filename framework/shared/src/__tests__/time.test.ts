/**
 * AI3 — One clock — unit tests for the shared time formatter.
 *
 * RED phase: all tests fail until framework/shared/src/format/time.ts is
 * implemented (task #2, green phase).
 *
 * Migrates and extends the ladder cases from the deleted
 * layers/core-ui/src/__tests__/relative-time.test.ts onto the new named
 * register exports.
 */

import { describe, expect, it } from "vitest";
import {
	absoluteDate,
	absoluteDateTime,
	clockTime,
	relativeLong,
	relativeShort,
	TIME_PLACEHOLDER,
} from "../format/time.js";

// ── Time constants ──────────────────────────────────────────────────────────
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Build an ISO string at (now - offsetMs). */
function iso(offsetMs: number, now: number): string {
	return new Date(now - offsetMs).toISOString();
}

/** Fixed reference "now" for deterministic tests. */
const NOW = new Date("2026-06-12T14:32:07.000Z").getTime();

// ═══════════════════════════════════════════════════════════════════════════
// Register R1 — relativeShort
// ═══════════════════════════════════════════════════════════════════════════

describe("relativeShort (R1)", () => {
	// ── Threshold ladder (ported from relative-time.test.ts) ───────────────

	it("returns 'just now' for 0 ms ago", () => {
		expect(relativeShort(iso(0, NOW), NOW)).toBe("just now");
	});

	it("returns 'just now' for 59 seconds ago", () => {
		expect(relativeShort(iso(59 * SEC, NOW), NOW)).toBe("just now");
	});

	it("returns 'just now' for exactly 59 999 ms ago (< 60s)", () => {
		expect(relativeShort(iso(59_999, NOW), NOW)).toBe("just now");
	});

	it("returns '1m' for 1 minute ago", () => {
		expect(relativeShort(iso(1 * MIN, NOW), NOW)).toBe("1m");
	});

	it("returns '4m' for 4 minutes ago", () => {
		expect(relativeShort(iso(4 * MIN, NOW), NOW)).toBe("4m");
	});

	it("returns '59m' for 59 minutes ago", () => {
		expect(relativeShort(iso(59 * MIN, NOW), NOW)).toBe("59m");
	});

	it("returns '1h' for 1 hour ago", () => {
		expect(relativeShort(iso(1 * HOUR, NOW), NOW)).toBe("1h");
	});

	it("returns '3h' for 3 hours ago", () => {
		expect(relativeShort(iso(3 * HOUR, NOW), NOW)).toBe("3h");
	});

	it("returns '23h' for 23 hours ago", () => {
		expect(relativeShort(iso(23 * HOUR, NOW), NOW)).toBe("23h");
	});

	it("returns '1d' for 1 day ago", () => {
		expect(relativeShort(iso(1 * DAY, NOW), NOW)).toBe("1d");
	});

	it("returns '2d' for 2 days ago", () => {
		expect(relativeShort(iso(2 * DAY, NOW), NOW)).toBe("2d");
	});

	it("returns '6d' for 6 days ago", () => {
		expect(relativeShort(iso(6 * DAY, NOW), NOW)).toBe("6d");
	});

	it("returns '1w' for exactly 7 days ago", () => {
		expect(relativeShort(iso(7 * DAY, NOW), NOW)).toBe("1w");
	});

	it("returns '2w' for 2 weeks ago", () => {
		expect(relativeShort(iso(2 * WEEK, NOW), NOW)).toBe("2w");
	});

	it("returns '3w' for 21 days ago", () => {
		expect(relativeShort(iso(21 * DAY, NOW), NOW)).toBe("3w");
	});

	it("returns '1mo' for 30 days ago (28d threshold, floor by 30d)", () => {
		expect(relativeShort(iso(30 * DAY, NOW), NOW)).toBe("1mo");
	});

	it("returns '2mo' for 60 days ago", () => {
		expect(relativeShort(iso(60 * DAY, NOW), NOW)).toBe("2mo");
	});

	it("returns '11mo' for 330 days ago", () => {
		expect(relativeShort(iso(330 * DAY, NOW), NOW)).toBe("11mo");
	});

	it("returns '1y' for 365 days ago", () => {
		expect(relativeShort(iso(365 * DAY, NOW), NOW)).toBe("1y");
	});

	it("returns '2y' for 730 days ago", () => {
		expect(relativeShort(iso(730 * DAY, NOW), NOW)).toBe("2y");
	});

	// ── Floor semantics ─────────────────────────────────────────────────────

	it("floors at hour boundary — 89m → 1h (not 2h)", () => {
		expect(relativeShort(iso(89 * MIN, NOW), NOW)).toBe("1h");
	});

	it("floors at day boundary — 23h 59m → 23h (not 1d)", () => {
		expect(relativeShort(iso(23 * HOUR + 59 * MIN, NOW), NOW)).toBe("23h");
	});

	// ── now parameter omitted ───────────────────────────────────────────────

	it("uses Date.now() when now parameter is omitted", () => {
		const result = relativeShort(new Date(Date.now() - 2 * DAY).toISOString());
		expect(result).toBe("2d");
	});

	// ── No 'Ns' seconds register (killed) ───────────────────────────────────

	it("never returns a seconds label like '12s'", () => {
		const result = relativeShort(iso(12 * SEC, NOW), NOW);
		expect(result).not.toMatch(/\d+s/);
	});

	// ── Input shapes ────────────────────────────────────────────────────────

	it("accepts a Date object", () => {
		expect(relativeShort(new Date(NOW - 1 * HOUR), NOW)).toBe("1h");
	});

	it("accepts a numeric epoch ms", () => {
		expect(relativeShort(NOW - 1 * DAY, NOW)).toBe("1d");
	});

	it("accepts an ISO string", () => {
		expect(relativeShort(iso(3 * HOUR, NOW), NOW)).toBe("3h");
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Register R2 — relativeLong (R1 + " ago" structural guarantee, AC-1)
// ═══════════════════════════════════════════════════════════════════════════

describe("relativeLong (R2)", () => {
	it("returns 'just now' for 0 ms ago (no 'ago' suffix on clamp)", () => {
		expect(relativeLong(iso(0, NOW), NOW)).toBe("just now");
	});

	it("returns 'just now' for sub-minute future (no 'ago' on clamp)", () => {
		expect(relativeLong(iso(30 * SEC, NOW), NOW)).toBe("just now");
	});

	it("returns '4m ago' for 4 minutes ago", () => {
		expect(relativeLong(iso(4 * MIN, NOW), NOW)).toBe("4m ago");
	});

	it("returns '3h ago' for 3 hours ago", () => {
		expect(relativeLong(iso(3 * HOUR, NOW), NOW)).toBe("3h ago");
	});

	it("returns '2d ago' for 2 days ago", () => {
		expect(relativeLong(iso(2 * DAY, NOW), NOW)).toBe("2d ago");
	});

	it("returns '2w ago' for 2 weeks ago", () => {
		expect(relativeLong(iso(2 * WEEK, NOW), NOW)).toBe("2w ago");
	});

	it("returns '1mo ago' for 30 days ago", () => {
		expect(relativeLong(iso(30 * DAY, NOW), NOW)).toBe("1mo ago");
	});

	it("returns '1y ago' for 365 days ago", () => {
		expect(relativeLong(iso(365 * DAY, NOW), NOW)).toBe("1y ago");
	});

	// ── R2 = R1 + " ago" structural guarantee (AC-1) ───────────────────────
	// For every non-"just now", non-placeholder result: relativeLong === relativeShort + " ago"

	const PROBE_OFFSETS = [4 * MIN, 3 * HOUR, 2 * DAY, 2 * WEEK, 30 * DAY, 365 * DAY, 730 * DAY];

	for (const offset of PROBE_OFFSETS) {
		it(`relativeLong === relativeShort + " ago" for offset ${offset}ms`, () => {
			const short = relativeShort(iso(offset, NOW), NOW);
			const long = relativeLong(iso(offset, NOW), NOW);
			// short is never TIME_PLACEHOLDER or "just now" for these offsets
			expect(long).toBe(`${short} ago`);
		});
	}
});

// ═══════════════════════════════════════════════════════════════════════════
// Invalid / null / undefined / future inputs (AC-3)
// ═══════════════════════════════════════════════════════════════════════════

describe("invalid and edge inputs (AC-3)", () => {
	// ── relativeShort ───────────────────────────────────────────────────────

	it("relativeShort: 'not-a-date' → TIME_PLACEHOLDER", () => {
		expect(relativeShort("not-a-date", NOW)).toBe(TIME_PLACEHOLDER);
	});

	it("relativeShort: null → TIME_PLACEHOLDER", () => {
		expect(relativeShort(null, NOW)).toBe(TIME_PLACEHOLDER);
	});

	it("relativeShort: undefined → TIME_PLACEHOLDER", () => {
		expect(relativeShort(undefined, NOW)).toBe(TIME_PLACEHOLDER);
	});

	it("relativeShort: NaN number → TIME_PLACEHOLDER", () => {
		expect(relativeShort(Number.NaN, NOW)).toBe(TIME_PLACEHOLDER);
	});

	it("relativeShort: Infinity number → TIME_PLACEHOLDER", () => {
		expect(relativeShort(Number.POSITIVE_INFINITY, NOW)).toBe(TIME_PLACEHOLDER);
	});

	it("relativeShort: empty string → TIME_PLACEHOLDER", () => {
		expect(relativeShort("", NOW)).toBe(TIME_PLACEHOLDER);
	});

	it("relativeShort: garbage string → TIME_PLACEHOLDER", () => {
		expect(relativeShort("garbage-string-xyz", NOW)).toBe(TIME_PLACEHOLDER);
	});

	it("relativeShort: future timestamp → 'just now' (clamped, never negative)", () => {
		const future = new Date(NOW + 1 * DAY).toISOString();
		expect(relativeShort(future, NOW)).toBe("just now");
	});

	it("relativeShort: no result contains 'NaN'", () => {
		const cases: TimestampInput[] = [
			null,
			undefined,
			"bad",
			Number.NaN,
			Number.POSITIVE_INFINITY,
			"",
		];
		for (const c of cases) {
			expect(relativeShort(c, NOW)).not.toContain("NaN");
		}
	});

	it("relativeShort: no relative result starts with '-'", () => {
		const future = new Date(NOW + 5 * HOUR).toISOString();
		expect(relativeShort(future, NOW)).not.toMatch(/^-/);
	});

	// ── relativeLong ────────────────────────────────────────────────────────

	it("relativeLong: null → TIME_PLACEHOLDER", () => {
		expect(relativeLong(null, NOW)).toBe(TIME_PLACEHOLDER);
	});

	it("relativeLong: undefined → TIME_PLACEHOLDER", () => {
		expect(relativeLong(undefined, NOW)).toBe(TIME_PLACEHOLDER);
	});

	it("relativeLong: 'not-a-date' → TIME_PLACEHOLDER", () => {
		expect(relativeLong("not-a-date", NOW)).toBe(TIME_PLACEHOLDER);
	});

	it("relativeLong: future → 'just now' (no '-Nh ago')", () => {
		const future = new Date(NOW + 2 * HOUR).toISOString();
		expect(relativeLong(future, NOW)).toBe("just now");
	});

	// ── absoluteDate ─────────────────────────────────────────────────────────

	it("absoluteDate: 'garbage' → TIME_PLACEHOLDER", () => {
		expect(absoluteDate("garbage")).toBe(TIME_PLACEHOLDER);
	});

	it("absoluteDate: null → TIME_PLACEHOLDER", () => {
		expect(absoluteDate(null)).toBe(TIME_PLACEHOLDER);
	});

	it("absoluteDate: undefined → TIME_PLACEHOLDER", () => {
		expect(absoluteDate(undefined)).toBe(TIME_PLACEHOLDER);
	});

	it("absoluteDate: NaN → TIME_PLACEHOLDER", () => {
		expect(absoluteDate(Number.NaN)).toBe(TIME_PLACEHOLDER);
	});

	// ── absoluteDateTime ─────────────────────────────────────────────────────

	it("absoluteDateTime: undefined → TIME_PLACEHOLDER", () => {
		expect(absoluteDateTime(undefined)).toBe(TIME_PLACEHOLDER);
	});

	it("absoluteDateTime: null → TIME_PLACEHOLDER", () => {
		expect(absoluteDateTime(null)).toBe(TIME_PLACEHOLDER);
	});

	it("absoluteDateTime: 'garbage' → TIME_PLACEHOLDER", () => {
		expect(absoluteDateTime("garbage")).toBe(TIME_PLACEHOLDER);
	});

	// ── clockTime ────────────────────────────────────────────────────────────

	it("clockTime: null → TIME_PLACEHOLDER", () => {
		expect(clockTime(null)).toBe(TIME_PLACEHOLDER);
	});

	it("clockTime: undefined → TIME_PLACEHOLDER", () => {
		expect(clockTime(undefined)).toBe(TIME_PLACEHOLDER);
	});

	it("clockTime: 'not-a-date' → TIME_PLACEHOLDER", () => {
		expect(clockTime("not-a-date")).toBe(TIME_PLACEHOLDER);
	});

	it("clockTime: NaN → TIME_PLACEHOLDER", () => {
		expect(clockTime(Number.NaN)).toBe(TIME_PLACEHOLDER);
	});
});

// ── Type alias used in tests above ───────────────────────────────────────────
type TimestampInput = string | number | Date | null | undefined;

// ═══════════════════════════════════════════════════════════════════════════
// Register R3 — clockTime (AC-4 precision + 24h parameterization)
// ═══════════════════════════════════════════════════════════════════════════

describe("clockTime (R3)", () => {
	// Fixed timestamp: 2026-06-12T14:32:07.000Z
	const TS = "2026-06-12T14:32:07.000Z";

	it("seconds=true → 24h HH:mm:ss (no am/pm)", () => {
		// Matches /^\d{2}:\d{2}:\d{2}$/ — locks the site-15 24h normalization
		const result = clockTime(TS, { seconds: true });
		expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
	});

	it("seconds=true → does NOT contain 'AM' or 'PM'", () => {
		const result = clockTime(TS, { seconds: true });
		expect(result).not.toMatch(/AM|PM/i);
	});

	it("seconds=false (default) → non-empty string", () => {
		const result = clockTime(TS);
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
		expect(result).not.toBe(TIME_PLACEHOLDER);
	});

	it("seconds=false → no seconds component (not HH:mm:ss)", () => {
		// The minute variant should not match a 3-part HH:mm:ss pattern
		const result = clockTime(TS);
		expect(result).not.toMatch(/^\d{2}:\d{2}:\d{2}$/);
	});

	it("accepts a numeric epoch ms", () => {
		const result = clockTime(NOW, { seconds: true });
		expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
	});

	it("accepts a Date object", () => {
		const result = clockTime(new Date(TS), { seconds: true });
		expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Register R4 — absoluteDate / absoluteDateTime (AC-4 one format app-wide)
// ═══════════════════════════════════════════════════════════════════════════

describe("absoluteDate (R4a)", () => {
	// Fixed date: 2026-06-12
	const TS = "2026-06-12T14:32:07.000Z";

	it("matches /^[A-Z][a-z]{2} \\d{1,2}, \\d{4}$/ (MMM D, YYYY format)", () => {
		const result = absoluteDate(TS);
		expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
	});

	it("contains the year 2026", () => {
		expect(absoluteDate(TS)).toMatch(/2026/);
	});

	it("accepts a Date object", () => {
		const result = absoluteDate(new Date(TS));
		expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
	});

	it("accepts a numeric epoch ms", () => {
		const result = absoluteDate(NOW);
		expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
	});

	it("future timestamp renders its real date (no clamp for absolute)", () => {
		const future = "2030-01-15T00:00:00.000Z";
		const result = absoluteDate(future);
		expect(result).toMatch(/2030/);
	});
});

describe("absoluteDateTime (R4b)", () => {
	const TS = "2026-06-12T14:32:07.000Z";

	it("starts with a MMM D, YYYY date portion", () => {
		const result = absoluteDateTime(TS);
		// Should start with date like "Jun 12, 2026"
		expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}/);
	});

	it("contains a comma-separated clock portion after the date", () => {
		const result = absoluteDateTime(TS);
		// Should contain ", " separator then time
		expect(result).toContain(", ");
		// At minimum two segments when split on ", "
		const parts = result.split(", ");
		expect(parts.length).toBeGreaterThanOrEqual(2);
	});

	it("contains the year 2026", () => {
		expect(absoluteDateTime(TS)).toMatch(/2026/);
	});

	it("future timestamp renders its real date (no clamp for absolute)", () => {
		const future = "2030-03-20T10:00:00.000Z";
		const result = absoluteDateTime(future);
		expect(result).toMatch(/2030/);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// TIME_PLACEHOLDER constant
// ═══════════════════════════════════════════════════════════════════════════

describe("TIME_PLACEHOLDER", () => {
	it("is the em-dash character U+2014", () => {
		expect(TIME_PLACEHOLDER).toBe("—");
	});

	it("is a single character", () => {
		expect(TIME_PLACEHOLDER).toHaveLength(1);
	});
});
