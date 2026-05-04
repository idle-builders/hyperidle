import type { JSX } from "react";
import { dsProps } from "./ds-attrs";

export type Status =
	| "healthy"
	| "behind"
	| "blocked"
	| "paused"
	| "done"
	| "error"
	| "request_pending";

export interface StatusChipProps {
	/**
	 * Runtime value. Typed as `Status` at the call site for compile-time
	 * safety, but at runtime we tolerate `undefined` / unknown strings
	 * (e.g. server/web version skew where a new shared status hasn't been
	 * mapped yet) and render a neutral "unknown" chip instead of letting
	 * an undefined class leak into the DOM as `badge undefined`.
	 * See I4 adversary W4.
	 */
	status: Status;
}

/**
 * @lore StatusChip styling matches the HTML reference in packages/design-system/html/StatusChip.html.
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
 * packages/design-system/research/density-audit.md § 3.1.1.
 */

interface StatusStyle {
	chip: string;
	dot: string;
	/** L15: optional label override for variants whose label is not the
	 * uppercased status name (e.g. `request_pending` → `↪ PENDING`). */
	label?: string;
	/** L15: when true, the chip omits the leading dot (used by the dashed
	 * pending variant). */
	hideDot?: boolean;
}

const STATUS_STYLES: Record<Status | "unknown", StatusStyle> = {
	healthy: {
		chip: "bg-[color-mix(in_oklab,var(--ok)_14%,transparent)] text-[var(--ok)]",
		dot: "bg-[var(--ok)]",
	},
	behind: {
		chip: "bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] text-[var(--warn)]",
		dot: "bg-[var(--warn)]",
	},
	blocked: {
		chip: "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)]",
		dot: "bg-[var(--danger)]",
	},
	paused: {
		chip: "bg-[color-mix(in_oklab,var(--text-lo)_14%,transparent)] text-[var(--text-lo)]",
		dot: "bg-[var(--text-lo)]",
	},
	done: {
		chip: "bg-[color-mix(in_oklab,var(--ok)_14%,transparent)] text-[var(--ok)]",
		dot: "bg-[var(--ok)]",
	},
	error: {
		chip: "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)]",
		dot: "bg-[var(--danger)]",
	},
	request_pending: {
		chip:
			"bg-[var(--surface-ghost)] text-[var(--text-hi)] border border-dashed border-[var(--border-default)]",
		dot: "",
		label: "↪ PENDING",
		hideDot: true,
	},
	unknown: {
		chip: "bg-[color-mix(in_oklab,var(--text-lo)_14%,transparent)] text-[var(--text-lo)]",
		dot: "bg-[var(--text-lo)]",
	},
};

const KNOWN_STATUSES: ReadonlySet<string> = new Set<Status>([
	"healthy",
	"behind",
	"blocked",
	"paused",
	"done",
	"error",
	"request_pending",
]);

const CHIP_BASE =
	"inline-flex items-center gap-[6px] px-[8px] py-[2px] rounded-full font-heading text-[11px] tracking-[0.05em] uppercase font-medium leading-[1.4] whitespace-nowrap shrink-0";

export function StatusChip({ status }: StatusChipProps): JSX.Element {
	const safeStatus: Status | "unknown" =
		typeof status === "string" && KNOWN_STATUSES.has(status) ? (status as Status) : "unknown";

	const style = STATUS_STYLES[safeStatus];

	const label = style.label ?? safeStatus.toUpperCase();
	return (
		<span
			{...dsProps("StatusChip", "1")}
			className={`${CHIP_BASE} ${style.chip}`}
			title={safeStatus}
			data-status={safeStatus}
		>
			{style.hideDot ? null : (
				<span className={`h-[6px] w-[6px] rounded-full shrink-0 ${style.dot}`} />
			)}
			{label}
		</span>
	);
}
