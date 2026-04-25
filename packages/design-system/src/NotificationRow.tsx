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
		<div className="flex items-center gap-[8px] p-[8px] rounded-[var(--r1)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-4)]">
			<StatusChip status={severity} />
			<span className="flex-1 text-[14px] truncate" aria-label={`Notification: ${message}`}>
				{message}
			</span>
			{source && <Tag label={source} />}
			<span className="text-[12px] text-[var(--text-lo)] whitespace-nowrap">{timestamp}</span>
			{actions}
		</div>
	);
}
