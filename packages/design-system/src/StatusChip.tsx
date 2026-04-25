import type { JSX } from "react";

export type Status = "healthy" | "behind" | "blocked" | "paused" | "done" | "error";

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
 */

interface StatusStyle {
	chip: string;
	dot: string;
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
]);

const CHIP_BASE =
	"inline-flex items-center gap-[6px] px-[8px] py-[2px] rounded-full font-heading text-[11px] tracking-[0.05em] uppercase font-medium leading-[1.4] whitespace-nowrap shrink-0";

export function StatusChip({ status }: StatusChipProps): JSX.Element {
	const safeStatus: Status | "unknown" =
		typeof status === "string" && KNOWN_STATUSES.has(status) ? (status as Status) : "unknown";

	const style = STATUS_STYLES[safeStatus];

	return (
		<span className={`${CHIP_BASE} ${style.chip}`} title={safeStatus} data-status={safeStatus}>
			<span className={`h-[6px] w-[6px] rounded-full shrink-0 ${style.dot}`} />
			{safeStatus.toUpperCase()}
		</span>
	);
}
