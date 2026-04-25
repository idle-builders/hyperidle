import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs";
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
		<div
			{...dsProps("NotificationRow", "2")}
			/*
			 * @lore K11: pad/gap/body text consume density tokens per
			 * density-audit.md § 3.2.3. Same shape as ThreadRow but no
			 * avatar. Trailing timestamp stays literal 12 px (chrome).
			 */
			className="flex items-center gap-[var(--density-gap)] py-[var(--density-pad-y)] px-[var(--density-pad-x)] rounded-[var(--r1)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-4)]"
		>
			<StatusChip status={severity} />
			<span
				className="flex-1 text-[length:var(--density-text)] truncate"
				aria-label={`Notification: ${message}`}
			>
				{message}
			</span>
			{source && <Tag label={source} />}
			<span className="text-[12px] text-[var(--text-lo)] whitespace-nowrap">{timestamp}</span>
			{actions}
		</div>
	);
}
