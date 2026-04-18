import type { JSX, ReactNode } from "react";
import { type Status, StatusChip } from "./StatusChip";
import { Tag } from "./Tag";
import { clickableProps } from "./clickable";

export interface ThreadRowProps {
	avatarUrl: string;
	title: string;
	snippet: string;
	timestamp: string;
	status?: Status;
	tag?: string;
	actions?: ReactNode;
	unread?: boolean;
	onClick?: () => void;
	blocking?: boolean;
	kind?: "review" | "chat";
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
	onClick,
	blocking = false,
	kind,
}: ThreadRowProps): JSX.Element {
	return (
		<div
			{...clickableProps(onClick)}
			className={`flex items-center gap-2 px-2 py-2 ${unread ? "font-bold" : ""} ${blocking ? "border-l-2 border-error" : ""}`}
		>
			<img src={avatarUrl} alt="avatar" className="h-8 w-8 rounded-full" />
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-sm truncate" aria-label={`Thread: ${title}`}>
						{title}
					</span>
					{status && <StatusChip status={status} />}
					{tag && <Tag label={tag} />}
					{kind && <Tag label={kind} />}
				</div>
				<p className="text-xs text-base-content/60 truncate">{snippet}</p>
			</div>
			<span className="text-xs text-base-content/50 whitespace-nowrap">{timestamp}</span>
			{actions}
		</div>
	);
}
