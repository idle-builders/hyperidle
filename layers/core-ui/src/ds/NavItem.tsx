// hearth-internal-padding — count badge uses py-[2px] (sub-element exemption; badge is not a standalone interactive element)
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

const COUNT_BADGE_CLASSES =
	"inline-flex items-center justify-center min-w-[18px] px-[6px] py-[3px] rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] text-[var(--accent-deep)] text-center";

export function NavItem({
	label,
	icon,
	count,
	selected = false,
	statusDot,
	onClick,
}: NavItemProps): JSX.Element {
	const baseClasses = [
		"flex w-full items-center gap-[6px] text-left",
		"py-[6px] px-[12px]",
		"",
		"text-[var(--text-secondary)]",
		"rounded-[var(--r-subtle)] border-none",
		"cursor-pointer",
		"",
	].join(" ");

	const stateClasses = selected
		? "bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-[var(--shadow-subtle)]"
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
						data-testid="nav-item-status-dot"
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
