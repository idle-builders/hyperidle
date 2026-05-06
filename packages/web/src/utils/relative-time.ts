/**
 * L22 — relative time formatter for knowledge item signals.
 *
 * Converts an ISO 8601 timestamp to a compact relative string:
 *   <1h → "<1h"
 *   1–23h → "Nh"
 *   1–6d → "Nd"
 *   1–3w (7–27d) → "Nw"
 *   1–11mo (28–364d) → "Nmo"
 *   1+y (365+d) → "Ny"
 *
 * Future timestamps and invalid inputs return a safe fallback rather than
 * crashing. The `now` parameter is injectable for deterministic tests.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/**
 * Return a compact relative-time string for an ISO timestamp.
 *
 * @param isoString - ISO 8601 timestamp string
 * @param now - Current time in ms epoch (defaults to Date.now())
 */
export function relativeTime(isoString: string, now?: number): string {
	const nowMs = now ?? Date.now();

	let ts: number;
	try {
		ts = new Date(isoString).getTime();
		if (!Number.isFinite(ts)) {
			return "—";
		}
	} catch {
		return "—";
	}

	const diffMs = Math.max(0, nowMs - ts);

	if (diffMs >= YEAR_MS) {
		return `${Math.floor(diffMs / YEAR_MS)}y`;
	}
	if (diffMs >= MONTH_MS) {
		return `${Math.floor(diffMs / MONTH_MS)}mo`;
	}
	if (diffMs >= WEEK_MS) {
		return `${Math.floor(diffMs / WEEK_MS)}w`;
	}
	if (diffMs >= DAY_MS) {
		return `${Math.floor(diffMs / DAY_MS)}d`;
	}
	if (diffMs >= HOUR_MS) {
		return `${Math.floor(diffMs / HOUR_MS)}h`;
	}
	return "<1h";
}
