import type { HostKind } from "@hyperidle/shared";
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
	/**
	 * L8 §3.4: highlights the row as the lifted-selection target. Adds
	 * aria-current="true" and a primary border-left that overrides the
	 * blocking danger border per design §4.
	 */
	selected?: boolean;
	/**
	 * L8 §3.4: renders a 12×12 SVG pin glyph before the title.
	 * `aria-label="Pinned"` on the SVG.
	 */
	pinned?: boolean;
	/**
	 * L8 §3.4: small mono pill at the right of the title. Closed enum —
	 * matches `HOST_KINDS`. Typed as `HostKind` so a malformed wire row
	 * cannot reach the renderer (Architecture M3).
	 */
	hostTag?: HostKind;
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
	selected = false,
	pinned = false,
	hostTag,
}: ThreadRowProps): JSX.Element {
	// Selected border wins over blocking border when both flags are true.
	const borderClass = selected
		? "border-l-2 border-[var(--primary)]"
		: blocking
			? "border-l-2 border-[var(--danger)]"
			: "";

	const baseClassName = [
		"flex items-center gap-[var(--density-gap)] px-[var(--density-pad-x)] py-[var(--density-pad-y)] text-[length:var(--density-text)] rounded-[var(--r1)]",
		"hover:bg-[var(--surface-4)] transition-colors duration-[var(--motion-fast)]",
		"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] focus-visible:-outline-offset-1",
		onClick ? "cursor-pointer" : "",
		unread ? "font-bold" : "",
		selected ? "bg-[var(--surface-4)]" : "",
		borderClass,
	]
		.filter(Boolean)
		.join(" ");

	return (
		<div
			{...dsProps("ThreadRow", "2")}
			{...clickableProps(onClick)}
			aria-current={selected ? "true" : undefined}
			className={baseClassName}
		>
			<img
				src={avatarUrl}
				alt=""
				className="h-[var(--density-avatar-size)] w-[var(--density-avatar-size)] rounded-full"
			/>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-[var(--density-gap)]">
					{pinned && (
						<svg
							aria-label="Pinned"
							role="img"
							viewBox="0 0 12 12"
							width={12}
							height={12}
							fill="currentColor"
							className="text-[var(--text-mid)] shrink-0"
						>
							<path d="M6 1l1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5L1 4.5l3.5-.5L6 1z" />
						</svg>
					)}
					<span
						className="text-[length:var(--density-text)] truncate"
						aria-label={`Thread: ${title}`}
					>
						{title}
					</span>
					{hostTag && (
						// @lore L8 review (Design B3): host pill is rendered inline
						// rather than via <Tag/> because the approved design (§5.6)
						// specifies mono 10px @ 1px-6px padding @ --r-pill radius.
						// The Tag primitive is sans-12px @ --r2 — wrong scale for
						// this slot. Promote to a shared `HostPill` primitive when a
						// second consumer surfaces.
						<span
							data-testid="thread-row-host-pill"
							// eslint-disable-next-line design/no-off-scale-font-size -- L8 §5.6 mandates 10px mono for the host pill; documented waiver in packages/eslint-plugin-design/waivers.md.
							className="inline-flex items-center px-[6px] py-[1px] rounded-[var(--r-pill)] font-mono text-[10px] leading-[1.4] bg-[var(--surface-ghost)] text-[var(--text-mid)] whitespace-nowrap"
						>
							{hostTag}
						</span>
					)}
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
