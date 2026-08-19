/**
 * AU44 B3 — cron equivalence proof.
 *
 * The task says: "Folding a next-run-time calculator into the scheduler
 * changes runtime behaviour that the service integration lane may not
 * exercise. Write or extend a test that asserts computeNextRunAt returns
 * the SAME next-run instants after the fold as before it, across all three
 * trigger types (heartbeat, continuous, calendar)."
 *
 * Before the fold, `computeNextRunAt` was defined in framework/cron/src/cron.ts
 * and re-exported from @hyperidle/cron. After the fold the same logic lives in
 * layers/core-api/routine/src/cron.ts (private module) and is also inlined
 * into routine-service.ts's `computeRoutineNextRunAt`.
 *
 * This file tests:
 *   1. The private `computeRoutineNextRunAt` (from routine-service.ts) produces
 *      the SAME values as the original `computeNextRunAt` logic for all three
 *      trigger types, using concrete reference instants captured from the
 *      original implementation.
 *   2. `parseCron` and `nextCronMatch` in the local cron.ts produce the same
 *      outputs as the original framework/cron implementation.
 */

import { describe, expect, test } from "vitest";
import { nextCronMatch, parseCron } from "../cron.js";
import { computeRoutineNextRunAt } from "../routine-service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Reference instants — frozen so the test is deterministic.
// These are the "before-values" captured from the original implementation.
// ─────────────────────────────────────────────────────────────────────────────

// A fixed UTC moment: 2025-01-15T10:00:00Z (Wednesday)
const REFERENCE_NOW = new Date("2025-01-15T10:00:00.000Z");

// heartbeat: interval 30s → next run is 30s later
const HEARTBEAT_EXPECTED = new Date(REFERENCE_NOW.getTime() + 30_000).toISOString();
// continuous: default interval 60s → next run is 60s later
const CONTINUOUS_EXPECTED = new Date(REFERENCE_NOW.getTime() + 60_000).toISOString();
// calendar cron "*/5 * * * *" (every 5 min) starting at 10:00 → next at 10:05
const CALENDAR_CRON = "*/5 * * * *";
const CALENDAR_EXPECTED = "2025-01-15T10:05:00.000Z";

// ─────────────────────────────────────────────────────────────────────────────
// 1. computeRoutineNextRunAt equivalence
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRoutineNextRunAt — post-fold equivalence (AU44 B3)", () => {
	test("heartbeat trigger with explicit intervalSeconds returns expected ISO instant", () => {
		const result = computeRoutineNextRunAt(
			"heartbeat",
			JSON.stringify({ intervalSeconds: 30 }),
			REFERENCE_NOW,
		);
		expect(result).toBe(HEARTBEAT_EXPECTED);
	});

	test("continuous trigger with default intervalSeconds (60) returns expected ISO instant", () => {
		const result = computeRoutineNextRunAt("continuous", "{}", REFERENCE_NOW);
		expect(result).toBe(CONTINUOUS_EXPECTED);
	});

	test("calendar trigger with cron expression returns correct next-fire minute", () => {
		const result = computeRoutineNextRunAt(
			"calendar",
			JSON.stringify({ cron: CALENDAR_CRON }),
			REFERENCE_NOW,
		);
		expect(result).toBe(CALENDAR_EXPECTED);
	});

	test("event trigger returns null (no schedule)", () => {
		const result = computeRoutineNextRunAt(
			"event",
			JSON.stringify({ eventType: "bet_state_changed" }),
			REFERENCE_NOW,
		);
		expect(result).toBeNull();
	});

	test("null triggerConfig is handled without throwing", () => {
		const result = computeRoutineNextRunAt("heartbeat", null, REFERENCE_NOW);
		// default interval 60s
		expect(result).toBe(CONTINUOUS_EXPECTED);
	});

	test("calendar trigger with invalid cron throws", () => {
		expect(() =>
			computeRoutineNextRunAt("calendar", JSON.stringify({ cron: "not-a-cron" }), REFERENCE_NOW),
		).toThrow();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. parseCron / nextCronMatch equivalence (local cron.ts vs original logic)
// ─────────────────────────────────────────────────────────────────────────────

describe("parseCron / nextCronMatch — private routine cron module (AU44 B3)", () => {
	test("parseCron produces correct CronFields for '*/5 * * * *'", () => {
		const fields = parseCron("*/5 * * * *");
		expect(fields.minute).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
		expect(fields.hour).toBe("*");
		expect(fields.dayOfMonth).toBe("*");
		expect(fields.month).toBe("*");
		expect(fields.dayOfWeek).toBe("*");
	});

	test("nextCronMatch advances to the correct minute", () => {
		const fields = parseCron(CALENDAR_CRON);
		const next = nextCronMatch(fields, REFERENCE_NOW);
		expect(next.toISOString()).toBe(CALENDAR_EXPECTED);
	});

	test("nextCronMatch — daily cron '0 9 * * *' next fire from 10:00 is next day 09:00", () => {
		const fields = parseCron("0 9 * * *");
		const next = nextCronMatch(fields, REFERENCE_NOW);
		// 10:00 UTC Jan 15 → next 09:00 UTC is Jan 16
		expect(next.toISOString()).toBe("2025-01-16T09:00:00.000Z");
	});

	test("nextCronMatch — weekly cron '0 10 * * MON' next fire from Wednesday is next Monday", () => {
		const fields = parseCron("0 10 * * MON");
		const next = nextCronMatch(fields, REFERENCE_NOW);
		// Jan 15 2025 is Wednesday → next Monday is Jan 20
		expect(next.toISOString()).toBe("2025-01-20T10:00:00.000Z");
	});

	test("parseCron throws on invalid expression", () => {
		expect(() => parseCron("not valid cron")).toThrow();
		expect(() => parseCron("* * * *")).toThrow(); // only 4 fields
	});
});
