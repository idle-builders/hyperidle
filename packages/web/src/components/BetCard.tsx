import type { BetStatus } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { KeyValue } from "./KeyValue";
import { StatusChip } from "./StatusChip";
import { Tag } from "./Tag";
import { clickableProps } from "./clickable";
import { betStatusToStatus } from "./status-mapping";

export interface BetCardProps {
	title: string;
	product: string;
	status: BetStatus;
	appetite: string;
	actions?: ReactNode;
	onClick?: () => void;
	progress?: { done: number; total: number };
}

export function BetCard({
	title,
	product,
	status,
	appetite,
	actions,
	onClick,
	progress,
}: BetCardProps): JSX.Element {
	return (
		<div {...clickableProps(onClick, "bg-base-200 rounded p-2 flex flex-col gap-2")}>
			<div className="flex items-center gap-2">
				<span className="text-sm font-medium truncate" aria-label={`Bet: ${title}`}>
					{title}
				</span>
				<Tag label={product} />
				<StatusChip status={betStatusToStatus(status)} />
			</div>
			<KeyValue label="Appetite" value={appetite} />
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
