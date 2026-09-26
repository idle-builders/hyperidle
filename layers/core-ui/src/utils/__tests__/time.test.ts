/**
 * The shared time formatter — one clock for the whole app: relativeShort,
 * relativeLong, clockTime, absoluteDate, absoluteDateTime, and the
 * TIME_PLACEHOLDER used for every unparseable input.
 */

import { describe, expect, it } from "vitest";
import {
	absoluteDate,
	absoluteDateTime,
	clockTime,
	relativeLong,
	relativeShort,
	TIME_PLACEHOLDER,
} from "../time.js";

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
// relativeShort — the threshold ladder
// ═══════════════════════════════════════════════════════════════════════════

describe("relativeShort", () => {
	it.each<[string, number, string]>([
		["0 ms ago", 0, "just now"],
		["59s ago (< 60s)", 59 * SEC, "just now"],
		["1 minute ago", 1 * MIN, "1m"],
		["59 minutes ago", 59 * MIN, "59m"],
		["1 hour ago", 1 * HOUR, "1h"],
		["23 hours ago", 23 * HOUR, "23h"],
		["1 day ago", 1 * DAY, "1d"],
		["6 days ago", 6 * DAY, "6d"],
		["exactly 7 days ago", 7 * DAY, "1w"],
		["21 days ago", 21 * DAY, "3w"],
		// UI-043: week→month boundary is 30d, not 28d (four-week) — 27-29d must
		// still read as weeks, not "0mo".
		["27 days ago (< 30d month boundary)", 27 * DAY, "3w"],
		["28 days ago (boundary bug fixed)", 28 * DAY, "4w"],
		["30 days ago (first day of months branch)", 30 * DAY, "1mo"],
		["330 days ago", 330 * DAY, "11mo"],
		["365 days ago", 365 * DAY, "1y"],
		["730 days ago", 730 * DAY, "2y"],
		// Floor semantics: rounds down, never up to the next bucket.
		["89m ago floors to 1h, not 2h", 89 * MIN, "1h"],
		["23h59m ago floors to 23h, not 1d", 23 * HOUR + 59 * MIN, "23h"],
	])("%s → %s", (_label, offset, expected) => {
		expect(relativeShort(iso(offset, NOW), NOW)).toBe(expected);
	});

	it("uses Date.now() when now parameter is omitted", () => {
		const result = relativeShort(new Date(Date.now() - 2 * DAY).toISOString());
		expect(result).toBe("2d");
	});

	it("never returns a seconds label like '12s' (register killed)", () => {
		expect(relativeShort(iso(12 * SEC, NOW), NOW)).not.toMatch(/\d+s/);
	});

	it.each<[string, string | number | Date]>([
		["a Date object", new Date(NOW - 1 * HOUR)],
		["a numeric epoch ms", NOW - 1 * DAY],
		["an ISO string", iso(3 * HOUR, NOW)],
	])("accepts %s", (_label, value) => {
		expect(typeof relativeShort(value, NOW)).toBe("string");
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// relativeLong — R1 + " ago" structural guarantee
// ═══════════════════════════════════════════════════════════════════════════

describe("relativeLong", () => {
	it("returns 'just now' for a sub-minute offset, with no 'ago' suffix", () => {
		expect(relativeLong(iso(30 * SEC, NOW), NOW)).toBe("just now");
	});

	it.each([4 * MIN, 3 * HOUR, 2 * DAY, 2 * WEEK, 30 * DAY, 365 * DAY, 730 * DAY])(
		"equals relativeShort + ' ago' for offset %ims",
		(offset) => {
			const short = relativeShort(iso(offset, NOW), NOW);
			expect(relativeLong(iso(offset, NOW), NOW)).toBe(`${short} ago`);
		},
	);
});

// ═══════════════════════════════════════════════════════════════════════════
// Invalid / null / undefined / future inputs
// ═══════════════════════════════════════════════════════════════════════════

type TimestampInput = string | number | Date | null | undefined;

describe("unparseable input → TIME_PLACEHOLDER", () => {
	const BAD_INPUTS: TimestampInput[] = [
		"not-a-date",
		null,
		undefined,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		"",
	];

	it.each(BAD_INPUTS)("relativeShort(%j) → TIME_PLACEHOLDER", (input) => {
		expect(relativeShort(input, NOW)).toBe(TIME_PLACEHOLDER);
	});

	it.each([null, undefined, "not-a-date"] satisfies TimestampInput[])(
		"relativeLong(%j) → TIME_PLACEHOLDER",
		(input) => {
			expect(relativeLong(input, NOW)).toBe(TIME_PLACEHOLDER);
		},
	);

	it.each(["garbage", null, undefined, Number.NaN] satisfies TimestampInput[])(
		"absoluteDate(%j) → TIME_PLACEHOLDER",
		(input) => {
			expect(absoluteDate(input)).toBe(TIME_PLACEHOLDER);
		},
	);

	it.each([undefined, null, "garbage"] satisfies TimestampInput[])(
		"absoluteDateTime(%j) → TIME_PLACEHOLDER",
		(input) => {
			expect(absoluteDateTime(input)).toBe(TIME_PLACEHOLDER);
		},
	);

	it.each([null, undefined, "not-a-date", Number.NaN] satisfies TimestampInput[])(
		"clockTime(%j) → TIME_PLACEHOLDER",
		(input) => {
			expect(clockTime(input)).toBe(TIME_PLACEHOLDER);
		},
	);

	it("no relativeShort result ever contains 'NaN'", () => {
		for (const input of BAD_INPUTS) {
			expect(relativeShort(input, NOW)).not.toContain("NaN");
		}
	});

	it("a future timestamp clamps to 'just now', never a negative or '-Nh ago'", () => {
		expect(relativeShort(new Date(NOW + 1 * DAY).toISOString(), NOW)).toBe("just now");
		expect(relativeShort(new Date(NOW + 5 * HOUR).toISOString(), NOW)).not.toMatch(/^-/);
		expect(relativeLong(new Date(NOW + 2 * HOUR).toISOString(), NOW)).toBe("just now");
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// clockTime — precision + 24h parameterization
// ═══════════════════════════════════════════════════════════════════════════

describe("clockTime", () => {
	const TS = "2026-06-12T14:32:07.000Z";

	it("seconds:true renders 24h HH:mm:ss with no am/pm", () => {
		const result = clockTime(TS, { seconds: true });
		expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
		expect(result).not.toMatch(/AM|PM/i);
	});

	it("default (no seconds) renders a non-empty string without a seconds component", () => {
		const result = clockTime(TS);
		expect(result.length).toBeGreaterThan(0);
		expect(result).not.toBe(TIME_PLACEHOLDER);
		expect(result).not.toMatch(/^\d{2}:\d{2}:\d{2}$/);
	});

	it.each<[string, string | number | Date]>([
		["a numeric epoch ms", NOW],
		["a Date object", new Date(TS)],
	])("accepts %s", (_label, value) => {
		expect(clockTime(value, { seconds: true })).toMatch(/^\d{2}:\d{2}:\d{2}$/);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// absoluteDate / absoluteDateTime — one format app-wide
// ═══════════════════════════════════════════════════════════════════════════

describe("absoluteDate", () => {
	const TS = "2026-06-12T14:32:07.000Z";

	it("formats as MMM D, YYYY", () => {
		expect(absoluteDate(TS)).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
	});

	it.each<[string, string | number | Date]>([
		["a Date object", new Date(TS)],
		["a numeric epoch ms", NOW],
	])("accepts %s", (_label, value) => {
		expect(absoluteDate(value)).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
	});

	it("renders a future date as-is — absolute dates are never clamped", () => {
		expect(absoluteDate("2030-01-15T00:00:00.000Z")).toMatch(/2030/);
	});
});

describe("absoluteDateTime", () => {
	const TS = "2026-06-12T14:32:07.000Z";

	it("is a MMM D, YYYY date portion, a comma, then a clock portion", () => {
		const result = absoluteDateTime(TS);
		expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}/);
		const parts = result.split(", ");
		expect(parts.length).toBeGreaterThanOrEqual(2);
	});

	it("renders a future date as-is — absolute dates are never clamped", () => {
		expect(absoluteDateTime("2030-03-20T10:00:00.000Z")).toMatch(/2030/);
	});
});

describe("TIME_PLACEHOLDER", () => {
	it("is the single-character em-dash U+2014", () => {
		expect(TIME_PLACEHOLDER).toBe("—");
		expect(TIME_PLACEHOLDER).toHaveLength(1);
	});
});
