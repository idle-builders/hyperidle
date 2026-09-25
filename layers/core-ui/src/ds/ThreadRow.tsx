// hearth-internal-padding
import type { AgentOperationalStatus, HostKind } from "@hyperidle/domain-model";
import type { JSX, ReactNode } from "react";
import { clickableProps } from "./clickable";
import { dsProps } from "./ds-attrs";
import { type Status, StatusChip } from "./StatusChip";
import { Tag } from "./Tag";
import type { TagKind } from "./tag-kinds";

/**
 * AE5: PresenceDot for ThreadRow — same visual treatment as ThreadHostBanner.
 * Extracted to a function to avoid cross-file imports of a 10-line component.
 *
 * @lore AE5 (SUGGESTION from arch-critique): shared with ThreadHostBanner's PresenceDot
 * conceptually but kept inline here. Both are 10 lines — extraction saves nothing without
 * a design-system export. Keep in sync if the dot style changes.
 */
function ThreadRowPresenceDot({
	status,
	initials,
}: {
	status: AgentOperationalStatus;
	initials: string;
}): JSX.Element | null {
	if (status === "idle") return null;
	const bg = status === "active" ? "bg-[var(--accent-primary)]" : "bg-[var(--status-error)]";
	return (
		<span
			className={`absolute bottom-0 right-0 w-[6px] h-[6px] rounded-[var(--r-pill)]  border-[var(--surface-elevated)] ${bg}`}
			aria-label={`${initials} - ${status}`}
		/>
	);
}

export interface ThreadAvatarItem {
	initials: string;
	agent?: boolean;
	/** Operational status for agent avatars. When present, shows presence dot. */
	operationalStatus?: AgentOperationalStatus;
}

export interface ThreadRowProps {
	/**
	 * Kept for backwards compatibility — not rendered visually.
	 * The mockup layout is: dot → info → meta (with small overlapping avatars
	 * on the right). The large left-side avatar was removed in the visual
	 * parity pass (audit L-25).
	 *
	 * @deprecated Pass `avatars` instead for the right-side overlapping group.
	 */
	avatarUrl?: string | null;
	title: string;
	snippet: string;
	timestamp: string;
	status?: Status;
	tag?: string;
	actions?: ReactNode;
	unread?: boolean;
	onClick?: () => void;
	/**
	 * When set, renders the row as an <a href> link so ⌘-click, middle-click,
	 * "copy link" and hover-preview work natively.
	 *
	 * @lore UI-080: conversation queue rows must be real links.
	 */
	href?: string;
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
	/**
	 * Overlapping 24px participant avatar circles in the right-side meta area.
	 * Matches the mockup's `.thread-avatars` group (audit L-21).
	 */
	avatars?: ThreadAvatarItem[];
	/**
	 * Numeric message count badge in the right-side meta area.
	 * Green-tinted when unread, neutral when read (audit L-22).
	 */
	messageCount?: number;
}

