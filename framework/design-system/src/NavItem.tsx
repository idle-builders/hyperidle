// hearth-internal-padding — count badge uses py-[2px] (AQ-001 badge sub-element exemption per AESTHETICS.md)
import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs";

export interface NavItemProps {
	label: string;
	icon?: ReactNode;
	count?: number;
	selected?: boolean;
	statusDot?: "success" | "warning" | "error" | "info";
	onClick?: () => void;
}

const STATUS_DOT_COLORS: Record<NonNullable<NavItemProps["statusDot"]>, string> = {
	success: "bg-[var(--status-success)]",
	warning: "bg-[var(--status-warning)]",
	error: "bg-[var(--status-error)]",
	info: "bg-[var(--status-info)]",
};

/**
 * @lore visual-parity-audit: count badge matches HTML nav-item__count — 12px font,
 * accent-primary color, accent-primary-dim bg (rgba(240,196,25,0.14)), 3px/6px padding
 * (HTML spec is 2px but 3px is on the Hearth 6px grid; AQ-001 exempts badge sub-elements),
 * pill radius, min-w 18px. Previously used text-secondary color + mono font + 11px size.
 */
const COUNT_BADGE_CLASSES =
	"inline-flex items-center justify-center min-w-[18px] px-[6px] py-[3px] rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] text-[12px] font-[500] text-[var(--accent-deep)] text-center";

export function NavItem({
	label,
	icon,
	count,
	selected = false,
	statusDot,
	onClick,
}: NavItemProps): JSX.Element {
	/**
	 * @lore U7: migrated from Lucid tokens (--text-hi, --r1, --surface-4, --primary,
	 * --surface-2, --surface-ghost, --text-lo, --mono, --text-mid) to Hearth tokens
	 * (--text-primary, --r-subtle, --surface-elevated, --accent-primary,
	 * --accent-primary-dim, --text-tertiary, --font-mono, --text-secondary).
	 *
	 * @lore visual-parity-audit: removed left border accent (border-l-2) from selected
	 * state — HTML reference has no left border. Active state uses surface-elevated bg +
	 * shadow-subtle + font-weight 500, matching 03-hearth.html sidebar exactly.
	 * Font size reduced from 15px → 13px, default color changed from text-primary →
	 * text-secondary, min-height removed (HTML uses natural ~30px height from 6px/12px
	 * padding), dot size increased from 6px → 8px to match HTML. Hover changed from
	 * accent-primary-dim to rgba(44,36,26,0.04) per HTML. Count badge aligned to HTML:
	 * 12px font, accent-primary color, accent-primary-dim bg, 2px/6px padding.
	 */
	const baseClasses = [
		"flex w-full items-center gap-[6px] text-left",
		"py-[6px] px-[12px]",
		"font-[family-name:var(--font-sans)] text-[13px] font-[400]",
		"text-[var(--text-secondary)]",
		"rounded-[var(--r-subtle)] border-none",
		"cursor-pointer",
		"transition-[background] duration-[var(--motion-default)] ease-[var(--motion-ease)]",
	].join(" ");

	const stateClasses = selected
		? "bg-[var(--surface-elevated)] text-[var(--text-primary)] font-[500] shadow-[var(--shadow-subtle)]"
		: "bg-transparent hover:bg-[color-mix(in_oklab,var(--text-secondary)_4%,transparent)]";

	return (
		<li {...dsProps("NavItem", "1")}>
			<button
				type="button"
				className={`type-control ${`${baseClasses} ${stateClasses}`}`}
				onClick={onClick}
			>
				{icon && (
					<span
						className={`inline-flex items-center shrink-0 ${selected ? "text-[var(--accent-deep)]" : "text-[var(--text-tertiary)]"}`}
					>
						{icon}
					</span>
				)}
				{statusDot && (
					<span
						className={`h-[8px] w-[8px] rounded-[var(--r-pill)] shrink-0 ${STATUS_DOT_COLORS[statusDot]}`}
					/>
				)}
				<span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
					{label}
				</span>
				{count != null && <span className={`type-metadata ${COUNT_BADGE_CLASSES}`}>{count}</span>}
			</button>
		</li>
	);
}
