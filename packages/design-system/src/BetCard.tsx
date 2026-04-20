import type { BetStatus } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { KeyValue } from "./KeyValue";
import { StatusChip } from "./StatusChip";
import { Tag } from "./Tag";
import { clickableProps } from "./clickable";
import { betStatusToStatus } from "./status-mapping";

/**
 * @lore J5: BetCard gained portfolio-mode props (leadAvatar / activeBets /
 * shipped). Additive only — base composition and existing tests are
 * unchanged. The portfolio fields render only when the corresponding prop
 * is supplied so the card still collapses to its original shape when used
 * as a pure bet summary on Canvas.
 */
export interface BetCardLeadAvatar {
	name: string;
	initials: string;
}

export interface BetCardProps {
	title: string;
	product: string;
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
	product,
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
		<div {...clickableProps(onClick, "bg-base-200 rounded p-2 flex flex-col gap-1")}>
			<div className="flex items-center gap-2">
				{leadAvatar && (
					<span
						className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-base-300 text-[var(--text-hi)] text-xs font-semibold"
						aria-label={`Lead agent: ${leadAvatar.name}`}
					>
						{leadAvatar.initials}
					</span>
				)}
				<span className="text-sm font-medium truncate flex-1 min-w-0" aria-label={`Bet: ${title}`}>
					{title}
				</span>
			</div>
			<div className="flex items-center gap-2">
				<Tag label={product} />
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
				<div className="flex items-center gap-2">
					<progress
						className="progress progress-accent w-16 h-1.5"
						value={progress.done}
						max={progress.total}
					/>
					<span className="text-xs text-[var(--text-mid)]">
						{progress.done}/{progress.total}
					</span>
				</div>
			)}
			{actions}
		</div>
	);
}
