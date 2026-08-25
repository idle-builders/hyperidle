/**
 * AA1 — humanizeSchedule: converts triggerType + triggerConfig JSON into a
 * human-readable schedule description for display in routine cards.
 *
 * Pure utility — no DB or IO dependencies.
 */

/** Day-of-week abbreviation to full day name (cron uses 0=Sunday, MON=Monday, etc). */
const DOW_NAMES: Record<string, string> = {
	"0": "Sunday",
	"1": "Monday",
	"2": "Tuesday",
	"3": "Wednesday",
	"4": "Thursday",
	"5": "Friday",
	"6": "Saturday",
	SUN: "Sunday",
	MON: "Monday",
	TUE: "Tuesday",
	WED: "Wednesday",
	THU: "Thursday",
	FRI: "Friday",
	SAT: "Saturday",
};

/**
 * BA1 D8/§2.6: the label is DERIVED from the event name, not mapped — the
 * four-name `EVENT_LABELS` table this replaced would have rendered the bare
 * string "On event" for the other 30 of the 34 events D2 makes authorable.
 * `bet_state_changed` → "On bet state changed". One line, correct for every
 * event, and no label map left to drift.
 */
function humanizeEventType(eventType: string): string {
	return `On ${eventType.replace(/_/g, " ")}`;
}

/**
 * Formats a UTC hour (0-23) into a 12-hour clock label, e.g. 14 → "2:00 PM".
 */
function formatHour(hour: number): string {
	const period = hour < 12 ? "AM" : "PM";
	const h = hour % 12 === 0 ? 12 : hour % 12;
	return `${h}:00 ${period}`;
}

/**
 * Capitalises the first letter of a string. Used for fallback labels.
 */
function capitalise(s: string): string {
	if (!s) return s;
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Parse a cron string of the form "MINUTE HOUR DOM MONTH DOW" and produce
 * a human-readable schedule label. Returns null when cron cannot be parsed
 * into a simple pattern.
 *
 * Handles:
 * - Daily: "0 H * * *" → "Every day at H:00 AM/PM"
 * - Weekly: "0 H * * DOW" → "Every DOW at H:00 AM/PM"
 * - Other: null (fallback to trigger type)
 */
function humanizeCron(cron: string): string | null {
	const parts = cron.trim().split(/\s+/);
	if (parts.length !== 5) return null;

	const [minute, hour, dom, , dow] = parts;
	// The length===5 check above guarantees all five fields are present; the
	// guard re-narrows them from `string | undefined` for noUncheckedIndexedAccess.
	if (minute === undefined || hour === undefined || dom === undefined || dow === undefined) {
		return null;
	}

	// Only handle simple minute/hour patterns (no ranges/lists in minute/hour)
	const minuteNum = Number.parseInt(minute, 10);
	const hourNum = Number.parseInt(hour, 10);
	if (Number.isNaN(minuteNum) || Number.isNaN(hourNum)) return null;
	if (minute !== String(minuteNum) || hour !== String(hourNum)) return null;

	const timeLabel = formatHour(hourNum);

	// Weekly: dom is wildcard (or range), dow is a specific day
	if (dow !== "*" && dom === "*") {
		const dayName = DOW_NAMES[dow.toUpperCase()] ?? DOW_NAMES[dow];
		if (dayName) {
			return `Every ${dayName} at ${timeLabel}`;
		}
	}

	// First-Monday-of-month style: dom=1-7, dow=MON (or similar)
	if (dow !== "*" && dom !== "*") {
		const dayName = DOW_NAMES[dow.toUpperCase()] ?? DOW_NAMES[dow];
		if (dayName) {
			return `Every first ${dayName} at ${timeLabel}`;
		}
	}

	// Daily: dow is wildcard
	if (dow === "*") {
		return `Every day at ${timeLabel}`;
	}

	return null;
}

/**
 * Converts triggerType + triggerConfig JSON string into a human-readable
 * schedule label for display in routine cards and detail pages.
 *
 * @param triggerType - The routine's trigger type ("heartbeat" | "calendar" | "event").
 * @param triggerConfigJson - The JSON string from routines.trigger_config, or null.
 * @param eventType - BA1 D2/D8: the routine's `event_type` column, for `triggerType:"event"`.
 *   No default (review N9): a `null` default let a future non-event caller
 *   forget the argument and silently render "On event" for everything
 *   instead of failing to compile. Every real caller has an `eventType`
 *   column to read (`null` for non-event routines) — passing `null`
 *   explicitly costs nothing and keeps a forgotten argument a build error.
 * @returns A human-readable label. Falls back to the capitalised trigger type on parse failure.
 */
export function humanizeSchedule(
	triggerType: string,
	triggerConfigJson: string | null,
	eventType: string | null,
): string {
	// BA1 D2: an event routine's name lives in the `event_type` column, not
	// `trigger_config` (which is no longer read for events at all) — checked
	// first, ahead of the `!config` early return, since an event routine
	// carries no `trigger_config`.
	if (triggerType === "event") {
		return eventType ? humanizeEventType(eventType) : "On event";
	}

	let config: Record<string, unknown> | null = null;

	if (triggerConfigJson) {
		try {
			const parsed: unknown = JSON.parse(triggerConfigJson);
			if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
				config = parsed as Record<string, unknown>;
			}
		} catch {
			// Unparseable JSON — fall through to default
		}
	}

	if (!config) {
		return capitalise(triggerType);
	}

	if (triggerType === "heartbeat") {
		const intervalSeconds = config.intervalSeconds;
		if (typeof intervalSeconds === "number" && intervalSeconds > 0) {
			const minutes = Math.round(intervalSeconds / 60);
			if (minutes === 1) return "Every 1 minute";
			return `Every ${minutes} minutes`;
		}
		return capitalise(triggerType);
	}

	if (triggerType === "calendar") {
		const cron = config.cron;
		if (typeof cron === "string") {
			const label = humanizeCron(cron);
			if (label) return label;
		}
		return capitalise(triggerType);
	}

	return capitalise(triggerType);
}
