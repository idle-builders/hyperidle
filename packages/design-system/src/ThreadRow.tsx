import type { JSX, ReactNode } from "react";
import { type Status, StatusChip } from "./StatusChip";
import { Tag } from "./Tag";
import { clickableProps } from "./clickable";
import type { TagKind } from "./tag-kinds";

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
			{...clickableProps(
				onClick,
				`flex items-center gap-2 px-2 py-[var(--density-pad-y)] text-[length:var(--density-text)] ${unread ? "font-bold" : ""} ${blocking ? "border-l-2 border-error" : ""}`,
			)}
		>
			<img src={avatarUrl} alt="" className="h-8 w-8 rounded-full" />
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-sm truncate" aria-label={`Thread: ${title}`}>
						{title}
					</span>
					{status && <StatusChip status={status} />}
					{tag && <Tag label={tag} />}
					{kind && <Tag label={kind} kind={kind as TagKind} />}
				</div>
				<p className="text-xs text-[var(--text-mid)] truncate">{snippet}</p>
			</div>
			<span className="text-xs text-[var(--text-lo)] whitespace-nowrap">{timestamp}</span>
			{actions}
		</div>
	);
}
