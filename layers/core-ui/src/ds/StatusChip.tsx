import type { JSX } from "react";
import { dsProps } from "./ds-attrs";

export type Status = "healthy" | "behind" | "blocked" | "paused" | "done" | "error";

export interface StatusChipProps {
	/**
	 * @lore: "unknown" NOT in KNOWN_STATUSES — unrecognised strings (version skew, missing value) fall to neutral-grey escape hatch; no as cast at call sites
	 */
	status: Status | "unknown";
	/**
	 * @lore: two-layer casing — CSS uppercase visual + registry string verbatim in DOM; label branch NEVER JS-uppercases; textContent must match registry string
	 */
	label?: string;
}

// @lore: color-mix() backgrounds not DaisyUI badge — TSX and HTML renderings must be pixel-identical

// @lore: px-based values not rem — design-system viewer font-size:14px makes rem compute wrong (gap-1.5=5.25px not 6px)

// @lore: density-static — badge-as-callout dimensions stay literal; density toggles would compete with body text and read as buttons

interface StatusStyle {
	chip: string;
	dot: string;
}

// Text color uses the `-chip-text` variant, not the plain status token: on
// this chip's own pale tint background the plain (icon-brightness) status
// colors fail WCAG AA (measured 3.71-4.36 in light mode) — see tokens.css.
// The dot keeps the plain token; a decorative dot only needs 3:1 (WCAG
// 1.4.11), which it already passes.
const STATUS_STYLES: Record<Status | "unknown", StatusStyle> = {
	healthy: {
		chip: "bg-[color-mix(in_oklab,var(--status-success)_14%,transparent)] text-[var(--status-success-chip-text)]",
		dot: "bg-[var(--status-success)]",
	},
	behind: {
		chip: "bg-[color-mix(in_oklab,var(--status-warning)_14%,transparent)] text-[var(--status-warning-chip-text)]",
		dot: "bg-[var(--status-warning)]",
	},
	blocked: {
		chip: "bg-[color-mix(in_oklab,var(--status-error)_14%,transparent)] text-[var(--status-error-chip-text)]",
		dot: "bg-[var(--status-error)]",
	},
	paused: {
		chip: "bg-[color-mix(in_oklab,var(--status-info)_14%,transparent)] text-[var(--status-info-chip-text)]",
		dot: "bg-[var(--status-info)]",
	},
	done: {
		chip: "bg-[color-mix(in_oklab,var(--status-success)_14%,transparent)] text-[var(--status-success-chip-text)]",
		dot: "bg-[var(--status-success)]",
	},
	error: {
		chip: "bg-[color-mix(in_oklab,var(--status-error)_14%,transparent)] text-[var(--status-error-chip-text)]",
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
