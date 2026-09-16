/**
 * AA1 — humanizeSchedule unit tests (Task 4).
 *
 * Tests the pure schedule-label utility that converts triggerType + triggerConfig
 * into human-readable schedule strings.
 */

import { describe, expect, it } from "vitest";
import { humanizeSchedule } from "../schedule-label.js";

describe("humanizeSchedule (AA1)", () => {
	// calendar + cron expression — weekday
	it('maps calendar + Monday cron to "Every Monday at 10:00 AM"', () => {
		const result = humanizeSchedule("calendar", JSON.stringify({ cron: "0 10 * * MON" }), null);
		expect(result).toBe("Every Monday at 10:00 AM");
	});

	// heartbeat + intervalSeconds
	it('maps heartbeat + 900s to "Every 15 minutes"', () => {
		const result = humanizeSchedule("heartbeat", JSON.stringify({ intervalSeconds: 900 }), null);
		expect(result).toBe("Every 15 minutes");
	});

	// BA1 D2/D8: the event name lives in its own `eventType` column/param now
	// — not `triggerConfig` — and the label is DERIVED from the name, not
	// mapped through a closed four-name table (§2.6: the old table would
	// have rendered "On event" for 30 of the 34 authorable events).
	it('maps event + task_state_changed to "On task state changed"', () => {
		const result = humanizeSchedule("event", null, "task_state_changed");
		expect(result).toBe("On task state changed");
	});

	// calendar with null config — graceful fallback
	it("returns capitalised trigger type for calendar with null config", () => {
		const result = humanizeSchedule("calendar", null, null);
		expect(result).toBe("Calendar");
	});

	// unknown trigger type — graceful fallback
	it("returns capitalised trigger type for unknown type with null config", () => {
		const result = humanizeSchedule("unknown", null, null);
		expect(result).toBe("Unknown");
	});

	// daily cron
	it('maps daily cron to "Every day at 2:00 AM"', () => {
		const result = humanizeSchedule("calendar", JSON.stringify({ cron: "0 2 * * *" }), null);
		expect(result).toBe("Every day at 2:00 AM");
	});

	// heartbeat — 60 seconds
	it('maps heartbeat + 60s to "Every 1 minute"', () => {
		const result = humanizeSchedule("heartbeat", JSON.stringify({ intervalSeconds: 60 }), null);
		expect(result).toBe("Every 1 minute");
	});

	// heartbeat — 3600 seconds (1 hour)
	it('maps heartbeat + 3600s to "Every 60 minutes"', () => {
		const result = humanizeSchedule("heartbeat", JSON.stringify({ intervalSeconds: 3600 }), null);
		expect(result).toBe("Every 60 minutes");
	});

	// unparseable JSON config — fallback
	it("returns capitalised trigger type for unparseable config", () => {
		const result = humanizeSchedule("calendar", "not-valid-json", null);
		expect(result).toBe("Calendar");
	});

	// event + no eventType — generic fallback (a real event routine always has one; this is defensive)
	it("returns 'On event' when no eventType is given", () => {
		const result = humanizeSchedule("event", null, null);
		expect(result).toBe("On event");
	});

	// BA1 D8: every one of the 34 authorable events derives a label — no
	// closed four-name table left to fall through.
	it('derives a label for an event outside the old four-name table, e.g. "On item created"', () => {
		const result = humanizeSchedule("event", null, "item_created");
		expect(result).toBe("On item created");
	});
});
