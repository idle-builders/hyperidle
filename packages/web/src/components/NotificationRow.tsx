import type { JSX, ReactNode } from "react";
import { type Status, StatusChip } from "./StatusChip";
import { Tag } from "./Tag";

export interface NotificationRowProps {
	severity: Status;
	message: string;
	timestamp: string;
	source?: string;
	actions?: ReactNode;
}

export function NotificationRow({
	severity,
	message,
	timestamp,
	source,
	actions,
}: NotificationRowProps): JSX.Element {
	return (
		<div className="flex items-center gap-2 px-2 py-2">
			<StatusChip status={severity} />
			<span className="flex-1 text-sm truncate">{message}</span>
			{source && <Tag label={source} />}
			<span className="text-xs text-base-content/50 whitespace-nowrap">{timestamp}</span>
			{actions}
		</div>
	);
}
