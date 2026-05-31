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

export function NavItem({
	label,
	icon,
	count,
	selected = false,
	statusDot,
	onClick,
}: NavItemProps): JSX.Element {
	/**
	 * @lore border-none sets border-style:none which prevents border-l-2 from
	 * showing. Use border-0 instead — keeps border-style:solid from preflight
	 * so the selected left border renders. bg-transparent must also be
	 * conditional to avoid conflicting with the selected bg-[var(--surface-elevated)].
	 *
	 * @lore U7: migrated from Lucid tokens (--text-hi, --r1, --surface-4, --primary,
	 * --surface-2, --surface-ghost, --text-lo, --mono, --text-mid) to Hearth tokens
	 * (--text-primary, --r-subtle, --surface-elevated, --accent-primary,
	 * --accent-primary-dim, --text-tertiary, --font-mono, --text-secondary).
	 */
	const baseClasses =
		"relative flex w-full items-center gap-2 text-left min-h-[var(--density-row-h)] py-[var(--density-pad-y)] px-[var(--density-pad-x)] text-[length:var(--density-text)] text-[var(--text-primary)] rounded-[var(--r-subtle)] border-0 cursor-pointer transition-[background] duration-[var(--motion-fast)] ease-[ease]";

	const stateClasses = selected
		? "bg-[var(--surface-elevated)] border-l-2 border-l-[var(--accent-primary)]"
		: "bg-transparent hover:bg-[var(--accent-primary-dim)]";

	return (
		<li {...dsProps("NavItem", "1")}>
			<button type="button" className={`${baseClasses} ${stateClasses}`} onClick={onClick}>
				{icon && (
					<span
						className={`inline-flex items-center shrink-0 ${selected ? "text-[var(--accent-primary)]" : "text-[var(--text-tertiary)]"}`}
					>
						{icon}
					</span>
				)}
				<span className="flex-1">{label}</span>
				{statusDot && (
					<span
						className={`h-[6px] w-[6px] rounded-full shrink-0 ${STATUS_DOT_COLORS[statusDot]}`}
					/>
				)}
				{count != null && (
					/* @lore K7 / AESTHETICS.md § Spacing & Density "Grid base unit" + § Typography
					   "Body size (default)": px-[5px] → px-[4px] (off-grid), text-[10px] → text-[11px]
					   (off-scale). 18px width retained — chip-internal sub-grid per same row. */
					<span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-[4px] rounded-[var(--r-pill)] bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] font-[family-name:var(--font-mono)] text-[11px] font-medium text-[var(--text-secondary)]">
						{count}
					</span>
				)}
			</button>
		</li>
	);
}
