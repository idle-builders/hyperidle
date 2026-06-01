import type { BetStatus } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { clickableProps } from "./clickable";
import { dsProps } from "./ds-attrs";
import { KeyValue } from "./KeyValue";
import { StatusChip } from "./StatusChip";
import { betStatusToStatus } from "./status-mapping";
import { Tag } from "./Tag";

/**
 * @lore J5: BetCard gained portfolio-mode props (leadAvatar / activeBets /
 * shipped). Additive only — base composition and existing tests are
 * unchanged. The portfolio fields render only when the corresponding prop
 * is supplied so the card still collapses to its original shape when used
 * as a pure bet summary on Canvas.
 *
 * @lore All spacing values use explicit pixel units (not rem-based
 * Tailwind utilities like p-2, gap-1, h-6, w-16) because the
 * design-system viewer sets html { font-size: 14px }, which makes 1rem=14px.
 * Tailwind rem classes would compute to wrong values (e.g. p-2=7px
 * instead of 8px, gap-1=3.5px instead of 4px, w-16=56px instead of 64px).
 */
export interface BetCardLeadAvatar {
	name: string;
	initials: string;
}

export interface BetCardProps {
	title: string;
	/** @lore U5: Renamed from `product` to `team`. Represents the team name this bet belongs to. */
	team: string;
	status: BetStatus;
	appetite: string;
	actions?: ReactNode;
	onClick?: () => void;
	progress?: { done: number; total: number };
	leadAvatar?: BetCardLeadAvatar;
	activeBets?: number;
	shipped?: number;
}

export function BetCard({
	title,
	team,
	status,
	appetite,
	actions,
	onClick,
	progress,
	leadAvatar,
	activeBets,
	shipped,
}: BetCardProps): JSX.Element {
	return (
		<div
			{...dsProps("BetCard", "2")}
			{...clickableProps(
				onClick,
				"bg-[var(--surface-elevated)] rounded-[var(--r-default)] p-[18px] flex flex-col gap-[6px] shadow-[var(--shadow-default)] border border-[var(--border-subtle)] hover:translate-y-[-2px] hover:shadow-[var(--shadow-elevated)] transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
			)}
		>
			<div className="flex items-center gap-[12px]">
				{leadAvatar && (
					<span
						className="inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-container)] text-[var(--text-primary)] text-[11px] font-semibold"
						aria-label={`Lead agent: ${leadAvatar.name}`}
					>
						{leadAvatar.initials}
					</span>
				)}
				<span
					className="text-[15px] font-medium truncate flex-1 min-w-0"
					aria-label={`Bet: ${title}`}
				>
					{title}
				</span>
			</div>
			<div className="flex items-center gap-[12px]">
				<Tag label={team} />
				<StatusChip status={betStatusToStatus(status)} />
			</div>
			<KeyValue label="Appetite" value={appetite} />
			{activeBets !== undefined && (
				<KeyValue
					label={activeBets === 1 ? "Active bet" : "Active bets"}
					value={String(activeBets)}
				/>
			)}
			{shipped !== undefined && <KeyValue label="Shipped" value={String(shipped)} />}
			{progress && (
				<div className="flex items-center gap-[12px]">
					<div className="w-[64px] h-[6px] bg-[var(--surface-container)] rounded-[var(--r-pill)] overflow-hidden">
						<div
							className="h-full bg-[var(--status-success)] rounded-[var(--r-pill)] transition-[width] duration-[var(--motion-default)]"
							style={{ width: `${(progress.done / progress.total) * 100}%` }}
						/>
					</div>
					<span className="text-[12px] text-[var(--text-secondary)]">
						{progress.done}/{progress.total}
					</span>
				</div>
			)}
			{actions}
		</div>
	);
}
