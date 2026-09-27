/**
 * AB1 — Health signal computation: unit tests.
 *
 * Per reviewer finding A5: health signal computation needs dedicated unit tests.
 *
 * @lore computeHealthSignals lives in core-ui — the browser fetches runs from agent-orchestration and computes signals itself.
 */

import { describe, expect, it } from "vitest";
import { computeHealthSignals, deriveHealthDetail, deriveHealthLevel } from "../agent-health.js";

// ---------------------------------------------------------------------------
// computeHealthSignals unit tests
// ---------------------------------------------------------------------------

const NOW_MS = Date.now();
const NOW = new Date(NOW_MS).toISOString();
const THREE_DAYS_AGO = new Date(NOW_MS - 3 * 24 * 60 * 60 * 1000).toISOString();
const TEN_DAYS_AGO = new Date(NOW_MS - 10 * 24 * 60 * 60 * 1000).toISOString();

interface TestSessionRow {
	startedAt: string;
	endedAt: string | null;
	outcome: string | null;
}

describe("computeHealthSignals", () => {
	it("returns healthy defaults when no sessions", () => {
		const signals = computeHealthSignals({
			sessions: [],
			harnessAvailable: true,
		});

		expect(signals.failureRate7d).toBe(0);
		expect(signals.lastSessionCrashed).toBe(false);
		expect(signals.harnessAvailable).toBe(true);
		expect(signals.degraded).toBe(false);
	});

	it("computes failure rate correctly for sessions in last 7 days", () => {
		const sessions: TestSessionRow[] = [
			{ startedAt: THREE_DAYS_AGO, endedAt: THREE_DAYS_AGO, outcome: "crashed" },
			{ startedAt: THREE_DAYS_AGO, endedAt: THREE_DAYS_AGO, outcome: "crashed" },
			{ startedAt: THREE_DAYS_AGO, endedAt: THREE_DAYS_AGO, outcome: "completed" },
		];

		const signals = computeHealthSignals({
			sessions,
			harnessAvailable: true,
		});

		// 2 out of 3 failed = ~0.667
		expect(signals.failureRate7d).toBeCloseTo(2 / 3);
		expect(signals.degraded).toBe(true);
	});

	it("excludes sessions older than 7 days from failure rate", () => {
		const sessions: TestSessionRow[] = [
			{ startedAt: TEN_DAYS_AGO, endedAt: TEN_DAYS_AGO, outcome: "crashed" },
			{ startedAt: TEN_DAYS_AGO, endedAt: TEN_DAYS_AGO, outcome: "crashed" },
		];

		const signals = computeHealthSignals({
			sessions,
			harnessAvailable: true,
		});

		expect(signals.failureRate7d).toBe(0);
		expect(signals.degraded).toBe(false);
	});

	it("sets lastSessionCrashed=true when most recent session crashed", () => {
		const sessions: TestSessionRow[] = [
			{ startedAt: THREE_DAYS_AGO, endedAt: THREE_DAYS_AGO, outcome: "completed" },
			{ startedAt: NOW, endedAt: NOW, outcome: "crashed" },
		];

		const signals = computeHealthSignals({
			sessions,
			harnessAvailable: true,
		});

		expect(signals.lastSessionCrashed).toBe(true);
		expect(signals.degraded).toBe(true);
	});

	it("sets lastSessionCrashed=false when most recent session succeeded", () => {
		const sessions: TestSessionRow[] = [
			{ startedAt: THREE_DAYS_AGO, endedAt: THREE_DAYS_AGO, outcome: "crashed" },
			{ startedAt: NOW, endedAt: NOW, outcome: "completed" },
		];

		const signals = computeHealthSignals({
			sessions,
			harnessAvailable: true,
		});

		expect(signals.lastSessionCrashed).toBe(false);
	});

	it("sets degraded=true when harnessAvailable=false", () => {
		const signals = computeHealthSignals({
			sessions: [],
			harnessAvailable: false,
		});

		expect(signals.harnessAvailable).toBe(false);
		expect(signals.degraded).toBe(true);
	});

	it("failure rate is exactly 0.5 — NOT degraded (threshold is >0.5)", () => {
		const sessions: TestSessionRow[] = [
			{ startedAt: THREE_DAYS_AGO, endedAt: THREE_DAYS_AGO, outcome: "crashed" },
			{ startedAt: THREE_DAYS_AGO, endedAt: THREE_DAYS_AGO, outcome: "completed" },
		];

		const signals = computeHealthSignals({
			sessions,
			harnessAvailable: true,
		});

		expect(signals.failureRate7d).toBeCloseTo(0.5);
		expect(signals.degraded).toBe(false);
	});

	it("failure rate >0.5 — IS degraded", () => {
		const sessions: TestSessionRow[] = [
			{ startedAt: THREE_DAYS_AGO, endedAt: THREE_DAYS_AGO, outcome: "crashed" },
			{ startedAt: THREE_DAYS_AGO, endedAt: THREE_DAYS_AGO, outcome: "crashed" },
			{ startedAt: THREE_DAYS_AGO, endedAt: THREE_DAYS_AGO, outcome: "completed" },
		];

		const signals = computeHealthSignals({
			sessions,
			harnessAvailable: true,
		});

		expect(signals.failureRate7d).toBeGreaterThan(0.5);
		expect(signals.degraded).toBe(true);
	});

	it("returns idleDurationMs as null when no sessions", () => {
		const signals = computeHealthSignals({
			sessions: [],
			harnessAvailable: true,
		});

		expect(signals.idleDurationMs).toBeNull();
	});

	it("returns idleDurationMs as a positive number when sessions have endedAt", () => {
		const sessions: TestSessionRow[] = [
			{ startedAt: THREE_DAYS_AGO, endedAt: THREE_DAYS_AGO, outcome: "completed" },
		];

		const signals = computeHealthSignals({
			sessions,
			harnessAvailable: true,
		});

		expect(typeof signals.idleDurationMs).toBe("number");
		expect(signals.idleDurationMs as number).toBeGreaterThan(0);
	});

	it("idleDurationMs is null when most recent session is still active (no endedAt)", () => {
		const sessions: TestSessionRow[] = [{ startedAt: NOW, endedAt: null, outcome: null }];

		const signals = computeHealthSignals({
			sessions,
			harnessAvailable: true,
		});

		// Active session — not idle
		expect(signals.idleDurationMs).toBeNull();
	});

	it("computes idleDurationMs from most recent endedAt", () => {
		// Older ended session
		const olderEnded = THREE_DAYS_AGO;
		// More recent ended session (1 hour ago)
		const recentEnded = new Date(NOW_MS - 60 * 60 * 1000).toISOString();

		const sessions: TestSessionRow[] = [
			{ startedAt: THREE_DAYS_AGO, endedAt: olderEnded, outcome: "completed" },
			{ startedAt: recentEnded, endedAt: recentEnded, outcome: "completed" },
		];

		const signals = computeHealthSignals({
			sessions,
			harnessAvailable: true,
		});

		// Should be approximately 1 hour (with some small time delta)
		const expectedMs = Date.now() - new Date(recentEnded).getTime();
		expect(signals.idleDurationMs).toBeGreaterThan(0);
		// Allow 10 seconds tolerance
		expect(Math.abs((signals.idleDurationMs as number) - expectedMs)).toBeLessThan(10_000);
	});
});

