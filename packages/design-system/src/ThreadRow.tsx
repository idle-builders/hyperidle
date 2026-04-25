import type { JSX, ReactNode } from "react";
import { clickableProps } from "./clickable";
import { dsProps } from "./ds-attrs";
import { type Status, StatusChip } from "./StatusChip";
import { Tag } from "./Tag";
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
	const baseClassName = [
		"flex items-center gap-[var(--density-gap)] px-[var(--density-pad-x)] py-[var(--density-pad-y)] text-[length:var(--density-text)] rounded-[var(--r1)]",
		"hover:bg-[var(--surface-4)] transition-colors duration-[var(--motion-fast)]",
		"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:-outline-offset-1",
		onClick ? "cursor-pointer" : "",
		unread ? "font-bold" : "",
		blocking ? "border-l-2 border-[var(--danger)]" : "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<div {...dsProps("ThreadRow", "2")} {...clickableProps(onClick)} className={baseClassName}>
			{/*
			 * @lore K11: avatar consumes --density-avatar-size (24/32/40 across
			 * compact/default/comfortable). Per density-audit.md § 3.2.1 +
			 * § 4.4 — ThreadRow is the flagship row-anchor avatar; without
			 * scaling, ThreadRow looks identical at compact vs comfortable.
			 */}
			<img
				src={avatarUrl}
				alt=""
				className="h-[var(--density-avatar-size)] w-[var(--density-avatar-size)] rounded-full"
			/>
			<div className="flex-1 min-w-0">
				{/*
				 * @lore K11: inner-header gap consumes --density-gap so chip
				 * spacing widens with the row. Title font consumes
				 * --density-text per density-audit.md § 3.2.1 (body text ✓).
				 */}
				<div className="flex items-center gap-[var(--density-gap)]">
					<span
						className="text-[length:var(--density-text)] truncate"
						aria-label={`Thread: ${title}`}
					>
						{title}
					</span>
					{status && <StatusChip status={status} />}
					{tag && <Tag label={tag} />}
					{kind && <Tag label={kind} kind={kind as TagKind} />}
				</div>
				<p className="text-[12px] text-[var(--text-mid)] truncate">{snippet}</p>
			</div>
			<span className="text-[12px] text-[var(--text-lo)] whitespace-nowrap">{timestamp}</span>
			{actions}
		</div>
	);
}
