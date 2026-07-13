/**
 * AA1 — humanizeSchedule unit tests (Task 4).
 *
 * Tests the pure schedule-label utility that converts triggerType + triggerConfig
 * into human-readable schedule strings.
 */

import { humanizeSchedule } from "@hyperidle/core-app";
import { describe, expect, it } from "vitest";

describe("humanizeSchedule (AA1)", () => {
	// calendar + cron expression — weekday
	it('maps calendar + Monday cron to "Every Monday at 10:00 AM"', () => {
		const result = humanizeSchedule("calendar", JSON.stringify({ cron: "0 10 * * MON" }));
		expect(result).toBe("Every Monday at 10:00 AM");
	});

	// heartbeat + intervalSeconds
	it('maps heartbeat + 900s to "Every 15 minutes"', () => {
		const result = humanizeSchedule("heartbeat", JSON.stringify({ intervalSeconds: 900 }));
		expect(result).toBe("Every 15 minutes");
	});

	// event trigger
	it('maps event + bet_state_changed to "On bet completion"', () => {
		const result = humanizeSchedule("event", JSON.stringify({ eventType: "bet_state_changed" }));
		expect(result).toBe("On bet completion");
	});

	// calendar with null config — graceful fallback
	it("returns capitalised trigger type for calendar with null config", () => {
		const result = humanizeSchedule("calendar", null);
		expect(result).toBe("Calendar");
	});

	// unknown trigger type — graceful fallback
	it("returns capitalised trigger type for unknown type with null config", () => {
		const result = humanizeSchedule("unknown", null);
		expect(result).toBe("Unknown");
	});

	// daily cron
	it('maps daily cron to "Every day at 2:00 AM"', () => {
		const result = humanizeSchedule("calendar", JSON.stringify({ cron: "0 2 * * *" }));
		expect(result).toBe("Every day at 2:00 AM");
	});

	// heartbeat — 60 seconds
	it('maps heartbeat + 60s to "Every 1 minute"', () => {
		const result = humanizeSchedule("heartbeat", JSON.stringify({ intervalSeconds: 60 }));
		expect(result).toBe("Every 1 minute");
	});

	// heartbeat — 3600 seconds (1 hour)
	it('maps heartbeat + 3600s to "Every 60 minutes"', () => {
		const result = humanizeSchedule("heartbeat", JSON.stringify({ intervalSeconds: 3600 }));
		expect(result).toBe("Every 60 minutes");
	});

	// unparseable JSON config — fallback
	it("returns capitalised trigger type for unparseable config", () => {
		const result = humanizeSchedule("calendar", "not-valid-json");
		expect(result).toBe("Calendar");
	});

	// event + unknown eventType — generic fallback
	it("returns 'On event' for unknown eventType", () => {
		const result = humanizeSchedule("event", JSON.stringify({ eventType: "unknown_type" }));
		expect(result).toBe("On event");
	});
});
