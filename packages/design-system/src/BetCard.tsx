// hearth-internal-padding
import type { BetStatus } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { clickableProps } from "./clickable";
import { dsProps } from "./ds-attrs";
import { KeyValue } from "./KeyValue";

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
 *
 * @lore visual-parity-audit: Restructured to match BetCard.html mockup.
 * Top row now contains: status dot + status badge + budget badge (right-aligned).
 * Title moved below top row. StatusChip replaced with simple colored pill badges
 * using human-readable labels ("Active", "At risk", "Draft", "Completed").
 * Avatar group uses overlapping 24px circles with -6px negative margin.
 * Progress fill uses accent-primary (green) for active / accent-secondary
 * (amber) for at-risk statuses. Completed bets get opacity-75.
 * Card border removed — mockup uses shadow-default only.
 */
export interface BetCardLeadAvatar {
	name: string;
	initials: string;
}

export interface BetCardAvatarGroup {
	initials: string;
	agent?: boolean;
}

/** Status dot color per BetStatus — 8px pill, colored by status */
const STATUS_DOT_COLOR: Record<BetStatus, string> = {
	draft: "var(--status-info)",
	active: "var(--accent-primary)",
	completed: "var(--border-strong)",
	killed: "var(--status-error)",
};

/** Human-readable badge label per BetStatus */
const STATUS_LABEL: Record<BetStatus, string> = {
	draft: "Draft",
	active: "Active",
	completed: "Completed",
	killed: "Killed",
};

/** Badge variant per BetStatus — maps to CSS color treatment */
type BadgeVariant = "green" | "amber" | "blue" | "default";

const STATUS_BADGE_VARIANT: Record<BetStatus, BadgeVariant> = {
	draft: "blue",
	active: "green",
	completed: "default",
	killed: "default",
};

/** Returns inline style classes for badge variants using semantic tokens */
function badgeClasses(variant: BadgeVariant): string {
	const base =
		"inline-flex items-center text-[12px] font-[500] px-[9px] py-[3px] rounded-[var(--r-pill)] leading-[1.4] whitespace-nowrap";
	switch (variant) {
		case "green":
			return `${base} bg-[rgba(22,118,79,0.08)] text-[var(--accent-primary)]`;
		case "amber":
			return `${base} bg-[rgba(217,119,6,0.1)] text-[var(--accent-secondary)]`;
		case "blue":
			return `${base} bg-[rgba(46,125,186,0.08)] text-[var(--status-info)]`;
		case "default":
			return `${base} bg-[var(--surface-container)] text-[var(--text-secondary)]`;
	}
}

/** Progress fill color per BetStatus */
function progressFillColor(status: BetStatus): string {
	if (status === "active") return "var(--accent-primary)";
	if (status === "draft") return "var(--status-info)";
	return "var(--accent-secondary)";
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
	/**
	 * AC1: Optional outcome verdict for display. Shown as a neutral badge after
	 * the status badge. Only rendered when not null/undefined.
	 */
	outcomeVerdict?: string;
}

