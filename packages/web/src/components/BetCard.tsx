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
		<div
			{...clickableProps(onClick)}
			className="border border-base-300 rounded p-2 flex flex-col gap-2"
		>
			<div className="flex items-center gap-2">
				<span className="text-sm font-medium" aria-label={`Bet: ${title}`}>
					{title}
				</span>
				<Tag label={product} />
				<StatusChip status={betStatusToStatus(status)} />
			</div>
			<KeyValue label="Appetite" value={appetite} />
			{progress && (
				<span className="text-xs text-base-content/60">
					{progress.done} / {progress.total}
				</span>
			)}
			{actions}
		</div>
	);
}
