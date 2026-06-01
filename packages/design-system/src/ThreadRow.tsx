import type { HostKind } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
import { clickableProps } from "./clickable";
import { dsProps } from "./ds-attrs";
import { type Status, StatusChip } from "./StatusChip";
import { Tag } from "./Tag";
import type { TagKind } from "./tag-kinds";

export interface ThreadRowProps {
	/**
	 * M3 E1: avatarUrl is now nullable.
	 * - string URL → render <img>
	 * - null → render initials chip (first two uppercase chars of title)
	 */
	avatarUrl: string | null;
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
		? "border-l-[var(--bw-strong)] border-[var(--accent-primary)]"
		: blocking
			? "border-l-[var(--bw-strong)] border-[var(--status-error)]"
			: "";

	const baseClassName = [
		"flex items-center gap-[12px] px-[24px] py-[12px] text-[15px] rounded-[var(--r-subtle)]",
		"hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))] transition-colors duration-[var(--motion-fast)]",
		"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)] focus-visible:-outline-offset-1",
		onClick ? "cursor-pointer" : "",
		unread ? "font-bold" : "",
		// selected state: elevated bg + subtle shadow per design spec advisory finding #4
		selected ? "bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]" : "",
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
			{unread && (
				// Unread dot: 6px green circle before title area per Hearth design
				<span
					data-testid="unread-dot"
					aria-hidden="true"
					className="w-[6px] h-[6px] rounded-full bg-[var(--status-success)] shrink-0"
				/>
			)}
			{avatarUrl !== null ? (
				<img src={avatarUrl} alt="" className="h-[36px] w-[36px] rounded-full" />
			) : (
				// M3 E2: initials chip — first two uppercase chars of the title.
				// Falls back to a neutral chip when title is empty or undefined.
				<span
					aria-hidden="true"
					className="flex h-[36px] w-[36px] items-center justify-center rounded-full bg-[var(--surface-elevated)] text-[var(--text-secondary)] text-[11px] font-mono font-bold uppercase shrink-0"
				>
					{title.slice(0, 2).toUpperCase() || "??"}
				</span>
			)}
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-[12px]">
					{pinned && (
						<svg
							aria-label="Pinned"
							role="img"
							viewBox="0 0 12 12"
							width={12}
							height={12}
							fill="currentColor"
							className="text-[var(--text-secondary)] shrink-0"
						>
							<path d="M6 1l1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5L1 4.5l3.5-.5L6 1z" />
						</svg>
					)}
					<span className="text-[15px] truncate" aria-label={`Thread: ${title}`}>
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
							className="inline-flex items-center px-[6px] py-[3px] rounded-[var(--r-pill)] font-mono text-[10px] leading-[1.4] bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] text-[var(--text-secondary)] whitespace-nowrap"
						>
							{hostTag}
						</span>
					)}
					{status && <StatusChip status={status} />}
					{tag && <Tag label={tag} />}
					{kind && <Tag label={kind} kind={kind as TagKind} />}
				</div>
				<p className="text-[12px] text-[var(--text-secondary)] truncate">{snippet}</p>
			</div>
			<span className="text-[12px] text-[var(--text-tertiary)] whitespace-nowrap">{timestamp}</span>
			{actions}
		</div>
	);
}