export function BetCard({
	title,
	team: _team,
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
	id,
	outcomeVerdict,
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

	const isCompleted = status === "completed" || status === "killed";

	return (
		<div
			{...dsProps("BetCard", "2")}
			{...clickableProps(
				onClick,
				`bg-[var(--surface-elevated)] rounded-[var(--r-default)] p-[18px] flex flex-col gap-[9px] shadow-[var(--shadow-default)] hover:translate-y-[-2px] hover:shadow-[var(--shadow-elevated)] transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]${isCompleted ? " opacity-75" : ""}`,
			)}
		>
			{/* Top row: status dot + status badge + budget badge (right-aligned) */}
			<div className="flex items-center gap-[6px]">
				{leadAvatar && (
					<span
						className="inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-container)] text-[var(--text-primary)] text-[11px] font-semibold"
						aria-label={`Lead agent: ${leadAvatar.name}`}
					>
						{leadAvatar.initials}
					</span>
				)}
				{/* 8px status dot */}
				<span
					className="inline-block w-[8px] h-[8px] rounded-[var(--r-pill)] shrink-0"
					style={{ background: STATUS_DOT_COLOR[status] }}
					aria-hidden="true"
				/>
				{/* Status badge — human-readable label */}
				<span
					className={badgeClasses(STATUS_BADGE_VARIANT[status] as BadgeVariant)}
					data-status={status}
				>
					{STATUS_LABEL[status]}
				</span>
				{/* AC1: Outcome verdict badge — neutral style, only when verdict is set */}
				{outcomeVerdict && (
					<span
						className={badgeClasses("default")}
						aria-label={`Outcome: ${outcomeVerdict}`}
						data-testid={id ? `bet-card-verdict-badge-${id}` : "bet-card-verdict-badge"}
					>
						{outcomeVerdict.charAt(0).toUpperCase() + outcomeVerdict.slice(1)}
					</span>
				)}
				{/* Budget badge — amber, right-aligned via ml-auto */}
				{budgetLabel && <span className={`${badgeClasses("amber")} ml-auto`}>{budgetLabel}</span>}
			</div>

			{/* Title */}
			<span
				className="text-[17px] font-[600] tracking-[-0.01em] text-[var(--text-primary)] truncate"
				aria-label={`Bet: ${title}`}
			>
				{title}
			</span>

			{/* Description */}
			{description && (
				<p className="text-[13px] text-[var(--text-secondary)] leading-[1.7] line-clamp-3">
					{description}
				</p>
			)}

			{appetite && <KeyValue label="Appetite" value={appetite} />}
			{activeBets !== undefined && (
				<KeyValue
					label={activeBets === 1 ? "Active bet" : "Active bets"}
					value={String(activeBets)}
				/>
			)}
			{shipped !== undefined && <KeyValue label="Shipped" value={String(shipped)} />}

			{/* Progress bar */}
			{progressPct !== null && (
				<>
					<div
						role="progressbar"
						aria-valuenow={progressPct}
						aria-valuemin={0}
						aria-valuemax={100}
						data-progress-bar
						className="w-full h-[8px] bg-[var(--surface-container)] rounded-[var(--r-pill)] overflow-hidden"
					>
						<div
							className="h-full rounded-[var(--r-pill)] transition-[width] duration-[var(--motion-default)]"
							style={{
								width: `${progressPct}%`,
								background: progressFillColor(status),
							}}
						/>
					</div>

					{/* Footer: avatar group + percentage */}
					<div className="flex items-center justify-between mt-[3px]">
						{avatarGroup && avatarGroup.length > 0 ? (
							<div className="flex items-center">
								{avatarGroup.map((a, i) => (
									<span
										// biome-ignore lint/suspicious/noArrayIndexKey: static display-only list
										key={i}
										className={[
											"inline-flex w-[24px] h-[24px] items-center justify-center rounded-full text-[9px] font-[600] shrink-0",
											i === 0 ? "" : "-ml-[6px]",
											a.agent
												? "bg-[var(--accent-primary-dim)] text-[var(--accent-primary)] border-[2px] border-[var(--surface-elevated)]"
												: "bg-[var(--surface-page)] text-[var(--text-secondary)] border-[2px] border-[var(--surface-elevated)]",
										]
											.join(" ")
											.trim()}
									>
										{a.initials}
									</span>
								))}
							</div>
						) : (
							<span />
						)}
						<span className="text-[12px] font-mono text-[var(--text-tertiary)] tabular-nums">
							{progressLabel}
						</span>
					</div>
				</>
			)}

			{/* Avatar group standalone (no progress bar) */}
			{progressPct === null && avatarGroup && avatarGroup.length > 0 && (
				<div className="flex items-center">
					{avatarGroup.map((a, i) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: static display-only list
							key={i}
							className={[
								"inline-flex w-[24px] h-[24px] items-center justify-center rounded-full text-[9px] font-[600] shrink-0",
								i === 0 ? "" : "-ml-[6px]",
								a.agent
									? "bg-[var(--accent-primary-dim)] text-[var(--accent-primary)] border-[2px] border-[var(--surface-elevated)]"
									: "bg-[var(--surface-page)] text-[var(--text-secondary)] border-[2px] border-[var(--surface-elevated)]",
							]
								.join(" ")
								.trim()}
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