// ---------------------------------------------------------------------------
// AB2 — the two display derivations over the same signals.
//
// ---------------------------------------------------------------------------
// @lore computeHealthSignals' callers are the team page's roster health dot and the notification body.

describe("deriveHealthLevel", () => {
	it("returns 'critical' when failureRate7d > 0.5", () => {
		expect(deriveHealthLevel({ failureRate7d: 0.75, lastSessionCrashed: false })).toBe("critical");
	});

	it("returns 'warning' when the last run crashed", () => {
		expect(deriveHealthLevel({ failureRate7d: 0, lastSessionCrashed: true })).toBe("warning");
	});

	it("returns 'warning' when the harness is unavailable", () => {
		expect(
			deriveHealthLevel({
				failureRate7d: 0,
				lastSessionCrashed: false,
				harnessAvailable: false,
			}),
		).toBe("warning");
	});

	it("returns 'healthy' when nothing is wrong", () => {
		expect(deriveHealthLevel({ failureRate7d: 0, lastSessionCrashed: false })).toBe("healthy");
	});
});

describe("deriveHealthDetail", () => {
	it("names a high failure rate with its percentage", () => {
		expect(deriveHealthDetail({ failureRate7d: 0.75, lastSessionCrashed: false })).toBe(
			"High failure rate (75%)",
		);
	});

	it("names a crashed last run", () => {
		expect(deriveHealthDetail({ failureRate7d: 0, lastSessionCrashed: true })).toBe(
			"Last session crashed",
		);
	});

	it("names an unavailable harness", () => {
		expect(
			deriveHealthDetail({
				failureRate7d: 0,
				lastSessionCrashed: false,
				harnessAvailable: false,
			}),
		).toBe("Harness unavailable");
	});

	it("joins multiple problems", () => {
		expect(deriveHealthDetail({ failureRate7d: 0.75, lastSessionCrashed: true })).toBe(
			"High failure rate (75%). Last session crashed",
		);
	});

	it("returns 'Healthy' when nothing is wrong", () => {
		expect(deriveHealthDetail({ failureRate7d: 0, lastSessionCrashed: false })).toBe("Healthy");
	});
});
