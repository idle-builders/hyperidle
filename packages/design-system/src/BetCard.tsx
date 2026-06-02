// hearth-internal-padding
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

export interface BetCardAvatarGroup {
	initials: string;
	agent?: boolean;
}

export interface BetCardProps {
	title: string;
	/** @lore U5: Renamed from `product` to `team`. Represents the team name this bet belongs to. */
	team: string;
	status: BetStatus;
	appetite?: string;
	/** costAppetite: legacy prop name — alias for appetite */
	costAppetite?: unknown;
	atRisk?: boolean;
	actions?: ReactNode;
	onClick?: () => void;
	/**
	 * W3 AC-16: progress accepts either a number (0–100 percentage) or
	 * an object { done, total } for fraction-based display.
	 */
	progress?: number | { done: number; total: number };
	leadAvatar?: BetCardLeadAvatar;
	activeBets?: number;
	shipped?: number;
	/** W3 AC-16: description text shown below title */
	description?: string;
	/** W3 AC-16: avatar group displayed in footer */
	avatarGroup?: ReadonlyArray<BetCardAvatarGroup>;
	/** W3 AC-16: budget label shown as badge */
	budgetLabel?: string;
	/** id: allows caller to pass id without error */
	id?: string;
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
	description,
	avatarGroup,
	budgetLabel,
}: BetCardProps): JSX.Element {
	// W3 AC-16: normalize progress to a percentage number
	const progressPct: number | null =
		progress === undefined || progress === null
			? null
			: typeof progress === "number"
				? progress
				: progress.total > 0
					? Math.round((progress.done / progress.total) * 100)
					: 0;

	// W3 AC-16: label shows "done/total" for object progress, "N%" for numeric progress
	const progressLabel: string | null =
		progress === undefined || progress === null
			? null
			: typeof progress === "number"
				? `${progress}%`
				: `${progress.done}/${progress.total}`;

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
				{/* W3 AC-16: budget badge in header row */}
				{budgetLabel && (
					<span className="inline-flex items-center px-[6px] py-[3px] rounded-[var(--r-pill)] text-[11px] font-mono bg-[var(--surface-container)] text-[var(--text-secondary)] whitespace-nowrap shrink-0">
						{budgetLabel}
					</span>
				)}
			</div>
			<div className="flex items-center gap-[12px]">
				<Tag label={team} />
				{/* W3 AC-15: StatusChip only, no status dot */}
				<StatusChip status={betStatusToStatus(status)} />
			</div>
			{/* W3 AC-16: description text */}
			{description && (
				<p className="text-[13px] text-[var(--text-secondary)] line-clamp-3">{description}</p>
			)}
			{appetite && <KeyValue label="Appetite" value={appetite} />}
			{activeBets !== undefined && (
				<KeyValue
					label={activeBets === 1 ? "Active bet" : "Active bets"}
					value={String(activeBets)}
				/>
			)}
			{shipped !== undefined && <KeyValue label="Shipped" value={String(shipped)} />}
			{/* W3 AC-16: progress bar + percentage */}
			{/* W3 AC-16: progress bar + percentage + avatar group */}
			{progressPct !== null && (
				<div className="flex flex-col gap-[6px]">
					<div
						role="progressbar"
						aria-valuenow={progressPct}
						aria-valuemin={0}
						aria-valuemax={100}
						data-progress-bar
						className="w-full h-[8px] bg-[var(--surface-container)] rounded-[var(--r-pill)] overflow-hidden"
					>
						<div
							className="h-full bg-[var(--status-success)] rounded-[var(--r-pill)] transition-[width] duration-[var(--motion-default)]"
							style={{ width: `${progressPct}%` }}
						/>
					</div>
					<div className="flex items-center justify-between">
						{/* W3 AC-16: avatar group inside progress row */}
						{avatarGroup && avatarGroup.length > 0 ? (
							<div className="flex items-center gap-[3px]">
								{avatarGroup.map((a, i) => (
									<span
										// biome-ignore lint/suspicious/noArrayIndexKey: static display-only list
										key={i}
										className={[
											"inline-flex w-[20px] h-[20px] items-center justify-center rounded-full text-[10px] font-mono uppercase",
											a.agent
												? "bg-[color-mix(in_oklab,var(--accent-primary)_20%,var(--surface-elevated))] text-[var(--accent-primary)]"
												: "bg-[var(--surface-container)] text-[var(--text-secondary)]",
										].join(" ")}
									>
										{a.initials}
									</span>
								))}
							</div>
						) : (
							<span />
						)}
						<span className="text-[12px] font-mono text-[var(--text-secondary)] tabular-nums">
							{progressLabel}
						</span>
					</div>
				</div>
			)}
			{/* W3 AC-16: avatar group rendered standalone when no progress bar */}
			{progressPct === null && avatarGroup && avatarGroup.length > 0 && (
				<div className="flex items-center gap-[3px]">
					{avatarGroup.map((a, i) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: static display-only list
							key={i}
							className={[
								"inline-flex w-[20px] h-[20px] items-center justify-center rounded-full text-[10px] font-mono uppercase",
								a.agent
									? "bg-[color-mix(in_oklab,var(--accent-primary)_20%,var(--surface-elevated))] text-[var(--accent-primary)]"
									: "bg-[var(--surface-container)] text-[var(--text-secondary)]",
							].join(" ")}
						>
							{a.initials}
						</span>
					))}
				</div>
			)}
			{actions}
		</div>
	);
}
