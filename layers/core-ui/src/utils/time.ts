// @lore: all registers accept string|number|Date|null|undefined; toEpoch → TIME_PLACEHOLDER on non-finite parse; Date.parse won't echo adversarial strings

/** Shared placeholder for invalid / missing timestamps (em-dash U+2014). */
export const TIME_PLACEHOLDER = "—";

type TimestampInput = string | number | Date | null | undefined;

const SEC_MS = 1_000;
const MIN_MS = 60 * SEC_MS;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS; // 30d month (floor everywhere)
const YEAR_MS = 365 * DAY_MS;

/** Internal: parse any accepted input to finite epoch ms, or null. */
function toEpoch(input: TimestampInput): number | null {
	if (input === null || input === undefined) return null;
	let epoch: number;
	if (input instanceof Date) {
		epoch = input.getTime();
	} else if (typeof input === "number") {
		epoch = input;
	} else {
		epoch = Date.parse(input);
	}
	return Number.isFinite(epoch) ? epoch : null;
}

const fmtDate = new Intl.DateTimeFormat(undefined, {
	year: "numeric",
	month: "short",
	day: "numeric",
});

const fmtDateTime = new Intl.DateTimeFormat(undefined, {
	year: "numeric",
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
});

const fmtClockMinute = new Intl.DateTimeFormat(undefined, {
	hour: "numeric",
	minute: "2-digit",
});

const fmtClockSeconds = new Intl.DateTimeFormat(undefined, {
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hour12: false,
});

function relativeLabel(diff: number): string {
	// @lore: weeks branch runs to MONTH_MS (30d) not FOUR_WEEKS_MS (28d) — 28d÷30d=0 produced "0mo" for 28-29 day items
	if (diff < MIN_MS) return "just now";
	if (diff < HOUR_MS) return `${Math.floor(diff / MIN_MS)}m`;
	if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h`;
	if (diff < WEEK_MS) return `${Math.floor(diff / DAY_MS)}d`;
	if (diff < MONTH_MS) return `${Math.floor(diff / WEEK_MS)}w`;
	if (diff < YEAR_MS) return `${Math.floor(diff / MONTH_MS)}mo`;
	return `${Math.floor(diff / YEAR_MS)}y`;
}

// ── Exported registers ────────────────────────────────────────────────────────

export function relativeShort(input: TimestampInput, now?: number): string {
	const epoch = toEpoch(input);
	if (epoch === null) return TIME_PLACEHOLDER;
	const diff = Math.max(0, (now ?? Date.now()) - epoch);
	return relativeLabel(diff);
}

export function relativeLong(input: TimestampInput, now?: number): string {
	const short = relativeShort(input, now);
	if (short === TIME_PLACEHOLDER || short === "just now") return short;
	return `${short} ago`;
}

// @lore: clockTime seconds:true — hour12:false fixed; 24h reads cleaner in dense logs; locale hour-cycle for minute variant only
export function clockTime(input: TimestampInput, opts?: { seconds?: boolean }): string {
	const epoch = toEpoch(input);
	if (epoch === null) return TIME_PLACEHOLDER;
	const fmt = opts?.seconds ? fmtClockSeconds : fmtClockMinute;
	return fmt.format(new Date(epoch));
}

export function absoluteDate(input: TimestampInput): string {
	const epoch = toEpoch(input);
	if (epoch === null) return TIME_PLACEHOLDER;
	return fmtDate.format(new Date(epoch));
}

export function absoluteDateTime(input: TimestampInput): string {
	const epoch = toEpoch(input);
	if (epoch === null) return TIME_PLACEHOLDER;
	return fmtDateTime.format(new Date(epoch));
}
