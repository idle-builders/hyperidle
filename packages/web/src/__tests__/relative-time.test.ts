/**
 * L22 red phase — unit tests for the relative time formatter.
 *
 * These tests fail until packages/web/src/utils/relative-time.ts is created.
 */
import { describe, expect, it } from "vitest";
import { relativeTime } from "../utils/relative-time.js";

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Build an ISO string from now - offsetMs. */
function iso(offsetMs: number, now?: number): string {
	return new Date((now ?? Date.now()) - offsetMs).toISOString();
}

describe("relativeTime (L22)", () => {
	const NOW = new Date("2026-05-06T12:00:00.000Z").getTime();

	// Hours
	it("returns '1h' for 1 hour ago", () => {
		expect(relativeTime(iso(1 * HOUR, NOW), NOW)).toBe("1h");
	});

	it("returns '3h' for 3 hours ago", () => {
		expect(relativeTime(iso(3 * HOUR, NOW), NOW)).toBe("3h");
	});

	it("returns '23h' for 23 hours ago", () => {
		expect(relativeTime(iso(23 * HOUR, NOW), NOW)).toBe("23h");
	});

	// Days
	it("returns '1d' for 1 day ago", () => {
		expect(relativeTime(iso(1 * DAY, NOW), NOW)).toBe("1d");
	});

	it("returns '2d' for 2 days ago", () => {
		expect(relativeTime(iso(2 * DAY, NOW), NOW)).toBe("2d");
	});

	it("returns '6d' for 6 days ago", () => {
		expect(relativeTime(iso(6 * DAY, NOW), NOW)).toBe("6d");
	});

	// Weeks
	it("returns '1w' for 1 week ago", () => {
		expect(relativeTime(iso(1 * WEEK, NOW), NOW)).toBe("1w");
	});

	it("returns '2w' for 2 weeks ago", () => {
		expect(relativeTime(iso(2 * WEEK, NOW), NOW)).toBe("2w");
	});

	it("returns '3w' for 21 days ago", () => {
		expect(relativeTime(iso(21 * DAY, NOW), NOW)).toBe("3w");
	});

	// Months
	it("returns '1mo' for 30 days ago", () => {
		expect(relativeTime(iso(30 * DAY, NOW), NOW)).toBe("1mo");
	});

	it("returns '2mo' for 60 days ago", () => {
		expect(relativeTime(iso(60 * DAY, NOW), NOW)).toBe("2mo");
	});

	it("returns '11mo' for 330 days ago", () => {
		expect(relativeTime(iso(330 * DAY, NOW), NOW)).toBe("11mo");
	});

	// Years
	it("returns '1y' for 365 days ago", () => {
		expect(relativeTime(iso(365 * DAY, NOW), NOW)).toBe("1y");
	});

	it("returns '2y' for 730 days ago", () => {
		expect(relativeTime(iso(730 * DAY, NOW), NOW)).toBe("2y");
	});

	// Very recent — less than 1 hour
	it("returns '<1h' or similar for recent items under 1 hour", () => {
		const result = relativeTime(iso(30 * MIN, NOW), NOW);
		// Accept any non-empty string — implementation decides the format for < 1h
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	// Just now (0ms ago)
	it("does not crash for a timestamp equal to now", () => {
		const result = relativeTime(iso(0, NOW), NOW);
		expect(typeof result).toBe("string");
	});

	// Future timestamp — must not crash
	it("does not crash for a future timestamp", () => {
		const future = new Date(NOW + 1 * DAY).toISOString();
		const result = relativeTime(future, NOW);
		expect(typeof result).toBe("string");
	});

	// Uses current time when second argument is omitted
	it("uses Date.now() when now parameter is omitted", () => {
		const isoNow = new Date(Date.now() - 2 * DAY).toISOString();
		const result = relativeTime(isoNow);
		expect(result).toBe("2d");
	});

	// Invalid ISO string must not crash
	it("handles invalid ISO string gracefully — does not throw", () => {
		expect(() => relativeTime("not-a-date", NOW)).not.toThrow();
	});
});
