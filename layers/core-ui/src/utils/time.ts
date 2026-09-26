/**
 * One clock — shared time formatter.
 *
 * Single source for all timestamp display across the app.
 * Collapsed 8 relative-time impls + 4 absolute-date shapes into one module.
 *
 * @lore AI3: format-time.ts and relative-time.ts names were semantically swapped
 * (format-time did compact relative; relative-time did full ladder). Both deleted.
 * Registers named by role, not by file origin. Seconds-granularity register ("12s")
 * intentionally killed — static seconds are stale-on-render; spec bars ticking.
 *
 * @lore AI3: All five registers accept `string | number | Date | null | undefined`.
 * toEpoch() rejects non-finite parse → TIME_PLACEHOLDER. No string echoed as HTML.
 * An adversarial timestamp string cannot inject — Date.parse never echoes it.
 */

/** Shared placeholder for invalid / missing timestamps (em-dash U+2014). AC-3. */
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

// ── Module-level memoized formatters (locale = runtime default, options fixed app-wide) ──

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

// ── Relative ladder helper ────────────────────────────────────────────────────

function relativeLabel(diff: number): string {
	// diff is always >= 0 (clamped by callers)
	// @lore UI-043: boundary was FOUR_WEEKS_MS (28d) but divided by MONTH_MS (30d),
	// giving Math.floor(28/30)=0 → "0mo" for 28-29 day old items. Fixed: weeks
	// branch runs up to MONTH_MS (30d), so 28d→"4w", 29d→"4w", 30d→"1mo".
	if (diff < MIN_MS) return "just now";
	if (diff < HOUR_MS) return `${Math.floor(diff / MIN_MS)}m`;
	if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h`;
	if (diff < WEEK_MS) return `${Math.floor(diff / DAY_MS)}d`;
	if (diff < MONTH_MS) return `${Math.floor(diff / WEEK_MS)}w`;
	if (diff < YEAR_MS) return `${Math.floor(diff / MONTH_MS)}mo`;
	return `${Math.floor(diff / YEAR_MS)}y`;
}

// ── Exported registers ────────────────────────────────────────────────────────

/**
 * R1 — compact relative age, no "ago" suffix. Default register for dense
 * rows/chips/columns. just now / Nm / Nh / Nd / Nw / Nmo / Ny.
 * Future → clamped to "just now". Invalid/null → TIME_PLACEHOLDER.
 */
export function relativeShort(input: TimestampInput, now?: number): string {
	const epoch = toEpoch(input);
	if (epoch === null) return TIME_PLACEHOLDER;
	const diff = Math.max(0, (now ?? Date.now()) - epoch);
	return relativeLabel(diff);
}

/**
 * R2 — prose relative age = relativeShort + " ago". Same threshold ladder,
 * suffix only (guarantees AC-1 register agreement). Future → "just now"
 * (no suffix on the clamp case). Invalid/null → TIME_PLACEHOLDER.
 */
export function relativeLong(input: TimestampInput, now?: number): string {
	const short = relativeShort(input, now);
	if (short === TIME_PLACEHOLDER || short === "just now") return short;
	return `${short} ago`;
}

/**
 * R3 — wall-clock time-of-day via Intl.DateTimeFormat.
 * seconds=false → locale hour-cycle minute clock "2:34 PM" (h:mm a on 12h locales);
 * seconds=true → forced 24h "14:32:07" (HH:mm:ss, hour12:false — intentional ‡).
 * R3 is parameterized by BOTH precision and hour-cycle, by design.
 *
 * ‡ @lore AI3 site-15: a prior seconds-precision activity log used toLocaleTimeString
 * with no hour12 override → locale-12h on en-US renders "02:34:07 PM". clockTime
 * with seconds:true hard-codes hour12:false → "14:34:07" app-wide. Intentional
 * visible change: high-frequency tool-call log reads cleaner in 24h and disambiguates
 * adjacent events. The minute variant (CommentRow) keeps locale hour-cycle — R3 is
 * parameterized by both precision and hour-cycle by design, not oversight.
 *
 * Invalid/null → TIME_PLACEHOLDER.
 */
export function clockTime(input: TimestampInput, opts?: { seconds?: boolean }): string {
	const epoch = toEpoch(input);
	if (epoch === null) return TIME_PLACEHOLDER;
	const fmt = opts?.seconds ? fmtClockSeconds : fmtClockMinute;
	return fmt.format(new Date(epoch));
}

/** R4a — calendar date, one app-wide format "Jun 12, 2026" (MMM D, YYYY). */
export function absoluteDate(input: TimestampInput): string {
	const epoch = toEpoch(input);
	if (epoch === null) return TIME_PLACEHOLDER;
	return fmtDate.format(new Date(epoch));
}

/** R4b — calendar date + minute clock "Jun 12, 2026, 2:34 PM". */
export function absoluteDateTime(input: TimestampInput): string {
	const epoch = toEpoch(input);
	if (epoch === null) return TIME_PLACEHOLDER;
	return fmtDateTime.format(new Date(epoch));
}