export function ThreadRow({
	title,
	snippet,
	timestamp,
	status,
	tag,
	actions,
	unread = false,
	onClick,
	href,
	blocking = false,
	kind,
	selected = false,
	pinned = false,
	hostTag,
	avatars,
	messageCount,
}: ThreadRowProps): JSX.Element {
	// Selected border wins over blocking border when both flags are true.
	const borderLeftClass = selected
		? "border-width-strong-l border-[var(--accent-deep)]"
		: blocking
			? "border-width-strong-l border-[var(--status-error)]"
			: "";

	const baseClassName = [
		"flex items-center gap-[12px] px-[24px] py-[12px]",
		"border-width-thin-b border-[var(--border-subtle)] last:border-none",
		"hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]",
		"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)] focus-visible:-outline-offset-1",
		onClick ? "cursor-pointer" : "",
		// selected state: elevated bg + subtle shadow per design spec
		selected ? "bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]" : "",
		borderLeftClass,
	]
		.filter(Boolean)
		.join(" ");

	const rowContent = (
		<>
			{/* Unread indicator — always rendered; transparent spacer for read rows (audit L-12, L-14) */}
			<span
				data-testid={unread ? "unread-dot" : "read-dot-spacer"}
				aria-hidden="true"
				className={[
					"w-[8px] h-[8px] rounded-[var(--r-pill)] shrink-0",
					unread ? "bg-[var(--accent-primary)]" : "bg-transparent",
				].join(" ")}
			/>

			{/* Info: title + preview */}
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
					<span
						className={`type-copy ${[" truncate", unread ? "" : ""].join(" ")}`}
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
							className="type-data inline-flex items-center px-[6px] py-[3px] rounded-[var(--r-pill)]    bg-[color-mix(in_oklab,var(--text-secondary)_8%,transparent)] text-[var(--text-secondary)] whitespace-nowrap"
						>
							{hostTag}
						</span>
					)}
					{status && <StatusChip status={status} />}
					{tag && <Tag label={tag} />}
					{kind && <Tag label={kind} kind={kind as TagKind} />}
				</div>
				{/* Preview/snippet — color differentiates read/unread (audit L-18, L-19) */}
				<p
					className={`type-small ${[
						" truncate mt-[3px]",
						unread ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]",
					].join(" ")}`}
				>
					{snippet}
				</p>
			</div>

			{/* Meta: blocking badge, avatars, count, timestamp */}
			<div className="flex items-center gap-[9px] shrink-0">
				{/* Blocking badge in the right-side meta (audit L-23, L-24) */}
				{blocking && (
					<span
						data-testid="thread-row-blocking-badge"
						className="type-metadata inline-flex items-center px-[9px] py-[3px] rounded-[var(--r-pill)]   bg-[color-mix(in_oklab,var(--status-error)_8%,transparent)] text-[var(--status-error)] whitespace-nowrap shrink-0"
					>
						Blocking
					</span>
				)}

				{/* Overlapping participant avatar group (audit L-21) */}
				{avatars && avatars.length > 0 && (
					<div className="flex">
						{avatars.map((a, i) => (
							<span
								key={`${a.initials}-${i}`}
								className={`type-avatar-initial type-avatar-initial--stacked ${[
									"relative w-[24px] h-[24px] rounded-[var(--r-pill)] inline-flex items-center justify-center shrink-0",
									"  ",
									" border-[var(--surface-elevated)]",
									i > 0 ? "ml-[-6px]" : "",
									a.agent
										? "bg-[var(--accent-primary-dim)] border-[var(--accent-deep)] text-[var(--accent-deep)]"
										: "bg-[var(--surface-page)] border-[var(--border-default)] text-[var(--text-secondary)]",
								].join(" ")}`}
							>
								{a.initials}
								{a.agent && a.operationalStatus ? (
									<ThreadRowPresenceDot status={a.operationalStatus} initials={a.initials} />
								) : null}
							</span>
						))}
					</div>
				)}

				{/* Message count badge (audit L-22) */}
				{messageCount !== undefined && (
					<span
						data-testid="thread-row-count-badge"
						className={`type-metadata ${[
							"inline-flex items-center justify-center",
							"  px-[6px] py-[3px] rounded-[var(--r-pill)]",
							"min-w-[20px] text-center whitespace-nowrap",
							unread
								? "bg-[var(--accent-primary-dim)] text-[var(--accent-deep)]"
								: "bg-[var(--surface-container)] text-[var(--text-secondary)]",
						].join(" ")}`}
					>
						{messageCount}
					</span>
				)}

				<span
					data-testid="thread-time"
					className="type-metadata  text-[var(--text-tertiary)] whitespace-nowrap"
				>
					{timestamp}
				</span>
			</div>
			{actions}
		</>
	);

	// UI-080: href → real anchor link so ⌘-click / middle-click work natively.
	if (href) {
		return (
			<a
				{...dsProps("ThreadRow", "2")}
				href={href}
				aria-current={selected ? "true" : undefined}
				className={baseClassName}
			>
				{rowContent}
			</a>
		);
	}

	return (
		<div
			{...dsProps("ThreadRow", "2")}
			{...clickableProps(onClick)}
			aria-current={selected ? "true" : undefined}
			className={baseClassName}
		>
			{rowContent}
		</div>
	);
}
