/**
 * The demo world's clock. Every timestamp is anchored to the moment of seeding,
 * so the world always reads as "used for a while" whenever the database was
 * created. Never a hardcoded date.
 */

/** The design's story reads 16:17 on its clock; times of day are placed relative to that. */
const STORY_NOW_MINUTES = 16 * 60 + 17;

export interface DemoClock {
	/** ISO timestamp of the seeding moment. */
	readonly now: string;
	/** Days from the most recent Monday to the seeding day (0 on a Monday). */
	readonly daysSinceMonday: number;
	/** `days` before the anchor, at the anchor's time of day. */
	daysAgo(days: number): string;
	/** `hours` before the anchor. */
	hoursAgo(hours: number): string;
	/**
	 * A story time of day, `daysBack` days before seeding: `at(0, "09:40")` is
	 * 6h37m before seeding, because the story's "now" is 16:17. A negative
	 * `daysBack` is in the future.
	 */
	at(daysBack: number, hhmm: string): string;
}

export function createDemoClock(anchor: Date = new Date()): DemoClock {
	const ms = anchor.getTime();
	const hoursAgo = (hours: number): string => new Date(ms - hours * 3_600_000).toISOString();
	return {
		now: anchor.toISOString(),
		daysSinceMonday: (anchor.getDay() + 6) % 7,
		daysAgo: (days) => new Date(ms - days * 86_400_000).toISOString(),
		hoursAgo,
		at(daysBack, hhmm) {
			const [h = 0, m = 0] = hhmm.split(":").map(Number);
			return hoursAgo(daysBack * 24 + (STORY_NOW_MINUTES - (h * 60 + m)) / 60);
		},
	};
}
