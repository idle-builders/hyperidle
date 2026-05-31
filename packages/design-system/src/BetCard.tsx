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
			/*
			 * @lore K11: outer pad → --density-card-pad, section gap →
			 * --density-card-gap, inner-row gap → --density-gap, title font →
			 * --density-text per density-audit.md § 3.2.4. The 6 px progress
			 * bar height stays literal (instrument metric); the 24 px lead
			 * avatar stays literal (card-internal, not row-anchor — see
			 * density-audit.md § 4.4 last paragraph). StatusChip + Tag stay
			 * literal (chip rule — § 3.1.1, § 3.1.2).
			 */
			{...clickableProps(
				onClick,
				"bg-[var(--surface-elevated)] rounded-[var(--r-default)] p-[var(--density-card-pad)] flex flex-col gap-[var(--density-card-gap)] shadow-[var(--shadow-default)] border border-[var(--border-subtle)] hover:translate-y-[-2px] hover:shadow-[var(--shadow-elevated)] transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
			)}
		>
			<div className="flex items-center gap-[var(--density-gap)]">
				{leadAvatar && (
					<span
						/* @lore K10: card-internal lead avatar stays literal 24 px
						   (not --density-avatar-size). Per density-audit.md § 4.4
						   the avatar token is for row-anchor avatars only
						   (ThreadRow). Card-internal avatars are
						   decorative inside the card, not the row anchor. */
						className="inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-container)] text-[var(--text-primary)] text-[11px] font-semibold"
						aria-label={`Lead agent: ${leadAvatar.name}`}
					>
						{leadAvatar.initials}
					</span>
				)}
				<span
					className="text-[length:var(--density-text)] font-medium truncate flex-1 min-w-0"
					aria-label={`Bet: ${title}`}
				>
					{title}
				</span>
			</div>
			<div className="flex items-center gap-[var(--density-gap)]">
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
				<div className="flex items-center gap-[var(--density-gap)]">
					{/* @lore K10: progress-bar height stays literal 6 px — instrument
					    metric per density-audit.md § 3.2.4. Linear/Datadog/Vercel
					    all hold sparkline/progress strokes at 4-6 px regardless of
					    zoom; growing under comfortable would turn it into a button. */}
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
