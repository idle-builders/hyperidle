/**
 * AX1 — demo world clock.
 *
 * All demo timestamps are anchored to the moment of seeding and spread over
 * ~six weeks of history, so the world always reads as "used for a while"
 * regardless of when the database was created. Never a hardcoded date.
 */

export interface DemoClock {
	/** ISO timestamp of the seeding moment. */
	readonly now: string;
	/** `days` before the anchor, at the anchor's time of day. Always ≤ now. */
	daysAgo(days: number): string;
	/** `days` before the anchor, at a fixed local hour (use for days ≥ 1). */
	daysAgoAt(days: number, hour: number): string;
	/** `hours` before the anchor. Always ≤ now. */
	hoursAgo(hours: number): string;
}

export function createDemoClock(anchor: Date = new Date()): DemoClock {
	const ms = anchor.getTime();
	return {
		now: anchor.toISOString(),
		daysAgo(days: number): string {
			return new Date(ms - days * 86_400_000).toISOString();
		},
		daysAgoAt(days: number, hour: number): string {
			const d = new Date(ms - days * 86_400_000);
			d.setHours(hour, 15, 0, 0);
			// Keep the timestamp at or before the anchor even for day 0.
			const clamped = Math.min(d.getTime(), ms);
			return new Date(clamped).toISOString();
		},
		hoursAgo(hours: number): string {
			return new Date(ms - hours * 3_600_000).toISOString();
		},
	};
}
