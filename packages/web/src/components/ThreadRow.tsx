import type { JSX, ReactNode } from "react";
import { type Status, StatusChip } from "./StatusChip";
import { Tag } from "./Tag";

export interface ThreadRowProps {
	avatarUrl: string;
	title: string;
	snippet: string;
	timestamp: string;
	status?: Status;
	tag?: string;
	actions?: ReactNode;
	unread?: boolean;
}

export function ThreadRow({
	avatarUrl,
	title,
	snippet,
	timestamp,
	status,
	tag,
	actions,
	unread = false,
}: ThreadRowProps): JSX.Element {
	return (
		<div className={`flex items-center gap-2 px-2 py-2 ${unread ? "font-bold" : ""}`}>
			<img src={avatarUrl} alt="avatar" className="h-8 w-8 rounded-full" />
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-sm truncate">{title}</span>
					{status && <StatusChip status={status} />}
					{tag && <Tag label={tag} />}
				</div>
				<p className="text-xs text-base-content/60 truncate">{snippet}</p>
			</div>
			<span className="text-xs text-base-content/50 whitespace-nowrap">{timestamp}</span>
			{actions}
		</div>
	);
}
