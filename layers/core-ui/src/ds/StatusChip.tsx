import type { JSX } from "react";
import { dsProps } from "./ds-attrs";

export type Status = "healthy" | "behind" | "blocked" | "paused" | "done" | "error";

export interface StatusChipProps {
	/**
	 * The chip status. Accepts all named statuses plus the explicit sentinel
	 * `"unknown"` for call sites where absence of a value is not an error
	 * (e.g. "No credential" in SettingsModels). At runtime we also tolerate
	 * `undefined` / unrecognised strings (server/web version skew) and
	 * render a neutral grey chip — see `KNOWN_STATUSES` + `safeStatus`.
	 * See I4 adversary W4.
	 *
	 * @lore AG7 W1: widened from `Status` to `Status | "unknown"` so call
	 * sites that legitimately mean "no value yet" don't need an `as` cast.
	 * `"unknown"` is NOT added to `KNOWN_STATUSES` — the runtime escape hatch
	 * (unknown strings → neutral grey) routes through the same code path.
	 */
	status: Status | "unknown";
	/**
	 * Casing contract:
	 * When provided, renders the string VERBATIM into the DOM — no JS
	 * `.toUpperCase()`. The CSS `uppercase` class in CHIP_BASE provides
	 * visual uppercasing so the chip still reads uppercase, but `textContent`
	 * preserves the canonical registry string (e.g. "Active" not "ACTIVE").
	 *
	 * This is load-bearing: BetCard.test.tsx asserts `getByText("Active")`
	 * against DOM `textContent`. If JS-uppercasing were applied here it would
	 * break those protected assertions.
	 *
	 * When omitted, the default path renders `safeStatus.toUpperCase()` (the
	 * presentation Status name) — existing consumer behavior unchanged.
	 *
	 * @lore AI4: Two-layer casing — CSS `uppercase` (visual) + registry string
	 * verbatim (DOM). The JS `.toUpperCase()` lives only on the default
	 * (status-name) branch, NOT on the label branch.
	 */
	label?: string;
}

/**
 * @lore StatusChip styling matches the HTML reference in framework/design-system/html/StatusChip.html.
 * Uses color-mix() backgrounds with CSS token colors instead of DaisyUI badge classes
 * so the TSX and HTML renderings are pixel-identical.
 *
 * @lore All spacing values use explicit pixel units (not rem-based
 * Tailwind utilities like gap-1.5, px-2, py-0.5) because the
 * design-system viewer sets html { font-size: 14px }, which makes 1rem=14px.
 * Tailwind rem classes would compute to wrong values (e.g. gap-1.5=5.25px
 * instead of 6px, px-2=7px instead of 8px).
 *
 * @lore K10 / K11: badge-as-callout — every axis stays literal. Density
 * toggling badges destroys their as-callout function (they would compete
 * with the body text they sit next to and read as buttons under
 * comfortable). Carbon `tag-sm`, Polaris `Badge`, Material 3 `chip-small`
 * all hold chip dimensions constant across density modes; only the parent
 * row widens. The `design/no-density-tokens` lint rule treats StatusChip
 * as the canonical density-static example. See
 * framework/design-system/research/density-audit.md § 3.1.1.
 */

interface StatusStyle {
	chip: string;
	dot: string;
}

const STATUS_STYLES: Record<Status | "unknown", StatusStyle> = {
	healthy: {
		chip: "bg-[color-mix(in_oklab,var(--status-success)_14%,transparent)] text-[var(--status-success)]",
		dot: "bg-[var(--status-success)]",
	},
	behind: {
		chip: "bg-[color-mix(in_oklab,var(--status-warning)_14%,transparent)] text-[var(--status-warning)]",
		dot: "bg-[var(--status-warning)]",
	},
	blocked: {
		chip: "bg-[color-mix(in_oklab,var(--status-error)_14%,transparent)] text-[var(--status-error)]",
		dot: "bg-[var(--status-error)]",
	},
	paused: {
		chip: "bg-[color-mix(in_oklab,var(--status-info)_14%,transparent)] text-[var(--status-info)]",
		dot: "bg-[var(--status-info)]",
	},
	done: {
		chip: "bg-[color-mix(in_oklab,var(--status-success)_14%,transparent)] text-[var(--status-success)]",
		dot: "bg-[var(--status-success)]",
	},
	error: {
		chip: "bg-[color-mix(in_oklab,var(--status-error)_14%,transparent)] text-[var(--status-error)]",
		dot: "bg-[var(--status-error)]",
	},
	unknown: {
		chip: "bg-[color-mix(in_oklab,var(--text-tertiary)_14%,transparent)] text-[var(--text-tertiary)]",
		dot: "bg-[var(--text-tertiary)]",
	},
};

const KNOWN_STATUSES: ReadonlySet<string> = new Set<Status>([
	"healthy",
	"behind",
	"blocked",
	"paused",
	"done",
	"error",
]);

const CHIP_BASE =
	"inline-flex items-center gap-[6px] px-[8px] py-[2px] rounded-[var(--r-pill)] uppercase whitespace-nowrap shrink-0";

export function StatusChip({ status, label }: StatusChipProps): JSX.Element {
	const safeStatus: Status | "unknown" =
		typeof status === "string" && KNOWN_STATUSES.has(status) ? (status as Status) : "unknown";

	const style = STATUS_STYLES[safeStatus];

	return (
		<span
			{...dsProps("StatusChip", "1")}
			className={`type-data ${`${CHIP_BASE} ${style.chip}`}`}
			title={safeStatus}
			data-status={safeStatus}
		>
			<span className={`h-[6px] w-[6px] rounded-[var(--r-pill)] shrink-0 ${style.dot}`} />
			{label ? label : safeStatus.toUpperCase()}
		</span>
	);
}
